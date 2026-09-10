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
 * ⚠️ เฉพาะ "ออเดอร์ราคาปลีกล้วน" เท่านั้น (เจ้าของร้านสั่ง 10 ก.ย. 69): มีบรรทัดที่เข้าเรทขายส่งแล้ว
 *    (จำนวนถึงขั้นต่ำของเรท เช่น สแตนดี้ 34 ชิ้น) แม้แต่บรรทัดเดียว = ทั้งใบไม่ได้ส่วนลดนี้ —
 *    ได้ราคาส่งไปแล้ว ไม่ลดซ้ำ (เจ้าของร้านยืนยันเคสปน สแตนดี้ 34 + พรมเช็ดเท้า 1 = ไม่ลด · ดู earlyPayBase)
 *
 * แยกไฟล์จาก shop-settings.ts เพราะไฟล์นั้นเป็น "use client" — ฝั่งเซิร์ฟเวอร์ (API สั่งซื้อ/ตรวจสลิป)
 * ต้องใช้กติกาเดียวกันเป๊ะ จะ import ข้ามไปไม่ได้ (แบบเดียวกับ gifts.ts / box-fee.ts)
 */

import { activeRate, publicRates, repriceCartGroups, tierIndex, type Product } from "@/lib/products";

export interface EarlyPayDiscount {
  /** ปิดได้จากหน้าตั้งค่าระบบ — ปิดแล้วออเดอร์ใหม่ไม่ได้ลด และตัวตรวจสลิปก็ไม่ยอมรับส่วนต่างนี้ */
  enabled: boolean;
  /** ยอดสินค้าไม่เกินนี้ = ลดขั้นเล็ก · เกินกว่านี้ = ขั้นใหญ่ */
  threshold: number;
  /** ลดกี่บาทเมื่อยอดสินค้า ≤ threshold */
  small: number;
  /** ลดกี่บาทเมื่อยอดสินค้า > threshold */
  large: number;
  /**
   * ⏳ ต้องแจ้งโอนภายในกี่นาทีหลังสั่งซื้อ (เจ้าของร้านสั่ง 10 ก.ย. 69: เกิน 1 ชั่วโมงให้ส่วนลดหายไป)
   * 0 = ไม่จำกัดเวลา · ค่าที่ใช้จริงถูกแช่เป็น Order.earlyPay.expiresAt ตอนสร้างออเดอร์ (แก้ตั้งค่าทีหลังไม่กระทบใบเก่า)
   */
  windowMinutes: number;
}

export const DEFAULT_EARLY_PAY: EarlyPayDiscount = { enabled: true, threshold: 999, small: 5, large: 10, windowMinutes: 60 };

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
    windowMinutes: num(e.windowMinutes, DEFAULT_EARLY_PAY.windowMinutes),
  };
}

/** เวลาหมดอายุส่วนลด (ISO) นับจากตอนสั่ง — ไม่จำกัดเวลา = undefined */
export function earlyPayExpiresAt(cfg: EarlyPayDiscount, now: Date = new Date()): string | undefined {
  const m = Math.max(0, Math.round(cfg.windowMinutes));
  return m > 0 ? new Date(now.getTime() + m * 60_000).toISOString() : undefined;
}

