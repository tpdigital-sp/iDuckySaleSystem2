import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ORDER_STATUSES, type Order } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { applyAutoRush, autoRushReason, RUSH_AUTO_WORKDAYS } from "@/lib/rush-auto";
import { loadShopHolidays } from "@/lib/server/shop-holidays";

export const runtime = "nodejs";
export const maxDuration = 60;

/** ใบที่ยังต้องทำงาน — จบ/ยกเลิกแล้วไม่ต้องกวาด (ถามฐานด้วยรายชื่อนี้ ไม่ต้องขนทั้งตารางมาคัด) */
const OPEN_STATUSES = ORDER_STATUSES.filter((s) => s !== "จัดส่งแล้ว" && s !== "เสร็จสิ้น" && s !== "ยกเลิก");

/**
 * 🔥 กวาดหา "ใบที่กลายเป็นงานเร่งแล้ว" ทุกเช้า — รันจาก netlify/functions/rush-sweep.mjs (08:00 ไทย ก่อนเริ่มงาน)
 *
 * ทำไม (พนักงานแจ้ง 21 ก.ย. 69): ธงงานเร่งคิดใหม่ทุกครั้งที่บันทึกออเดอร์ (ประตู order-write) อยู่แล้ว
 * แต่ใบที่ลูกค้าสั่งล่วงหน้าแล้วไม่มีใครแตะต่อ จะไม่มีจังหวะ "บันทึก" ให้คิดใหม่เลย — วันใช้งานค่อย ๆ
 * ใกล้เข้ามาเงียบ ๆ กว่ากราฟฟิกจะเห็นก็เลยรอบส่งผลิตของวัน · ตัวนี้แค่บันทึกใบที่เข้าเกณฑ์ซ้ำ
 * แล้วปล่อยให้กติกากลางที่ประตูติ๊กธง + ลงประวัติ + ส่งต่อบอร์ด WIP + แจ้งกลุ่มไลน์ร้านให้เอง
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

  // 🗓 วันหยุดร้านจากปฏิทิน TP ก่อน — "เหลือกี่วันทำการ" ต้องนับด้วยปฏิทินจริง
  await loadShopHolidays();

  // ใบที่ยังไม่จบและลูกค้าระบุวันใช้งานไว้เท่านั้น (ไม่มีวันใช้งาน = ไม่มีอะไรให้คิด)
  const { data, error } = await sb
    .from("orders")
    .select("id,data")
    .in("data->>status", OPEN_STATUSES)
    .not("data->>useByDate", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = (data ?? []).map((r) => r.data as Order);
  const turned: { id: string; customer: string; useByDate?: string; reason?: string; error?: string }[] = [];
  for (const o of orders) {
    const r = applyAutoRush(o);
    if (!r.turned) continue; // ธงตรงอยู่แล้ว / คนกดเอง (rushManual) — ไม่ต้องเขียนฐานให้เปลือง
    const row = { id: o.id, customer: o.customer, useByDate: o.useByDate, reason: r.reason ?? autoRushReason(o) ?? "วันใช้งานไม่กระชั้นแล้ว" };
    if (dry) {
      turned.push(row);
      continue;
    }
    // ส่งก้อนเดิมเข้าประตู — กติกางานเร่งอยู่ที่นั่นที่เดียว (ติ๊กธง · ลงประวัติ · sync บอร์ด WIP · แจ้งไลน์ร้าน)
    const w = await updateOrder(sb, o, { prev: o, by: "ระบบ" });
    turned.push({ ...row, ...(w.error ? { error: w.error.message } : {}) });
  }
  return NextResponse.json({ ok: true, dry, workdays: RUSH_AUTO_WORKDAYS, scanned: orders.length, turned });
}
