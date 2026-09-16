import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Product } from "@/lib/products";

export const runtime = "nodejs";

/**
 * ติ๊ก/ยกเลิก "ตรวจแล้ว" ของสินค้า 1 ตัว — แตะเฉพาะ data.reviewed (+savedAt) ไม่แตะฟิลด์อื่น
 *
 * เดิมปุ่ม "ตรวจแล้ว?" ในหน้ารายการส่งสินค้าทั้งก้อนไปที่ POST /api/admin/products
 * ซึ่งต้องมีสิทธิ์ products.manage — ทีมงานที่มีแค่สิทธิ์ดูสินค้า (กราฟฟิก/แพ็คของ) กดแล้วโดน 403
 * และหน้าจอเด้งกลับเงียบ ๆ (16 ก.ย. 69) · ฟีเจอร์นี้ตั้งใจให้ "ทีมงานหลายคนช่วยกันเช็ค"
 * จึงให้ใครก็ตามที่เห็นหน้าสินค้าหลังบ้าน (products.view) ติ๊กได้ · ชื่อผู้ตรวจเอาจาก session ฝั่งเซิร์ฟเวอร์
 *
 * savedAt ขยับด้วย เพื่อให้แท็บแก้ไขที่เปิดค้างไว้ก่อนหน้าโดนด่าน 409 (ไม่บันทึกทับเครื่องหมายนี้กลับเป็นค่าเก่า)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm(["products.view", "products.manage"]);
  if (gate.res) return gate.res;

  let body: { id?: string; reviewed?: boolean };
  try {
    body = (await req.json()) as { id?: string; reviewed?: boolean };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id || id.startsWith("__") || typeof body.reviewed !== "boolean") {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const { data: cur, error: readErr } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!cur?.data) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });

  const { reviewed: _old, ...rest } = cur.data as Product;
  void _old;
  const savedAt = new Date().toISOString();
  const reviewed = body.reviewed
    ? { by: gate.actor.name || gate.actor.username || "ทีมงาน", at: savedAt }
    : undefined;
  const next: Product = { ...(rest as Product), ...(reviewed ? { reviewed } : {}), savedAt };

  const { error } = await sb.from("products").update({ data: next }).eq("id", id);
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true, reviewed: reviewed ?? null, savedAt });
}
