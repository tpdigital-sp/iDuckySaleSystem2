import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { applyTPArrived } from "@/lib/server/tp-order-arrived";

/**
 * 📦 POST /api/tp/order-arrived  { tpOrderId }
 *
 * หน้า order-request.html ของ TP-Leader ยิงมาทันทีที่เห็นคำขอจากร้านเป็น "ของเข้าแล้ว"
 * (ทางด่วน — ทางหลักคือ cron /api/cron/tp-order-sync ทุก 5 นาที ซึ่งเก็บทุกทางที่ TP เปลี่ยนสถานะ)
 *
 * ⚠️ หน้า TP เป็นไฟล์ static ใส่รหัสลับไม่ได้ — ไม่เชื่ออะไรจากคนเรียกนอกจากเลขคำขอ
 *    (แบบเดียวกับ /api/line/goods-receipt-alert): อ่านคำขอจาก Firestore เอง · ต้องเป็นคำขอจากร้าน + "ของเข้าแล้ว" จริง
 *    + ตรงกับการติ๊กปัจจุบันของออเดอร์ · ทำครั้งเดียว — คนนอกยิงมาได้มากสุด = ทำสิ่งที่ cron จะทำอยู่แล้ว
 */

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { tpOrderId?: unknown } | null;
  const tpOrderId = typeof body?.tpOrderId === "string" ? body.tpOrderId.trim() : "";
  if (!/^shop-[A-Za-z0-9_-]{3,100}$/.test(tpOrderId)) return json({ ok: false, reason: "bad-id" }, 400);
  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: false, reason: "no-supabase" }, 503);
  const r = await applyTPArrived(sb, tpOrderId);
  return json({ ok: r.result !== "error", ...r }, r.result === "error" ? 500 : 200);
}
