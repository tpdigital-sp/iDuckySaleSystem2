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

/** 📐 หนึ่งขนาด/แบบของของแถม (ลูกค้าเลือกในตะกร้า) */
export interface GiftSize {
  /** ชื่อที่ลูกค้าเห็น เช่น "9 × 9 cm" */
  label: string;
  /** รูปตัวอย่างของขนาดนี้ (URL) — โชว์เป็นการ์ดให้ลูกค้าเลือก */
  image?: string;
  /** ได้กี่ใบต่อแผ่น A3 — ใช้คิดว่าเศษที่เหลือถึงครึ่งแผ่นไหม (0/ไม่ตั้ง = ไม่คิดเศษ ได้ครบทุกชิ้น) */
  perSheet?: number;
  /** คำอธิบายสั้น ๆ ใต้ชื่อ เช่น "ได้ 15 ใบ + ไดคัท พร้อมซองใส" */
  note?: string;
}

/**
 * 📋 เงื่อนไขที่ระบบตรวจให้เอง จากตัวเลือกที่ลูกค้าเลือกในสินค้าชิ้นนั้น
 * เช่น "อะคริลิคต้องขนาด 4 ซม. ขึ้นไป หนา 3 มม." = 2 ข้อ
 *   { label: "ขนาด", minCm: 4, cmMode: "min" }  ·  { label: "ความหนา", contains: "3" }
 * ชิ้นที่ไม่ผ่านทุกข้อ = ไม่นับเข้าโปร (ไม่ได้ของแถม) แต่ยังสั่งซื้อได้ตามปกติ
 */
export interface GiftRequire {
  /** ชื่อกลุ่มตัวเลือกที่จะดู เช่น "ขนาด" (ว่าง = ดูทุกกลุ่มของชิ้นนั้น) */
  label?: string;
  /** ค่าที่เลือกต้องมีคำนี้อยู่ เช่น "3 มม." */
  contains?: string;
  /** ขนาดที่อ่านได้ (ซม.) ต้องไม่น้อยกว่านี้ เช่น 4 */
  minCm?: number;
  /** อ่านด้านไหน — "min" = ด้านที่สั้นที่สุดต้องถึง (เข้ม) · "max" = ด้านยาวสุดถึงก็พอ */
  cmMode?: "min" | "max";
  /**
   * สินค้าที่ไม่มีกลุ่มตัวเลือกนี้เลยจะเอายังไง — "pass" (ค่าเริ่มต้น) = ปล่อยผ่าน · "fail" = ไม่นับ
   * ⚠️ ค่าเริ่มต้นเป็น pass เพราะสินค้าขนาดตายตัว (เช่น Griptok) ไม่มีกลุ่ม "ขนาด" ให้เลือก
   *    ถ้าตั้ง fail สินค้าพวกนี้จะหลุดจากโปรทั้งตัว
   */
  whenMissing?: "pass" | "fail";
}

/** 🧾 ของที่ได้แทนเมื่อเศษไม่ถึงครึ่งแผ่น A3 */
export interface GiftPartial {
  /** ชื่อของที่ได้แทน เช่น "ซองใส-หลังขาว" — ไม่ตั้ง = ไม่ใช้กติกานี้ */
  name: string;
  /** รูปของที่ได้แทน */
  image?: string;
  /** เศษต้องเต็มกี่ส่วนของแผ่นถึงจะได้ของจริง (0..1) — ไม่ตั้ง = 0.5 (ครึ่งแผ่น) */
  minFill?: number;
}

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

  /**
   * 📐 ขนาด/แบบที่ให้ลูกค้าเลือกในตะกร้า (เช่น "7 × 7 cm", "9 × 9 cm")
   * - ว่าง/ไม่ตั้ง = ของแถมไม่มีให้เลือก (เหมือนเดิม)
   * - 1 ตัว = ขนาดตายตัว โชว์เฉย ๆ ไม่มีเมนูให้กด
   * - 2 ตัวขึ้นไป = ลูกค้าเลือกเองในตะกร้า (ไม่เลือก = ใช้ตัวแรก)
   * ขนาดที่เลือกถูกเก็บลงออเดอร์ (OrderGift.size) และขึ้นบนใบงานฝ่ายแพ็ค
   */
  sizes?: GiftSize[];
  /** ชื่อกลุ่มที่ลูกค้าเห็นหน้าเมนูเลือก — ไม่ตั้ง = "ขนาด" */
  sizeLabel?: string;

  /**
   * 🎁 ของแถมชิ้นนี้คือ "สินค้าตัวไหน" ในร้าน (เช่น กระดาษรองหลัง package-backing)
   * ตั้งไว้เพื่อดึงขนาด/รูปจากสินค้าตัวนั้นมาเป็นตัวเลือกของแถมได้เลย (ปุ่มในหน้าตั้งค่า)
   * — คนละเรื่องกับ productIds/categories ที่เป็น "สินค้าที่สั่งแล้วนับเข้าโปร"
   */
  giftProductId?: string;

  /** เงื่อนไขเพิ่มเติมเป็นข้อความ (เช่น "อะคริลิคต้องขนาด 4 ซม. ขึ้นไป หนา 3 มม.") — โชว์ให้ลูกค้าเห็นในตะกร้า */
  condition?: string;

  /**
   * 🎨 ของแถมชิ้นนี้ต้อง "พิมพ์ลาย" ไหม (เช่น กระดาษรองหลัง — คนละลายกับตัวสินค้าก็ได้)
   * true = การ์ดของแถมในตะกร้ามีกล่องเลือกลาย 2 ทาง
   *        ① ใช้ลายเดียวกับสินค้าที่สั่ง (ค่าเริ่มต้น — ลูกค้าส่วนใหญ่ใช้ทางนี้ ไม่ต้องอัปซ้ำ)
   *        ② แนบไฟล์ลายอื่น → เก็บลง OrderGift.artworkUrls ขึ้นใบงานให้กราฟฟิก/ฝ่ายแพ็ค
   *
   * ⚠️ ไม่ตั้ง ≠ ปิด — อ่านค่าผ่าน giftNeedsArtwork() เสมอ เพราะโปรที่ผูกกับสินค้าจริงในร้าน
   *    (giftProductId) ถือว่าเป็นงานพิมพ์โดยปริยาย ไม่ต้องรอแอดมินไปติ๊กก่อนถึงจะใช้ได้
   */
  needArtwork?: boolean;

  /** 📋 เงื่อนไขที่ระบบตรวจให้เอง — ชิ้นที่ไม่ผ่านไม่นับเข้าโปร (ว่าง = นับทุกชิ้นของสินค้าที่เข้าโปร) */
  requires?: GiftRequire[];

  /**
   * 🧾 เศษที่ไม่เต็มแผ่น A3 ได้ของแทน
   * เช่น 9×9 ได้ 15 ใบ/แผ่น · สั่ง 20 ชิ้น → 15 ชิ้นแรกได้รองหลังพิมพ์ลาย
   * ส่วนที่เหลือ 5 ชิ้นไม่ถึงครึ่งแผ่น (ต้อง 8 ใบขึ้นไป) → ได้ "ซองใส-หลังขาว" แทน
   */
  partial?: GiftPartial;

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

