import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getProductServer } from "@/lib/products-server";
import { SITE_URL } from "@/lib/shop-info";
import {
  formatPrice,
  mixFeePerUnit,
  mixTierFor,
  needsQuote,
  productPath,
  RATE_LABEL,
  tierIndex,
  unitPriceFor,
  type PriceMatrix,
  type Product,
} from "@/lib/products";

/**
 * 🧮 สมองราคาของร้าน — "เจ้าของราคาเพียงเจ้าเดียว"
 *
 * ทำไมต้องมี: ก่อนหน้านี้ราคาที่ลูกค้าเห็นถูกคิดจาก 4 ที่ที่ไม่รู้จักกัน
 *   1) Code node 50,000 ตัวอักษรใน n8n (webhook /pricing-search) — บอทเว็บ + บอท LINE ใช้
 *   2) chat.html ของ AdminBuddy
 *   3) chat-parse/chat-context ของเว็บ
 *   4) unitPriceFor() ที่ "ตะกร้าใช้คิดเงินจริง"
 * ลูกค้าถามราคาเดียวกันคนละช่องทางจึงได้คนละคำตอบ (เจอจริง: บอทเสนอ PHOTOCARD PVC 22 บาท/ใบ
 * ทั้งที่เว็บไม่มีสินค้าตัวนั้น) ไฟล์นี้ย้ายความจริงมาไว้ที่ (4) ตัวเดียว แล้วเปิดให้ทุกช่องทางเรียก
 * ผ่าน /api/pricing/search ซึ่งตอบด้วย "รูปร่างเดียวกับ webhook เดิม" ของ n8n เป๊ะ
 * → สลับ tool search_pricing ใน n8n ให้ชี้มาที่นี่ได้เลย โดยไม่ต้องแก้ system prompt สักบรรทัด
 *
 * ยังไม่ตัดของเก่าทิ้ง: หาสินค้าบนเว็บไม่เจอ/สินค้าไม่มีตารางราคา → ส่งต่อไป n8n ตัวเดิม
 * (source: "n8n-fallback") ความครอบคลุมจึงไม่ลดลงเลยตั้งแต่วันแรก
 */

/** ปลายทางเดิมของ n8n — ใช้เมื่อเว็บตอบเองไม่ได้ (ตั้งทับได้ด้วย env) */
const N8N_PRICING = process.env.PRICING_SEARCH_FALLBACK_URL || "https://n8n.iduckybot.com/webhook/pricing-search";

/** รายชื่อสินค้าอ่านซ้ำทุกคำถามสิ้นเปลือง — แอดมินแก้นาน ๆ ครั้ง */
const TTL_MS = 5 * 60_000;

/** พิมพ์ตารางยาวเกินลูกค้าไม่อ่าน — จำกัดคอลัมน์/เรทที่โชว์ */
const MAX_COLUMNS = 6;
const MAX_RATES = 3;

/** คะแนนจับคู่ชื่อสินค้าขั้นต่ำ — ต่ำกว่านี้ถือว่าไม่มั่นใจ ส่งต่อ n8n ดีกว่าเดาผิด */
const MIN_SCORE = 10;

export type PriceKind = "price" | "price-options" | "info" | "skip";

/**
 * 🔗🖼 สินค้าหนึ่งตัวในรูปที่ "ทุกช่องทาง" เอาไปแปะลิงก์/รูปได้ทันที
 * url = หน้าสินค้าบนเว็บจริง · image = ภาพปกสินค้าบนเว็บ (imageSrc) — บอท LINE/AdminBuddy ใช้ชุดนี้แทน
 * ลิงก์ราคา+รูปที่เคยเก็บแยกไว้ใน Firestore price_links (ไม่ผูกกับเว็บ อัปเดตแล้วไม่ตาม)
 */
export interface ProductRef {
  id: string;
  name: string;
  url: string;
  image?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
}

export interface PriceAnswer {
  answer: string;
  kind: PriceKind;
  source: string;
  intent: string;
  /** สินค้าที่จับคู่ได้ (ให้ผู้เรียกแนบลิงก์เองได้) */
  product?: ProductRef;
  /** ทุกสินค้าที่คำตอบนี้พูดถึง (เมนู/หลายสินค้า/ขั้นต่ำ) — เรียงตามลำดับในคำตอบ */
  products?: ProductRef[];
}

interface Lite {
  id: string;
  name: string;
  slug?: string;
  imageSrc?: string;
  /** คำอธิบายสั้น (ไว้เช็ควัสดุที่ไม่อยู่ในชื่อ เช่น แก้วมัค = เซรามิก) */
  desc?: string;
  category: string;
  /** ช่วงราคาที่เซิร์ฟเวอร์คำนวณไว้ตอนบันทึกสินค้า — ใช้ทำเมนูโดยไม่ต้องโหลดตารางเต็ม */
  priceMin?: number;
  priceMax?: number;
}

let cache: { at: number; items: Lite[] } | null = null;
let inflight: Promise<Lite[]> | null = null;

function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

/** รายชื่อสินค้าที่ลูกค้าเห็นได้ (ไม่ซ่อน + ไม่ใช่แถวตั้งค่าร้าน __…) */
async function loadLite(): Promise<Lite[]> {
  const sb = supa();
  if (!sb) return [];
  const { data } = await sb
    .from("products")
    .select(
      "id, category, name:data->>name, slug:data->>slug, hidden:data->>hidden, priceMin:data->>priceMin, priceMax:data->>priceMax, imageSrc:data->>imageSrc, desc:data->>description",
    );
  return (data ?? [])
    .filter((r) => r.id && r.name && !String(r.category ?? "").startsWith("__") && r.hidden !== "true")
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: r.slug ?? undefined,
      imageSrc: absImage(r.imageSrc),
      desc: typeof r.desc === "string" ? r.desc.slice(0, 400) : undefined,
      category: String(r.category ?? ""),
      priceMin: r.priceMin ? Number(r.priceMin) : undefined,
      priceMax: r.priceMax ? Number(r.priceMax) : undefined,
    }));
}

/** ภาพสินค้าเป็น URL เต็มเสมอ — ภาพที่เก็บเป็นพาธในเว็บ (/images/…) ต้องเติมโดเมน ไม่งั้นบอทนอกเว็บเปิดไม่ได้ */
function absImage(src: unknown): string | undefined {
  const s = typeof src === "string" ? src.trim() : "";
  if (!s || s.startsWith("data:")) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `${SITE_URL}${s.startsWith("/") ? "" : "/"}${s}`;
}

/**
 * 🔗 ลิงก์สินค้าสำหรับบอท — slug ภาษาไทยกลายเป็น %E0%B8… ยาว 5 บรรทัดในไลน์ (เจ้าของร้านเห็น 23 ก.ย. 69)
 * หน้าสินค้าเปิดด้วย id ได้อยู่แล้ว → slug ที่ไม่ใช่ ASCII ใช้ id แทน (สั้น อ่านออก) · slug อังกฤษใช้ตามเดิม
 */
function botUrl(p: { id: string; slug?: string }): string {
  const slug = (p.slug ?? "").trim();
  if (slug && /^[\x20-\x7e]+$/.test(slug)) return `${SITE_URL}${productPath(p)}`;
  return `${SITE_URL}/products/${encodeURIComponent(p.id)}`;
}

function refOf(it: Lite): ProductRef {
  return {
    id: it.id,
    name: it.name,
    url: botUrl(it),
    image: it.imageSrc,
    category: it.category || undefined,
    priceMin: it.priceMin,
    priceMax: it.priceMax,
  };
}

/**
 * 📚 แคตตาล็อกสินค้าที่ลูกค้าเห็นได้ทั้งร้าน (ชื่อ/ลิงก์/รูป/ช่วงราคา) — ให้บอทนอกเว็บ (AdminBuddy, n8n)
 * โหลดครั้งเดียวแล้วใช้จับคู่ลิงก์+รูปเอง แทนคลัง price_links ใน Firestore ที่ต้องมาคอยอัปเดตมือ
 */
export async function catalogRefs(): Promise<ProductRef[]> {
  return (await catalog().catch(() => [])).map(refOf);
}

/**
 * 📝 สินค้าที่ "มีในระบบแต่ยังไม่เผยแพร่" (hidden = ฉบับร่าง ยังไม่ใส่ราคา/รูป) — บอทเคยตอบ "ร้านไม่มีพวงกุญแจหนังปัก"
 * ทั้งที่มีร่าง "พวงกุญแจหนังปักลาย" อยู่ (เจ้าของร้านแจ้ง 24 ก.ย. 69) → ต้องตอบว่า "มี แต่ราคายังไม่ขึ้นเว็บ ทักแอดมินตีราคา"
 */
let draftCache: { at: number; items: { id: string; name: string }[] } | null = null;
async function drafts(): Promise<{ id: string; name: string }[]> {
  if (draftCache && Date.now() - draftCache.at < TTL_MS) return draftCache.items;
  const sb = supa();
  if (!sb) return [];
  try {
    const { data } = await sb.from("products").select("id, category, name:data->>name, hidden:data->>hidden");
    const items = (data ?? [])
      .filter((r) => r.id && r.name && !String(r.category ?? "").startsWith("__") && r.hidden === "true")
      .map((r) => ({ id: String(r.id), name: String(r.name) }));
    draftCache = { at: Date.now(), items };
    return items;
  } catch {
    return draftCache?.items ?? [];
  }
}

/** ชื่อสินค้าฉบับร่างที่ตรงกับสิ่งที่ลูกค้าถาม (เทียบตัวอักษร ≥6 ตัวและ ≥60% ของชื่อ หรือชื่อครอบคำที่ถาม) */
export async function findDraftProduct(text: string): Promise<{ id: string; name: string } | null> {
  const t = norm(text);
  if (t.length < 4) return null;
  let best: { id: string; name: string; score: number } | null = null;
  for (const d of await drafts()) {
    const n = norm(d.name);
    const l = lcsLen(t, n);
    const ok = n.includes(t) || t.includes(n) || (l >= 6 && l >= n.length * 0.6);
    if (ok && (!best || l > best.score)) best = { ...d, score: l };
  }
  return best ? { id: best.id, name: best.name } : null;
}

async function catalog(): Promise<Lite[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.items;
  inflight ??= loadLite()
    .then((items) => {
      cache = { at: Date.now(), items };
      return items;
    })
    .catch(() => cache?.items ?? [])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** ตัดช่องว่าง/วรรคตอนออกให้เทียบกันได้ — ไทยไม่มีเว้นวรรคระหว่างคำ เทียบดิบ ๆ จะพลาด */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s​]+/g, "")
    .replace(/[()[\]{}/,._+*'"|·–—-]/g, "");
}

/**
 * สตริงย่อยที่ยาวที่สุดที่ตรงกัน (LCS แบบต่อเนื่อง) — วิธีเดียวกับที่ n8n ใช้
 * คืนตำแหน่งใน b ด้วย เพราะ "ตรงตั้งแต่ต้นชื่อสินค้า" มีน้ำหนักกว่าตรงกลาง ๆ ชื่อมาก
 */
function lcsAt(a: string, b: string): { len: number; at: number } {
  let best = 0;
  let at = -1;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) {
        best = k;
        at = j;
      }
    }
  }
  return { len: best, at };
}

