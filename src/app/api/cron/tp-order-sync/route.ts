import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sweepTPArrived } from "@/lib/server/tp-order-arrived";
import { sweepMissingMaterials } from "@/lib/server/tp-order-remind";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 📦 → 🛒 กวาดคำขอสั่งของจากร้านที่ TP เปลี่ยนเป็น "ของเข้าแล้ว" → ติ๊กของเข้าให้ออเดอร์ร้าน
 * รันจาก netlify/functions/tp-order-sync.mjs ทุก 5 นาที (ดู lib/server/tp-order-arrived.ts)
 * + ⏰ ใบที่ลูกค้าโอนแล้วแต่ยังไม่ใส่ "ของที่ต้องสั่ง" → เตือนซ้ำทุก 2 ชม. / ครบ 4 ชม. ส่งเข้า TP แทน (tp-order-remind.ts)
 *
 * ?key= (CRON_SECRET) กันคนนอก · ?dry=1 = ดูรายการเฉย ๆ ไม่บันทึก
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const dry = url.searchParams.get("dry") === "1";
  const [results, reminders] = await Promise.all([sweepTPArrived(sb, dry), sweepMissingMaterials(sb, dry)]);
  return NextResponse.json({ ok: true, count: results.length, results, reminders: reminders.filter((r) => r.action !== "wait") });
}