/**
 * 🔑 ที่เก็บ "ขนาดของแถมที่ลูกค้าเลือก" ในเครื่องลูกค้า — ตะกร้าเขียน · หน้าชำระเงินอ่านไปส่งเข้าออเดอร์
 * (เก็บเป็น { promoId: "7 × 7 cm" })
 */
export const GIFT_SIZE_KEY = "iducky-gift-size-v1";

/** อ่านขนาดของแถมที่เลือกไว้ (ฝั่งเซิร์ฟเวอร์/อ่านไม่ได้ = {}) */
export function readGiftSizes(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const obj = JSON.parse(window.localStorage.getItem(GIFT_SIZE_KEY) || "{}") as unknown;
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (typeof v === "string" && v.trim()) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** จำขนาดของแถมที่ลูกค้าเลือก */
export function writeGiftSizes(v: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GIFT_SIZE_KEY, JSON.stringify(v));
  } catch {}
}

/**
 * 🎨 ที่เก็บ "ลายที่ลูกค้าแนบให้ของแถม" ในเครื่องลูกค้า — ตะกร้าเขียน · หน้าชำระเงินอ่านไปส่งเข้าออเดอร์
 * ({ promoId: ["https://…1.jpg", …]) · ไม่มีคีย์/ลิสต์ว่าง = ใช้ลายเดียวกับสินค้าที่สั่ง
 */
export const GIFT_ART_KEY = "iducky-gift-art-v1";

/** เพดานไฟล์ลายต่อของแถม 1 โปร (กันตะกร้า/ออเดอร์บวมจากคนแนบรัว) */
export const GIFT_ART_MAX = 10;

/**
 * ล้างลายของแถมให้เหลือเฉพาะที่ใช้ได้จริง
 * ⚠️ ใช้ทั้งฝั่งเว็บและเซิร์ฟเวอร์ — เซิร์ฟเวอร์ห้ามเชื่อค่าที่หน้าเว็บส่งมาดื้อ ๆ
 *    (รับเฉพาะลิงก์ http/https · ตัดที่ GIFT_ART_MAX รูป · ทิ้งลิงก์ยาวผิดปกติ)
 */
export function sanitizeGiftArtwork(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !Array.isArray(v)) continue;
    const urls = v
      .filter((u): u is string => typeof u === "string")
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u) && u.length <= 500)
      .slice(0, GIFT_ART_MAX);
    if (urls.length) out[id] = [...new Set(urls)];
  }
  return out;
}

/** อ่านลายของแถมที่แนบไว้ (ฝั่งเซิร์ฟเวอร์/อ่านไม่ได้ = {}) */
export function readGiftArtwork(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    return sanitizeGiftArtwork(JSON.parse(window.localStorage.getItem(GIFT_ART_KEY) || "{}"));
  } catch {
    return {};
  }
}

/** จำลายของแถมที่ลูกค้าแนบ */
export function writeGiftArtwork(v: Record<string, string[]>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GIFT_ART_KEY, JSON.stringify(v));
  } catch {}
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

/**
 * ➕ ลูกค้าสั่งเพิ่มหลังของแถมถูกคิด/ทำแบบไปแล้ว → จำนวนของแถมเพิ่ม กราฟฟิกต้องจัดแผ่น/ทำแบบเพิ่ม
 * ค้างเตือนจนกว่ากราฟฟิกจะกดรับทราบ (ackAt) — หน้าออเดอร์ · ด่านแพ็ค · ใบงาน · การ์ดบอร์ด WIP เห็นหมด
 * (OD-261006-8507 · 8 ต.ค. 69: รองหลังส่งแบบไปแล้ว 72 ใบ ลูกค้าสั่งเพิ่มเป็น 96 ไม่มีใครรู้ → ผลิตผิดจำนวนได้)
 */
