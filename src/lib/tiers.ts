/**
 * ระบบระดับสมาชิก — สะสมยอดจ่ายจริงตลอดชีพ → ตกระดับ → ลด % อัตโนมัติ
 * ตั้งค่าได้ในหน้า /admin/settings (เก็บใน ShopPayment.tiers) · คำนวณสดจากตาราง orders ไม่ต้องมีตารางใหม่
 */
import { orderTotal, type Order, type OrderStatus } from "./admin-data";

export interface Tier {
  id: string;
  name: string; // เช่น "ซิลเวอร์"
  icon: string; // emoji
  minSpend: number; // ยอดสะสมขั้นต่ำที่จะเข้าระดับนี้ (บาท)
  discountPct: number; // ส่วนลด % ต่อออเดอร์
}

export const DEFAULT_TIERS: Tier[] = [
  { id: "bronze", name: "บรอนซ์", icon: "🥉", minSpend: 0, discountPct: 0 },
  { id: "silver", name: "ซิลเวอร์", icon: "🥈", minSpend: 3000, discountPct: 3 },
  { id: "gold", name: "โกลด์", icon: "🥇", minSpend: 10000, discountPct: 5 },
  { id: "platinum", name: "แพลทินัม", icon: "💎", minSpend: 30000, discountPct: 8 },
  { id: "diamond", name: "ไดมอนด์", icon: "👑", minSpend: 80000, discountPct: 12 },
];

/** สถานะที่ถือว่า "จ่ายแล้ว" — นับเข้ายอดสะสม (ไม่นับ รอชำระ/รอตรวจสลิป/ยกเลิก) */
const PAID_STATUSES: OrderStatus[] = ["ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ", "กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"];

/** เรียงระดับจากต่ำ→สูง · ตกไปใช้ค่าเริ่มต้นถ้ายังไม่ตั้ง */
export function tiersOf(list?: Tier[] | null): Tier[] {
  const t = list && list.length ? list : DEFAULT_TIERS;
  return [...t].sort((a, b) => a.minSpend - b.minSpend);
}

/** ยอดสะสมของลูกค้า = ผลรวม orderTotal ของออเดอร์ที่จ่ายแล้ว */
export function paidSpend(orders: Order[]): number {
  return orders.filter((o) => PAID_STATUSES.includes(o.status)).reduce((s, o) => s + orderTotal(o), 0);
}

/** ระดับปัจจุบันจากยอดสะสม (ระดับสูงสุดที่ยอดถึง) */
export function tierForSpend(spend: number, list?: Tier[] | null): Tier {
  const t = tiersOf(list);
  let cur = t[0];
  for (const x of t) if (spend >= x.minSpend) cur = x;
  return cur;
}

/** ระดับถัดไป (null = สูงสุดแล้ว) */
export function nextTier(spend: number, list?: Tier[] | null): Tier | null {
  return tiersOf(list).find((x) => x.minSpend > spend) ?? null;
}

/** ส่วนลดของระดับ คิดบน "ราคาสินค้า" (ก่อนค่าส่ง) · ปัดลงเป็นจำนวนเต็มบาท */
export function tierDiscountAmount(subtotal: number, pct: number): number {
  if (pct <= 0 || subtotal <= 0) return 0;
  return Math.floor((subtotal * pct) / 100);
}
