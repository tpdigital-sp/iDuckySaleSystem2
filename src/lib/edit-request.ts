import type { Order, OrderStatus } from "@/lib/admin-data";

/**
 * ✏️ กติกา "คำขอแก้ไขออเดอร์ที่ยังค้าง" — ที่เดียวของทั้งระบบ
 *
 * ใช้ร่วมกัน 3 ที่ ห้ามลอกเงื่อนไขไปเขียนใหม่ เดี๋ยวตัวเลขป้ายกับรายการในหน้าไม่ตรงกัน:
 *   - ป้ายเลขข้างเมนู (API ?count=1)
 *   - รายการในหน้า /admin/edit-requests
 *   - ด่านตัดสินว่าจะแจ้งทีมงานทางไลน์ไหมตอนลูกค้าส่งคำขอ
 */

/** ยังไม่มีเงินเข้า — ไม่ใช่งานที่ทีมต้องตามแก้ให้ (ลูกค้ายกเลิกแล้วสั่งใหม่เองได้) เจ้าของร้านสั่ง 22 ก.ย. 69 */
export const PRE_PAID_STATUS: OrderStatus[] = ["รอชำระเงิน", "รอตรวจสอบ"];

export type EditRequest = NonNullable<Order["editRequest"]>;

/** ใบนี้จ่ายเงินแล้ว (ขั้นที่ทีมต้องลงมือแก้ให้) */
export const isPaidStage = (status: OrderStatus) => !PRE_PAID_STATUS.includes(status);

/** คำขอที่ "ยังไม่ได้จัดการ" — ตัวเลขบนป้ายเมนูนับจากอันนี้ */
export function editRequestOpen(er: EditRequest | undefined, status: OrderStatus): boolean {
  return !!er?.text && !er.doneAt && status !== "ยกเลิก" && isPaidStage(status);
}
