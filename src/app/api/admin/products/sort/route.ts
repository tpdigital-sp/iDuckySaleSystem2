import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * บันทึกลำดับสินค้าในลิสต์ (คอลัมน์ sort) หลายแถวทีเดียว — จากการลากจัด/กดลูกศรในหน้ารายการหลังบ้าน
 * รับเฉพาะ id+sort ไม่แตะ data ของสินค้า (การจัดลำดับต้องไม่เสี่ยงทับข้อมูลตัวเลือก/ราคา)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  let order: { id: string; sort: number }[];
  try {
    order = ((await req.json()) as { order?: { id: string; sort: number }[] }).order ?? [];
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const valid =
    Array.isArray(order) &&
    order.length > 0 &&
    order.length <= 500 &&
    order.every(
      (o) => o && typeof o.id === "string" && o.id && !o.id.startsWith("__") && Number.isInteger(o.sort)
    );
  if (!valid) return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });

  // เขียนเป็นชุดละ 20 — ย้ายลงช่องที่เลขชนกันยาว ๆ อาจต้องขยับหลายสิบแถว ยิงพร้อมกันหมดเซิร์ฟเวอร์รับไม่ไหว
  const errors: string[] = [];
  for (let i = 0; i < order.length; i += 20) {
    const chunk = order.slice(i, i + 20);
    const results = await Promise.all(
      chunk.map(({ id, sort }) => sb.from("products").update({ sort }).eq("id", id))
    );
    for (const r of results) if (r.error) errors.push(r.error.message);
  }
  return errors.length
    ? NextResponse.json({ error: errors[0] }, { status: 500 })
    : NextResponse.json({ ok: true });
}