export function lcsLen(a: string, b: string): number {
  return lcsAt(a, b).len;
}

/**
 * จำนวนที่ลูกค้าบอก — "100 ชิ้น" "50 ใบ" "สั่ง 30" · ไม่พบคืน null
 * ตัดเลขที่ติดหน่วยขนาดออก (5cm, 300 แกรม, A3) ไม่งั้น "อะคริลิค 5cm" จะกลายเป็นสั่ง 5 ชิ้น
 */
export function parseQty(text: string): number | null {
  const cleaned = text
    .replace(/\d+(\.\d+)?\s*(cm|มม|มิล|ซม|นิ้ว|inch|mm|แกรม|g|กรัม|ไมครอน|x|×)/gi, " ")
    .replace(/a\s?[0-9]/gi, " ");
  const m = cleaned.match(/(\d[\d,]*)\s*(ชิ้น|ใบ|อัน|แผ่น|เซ็ต|ชุด|ตัว|คู่|เล่ม|ผืน|กล่อง|พวง)/);
  if (m) {
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const alone = cleaned.match(/(?:สั่ง|ทำ|เอา|ผลิต)\s*(\d[\d,]*)/);
  if (alone) {
    const n = Number(alone[1].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** คำถามนี้ถามราคาไหม — ใช้ตัดสินว่าจะตอบด้วยตารางราคาหรือปล่อยผ่าน */
export function isPriceIntent(text: string): boolean {
  return /ราคา|เท่าไห?ร่|กี่บาท|เรท|ค่าทำ|price|cost|rate|ถูกสุด|แพง|ลดราคา|ส่ง(ราคา|เรท)/i.test(text);
}

/**
 * ถามสเปก (ขนาด/สี/วัสดุ/ตัวเลือก) ไม่ใช่ถามราคา
 *
 * ⚠️ "สแตนดี้มีขนาดเท่าไหร่บ้าง" มีคำว่า "เท่าไหร่" จึงติดกับดัก isPriceIntent
 * แล้วบอทตอบช่วงราคากลับไปแทนที่จะบอกขนาด (ลูกค้าเจอจริง) — ต้องเช็คคำที่บอกว่าเป็นเรื่องเงิน
 * แยกต่างหาก ถ้าไม่มีคำพวกนั้นเลยแปลว่าเขาถามสเปก
 */
export function isSpecIntent(text: string): boolean {
  if (/ราคา|กี่บาท|บาท|เรท|ค่าทำ|price|cost/i.test(text)) return false;
  // "อยากได้ที่ติดรถยนต์" ไม่ใช่คำถามความรู้ — ตัด "อยากได้/ต้องการ" ออกก่อน ไม่งั้น "ได้ที่" ไปชนกฎด้านล่าง (เจอจริง 23 ก.ย. 69)
  text = text.replace(/อยากได้|อยากทำ|อยากสั่ง|ต้องการ|สนใจ/g, " ");
  /**
   * ⚠️ คำถาม "ทำได้ไหม/ใช้กับอะไรได้" เป็นคำถามความรู้ ไม่ใช่ถามตัวเลือกของสินค้าตัวใดตัวหนึ่ง
   * เช่น "งานเคลือบฟอย เคลือบได้ที่กระดาษความหนาเท่าไหร่บ้าง" — ประธานคือ "งานเคลือบฟอย"
   * แต่ระบบไปจับคำว่า "กระดาษ/ความหนา" แล้วยัดเมนูสินค้ากระดาษให้ (ลูกค้าเจอจริง)
   * คำถามแบบนี้ต้องปล่อยไปให้คลังความรู้ของ n8n ตอบ
   */
  if (/ได้ไหม|ได้บ้าง|ได้ที่|ได้กับ|ใช้กับ|รองรับ|ทำได้|เคลือบได้|พิมพ์ได้|สั่งได้|ต้องใช้|เหมาะ/i.test(text)) return false;
  // "ร้านใช้ค่าสีอะไรในการสกรีน" = ถามวิธีทำงาน/ไฟล์ ไม่ใช่ถามตัวเลือกสินค้า — คำว่า "สี" หลอกให้เป็นสเปก (เจอจริง 23 ก.ย. 69 ได้เมนูหมวกกลับไป)
  if (/ค่าสี|โหมดสี|ระบบสี|cmyk|rgb|dpi|ความละเอียด|ไฟล์|ใช้\S{0,6}อะไร|ทำยังไง|อย่างไร|ขั้นตอน|วิธี/i.test(text)) return false;
  return /ขนาด|ไซ(ส์|ซ)|กี่ซม|กี่นิ้ว|กี่มิล|สี|เฉด|วัสดุ|เนื้อ|ความหนา|หนากี่|ทรง|แบบไหน|มีแบบ|ตัวเลือก|อะไรบ้าง/i.test(
    text,
  );
}

/** คำในชื่อสินค้าที่ใช้จับคู่ได้ — ตัดคำสั้น/คำกลาง ๆ ที่ไม่ได้บอกว่าเป็นสินค้าอะไร */
function nameTokens(item: Lite): string[] {
  return `${item.name} ${item.slug ?? ""}`
    .split(/[\s()[\]{}/|,+·–—-]+/)
    .map(norm)
    .filter((t) => t.length >= 3 && !/^(the|and|set|pcs|new|pro|mm|cm)$/.test(t));
}

/**
 * หาสินค้าที่ตรงกับคำถามที่สุด — ยึด "ชื่อสินค้า" เท่านั้น (คำอธิบายมีคำกลาง ๆ เยอะ จับมั่วง่าย)
 *
 * ⚠️ ห้ามให้คะแนนด้วย LCS ล้วน ๆ: ไทยไม่เว้นวรรค คำถาม "โฟโต้การ์ด PVC" จะไปตรงกับ
 * "Frame Card (การ์ดใส)" เพราะมีคำว่า "การ์ด" ร่วมกัน แล้วตอบราคาผิดตัวแบบหน้าตาย
 * → ต้องมี "คำเต็มในชื่อสินค้า" โผล่ในคำถามอย่างน้อยหนึ่งคำก่อน ถึงจะนับว่าตรง
 * ไม่ผ่านเกณฑ์ = ปล่อยให้ตกไป fallback ดีกว่าเดาผิด
 */
function resolve(query: string, items: Lite[]): { item: Lite; score: number }[] {
  const q = norm(query);
  if (!q) return [];
  return items
    .map((item) => {
      /**
       * เทียบแบบ "ตรงบางส่วนก็นับ" ทั้งสองทาง — ลูกค้าพูดสั้นกว่าชื่อสินค้าเสมอ
       * ("พวงกุญแจ" ต้องเข้ากับสินค้าชื่อ "พวงกุญแจอะคริลิค") ถ้าบังคับให้คำเต็มในชื่อ
       * ต้องโผล่ในคำถาม สินค้าตัวหลักจะได้ 0 คะแนน แล้วแพ้สินค้าพ่วงที่บังเอิญมีคำนั้น
       * แยกเป็นคำของตัวเอง เช่น "สแตนดี้ + พวงกุญแจ" (เจอจริงตอนลูกค้าถาม "พวงกุญแจ")
       */
      const tokenScore = nameTokens(item)
        .map((t) => lcsLen(q, t))
        .filter((n) => n >= 4)
        .reduce((s, n) => s + n, 0);
      const hay = norm(`${item.name} ${item.slug ?? ""}`);
      const whole = lcsAt(q, norm(item.name));
      // ตรงตั้งแต่ตัวอักษรแรกของชื่อ = สินค้าตัวนั้นคือ "หัวเรื่อง" ที่ลูกค้าถาม ไม่ใช่ของพ่วง
      const leadBonus = whole.at === 0 && whole.len >= 4 ? whole.len * 2 : 0;
      return { item, score: tokenScore ? tokenScore * 2 + lcsLen(q, hay) + leadBonus : 0 };
    })
    .filter((x) => x.score >= MIN_SCORE)
    // คะแนนเท่ากันให้ชื่อสั้นชนะ — ชื่อกว้างกว่าคือตัวที่ลูกค้าน่าจะหมายถึง (ยังไม่ได้ระบุรุ่นย่อย)
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length)
    .slice(0, 5);
}

/**
 * 📦 ตารางขั้นต่ำของทั้งร้าน — ดึงเฉพาะ minQty ของแต่ละเรท (0.6 MB / 0.6 วิ) แล้วแคชไว้
 *
 * ทำไมต้องมี: ถาม "สั่งขั้นต่ำกี่ชิ้น" แล้ว agent ของ n8n ตอบว่า "ส่วนใหญ่ไม่มีขั้นต่ำ สั่ง 1 ชิ้นได้"
 * ซึ่งตรงข้ามกับของจริงบนเว็บ (สินค้า 143 จาก 213 ตัวมีขั้นต่ำ · ส่วนใหญ่ 11 ชิ้น)
 * ลูกค้าเชื่อแล้วมาสั่ง 1 ชิ้นจะเจอปัญหาหน้างาน — ข้อมูลนี้อยู่ใน priceRates ของเว็บอยู่แล้ว
 */
interface MinRow {
  id: string;
  name: string;
  url: string;
  image?: string;
  /** ขั้นต่ำต่ำสุดของสินค้านี้ (0 = ไม่มีขั้นต่ำ) */
  min: number;
  unit: string;
  /** ขั้นต่ำรายเรท เผื่อสินค้ามีหลายเรทคนละขั้นต่ำ (หน่วยนับก็คนละหน่วยได้ เช่น แผ่น A3 / ตร.ม.) */
  rates: { label: string; min: number; unit: string }[];
  /** ขั้นต่ำนับรวมทั้งล็อตผลิต (คละแบบในล็อตเดียวกันได้) */
  lot: boolean;
}

let minCache: { at: number; rows: MinRow[] } | null = null;

async function minTable(): Promise<MinRow[]> {
  if (minCache && Date.now() - minCache.at < 30 * 60_000) return minCache.rows;
  const sb = supa();
  if (!sb) return [];
  try {
    const { data } = await sb
      .from("products")
      .select(
        "id, category, name:data->>name, slug:data->>slug, hidden:data->>hidden, rates:data->priceRates, hardMin:data->>hardMinQty, imageSrc:data->>imageSrc",
      );
    const rows = (data ?? [])
      .filter((r) => r.id && r.name && !String(r.category ?? "").startsWith("__") && r.hidden !== "true")
      .map((r) => {
        // 🤝 ตัดเรทตัวแทนจำหน่าย (dealerOnly) — เส้นตอบขั้นต่ำเป็นสาธารณะ เรท minQty 1 ของตัวแทน
        // จะทำให้บอทตอบ "สั่ง 1 ชิ้นได้" ทั้งที่ลูกค้าทั่วไปสั่งไม่ได้
        const rawRates = ((r.rates ?? []) as {
          label?: string;
          minQty?: number;
          minQtyScope?: string;
          dealerOnly?: boolean;
          pricing?: { unit?: string };
        }[]).filter((x) => !x?.dealerOnly);
        const rates = rawRates.map((x) => ({
          label: x?.label ?? "",
          min: Number(x?.minQty ?? 0) || 0,
          unit: x?.pricing?.unit || "ชิ้น",
        }));
        const hard = Number(r.hardMin ?? 0) || 0;
        const mins = rates.map((x) => x.min).filter((n) => n > 0);
        return {
          id: String(r.id),
          name: String(r.name),
          url: botUrl({ id: String(r.id), slug: (r as { slug?: string }).slug }),
          image: absImage((r as { imageSrc?: unknown }).imageSrc),
          min: hard || (mins.length === rates.length && mins.length ? Math.min(...mins) : 0),
          unit: rawRates[0]?.pricing?.unit || "ชิ้น",
          rates,
          lot: rawRates.some((x) => x?.minQtyScope === "lot"),
        };
      });
    minCache = { at: Date.now(), rows };
    return rows;
  } catch {
    return minCache?.rows ?? [];
  }
}

/** ถามเรื่องขั้นต่ำ */
export function isMinQtyIntent(text: string): boolean {
  return /ขั้นต่ำ|ขั้นตำ่|อย่างน้อยกี่|น้อยสุดกี่|(สั่ง|ทำ|เอา)\s*1\s*(ชิ้น|อัน|ใบ|แผ่น|ตัว|ผืน|เล่ม|เซ็ต|ชุด)|minimum|min\s*order/i.test(
    text,
  );
}

/** ตอบเรื่องขั้นต่ำ — เจาะจงสินค้า = บอกตัวเลขจริง · ถามกว้าง = สรุปทั้งร้านตามข้อมูลจริง */
export async function searchMinQty(query: string, pick?: Pick): Promise<PriceAnswer> {
  const rows = await minTable();
  if (!rows.length) return { answer: "", kind: "skip", source: "no-data", intent: "min_qty" };

  const { items } = await candidates(query, pick);
  const picked = items.map((it) => rows.find((r) => r.id === it.id)).filter((r): r is MinRow => !!r);

  if (picked.length && picked.length <= 4) {
    const lines = picked.map((r) => {
      const capped = r.rates.filter((x) => x.min > 0);
      const free = r.rates.filter((x) => !x.min);
      const lot = r.lot ? " (ขั้นต่ำนับรวมทั้งล็อต คละแบบในล็อตเดียวกันได้)" : "";

      // ⚠️ สินค้าหลายตัว "เรทปลีกสั่ง 1 ชิ้นได้ แต่เรทส่งต้อง 50 ชิ้น" — ตอบแค่ "ไม่มีขั้นต่ำ"
      // คือคำตอบครึ่งเดียว ลูกค้าที่อยากได้ราคาส่งจะเข้าใจผิด ต้องบอกให้ครบทั้งสองฝั่ง
      if (!capped.length) return `• ${r.name}: ไม่มีขั้นต่ำ สั่ง 1 ${r.unit} ก็ได้ครับ\n  ${r.url}`;
      const detail = capped.map((x) => `${x.label || "เรทราคา"} ขั้นต่ำ ${x.min} ${x.unit}`).join(" · ");
      const freeText = free.length
        ? `\n  ${free.map((x) => `${x.label || "เรทปลีก"} สั่งได้ตั้งแต่ 1 ${x.unit}`).join(" · ")}`
        : "";
      return `• ${r.name}: ${detail}${lot}${freeText}\n  ${r.url}`;
    });
    const refs = picked.map((r) => ({ id: r.id, name: r.name, url: r.url, image: r.image }));
    return {
      answer: lines.join("\n"),
      kind: "info",
      source: "web-price-engine",
      intent: "min_qty",
      product: refs[0],
      products: refs,
    };
  }

  // ถามกว้าง ๆ → สรุปจากของจริงทั้งร้าน ห้ามเหมารวมว่า "ไม่มีขั้นต่ำ"
  // ขั้นต่ำ 1 = ไม่มีขั้นต่ำในทางปฏิบัติ นับรวมฝั่งเดียวกันจะได้ไม่งงว่า "ขั้นต่ำ 1 ชิ้น"
  const none = rows.filter((r) => r.min <= 1);
  const some = rows.filter((r) => r.min > 1);
  const tally = new Map<number, number>();
  some.forEach((r) => tally.set(r.min, (tally.get(r.min) ?? 0) + 1));
  const common = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const examples = none.slice(0, 4).map((r) => r.name);

  return {
    answer:
      `ขั้นต่ำไม่เท่ากันครับ ขึ้นกับสินค้าและเรทราคาที่เลือก\n` +
      `• สินค้าที่มีขั้นต่ำ ${some.length} รายการ — ที่พบบ่อยคือ ${common.map(([m, n]) => `${m} ชิ้น (${n} รายการ)`).join(" · ")}\n` +
      `• สินค้าที่ไม่มีขั้นต่ำ สั่ง 1 ชิ้นได้ ${none.length} รายการ เช่น ${examples.join(" · ")}\n` +
      `บอกสินค้าที่สนใจมาได้เลยครับ เดี๋ยวเช็คขั้นต่ำให้ตรงตัว`,
    kind: "info",
    source: "web-price-engine",
    intent: "min_qty",
  };
}

/**
 * 🤖 ให้ AI เลือกสินค้าจาก "รายชื่อจริงในระบบ" — วิธีหลักของการจับคู่
 *
 * ทำไมไม่ใช้การเทียบตัวอักษรอย่างเดียว: ไทยไม่เว้นวรรค + ชื่อสินค้าปนอังกฤษ ทำให้จูนเท่าไหร่ก็ผิด
 * เคสที่เจอจริงตอนทดสอบ — "โฟโต้การ์ด PVC" → Frame Card · "ที่รองแก้ว" → แก้วสแตนเลส ·
 * "พวงกุญแจ" → พวงกุญแจกล่องดนตรี · และ "ที่รองแก้ว" ที่ในระบบชื่อ "Quicksand Coaster"
 * ซึ่งไม่มีตัวอักษรตรงกันสักตัว การเทียบสตริงจึงหาไม่มีวันเจอ
 *
 * คืน null เมื่อไม่มีคีย์/ล้มเหลว → ผู้เรียกใช้การเทียบตัวอักษรแทน (ระบบไม่พังทั้งเส้น)
 */
/**
 * 🧠 ชั้น "เข้าใจคำถาม" — LLM อ่านข้อความล่าสุด + ข้อความก่อนหน้าของลูกค้า แล้วสรุปเป็นโครงสร้างเดียว
 * (ประเภทคำถาม · สินค้าที่หมายถึงรวมจากบริบท · จำนวน · คำถามฉบับสมบูรณ์ในตัวเอง)
 *
 * ทำไมต้องมี (23 ก.ย. 69 เจ้าของร้านสั่ง "เพิ่มความฉลาดให้บอท"): ก่อนหน้านี้ตัดสินด้วย regex หลายชั้น
 * (isPriceIntent/isSpecIntent/productQueryAllowed/…) แก้ทีละเคสไม่จบ — "เอาแบบกันฝนค่ะ" ต่อจาก "ที่ติดรถยนต์"
 * ต้องรู้ว่าหมายถึงแม่เหล็กติดรถยนต์ · "ร้านใช้ค่าสีอะไร" ไม่ใช่ถามสินค้า · "ตัวนี้ 50 ชิ้น" ต้องดูบริบท
 * ชั้นนี้ตอบคำถามพวกนั้นในคำเดียว แล้ว regex เดิมเหลือเป็นตัวสำรองตอนไม่มีคีย์/หมดเวลา
 */
export interface Understanding {
  intent: "price" | "spec" | "minqty" | "mix" | "knowledge" | "order" | "chitchat" | "followup" | "other";
  /** ชื่อสินค้าในร้าน (ตรงกับแคตตาล็อก) ที่ลูกค้าหมายถึง — รวมที่อนุมานจากบริบท */
  products: string[];
  ids: string[];
  broad: boolean;
  qty: number | null;
  /** คำถามเขียนใหม่ให้ครบในตัวเอง (ใส่ชื่อสินค้าจากบริบทให้แล้ว) */
  standalone: string;
  confidence: number;
  /** ลูกค้าถามหาสินค้าที่ร้าน "ไม่มี" (พวงกุญแจหนังปัก) — ห้ามยัดเมนูหมวดใกล้เคียงให้เฉย ๆ ต้องบอกตรง ๆ + เสนอตัวใกล้เคียง */
  notInCatalog: boolean;
  /** สิ่งที่ลูกค้าเรียก (ตามคำลูกค้า) เมื่อ notInCatalog */
  requested: string;
  /** สินค้าใกล้เคียงที่พอเสนอแทนได้ (ชื่อ/ไอดีตรงแคตตาล็อก) */
  alternatives: ProductRef[];
}

const understandCache = new Map<string, { at: number; u: Understanding }>();

export async function understand(query: string, context: string[] = []): Promise<Understanding | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  const q = query.trim();
  if (!apiKey || !q) return null;
  const ctx = context.map((c) => String(c ?? "").trim()).filter(Boolean).slice(-5);
  const key = `${ctx.join("\u0001")}\u0002${q}`;
  const hit = understandCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.u;

  const items = await catalog().catch(() => []);
  if (!items.length) return null;
  const list = items.map((it) => `- ${it.name}`).join("\n");
  const ctxText = ctx.length ? ctx.map((c, i) => `${i + 1}. ${c}`).join("\n") : "(ไม่มี)";
  const prompt = `คุณเป็นแอดมินร้านพิมพ์/ผลิตของพรีเมียมตามสั่ง (iDucky) อ่านข้อความล่าสุดของลูกค้าให้เข้าใจ "เจตนา" จริง ๆ แล้วสรุปเป็น JSON เท่านั้น

ข้อความก่อนหน้าของลูกค้า (เก่า→ใหม่):
${ctxText}

ข้อความล่าสุด: "${q}"

รายการสินค้าทั้งหมดในร้าน:
${list}

ตอบ JSON:
{"intent":"price|spec|minqty|mix|knowledge|order|chitchat|followup|other","products":["ชื่อสินค้าคัดลอกจากรายการตรงตัว"],"broad":true/false,"qty":ตัวเลขหรือnull,"standalone":"คำถามฉบับสมบูรณ์ในตัวเอง","notInCatalog":true/false,"requested":"สิ่งที่ลูกค้าเรียก","alternatives":["ชื่อสินค้าใกล้เคียงจากรายการ ไม่เกิน 3"],"confidence":0-1}

ความหมายของ intent:
- price = ถามราคา/เรท/ค่าทำ หรือบอกจำนวนที่จะสั่งของสินค้าที่รู้แล้วว่าตัวไหน
- spec = ถามตัวเลือกของสินค้าที่ระบุชัด (ขนาด สี วัสดุ มีแบบไหนบ้าง)
- minqty = ถามขั้นต่ำ/สั่งน้อย ๆ ได้ไหม
- mix = ถามกติกาคละลาย/คละแบบของสินค้า (คละได้ไหม คละได้กี่ลาย นับเป็นกี่ลาย ลายละกี่ชิ้น ด้านหลังคละได้ไหม) — ใส่ products ของสินค้าที่พูดถึง (รวมจากบริบท)
- knowledge = ถามความรู้/วิธีทำงาน/ไฟล์/ค่าสี/ระยะเวลาผลิต/การจัดส่ง/นโยบาย/รับทำไหม (ไม่ต้องการราคา)
- order = ติดตามออเดอร์/ชำระเงิน/สลิป/เคลม/แก้ไขงาน
- chitchat = ทักทาย ขอบคุณ ตอบรับสั้น ๆ
- followup = พูดต่อจากบริบทโดยไม่เอ่ยสินค้า และบริบทก็ยังบอกไม่ได้ว่าสินค้าตัวไหน
- other = อื่น ๆ
กติกา:
- ถ้าข้อความล่าสุดพูดต่อจากบริบท (เช่น "เอาแบบกันฝนค่ะ" หลังถาม "ที่ติดรถยนต์") ให้ใช้บริบทหาสินค้า แล้วตั้ง intent ตามสิ่งที่ถามจริง (price/spec) ไม่ใช่ followup
- products ต้องคัดลอกชื่อจากรายการตรงตัวอักษร เลือกเฉพาะที่ลูกค้าหมายถึงจริง ไม่ชัดเจน = [] · หมวดกว้าง (พวงกุญแจ/สแตนดี้) = ใส่ทุกตัวที่เข้าข่าย (สูงสุด 6) และ broad=true
- ⚠️ ลูกค้าระบุ "ชนิด/วัสดุ/แบบ" เฉพาะที่ร้านไม่มีในรายการ (เช่น "พวงกุญแจหนังปัก" แต่ร้านมีแต่พวงกุญแจอะคริลิค/หมอน) → notInCatalog=true, requested="พวงกุญแจหนังปัก", products=[] และใส่ alternatives = สินค้าที่ใกล้เคียงที่สุด ไม่เกิน 3 (เช่น กระเป๋าใส่พวงกุญแจ งานปัก, อาร์มปัก) ห้ามยัดเมนูทั้งหมวดให้แทน
- ลูกค้าพูดถึงที่ใช้งาน (รถยนต์ ตู้เย็น โต๊ะ) → เลือกสินค้าที่ชื่อมีคำนั้นก่อน · ชื่ออังกฤษให้จับตามความหมาย (ที่รองแก้ว = Coaster, แก้วเยติ = Tumbler)
- ลูกค้าเรียก "ชื่อสินค้า" ตรงกับรายการ (เช่น Photocard/โฟโต้การ์ด ขายเป็นเซ็ต) ให้เลือกสินค้าชื่อนั้น แม้จะพ่วงวัสดุมาด้วย (Photocard กระดาษอาร์ตมัน 300 แกรม = "โฟโต้การ์ด" ไม่ใช่ "งานพิมพ์กระดาษอาร์ตมัน" ที่ขายเป็นแผ่น A3) — วัสดุเป็นแค่ตัวเลือกในสินค้านั้น
- qty = จำนวนชิ้นที่จะสั่งเท่านั้น (ห้ามนับขนาด 3cm / 300 แกรม / A3) ไม่มี = null
- standalone = เขียนคำถามใหม่เป็นภาษาไทยสั้น ๆ ให้เข้าใจได้โดยไม่ต้องอ่านบริบท ใส่ชื่อสินค้าและจำนวนที่รู้`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(9_000),
      },
    );
    if (!res.ok) return null;
    const result = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (result.candidates?.[0]?.content?.parts?.[0]?.text ?? "").replace(/```json\n?|```\n?/g, "").trim();
    const raw = JSON.parse(text) as Partial<Omit<Understanding, "alternatives">> & { products?: unknown[]; alternatives?: unknown[] };
    const byName = new Map(items.map((it) => [norm(it.name), it]));
    const picked = (Array.isArray(raw.products) ? raw.products : [])
      .map((n) => byName.get(norm(String(n))))
      .filter((it): it is Lite => !!it)
      .slice(0, 6);
    const intents = ["price", "spec", "minqty", "mix", "knowledge", "order", "chitchat", "followup", "other"] as const;
    let intent = intents.includes(raw.intent as (typeof intents)[number]) ? (raw.intent as Understanding["intent"]) : "other";
    // 🛡 คำถามกติกาคละลาย ("1 เซ็ต ด้านหน้า 4 ลาย นับเป็น 4 ลายใช่ไหม" · "คละแบบได้ไหม") LLM ชอบตีเป็น spec แล้วระบบเทเมนูสินค้าให้
    // (เจอจริง 24 ก.ย. 69) → เป็น mix ตอบจาก mixRule ของสินค้าจริง (agent เคยตอบ "คละไม่ได้" ทั้งที่ร้านคละได้)
    if ((intent === "spec" || intent === "knowledge") && isMixIntent(q) && !/ราคา|บาท|เรท|เท่าไหร่|เท่าไร/.test(q)) {
      intent = "mix";
    }
    const alts = (Array.isArray(raw.alternatives) ? raw.alternatives : [])
      .map((n) => byName.get(norm(String(n))))
      .filter((it): it is Lite => !!it)
      .slice(0, 3)
      .map(refOf);
    const qtyN = Number(raw.qty);
    /**
     * 🛡 ด่านกันเดา (LLM ไม่นิ่ง: "พวงกุญแจหนังปัก ราคาเท่าไหร่คะ" ได้เมนูพวงกุญแจ แต่ "…ค่ะ" ได้ notInCatalog)
     * ลูกค้าระบุวัสดุ/เทคนิค (หนัง ไม้ ปัก …) แต่ไม่มีสินค้าที่เลือกมาตัวไหนมีคำนั้นในชื่อเลย = ร้านไม่มีของแบบนั้น
     * → บอกตรง ๆ + เสนอตัวใกล้เคียง (สินค้าที่ชื่อมีวัสดุนั้น ถ้ามี ตามด้วยที่ AI เลือก)
     */
    const QUAL = /หนัง|ไม้|ปัก|โลหะ|เหล็ก|สแตนเลส|ซิลิโคน|เรซิ่น|pvc|เซรามิก|พลาสติก|ยาง|ทองเหลือง|อลูมิเนียม|เย็บ|ถัก/gi;
    const quals = [...new Set((q.match(QUAL) ?? []).map((x) => x.toLowerCase()))];
    let notInCatalog = !!raw.notInCatalog && picked.length === 0;
    // "requested" ต้องเป็นชื่อของ ไม่ใช่ทั้งประโยค ("แก้วเซรามิก ราคา" → "แก้วเซรามิก")
    const cleanReq = (t: string) =>
      t.replace(/ราคา|เท่าไหร่|เท่าไร|กี่บาท|ขอเรท|เรท|ค่ะ|คะ|ครับ|หน่อย|ขอ|อยากได้|สนใจ|\?/g, "").replace(/\s+/g, " ").trim();
    let requested = cleanReq(String(raw.requested ?? "")) || cleanReq(q);
    let finalPicked = picked;
    // "หนัง" ต้องไม่ไปจับ "หนังสือ" (สมุด/ที่คั่นหนังสือเคยโผล่มาเป็นตัวใกล้เคียงของพวงกุญแจหนัง)
    const hasQual = (it: Lite, w: string) => {
      const hay = `${it.name} ${it.desc ?? ""}`;
      return w === "หนัง" ? /หนัง(?!สือ)/.test(hay) : norm(hay).includes(norm(w));
    };
    // ใช้ด่านนี้เฉพาะตอน LLM ตอบเป็น "หมวดกว้าง" (broad) — ชี้สินค้าเดียวชัด ๆ (Photocard กระดาษอาร์ตมัน → โฟโต้การ์ด) ให้เชื่อ
    if (quals.length && picked.length && !!raw.broad && !picked.some((it) => quals.every((w) => hasQual(it, w)))) {
      // มีสินค้าตัวอื่นที่ชื่อ/คำอธิบายมีวัสดุนั้นครบไหม (สแตนดี้ไม้ → "สแตนดี้ไม้กระดก") → ใช้ตัวนั้นตอบตามปกติ
      const qn = norm(q.replace(QUAL, " "));
      const withQual = items
        .filter((it) => quals.every((w) => hasQual(it, w)))
        .map((it) => ({ it, s: (norm(it.name).includes(norm(quals[0])) ? 2 : 0) + (qn && lcsLen(qn, norm(it.name)) >= 5 ? 3 : 0) }))
        .sort((a, b) => b.s - a.s);
      const strong = withQual.filter((x) => x.s >= 3).map((x) => x.it);
      if (strong.length) {
        finalPicked = strong.slice(0, 3);
        notInCatalog = false;
      } else {
        // ไม่มีจริง ๆ → บอกตรง ๆ + เสนอตัวใกล้เคียง (ที่มีวัสดุนั้นแม้ชื่อไม่ตรง ตามด้วยที่ AI เลือก)
        const merged = [...withQual.slice(0, 2).map((x) => x.it), ...picked.filter((it) => !withQual.some((x) => x.it === it))].slice(0, 3);
        notInCatalog = true;
        finalPicked = [];
        alts.splice(0, alts.length, ...merged.map(refOf));
      }
    }
    const u: Understanding = {
      notInCatalog,
      requested,
      alternatives: alts,
      intent,
      products: finalPicked.map((it) => it.name),
      ids: finalPicked.map((it) => it.id),
      broad: !!raw.broad && finalPicked.length >= 2,
      qty: Number.isFinite(qtyN) && qtyN > 0 ? Math.round(qtyN) : null,
      standalone: String(raw.standalone ?? "").trim() || q,
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    };
    understandCache.set(key, { at: Date.now(), u });
    if (understandCache.size > 500) for (const [k, v] of understandCache) if (Date.now() - v.at > TTL_MS) understandCache.delete(k);
    return u;
  } catch {
    return null;
  }
}