export interface GiftQtyBump {
  /** เวลาที่จำนวนเพิ่ม (ISO) */
  at: string;
  /** จำนวนชุดก่อนเพิ่ม (ครั้งแรกที่ยังไม่รับทราบ — เพิ่มซ้ำอีกรอบก็ยังเทียบกับตัวนี้) */
  from: number;
  /** จำนวนชุดหลังเพิ่ม */
  to: number;
  /** บรรทัดของจริงก่อนเพิ่ม (พิมพ์/ของแทน) ไว้บอกว่าต้องทำเพิ่มกี่ใบ */
  was?: { printedQty?: number; fallbackQty?: number };
  /** กราฟฟิกรับทราบ/ทำเพิ่มแล้ว */
  ackAt?: string;
  ackBy?: string;
}

/** ของแถมที่บันทึกลงออเดอร์ (ฝ่ายแพ็คใช้จัดของ) */
export interface OrderGift {
  promoId: string;
  name: string;
  qty: number;
  /** ขนาด/แบบที่ลูกค้าเลือก (มีเฉพาะโปรที่ตั้ง sizes ไว้) */
  size?: string;
  /** ได้ของแถมจริงกี่ชิ้น (ที่เหลือได้ของแทนเพราะเศษไม่เต็มแผ่น) — ไม่ตั้ง = ได้ครบ qty */
  printedQty?: number;
  /** ได้ของแทนกี่ชิ้น + ชื่อของแทน (เช่น ซองใส-หลังขาว ×5) */
  fallbackQty?: number;
  fallbackName?: string;

  /** ของแถมชิ้นนี้ต้องพิมพ์ลาย (คัดลอกจากโปรตอนสั่ง — ใบงานใช้ตัดสินว่าจะขึ้นบรรทัดลายไหม) */
  needArtwork?: boolean;
  /**
   * 🎨 ลายที่ลูกค้าแนบมา "เฉพาะของแถมชิ้นนี้"
   * ว่าง/ไม่มี ทั้งที่ needArtwork = ลูกค้าเลือก "ใช้ลายเดียวกับสินค้าที่สั่ง"
   */
  artworkUrls?: string[];
  /**
   * 🖼 แบบงานของแถมที่ร้านส่งให้ลูกค้าตรวจ — วงจรเดียวกับแบบของสินค้า (อนุมัติ/ขอแก้ไข)
   * (import type จาก admin-data เป็น type-only จึงไม่วนลูปกับที่ admin-data import OrderGift)
   */
  proofs?: import("./admin-data").Proof[];
  /** สถานะการตรวจแบบของแถมทั้งชุด — ไม่มีค่า = ยังไม่ส่งแบบ/ยังไม่ตรวจ */
  proofStatus?: import("./admin-data").ProofStatus;
  /** คอมเมนต์จากลูกค้าเมื่อขอแก้ไขแบบของแถม */
  proofNote?: string;
  /** เวลาอัป/อัปเดตแบบของแถมล่าสุด (ISO) */
  proofUpdatedAt?: string;
  /** เวลาที่ลูกค้าอนุมัติ/ขอแก้แบบของแถมล่าสุด (ISO) — ใช้กันหน้าจอค้างทับผลตรวจ เหมือน OrderItem.proofReviewedAt */
  proofReviewedAt?: string;
  /** ➕ จำนวนเพิ่มหลังสั่งเพิ่ม — รอกราฟฟิกรับทราบ (ดู GiftQtyBump) */
  qtyBump?: GiftQtyBump;
}

/** ของแถมชิ้นนี้มีจำนวนเพิ่มที่กราฟฟิกยังไม่รับทราบไหม */
export function giftBumpPending(g: OrderGift | null | undefined): GiftQtyBump | null {
  return g?.qtyBump && !g.qtyBump.ackAt ? g.qtyBump : null;
}

/**
 * ข้อความบอกว่าต้องทำเพิ่มเท่าไร — "แพ็กเกจรองหลัง (7 × 7 cm) 72 → 96 ใบ (+24) · ซองใส-หลังขาว 8 → 4"
 * เทียบบรรทัดของจริงก่อน/หลัง (giftLinesOf) ไม่ใช่แค่จำนวนชุด เพราะเศษแผ่นทำให้ของแทนลดได้
 */
export function giftBumpLabel(g: OrderGift): string | null {
  const b = g.qtyBump;
  if (!b) return null;
  const before = giftLinesOf({ ...g, qty: b.from, printedQty: b.was?.printedQty, fallbackQty: b.was?.fallbackQty });
  const after = giftLinesOf(g);
  const labels = [...new Set([...before, ...after].map((l) => l.label))];
  return labels
    .map((label) => {
      const a = before.find((l) => l.label === label)?.qty ?? 0;
      const z = after.find((l) => l.label === label)?.qty ?? 0;
      const d = z - a;
      return `${label} ${a} → ${z}${d > 0 ? ` (+${d})` : ""}`;
    })
    .join(" · ");
}

