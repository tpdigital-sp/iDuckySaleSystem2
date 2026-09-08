import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * 🔔 ตัวนับป้ายเตือนข้างเมนู "ใบเสนอราคา" — ใบที่ลูกค้ากดตกลงจากลิงก์เองแล้ว แต่ยังไม่มีใครเปิดงาน
 *
 * ทำไมต้องมี endpoint แยก แทนที่จะให้เมนูดึง /api/admin/quotes ทั้งชุด:
 * แถบเมนูอยู่ทุกหน้าของหลังบ้าน ถ้าดึงใบเสนอราคาทั้งก้อน (พร้อมรายการสินค้า/ประวัติ) ทุกครั้งที่เปลี่ยนหน้า
 * จะเสียแบนด์วิดท์ไปกับข้อมูลที่ไม่ได้ใช้เลย — ที่นี่ให้ Postgres ตัดเหลือ 2 ฟิลด์ตั้งแต่ต้นทาง
 *
 * ใบเก่าที่ทำก่อนมีสถานะ "สร้างออเดอร์แล้ว" จะเป็น "ลูกค้าตกลง" + มี orderId — เงื่อนไข !orderId จึงกันของเก่าไว้ให้ด้วย
 */
export async function GET() {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ n: 0 });

  const { data, error } = await sb.from("quotes").select("id,status:data->>status,orderId:data->>orderId");
  // ยังไม่ได้รันไฟล์ supabase/quotes.sql (หรือดึงไม่ได้) → ป้ายเตือนเงียบไว้ ไม่ต้องทำหน้าอื่นพัง
  if (error) return NextResponse.json({ n: 0 });

  const rows = (data ?? []) as unknown as { id: string; status: string | null; orderId: string | null }[];
  const waiting = rows.filter((r) => r.status === "ลูกค้าตกลง" && !r.orderId);
  return NextResponse.json({ n: waiting.length, ids: waiting.map((r) => r.id) });
}
