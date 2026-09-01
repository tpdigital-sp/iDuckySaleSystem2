/**
 * 🔗 ลิงก์ราคา — แอดมินตั้งสเปคให้ลูกค้าที่หน้าสินค้า แล้วส่ง "ลิงก์ที่ติ๊กไว้ให้แล้ว" ไปทางไลน์
 *
 * ทำไมไม่ใช้ screenshot: ภาพกดสั่งต่อไม่ได้ ลูกค้าต้องทักกลับมาถามอีกรอบ
 * ลิงก์นี้เปิดแล้วเห็นสเปค/จำนวน/ราคาเดียวกันเป๊ะ และกด "เพิ่มลงตะกร้า" ได้ทันที
 *
 * ⚠️ ราคาบนลิงก์เป็น "ราคาสด" — ร้านปรับตารางราคาเมื่อไหร่ ลิงก์เก่าก็เปลี่ยนตาม
 *    (เฟสถัดไปค่อยทำลิงก์สั้น + แช่ราคา + วันหมดอายุ)
 *
 * รูปแบบ: /products/<id>?s=<base64url ของ JSON>
 * เก็บเป็น "ชื่อกลุ่ม → ชื่อตัวเลือก" ไม่ใช่เลขลำดับ — แอดมินสลับลำดับตัวเลือกทีหลังแล้ว
 * ลิงก์เก่าจะ "ตกไปเฉย ๆ" (ค่าที่ไม่รู้จักถูกทิ้ง) ไม่ใช่ชี้ผิดตัวแบบเงียบ ๆ
 */
import {
  INPUT_MAX_LEN,
  MTO_LABEL,
  MTO_ON,
  isInputOption,
  isMultiOption,
  joinMultiPicks,
  selectedPicks,
  type Product,
} from "./products";

/** ชื่อพารามิเตอร์บน URL */
export const PRICE_LINK_PARAM = "s";

export interface PriceLinkSpec {
  /** เวอร์ชันของรูปแบบ — เผื่อเปลี่ยนโครงทีหลังแล้วลิงก์เก่ายังอ่านออก */
  v: 1;
  /** ตัวเลือกที่ติ๊กไว้ (ชื่อกลุ่ม → ค่า) */
  s: Record<string, string>;
  /** จำนวนที่สั่ง */
  q?: number;
  /** เรทราคาที่เลือกอยู่ */
  r?: string;
  /** จำนวนลายที่คละ */
  d?: number;
  /** จำนวนลายด้านหลัง (งานพิมพ์ 2 ด้าน) */
  b?: number;
  /** งานกำหนดขนาดเอง — กว้าง/ยาวที่กรอกไว้ (เก็บเป็นข้อความตามที่พิมพ์) */
  c?: { w: string; h: string };
}

/** JSON → base64url (รองรับภาษาไทย — ชื่อตัวเลือกเป็นไทยเกือบทั้งหมด) */
function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(code: string): string {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodePriceLink(spec: PriceLinkSpec): string {
  return toB64Url(JSON.stringify(spec));
}

export function decodePriceLink(code: string): PriceLinkSpec | null {
  if (!code) return null;
  try {
    const obj = JSON.parse(fromB64Url(code)) as PriceLinkSpec;
    if (!obj || obj.v !== 1 || typeof obj.s !== "object") return null;
    return obj;
  } catch {
    // ลิงก์ถูกตัดกลางทาง/พิมพ์ตกหล่น = เปิดหน้าสินค้าปกติ ดีกว่าขึ้นหน้าพัง
    return null;
  }
}

/** อ่านลิงก์ราคาจาก query string ของหน้าที่เปิดอยู่ */
export function readPriceLink(search: string): PriceLinkSpec | null {
  try {
    return decodePriceLink(new URLSearchParams(search).get(PRICE_LINK_PARAM) ?? "");
  } catch {
    return null;
  }
}

/**
 * กรองตัวเลือกจากลิงก์ให้เหลือเฉพาะที่ "มีอยู่จริงในสินค้าตอนนี้"
 *
 * ลิงก์เก่ากับสินค้าที่แอดมินแก้ไปแล้วต้องไม่ทำให้ลูกค้าได้สเปคผี — ค่าที่ไม่รู้จักทิ้งทั้งดุ้น
 * แล้วปล่อยให้ค่าเริ่มต้นของกลุ่มนั้นทำงานแทน (resolveSelections จัดกฎเงื่อนไขต่อให้อีกชั้น)
 */
export function sanitizeSpecSelections(product: Product, raw?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const opt of product.options ?? []) {
    const v = raw[opt.label];
    if (typeof v !== "string" || !v.trim()) continue;
    // ช่องกรอก: ค่าเป็นข้อความอิสระอยู่แล้ว (ความถูกต้องมี inputError ตรวจให้ตอนกดสั่ง)
    if (isInputOption(opt)) {
      out[opt.label] = v.trim().slice(0, INPUT_MAX_LEN);
      continue;
    }
    // กลุ่มติ๊กหลายอย่าง: splitMultiPicks ทิ้งชื่อที่ไม่มีในกลุ่มให้เอง
    if (isMultiOption(opt)) {
      const picks = selectedPicks(opt, { [opt.label]: v });
      if (picks.length) out[opt.label] = joinMultiPicks(picks);
      continue;
    }
    if (opt.choices.some((c) => c.name === v)) out[opt.label] = v;
  }
  if (raw[MTO_LABEL] === MTO_ON) out[MTO_LABEL] = MTO_ON;
  return out;
}

/** ลิงก์เต็มของสเปคนี้ (ตัด query/hash เดิมทิ้ง เหลือแต่พารามิเตอร์ราคา) */
export function priceLinkUrl(href: string, spec: PriceLinkSpec): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(PRICE_LINK_PARAM, encodePriceLink(spec));
  return url.toString();
}
