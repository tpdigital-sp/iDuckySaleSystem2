import { orderItemDiscounts, orderSubtotal, paidSoFar, type Order, type OrderStatus } from "@/lib/admin-data";
import { overpaidAmount, paymentEntries } from "@/lib/payments";
import { tierDiscountAmount } from "@/lib/tiers";
import { memberTierOfContact } from "./quote-member-tier";
import type { getSupabaseAdmin } from "./supabase-admin";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * 🏅 ส่วนลดระดับสมาชิกบน "ออเดอร์ที่ลูกค้าไม่ได้ล็อกอิน"
 *
 * ทำไมต้องมี: ส่วนลดระดับคิดให้เฉพาะตอนลูกค้าล็อกอินสั่งเอง (/api/orders ใช้ customerId) แต่ออเดอร์จริงเกือบทั้งหมด
 * มาจากพนักงานเปิดใบให้ทางไลน์ (customerId ว่าง มีแต่ contactId ที่ผูกคลังผู้ติดต่อ) → ลูกค้าระดับ Bronze/Silver
 * ไม่เห็นส่วนลดของตัวเองสักใบ (OD-260914-1542 ฉัตราวดี เพชรหล่อ — พนักงานแจ้ง 14 ก.ย. 69)
 * → คิดจากผู้ติดต่อที่ผูกไว้ กติกาเดียวกับใบเสนอราคา (ดู quote-member-tier.ts)
 *
 * ส่วนลดนี้เป็นค่า "คิดใหม่ได้" — ติดธง tierId ไว้บอกว่าเซิร์ฟเวอร์เป็นเจ้าของ จึงตามรายการ/ผู้ติดต่อที่เปลี่ยนได้เสมอ
 * ส่วนลดที่ไม่มีธง (คูปอง · ใบที่แปลงมาจากใบเสนอราคา · ใบเก่า) = ตัวเลขที่ตกลงกับลูกค้าไปแล้ว ห้ามแตะ
 */

/** ขั้นที่ยัง "ตั้งราคา/เก็บเงิน" อยู่ — ใบที่เลยไปแล้วห้ามขยับยอด */
const OPEN_FOR_PRICING: OrderStatus[] = ["รอชำระเงิน", "รอตรวจสอบ"];

/** ป้ายส่วนลด — รูปแบบเดียวกับตอนลูกค้าล็อกอินสั่งเอง เพื่อให้ทุกใบอ่านเหมือนกัน */
export const memberTierLabel = (name: string, pct: number) => `สมาชิก ${name} (${pct}%)`;

/**
 * ใบนี้ให้เซิร์ฟเวอร์คิดส่วนลดระดับให้เองได้ไหม
 * ไม่ได้เมื่อ: ตัวแทนจำหน่าย · ลูกค้าล็อกอินสั่งเอง (คิดตอนสร้างแล้ว) · ใบเคลม · ใบที่ยอดต้องตรงบิล FlowAccount
 * · ยกเลิก · มีส่วนลดที่ไม่ใช่ของระบบนี้อยู่
 *
 * ⚠️ ใบที่แจ้งโอน/มีเงินเข้าแล้ว **ไม่ได้ห้ามทั้งหมด** — ดู memberTierMoneyIn + mayApplyOnMoneyIn ด้านล่าง (ของที่สั่งเพิ่มต้องได้ % ด้วย)
 */
export function mayAutoMemberTier(o: Order): boolean {
  if (o.dealer || o.customerId || o.claimOf || o.flowAccount) return false;
  // เฉพาะใบที่ยังอยู่ขั้นเก็บเงิน — เลยไปแล้ว (ผลิต/ส่ง/จบ/ยกเลิก) ยอดบิลปิดแล้ว แม้จะยังไม่มี paidTotal
  if (!OPEN_FOR_PRICING.includes(o.status)) return false;
  if (o.discount && !o.discount.tierId) return false;
  return true;
}