/** สินค้าที่ชั้นเข้าใจคำถามชี้มาแล้ว — ส่งต่อให้เส้นค้นหาโดยไม่ต้องให้ AI จับคู่ซ้ำ */
export interface Pick {
  ids: string[];
  broad: boolean;
}

async function pickWithAI(
  query: string,
  items: Lite[],
): Promise<{ ids: string[]; broad: boolean } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !items.length) return null;

  const list = items.map((it) => `- ${it.name}`).join("\n");
  // 🔤 คำใบ้จากการเทียบตัวอักษร — AI เคยหยิบ "PHONE STAND" ให้คนถาม "ที่ติดรถยนต์" ทั้งที่มี "แผ่นแม่เหล็กติดรถยนต์"
  // ชื่อตรงคำลูกค้าอยู่ในรายการ (23 ก.ย. 69) → บอกให้ดูตัวที่ชื่อมีคำเดียวกับลูกค้าก่อน
  // ตัดจำนวน/หน่วยออกก่อนเทียบชื่อ ไม่งั้น "50 ชิ้น" ไปจับ "พวงกุญแจแบบหลายชิ้น"
  const lexQuery = query.replace(/\d[\d,.]*\s*(?:ชิ้น|ใบ|อัน|แผ่น|ตัว|ผืน|เซ็ต|เซต|ชุด|เล่ม|คู่|ดวง|ม้วน|กล่อง|pcs)?/gi, " ");
  // ⚠️ คำใบ้ต้องตรงยาวพอ (≥5 ตัวอักษรติดกัน) — แค่ "แก้ว" 4 ตัวจะลาก "แก้วมัค" มาเป็นคำใบ้ให้คนถาม "ที่รองแก้ว" แล้ว AI เชื่อคำใบ้
  const lq = norm(lexQuery);
  const lexical = items
    .map((it) => ({ it, l: lq ? lcsLen(lq, norm(it.name)) : 0 }))
    .filter((x) => x.l >= 5)
    .sort((a, b) => b.l - a.l)
    .slice(0, 5)
    .map((x) => x.it.name);
  const hint = lexical.length
    ? `\nสินค้าที่ "ชื่อมีคำเดียวกับที่ลูกค้าพิมพ์" (พิจารณาตัวพวกนี้ก่อน): ${lexical.join(" | ")}\n`
    : "";
  const prompt = `คุณเป็นแอดมินร้านพิมพ์/ผลิตตามสั่ง ลูกค้าถามว่า: "${query}"

รายการสินค้าทั้งหมดในระบบ:
${list}
${hint}
เลือกว่าลูกค้าหมายถึงสินค้าตัวไหน ตอบ JSON เท่านั้น:
{"names": ["ชื่อสินค้าที่คัดลอกมาจากรายการด้านบนแบบคำต่อคำ"], "broad": true/false}

กติกา:
- เลือกเฉพาะสินค้าที่ลูกค้าพูดถึงจริง ๆ ห้ามเดาสินค้าใกล้เคียงที่ลูกค้าไม่ได้พูดถึง
- ⚠️ ชื่อใน names ต้องคัดลอกจากรายการด้านบนตรงตัวอักษรเป๊ะ ห้ามพิมพ์ชื่อเอง ห้ามย่อ
- ลูกค้าพูดชื่อกลุ่มกว้าง ๆ ที่มีหลายสินค้าเข้าข่าย (เช่น "พวงกุญแจ" "สแตนดี้") → ใส่ทุกตัวที่เข้าข่าย (สูงสุด 6) แล้ว broad = true
- ลูกค้าเจาะจงสินค้าเดียว → names มีตัวเดียว broad = false
- คำถามไม่ได้ถามถึงสินค้าใดเลย (ถามค่าส่ง นโยบาย ระยะเวลาผลิต วิธีสั่ง หรือถามความรู้ทั่วไป) → {"names": [], "broad": false}
- ไม่มีสินค้าตัวไหนตรงกับสิ่งที่ลูกค้าอยากได้ "อย่างชัดเจน" → {"names": [], "broad": false} ห้ามหยิบตัวที่แค่พอเกี่ยว (เช่น ถาม "ของติดรถยนต์" แล้วตอบขาตั้งมือถือ · ถาม "กันฝน" แล้วตอบร่ม ทั้งที่ลูกค้าไม่ได้พูดถึงร่ม)
- ลูกค้าพูดถึงที่ใช้งาน/สถานที่ (รถยนต์ ตู้เย็น โต๊ะ กระเป๋า) → เลือกสินค้าที่ชื่อมีคำนั้นก่อน ถ้าไม่มีให้ตอบว่าง
- ชื่อสินค้าบางตัวเป็นภาษาอังกฤษ แต่ลูกค้าเรียกภาษาไทย ให้จับคู่ตามความหมาย เช่น "ที่รองแก้ว" = Coaster, "แก้วเยติ" = Tumbler`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0 },
        }),
        signal: AbortSignal.timeout(7_000),
      },
    );
    if (!res.ok) return null;
    const result = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (result.candidates?.[0]?.content?.parts?.[0]?.text ?? "")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const out = JSON.parse(text) as { names?: unknown[]; broad?: boolean };
    // จับคู่กลับด้วย "ชื่อ" ไม่ใช่เลขดัชนี — เคยเจอ AI ตอบเลขเพี้ยนแล้วได้ถุงผ้าหูรูด
    // ติดมากับคำถามเรื่องเคสมือถือ · ชื่อที่ไม่ตรงกับของจริงถูกทิ้งทั้งหมด
    const byName = new Map(items.map((it) => [norm(it.name), it.id]));
    const ids = (out.names ?? [])
      .map((n) => byName.get(norm(String(n))))
      .filter((id): id is string => !!id)
      .slice(0, 6);
    return { ids, broad: !!out.broad };
  } catch {
    return null;
  }
}

