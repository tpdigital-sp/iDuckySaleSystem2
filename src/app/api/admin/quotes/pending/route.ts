import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { quoteAwaitingAdmin, type Quote } from "@/lib/quotes";

export const runtime = "nodejs";

/**
 * จำนวนใบเสนอราคาที่ "ลูกค้ากดตกลงจากลิงก์แล้ว" แต่ร้านยังไม่ได้แปลงเป็นออเดอร์
 * ใช้โชว์ป้ายแดงที่เมนู "ใบเสนอราคา" — เบา ๆ ดึงเฉพาะสถานะ/เลขออเดอร์ ไม่ลากรายการสินค้าทั้งใบ
 * (แถบเมนูเรียกบ่อย ถ้าใช้ /api/admin/quotes ที่ส่งทุกใบเต็ม ๆ จะหน่วงโดยไม่จำเป็น)
 */
export async function GET() {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ count: 0, ids: [] });

  // กรองสถานะที่ฝั่งฐานข้อมูลก่อน (jsonb ->> status) แล้วค่อยตัดใบที่มี orderId แล้วออกในโค้ด
  const { data, error } = await sb
    .from("quotes")
    .select("id,status:data->>status,orderId:data->>orderId")
    .eq("data->>status", "ลูกค้าตกลง")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ count: 0, ids: [] });

  const rows = (data ?? []) as unknown as { id: string; status: Quote["status"]; orderId: string | null }[];
  const ids = rows.filter((r) => quoteAwaitingAdmin({ status: r.status, orderId: r.orderId ?? undefined })).map((r) => r.id);
  return NextResponse.json({ count: ids.length, ids });
}
