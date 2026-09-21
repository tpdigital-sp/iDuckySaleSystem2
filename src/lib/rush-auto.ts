import type { Order, OrderStatus } from "@/lib/admin-data";
import { addDays, isWorkingDay, shortThaiDay, todayBkkYmd } from "@/lib/ship-date";

/**
 * 🔥 งานเร่งอัตโนมัติ — ธง Order.rush ที่ระบบติ๊กให้เองเมื่อ "วันที่ลูกค้าต้องใช้งาน" กระชั้น
 *
 * ทำไม (พนักงานแจ้ง 21 ก.ย. 69):
 * เดิมธงงานเร่งเป็นปุ่มที่แอดมินต้องกดเองเท่านั้น — ใบที่ลูกค้าสั่งเข้ามาเองจึงไม่มีใครกดให้
 * กว่ากราฟฟิกจะมาเปิดใบแล้วเห็นว่าวันใช้งานกระชั้น ก็อาจเลยรอบส่งผลิตของวันไปแล้ว
 * "ถ้าเป็นเคสที่ลูกค้าสั่งเอง จะทำยังไงให้ฝั่งกราฟฟิกรู้ว่างานนี้เร่ง"
 *
 * กติกา: วันใช้งานเหลือน้อยกว่า RUSH_AUTO_WORKDAYS วันทำการ = งานเร่ง (เกณฑ์เดียวกับคำเตือน "กระชั้นมาก" ในตะกร้า)
 * คิดใหม่ทุกครั้งที่บันทึกออเดอร์ (ประตู insertOrder/updateOrder) — ใบที่ลูกค้าสั่งไว้ล่วงหน้าแล้วมาโอนช้า
 * จะกลายเป็นงานเร่งเองตอนเงินเข้า ซึ่งเป็นนาทีที่การ์ดขึ้นบอร์ด WIP กราฟฟิกพอดี
 *
 * ⚠️ คนกดเอง (ปุ่ม 🔥 ในหน้าออเดอร์) ชนะเสมอ — ปุ่มเขียน Order.rushManual มาด้วย แล้วระบบจะไม่ไปยุ่งกับใบนั้นอีก
 *    ใบที่ระบบติ๊กให้ (rushAuto) ยังคิดใหม่ได้เรื่อย ๆ · หน้าจอไหนบันทึกทับโดยไม่รู้จักฟิลด์นี้ ระบบเติมกลับให้เอง
 */

/** วันใช้งานเหลือไม่ถึงกี่วันทำการ = งานเร่ง (ตัวเดียวกับที่ตะกร้าเตือนลูกค้าว่า "กระชั้นมาก") */
export const RUSH_AUTO_WORKDAYS = 3;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** ใบที่จบไปแล้ว — ไม่ต้องติ๊กงานเร่งย้อนหลัง */
const SETTLED: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];

/**
 * ใบที่ "แจ้งกลุ่มไลน์ร้านแล้วมีประโยชน์" — เงินเข้าแล้ว (เกณฑ์เดียวกับ needs-purchase.ts) และงานยังไม่เข้าไลน์ผลิต
 * ใบที่ "กำลังผลิต"/ส่งแล้ว งานเดินไปแล้ว การ์ดเตือนให้รีบทำแบบไม่มีประโยชน์ — ติดป้ายงานเร่งไว้เฉย ๆ พอ
 */
function alertState(o: Order): boolean {
  return o.status === "ชำระแล้ว" || o.status === "รอตรวจแบบ" || o.status === "แก้ไขแบบ" || o.status === "อนุมัติแบบ";
}

/**
 * นับวันทำการ (จ–ศ เว้นวันหยุดร้าน) ตั้งแต่พรุ่งนี้จนถึงก่อนวันใช้งาน
 * -1 = วันผิดรูป หรือเลยวันใช้งานมาแล้ว · ใช้ร่วมกับกล่องวันใช้งานในตะกร้า (เกณฑ์เตือนต้องเป็นตัวเดียวกัน)
 */
export function workingDaysUntil(useBy: string, today = todayBkkYmd()): number {
  if (!YMD.test(useBy) || useBy < today) return -1;
  let n = 0;
  for (let d = addDays(today, 1); d < useBy && n < 400; d = addDays(d, 1)) if (isWorkingDay(d)) n++;
  return n;
}

/**
 * เหตุผลที่ใบนี้ควรเป็นงานเร่ง · null = ยังไม่กระชั้น (หรือไม่มีวันใช้งาน/ใบจบแล้ว)
 * เลยวันใช้งานไปแล้วไม่นับ — ทุกจอมีป้ายแดง "เลยกำหนด N วัน" ของมันอยู่แล้ว และใบเก่าที่ค้างไม่ควรปลุกแจ้งเตือนใหม่
 */
