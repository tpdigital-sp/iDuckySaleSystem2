/**
 * ⚡ ส่วนลด "โอนไว" — ลูกค้าที่โอนก่อนร้านเริ่มผลิตได้ลดท้ายบิล
 *
 * กติกาของร้าน (เจ้าของร้านกำหนดเอง 4 ก.ย. 69):
 *   ยอดสินค้า (ก่อนค่าส่ง) ไม่เกิน 999 บาท → ลด 5 บาท
 *   ยอดสินค้าเกินกว่านั้น                → ลด 10 บาท
 *
 * ⚠️ ฐานคิดคือ "ยอดสินค้าก่อนค่าส่ง" ไม่ใช่ยอดรวมบิล — บิลสินค้า 980 + ค่าส่ง 50 = 1,030
 *    ยังได้ลดแค่ 5 บาท (ตามที่เจ้าของร้านยืนยัน)
 *
 * เดิมร้านคิดส่วนลดนี้กันเองในไลน์ ลูกค้าโอนน้อยกว่ายอดในเว็บ 5-10 บาท แล้วสลิปตกไปตรวจมือ
 * (หรือหลุดผ่านโดยระบบจดว่าเป็น "ค่าธรรมเนียมโอน" ซึ่งผิด เพราะ 5/10 บังเอิญตรงกับค่าธรรมเนียมจริง)
 * ตอนนี้เว็บคิดให้ตั้งแต่หน้า checkout และตัวตรวจสลิปรู้จักส่วนลดนี้ด้วยชื่อของมันเอง
 *
 * แยกไฟล์จาก shop-settings.ts เพราะไฟล์นั้นเป็น "use client" — ฝั่งเซิร์ฟเวอร์ (API สั่งซื้อ/ตรวจสลิป)
 * ต้องใช้กติกาเดียวกันเป๊ะ จะ import ข้ามไปไม่ได้ (แบบเดียวกับ gifts.ts / box-fee.ts)
 */

export interface EarlyPayDiscount {
  /** ปิดได้จากหน้าตั้งค่าระบบ — ปิดแล้วออเดอร์ใหม่ไม่ได้ลด และตัวตรวจสลิปก็ไม่ยอมรับส่วนต่างนี้ */
  enabled: boolean;
  /** ยอดสินค้าไม่เกินนี้ = ลดขั้นเล็ก · เกินกว่านี้ = ขั้นใหญ่ */
  threshold: number;
  /** ลดกี่บาทเมื่อยอดสินค้า ≤ threshold */
  small: number;
  /** ลดกี่บาทเมื่อยอดสินค้า > threshold */
  large: number;
}

export const DEFAULT_EARLY_PAY: EarlyPayDiscount = { enabled: true, threshold: 999, small: 5, large: 10 };

/** ชื่อที่โชว์บนบิล/ประวัติ — ใช้ตัวเดียวกันทุกที่ ให้ค้นเจอง่ายตอนกระทบยอด */
export const EARLY_PAY_LABEL = "⚡ ส่วนลดโอนไว";

/** ค่าที่ใช้จริง (ตกไปใช้ค่าเริ่มต้นถ้ายังไม่เคยตั้ง) */
export function earlyPayOf(s: { earlyPay?: Partial<EarlyPayDiscount> } | null | undefined): EarlyPayDiscount {
  const e = s?.earlyPay;
  if (!e) return DEFAULT_EARLY_PAY;
  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : fallback);
  return {
    enabled: e.enabled !== false,
    threshold: num(e.threshold, DEFAULT_EARLY_PAY.threshold),
    small: num(e.small, DEFAULT_EARLY_PAY.small),
    large: num(e.large, DEFAULT_EARLY_PAY.large),
  };
}

/**
 * ส่วนลดโอนไวเป็นบาท จาก "ยอดสินค้าก่อนค่าส่ง"
 * ไม่มีของในตะกร้า/ปิดโปรอยู่ = 0
 * บิลเล็กกว่า (หรือเท่ากับ) ส่วนลดก็ไม่ลด — กันบิลค่าสินค้าเหลือ 0 บาท
 */
export function earlyPayAmount(goodsSubtotal: number, cfg: EarlyPayDiscount = DEFAULT_EARLY_PAY): number {
  if (!cfg.enabled) return 0;
  const goods = Math.max(0, Math.round(goodsSubtotal));
  if (goods <= 0) return 0;
  const amount = goods <= cfg.threshold ? cfg.small : cfg.large;
  return amount < goods ? Math.max(0, amount) : 0;
}
