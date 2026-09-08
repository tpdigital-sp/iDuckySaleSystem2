import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { awaitingOrder, type Quote } from "@/lib/quotes";

export const runtime = "nodejs";

/** ใบที่ลูกค้ากดตกลงแล้วแต่ยังไม่มีเลขออเดอร์ = งานค้างของแอดมิน (ตรงกับ awaitingOrder ฝั่งหน้าเว็บ) */
const isWaiting = (status: string | null, orderId: string | null) => status === "ลูกค้าตกลง" && !orderId;

/**
 * 🔔 ตัวนับป้ายเตือนข้างเมนู "ใบเสนอราคา" — ใบที่ลูกค้ากดตกลงจากลิงก์เองแล้ว แต่ยังไม่มีใครเปิดงาน
 *
 * ทำไมต้องมี endpoint แยก แทนที่จะให้เมนูดึง /api/admin/quotes ทั้งชุด:
 * แถบเมนูอยู่ทุกหน้าของหลังบ้าน ถ้าดึงใบเสนอราคาทั้งก้อน (พร้อมรายการสินค้า/ประวัติ) ทุกครั้งที่เปลี่ยนหน้า
 * จะเสียแบนด์วิดท์ไปกับข้อมูลที่ไม่ได้ใช้เลย — ที่นี่ให้ Postgres ตัดเหลือ 2 ฟิลด์ตั้งแต่ต้นทาง
 *
 * ใบเก่าที่ทำก่อนมีสถานะ "สร้างออเดอร์แล้ว" จะเป็น "ลูกค้าตกลง" + มี orderId — เงื่อนไข !orderId จึงกันของเก่าไว้ให้ด้วย
 *
 * ตอบ n เป็น 0 ได้ 2 แบบ และต้องแยกออกจากกันให้ได้ ไม่งั้นป้ายเงียบแล้วไล่หาสาเหตุไม่เจอ:
 *   ok        = ถามฐานสำเร็จ แล้วไม่มีใบค้างจริง ๆ
 *   reason    = ถามไม่สำเร็จ (ยังไม่ได้สร้างตาราง / ยังไม่ได้ตั้งค่า Supabase / ฐานตอบ error)
 */
export async function GET() {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ n: 0, ok: false, reason: "ยังไม่ได้ตั้งค่า Supabase" });

  // ทางหลัก: ให้ Postgres ตัดเหลือ 2 ฟิลด์
  const slim = await sb.from("quotes").select("id,status:data->>status,orderId:data->>orderId");
  if (!slim.error) {
    const rows = (slim.data ?? []) as unknown as { id: string; status: string | null; orderId: string | null }[];
    const waiting = rows.filter((r) => isWaiting(r.status, r.orderId));
    return NextResponse.json({ n: waiting.length, ok: true, ids: waiting.map((r) => r.id) });
  }

  // ทางสำรอง: ดึงทั้งก้อนมานับเอง — เปลืองกว่า แต่ดีกว่าป้ายเงียบไปเฉย ๆ เพราะ projection ใช้ไม่ได้
  const full = await sb.from("quotes").select("data");
  if (full.error) {
    console.error("[quotes/pending] ถามฐานไม่สำเร็จ:", slim.error.message, "|", full.error.message);
    return NextResponse.json({ n: 0, ok: false, reason: full.error.message });
  }
  const waiting = (full.data ?? []).map((r) => r.data as Quote).filter(awaitingOrder);
  return NextResponse.json({ n: waiting.length, ok: true, ids: waiting.map((q) => q.id), fallback: true });
}
