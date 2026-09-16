import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sweepCreditedOrders } from "@/lib/server/slip-apply";
import { SITE_URL } from "@/lib/shop-info";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 🩹 ใบที่ "เงินตรวจแล้วครบยอดบิล แต่สถานะยังค้างรอตรวจสอบ/รอชำระเงิน" → ปิดใบให้เอง (ชำระแล้ว + msVerify/สต๊อก/แต้ม/แจ้งลูกค้า)
 * รันทุก 15 นาทีจาก netlify/functions/settle-credited.mjs
 *
 * ทำไม (OD-260915-1705 · 16 ก.ย. 69): SlipOK ตรวจสดตอนยอดในระบบยังไม่ตรงใบ → นับรับบางส่วน ค้างรอตรวจสอบ
 * พอแอดมิน/สคริปต์แก้ยอดจนครบ ไม่มีทางไหนเปลี่ยนสถานะให้ (สคริปต์เรียกโมดูล server-only ไม่ได้) ต้องรอคนกดยืนยันเงินเข้า
 * ชั้นแรก = เปิดหน้าออเดอร์แล้วปิดให้ทันที (GET /api/admin/orders?id=) · ตัวนี้เป็นตาข่ายชั้นสอง ไม่ต้องรอใครเปิดหน้า
 * เงื่อนไขอยู่ที่ creditedOrderSettleable (slip-apply.ts) ที่เดียว
 *
 * ?key= (CRON_SECRET) · ?dry=1 ดูรายการเฉย ๆ ไม่แตะ
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const dry = url.searchParams.get("dry") === "1";

  try {
    const r = await sweepCreditedOrders(sb, SITE_URL, dry);
    return NextResponse.json({ ok: true, dry, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "กวาดใบไม่สำเร็จ" }, { status: 500 });
  }
}
