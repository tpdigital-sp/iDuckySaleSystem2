import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderBalance, type Order } from "@/lib/admin-data";
import { sendBalanceNotify } from "@/lib/server/balance-notify";
import { BALANCE_AUTO_NOTIFY_MINUTES, balanceNotifyOverdue } from "@/lib/balance-notify";
import { SITE_URL } from "@/lib/shop-info";
import { shopQuota, quotaText } from "@/lib/server/line-quota";
import { backfillHitQuota, backfillMissedNotifies } from "@/lib/server/line-backfill";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 💳📣 กันลืมกดปุ่ม "แจ้งยอดที่ต้องโอนเพิ่ม" — รันทุก 5 นาทีจาก netlify/functions/balance-notify.mjs
 * + 🚫→📨 ส่งการ์ดที่ค้างเพราะโควตา LINE หมดให้เองเมื่อโควตากลับมา (resendQuotaMissed ด้านล่าง)
 * ออเดอร์ที่มียอดรอแจ้ง (balancePending) และเงียบมาเกิน BALANCE_AUTO_NOTIFY_MINUTES นาที → ยิงข้อความให้เองครั้งเดียว
 * ?key= (CRON_SECRET) กันคนนอก · ?dry=1 = ดูรายการเฉย ๆ
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const dry = url.searchParams.get("dry") === "1";

  // เฉพาะใบที่มีคิวค้างอยู่จริง — กรองที่ฐานด้วยดัชนีบางส่วน orders_balance_pending_idx (ดู supabase/orders-io-indexes.sql)
  const { data, error } = await sb.from("orders").select("id,data").not("data->balancePending->>at", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const due = (data ?? []).map((r) => r.data as Order).filter((o) => o.status !== "ยกเลิก" && balanceNotifyOverdue(o, now));
  const results: { id: string; balance: number; sent?: boolean; skipped?: boolean; reason?: string }[] = [];
  for (const o of due) {
    if (dry) {
      results.push({ id: o.id, balance: orderBalance(o) });
      continue;
    }
    const r = await sendBalanceNotify(sb, o, SITE_URL, "ระบบ", { auto: true });
    results.push({ id: o.id, balance: r.balance ?? orderBalance(o), sent: r.sent, skipped: r.skipped, reason: r.reason });
  }
  const quotaBackfill = await resendQuotaMissed(sb, dry);
  return NextResponse.json({ ok: true, dry, minutes: BALANCE_AUTO_NOTIFY_MINUTES, waiting: data?.length ?? 0, due: results, quotaBackfill });
}

/** กันรอบเดียวกินเวลาเกิน maxDuration — ที่เหลือรอบหน้า (5 นาที) ค่อยต่อ */
const QUOTA_BACKFILL_PER_RUN = 20;

/**
 * 🚫→📨 ใบที่การ์ดไลน์หายไปเพราะ "โควตาข้อความ LINE OA หมด" (Order.lineQuotaMissed · 28 ก.ย. 69 บัญชีร้าน 15,000/15,000)
 * โควตากลับมาเมื่อไหร่ (ขึ้นเดือนใหม่ / ร้านซื้อข้อความเพิ่ม) → ส่ง "สถานะล่าสุด" ให้เองแล้วถอนธง
 * ยังหมดอยู่ = ไม่แตะ LINE เลย (ถามโควตาอย่างเดียว ไม่เปลืองข้อความ) · ระหว่างวนเจอ 429 อีก = หยุดรอบนี้
 * กรองที่ฐานด้วยดัชนีบางส่วน orders_line_quota_missed_idx (supabase/orders-io-indexes.sql)
 */
async function resendQuotaMissed(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, dry: boolean) {
  const { data, error } = await sb
    .from("orders")
    .select("id,data")
    .not("data->lineQuotaMissed->>at", "is", null)
    .order("created_at", { ascending: false })
    .limit(QUOTA_BACKFILL_PER_RUN);
  if (error) return { error: error.message };
  const waiting = (data ?? []).map((r) => r.data as Order);
  if (!waiting.length) return { waiting: 0 };
  const q = await shopQuota({ fresh: true });
  const quota = q ? quotaText(q) : "ถามโควตาไม่ได้";
  // เหลือน้อยกว่าจำนวนใบที่จะส่ง = รอให้กลับมาจริง ๆ ก่อน (กันส่งได้ครึ่งเดียวแล้วเจอ 429 ทุก 5 นาที)
  if (!q || (q.left !== null && q.left < Math.min(waiting.length, 5))) return { waiting: waiting.length, quota, skipped: "โควตายังไม่กลับมา" };
  if (dry) return { waiting: waiting.length, quota, dry: waiting.map((o) => ({ id: o.id, what: o.lineQuotaMissed?.what })) };

  const sent: { id: string; resent?: string | null; error?: string | null }[] = [];
  for (const o of waiting) {
    if (o.status === "ยกเลิก") {
      await clearQuotaFlag(sb, o);
      continue;
    }
    const r = await backfillMissedNotifies(sb, o, SITE_URL, "ระบบ", "ส่งย้อนหลังหลังโควตากลับมา");
    sent.push({ id: o.id, resent: r.resent, error: r.resentError });
    if (backfillHitQuota(r)) break; // ยังหมดอยู่ — ที่เหลือรอบหน้า
    // ส่งถึง (notifyCustomerLogged ถอนธงให้แล้ว) หรือไม่มีอะไรค้าง/ล้มด้วยเหตุอื่นที่รอไปก็ไม่หาย (บล็อก/ปิดรับ) → ถอนธง ไม่วนซ้ำทุก 5 นาที
    if (r.latest.lineQuotaMissed) await clearQuotaFlag(sb, r.latest);
  }
  return { waiting: waiting.length, quota, sent };
}

async function clearQuotaFlag(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, o: Order) {
  const next = { ...o };
  delete next.lineQuotaMissed;
  await updateOrder(sb, next);
}
