/**
 * 🔗 ลิงก์ราคาแบบสั้น (เฟส 2) — /p/K7M2Q
 *
 * ต่างจากลิงก์ยาว `?s=…` (เฟส 1) ตรงที่ "แช่ราคาไว้" ในฐานข้อมูล:
 *   · ลิงก์สั้นพอที่จะวางในไลน์ได้สวย
 *   · ราคาที่ลูกค้าเห็น = ราคาวันที่แอดมินเสนอ ต่อให้ร้านปรับตารางราคาทีหลัง
 *   · มีวันหมดอายุ (ยืนราคาถึงเมื่อไร) และปิดลิงก์ได้
 *   · นับได้ว่าลูกค้าเปิดดูหรือยัง
 *
 * ลิงก์ยาวยังใช้อยู่ 2 ที่: ปุ่ม "สั่งตามสเปคนี้" บนการ์ด (พาไปหน้าสินค้าพร้อมติ๊กให้ + &add=1 หย่อนลงตะกร้าให้เลย)
 * และเป็นตัวสำรองเวลายังไม่ได้รัน supabase/price-links.sql
 */
import type { PriceLinkSpec } from "./price-link";

/**
 * 🧾 หนึ่ง "รายการ" บนใบราคา — สินค้าตัวหนึ่งพร้อมสเปค/จำนวน/ราคาที่แช่ไว้
 * ใบเดียวมีได้หลายรายการ (ลูกค้าสั่งสติ๊กเกอร์ + กล่องในงานเดียวกัน จะได้ไม่ต้องส่งลิงก์หลายใบ)
 */
export interface PriceLinkItem {
  productId: string;
  /** ทางเข้าหน้าสินค้า (slug ถ้ามี ไม่งั้นเป็น id) */
  productPath: string;
  productName: string;
  imageSrc?: string;
  /** สเปคที่ติ๊กไว้ — ใช้เปิดหน้าสินค้าต่อให้ลูกค้า */
  spec: PriceLinkSpec;
  /** บรรทัดสเปคที่แช่ไว้ตอนเสนอ (หัวข้อ, ค่า) — การ์ดอ่านจากตรงนี้ ไม่คิดใหม่ */
  lines: [string, string][];
  qty: number;
  /** หน่วยขาย ("ชิ้น" / "แผ่น A3") */
  unit: string;
  unitPrice: number;
  total: number;
  /** งานที่ยังไม่รู้ราคา (รอแอดมินตีราคา) — การ์ดไม่โชว์ตัวเลข */
  askPrice?: boolean;
}

export interface PriceLink extends PriceLinkItem {
  /** โค้ดสั้นบน URL — /p/<code> */
  code: string;
  /**
   * ใบหลายรายการ — รายการทั้งหมดอยู่ตรงนี้ (ใบรายการเดียวไม่มีคีย์นี้)
   *
   * ⚠️ ฟิลด์สินค้าด้านบน (productName/qty/spec/…) ยังคงเป็น "รายการแรก" เสมอ
   *    ใบเก่า/ตัวอ่านเก่า (การ์ดในแชท, บอทตอบลูกค้า) จึงยังอ่านออกเหมือนเดิม
   *    ส่วน total ของใบหลายรายการ = ยอดรวมทั้งใบ (ไม่ใช่ของรายการแรก)
   *    อ่านผ่าน priceLinkItems() / priceLinkTotal() เสมอ อย่าอ่านฟิลด์บนตรง ๆ
   */
  items?: PriceLinkItem[];
  /** ข้อความจากแอดมินถึงลูกค้า (ไม่บังคับ) */
  note?: string;
  createdBy: string;
  createdAt: string;
  /** ยืนราคาถึงเมื่อไร (ISO) */
  expiresAt: string;
  /** ปิดลิงก์เอง (ลูกค้าเลือกแบบอื่นไปแล้ว) */
  closed?: boolean;
  /** ลูกค้าเปิดดูกี่ครั้ง + ครั้งล่าสุดเมื่อไร */
  opened?: number;
  lastOpenedAt?: string;
}

/**
 * รายการทั้งหมดบนใบ — ใบรายการเดียว (และใบเก่าทุกใบ) คืนรายการเดียวที่ประกอบจากฟิลด์บน
 * ทุกจอที่โชว์ใบราคาอ่านผ่านตัวนี้ จะได้ไม่ต้องเขียนเงื่อนไข "ใบเก่า/ใบใหม่" ซ้ำทุกที่
 */
export function priceLinkItems(l: PriceLink): PriceLinkItem[] {
  if (l.items?.length) return l.items;
  return [
    {
      productId: l.productId,
      productPath: l.productPath,
      productName: l.productName,
      ...(l.imageSrc ? { imageSrc: l.imageSrc } : {}),
      spec: l.spec,
      lines: l.lines ?? [],
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      total: l.total,
      ...(l.askPrice ? { askPrice: true } : {}),
    },
  ];
}

/** ใบนี้มีมากกว่า 1 รายการไหม */
export function priceLinkIsBundle(l: PriceLink): boolean {
  return (l.items?.length ?? 0) > 1;
}

/** ยอดรวมทั้งใบ (บวกทุกรายการ) */
export function priceLinkTotal(l: PriceLink): number {
  return priceLinkItems(l).reduce((s, i) => s + (i.askPrice ? 0 : i.total), 0);
}

