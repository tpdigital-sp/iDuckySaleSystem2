import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { orderBalance, withLog, type Order } from "@/lib/admin-data";
import { sendBalanceNotify } from "@/lib/server/balance-notify";
import { signPaymentUrls } from "@/lib/server/slip-sign";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

/**
 * 💳📣 ปุ่ม "แจ้งยอดที่ต้องโอนเพิ่ม" ในหน้าออเดอร์ — ส่งไลน์ครั้งเดียวหลังแอดมินเพิ่ม/แก้รายการครบ
 *   POST { orderId }              → ส่งยอดค้างล่าสุดให้ลูกค้า + ปิดคิว
 *   POST { orderId, cancel: true } → ทิ้งคิวไปเลย ไม่ต้องแจ้ง (ตกลงกับลูกค้าทางแชทเองแล้ว)
 * ยอดคิดสดจากออเดอร์ในฐาน ไม่เชื่อตัวเลขจากหน้าจอ · ไม่กด → /api/cron/balance-notify แจ้งให้เอง
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  if (!can(gate.actor, "orders.money", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เรื่องเงินของออเดอร์" }, { status: 403 });
  const by = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; cancel?: boolean };
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row, error } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (!order.balancePending) return NextResponse.json({ ok: true, skipped: true, order: await signPaymentUrls(sb, order) });

  if (body.cancel) {
    const cleared = withLog(
      { ...order, balancePending: undefined, savedAt: new Date().toISOString() },
      by,
      "ยกเลิกคิวแจ้งยอดโอนเพิ่ม",
      `ไม่ส่งไลน์ — ยอดค้างตอนนี้ ${orderBalance(order).toLocaleString("th-TH")} บาท (แจ้งลูกค้าเองแล้ว)`
    );
    const w = await updateOrder(sb, cleared);
    if (w.error) return NextResponse.json({ error: w.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cancelled: true, order: await signPaymentUrls(sb, w.order) });
  }

  const r = await sendBalanceNotify(sb, order, new URL(req.url).origin, by);
  return NextResponse.json({
    ok: true,
    sent: r.sent,
    skipped: r.skipped,
    balance: r.balance,
    reason: r.reason,
    order: await signPaymentUrls(sb, r.order),
  });
}
