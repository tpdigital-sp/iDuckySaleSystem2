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
  { id: "bronze", name: "Bronze", icon: "🥉", minSpend: 0, discountPct: 0 },
  { id: "silver", name: "Silver", icon: "🥈", minSpend: 3000, discountPct: 3 },
  { id: "gold", name: "Gold", icon: "🥇", minSpend: 10000, discountPct: 5 },
  { id: "platinum", name: "Platinum", icon: "💎", minSpend: 30000, discountPct: 8 },
  { id: "diamond", name: "Diamond", icon: "👑", minSpend: 80000, discountPct: 12 },
];

/** สี gradient + สีป้ายส่วนลด ต่อระดับ (โทนสีสด อิงโลหะ/อัญมณี) — คีย์ด้วย id, ไม่เจอใช้ลำดับวน */
const TIER_GRAD = [
  "linear-gradient(135deg,#7c4a21,#b06a34 55%,#c98a4e)", // bronze
  "linear-gradient(135deg,#525b67,#828d9c 55%,#a6afba)", // silver
  "linear-gradient(135deg,#b9791a,#e0a92a 55%,#f2c94c)", // gold
  "linear-gradient(135deg,#0b6b7a,#149bad 52%,#3fd0dd)", // platinum
  "linear-gradient(135deg,#5b2ec0,#4a54d6 45%,#3b7ae4)", // diamond
];
const TIER_PILL = ["#7c4a21", "#525b67", "#8a5a12", "#0b6b7a", "#4032a0"];
const TIER_ID_INDEX: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4 };

/** คืนสี gradient + สีป้ายของระดับ (index = ตำแหน่งในลิสต์ ใช้เมื่อ id ไม่ตรงมาตรฐาน) */
export function tierColor(tier: { id: string }, index = 0): { gradient: string; pill: string } {
  const i = TIER_ID_INDEX[tier.id] ?? index;
  const k = ((i % TIER_GRAD.length) + TIER_GRAD.length) % TIER_GRAD.length;
  return { gradient: TIER_GRAD[k], pill: TIER_PILL[k] };
}

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
