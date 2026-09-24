import { orderOtherDiscounts, orderVatAmount, paidSoFar, withLog, type Order, type OrderStatus } from "@/lib/admin-data";
import { paymentEntries } from "@/lib/payments";
import { earlyPayAmount, earlyPayBase, earlyPayExpiresAt, earlyPayOf, EARLY_PAY_LABEL, type EarlyPayDiscount } from "@/lib/early-pay";
import type { Product } from "@/lib/products";
import type { getSupabaseAdmin } from "./supabase-admin";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * ⚡ ส่วนลดโอนไว — "กฎกลาง" ที่คิดใหม่ทุกครั้งที่ออเดอร์ถูกบันทึก (แบบเดียวกับ syncOrderMemberTier)
 *
 * ทำไมต้องมี (เจ้าของร้านทัก 14 ก.ย. 69 "ส่วนลดในชม. ขึ้นบ้างไม่ขึ้นบ้าง" · OD-260914-4051):
 * เดิมกฎนี้ถูกเขียนไว้ที่ "ทางเข้า" ของออเดอร์ทีละทาง — /api/orders (checkout) กับ /api/orders/append เท่านั้นที่คิดให้
 * ทางอื่นที่สร้าง/แก้รายการได้ (แอดมินกดเพิ่มรายการพิเศษ · ตีราคาทีหลัง · ใบเสนอราคา · FlowAccount) ไม่มีใครคิด
 * → ใบที่เข้าเงื่อนไขทุกอย่างกลับไม่ได้ส่วนลด โดยไม่มีอะไรเตือน (สแกน 10-14 ก.ย. เจอ 5 ใบจาก ItemAdder + 2 ใบจากตีราคาทีหลัง)
 * และทุกครั้งที่มีทางเข้าใหม่ อาการนี้ก็กลับมาอีก (รอบ 10 ก.ย. เพิ่ง patch ทาง append ไปรอบหนึ่งแล้ว)
 *
 * กฎจึงย้ายมาอยู่ที่ "ตัวออเดอร์" แทน: writeOrder() (ดู server/order-write.ts) เรียกตัวนี้ให้ทุกครั้งที่เขียนตาราง orders
 * ทางเข้าใหม่ในอนาคตจึงได้กฎนี้ฟรีโดยไม่ต้องจำ
 *
 * ⚠️ คิดใหม่เฉพาะ "ใบที่ยังไม่มีเงินเข้า/ยังไม่แจ้งโอน" — รับเงินแล้วห้ามขยับส่วนลดย้อนหลัง
 * (OD-260909-5711: กติกาใหม่ไปตัดส่วนลดใบที่ลูกค้าจ่ายครบแล้ว → โชว์ค้าง ฿10 ปลอม)
 */

/** ขั้นที่ยัง "ตั้งราคา/เก็บเงิน" อยู่ — เลยไปแล้ว (ผลิต/ส่ง/จบ/ยกเลิก) ห้ามขยับยอด (ตรงกับ order-member-tier) */
const OPEN_FOR_PRICING: OrderStatus[] = ["รอชำระเงิน", "รอตรวจสอบ"];

/** เหตุผลที่ใบนี้ไม่เข้าเกณฑ์ — ใช้ทั้งตอนคิดจริงและตอนสแกนตรวจ (cron/scripts) จะได้อ่านกติกาจากที่เดียวกัน */
export type EarlyPaySkip =
  | "ไม่มีรายการ"
  | "ตัวแทนจำหน่าย"
  | "ใบเคลม"
  | "บิล FlowAccount"
  | "ใบกำกับภาษี/บิล VAT"
  | "ใบเสนอราคา"
  | "เลยขั้นเก็บเงินแล้ว"
  | "มีเงินเข้า/แจ้งโอนแล้ว"
  | "มีส่วนลดอื่น"
  | "ล็อก/ติ๊กไม่รับแล้ว";

/**
 * 🧾 ใบนี้ "ยอดต้องตรงเอกสารที่ออกให้ลูกค้า" ไหม — บิล FlowAccount · ใบกำกับภาษี/บิล VAT · ใบเสนอราคา
 *
 * เจ้าของร้านสั่ง 24 ก.ย. 69: **มีบิลบริษัทแล้วไม่มีส่วนลดโอนไว** — บิลจริงออกนอกระบบนี้ (FlowAccount)
 * ลูกค้าบริษัทโอนตามใบที่ถืออยู่เสมอ ลดในเว็บ ฿5/฿10 = ยอดสองที่ไม่ตรงกันทันที
 * (OD-260923-5389: แอดมินผูกใบเสนอราคา QT010729 → ระบบคิดส่วนลดให้ถัดมา 1 วินาที ลูกค้าโอนตามเว็บ 3,959.70
 *  แต่บิล 3,969.70 → วันรุ่งขึ้นต้องติ๊ก "ลูกค้าไม่รับส่วนลด" เอง แล้วไลน์เด้งทวงลูกค้าอีก ฿10)
 *
 * แยกออกมาเป็นฟังก์ชันเพราะเป็นเหตุผล "ถาวร" (นโยบาย) ต่างจากเหตุผลชั่วคราวอย่าง "ยังไม่ตีราคา/มีเงินเข้าแล้ว":
 * ใบที่เพิ่งออกบิลทีหลังต้องถูก **เอาส่วนลดออก** ด้วย ไม่ใช่แค่ไม่คิดเพิ่ม (ดู syncOrderEarlyPay)
 */
