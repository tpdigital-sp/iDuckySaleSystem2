/**
 * 🎁 ของแถมฟรีตามยอดสั่ง (โปรโมชั่นร้าน)
 *
 * เช่น "สั่งพวงกุญแจ/สแตนดี้/Griptok/อะคริลิค ครบ 30 ชิ้น รับแพ็คเกจรองหลังฟรี 1 ชุด
 *       ทุก ๆ 30 ชิ้นถัดไปได้เพิ่มอีก 1"
 *
 * เก็บตั้งค่าไว้ในแถวตั้งค่าร้าน (__shop_payment__ ฟิลด์ gifts) — แอดมินแก้เองได้ที่ /admin/settings
 *
 * ⚠️ ไฟล์นี้ตั้งใจไม่ใส่ "use client" เพราะ API ฝั่งเซิร์ฟเวอร์ต้องคิดของแถมใหม่เองตอนสร้างออเดอร์
 *    (เชื่อค่าที่หน้าเว็บส่งมาไม่ได้ — วิธีเดียวกับส่วนลดระดับสมาชิก/คูปอง)
 */

export interface GiftPromo {
  id: string;
  /** ชื่อของแถมที่ลูกค้าเห็น เช่น "แพ็คเกจรองหลัง" */
  name: string;
  /** รูปของแถม (URL) — โชว์เป็นการ์ดในตะกร้าแบบร้านค้าออนไลน์ทั่วไป */
  image?: string;
  /** คำอธิบายสั้น ๆ ใต้ชื่อ เช่น "ซองใส + การ์ดรองหลังลายร้าน" */
  note?: string;
  /** มูลค่าของแถมต่อชุด (บาท) — ไว้โชว์ราคาขีดฆ่า ~~฿150~~ ฟรี · 0/ไม่ตั้ง = ไม่โชว์ */
  value?: number;

  /** หมวดสินค้าที่นับเข้าโปร (ว่าง = ไม่จำกัดหมวด) */
  categories?: string[];
  /** สินค้าเฉพาะตัวที่นับเข้าโปรเพิ่มจากหมวด (เช่น Griptok ที่อยู่ปนหมวดเคสมือถือ) */
  productIds?: string[];
  /** สินค้าที่ไม่นับ แม้จะอยู่ในหมวด/รายการข้างบน */
  excludeIds?: string[];

  /** ขั้นต่ำ (จำนวนชิ้นรวมของสินค้าที่เข้าโปรทั้งตะกร้า) */
  minQty: number;
  /** ทุก ๆ กี่ชิ้นถัดไปได้เพิ่มอีก 1 ชุด — ไม่ตั้ง = เท่ากับขั้นต่ำ */
  step?: number;
  /** ได้กี่ชิ้นต่อ 1 ขั้น — ไม่ตั้ง = 1 */
  giveQty?: number;
  /** เพดานต่อออเดอร์ — 0/ไม่ตั้ง = ไม่จำกัด */
  maxQty?: number;

  /** ปิดโปรชั่วคราวโดยไม่ต้องลบทิ้ง */
  active?: boolean;
  /** ช่วงเวลาโปร (yyyy-mm-dd) — ไม่ตั้ง = ตลอดไป */
  from?: string;
  to?: string;
}

/** ผลการคิดของแถม 1 โปร */
export interface GiftResult {
  promo: GiftPromo;
  /** จำนวนชิ้นที่เข้าเงื่อนไขตอนนี้ */
  qty: number;
  /** ได้ของแถมกี่ชิ้น (0 = ยังไม่ถึงขั้นต่ำ) */
  earned: number;
  /** ต้องสั่งถึงกี่ชิ้นจึงจะได้ (เพิ่ม) อีก 1 ขั้น — ไม่มี = เต็มเพดานแล้ว */
  nextAt?: number;
  /** ขาดอีกกี่ชิ้น (คู่กับ nextAt) */
  need?: number;
  /** ความคืบหน้าไปยังขั้นถัดไป 0..1 (ไว้วาดหลอด) */
  progress: number;
}