/** ป้ายช่วงจำนวนของแถวราคา เช่น "1-10 ชิ้น" · ตารางมี label มาให้อยู่แล้วก็ใช้ของเดิม */
function tierText(m: PriceMatrix, i: number): string {
  const t = m.tiers[i];
  if (t?.label?.trim()) return t.label.trim();
  const from = i === 0 ? 1 : (m.tiers[i - 1].upTo ?? 0) + 1;
  return t?.upTo == null ? `${from}+` : `${from}-${t.upTo}`;
}

/** ชื่อคอลัมน์ราคาที่ลูกค้าอ่านรู้เรื่อง — คีย์ในตารางคั่นค่าตัวเลือกด้วย "│" */
function columnText(m: PriceMatrix, key: string): string {
  if (!key) return m.colLabel?.trim() || "ราคา";
  return key.split("│").filter(Boolean).join(" · ");
}

/** ตารางราคาทุกเรทของสินค้า (สินค้าเรทเดียวห่อให้เป็นเรทเดียวเพื่อให้เดินลูปทางเดียวกัน) */
function ratesOf(p: Product): { label: string; desc?: string; minQty?: number; matrix: PriceMatrix }[] {
  // 🤝 เรทตัวแทนจำหน่าย (dealerOnly) ห้ามหลุดออกทางบอทราคา — เส้นนี้เป็นสาธารณะ ไม่รู้ว่าใครถาม
  const pub = (p.priceRates ?? []).filter((r) => !r.dealerOnly);
  if (pub.length) return pub.map((r) => ({ label: r.label, desc: r.desc, minQty: r.minQty, matrix: r.pricing }));
  return p.pricing ? [{ label: "", matrix: p.pricing }] : [];
}