/**
 * ใบนี้ "แจ้งโอน/มีเงินเข้าแล้ว" ไหม — นับสลิปทุกช่อง ไม่ใช่แค่ paidTotal
 * (OD-260914-3734 แนบสลิป 4,000 รอแอดมินตรวจ — slipPath มี แต่ paidTotal ยังว่าง)
 */
export function memberTierMoneyIn(o: Order): boolean {
  return paidSoFar(o) > 0 || !!o.paidReportedAt || paymentEntries(o).length > 0;
}

/** เอาส่วนลดที่ระบบนี้เคยใส่ไว้ออก (ยกเลิกผูกผู้ติดต่อ/ตกระดับ → ส่วนลดต้องหายตาม) */
function withoutOurs(o: Order): Order {
  if (!o.discount?.tierId) return o;
  const { discount: _drop, ...rest } = o;
  void _drop;
  return rest;
}

/**
 * เติม/ล้างส่วนลดระดับสมาชิกให้ตรงกับผู้ติดต่อที่ผูกอยู่ + ยอดสินค้าปัจจุบัน
 * เรียกทุกครั้งที่บันทึกออเดอร์ (แอดมินแก้ / ลูกค้าสั่งเพิ่ม) · อ่านฐานพลาด = คงของเดิม ไม่ทำใบพัง
 */
export async function syncOrderMemberTier(sb: SB, order: Order): Promise<Order> {
  if (!mayAutoMemberTier(order)) return order;
  // ใบที่มีเงินเข้าแล้ว: ยอดที่แจ้งลูกค้าไปปิดไปแล้ว — ล้าง/ลดส่วนลดไม่ได้ ทำได้อย่างเดียวคือ "ลดเพิ่ม" (ดู mayApplyOnMoneyIn)
  const moneyIn = memberTierMoneyIn(order);
  if (!order.contactId) return moneyIn ? order : withoutOurs(order);
  try {
    const tier = await memberTierOfContact(sb, order.contactId);
    if (!tier) return moneyIn ? order : withoutOurs(order);
    // ฐานเดียวกับส่วนลดทั้งบิลของแอดมิน: ยอดสินค้าหลังหักส่วนลดรายรายการ (ไม่รวมค่าส่ง)
    const base = Math.max(0, orderSubtotal(order) - orderItemDiscounts(order));
    const amount = tierDiscountAmount(base, tier.pct);
    if (amount <= 0) return moneyIn ? order : withoutOurs(order);
    const cur = order.discount;
    if (cur?.tierId === tier.id && cur.amount === amount) return order;
    const next = { ...order, discount: { label: memberTierLabel(tier.name, tier.pct), amount, tierId: tier.id } };
    if (moneyIn && !mayApplyOnMoneyIn(order, next)) return order;
    return next;
  } catch {
    return order;
  }
}

/**
 * ใบที่ลูกค้าโอนมาแล้ว แต่ยอดสินค้าโตขึ้น (สั่งเพิ่ม/แอดมินเพิ่มรายการพิเศษ) — ส่วนลดระดับต้องโตตาม
 * ไม่งั้นของที่สั่งเพิ่มไม่ได้ % ของตัวเอง (OD-260915-7543 Silver 5% ค้างที่ −฿276 ของยอดเก่า ทั้งที่ยอดขึ้นเป็น ฿7,980)
 *
 * อนุญาตเฉพาะ 2 ข้อพร้อมกัน — กันไม่ให้กลายเป็น "โอนเกินต้องคืนเงิน" แบบที่ด่านเดิมกันไว้:
 *  1) ส่วนลดใหม่ต้อง **มากกว่า** ของเดิมเท่านั้น (ลบรายการ/ตกระดับ = ไม่แตะ ไม่ไล่เก็บเงินเพิ่มย้อนหลัง)
 *  2) ลดแล้วยอดรวมต้องยัง **ไม่ต่ำกว่าเงินที่รับมาแล้ว** (ลดจนเกินเงินที่โอน = ต้องตามคืน)
 */
function mayApplyOnMoneyIn(cur: Order, next: Order): boolean {
  if ((next.discount?.amount ?? 0) <= (cur.discount?.amount ?? 0)) return false;
  return overpaidAmount(next) <= 0;
}