/** "1 ชั่วโมง" · "1 ชม. 30 นาที" · "45 นาที" · ไม่จำกัด = "" */
export function earlyPayWindowText(cfg: EarlyPayDiscount): string {
  const m = Math.max(0, Math.round(cfg.windowMinutes));
  if (!m) return "";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} นาที`;
  return r ? `${h} ชม. ${r} นาที` : `${h} ชั่วโมง`;
}

/** 1 บรรทัดสินค้าที่ใช้คิดฐานส่วนลดโอนไว (ตะกร้า/ออเดอร์ใช้ร่วมกัน) */
export interface EarlyPayLine {
  productId: string;
  /** ตัวเลือกที่เลือก — ใช้ตัดสินเรทที่ล็อกไว้ (hardMinQty) · ไม่มี = {} */
  selections?: Record<string, string>;
  qty: number;
  /** ยอดเงินของบรรทัดนี้ (ราคา × จำนวน + ค่าคละ ฯลฯ) */
  amount: number;
  /** เรทที่ตะกร้ารวมล็อตสรุปให้แล้ว (CartItem.merged.rateLabel) — 6+6 รวมเป็น 12 = เข้าเรทส่ง */
  mergedRateLabel?: string;
  /** จำนวนรวมทั้งล็อตที่ตะกร้ารวมให้ (CartItem.merged.totalQty) — ใช้เทียบช่วงราคาแทนจำนวนของบรรทัดเดียว */
  mergedTotalQty?: number;
}

/**
 * บรรทัดนี้ "ได้เรทราคาส่ง" แล้วหรือยัง — กติกาเจ้าของร้าน (10 ก.ย. 69) ได้ราคาส่งแล้วไม่ต้องลดโอนไวซ้ำ
 *
 * ส่ง = จำนวน (รวมล็อตถ้าตะกร้ารวมให้) ตกเลย "ช่วงราคาแรก" ของตารางราคา (tierIndex > 0 เช่น 1-10 → 11-29)
 *   หรือเลือก/ถูกจัดเข้า "เรทขั้นสูง" — เรทที่มีขั้นต่ำ และสินค้ามีเรทอื่นที่เริ่มต่ำกว่าให้เลือก (สแตนดี้เรท 2 เริ่ม 50
 *   ขณะที่เรท 1 เริ่ม 11) แล้วจำนวนถึงจริง
 * ⚠️ "ขั้นต่ำสั่ง" ไม่ใช่ "เรทส่ง": สินค้าเรทเดียวที่ขั้นต่ำ = ช่วงราคาแรก (โฟโต้การ์ด PVC ขั้นต่ำ 5 ใบ ช่วง 5-49 ·
 *   สติ๊กเกอร์ UV 3 แผ่น ช่วง 3-9) สั่งเท่าขั้นต่ำยังเป็นปลีก — OD-260910-5703 เคยไม่ได้ลดเพราะถือ minQty เป็นส่ง
 * ⚠️ ไม่ใช้ isRetailRateLine (กติกากล่อง/ค่าส่ง) — ตัวนั้นถือว่าเรทที่ไม่มี minQty เป็น "ส่ง" ตั้งแต่ชิ้นแรก
 *   ทำให้สินค้าราคาเดียว/เรทเดียวไม่มีขั้นต่ำ 83 ตัว (ปฏิทิน · เสื้อ · กระเป๋า …) ไม่ได้ส่วนลดเลย (OD-260910-7269)
 * สินค้าไม่มีตารางราคา = ราคาเดียว = ปลีก
 */
export function isWholesaleLine(
  p: Product,
  selections: Record<string, string>,
  qty: number,
  merged?: { rateLabel?: string; totalQty?: number }
): boolean {
  const rs = publicRates(p);
  const rate = (merged?.rateLabel ? rs.find((r) => r.label === merged.rateLabel) : undefined) ?? activeRate(p, selections);
  const effQty = Math.max(qty, merged?.totalQty ?? 0);
  // เรทที่เป็น "ทางเลือกเชิงโครงสร้าง" (hardMinQty เช่น สติ๊กเกอร์ UV ขายเป็นแผ่น A3 / ตร.ม.) หรือขั้นต่ำต่อรอบผลิต (lot)
  // ไม่ใช่ขั้นบันไดจำนวน — ตัดสินจากช่วงราคาอย่างเดียว
  if (rate && !rate.dealerOnly && !p.hardMinQty && rate.minQtyScope !== "lot" && (rate.minQty ?? 1) > 1 && effQty >= (rate.minQty ?? 1)) {
    // เรทขั้นสูง = มีเรท public อื่นที่เริ่มต่ำกว่า (ลูกค้าเลือกเรทที่ต้องสั่งเยอะกว่าเพื่อราคาที่ถูกกว่า)
    const lowerEntry = rs.some((r) => r !== rate && (r.minQty ?? 1) < (rate.minQty ?? 1));
    if (lowerEntry) return true;
  }
  const matrix = rate?.pricing ?? p.pricing;
  if (!matrix?.tiers?.length) return false;
  return tierIndex(matrix, effQty) > 0;
}

/**
 * ฐานคิดส่วนลดโอนไว = ยอดรวมทุกบรรทัด **เฉพาะเมื่อทุกบรรทัดยังเป็นราคาปลีก** (ดู isWholesaleLine)
 * มีบรรทัดที่เข้าเรทส่งแม้แต่บรรทัดเดียว = คืน 0 ทั้งใบ — ได้ราคาส่งไปแล้ว ไม่ลดซ้ำ (กติกาเจ้าของร้าน 10 ก.ย. 69)
 * สินค้าไม่มีเรท/หาสินค้าไม่เจอ (งานพิเศษ) = นับเป็นปลีก
 *
 * mergeLots: ฝั่งเซิร์ฟเวอร์ไม่มี merged.rateLabel จากตะกร้า → รวมล็อตใหม่ด้วยกติกาเดียวกับตะกร้า
 * (repriceCartGroups) ให้บรรทัด 6+6 ชิ้นของสินค้าเดียวกันถูกมองเป็นเรทส่ง 12 ชิ้นเหมือนที่ลูกค้าเห็น
 */
export function earlyPayBase(
  lines: EarlyPayLine[],
  productOf: (id: string) => Product | undefined,
  opts?: { mergeLots?: boolean }
): number {
  let merged: ({ rateLabel?: string; totalQty?: number } | undefined)[] = lines.map((l) =>
    l.mergedRateLabel || l.mergedTotalQty ? { rateLabel: l.mergedRateLabel, totalQty: l.mergedTotalQty } : undefined
  );
  if (opts?.mergeLots) {
    try {
      const priced = repriceCartGroups(
        lines.map((l) => ({ productId: l.productId, selections: l.selections ?? {}, qty: l.qty })),
        productOf
      );
      merged = priced.map((r, i) => (r.merged ? { rateLabel: r.merged.rateLabel, totalQty: r.merged.totalQty } : merged[i]));
    } catch {
      // รวมล็อตพัง = คิดรายบรรทัดตามเดิม (ปลอดภัยกว่าสั่งซื้อไม่สำเร็จ)
    }
  }
  const allRetail = lines.every((l, i) => {
    const p = productOf(l.productId);
    return !p || !isWholesaleLine(p, l.selections ?? {}, l.qty, merged[i]);
  });
  if (!allRetail) return 0;
  return lines.reduce((sum, l) => sum + Math.max(0, l.amount), 0);
}

/**
 * ส่วนลดโอนไวเป็นบาท จาก "ยอดสินค้าก่อนค่าส่ง" — ส่งยอดจาก earlyPayBase() มา (เฉพาะบรรทัดราคาปลีก)
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