/**
 * คอลัมน์ที่ "ตรงกับคำที่ลูกค้าพูด" — ถามมาว่า PVC ก็ไม่ต้องเทตารางกระดาษให้ดู
 * ไม่มีคอลัมน์ไหนตรงเลย = คืนทั้งหมด (ให้ลูกค้าเห็นตัวเลือกแล้วค่อยเลือก)
 */
function pickColumns(keys: string[], query: string): string[] {
  const q = norm(query);
  // นับว่าคอลัมน์นี้ตรงกับคำของลูกค้ากี่ส่วน — "3cm 3mm" ต้องได้คอลัมน์ที่ตรงทั้งสองส่วน ไม่ใช่ทุกคอลัมน์ที่มี 3cm หรือ 3mm
  const scored = keys.map((k) => ({
    k,
    n: k ? norm(k).split("│").filter((v) => v.length >= 2 && q.includes(v)).length : 0,
  }));
  const best = Math.max(0, ...scored.map((x) => x.n));
  if (!best) return keys;
  return scored.filter((x) => x.n === best).map((x) => x.k);
}

/** ราคาต่อหน่วยจริงจากเครื่องคิดเงินของตะกร้า — ผ่านตัวเลือกแกนตารางให้ครบ ไม่งั้นราคาหล่นไป product.price */
function unitPriceAt(p: Product, rateLabel: string, m: PriceMatrix, key: string, qty: number): number {
  const selections: Record<string, string> = {};
  if (rateLabel) selections[RATE_LABEL] = rateLabel;
  m.driverLabels.forEach((label, i) => {
    const v = key.split("│")[i] ?? "";
    if (v) selections[label] = v;
  });
  if (needsQuote(p, selections)) return 0;
  return unitPriceFor(p, selections, qty);
}

/** หัวเรทแบบสั้น — เอาแค่ชื่อเรท + ขั้นต่ำ (คำอธิบายยาว ๆ ไปอ่านที่หน้าสินค้า) */
function rateHead(rate: { label: string; minQty?: number }, unit: string): string {
  const label = rate.label.trim() || "ราคา";
  return rate.minQty ? `${label} (ขั้นต่ำ ${rate.minQty} ${unit})` : label;
}

/**
 * ประกอบคำตอบราคาของสินค้าหนึ่งตัว — คืน null เมื่อสินค้านี้ตอบเป็นตารางไม่ได้
 * `narrow` = กำลังตอบหลายสินค้าพร้อมกัน ให้ย่อของแต่ละตัวลง ไม่งั้นคำตอบยาวจนไม่มีใครอ่าน
 *
 * 23 ก.ย. 69 เจ้าของร้านแจ้ง "บอทตอบยาวเกินไป" (พวงกุญแจ 100 ชิ้น = 12 บรรทัดตัวเลือก + หัวเรทยาว 2 บรรทัด
 * ในไลน์ต้องกด See more) → ย่อเป็น: ต่อเรท 1 บรรทัดช่วงราคา + 1 บรรทัดแบบถูกสุด · โชว์รายตัวเลือกเฉพาะเมื่อ
 * ลูกค้าระบุคำที่ตรงคอลัมน์ (เช่น "3cm") · ปิดท้ายบอกว่าราคาต่างกันตามอะไร + ลิงก์ (รายละเอียดครบอยู่บนหน้าสินค้า)
 */
