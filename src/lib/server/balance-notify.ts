import type { SupabaseClient } from "@supabase/supabase-js";
import { orderBalance, orderTotal, withLog, type Order } from "@/lib/admin-data";
import { notifyCustomerLogged, orderLink } from "@/lib/server/notify";
import { updateOrder } from "@/lib/server/order-write";

/**
 * 💳📣 ยิงไลน์ "ยอดที่ต้องโอนเพิ่ม" ของคิวที่ค้างอยู่ (order.balancePending) แล้วปิดคิว + จำยอดที่แจ้ง
 * ใช้ทั้งปุ่ม 📣 ในหน้าออเดอร์ (by = ชื่อพนักงาน) และ cron (by = "ระบบ") — ดู src/lib/balance-notify.ts
 *
 * ปิดคิวแม้ส่งไม่ถึง (ลูกค้าไม่ผูก LINE/บล็อก) จะได้ไม่ยิงซ้ำทุก 10 นาที · ผลอยู่ในประวัติออเดอร์
 * ยอด/ข้อความคิดสดจากออเดอร์ที่ส่งเข้ามา ไม่เชื่อตัวเลขจากหน้าจอ
 */
export async function sendBalanceNotify(
  sb: SupabaseClient,
  order: Order,
  origin: string,
  by: string,
  opts?: { auto?: boolean }
): Promise<{ sent: boolean; skipped?: boolean; balance?: number; reason?: string; order: Order }> {
  const pend = order.balancePending;
  if (!pend) return { sent: false, skipped: true, reason: "ไม่มียอดรอแจ้ง", order };

  const thb = (n: number) => n.toLocaleString("th-TH");
  const total = orderTotal(order);
  const bal = orderBalance(order);
  const paid = order.paidTotal ?? 0;
  const told = order.balanceNotified?.balance;
  const link = orderLink(origin, order);
  const why = pend.why?.trim() || `ยอดรวมเปลี่ยนเป็น ${thb(total)} บาท`;
  // เคยบอกยอดไปแล้วและตัวเลขเปลี่ยน → ต่อท้ายว่าแทนยอดไหน (ลูกค้าถือยอดเก่าจากไลน์อยู่)
  const instead = told != null && Math.abs(told - bal) > 0.5 ? ` (แทนยอด ${thb(told)} บาทที่แจ้งไว้ก่อนหน้า)` : "";
  const head = `💰 ยอดรวมทั้งบิล ${thb(total)} บาท · รับแล้ว ${thb(paid)} บาท`;

  // ยอดกลับมาไม่ค้างแล้วทั้งที่ไม่เคยบอกยอดไป = ไม่มีอะไรต้องแจ้ง (ปิดคิวเงียบ ๆ)
  if (bal <= 0.5 && told == null) {
    const cleared = withLog({ ...order, balancePending: undefined }, by, "ปิดคิวแจ้งยอดโอนเพิ่ม", "ยอดกลับมาไม่ค้างก่อนแจ้งลูกค้า — ไม่ได้ส่งไลน์");
    await updateOrder(sb, cleared);
    return { sent: false, skipped: true, balance: 0, reason: "ไม่มียอดค้างต้องแจ้ง", order: cleared };
  }

  const msg =
    bal > 0.5
      ? `🧾 ออเดอร์ ${order.id} ${bal > pend.from ? "มียอดเพิ่ม" : "ปรับยอดใหม่"}: ${why}\n${head}\n💳 ยอดที่ต้องโอนเพิ่ม ${thb(bal)} บาท${instead}\nโอนแล้วแนบสลิปที่ลิงก์นี้ได้เลยครับ\n${link}`
      : `🧾 ออเดอร์ ${order.id} ปรับยอดใหม่: ${why}\n${head}\n✅ ไม่ต้องโอนเพิ่มแล้วครับ${told != null ? ` (ยกเลิกยอด ${thb(told)} บาทที่แจ้งไว้ก่อนหน้า)` : ""}\n${link}`;

  const what =
    (bal > 0.5 ? `แจ้งยอดค้าง ${thb(bal)} บาท` : "แจ้งว่าไม่ต้องโอนเพิ่มแล้ว") +
    (told != null ? ` (เดิมแจ้ง ${thb(told)})` : "") +
    (opts?.auto ? " · อัตโนมัติ (ค้างในคิวเกินกำหนด)" : "");
  const r = await notifyCustomerLogged(sb, order, msg, what, "key");

  // อ่านสดก่อนเขียน — notifyCustomerLogged เพิ่งต่อท้ายประวัติผลการส่ง อย่าทับของเขา
  const { data: row } = await sb.from("orders").select("data").eq("id", order.id).maybeSingle();
  const fresh = (row?.data as Order | undefined) ?? order;
  const next: Order = {
    ...fresh,
    balanceNotified: { at: new Date().toISOString(), balance: bal },
    balancePending: undefined,
    savedAt: new Date().toISOString(),
  };
  await updateOrder(sb, next);
  return { sent: r.ok, balance: bal, reason: r.ok ? undefined : r.reason, order: next };
}