/** มีรายการที่ยังต้องให้ร้านตีราคาอยู่ไหม */
export function priceLinkHasAsk(l: PriceLink): boolean {
  return priceLinkItems(l).some((i) => i.askPrice);
}

/** ชื่อใบที่เอาไปโชว์ได้เลย ("สติ๊กเกอร์ PVC + อีก 2 รายการ") */
export function priceLinkTitle(l: PriceLink): string {
  const items = priceLinkItems(l);
  return items.length > 1 ? `${items[0].productName} + อีก ${items.length - 1} รายการ` : items[0].productName;
}

/** จำนวนรายการสูงสุดต่อใบ — ยาวกว่านี้ลูกค้าอ่านการ์ดไม่ไหว และคิวเปิดหน้าสินค้าก็ยาวเกินไป */
export const PRICE_LINK_MAX_ITEMS = 10;

/** อายุลิงก์เริ่มต้น (วัน) — ยืนราคา 1 อาทิตย์ */
export const PRICE_LINK_DAYS = 7;

/**
 * ตัวอักษรที่ใช้ทำโค้ด — ตัด 0/O/1/I/L ออก เพราะลูกค้าต้องอ่าน/พิมพ์ตามจากภาพได้
 *
 * 5 หลัก = 31^5 ≈ 28 ล้านแบบ — สั้นที่สุดเท่าที่ยังปลอดภัย
 * (สั้นกว่านี้เดาสุ่มเปิดดูราคาที่เสนอลูกค้าคนอื่นได้ · ชนกันก็ไม่เป็นไร ตอนสร้างสุ่มใหม่ให้อยู่แล้ว)
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LEN = 5;

export function newPriceLinkCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** ใบนี้หมดอายุแล้วหรือยัง */
export function priceLinkExpired(l: Pick<PriceLink, "expiresAt">): boolean {
  return new Date(l.expiresAt).getTime() < Date.now();
}

/** สถานะที่เอาไปโชว์ได้เลย */
export function priceLinkStatus(l: PriceLink): "ใช้ได้" | "ปิดแล้ว" | "หมดอายุ" {
  if (l.closed) return "ปิดแล้ว";
  return priceLinkExpired(l) ? "หมดอายุ" : "ใช้ได้";
}

/** เหลืออีกกี่วัน (ติดลบ = เลยมาแล้ว) */
export function daysLeft(l: Pick<PriceLink, "expiresAt">): number {
  return Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86_400_000);
}

/** วันที่แบบไทยสั้น ๆ ("5 ก.ย. 2569") */
export function thaiDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

/**
 * 🧺 "ใบรวม" ที่แอดมินกำลังสะสมอยู่ — เก็บโค้ดใบเดี่ยวไว้ในเครื่อง (localStorage)
 *
 * ทำไมต้องมี: สเปค/ราคาของแต่ละสินค้าคิดที่หน้าสินค้าของตัวเองเท่านั้น แอดมินจึงต้องเดินไป
 * ทีละหน้าสินค้าอยู่ดี — ปุ่ม "เพิ่มเข้าใบรวม" ที่หน้าสินค้าจึงเก็บโค้ดใบไว้ให้ระหว่างทาง
 * แล้วค่อยกดคัดลอกลิงก์ใบรวมทีเดียวตอนจบ (ไม่ต้องเข้าหลังบ้านไปติ๊กรวมทีหลัง)
 *
 * เก็บแค่ "โค้ดใบ" ไม่ใช่ราคา — ราคาจริงแช่อยู่ในใบแต่ละใบในฐานข้อมูลแล้ว
 */
const BASKET_KEY = "iducky-pl-basket";
/** ใบรวมที่ค้างข้ามวันถือว่าลืม — ไม่งั้นวันรุ่งขึ้นกดคัดลอกแล้วได้ของลูกค้าคนเมื่อวานติดไปด้วย */
const BASKET_TTL_MS = 24 * 60 * 60 * 1000;

export function readPriceLinkBasket(): string[] {
  try {
    const raw = localStorage.getItem(BASKET_KEY);
    if (!raw) return [];
    const b = JSON.parse(raw) as { codes?: string[]; at?: number };
    if (!b?.codes?.length || Date.now() - (b.at ?? 0) > BASKET_TTL_MS) {
      localStorage.removeItem(BASKET_KEY);
      return [];
    }
    return b.codes.slice(0, PRICE_LINK_MAX_ITEMS);
  } catch {
    return [];
  }
}

/** ใส่ใบเข้าใบรวม (ใบเดิมใส่ซ้ำไม่ได้) — คืนรายการล่าสุดเสมอ */
export function addToPriceLinkBasket(code: string): string[] {
  const cur = readPriceLinkBasket();
  if (!code || cur.includes(code) || cur.length >= PRICE_LINK_MAX_ITEMS) return cur;
  const next = [...cur, code];
  try {
    localStorage.setItem(BASKET_KEY, JSON.stringify({ codes: next, at: Date.now() }));
  } catch {
    /* เขียนไม่ได้ = ใช้ทางเดิม (ติ๊กรวมที่หน้า /admin/price-links) ได้อยู่ */
  }
  return next;
}

export function clearPriceLinkBasket(): void {
  try {
    localStorage.removeItem(BASKET_KEY);
  } catch {
    /* ไม่มีอะไรต้องทำ */
  }
}
