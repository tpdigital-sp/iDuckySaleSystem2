import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * คลังสินค้าพิเศษ (งานสั่งทำที่ไม่มีหน้าเว็บ) — ไว้ autocomplete ตอนกดเพิ่มรายการพิเศษ
 * เก็บเป็นแถวพิเศษในตาราง products (id ขึ้นต้น __ จึงไม่โผล่หน้าร้าน)
 */
const ROW_ID = "__special_products__";

export interface SpecialProduct {
  name: string;
  detail: string;
}

/** รายการทั้งหมด (ใช้ในหลังบ้านเท่านั้น) */
export async function GET() {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ list: [] });
  const { data } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
  const list = ((data?.data as { list?: SpecialProduct[] } | undefined)?.list ?? []).filter((p) => p?.name);
  return NextResponse.json({ list });
}

/** บันทึกทับทั้งคลัง (ใช้ตอนนำเข้า/แก้ไข) */
export async function PUT(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { list?: { name?: string; detail?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const list = (Array.isArray(body.list) ? body.list : [])
    .map((p) => ({ name: String(p.name ?? "").trim().slice(0, 200), detail: String(p.detail ?? "").trim().slice(0, 2000) }))
    .filter((p) => p.name)
    .slice(0, 1000);

  const { error } = await sb
    .from("products")
    .upsert(
      { id: ROW_ID, name: "(คลังสินค้าพิเศษ — งานสั่งทำ)", category: "__settings__", price: 0, data: { list } },
      { onConflict: "id" }
    );
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, count: list.length });
}
