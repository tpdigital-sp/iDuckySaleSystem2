import "server-only";
import {
  REOPEN_FOR_BALANCE,
  orderBalance,
  orderTotal,
  withLog,
  type FlowAccountExtraDoc,
  type Order,
  type OrderCharge,
  type OrderItem,
} from "@/lib/admin-data";
import { orderNotice, type LineMessage } from "@/lib/server/notify";

const thb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, "");

export interface ChargeApplied {
  order: Order;
  totalBefore: number;
  total: number;
  /** ยอดค้างหลังเก็บเพิ่ม (ใบที่ยังไม่มี paidTotal = ยังไม่รู้ว่าค้างเท่าไร → 0) */
  bal: number;
  /** เด้งกลับ "รอชำระเงิน" ในรอบนี้ไหม */
  reopen: boolean;
}

/**
 * 🧾 ต่อค่าบริการเพิ่มเข้าออเดอร์ตามกติกากลาง — ใช้ทั้งปุ่ม "＋ เก็บเพิ่ม" และ "แนบบิลเพิ่ม" (FlowAccount ใบที่ 2)
 *   • ใบที่แอดมินเคยกด "ชำระแล้ว" เองโดยไม่มี paidTotal → ถือว่ารับครบเท่ายอดก่อนเก็บเพิ่ม (ไม่งั้นระบบไม่รู้ว่าค้าง)
 *   • ยอดค้างจริง + สถานะอยู่ในชุด REOPEN_FOR_BALANCE (รวม "กำลังผลิต" ตั้งแต่ 24 ก.ย. 69) → เด้งกลับ "รอชำระเงิน" จำขั้นเดิมไว้ใน reopenedFrom
 *     เงินครบ SlipOK/PATCH คืนขั้นเดิมให้เอง (stageAfterPayment) · คิวปริ้น/แพ็คยังเห็นใบผ่าน queueStageOf
 *   • ใบมัดจำมีเส้นทางเก็บงวดหลังของตัวเอง — ไม่เด้ง
 *   • จำยอดที่กำลังบอกลูกค้า (balanceNotified) + ปิดคิวแจ้งยอดค้าง (balancePending) เพราะข้อความรอบนี้บอกทั้งก้อนแล้ว
 */
export function applyCharge(order: Order, charge: OrderCharge, who: string, opts?: { extraDoc?: FlowAccountExtraDoc }): ChargeApplied {
  const now = charge.at || new Date().toISOString();
  const totalBefore = orderTotal(order);
  const waiting = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
  let updated: Order = { ...order, charges: [...(order.charges ?? []), charge] };
  if (opts?.extraDoc) updated = { ...updated, flowAccountExtras: [...(updated.flowAccountExtras ?? []), { ...opts.extraDoc, chargeId: charge.id }] };
  if (updated.paidTotal == null && !waiting && !updated.deposit) updated = { ...updated, paidTotal: totalBefore };
  const total = orderTotal(updated);
  const bal = updated.paidTotal != null ? orderBalance(updated) : 0;
  // ใบที่พักอยู่ "รอตรวจสอบ" (สลิปรอคนตรวจ · parkForSlipReview) ไม่เด้งซ้ำ — ไม่งั้น reopenedFrom ถูกทับเป็น "รอตรวจสอบ"
  const reopen = !updated.deposit && !updated.claimOf && !waiting && REOPEN_FOR_BALANCE.includes(updated.status) && updated.paidTotal != null && bal > 0;
  if (reopen) updated = { ...updated, status: "รอชำระเงิน", reopenedFrom: order.reopenedFrom ?? order.status };
  const docTxt = opts?.extraDoc ? ` · บิลเพิ่ม ${opts.extraDoc.docTypeLabel} ${opts.extraDoc.docNo}` : "";
  updated = withLog(
    updated,
    who,
    `เก็บเพิ่ม: ${charge.label} ${thb(charge.amount)} บาท`,
    `ยอดรวม ${thb(totalBefore)} → ${thb(total)} บาท${updated.paidTotal != null ? ` · ค้าง ${thb(bal)} บาท` : ""}${charge.note ? ` · ${charge.note}` : ""}${docTxt}${
      reopen ? ` · กลับไปรอชำระเงิน (จำขั้น ${order.status} ไว้ เงินครบกลับเอง)` : ""
    }`
  );
  if (updated.paidTotal != null) updated = { ...updated, balanceNotified: { at: now, balance: bal } };
  if (updated.balancePending) updated = { ...updated, balancePending: undefined };
  return { order: updated, totalBefore, total, bal, reopen };
}

