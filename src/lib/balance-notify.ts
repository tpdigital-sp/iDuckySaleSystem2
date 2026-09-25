import { orderBalance, type Order } from "@/lib/admin-data";

/**
 * 💳📣 แจ้งลูกค้า "ยอดที่ต้องโอนเพิ่ม" ครั้งเดียวหลังแอดมินแก้ยอดจนครบ — ใช้ร่วมกันทั้งหน้าจอ / API ปุ่มกด / cron
 *
 * เดิม: ทุกครั้งที่ยอดค้างขยับใน PATCH ออเดอร์ ระบบยิงไลน์ทันที
 * → แอดมินเพิ่มรายการทีละชิ้น (ปุ่ม "เพิ่มเข้าออเดอร์") ลูกค้าโดนข้อความทุกชิ้น · เพิ่มผิดแล้วลบก็ยังได้อีกข้อความ
 *   (พนักงานแจ้ง 22 ก.ย. 69 · เห็นในแชทจริงของ OD-260918-1267 ที่ยิงยอดเพิ่ม 2 รอบห่างกันไม่กี่นาที)
 *
 * ตอนนี้: ยอดค้างขยับ = เข้า "คิวแจ้ง" (order.balancePending) เงียบ ๆ
 *   · แก้ต่อได้เรื่อย ๆ คิวอัปเดตยอดตาม (นาฬิกาเริ่มนับใหม่ทุกครั้งที่แก้)
 *   · ยอดกลับไปเท่าที่ลูกค้ารู้อยู่แล้ว (เพิ่มผิดแล้วลบทิ้ง) → คิวหายเอง ลูกค้าไม่รู้เรื่องเลย
 *   · แอดมินกดปุ่ม 📣 ในหน้าออเดอร์ = ส่งข้อความเดียวจบ
 *   · ไม่กดภายใน BALANCE_AUTO_NOTIFY_MINUTES นาทีหลังแก้ครั้งสุดท้าย → cron แจ้งให้เอง (ลูกค้าต้องรู้ว่าต้องโอนเพิ่ม)
 */

/**
 * ค้างในคิวเกินกี่นาที (นับจากการแก้ครั้งล่าสุด) ให้ระบบแจ้งเอง
 * 22 ก.ย. 69 เริ่มที่ 20 นาที → 25 ก.ย. 69 เจ้าของร้านลดเหลือ 5: OD-260923-1138 แก้ค่าส่ง +฿50 แล้วไม่มีใครกด 📣
 * ลูกค้ารู้ยอดช้า 27 นาที (โอนภายใน 1 นาทีหลังไลน์ออก = รอเราอยู่) · cron วิ่งทุก 5 นาทีคู่กัน (netlify/functions/balance-notify.mjs)
 * ยังกันไลน์รัวได้เหมือนเดิม: แก้ต่อเนื่องนาฬิกาเริ่มใหม่ทุกครั้ง รวมเป็นข้อความเดียว
 */
export const BALANCE_AUTO_NOTIFY_MINUTES = 5;

/** มียอดรอแจ้งลูกค้าอยู่ไหม */
export function hasPendingBalanceNotice(o: Order): boolean {
  return !!o.balancePending;
}

/** ถึงเวลาที่ cron ต้องแจ้งแทนแล้วหรือยัง */
export function balanceNotifyOverdue(o: Order, now = Date.now()): boolean {
  const at = Date.parse(o.balancePending?.at ?? "");
  return !!at && now - at >= BALANCE_AUTO_NOTIFY_MINUTES * 60_000;
}

/** เหลืออีกกี่นาทีก่อนระบบแจ้งเอง (0 = เลยเวลาแล้ว) */
export function balanceNotifyMinutesLeft(o: Order, now = Date.now()): number {
  const at = Date.parse(o.balancePending?.at ?? "");
  if (!at) return 0;
  return Math.max(0, Math.ceil((at + BALANCE_AUTO_NOTIFY_MINUTES * 60_000 - now) / 60_000));
}

/** ยอดที่คิวนี้จะบอกลูกค้า — คิดสดจากออเดอร์ (ยอดในคิวเป็นแค่ที่จำไว้ตอนบันทึกล่าสุด) */
export function pendingBalanceAmount(o: Order): number {
  return orderBalance(o);
}

/** คิวนี้เป็น "ยอดเพิ่ม" หรือ "ยอดลด" เทียบกับที่ลูกค้ารู้อยู่ก่อน */
export function pendingBalanceDirection(o: Order): "up" | "down" {
  return orderBalance(o) > (o.balancePending?.from ?? 0) ? "up" : "down";
}

/** สิ่งที่ต้องทำกับคิวในคำขอบันทึกหนึ่งครั้ง */
export type BalanceQueuePlan =
  /** ไม่แตะคิว (ยอดไม่ขยับ / ไม่เข้าเงื่อนไข) */
  | { action: "keep" }
  /** เปิดคิวใหม่ — ยังไม่ส่งไลน์ */
  | { action: "start"; from: number; balance: number }
  /** คิวเดิมยังอยู่ แต่ยอดเปลี่ยน → อัปเดตยอด + เริ่มจับเวลาใหม่ */
  | { action: "refresh"; from: number; balance: number }
  /** ยอดกลับไปเท่าที่ลูกค้ารู้อยู่ก่อน (เพิ่มผิดแล้วลบทิ้ง) → ทิ้งคิว ไม่ต้องแจ้ง */
  | { action: "cancel" };

/**
 * ตัดสินใจเรื่องคิวแจ้งยอดในคำขอบันทึกหนึ่งครั้ง — แยกออกมาเป็นฟังก์ชันล้วนเพื่อทดสอบได้ (npm run check:balance-notify)
 *   balBefore = ยอดค้างก่อนบันทึกครั้งนี้ · balNow = หลังบันทึก · pending = คิวที่ค้างอยู่ในฐาน
 *   triggered = คำขอนี้เข้าเงื่อนไข "ต้องบอกลูกค้า" ไหม (ยอดโต / ยอดลดหลังเคยแจ้งไปแล้ว)
 */
export function planBalanceQueue(args: {
  balBefore: number;
  balNow: number;
  pending?: { from: number } | null;
  triggered: boolean;
}): BalanceQueuePlan {
  const { balBefore, balNow, pending, triggered } = args;
  if (pending) {
    // ยอดกลับมาเท่าที่ลูกค้ารู้อยู่ก่อนคิวนี้เกิด → ไม่มีอะไรต้องบอก
    if (Math.abs(balNow - pending.from) <= 0.5) return { action: "cancel" };
    // ยอดขยับอีกในคำขอนี้ → อัปเดตยอด + เริ่มนับเวลาใหม่ (แอดมินยังแก้อยู่)
    // ไม่ขยับ = บันทึกเรื่องอื่น (ติ๊กงาน/อัปแบบ) ห้ามไปเลื่อนนาฬิกาให้ลูกค้ารอนานขึ้น
    if (Math.abs(balNow - balBefore) > 0.5) return { action: "refresh", from: pending.from, balance: balNow };
    return { action: "keep" };
  }
  return triggered ? { action: "start", from: balBefore, balance: balNow } : { action: "keep" };
}
