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
/**
 * ธง "หย่อนลงตะกร้าให้เลย" (?add=1) — ใช้คู่กับ ?s= จากปุ่ม "สั่งตามสเปคนี้" บนการ์ดราคา /p/CODE
 * หน้าสินค้าติ๊กสเปคเสร็จแล้วกดเพิ่มลงตะกร้าให้เอง แล้วพาไปหน้าตะกร้าทันที (ลูกค้าไม่ต้องกดซ้ำอีกที)
 * ถ้าสเปคยังสั่งไม่ได้ (ต้องแนบลาย/กรอกช่อง) ระบบหยุดอยู่ที่หน้าสินค้าพร้อมบอกจุดที่ติด เหมือนกดปุ่มเอง
 */
export const PRICE_LINK_ADD_PARAM = "add";

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
  /**
   * ภาพลายที่ลูกค้าวางไว้บนการ์ดราคา (/p/CODE) ก่อนกด "สั่งตามสเปคนี้"
   * เป็น URL ที่อัปขึ้นสตอเรจแล้ว — หน้าสินค้าเอามาแนบต่อให้เลย ลูกค้าไม่ต้องอัปซ้ำ
   * (ฟิลด์ใหม่แบบไม่บังคับ ลิงก์เก่าที่ไม่มีคีย์นี้ยังอ่านออกเหมือนเดิม)
   */
  a?: string[];
}

/** เพดานจำนวนลายที่ยัดมากับลิงก์ได้ — ยาวกว่านี้ URL เริ่มเสี่ยงโดนตัดกลางทาง */
const MAX_SPEC_ARTS = 10;

/**
 * กรอง URL ลายที่มากับลิงก์ให้เหลือเฉพาะที่ปลอดภัยจะเอาไปแสดง/เปิดต่อ
 * (ค่าในลิงก์ใครก็แต่งได้ — รับเฉพาะ http/https ไม่งั้น javascript: หลุดไปเป็น href ของรูปย่อ)
 */
export function sanitizeSpecArts(raw?: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const url = v.trim();
    if (!/^https?:\/\//i.test(url) || url.length > 500) continue;
    if (!out.includes(url)) out.push(url);
    if (out.length >= MAX_SPEC_ARTS) break;
  }
  return out;
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

/** ลิงก์นี้ขอให้หย่อนลงตะกร้าให้เลยไหม (?add=1) */
export function readPriceLinkAutoAdd(search: string): boolean {
  try {
    return new URLSearchParams(search).get(PRICE_LINK_ADD_PARAM) === "1";
  } catch {
    return false;
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

/**
 * 🧺 คิว "ใบราคาหลายรายการ" — /p/CODE ที่มีมากกว่า 1 รายการ
 *
 * หย่อนหลายรายการลงตะกร้าทีเดียวทำตรง ๆ ไม่ได้: ราคา/ด่านตรวจ/การรวมบรรทัดทั้งหมดอยู่ในหน้าสินค้า
 * (คิดใหม่บนการ์ด = มีสองสูตรราคาในระบบ ซึ่งจะเพี้ยนกันวันใดวันหนึ่งแน่นอน)
 * จึงพาลูกค้าเดินผ่านหน้าสินค้าทีละตัวแบบอัตโนมัติ: หน้าสินค้าติ๊กสเปค → หย่อนลงตะกร้า → ไปตัวถัดไป
 * ตัวสุดท้ายจบที่หน้าตะกร้าเหมือนใบรายการเดียว ลูกค้ากดปุ่มเดียวตั้งแต่ต้นจนจบ
 *
 * เก็บใน sessionStorage ไม่ใช่ URL — คิวยาว ๆ ต่อท้ายกันจะทำให้ที่อยู่ยาวเกินจนโดนตัดกลางทาง
 */
const BUNDLE_KEY = "iducky-pl-queue";
/** คิวที่ค้างเกินชั่วโมงถือว่าลูกค้าเลิกกลางทาง — ไม่งั้นการกดสั่งครั้งถัดไปจะโดนพาไปหน้าที่ไม่ได้ตั้งใจ */
const BUNDLE_TTL_MS = 60 * 60 * 1000;

interface BundleQueue {
  /** ใบไหน (ไว้ดูตอนแก้ปัญหา) */
  code: string;
  /** หน้าที่ยังไม่ได้เดินผ่าน */
  urls: string[];
  at: number;
}

function readQueue(): BundleQueue | null {
  try {
    const raw = sessionStorage.getItem(BUNDLE_KEY);
    if (!raw) return null;
    const q = JSON.parse(raw) as BundleQueue;
    if (!q?.urls?.length || Date.now() - (q.at ?? 0) > BUNDLE_TTL_MS) {
      sessionStorage.removeItem(BUNDLE_KEY);
      return null;
    }
    return q;
  } catch {
    return null;
  }
}

/** เริ่มเดินคิว: เก็บหน้าที่เหลือไว้ แล้วคืนหน้าแรกให้ผู้เรียกพาไป */
export function startPriceLinkBundle(code: string, urls: string[]): string | null {
  if (!urls.length) return null;
  try {
    sessionStorage.setItem(BUNDLE_KEY, JSON.stringify({ code, urls: urls.slice(1), at: Date.now() }));
  } catch {
    /* เบราว์เซอร์ปิดที่เก็บไว้ — ยังสั่งรายการแรกได้ ที่เหลือลูกค้ากดจากการ์ดต่อเอง */
  }
  return urls[0];
}

/** ยังมีรายการค้างในคิวไหม (ไม่แตะคิว) */
export function hasPriceLinkBundle(): boolean {
  return !!readQueue();
}

/** หยิบหน้าถัดไปออกจากคิว (null = จบแล้ว) */
export function takePriceLinkStop(): string | null {
  const q = readQueue();
  if (!q) return null;
  const [next, ...rest] = q.urls;
  try {
    if (rest.length) sessionStorage.setItem(BUNDLE_KEY, JSON.stringify({ ...q, urls: rest, at: Date.now() }));
    else sessionStorage.removeItem(BUNDLE_KEY);
  } catch {
    /* เขียนไม่ได้ก็ยังไปหน้าถัดไปได้ (คิวจะหมดอายุเองใน 1 ชั่วโมง) */
  }
  return next ?? null;
}

/** ทิ้งคิว — ลูกค้าถึงตะกร้าแล้ว/เลิกกลางทาง */
export function clearPriceLinkBundle(): void {
  try {
    sessionStorage.removeItem(BUNDLE_KEY);
  } catch {
    /* ไม่มีอะไรต้องทำ */
  }
}