/**
 * ของแถมชิ้นนี้ต้องถามเรื่องลายไหม
 *
 * 🐞 บั๊กที่แก้: ตอนแรกให้ค่าเริ่มต้นเป็น "ไม่ต้องถาม" แล้วรอแอดมินไปติ๊กเอง
 *    ผลคือของแถมงานพิมพ์ (รองหลัง) ไม่มีช่องแนบลายให้ลูกค้าเลย ทั้งที่ตั้งค่าอย่างอื่นครบแล้ว
 *    — โปรที่ผูกกับ "สินค้าจริงในร้าน" (giftProductId) แปลว่าเป็นของที่ร้านผลิตเอง = ต้องมีลายแน่นอน
 *    ถือเป็นค่าเริ่มต้น ส่วนแอดมินยังปิดเองได้ด้วยการติ๊กออก (เก็บเป็น false ชัดเจน)
 */
export function giftNeedsArtwork(promo: GiftPromo | null | undefined): boolean {
  if (!promo) return false;
  return promo.needArtwork ?? Boolean(promo.giftProductId?.trim());
}

/** ที่มาของลายบนของแถม 1 รายการ — null = ของแถมนี้ไม่ต้องใช้ลาย (ใบงานไม่ต้องขึ้นบรรทัดนี้) */
export function giftArtLabel(g: OrderGift): string | null {
  if (!g.needArtwork) return null;
  const n = (g.artworkUrls ?? []).length;
  if (n > 0) return `ลายเฉพาะของแถม ${n} รูป (ลูกค้าแนบมา)`;
  // 🖼 ร้านทำแบบของแถมแยกแล้ว (เช่น รองหลัง 2 ลาย) → "ใช้ลายเดียวกับสินค้า" ที่ลูกค้าเลือกตอนสั่งไม่จริงแล้ว ชวนคนแพ็คหยิบผิด
  //    ยึดแบบของแถมเป็นหลัก (OD-261002-9236 · 7 ต.ค. 69)
  const p = (g.proofs ?? []).filter((x) => x?.url).length;
  if (p > 0) return `ลายตามแบบของแถม ${p} ลายที่ทำให้ (ดูรูปแบบของแถม)`;
  return "ใช้ลายเดียวกับสินค้าที่สั่ง";
}

/**
 * 🖼 รูปของแถมที่ "ฝ่ายแพ็ค/กราฟฟิก" ต้องเห็น — แบบที่ร้านทำแล้ว (proofs) มาก่อน ไม่มีค่อยใช้ลายที่ลูกค้าแนบ
 *
 * 🐞 บั๊กที่แก้ (OD-260925-3684 · 2 ต.ค. 69): ใบงาน/หน้าแพ็คดึงแต่ artworkUrls (ลายที่ลูกค้าแนบ)
 *    ลูกค้าส่วนใหญ่เลือก "ใช้ลายเดียวกับสินค้าที่สั่ง" → ลิสต์ว่าง ทั้งที่กราฟฟิกอัปแบบรองหลังไว้ใน proofs
 *    และลูกค้าอนุมัติแล้ว → ฝ่ายแพ็คไม่เห็นรูปเลย ต้องไปเปิดหน้าออเดอร์เอง
 *    กติกาเดียวกับรายการสินค้า (coversOf/boxUnits): มีแบบใช้แบบ ไม่มีค่อยใช้ลายลูกค้า
 */
export function giftPackImages(g: OrderGift): { url: string; source: "proof" | "artwork"; review?: "อนุมัติ" | "ขอแก้ไข"; pairUrl?: string }[] {
  const proofs = (g.proofs ?? []).filter((p) => p?.url);
  if (proofs.length)
    return proofs.map((p) => ({ url: p.url, source: "proof" as const, ...(p.review ? { review: p.review } : {}), ...(p.pairUrl ? { pairUrl: p.pairUrl } : {}) }));
  return (g.artworkUrls ?? []).filter(Boolean).map((url) => ({ url, source: "artwork" as const }));
}

/**
 * 🔢 จำนวนต่อลายของของแถม (รองหลัง) — แบบของแถมไม่มีช่องจำนวนเหมือนแบบสินค้า
 *    ฝ่ายแพ็คเห็นรูป 2 ลาย ×60 แต่ไม่รู้ลายละเท่าไหร่ (OD-261002-9236 · 7 ต.ค. 69)
 *    ลำดับ: แบบของแถมที่ใส่ qty ไว้เอง → ยืมจำนวนต่อลายของรายการสินค้าที่ใช้ลายชุดเดียวกัน
 *    (จำนวนลายตรงกับรูปของแถม + ผลรวมเท่าจำนวนของแถมที่ได้จริง เท่านั้น — ไม่ตรงไม่เดา)
 * sure = ผูกจำนวนกับรูปได้แน่ (qty ในแบบเอง หรือทุกลายเท่ากัน) · ไม่ sure = รู้แค่ชุดตัวเลขตามลำดับลายสินค้า
 *    เพราะกราฟฟิกอาจอัปแบบของแถมคนละลำดับกับลายสินค้า (เคสนี้รูปแรกของแถม = ลายที่ 2 ของสินค้า)
 */
export type GiftPairItem = {
  name: string;
  artworkUrls?: string[];
  artworkBackUrls?: string[];
  artworkQty?: Record<string, number>;
  proofs?: { url: string; qty?: number }[];
};