export function earlyPayBillReason(o: Order): EarlyPaySkip | null {
  if (o.flowAccount) return "บิล FlowAccount";
  if (o.taxInvoice || orderVatAmount(o) > 0) return "ใบกำกับภาษี/บิล VAT";
  if (o.quoteOf) return "ใบเสนอราคา";
  return null;
}

/** ใบนี้เพิ่งกลายเป็น "ใบมีบิล" ในการบันทึกครั้งนี้ไหม — ประตูเขียนออเดอร์ใช้ตัดสินว่าต้องคิดกฎใหม่ แม้รายการไม่เปลี่ยน */
export function earlyPayBillAdded(prev: Order | null | undefined, next: Order): boolean {
  return !!earlyPayBillReason(next) && !(prev && earlyPayBillReason(prev));
}

/** ใบนี้มีเงินเข้า/ลูกค้าแจ้งโอนแล้วไหม — ตัวเลขที่ลูกค้าเห็นตอนโอน ห้ามขยับย้อนหลัง */
function earlyPayMoneyIn(o: Order): boolean {
  return paidSoFar(o) > 0 || !!o.paidReportedAt || paymentEntries(o).length > 0;
}

/**
 * ใบนี้ให้เซิร์ฟเวอร์คิดส่วนลดโอนไวให้เองได้ไหม — คืน null = ได้ · คืนข้อความ = เหตุผลที่ไม่ได้
 *
 * 📌 บิลบริษัท (FlowAccount / ใบกำกับภาษี / ใบเสนอราคา) = "นโยบาย" ไม่ใช่บั๊ก: ยอดต้องตรงกับบิล/ใบที่ตกลงกับลูกค้าไปแล้ว
 *    (เขียนไว้ตรงนี้ให้เห็นชัด ๆ — ของเดิมไม่ได้ส่วนลดเพราะ "ไม่มีใครเขียนโค้ด" ซึ่งแยกไม่ออกจากบั๊ก)
 *    เจ้าของร้านเปลี่ยนใจเมื่อไหร่ = ลบ earlyPayBillReason ทิ้ง แล้วทั้งระบบตามทันทีเอง
 */
export function earlyPaySkipReason(o: Order): EarlyPaySkip | null {
  if (!o.items?.length) return "ไม่มีรายการ";
  if (o.dealer) return "ตัวแทนจำหน่าย";
  if (o.claimOf) return "ใบเคลม";
  const bill = earlyPayBillReason(o);
  if (bill) return bill;
  if (!OPEN_FOR_PRICING.includes(o.status)) return "เลยขั้นเก็บเงินแล้ว";
  if (earlyPayMoneyIn(o)) return "มีเงินเข้า/แจ้งโอนแล้ว";
  if (orderOtherDiscounts(o) > 0) return "มีส่วนลดอื่น";
  // ล็อกแล้ว (แจ้งโอนทันเวลา) / ติ๊กไม่รับ = ตัวเลขที่ตกลงกับลูกค้าแล้ว ห้ามคิดใหม่
  if (o.earlyPay?.lockedAt || o.earlyPay?.waivedAt) return "ล็อก/ติ๊กไม่รับแล้ว";
  return null;
}

/**
 * ฐานคิด (ยอดสินค้าก่อนค่าส่ง เฉพาะใบปลีกล้วน) — โหลดสินค้าที่เกี่ยวข้องให้เอง
 * loadProduct: ส่งตัวโหลดเองได้ (สคริปต์ตรวจ/เทสต์รันนอก Next ซึ่ง import products-server ไม่ได้ เพราะติด "server-only")
 */
export async function earlyPayBaseOf(o: Order, loadProduct?: (id: string) => Promise<Product | undefined>): Promise<number> {
  const load = loadProduct ?? (await import("@/lib/products-server")).getProductServer;
  const prods = new Map<string, Product>();
  for (const pid of [...new Set((o.items ?? []).map((i) => i.productId).filter(Boolean))]) {
    const p = await load(pid);
    if (p) prods.set(pid, p);
  }
  return earlyPayBase(
    (o.items ?? []).map((i) => ({
      productId: i.productId,
      selections: i.sel,
      qty: i.qty,
      // ฐานเดียวกับ /api/orders: ราคาต่อหน่วย × จำนวน หักส่วนลดรายรายการ (ถ้ามี ใบนั้นจะติด "มีส่วนลดอื่น" อยู่แล้ว)
      amount: Math.max(0, i.qty * i.unitPrice - (i.discount ?? 0)),
    })),
    (id) => prods.get(id),
    { mergeLots: true }
  );
}

