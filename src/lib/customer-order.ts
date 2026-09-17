import type { Order } from "@/lib/admin-data";

/**
 * 🧹 ก้อนออเดอร์ที่ส่งให้ "หน้าลูกค้า" — ทุก route ฝั่งลูกค้าต้องผ่านตัวนี้ก่อนตอบ
 *
 * - key (รหัสลับของลิงก์) ไม่ส่งกลับ
 * - 🛒 needsPurchase: ลูกค้ารู้ได้แค่ว่า "งานนี้รอสินค้าเข้าร้าน" กับ "ของเข้าแล้วเมื่อไหร่"
 *   โน้ตว่าต้องสั่งอะไร/สั่งร้านไหน · ใครติ๊ก · ใครรับของ · เวลาแจ้งกลุ่มไลน์ร้าน = เรื่องภายใน ตัดทิ้ง
 *   (เจ้าของร้านเลือก 17 ก.ย. 69: บอกลูกค้าแบบสุภาพ ไม่โชว์โน้ตภายใน)
 */
export function customerSafeOrder(o: Order): Omit<Order, "key"> {
  const { key: _secret, needsPurchase: np, ...safe } = o;
  void _secret;
  return np ? { ...safe, needsPurchase: { by: "", at: np.at, ...(np.arrivedAt ? { arrivedAt: np.arrivedAt } : {}) } } : safe;
}

/** เฉพาะส่วน needsPurchase — สำหรับ route ที่ตั้งใจส่ง key กลับ (รายการออเดอร์ของสมาชิกที่ล็อกอิน) */
export function hideInternalStockNote<T extends Pick<Order, "needsPurchase">>(o: T): T {
  const np = o.needsPurchase;
  return np ? { ...o, needsPurchase: { by: "", at: np.at, ...(np.arrivedAt ? { arrivedAt: np.arrivedAt } : {}) } } : o;
}