/** แบบ/ลายสินค้าที่ของแถมจับคู่ได้ — มีแบบใช้แบบ (เลข "รูปที่" ตรงกับหน้าแพ็ค) ไม่มีค่อยใช้ลายที่ลูกค้าแนบ */
export function giftPairOptions(items: GiftPairItem[] | null | undefined): { url: string; label: string; qty?: number }[] {
  const list = (items ?? []).filter((it) => (it.proofs ?? []).length || (it.artworkUrls ?? []).length);
  return list.flatMap((it) => {
    const name = list.length > 1 ? `${it.name} ` : "";
    const proofs = (it.proofs ?? []).filter((p) => p?.url);
    if (proofs.length) return proofs.map((p, k) => ({ url: p.url, label: `${name}รูปที่ ${k + 1}`, ...(num(p.qty) > 0 ? { qty: num(p.qty) } : {}) }));
    return (it.artworkUrls ?? []).map((u, k) => ({ url: u, label: `${name}ลายที่ ${k + 1}`, ...(num(it.artworkQty?.[u]) > 0 ? { qty: num(it.artworkQty?.[u]) } : {}) }));
  });
}

/** คู่ของรูปของแถมแต่ละรูป (ลำดับเดียวกับ giftPackImages) — null = รูปนั้นยังไม่ได้จับคู่ / คู่ถูกลบไปแล้ว */
export function giftPairsOf(g: OrderGift, items: GiftPairItem[] | null | undefined): ({ url: string; label: string; qty?: number } | null)[] {
  const opts = giftPairOptions(items);
  return giftPackImages(g).map((x) => (x.pairUrl ? opts.find((o) => o.url === x.pairUrl) ?? null : null));
}

export function giftDesignQtys(
  g: OrderGift,
  items: GiftPairItem[] | null | undefined,
): { qtys: number[]; sure: boolean } | null {
  const pics = giftPackImages(g);
  if (pics.length < 2) return null;
  // 🔗 จับคู่ครบทุกรูปแล้ว → จำนวนตามแบบสินค้าที่คู่กัน (ชิ้นต่อชิ้น) ผูกกับรูปได้แน่
  const pairs = giftPairsOf(g, items);
  if (pairs.every((x) => x?.qty)) return { qtys: pairs.map((x) => x!.qty!), sure: true };
  const own = (g.proofs ?? []).filter((p) => p?.url).map((p) => num(p.qty));
  if (pics[0].source === "proof" && own.length === pics.length && own.every((q) => q > 0)) return { qtys: own, sure: true };
  if ((g.artworkUrls ?? []).length) return null; // ลายเฉพาะของแถม — ไม่มีจำนวนต่อลายให้ยืม
  const want = giftLinesOf(g)[0]?.qty ?? 0;
  const fits = (l: number[]) => l.length === pics.length && l.every((q) => q > 0) && l.reduce((a, b) => a + b, 0) === want;
  const found: number[][] = [];
  for (const it of items ?? []) {
    const fromProofs = (it.proofs ?? []).map((p) => num(p.qty)).filter((q) => q > 0);
    const back = new Set(it.artworkBackUrls ?? []);
    const fromArt = (it.artworkUrls ?? []).filter((u) => !back.has(u)).map((u) => num(it.artworkQty?.[u]));
    const l = fits(fromProofs) ? fromProofs : fits(fromArt) ? fromArt : null;
    if (l && !found.some((f) => f.join() === l.join())) found.push(l);
  }
  if (found.length !== 1) return null;
  const qtys = found[0];
  return { qtys, sure: qtys.every((q) => q === qtys[0]) };
}

/** ข้อความบรรทัดเดียวของ giftDesignQtys — "ลายละ 30 ชิ้น" / "ตามลายสินค้า: ลายที่ 1 × 40 · ลายที่ 2 × 20" */
export function giftDesignQtyLabel(d: { qtys: number[]; sure: boolean } | null): string | null {
  if (!d) return null;
  if (d.qtys.every((q) => q === d.qtys[0])) return `ลายละ ${d.qtys[0]} ชิ้น (${d.qtys.length} ลาย)`;
  const parts = d.qtys.map((q, i) => `${d.sure ? "แบบของแถมรูป" : "ลาย"}ที่ ${i + 1} × ${q}`).join(" · ");
  return d.sure ? parts : `ตามลายสินค้า: ${parts} — เทียบลายให้ตรงก่อนใส่กล่อง`;
}