function quote(p: Product, query: string, qty: number | null, narrow = false): PriceAnswer | null {
  const allRates = ratesOf(p);
  const rates = allRates.slice(0, narrow ? 1 : MAX_RATES);
  if (!rates.length) return null;

  const url = botUrl(p);
  const lines: string[] = [];
  let printed = 0;
  let options = 0;
  let narrowed = false;
  /** ขั้นบันได "ยิ่งสั่งเยอะยิ่งถูก" ของแบบถูกสุด — ใส่บรรทัดเดียวท้ายคำตอบ (เดิมกางครบทุกช่วงทุกเรท = 14 บรรทัด) */
  let ladder = "";

  for (const rate of rates) {
    const m = rate.matrix;
    const unit = m.unit || "ชิ้น";
    const all = Object.keys(m.cells).filter((k) => (m.cells[k] ?? []).some((n) => n > 0));
    if (!all.length) continue;
    const picked = pickColumns(all, query);
    const matched = picked.length < all.length;
    if (matched) narrowed = true;
    const head = rateHead(rate, unit);
    const range = (min: number, max: number) => (min === max ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`);

    if (qty) {
      const i = tierIndex(m, qty);
      // ช่วงราคาดูจากตารางดิบทุกคอลัมน์ (ถูก) · ตัวที่โชว์ค่อยคิดด้วยเครื่องคิดเงินจริง (แพงกว่าแต่ตรงตะกร้า)
      const raw = all.map((k) => m.cells[k]?.[i] ?? 0).filter((v) => v > 0);
      const shown = picked
        .map((key) => ({ key, unit: unitPriceAt(p, rate.label, m, key, qty) || m.cells[key]?.[i] || 0 }))
        .filter((x) => x.unit > 0)
        .sort((a, b) => a.unit - b.unit);
      if (!shown.length) continue;
      printed++;
      options += shown.length;
      const cap = narrow ? 1 : 3;
      if (matched && shown.length <= cap * 2) {
        // ลูกค้าระบุแบบมาแล้ว → ตอบตัวเลขของแบบนั้นตรง ๆ
        lines.push(`• ${head}`);
        shown.slice(0, cap * 2).forEach((x) =>
          lines.push(`  ${columnText(m, x.key)} = ${formatPrice(x.unit)}/${unit} (รวม ${formatPrice(x.unit * qty)})`),
        );
      } else {
        const min = Math.min(...raw, shown[0].unit);
        const max = Math.max(...raw, shown[shown.length - 1].unit);
        lines.push(`• ${head}: ${range(min, max)}/${unit}`);
        lines.push(`  ถูกสุด ${columnText(m, shown[0].key)} = ${formatPrice(shown[0].unit)}/${unit} (รวม ${formatPrice(shown[0].unit * qty)})`);
      }
    } else {
      // ยังไม่บอกจำนวน → ต่อเรท 1 บรรทัดช่วงราคา (ลูกค้าถาม "มีแบบไหนบ้าง" อยากเห็นตัวเลือก ไม่ใช่ตารางขั้นบันได)
      const vals = all.flatMap((k) => m.cells[k] ?? []).filter((v) => v > 0);
      if (!vals.length) continue;
      printed++;
      options += all.length;
      const cols = matched ? picked.slice(0, narrow ? 1 : 2) : [];
      if (cols.length) {
        // ระบุแบบมา → ช่วงราคาของแบบนั้น (ต่ำสุด–สูงสุดตามจำนวน)
        for (const key of cols) {
          const cells = (m.cells[key] ?? []).filter((v) => v > 0);
          if (!cells.length) continue;
          lines.push(`• ${columnText(m, key)}${rates.length > 1 ? ` (${rate.label.trim()})` : ""}: ${range(Math.min(...cells), Math.max(...cells))}/${unit}`);
        }
      } else {
        lines.push(`• ${head}: ${range(Math.min(...vals), Math.max(...vals))}/${unit}`);
      }
      if (!ladder) {
        const cheapest = cols[0] ?? [...all].sort((a, b) => (m.cells[a]?.[0] ?? 0) - (m.cells[b]?.[0] ?? 0))[0];
        const cells = m.cells[cheapest] ?? [];
        const idx = cells.map((v, j) => (v > 0 ? j : -1)).filter((j) => j >= 0);
        if (idx.length >= 2) {
          const f = idx[0];
          const l = idx[idx.length - 1];
          // tierText มีหน่วยติดมาแล้ว ("1-10 แผ่น A3") อย่าเติมซ้ำ
          ladder = `ยิ่งสั่งเยอะยิ่งถูก: ${tierText(m, f)} = ${formatPrice(cells[f])} … ${tierText(m, l)} = ${formatPrice(cells[l])}/${unit}`;
        }
      }
    }
  }

  if (!printed) return null;
  if (allRates.length > rates.length) lines.push(`  (มีอีก ${allRates.length - rates.length} เรท ดูที่หน้าสินค้า)`);
  if (ladder) lines.push(ladder);

  const unit0 = rates[0].matrix.unit || "ชิ้น";
  const header = qty ? `${p.name} — สั่ง ${qty.toLocaleString()} ${unit0}` : `${p.name} (ราคาต่อ ${unit0})`;
  const drivers = (rates[0].matrix.driverLabels ?? []).map((d) => d.trim()).filter(Boolean).slice(0, 4).join(" · ");
  // ⚠️ ท้ายบรรทัดต้องจบในตัวเอง — บอท LINE ตัดบรรทัดลิงก์ทิ้ง (การ์ดมีปุ่มแล้ว) เคยเหลือ "…สั่งได้ที่" ค้างไว้
  const footer = qty
    ? `${!narrowed && drivers ? `ราคาต่างกันตาม ${drivers} — ` : ""}ดูครบทุกแบบ/สั่งได้ที่หน้าสินค้า`
    : "บอกจำนวนที่ต้องการได้เลย เดี๋ยวคิดราคาให้ · ดูครบทุกแบบ/สั่งได้ที่หน้าสินค้า";
  const pr = priceRange(p);

  return {
    answer: `${header}\n${lines.join("\n")}\n${footer}\n${url}`,
    // หลายแบบ/หลายเรท = ลูกค้าต้องเลือกแบบก่อน → บอก n8n ว่าห้ามย่อรายการทิ้ง
    kind: options > 1 ? "price-options" : "price",
    source: "web-price-engine",
    intent: qty ? "price_qty" : "price",
    product: { id: p.id, name: p.name, url, image: absImage(p.imageSrc), ...pr },
  };
}

/** ช่วงราคาสาธารณะของสินค้า (ไว้โชว์บนการ์ด) — ใช้ค่าที่เซิร์ฟเวอร์คำนวณไว้ ไม่มีค่อยไล่จากตาราง */
function priceRange(p: Product): { priceMin?: number; priceMax?: number } {
  if (typeof p.priceMin === "number" && typeof p.priceMax === "number") return { priceMin: p.priceMin, priceMax: p.priceMax };
  const vals = ratesOf(p).flatMap((r) => Object.values(r.matrix.cells).flat()).filter((v) => v > 0);
  return vals.length ? { priceMin: Math.min(...vals), priceMax: Math.max(...vals) } : {};
}

/** ตัดวงเล็บท้ายชื่อกลุ่มออก — ชื่อกลุ่มยาว ๆ อย่าง "เลือกสีพิเศษของฐาน (ขนาดฐาน 3 ซม. · …)" อ่านไม่รู้เรื่อง */
function groupLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label.trim();
}

/**
 * 📐 ตอบคำถามสเปก จาก "ตัวเลือกจริงของสินค้า" บนเว็บ (ขนาด/สี/วัสดุ/ทรง)
 *
 * ก่อนหน้านี้ระบบส่งให้บอทแค่ตารางราคากับลิงก์ ไม่เคยส่งรายการตัวเลือกเลย
 * ลูกค้าถาม "สแตนดี้มีขนาดเท่าไหร่บ้าง" บอทจึงตอบช่วงราคากลับไป ทั้งที่เว็บมีขนาดครบ 28 แบบ
 */
function spec(p: Product, query: string): PriceAnswer | null {
  const q = query.toLowerCase();
  const wantSize = /ขนาด|ไซ(ส์|ซ)|กี่ซม|กี่นิ้ว|ใหญ่|เล็ก|ทรง/.test(q);
  const wantColor = /สี|เฉด|color/.test(q);
  const wantMaterial = /วัสดุ|เนื้อ|กระดาษ|ผ้า|หนา|มิล|มม/.test(q);
  const picky = wantSize || wantColor || wantMaterial;

  const wanted = (label: string) => {
    if (!picky) return true;
    const l = label.toLowerCase();
    if (wantSize && /ขนาด|ไซ|ทรง|size/.test(l)) return true;
    if (wantColor && /สี|เฉด|color/.test(l)) return true;
    if (wantMaterial && /วัสดุ|เนื้อ|กระดาษ|ผ้า|หนา|ชนิด/.test(l)) return true;
    return false;
  };

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const opt of p.options ?? []) {
    if (!opt.choices?.length || !wanted(opt.label)) continue;
    // กลุ่มที่ตัวเลือกซ้ำกันเป๊ะ (เช่น "เลือกสีพิเศษของฐาน" ที่แตกตามขนาดฐาน 12 กลุ่ม) เอาแค่ครั้งเดียว
    const sig = opt.choices.map((c) => c.name).join("|");
    if (seen.has(sig)) continue;
    seen.add(sig);

    const names = opt.choices.map((c) => c.name.trim()).filter(Boolean);
    const shown = names.slice(0, 16).join(" · ");
    const more = names.length > 16 ? ` …และอีก ${names.length - 16} แบบ` : "";
    lines.push(`• ${groupLabel(opt.label)} (${names.length} แบบ): ${shown}${more}`);
    if (lines.length >= 6) break;
  }
  if (!lines.length) return null;

  return {
    answer: `${p.name}\n${lines.join("\n")}\n${botUrl(p)}`,
    kind: "info",
    source: "web-price-engine",
    intent: "spec",
    product: { id: p.id, name: p.name, url: botUrl(p), image: absImage(p.imageSrc), ...priceRange(p) },
  };
}

/**
 * สินค้าที่เข้าข่ายคำถามนี้ — ใช้ AI เป็นหลัก ตกมาที่การเทียบตัวอักษรเมื่อ AI ใช้ไม่ได้
 * `broad` = ลูกค้าพูดชื่อกลุ่มกว้าง ๆ ที่มีหลายตัวเข้าข่าย → ผู้เรียกควรกางเมนูให้เลือกก่อน
 */
async function candidates(query: string, pick?: Pick): Promise<{ items: Lite[]; broad: boolean }> {
  const all = await catalog().catch(() => []);
  if (pick) {
    const byId = new Map(all.map((it) => [it.id, it]));
    const items = pick.ids.map((id) => byId.get(id)).filter((it): it is Lite => !!it);
    if (items.length) return { items, broad: pick.broad && items.length >= 2 };
  }
  const ai = await pickWithAI(query, all);
  if (ai) {
    const byId = new Map(all.map((it) => [it.id, it]));
    const items = ai.ids.map((id) => byId.get(id)).filter((it): it is Lite => !!it);
    return { items, broad: ai.broad && items.length >= 2 };
  }
  const hits = resolve(query, all);
  const top = hits[0]?.score ?? 0;
  const band = hits.filter((h) => h.score >= top * 0.7);
  return band.length >= 3
    ? { items: band.slice(0, 6).map((h) => h.item), broad: true }
    : { items: hits.filter((h) => h.score >= top * 0.85).slice(0, 3).map((h) => h.item), broad: false };
}

/** ถามเรื่องคละลาย/คละแบบ */
export function isMixIntent(text: string): boolean {
  return /คละ|ผสมลาย|นับเป็น|กี่ลาย|ลายละ|แบบละ|หลายลาย|หลายแบบ|คนละลาย|ลายเดียวกัน/.test(text);
}

/**
 * 🎨 กติกาคละลายของสินค้าจากข้อมูลจริงบนเว็บ (mixRule ระดับสินค้า/เรท · minPerDesign/freeMixBelowQty ของเรท · backDesign)
 * ทำไม: agent ตอบจากคลังความรู้ว่า "โฟโต้การ์ด 1 เซ็ตคละแบบไม่ได้" ทั้งที่เว็บตั้งไว้ คละได้ 3 ลายฟรี เกินลายละ 5 บาท (24 ก.ย. 69)
 */
function mixText(p: Product, query = ""): PriceAnswer | null {
  const pub = (p.priceRates ?? []).filter((r) => !r.dealerOnly);
  const unit = pub[0]?.pricing?.unit || p.pricing?.unit || "ชิ้น";
  const rule = p.mixRule ?? pub.find((r) => r.mixRule)?.mixRule;
  const back = p.backDesign?.mixRule;
  const lines: string[] = [];
  const baht = (n: number) => `${n.toLocaleString()} บาท`;

  // 🎯 ลูกค้าเล่าสถานการณ์มา ("ด้านหน้า 4 ลาย … ด้านหลังลายเดียวกัน นับเป็น 4 ลายใช่ไหม") → ตอบใช่/ไม่ใช่ + คิดค่าคละให้เห็นเลย
  // (24 ก.ย. 69 เจ้าของร้าน: คำถามต่อเนื่องเคยได้กติกาทั้งชุดซ้ำ ไม่ตรงคำถาม)
  const frontM = query.match(/(?:ด้านหน้า\s*)?(\d+)\s*ลาย/);
  const n = frontM ? Number(frontM[1]) : 0;
  const backSame = /ด้านหลัง[^\d]{0,12}(ลายเดียว|เหมือน|ลายเดียวกัน|ลายเดิม)/.test(query);
  const backM = query.match(/ด้านหลัง\s*(\d+)\s*ลาย/);
  const backN = backM ? Number(backM[1]) : backSame ? 1 : 0;
  if (rule && n >= 1 && n <= 50) {
    const t = mixTierFor(rule, 1);
    const frontFee = mixFeePerUnit(rule, n, 1);
    const yes = /ใช่ไหม|ใช่มั้ย|นับเป็น|ถูกไหม|ถูกมั้ย|ใช่รึเปล่า/.test(query);
    lines.push(`${yes ? "ใช่ค่ะ นับเป็น " : "คละได้ค่ะ "}${n} ลาย${backN ? ` (ด้านหน้า)` : ""}`);
    lines.push(
      n <= t.includedDesigns
        ? `• ด้านหน้า ${n} ลาย: อยู่ในโควตา ${t.includedDesigns} ลายฟรี ไม่มีค่าคละ`
        : `• ด้านหน้า ${n} ลาย: ${t.includedDesigns} ลายแรกฟรี ลายที่ ${t.includedDesigns + 1}${n > t.includedDesigns + 1 ? `-${n}` : ""} คิดลายละ ${baht(t.extraFee)} = ค่าคละ ${baht(frontFee)}/${unit}`,
    );
    let backFee = 0;
    if (backN && back) {
      backFee = mixFeePerUnit(back, backN, 1);
      lines.push(
        backN <= back.includedDesigns
          ? `• ด้านหลัง${backSame ? "ลายเดียวกัน" : ` ${backN} ลาย`}: ไม่มีค่าคละ`
          : `• ด้านหลัง ${backN} ลาย: ${back.includedDesigns} ลายแรกฟรี ที่เหลือลายละ ${baht(back.extraFee)} = ${baht(backFee)}/${unit}`,
      );
    } else if (backSame) {
      lines.push("• ด้านหลังลายเดียวกัน: ไม่มีค่าคละ");
    }
    lines.push(`รวมค่าคละ ${frontFee + backFee ? `${baht(frontFee + backFee)}/${unit}` : "0 บาท"} (บวกจากราคาพิมพ์ปกติ)`);
  } else {
    // กติกาทั่วไป — สั้น ๆ 2-3 บรรทัด (เจ้าของร้านขอให้กระชับ)
    if (rule) {
      const tiers = rule.tiers?.length ? [...rule.tiers].sort((a, b) => a.fromQty - b.fromQty) : [mixTierFor(rule, 1)];
      lines.push("คละลายได้ค่ะ");
      for (const t of tiers.slice(0, 3)) {
        const head = tiers.length > 1 ? `สั่ง ${t.fromQty} ${unit}ขึ้นไป: ` : "";
        lines.push(
          `• ${head}1 ${unit} คละได้ ${t.includedDesigns} ลาย${t.baseFee ? ` (ค่าคละเหมา ${baht(t.baseFee)})` : "ฟรี"}${t.extraFee ? ` เกินคิดลายละ ${baht(t.extraFee)}` : ""}`,
        );
      }
      if (back) lines.push(`• พิมพ์ 2 ด้าน: ด้านหลังคละได้อีก ${back.includedDesigns} ลายฟรี${back.extraFee ? ` เกินลายละ ${baht(back.extraFee)}` : ""} (ใช้ลายเดียวกัน = ไม่คิด)`);
    } else {
      for (const r of pub) {
        const parts: string[] = [];
        if (r.freeMixBelowQty) parts.push(`ต่ำกว่า ${r.freeMixBelowQty} ${unit} คละได้อิสระ`);
        if (r.minPerDesign) parts.push(`${r.freeMixBelowQty ? "ตั้งแต่นั้น" : ""}คละได้โดยแต่ละลายอย่างน้อย ${r.minPerDesign} ${unit}`);
        if (r.extraDesignFee) parts.push(`คละเกินโควตาคิดเพิ่มลายละ ${baht(r.extraDesignFee)}`);
        if (r.underMinPieceFee) parts.push(`ลายที่ไม่ถึงขั้นต่ำคิดส่วนต่างชิ้นละ ${baht(r.underMinPieceFee)}`);
        if (!parts.length && r.desc && /คละ/.test(r.desc)) {
          const seg = r.desc.split(/\s*[·•]\s*/).filter((x) => /คละ/.test(x)).join(" · ");
          if (seg) parts.push(seg);
        }
        if (parts.length) lines.push(`• ${r.label}: ${parts.join(" · ")}`);
      }
      if (lines.length) lines.unshift("คละลายได้ค่ะ");
      // ไม่มีกติกาแบบโครงสร้าง → ใช้บรรทัดที่หน้าสินค้าเขียนไว้เอง
      if (!lines.length) {
        const fromPage = pageLinesAbout(p, /คละ/, 3);
        if (fromPage.length) lines.push("คละลายได้ค่ะ", ...fromPage.map((l) => `• ${l}`));
      }
    }
  }
  if (!lines.length) return null;
  const url = botUrl(p);
  return {
    answer: `${p.name}: ${lines.join("\n")}\n${url}`,
    kind: "info",
    source: "web-price-engine",
    intent: "mix",
    product: { id: p.id, name: p.name, url, image: absImage(p.imageSrc), ...priceRange(p) },
  };
}

/** ข้อความทั้งหมดที่ลูกค้าอ่านได้บนหน้าสินค้า (คำอธิบาย · เนื้อหา · แท็บ · เงื่อนไข · FAQ · ตัวเลือก) — ให้บอทอ่านแทนคน */
function stripHtml(h: string): string {
  return h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function pageText(p: Product): string {
  const parts: string[] = [];
  if (p.description) parts.push(`[คำอธิบาย]\n${p.description}`);
  for (const b of p.body ?? []) {
    const t = typeof (b as { html?: string }).html === "string" ? stripHtml((b as { html: string }).html) : "";
    if (t) parts.push(t);
  }
  for (const t of p.tabs ?? []) {
    const body = t.html ? stripHtml(t.html) : t.text ?? "";
    if (body.trim()) parts.push(`[${t.title}]\n${body.trim()}`);
  }
  if (p.terms) parts.push(`[เงื่อนไข]\n${p.terms}`);
  const faqs = p.seo?.faqs ?? [];
  if (faqs.length) parts.push(`[คำถามพบบ่อย]\n${faqs.map((f) => `ถาม: ${f.q}\nตอบ: ${f.a}`).join("\n")}`);
  const opts = (p.options ?? []).filter((o) => o.choices?.length).slice(0, 14);
  const unit = (p.priceRates ?? []).find((r) => !r.dealerOnly)?.pricing?.unit || p.pricing?.unit || "ชิ้น";
  if (opts.length)
    parts.push(
      `[ตัวเลือกบนเว็บ + ราคาเพิ่ม]\n${opts
        .map((o) => {
          const per = o.sheetFee ? `/${o.sheetFee.unit ?? "แผ่น"}` : o.extraPerDesign ? "/ลาย" : `/${unit}`;
          const cs = o.choices
            .slice(0, 12)
            .map((c) => {
              const ex = c.extraTiers?.length ? c.extraTiers[0]?.extra : c.extra;
              return `${c.name}${ex ? ` (+฿${ex}${per})` : ""}`;
            })
            .join(" / ");
          return `• ${groupLabel(o.label)}: ${cs}${o.choices.length > 12 ? " …" : ""}`;
        })
        .join("\n")}`,
    );
  return parts.join("\n\n").slice(0, 7000);
}

/** บรรทัดบนหน้าสินค้าที่พูดถึงเรื่องนี้ (ไว้แนบท้ายคำตอบกติกาคละลาย ตามที่เจ้าของร้านขอให้ "อ่านรายละเอียดในเว็บด้วย") */
function pageLinesAbout(p: Product, re: RegExp, max = 3): string[] {
  return pageText(p)
    .split(/\n|(?=•)/)
    .map((l) => l.replace(/^[•\s-]+/, "").trim())
    .filter((l) => l.length >= 8 && re.test(l))
    .slice(0, max);
}

const infoCache = new Map<string, { at: number; text: string }>();
/**
 * 📖 ตอบคำถามความรู้เกี่ยวกับสินค้า "จากข้อความบนหน้าสินค้าจริง" (LLM เรียบเรียงจากข้อความนั้นเท่านั้น)
 * เจ้าของร้านขอ 24 ก.ย. 69: "อยากให้อ่านรายละเอียดในเว็บด้วย" — เดิม agent ตอบจากคลังความรู้เก่าที่ไม่ตรงเว็บ
 */
async function infoText(p: Product, query: string): Promise<PriceAnswer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  const text = pageText(p);
  if (!apiKey || text.length < 40) return null;
  const key = `${p.id}\u0002${query.trim()}`;
  const hit = infoCache.get(key);
  let out = hit && Date.now() - hit.at < TTL_MS ? hit.text : "";
  if (!out) {
    const prompt = `คุณเป็นแอดมินร้าน iDucky ตอบลูกค้าโดยใช้ "ข้อมูลจากหน้าสินค้า" ด้านล่างเท่านั้น ห้ามเดา ห้ามเพิ่มข้อมูลที่ไม่มี

สินค้า: ${p.name}
ข้อมูลจากหน้าสินค้า:
${text}

ลูกค้าถาม: "${query}"

กติกา: ตอบภาษาไทย สุภาพ ลงท้าย "ค่ะ" ไม่เกิน 5 บรรทัด ตอบตรงคำถามก่อน ถ้ามีตัวเลข/เงื่อนไขในข้อมูลให้ใส่ให้ครบ
ห้ามใช้ markdown (ห้าม * หรือ ** หรือ #) ใช้ • นำหน้ารายการแทน ไม่ต้องขึ้นต้นด้วย "สวัสดีค่ะ"
ถ้าข้อมูลบนหน้าสินค้าไม่พอจะตอบคำถามนี้ ให้ตอบคำเดียวว่า NOT_FOUND`;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 400, temperature: 0.2 } }),
          signal: AbortSignal.timeout(9_000),
        },
      );
      if (!res.ok) return null;
      const result = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      out = (result.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
      if (out) infoCache.set(key, { at: Date.now(), text: out });
    } catch {
      return null;
    }
  }
  if (!out || /NOT_FOUND/.test(out)) return null;
  // LINE/แชทโชว์ markdown เป็นตัวอักษรดิบ → ถอดออกให้หมด
  out = out
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/^#+\s*/gm, "")
    .replace(/^สวัสดีค่ะ\s*/m, "")
    .trim();
  const url = botUrl(p);
  return {
    answer: `${out}\nรายละเอียดเต็มดูที่หน้าสินค้า\n${url}`,
    kind: "info",
    source: "web-page-info",
    intent: "info",
    product: { id: p.id, name: p.name, url, image: absImage(p.imageSrc), ...priceRange(p) },
  };
}

/** คำถามความรู้เกี่ยวกับสินค้าที่ระบุ — อ่านจากหน้าสินค้าจริง · ไม่รู้สินค้า/ไม่มีข้อมูล = skip ให้ agent ตอบ */
export async function searchInfo(query: string, pick?: Pick): Promise<PriceAnswer> {
  const q = query.trim();
  if (!pick?.ids.length && !(await mentionsProduct(q))) return { answer: "", kind: "skip", source: "no-product-mentioned", intent: "info" };
  const { items, broad } = await candidates(q, pick);
  if (broad || !items.length) return { answer: "", kind: "skip", source: "no-single-product", intent: "info" };
  const full = await getProductServer(items[0].id).catch(() => undefined);
  const ans = full ? await infoText(full, q) : null;
  return ans ?? { answer: "", kind: "skip", source: "no-page-info", intent: "info" };
}

/** ถามกติกาคละลาย — ต้องรู้สินค้า (จากคำถามหรือบริบท) ไม่รู้ = เมนูให้เลือกก่อน · ไม่มีข้อมูลคละ = skip ให้ agent ตอบ */
export async function searchMix(query: string, pick?: Pick): Promise<PriceAnswer> {
  const q = query.trim();
  if (!pick?.ids.length && !(await mentionsProduct(q))) return { answer: "", kind: "skip", source: "no-product-mentioned", intent: "mix" };
  const { items, broad } = await candidates(q, pick);
  if (broad) return menu(items.slice(0, 6), "spec");
  for (const item of items.slice(0, 2)) {
    const full = await getProductServer(item.id).catch(() => undefined);
    const ans = full ? mixText(full, q) : null;
    if (ans) return ans;
  }
  return { answer: "", kind: "skip", source: "no-mix-rule", intent: "mix" };
}

/**
 * ลูกค้า "เอ่ยชื่อสินค้า" จริงไหม (เทียบตัวอักษรกับชื่อสินค้าในร้าน) — ใช้กันเส้นสเปกตอบมั่ว:
 * คำถามความรู้ที่ไม่มีชื่อสินค้าเลย ("ร้านใช้ค่าสีอะไรในการสกรีน") ตัวจับคู่ AI ยังเดาสินค้าออกมาได้ (ได้เมนูหมวก)
 */
export async function mentionsProduct(query: string): Promise<boolean> {
  const all = await catalog().catch(() => []);
  return resolve(query, all).length > 0;
}

/** ค้นหาสเปกสินค้าตามคำถาม — คำถามกว้างคืนเมนูให้เลือกก่อนเหมือนฝั่งราคา */
export async function searchSpec(query: string, pick?: Pick): Promise<PriceAnswer> {
  const q = query.trim();
  // ถามสเปกโดยไม่เอ่ยชื่อสินค้า = คำถามความรู้ ให้คลังความรู้/agent ตอบ (ห้ามเดาสินค้าให้) — เว้นแต่ชั้นเข้าใจคำถามชี้สินค้ามาแล้ว
  if (!pick?.ids.length && !(await mentionsProduct(q)))
    return { answer: "", kind: "skip", source: "no-product-mentioned", intent: "spec" };
  const { items, broad } = await candidates(q, pick);
  if (broad) return menu(items.slice(0, 6), "spec");
  for (const item of items.slice(0, 2)) {
    const full = await getProductServer(item.id).catch(() => undefined);
    const ans = full ? spec(full, q) : null;
    if (ans) return ans;
  }
  return { answer: "", kind: "skip", source: "no-match", intent: "spec" };
}

/**
 * 📋 คำถามกว้าง ๆ ที่ชี้ไปได้หลายสินค้า ("พวงกุญแจมีเรทยังไงบ้าง" = สินค้า 8 ตัว)
 * → ห้ามเลือกให้เองตัวเดียวแล้วเทตารางยาว ๆ (เคยตอบ "พวงกุญแจกล่องดนตรี" ให้คนถามพวงกุญแจทั่วไป)
 * ตอบเป็นเมนูพร้อมช่วงราคาแล้วให้ลูกค้าชี้ก่อน แบบเดียวกับที่แอดมินตอบ
 */
function menu(items: Lite[], mode: "price" | "spec" = "price"): PriceAnswer {
  const lines = items.map((it) => {
    const min = it.priceMin;
    const max = it.priceMax;
    // ถามสเปกอยู่ อย่าเอาราคามาเสนอ — ตอบไม่ตรงคำถามซ้ำอีกรอบ
    const price =
      mode === "spec"
        ? ""
        : min && max && max > min
          ? ` — ฿${min.toLocaleString()}-${max.toLocaleString()}`
          : min
            ? ` — เริ่ม ฿${min.toLocaleString()}`
            : "";
    return `• ${it.name}${price}\n  ${botUrl(it)}`;
  });
  return {
    answer:
      mode === "spec"
        ? `กลุ่มนี้มีหลายแบบ แต่ละแบบมีขนาด/ตัวเลือกไม่เหมือนกันครับ\n${lines.join("\n")}\n\nสนใจแบบไหนครับ เดี๋ยวบอกขนาดกับตัวเลือกให้ครบ`
        : `ของกลุ่มนี้มีหลายแบบ ราคาต่างกันตามแบบและจำนวนครับ\n${lines.join("\n")}\n\nสนใจแบบไหนกับจำนวนเท่าไหร่ครับ เดี๋ยวแจ้งเรทเต็มให้`,
    kind: "price-options",
    source: "web-price-engine",
    intent: mode === "spec" ? "spec_menu" : "price_menu",
    products: items.map(refOf),
  };
}

/** ส่งต่อไปสมองเดิมของ n8n — ใช้เมื่อเว็บตอบเองไม่ได้ (สินค้านอกแคตตาล็อก/คำถาม FAQ) */
async function fallback(query: string, timeoutMs: number): Promise<PriceAnswer | null> {
  try {
    const res = await fetch(N8N_PRICING, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    const text = ["answer", "result", "response", "text"].map((k) => d[k]).find((v) => typeof v === "string" && v.trim());
    if (typeof text !== "string") return null;
    return {
      answer: text.trim(),
      kind: (typeof d.kind === "string" ? d.kind : "info") as PriceKind,
      source: "n8n-fallback",
      intent: typeof d.intent === "string" ? d.intent : "unknown",
    };
  } catch {
    return null;
  }
}

/**
 * ตอบคำถามราคาหนึ่งข้อ — ลองตอบจากตารางราคาจริงของเว็บก่อน ไม่ได้ค่อยส่งต่อ n8n
 * `allowFallback: false` ใช้ตอนอยากรู้ว่าเว็บตอบเองได้ไหมล้วน ๆ (เทียบผลก่อนสลับระบบ)
 */
export async function searchPrice(
  query: string,
  opts: { qty?: number | null; allowFallback?: boolean; timeoutMs?: number; pick?: Pick } = {},
): Promise<PriceAnswer> {
  const q = query.trim();
  const qty = opts.qty ?? parseQty(q);
  const allowFallback = opts.allowFallback !== false;

  const { items, broad } = await candidates(q, opts.pick);
  // ลูกค้าพูดชื่อกลุ่มกว้าง ๆ ("พวงกุญแจ" = สินค้า 8 ตัว) → กางเมนูให้เลือกก่อน อย่าเดาให้เอง
  if (broad) return menu(items.slice(0, 6));

  const found: PriceAnswer[] = [];
  for (const item of items.slice(0, 3)) {
    const full = await getProductServer(item.id).catch(() => undefined);
    if (!full) continue;
    const ans = quote(full, q, qty, items.length > 1);
    if (ans) found.push(ans);
  }
  if (found.length === 1) return found[0];
  if (found.length > 1)
    return {
      answer: found.map((f) => f.answer).join("\n\n"),
      kind: "price-options",
      source: "web-price-engine",
      intent: qty ? "price_qty" : "price",
      product: found[0].product,
      products: found.map((f) => f.product).filter((x): x is ProductRef => !!x),
    };

  if (allowFallback) {
    const alt = await fallback(q, opts.timeoutMs ?? 12_000);
    if (alt) return alt;
  }

  return {
    answer: "",
    kind: "skip",
    source: items.length ? "web-price-engine" : "no-match",
    intent: "unknown",
  };
}