/**
 * 🧾➕ บิลเพิ่มที่เป็น "สินค้าสั่งเพิ่ม" → ใส่บรรทัดในใบเป็นรายการในใบงาน (ไม่ใช่ค่าบริการเพิ่ม)
 *
 * ทำไม (OD-261005-7691 · 5 ต.ค. 69): ลูกค้าสั่งสติ๊กเกอร์สะท้อนแสงเพิ่ม 2 แผ่น ร้านออกใบเสนอราคาใบที่ 2 (QT010828)
 * แนบบิลเพิ่มแล้วระบบเก็บแค่ยอดเงินเป็น charges — รายการไม่เข้าใบงาน กราฟฟิก/ฝ่ายผลิต/บอร์ด WIP ไม่รู้ว่ามีของต้องทำเพิ่ม
 *
 * รายการ = special-item ราคาตามใบ (ก่อน VAT) + extraDoc = เลขเอกสาร · addedAt ประทับที่ประตูเขียน → การ์ด WIP งานเพิ่ม
 * ภาษี: บวก VAT/หัก ณ ที่จ่ายตามใบเข้ายอดของออเดอร์ (ผู้เรียกส่งยอดใหม่ → reconcileOrderTax ไม่คิดทับ)
 * เด้งกลับรอชำระเงิน/จำยอดที่แจ้ง ใช้กติกาเดียวกับ applyCharge
 * extra.items ต้องตั้งมาแล้ว (> 0) — flowAccountBillTotal จะบวกยอดใบนี้เข้ายอดตามบิล ป้าย "ไม่ตรงใบ" จึงไม่ขึ้น
 */
export function applyExtraDocItems(
  order: Order,
  extra: FlowAccountExtraDoc,
  items: OrderItem[],
  shipAdd: number,
  tax: { vat: number; vatRate: number; wht: number; whtRate: number },
  who: string
): ChargeApplied {
  const now = extra.at || new Date().toISOString();
  const totalBefore = orderTotal(order);
  const waiting = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let updated: Order = {
    ...order,
    items: [...order.items, ...items],
    ...(shipAdd > 0 ? { shippingCost: r2((order.shippingCost ?? 0) + shipAdd) } : {}),
    ...(tax.vat > 0 ? { vat: { rate: order.vat?.rate ?? tax.vatRate, amount: r2((order.vat?.amount ?? 0) + tax.vat) } } : {}),
    ...(tax.wht > 0 ? { wht: { rate: order.wht?.rate ?? tax.whtRate, amount: r2((order.wht?.amount ?? 0) + tax.wht) } } : {}),
    flowAccountExtras: [...(order.flowAccountExtras ?? []), extra],
  };
  if (updated.paidTotal == null && !waiting && !updated.deposit) updated = { ...updated, paidTotal: totalBefore };
  const total = orderTotal(updated);
  const bal = updated.paidTotal != null ? orderBalance(updated) : 0;
  const reopen = !updated.deposit && !updated.claimOf && !waiting && REOPEN_FOR_BALANCE.includes(updated.status) && updated.paidTotal != null && bal > 0;
  if (reopen) updated = { ...updated, status: "รอชำระเงิน", reopenedFrom: order.reopenedFrom ?? order.status };
  updated = withLog(
    updated,
    who,
    `แนบบิลเพิ่ม ${extra.docTypeLabel} ${extra.docNo} — เพิ่ม ${items.length} รายการเข้าใบงาน`,
    `${items.map((it) => `${it.name} ×${it.qty} @${thb(it.unitPrice)}`).join(" · ")}${shipAdd > 0 ? ` · ค่าส่ง +${thb(shipAdd)}` : ""}${
      tax.vat > 0 ? ` · VAT +${thb(tax.vat)}` : ""
    }${tax.wht > 0 ? ` · หัก ณ ที่จ่าย +${thb(tax.wht)}` : ""} · ยอดรวม ${thb(totalBefore)} → ${thb(total)} บาท${updated.paidTotal != null ? ` · ค้าง ${thb(bal)} บาท` : ""}${
      reopen ? ` · กลับไปรอชำระเงิน (จำขั้น ${order.status} ไว้ เงินครบกลับเอง)` : ""
    } · ${extra.url}`
  );
  if (updated.paidTotal != null) updated = { ...updated, balanceNotified: { at: now, balance: bal } };
  if (updated.balancePending) updated = { ...updated, balancePending: undefined };
  return { order: updated, totalBefore, total, bal, reopen };
}