/** บรรทัดสถานะแบบของแถม (ใบงาน/หน้าแพ็ค) — null = ยังไม่มีแบบ */
export function giftProofLabel(g: OrderGift): string | null {
  const n = (g.proofs ?? []).filter((p) => p?.url).length;
  if (!n) return null;
  const st = g.proofStatus === "อนุมัติ" ? "ลูกค้าอนุมัติแล้ว" : g.proofStatus === "ขอแก้ไข" ? "ลูกค้าขอแก้ไข" : "รอลูกค้าตรวจ";
  return `แบบของแถม ${n} รูป · ${st}`;
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
 * ขนาดที่ให้เลือกของโปรนี้ (ล้างตัวว่าง/ชื่อซ้ำทิ้ง)
 * รับค่าเก่าที่เป็นข้อความล้วนได้ด้วย (["7 × 7 cm"]) เผื่อข้อมูลที่ตั้งไว้ก่อนหน้า
 */
export function giftSizesOf(promo: GiftPromo | null | undefined): GiftSize[] {
  const seen = new Set<string>();
  const out: GiftSize[] = [];
  for (const raw of (promo?.sizes ?? []) as (GiftSize | string)[]) {
    const sz: GiftSize = typeof raw === "string" ? { label: raw } : { ...raw };
    const label = String(sz.label ?? "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ ...sz, label, perSheet: Math.max(0, Math.floor(num(sz.perSheet))) || undefined });
  }
  return out;
}

/**
 * ขนาดที่จะใช้จริงของของแถมชิ้นนี้
 * ⚠️ ใช้ทั้งฝั่งเว็บและเซิร์ฟเวอร์ — เซิร์ฟเวอร์ห้ามเชื่อค่าที่ลูกค้าส่งมาดื้อ ๆ
 *    (ไม่อยู่ในลิสต์ที่แอดมินตั้งไว้ = ตกกลับไปใช้ตัวแรก)
 */
export function resolveGiftSize(promo: GiftPromo, chosen?: string | null): GiftSize | undefined {
  const sizes = giftSizesOf(promo);
  if (sizes.length === 0) return undefined;
  const v = String(chosen ?? "").trim();
  return sizes.find((s) => s.label === v) ?? sizes[0];
}

/** ผลแบ่งของแถม: ได้ของจริงกี่ชิ้น · ได้ของแทนกี่ชิ้น */
export interface GiftSplit {
  /** ได้ของแถมจริง (รองหลังพิมพ์ลาย) */
  printed: number;
  /** ได้ของแทน (เศษไม่ถึงครึ่งแผ่น) */
  fallback: number;
  /** ชื่อของแทน (มีเมื่อ fallback > 0) */
  fallbackName?: string;
  /** พิมพ์กี่แผ่น A3 */
  sheets: number;
  /** ต้องมีเศษกี่ใบถึงจะได้พิมพ์ให้ (ไว้บอกลูกค้าว่า "อีก N ชิ้นได้ครบ") */
  threshold: number;
}

/**
 * 🧾 แบ่งของแถมตามแผ่น A3
 * เต็มแผ่น = ได้ของจริงทุกชิ้น · เศษที่เหลือถึงครึ่งแผ่น (หรือตาม partial.minFill) = พิมพ์ให้อีกแผ่น
 * ไม่ถึง = เศษนั้นได้ของแทน (เช่น ซองใส-หลังขาว)
 *
 * ตัวอย่าง 9×9 (15 ใบ/แผ่น) สั่ง 20 → พิมพ์ 15 · ซองใส-หลังขาว 5 (ต้องมีเศษ ≥ 8 ถึงจะพิมพ์ให้)
 */
export function splitGiftBySheet(promo: GiftPromo, size: GiftSize | undefined, earned: number): GiftSplit {
  const qty = Math.max(0, Math.floor(num(earned)));
  const per = Math.max(0, Math.floor(num(size?.perSheet)));
  const fallbackName = promo.partial?.name?.trim();
  // ไม่ได้ตั้งจำนวนต่อแผ่น หรือไม่ได้ตั้งของแทน = ได้ครบทุกชิ้นเหมือนเดิม
  if (per < 1 || !fallbackName) return { printed: qty, fallback: 0, sheets: per > 0 ? Math.ceil(qty / per) : 0, threshold: 0 };

  const fill = Math.min(1, Math.max(0, num(promo.partial?.minFill, 0) || 0.5));
  const threshold = Math.max(1, Math.ceil(per * fill));
  const full = Math.floor(qty / per);
  const rem = qty - full * per;
  const printExtra = rem > 0 && rem >= threshold;
  return {
    printed: full * per + (printExtra ? rem : 0),
    fallback: printExtra ? 0 : rem,
    ...(printExtra || rem === 0 ? {} : { fallbackName }),
    sheets: full + (printExtra ? 1 : 0),
    threshold,
  };
}

/** 🔓 ของแถม "ปลดล็อกจริง" หรือยัง + ต้องสั่งอีกเท่าไร (คิดรวมกติกาแผ่น A3 แล้ว) */
export interface GiftUnlock {
  /** ปลดล็อกแล้ว = ได้ของแถมจริงอย่างน้อย 1 ชิ้น (ไม่นับของแทนที่ได้เพราะเศษไม่เต็มแผ่น) */
  unlocked: boolean;
  /** ต้องสั่งสินค้าที่ร่วมรายการถึงกี่ชิ้นถึงจะปลดล็อก (แผ่นแรก) */
  unlockAt: number;
  /** ขาดอีกกี่ชิ้นถึงจะปลดล็อก (0 = ปลดล็อกแล้ว) */
  need: number;
  /** ความคืบหน้าไปยังจุดปลดล็อก 0..1 */
  progress: number;
  /** ปลดล็อกแล้วแต่ยังมีเศษได้ของแทน — สั่งเพิ่มอีกกี่ชิ้นถึงจะได้พิมพ์ครบทุกชิ้น (0 = ครบแล้ว/ไม่มีกติกาแผ่น) */
  moreForFull: number;
  /** ผลแบ่งตามแผ่น (ตัวเดียวกับ splitGiftBySheet) */
  split: GiftSplit;
}

/**
 * 🔓 ของแถมชิ้นนี้ปลดล็อกจริงหรือยัง — จุดตัดสินเดียวที่ทุกหน้าต้องใช้ร่วมกัน
 *
 * 🐞 ที่มา (9 ก.ย. 69): โปรรองหลังตั้ง "1 ชิ้น = 1 ใบ" ทำให้ `earned > 0` ตั้งแต่สั่งชิ้นแรก
 *    ตะกร้าเลยขึ้นการ์ดเขียว "🎉 ปลดล็อกของแถมแล้ว ×0 + ซองใส-หลังขาว ×1" ทั้งที่ลูกค้ายังไม่ได้รองหลังจริงสักใบ
 *    เจ้าของร้านให้ถือว่า "ยังไม่ปลดล็อก" จนกว่าจะได้พิมพ์จริง (เศษถึงเกณฑ์ partial.minFill ของแผ่น A3)
 *    และให้บอกลูกค้าว่าต้องสั่งครบกี่ชิ้น (เช่น 7×7 = 24 ใบ/แผ่น → "สั่งครบ 24 ชิ้น") แทนการ์ดเขียว
 *
 * โปรที่ไม่มีกติกาแผ่น (ไม่ตั้ง perSheet/ของแทน) = ปลดล็อกเมื่อ earned > 0 เหมือนเดิม
 */
export function giftUnlock(r: GiftResult, size: GiftSize | undefined): GiftUnlock {
  const split = splitGiftBySheet(r.promo, size, r.earned);
  const unlocked = split.printed > 0;

  const minQty = Math.max(1, Math.floor(num(r.promo.minQty, 1)));
  const step = Math.max(1, Math.floor(num(r.promo.step, 0) || minQty));
  const give = Math.max(1, Math.floor(num(r.promo.giveQty, 0) || 1));
  // ต้องได้ของแถมกี่ "หน่วย" ถึงจะพิมพ์แผ่นแรก (มีกติกาแผ่น = ต้องถึงเกณฑ์เศษ · ไม่มี = 1)
  const unitsFirst = Math.max(1, split.threshold);
  // แปลงหน่วยของแถม → จำนวนชิ้นที่ต้องสั่ง (earned = give × ขั้น · ขั้นแรกที่ minQty แล้วเพิ่มทุก step)
  const unlockAt = minQty + (Math.ceil(unitsFirst / give) - 1) * step;
  const need = unlocked ? 0 : Math.max(0, unlockAt - r.qty);
  const progress = unlocked ? 1 : Math.max(0, Math.min(1, r.qty / unlockAt));

  // เศษที่เหลือยังไม่ถึงเกณฑ์ → อีกกี่ชิ้นถึงจะพิมพ์ให้ครบทุกชิ้น
  const moreForFull = unlocked && split.fallback > 0 ? Math.ceil(Math.max(0, split.threshold - split.fallback) / give) * step : 0;

  return { unlocked, unlockAt, need, progress, moreForFull, split };
}

/** ตัวเลขขนาด (ซม.) ที่อ่านได้จากข้อความตัวเลือก เช่น "7 × 7 cm" → [7,7] · "5 ซม." → [5] */
function cmNumbersOf(text: string): number[] {
  const t = String(text ?? "");
  const pair = t.match(/(\d+(?:\.\d+)?)\s*(?:×|x|X|\*)\s*(\d+(?:\.\d+)?)/);
  if (pair) return [Number(pair[1]), Number(pair[2])].filter((n) => Number.isFinite(n) && n > 0);
  // ไม่ได้เขียนเป็น ก.×ส. — เอาเฉพาะตอนที่ระบุหน่วยไว้ชัด (กัน "3 มม." กลายเป็น 3 ซม.)
  if (!/(cm|ซม|เซน)/i.test(t)) return [];
  return [...t.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0);
}

const squash = (v: string) => String(v ?? "").replace(/\s+/g, "").toLowerCase();

/**
 * ชิ้นนี้ผ่านเงื่อนไขที่ระบบตรวจไหม (ดูจากตัวเลือกที่ลูกค้าเลือก)
 * มีกลุ่มนั้นแต่ค่าไม่ผ่าน = ไม่นับ · ไม่มีกลุ่มนั้นเลย = ตาม whenMissing (ค่าเริ่มต้นปล่อยผ่าน)
 */
export function giftMeetsRequires(promo: GiftPromo, selections?: Record<string, string> | null): boolean {
  const rules = (promo.requires ?? []).filter((r) => r && (r.contains?.trim() || (num(r.minCm) > 0)));
  if (rules.length === 0) return true;
  const sel = selections ?? {};
  const entries = Object.entries(sel);

  return rules.every((r) => {
    const want = squash(r.label ?? "");
    // กลุ่มที่ชื่อตรงเป๊ะก่อน (กัน "ขนาดฐาน" มาปนกับ "ขนาด") — ไม่เจอค่อยเอาแบบมีชื่อนี้อยู่ · ไม่ระบุชื่อ = ดูทุกกลุ่ม
    const exact = want ? entries.filter(([k]) => squash(k) === want) : [];
    const loose = want ? entries.filter(([k]) => squash(k).includes(want)) : entries;
    const values = (exact.length ? exact : loose).map(([, v]) => v);
    // ไม่มีกลุ่มตัวเลือกนี้ในสินค้าชิ้นนั้น (เช่น Griptok ขนาดตายตัว ไม่มีกลุ่ม "ขนาด")
    if (values.length === 0) return r.whenMissing !== "fail";

    const need = r.contains?.trim();
    if (need && !values.some((v) => squash(v).includes(squash(need)))) return false;

    const minCm = num(r.minCm);
    if (minCm > 0) {
      const ok = values.some((v) => {
        const dims = cmNumbersOf(v);
        if (dims.length === 0) return false;
        return (r.cmMode === "max" ? Math.max(...dims) : Math.min(...dims)) >= minCm;
      });
      if (!ok) return false;
    }
    return true;
  });
}

/**
 * คิดของแถมจากรายการในตะกร้า/ออเดอร์
 * @param lines รายการที่จะนับ (ตะกร้าต้องส่งเฉพาะบรรทัดที่ลูกค้าติ๊กสั่งรอบนี้)
 * @param catOf หาหมวดของสินค้าจาก id (ฝั่งเว็บใช้แคตตาล็อกในตะกร้า · ฝั่งเซิร์ฟเวอร์ดึงจากตาราง products)
 */
export function giftsFor(
  lines: { productId: string; qty: number; selections?: Record<string, string> | null }[],
  catOf: (productId: string) => string | undefined,
  promos: GiftPromo[] | null | undefined,
  now: number = Date.now()
): GiftResult[] {
  const list = activeGiftPromos(promos, now);
  if (list.length === 0) return [];

  return list.map((promo) => {
    const qty = lines.reduce(
      (s, l) =>
        s +
        (giftMatches(promo, l.productId, catOf(l.productId)) && giftMeetsRequires(promo, l.selections)
          ? Math.max(0, Math.floor(l.qty))
          : 0),
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

/**
 * เฉพาะโปรที่ได้ของแถมแล้ว → รูปแบบที่เก็บลงออเดอร์
 * @param chosenSizes ขนาดที่ลูกค้าเลือกไว้ต่อโปร ({ promoId: "7 × 7 cm" }) — ตัวไหนไม่มี/ไม่ถูกต้อง ใช้ตัวแรกของโปร
 * @param artwork ลายที่ลูกค้าแนบให้ของแถมต่อโปร — เก็บเฉพาะโปรที่ตั้ง needArtwork ไว้
 *                (ไม่ส่ง/ว่าง = ใช้ลายเดียวกับสินค้าที่สั่ง ซึ่งเป็นค่าเริ่มต้นของหน้าตะกร้า)
 */
export function giftsToOrder(
  results: GiftResult[],
  chosenSizes?: Record<string, string> | null,
  artwork?: Record<string, string[]> | null
): OrderGift[] {
  const art = sanitizeGiftArtwork(artwork ?? {});
  return results
    .filter((r) => r.earned > 0)
    .map((r) => {
      const size = resolveGiftSize(r.promo, chosenSizes?.[r.promo.id]);
      const sp = splitGiftBySheet(r.promo, size, r.earned);
      // 🔓 ยังไม่ปลดล็อกจริง (เศษไม่ถึงเกณฑ์แผ่น ได้แต่ของแทน) = ไม่บันทึกเป็นของแถม — ตรงกับที่ตะกร้า/checkout ไม่โชว์
      if (sp.printed <= 0) return null;
      const needs = giftNeedsArtwork(r.promo);
      const urls = needs ? (art[r.promo.id] ?? []) : [];
      return {
        promoId: r.promo.id,
        name: r.promo.name,
        qty: r.earned,
        ...(size ? { size: size.label } : {}),
        ...(needs ? { needArtwork: true } : {}),
        ...(urls.length ? { artworkUrls: urls } : {}),
        ...(sp.fallback > 0
          ? { printedQty: sp.printed, fallbackQty: sp.fallback, fallbackName: sp.fallbackName ?? r.promo.partial?.name }
          : {}),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);
}

/**
 * แตกของแถม 1 รายการเป็น "บรรทัดของจริงที่ต้องหยิบใส่กล่อง"
 * เช่น แพ็กเกจรองหลัง (9 × 9 cm) ×15 + ซองใส-หลังขาว ×5
 */
export function giftLinesOf(g: OrderGift): { label: string; qty: number }[] {
  const fallback = Math.max(0, Math.floor(num(g.fallbackQty)));
  const printed = fallback > 0 ? Math.max(0, Math.floor(num(g.printedQty, g.qty - fallback))) : g.qty;
  const out: { label: string; qty: number }[] = [];
  if (printed > 0) out.push({ label: `${g.name}${g.size ? ` (${g.size})` : ""}`, qty: printed });
  if (fallback > 0) out.push({ label: g.fallbackName ?? "ของแทน (เศษไม่เต็มแผ่น)", qty: fallback });
  return out;
}

/** ข้อความสรุปของแถมบรรทัดเดียว (ใบงาน/หน้าออเดอร์) */
export function giftSummary(gifts: OrderGift[] | null | undefined): string {
  return (gifts ?? [])
    .map((g) => {
      const main = `${g.name}${g.size ? ` (${g.size})` : ""} ×${g.fallbackQty ? (g.printedQty ?? g.qty) : g.qty}`;
      return g.fallbackQty ? `${main} + ${g.fallbackName ?? "ของแทน"} ×${g.fallbackQty}` : main;
    })
    .join(" · ");
}