export function autoRushReason(o: Order, today = todayBkkYmd()): string | null {
  if (SETTLED.includes(o.status)) return null;
  const useBy = o.useByDate ?? "";
  if (!YMD.test(useBy) || useBy < today) return null;
  const wd = workingDaysUntil(useBy, today);
  if (wd < 0 || wd >= RUSH_AUTO_WORKDAYS) return null;
  return `ลูกค้าระบุวันใช้งาน ${shortThaiDay(useBy)} — เหลืออีก ${wd === 0 ? "ไม่ถึง 1" : wd} วันทำการ`;
}

/** ตราตอนคนกดปุ่ม 🔥 เอง — มีค่าแล้วระบบไม่ไปติ๊ก/ปลดธงงานเร่งของใบนี้อีก */
export function rushManualStamp(by: string, on: boolean): NonNullable<Order["rushManual"]> {
  return { by, at: new Date().toISOString(), on };
}

export interface AutoRushResult {
  order: Order;
  /** "on" = ระบบเพิ่งติ๊กงานเร่งให้ · "off" = เพิ่งปลดให้ (วันใช้งานถูกเลื่อนออกไป) · null = ไม่เปลี่ยน */
  turned: "on" | "off" | null;
  /** เหตุผลของธงตอนนี้ (ถ้ามี) — ไว้ลงประวัติ/โชว์ในหน้าออเดอร์ */
  reason?: string;
}

/**
 * คิดธงงานเร่งใหม่ให้ออเดอร์ก้อนหนึ่ง (เรียกที่ประตูเขียนออเดอร์ทุกครั้ง)
 * ไม่แตะใบที่คนกดเอง (rushManual) และไม่แตะธงที่คนกดไว้ก่อนมีระบบนี้ (rush แต่ไม่มี rushAuto)
 */
export function applyAutoRush(order: Order, today = todayBkkYmd()): AutoRushResult {
  if (order.rushManual) return { order, turned: null };
  const reason = autoRushReason(order, today);
  // คนกดไว้เองแต่เดิม (ก่อนมีระบบนี้ / หน้าจอเก่า) — ธงเป็นของคน ไม่ปลดให้
  if (order.rush && !order.rushAuto) return { order, turned: null };
  if (reason && !order.rush) return { order: { ...order, rush: true, rushAuto: { at: new Date().toISOString(), reason } }, turned: "on", reason };
  if (!reason && order.rush && order.rushAuto) {
    // ⚠️ เลยวันใช้งานมาแล้ว = ยิ่งต้องเร่ง — ห้ามปลดธงให้ (autoRushReason คืน null ให้ใบเลยกำหนดด้วย)
    const overdue = YMD.test(order.useByDate ?? "") && order.useByDate! < today && !SETTLED.includes(order.status);
    if (overdue) return { order, turned: null };
    const next = { ...order, rush: false };
    delete next.rushAuto;
    return { order: next, turned: "off" };
  }
  // ธงเดิมยังอยู่ — อัปเหตุผลให้ตรงวัน ("เหลืออีก 2 วันทำการ" → "ไม่ถึง 1") แต่คงเวลาติ๊กและตราแจ้งเตือนไว้
  if (reason && order.rush && order.rushAuto && order.rushAuto.reason !== reason)
    return { order: { ...order, rushAuto: { ...order.rushAuto, reason } }, turned: null, reason };
  return { order, turned: null, ...(reason ? { reason } : {}) };
}

/**
 * ถึงเวลาแจ้งกลุ่มไลน์ร้านว่า "ใบนี้เป็นงานเร่ง" หรือยัง — กติกาเดียวกับ stampNeedsPurchaseAlert
 * แจ้งครั้งเดียวต่อธงหนึ่งครั้ง และเฉพาะใบที่เงินเข้าแล้ว (นาทีที่การ์ดขึ้นบอร์ดกราฟฟิก)
 * หน้าจอค้างที่ส่งก้อนไม่มีตรา alertedAt มา → คงตราเดิมไว้ ไม่เด้งซ้ำ
 */
export function stampRushAlert(prev: Order | null | undefined, next: Order): { order: Order; due: boolean } {
  const ra = next.rushAuto;
  if (!ra || !next.rush) return { order: next, due: false };
  let cur = ra;
  const old = prev?.rushAuto;
  if (!cur.alertedAt && old?.alertedAt && old.at === cur.at) cur = { ...cur, alertedAt: old.alertedAt };
  const due = !cur.alertedAt && alertState(next);
  if (due) cur = { ...cur, alertedAt: new Date().toISOString() };
  return { order: cur === ra ? next : { ...next, rushAuto: cur }, due };
}
