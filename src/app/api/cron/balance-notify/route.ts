import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderBalance, type Order } from "@/lib/admin-data";
import { sendBalanceNotify } from "@/lib/server/balance-notify";
import { BALANCE_AUTO_NOTIFY_MINUTES, balanceNotifyOverdue } from "@/lib/balance-notify";
import { SITE_URL } from "@/lib/shop-info";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 💳📣 กันลืมกดปุ่ม "แจ้งยอดที่ต้องโอนเพิ่ม" — รันทุก 10 นาทีจาก netlify/functions/balance-notify.mjs
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
  return NextResponse.json({ ok: true, dry, minutes: BALANCE_AUTO_NOTIFY_MINUTES, waiting: data?.length ?? 0, due: results });
}
