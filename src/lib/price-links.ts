/**
 * 🔗 ลิงก์ราคาแบบสั้น (เฟส 2) — /p/K7M2Q
 *
 * ต่างจากลิงก์ยาว `?s=…` (เฟส 1) ตรงที่ "แช่ราคาไว้" ในฐานข้อมูล:
 *   · ลิงก์สั้นพอที่จะวางในไลน์ได้สวย
 *   · ราคาที่ลูกค้าเห็น = ราคาวันที่แอดมินเสนอ ต่อให้ร้านปรับตารางราคาทีหลัง
 *   · มีวันหมดอายุ (ยืนราคาถึงเมื่อไร) และปิดลิงก์ได้
 *   · นับได้ว่าลูกค้าเปิดดูหรือยัง
 *
 * ลิงก์ยาวยังใช้อยู่ 2 ที่: ปุ่ม "สั่งตามสเปคนี้" บนการ์ด (พาไปหน้าสินค้าพร้อมติ๊กให้)
 * และเป็นตัวสำรองเวลายังไม่ได้รัน supabase/price-links.sql
 */
import type { PriceLinkSpec } from "./price-link";

export interface PriceLink {
  /** โค้ดสั้นบน URL — /p/<code> */
  code: string;
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
