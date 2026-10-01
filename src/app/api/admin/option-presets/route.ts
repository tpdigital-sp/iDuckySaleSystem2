import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { OptionPreset } from "@/lib/option-presets";
import type { Product } from "@/lib/products";
import { presetRenames, renamePresetChoiceInProduct } from "@/lib/option-rename";
import { snapshotRevision } from "@/lib/server/product-revisions";
import { invalidateProductsSlim } from "@/lib/server/products-slim";

export const runtime = "nodejs";

/** บันทึก/อัปเดตคลังตัวเลือก (เฉพาะแอดมินที่ล็อกอิน) */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("presets.manage");
  if (gate.res) return gate.res;

  let preset: OptionPreset;
  try {
    preset = (await req.json()) as OptionPreset;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!preset?.id || !preset?.label) {
    return NextResponse.json({ error: "ข้อมูลคลังไม่ครบ" }, { status: 400 });
  }

  // 🔗 เปลี่ยนชื่อตัวเลือกในคลัง → ลากสินค้าที่ลิงก์คลังนี้ตาม (showWhen/กฎ/ราคา/สำเนา choices อ้างชื่อตรง ๆ)
  //    เดิมเขียนทับคลังอย่างเดียว → กลุ่ม "สีตะขอ G" ที่แสดงเมื่อ ตะขอ = ชื่อเก่า หายจากหน้าร้านทั้ง 5 สินค้า (1 ต.ค. 69)
  const { data: curRow } = await sb.from("products").select("data").eq("id", `__preset_${preset.id}`).maybeSingle();
  const cur = curRow?.data as OptionPreset | undefined;
  const renames = cur ? presetRenames(cur.choices ?? [], preset.choices ?? []) : [];
  let retargeted = 0;
  if (renames.length) {
    const { data: prods } = await sb.from("products").select("id,data").neq("category", "__presets__");
    for (const r of prods ?? []) {
      const p0 = r.data as Product | null;
      if (!p0?.options?.some((o) => o.presetId === preset.id)) continue;
      let p = p0;
      for (const [a, b] of renames) p = renamePresetChoiceInProduct(p, preset.id, a, b);
      if (p === p0) continue;
      await snapshotRevision(sb, r.id, p0, gate.actor, "save");
      const { error: e2 } = await sb.from("products").update({ data: { ...p, savedAt: new Date().toISOString() } }).eq("id", r.id);
      if (e2) return NextResponse.json({ error: `ลากชื่อใหม่ไปสินค้า ${r.id} ไม่สำเร็จ: ${e2.message}` }, { status: 500 });
      retargeted++;
    }
    invalidateProductsSlim();
  }

  // เก็บเป็นแถวพิเศษในตาราง products (ตาราง option_presets ไม่มีจริงใน Supabase —
  // ใช้แพตเทิร์นเดียวกับตั้งค่าร้าน __shop_payment__ / บทความ __article_*)
  const { error } = await sb.from("products").upsert(
    {
      id: `__preset_${preset.id}`,
      name: `(คลังตัวเลือก) ${preset.label}`.slice(0, 120),
      category: "__presets__",
      price: 0,
      data: preset,
    },
    { onConflict: "id" }
  );
  if (!error) invalidateProductsSlim();
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true, renamed: renames.length, retargeted });
}

/** ลบคลังตัวเลือก (เฉพาะแอดมิน) — /api/admin/option-presets?id=xxx */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("presets.manage");
  if (gate.res) return gate.res;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });
  const { error } = await sb.from("products").delete().eq("id", `__preset_${id}`).eq("category", "__presets__");
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
