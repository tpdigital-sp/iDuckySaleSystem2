import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { OptionPreset } from "@/lib/option-presets";

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
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
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