/**
 * เติม/แก้/เอาส่วนลดโอนไวออก ให้ตรงกับรายการปัจจุบันของใบ
 *
 * เรียกจาก writeOrder() เฉพาะตอน "รายการหรือราคาเปลี่ยน" (itemsChanged) หรือ "เพิ่งออกบิลบริษัท" (earlyPayBillAdded)
 * — ไม่งั้นการบันทึกเรื่องอื่น (ผูกไลน์ · ปริ้นใบงาน · cron) จะไปสตาร์ทนาฬิกา 1 ชั่วโมงใหม่ให้ใบเก่าโดยไม่ได้ตั้งใจ
 *
 * อ่านตั้งค่า/สินค้าไม่ได้ = คงของเดิม ไม่ทำให้บันทึกไม่สำเร็จ
 */
export async function syncOrderEarlyPay(sb: SB, order: Order, by = "ระบบ"): Promise<Order> {
  if (earlyPaySkipReason(order)) return dropEarlyPayForBill(order, by);
  try {
    const { data: settRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
    const cfg = earlyPayOf(settRow?.data as { earlyPay?: EarlyPayDiscount } | undefined);
    const amount = earlyPayAmount(await earlyPayBaseOf(order), cfg);
    const cur = order.earlyPay;
    if (amount === (cur?.amount ?? 0)) return order;

    const baht = (n: number) => n.toLocaleString("th-TH");
    // เคยได้ แล้วตอนนี้ไม่เข้าเกณฑ์ (จำนวนขยับจนเข้าเรทส่ง) — เอาออก กติกา "ได้ราคาส่งแล้วไม่ลดซ้ำ"
    if (amount <= 0) {
      const { earlyPay: _drop, ...rest } = order;
      void _drop;
      return withLog(rest, by, "เอาส่วนลดโอนไวออก", `รายการเปลี่ยนจนเข้าเรทราคาส่ง — ส่วนลดเดิม ${baht(cur!.amount)} บาท`);
    }
    // ใบเดิมมีอยู่แล้วแต่ยอดเปลี่ยน (ลูกค้าสั่งเพิ่ม/แอดมินตีราคาใหม่) — แก้เฉพาะตัวเลข คงนาฬิกาเดิมไว้
    if (cur) {
      return withLog(
        { ...order, earlyPay: { ...cur, amount } },
        by,
        "แก้ส่วนลดโอนไวตามยอดใหม่",
        `${baht(cur.amount)} → ${baht(amount)} บาท`
      );
    }
    const expiresAt = earlyPayExpiresAt(cfg);
    return withLog(
      { ...order, earlyPay: { label: EARLY_PAY_LABEL, amount, ...(expiresAt ? { expiresAt } : {}) } },
      by,
      "คิดส่วนลดโอนไว",
      `−${baht(amount)} บาท${expiresAt ? ` · แจ้งโอนภายใน ${new Date(expiresAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })} น.` : ""}`
    );
  } catch {
    return order;
  }
}

/**
 * 🧾➖ ใบที่ได้ส่วนลดไปแล้ว แล้วมา "ออกบิลบริษัท" ทีหลัง — เอาส่วนลดออกให้ยอดตรงเอกสาร
 *
 * ทางที่เกิดจริง: ลูกค้าสั่งผ่านเว็บ/แอดมินคีย์ให้ → ได้ส่วนลด → ลูกค้าขอใบกำกับภาษี แอดมินผูกเอกสาร FlowAccount
 * (ผูกเอกสารจะดึงรายการ/VAT มาทับ = รายการเปลี่ยน · ส่วนใบที่กรอกข้อมูลใบกำกับเฉย ๆ ประตูเรียกให้ด้วย earlyPayBillAdded)
 *
 * ⚠️ ไม่แตะใบที่มีเงินเข้า/แจ้งโอนแล้ว — ลูกค้าโอนตามตัวเลขที่เว็บบอกตอนนั้น ตัดทีหลัง = ค้าง ฿5/฿10 ปลอมแล้วไลน์ไปทวง
 *    (กฎเดียวกับ earlyPayState "superseded" · ใบแบบนั้นแอดมินติ๊ก "ลูกค้าไม่รับส่วนลด" เองในหน้าออเดอร์ได้)
 * ⚠️ ไม่แตะใบที่ติ๊กไม่รับส่วนลดไว้แล้ว — ตัวเลขนั้นตกลงกับลูกค้าไปแล้ว
 */
function dropEarlyPayForBill(order: Order, by: string): Order {
  const bill = earlyPayBillReason(order);
  const cur = order.earlyPay;
  if (!bill || !cur || !(cur.amount > 0) || cur.waivedAt || earlyPayMoneyIn(order)) return order;
  const { earlyPay: _drop, ...rest } = order;
  void _drop;
  return withLog(
    rest,
    by,
    "เอาส่วนลดโอนไวออก",
    `${bill} — ยอดต้องตรงเอกสารที่ออกให้ลูกค้า · ส่วนลดเดิม ${cur.amount.toLocaleString("th-TH")} บาท`
  );
}