/** ของแถมที่บันทึกลงออเดอร์ (ฝ่ายแพ็คใช้จัดของ) */
export interface OrderGift {
  promoId: string;
  name: string;
  qty: number;
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** โปรที่ตั้งไว้และยังใช้งานได้ ณ เวลานี้ (ตัดตัวที่ปิด/หมดช่วงเวลา/ตั้งไม่ครบทิ้ง) */
export function activeGiftPromos(promos: GiftPromo[] | null | undefined, now: number = Date.now()): GiftPromo[] {
  const today = new Date(now);
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (promos ?? []).filter((p) => {
    if (!p?.id || !p.name?.trim()) return false;
    if (p.active === false) return false;
    if (num(p.minQty) < 1) return false;
    if (p.from && ymd < p.from) return false;
    if (p.to && ymd > p.to) return false;
    return true;
  });
}

/** สินค้าตัวนี้นับเข้าโปรนี้ไหม */
export function giftMatches(promo: GiftPromo, productId: string, category: string | undefined): boolean {
  if ((promo.excludeIds ?? []).includes(productId)) return false;
  if ((promo.productIds ?? []).includes(productId)) return true;
  const cats = promo.categories ?? [];
  if (cats.length === 0) return (promo.productIds ?? []).length === 0; // ไม่ระบุอะไรเลย = ทั้งร้าน
  return !!category && cats.includes(category);
}

/**
 * คิดของแถมจากรายการในตะกร้า/ออเดอร์
 * @param lines รายการที่จะนับ (ตะกร้าต้องส่งเฉพาะบรรทัดที่ลูกค้าติ๊กสั่งรอบนี้)
 * @param catOf หาหมวดของสินค้าจาก id (ฝั่งเว็บใช้แคตตาล็อกในตะกร้า · ฝั่งเซิร์ฟเวอร์ดึงจากตาราง products)
 */
export function giftsFor(
  lines: { productId: string; qty: number }[],
  catOf: (productId: string) => string | undefined,
  promos: GiftPromo[] | null | undefined,
  now: number = Date.now()
): GiftResult[] {
  const list = activeGiftPromos(promos, now);
  if (list.length === 0) return [];

  return list.map((promo) => {
    const qty = lines.reduce(
      (s, l) => s + (giftMatches(promo, l.productId, catOf(l.productId)) ? Math.max(0, Math.floor(l.qty)) : 0),
      0
    );
    const minQty = Math.max(1, Math.floor(num(promo.minQty, 1)));
    const step = Math.max(1, Math.floor(num(promo.step, 0) || minQty));
    const per = Math.max(1, Math.floor(num(promo.giveQty, 0) || 1));
    const max = Math.max(0, Math.floor(num(promo.maxQty, 0)));

    const steps = qty < minQty ? 0 : 1 + Math.floor((qty - minQty) / step);
    let earned = steps * per;
    let capped = false;
    if (max > 0 && earned > max) {
      earned = max;
      capped = true;
    }

    // ขั้นถัดไปอยู่ที่กี่ชิ้น (เต็มเพดานแล้ว = ไม่ต้องชวนซื้อเพิ่ม)
    const nextAt = capped || (max > 0 && earned + per > max) ? undefined : minQty + steps * step;
    const need = nextAt != null ? Math.max(0, nextAt - qty) : undefined;
    const base = steps === 0 ? 0 : minQty + (steps - 1) * step;
    const span = steps === 0 ? minQty : step;
    const progress = nextAt == null ? 1 : Math.max(0, Math.min(1, (qty - base) / span));

    return { promo, qty, earned, nextAt, need, progress };
  });
}

/** เฉพาะโปรที่ได้ของแถมแล้ว → รูปแบบที่เก็บลงออเดอร์ */
export function giftsToOrder(results: GiftResult[]): OrderGift[] {
  return results
    .filter((r) => r.earned > 0)
    .map((r) => ({ promoId: r.promo.id, name: r.promo.name, qty: r.earned }));
}

/** ข้อความสรุปของแถมบรรทัดเดียว (ใบงาน/หน้าออเดอร์) */
export function giftSummary(gifts: OrderGift[] | null | undefined): string {
  return (gifts ?? []).map((g) => `${g.name} ×${g.qty}`).join(" · ");
}
