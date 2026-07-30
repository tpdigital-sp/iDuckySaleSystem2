/**
 * ระบบคูปอง — แอดมินแจกโค้ด/ลิงก์ ใช้ครั้งเดียว (กันซ้ำซ้อนด้วย atomic redeem ฝั่งเซิร์ฟเวอร์)
 * เก็บในตาราง coupons (service-role only) · helper ในไฟล์นี้เป็น pure ใช้ได้ทั้ง client/server
 */

export interface Coupon {
  code: string;
  type: "percent" | "fixed"; // ลด % หรือ ลดเป็นบาท
  value: number;
  minSpend?: number; // ยอดขั้นต่ำถึงใช้ได้
  maxDiscount?: number; // เพดานส่วนลด (เฉพาะ percent)
  expiresAt?: string; // ISO — ไม่ตั้ง = ไม่หมดอายุ
  assignedTo?: string; // customerId ที่เจาะจง — ไม่ตั้ง = ใครก็ได้ (ใช้ครั้งเดียว)
  excludeProducts?: string[]; // product id ที่ไม่ร่วมรายการ — ส่วนลด/ยอดขั้นต่ำคิดเฉพาะสินค้าที่ร่วม
  note?: string; // โน้ตให้แอดมิน (เช่น "แจกงานอีเวนต์")
  status: "active" | "redeemed" | "void";
  redeemedBy?: string; // customerId ที่ใช้
  redeemedOrderId?: string;
  redeemedAt?: string;
  createdAt: string;
}

/** ส่วนลดที่คูปองนี้ให้ (คิดบนราคาสินค้าก่อนค่าส่ง) */
export function couponDiscount(c: Coupon, subtotal: number): number {
  if (subtotal <= 0) return 0;
  if (c.type === "fixed") return Math.min(Math.max(0, c.value), subtotal);
  const raw = Math.floor((subtotal * c.value) / 100);
  const capped = c.maxDiscount ? Math.min(raw, c.maxDiscount) : raw;
  return Math.min(capped, subtotal);
}

export type CouponError = "notfound" | "used" | "void" | "expired" | "minspend" | "notyours" | "excluded";

const REASON_TH: Record<CouponError, string> = {
  notfound: "ไม่พบคูปองนี้",
  used: "คูปองนี้ถูกใช้ไปแล้ว",
  void: "คูปองนี้ถูกยกเลิก",
  expired: "คูปองหมดอายุแล้ว",
  minspend: "ยอดสั่งซื้อยังไม่ถึงขั้นต่ำของคูปอง",
  notyours: "คูปองนี้สงวนสำหรับลูกค้าท่านอื่น",
  excluded: "สินค้าในตะกร้าไม่ร่วมรายการคูปองนี้",
};
export const couponErrorText = (e: CouponError) => REASON_TH[e];

/** รายการสินค้าแบบย่อไว้คิดส่วนลด (ตัดสินค้าไม่ร่วมรายการออก) */
export interface CouponItem {
  productId: string;
  qty: number;
  unitPrice: number;
}

/** ยอดเฉพาะสินค้าที่ร่วมรายการของคูปองนี้ */
export function couponEligibleSubtotal(c: Coupon, items: CouponItem[]): number {
  const ex = c.excludeProducts ?? [];
  return items.filter((i) => !ex.includes(i.productId)).reduce((s, i) => s + i.qty * i.unitPrice, 0);
}

/**
 * ตรวจว่าคูปองใช้ได้ไหม (ไม่เปลี่ยนสถานะ) — ใช้ทั้งพรีวิวฝั่งลูกค้าและก่อน redeem ฝั่งเซิร์ฟเวอร์
 * ส่ง items มาด้วยเมื่อคูปองมีสินค้าไม่ร่วมรายการ — ส่วนลด/ยอดขั้นต่ำจะคิดเฉพาะสินค้าที่ร่วม
 */
export function validateCoupon(
  c: Coupon | null | undefined,
  customerId: string | undefined,
  subtotal: number,
  nowMs: number,
  items?: CouponItem[]
): { ok: true; discount: number } | { ok: false; reason: CouponError } {
  if (!c) return { ok: false, reason: "notfound" };
  if (c.status === "redeemed") return { ok: false, reason: "used" };
  if (c.status === "void") return { ok: false, reason: "void" };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < nowMs) return { ok: false, reason: "expired" };
  if (c.assignedTo && c.assignedTo !== customerId) return { ok: false, reason: "notyours" };
  // มีสินค้าไม่ร่วมรายการ → คิดบนยอดเฉพาะสินค้าที่ร่วม (ถ้าไม่ได้ส่ง items มา ใช้ยอดรวมตามเดิม)
  let base = subtotal;
  if (c.excludeProducts?.length && items) {
    base = couponEligibleSubtotal(c, items);
    if (base <= 0) return { ok: false, reason: "excluded" };
  }
  if (c.minSpend && base < c.minSpend) return { ok: false, reason: "minspend" };
  return { ok: true, discount: couponDiscount(c, base) };
}

/** ป้ายสรุปคูปอง (ไว้แสดงในสรุปยอด/ประวัติ) */
export function couponLabel(c: Pick<Coupon, "code" | "type" | "value">): string {
  return `คูปอง ${c.code} (${c.type === "percent" ? `${c.value}%` : `฿${c.value}`})`;
}

/** สุ่มโค้ดคูปอง — ตัวอักษร/เลขที่อ่านง่าย ไม่ปนตัวสับสน (0/O, 1/I) */
export function randomCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