/**
 * 📣 การ์ดไลน์ "มีค่าบริการเพิ่ม" — ใบ FlowAccount ไม่มีปุ่มแนบสลิปหน้าออเดอร์ (ชำระตามเอกสาร)
 * จึงต้องบอกให้โอนตามใบ + ส่งสลิปในแชท และปุ่มชี้ไปที่เอกสาร (บิลเพิ่มถ้ามี ไม่งั้นบิลหลัก)
 */
export function chargeNotice(applied: ChargeApplied, charge: OrderCharge, link: string, extraDoc?: FlowAccountExtraDoc): LineMessage[] {
  const { order, total, bal } = applied;
  const due = order.paidTotal != null ? bal : total;
  const fa = order.flowAccount;
  const doc = extraDoc ?? null;
  const docRef = doc ? `${doc.docTypeLabel} ${doc.docNo}` : "";
  const payHow = fa
    ? doc
      ? `โอนตาม${docRef} แล้วส่งสลิปมาในแชทนี้ได้เลยครับ`
      : "โอนแล้วส่งสลิปมาในแชทนี้ได้เลยครับ (ใบนี้ชำระตามเอกสารของร้าน)"
    : "โอนแล้วแนบสลิปในหน้าออเดอร์ได้เลยครับ";
  const button = doc ? { label: `เปิด${doc.docTypeLabel}`, uri: doc.url } : undefined;
  return orderNotice(order, link, {
    tone: "charge",
    head: "มีค่าบริการเพิ่ม",
    headline: `${charge.label} ${thb(charge.amount)} บาท${charge.note && !doc ? ` — ${charge.note}` : ""}${doc ? ` — ตาม${docRef}` : ""}`,
    hero: { label: due !== total ? "ยอดที่ต้องโอนเพิ่ม" : "ยอดที่ต้องโอน", value: `${thb(due)} บาท` },
    rows: [
      ...(doc?.lines?.length ? doc.lines.slice(0, 4).map((l) => ({ label: "รายการ", value: l })) : [{ label: "ค่าบริการเพิ่ม", value: `${charge.label} ${thb(charge.amount)} บาท` }]),
      ...(doc?.vat ? [{ label: `VAT`, value: `${thb(doc.vat)} บาท` }] : []),
      { label: "ยอดรวมทั้งบิล", value: `${thb(total)} บาท` },
      ...(order.paidTotal != null ? [{ label: "รับแล้ว", value: `${thb(order.paidTotal)} บาท`, bold: true }] : []),
    ],
    note: payHow,
    ...(button ? { button } : {}),
    alt: `🧾 ออเดอร์ ${order.id} มีค่าบริการเพิ่ม: ${charge.label} ${thb(charge.amount)} บาท${doc ? ` (ตาม${docRef})` : charge.note ? `\n${charge.note}` : ""}\n💰 ยอดรวมทั้งบิล ${thb(total)} บาท${
      due !== total ? `\n💳 ยอดที่ต้องโอนเพิ่ม ${thb(due)} บาท` : ""
    }\n${payHow}\n${doc ? doc.url : link}`,
  });
}

/** id ค่าบริการเพิ่ม (รูปแบบเดียวกับปุ่มเก็บเพิ่มเดิม) */
export function newChargeId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
