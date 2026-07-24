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

export type CouponError = "notfound" | "used" | "void" | "expired" | "minspend" | "notyours";

const REASON_TH: Record<CouponError, string> = {
  notfound: "ไม่พบคูปองนี้",
  used: "คูปองนี้ถูกใช้ไปแล้ว",
  void: "คูปองนี้ถูกยกเลิก",
  expired: "คูปองหมดอายุแล้ว",
  minspend: "ยอดสั่งซื้อยังไม่ถึงขั้นต่ำของคูปอง",
  notyours: "คูปองนี้สงวนสำหรับลูกค้าท่านอื่น",
};
export const couponErrorText = (e: CouponError) => REASON_TH[e];

/** ตรวจว่าคูปองใช้ได้ไหม (ไม่เปลี่ยนสถานะ) — ใช้ทั้งพรีวิวฝั่งลูกค้าและก่อน redeem ฝั่งเซิร์ฟเวอร์ */
export function validateCoupon(
  c: Coupon | null | undefined,
  customerId: string | undefined,
  subtotal: number,
  nowMs: number
): { ok: true; discount: number } | { ok: false; reason: CouponError } {
  if (!c) return { ok: false, reason: "notfound" };
  if (c.status === "redeemed") return { ok: false, reason: "used" };
  if (c.status === "void") return { ok: false, reason: "void" };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < nowMs) return { ok: false, reason: "expired" };
  if (c.assignedTo && c.assignedTo !== customerId) return { ok: false, reason: "notyours" };
  if (c.minSpend && subtotal < c.minSpend) return { ok: false, reason: "minspend" };
  return { ok: true, discount: couponDiscount(c, subtotal) };
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
