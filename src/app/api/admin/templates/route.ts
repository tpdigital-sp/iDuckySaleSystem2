import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { DesignTemplate } from "@/lib/design-templates";

export const runtime = "nodejs";

const BUCKET = "design-templates";

/** บันทึก/อัปเดตเทมเพลตไฟล์งาน (เฉพาะคนที่มีสิทธิ์จัดการสินค้า) */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  let t: DesignTemplate;
  try {
    t = (await req.json()) as DesignTemplate;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!t?.id || !t.name?.trim()) return NextResponse.json({ error: "ต้องมีชื่อเทมเพลต" }, { status: 400 });

  const row: DesignTemplate = { ...t, name: t.name.trim(), savedAt: new Date().toISOString() };
  // เก็บเป็นแถวพิเศษในตาราง products (แพตเทิร์นเดียวกับคลังตัวเลือก __presets__)
  const { error } = await sb.from("products").upsert(
    {
      id: `__template_${row.id}`,
      name: `(เทมเพลต) ${row.name}`.slice(0, 120),
      category: "__templates__",
      price: 0,
      data: row,
    },
    { onConflict: "id" }
  );
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true, savedAt: row.savedAt });
}

/** ลบเทมเพลต + เก็บกวาดไฟล์ใน storage ไปด้วย (ไม่งั้นพื้นที่บวมโดยไม่มีใครใช้) */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });

  // อ่านก่อนลบ เพื่อรู้ว่าต้องลบไฟล์ไหนใน storage
  const { data: rows } = await sb.from("products").select("data").eq("id", `__template_${id}`).limit(1);
  const t = rows?.[0]?.data as DesignTemplate | undefined;
  // ไฟล์ทุกไฟล์ในชุด + รูปตัวอย่าง (รวมฟิลด์รุ่นเก่าที่ชุดเดิมเก็บไฟล์ไว้ระดับชุด)
  const urls = [...(t?.files ?? []).map((f) => f.fileUrl), t?.fileUrl, t?.previewUrl];
  const paths = urls
    .map((u) => (u ? u.split(`/${BUCKET}/`)[1] : undefined))
    .filter(Boolean) as string[];
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);

  const { error } = await sb.from("products").delete().eq("id", `__template_${id}`).eq("category", "__templates__");
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
