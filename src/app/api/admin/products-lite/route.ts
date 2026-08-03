import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/** รายชื่อสินค้าในเว็บแบบย่อ — ให้แอดมินค้นหาแล้วเพิ่มเข้าออเดอร์ได้ (ผูก productId จริง) */
export async function GET() {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ list: [] });

  const { data, error } = await sb.from("products").select("id,name,price,category").order("sort", { ascending: true });
  if (error) return NextResponse.json({ error: error.message, list: [] }, { status: 500 });

  const list = (data ?? [])
    .filter((r) => !String(r.id).startsWith("__")) // ตัดแถวตั้งค่าร้านออก
    .map((r) => ({ id: String(r.id), name: String(r.name ?? ""), price: Number(r.price ?? 0), category: String(r.category ?? "") }))
    .filter((p) => p.name);
  return NextResponse.json({ list });
}
