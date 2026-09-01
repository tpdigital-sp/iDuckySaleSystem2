import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getProductServer } from "@/lib/products-server";
import { SITE_URL } from "@/lib/shop-info";
import {
  formatPrice,
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

export interface PriceAnswer {
  answer: string;
  kind: PriceKind;
  source: string;
  intent: string;
  /** สินค้าที่จับคู่ได้ (ให้ผู้เรียกแนบลิงก์เองได้) */
  product?: { id: string; name: string; url: string };
}

interface Lite {
  id: string;
  name: string;
  slug?: string;
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
      "id, category, name:data->>name, slug:data->>slug, hidden:data->>hidden, priceMin:data->>priceMin, priceMax:data->>priceMax",
    );
  return (data ?? [])
    .filter((r) => r.id && r.name && !String(r.category ?? "").startsWith("__") && r.hidden !== "true")
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: r.slug ?? undefined,
      category: String(r.category ?? ""),
      priceMin: r.priceMin ? Number(r.priceMin) : undefined,
      priceMax: r.priceMax ? Number(r.priceMax) : undefined,
    }));
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
function norm(s: string): string {
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

function lcsLen(a: string, b: string): number {
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
  /**
   * ⚠️ คำถาม "ทำได้ไหม/ใช้กับอะไรได้" เป็นคำถามความรู้ ไม่ใช่ถามตัวเลือกของสินค้าตัวใดตัวหนึ่ง
   * เช่น "งานเคลือบฟอย เคลือบได้ที่กระดาษความหนาเท่าไหร่บ้าง" — ประธานคือ "งานเคลือบฟอย"
   * แต่ระบบไปจับคำว่า "กระดาษ/ความหนา" แล้วยัดเมนูสินค้ากระดาษให้ (ลูกค้าเจอจริง)
   * คำถามแบบนี้ต้องปล่อยไปให้คลังความรู้ของ n8n ตอบ
   */
  if (/ได้ไหม|ได้บ้าง|ได้ที่|ได้กับ|ใช้กับ|รองรับ|ทำได้|เคลือบได้|พิมพ์ได้|สั่งได้|ต้องใช้|เหมาะ/i.test(text)) return false;
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
        "id, category, name:data->>name, slug:data->>slug, hidden:data->>hidden, rates:data->priceRates, hardMin:data->>hardMinQty",
      );
    const rows = (data ?? [])
      .filter((r) => r.id && r.name && !String(r.category ?? "").startsWith("__") && r.hidden !== "true")
      .map((r) => {
        const rates = ((r.rates ?? []) as { label?: string; minQty?: number; minQtyScope?: string; pricing?: { unit?: string } }[])
          .map((x) => ({ label: x?.label ?? "", min: Number(x?.minQty ?? 0) || 0, unit: x?.pricing?.unit || "ชิ้น" }));
        const hard = Number(r.hardMin ?? 0) || 0;
        const mins = rates.map((x) => x.min).filter((n) => n > 0);
        return {
          id: String(r.id),
          name: String(r.name),
          url: `${SITE_URL}${productPath({ id: String(r.id), slug: (r as { slug?: string }).slug } as Product)}`,
          min: hard || (mins.length === rates.length && mins.length ? Math.min(...mins) : 0),
          unit: ((r.rates ?? []) as { pricing?: { unit?: string } }[])[0]?.pricing?.unit || "ชิ้น",
          rates,
          lot: ((r.rates ?? []) as { minQtyScope?: string }[]).some((x) => x?.minQtyScope === "lot"),
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
export async function searchMinQty(query: string): Promise<PriceAnswer> {
  const rows = await minTable();
  if (!rows.length) return { answer: "", kind: "skip", source: "no-data", intent: "min_qty" };

  const { items } = await candidates(query);
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
    return {
      answer: lines.join("\n"),
      kind: "info",
      source: "web-price-engine",
      intent: "min_qty",
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
async function pickWithAI(
  query: string,
  items: Lite[],
): Promise<{ ids: string[]; broad: boolean } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !items.length) return null;

  const list = items.map((it) => `- ${it.name}`).join("\n");
  const prompt = `คุณเป็นแอดมินร้านพิมพ์/ผลิตตามสั่ง ลูกค้าถามว่า: "${query}"

รายการสินค้าทั้งหมดในระบบ:
${list}

เลือกว่าลูกค้าหมายถึงสินค้าตัวไหน ตอบ JSON เท่านั้น:
{"names": ["ชื่อสินค้าที่คัดลอกมาจากรายการด้านบนแบบคำต่อคำ"], "broad": true/false}

กติกา:
- เลือกเฉพาะสินค้าที่ลูกค้าพูดถึงจริง ๆ ห้ามเดาสินค้าใกล้เคียงที่ลูกค้าไม่ได้พูดถึง
- ⚠️ ชื่อใน names ต้องคัดลอกจากรายการด้านบนตรงตัวอักษรเป๊ะ ห้ามพิมพ์ชื่อเอง ห้ามย่อ
- ลูกค้าพูดชื่อกลุ่มกว้าง ๆ ที่มีหลายสินค้าเข้าข่าย (เช่น "พวงกุญแจ" "สแตนดี้") → ใส่ทุกตัวที่เข้าข่าย (สูงสุด 6) แล้ว broad = true
- ลูกค้าเจาะจงสินค้าเดียว → names มีตัวเดียว broad = false
- คำถามไม่ได้ถามถึงสินค้าใดเลย (ถามค่าส่ง นโยบาย ระยะเวลาผลิต วิธีสั่ง หรือถามความรู้ทั่วไป) → {"names": [], "broad": false}
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
  if (p.priceRates?.length)
    return p.priceRates.map((r) => ({ label: r.label, desc: r.desc, minQty: r.minQty, matrix: r.pricing }));
  return p.pricing ? [{ label: "", matrix: p.pricing }] : [];
}

/**
 * คอลัมน์ที่ "ตรงกับคำที่ลูกค้าพูด" — ถามมาว่า PVC ก็ไม่ต้องเทตารางกระดาษให้ดู
 * ไม่มีคอลัมน์ไหนตรงเลย = คืนทั้งหมด (ให้ลูกค้าเห็นตัวเลือกแล้วค่อยเลือก)
 */
function pickColumns(keys: string[], query: string): string[] {
  const q = norm(query);
  const hits = keys.filter((k) => k && norm(k).split("│").some((v) => v.length >= 2 && q.includes(v)));
  return hits.length ? hits : keys;
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

/**
 * ประกอบคำตอบราคาของสินค้าหนึ่งตัว — คืน null เมื่อสินค้านี้ตอบเป็นตารางไม่ได้
 * `narrow` = กำลังตอบหลายสินค้าพร้อมกัน ให้ย่อของแต่ละตัวลง ไม่งั้นคำตอบยาวจนไม่มีใครอ่าน
 */
function quote(p: Product, query: string, qty: number | null, narrow = false): PriceAnswer | null {
  const rates = ratesOf(p).slice(0, narrow ? 1 : MAX_RATES);
  if (!rates.length) return null;

  const url = `${SITE_URL}${productPath(p)}`;
  const lines: string[] = [];
  let printed = 0;

  for (const rate of rates) {
    const m = rate.matrix;
    // ยังไม่บอกจำนวน = ต้องกางทุกช่วงราคาอยู่แล้ว ถ้าเทหลายคอลัมน์ด้วยจะยาวจนลูกค้าไม่อ่าน
    // (เจอจริง: ถาม "พวงกุญแจมีเรทยังไงบ้าง" แล้วได้ตาราง 6 คอลัมน์ × 6 ช่วง เต็มจอ)
    const cap = narrow ? 2 : qty ? MAX_COLUMNS : 3;
    const all = pickColumns(Object.keys(m.cells), query);
    const keys = all.slice(0, cap);
    if (!keys.length) continue;

    const head = [rate.label, rate.desc].filter(Boolean).join(" — ");
    if (head) lines.push(`【${head}】${rate.minQty ? ` ขั้นต่ำ ${rate.minQty} ${m.unit || "ชิ้น"}` : ""}`);

    for (const key of keys) {
      const cells = m.cells[key] ?? [];
      if (!cells.some((n) => n > 0)) continue;
      printed++;

      if (qty) {
        // ลูกค้าบอกจำนวนมาแล้ว → ตอบตัวเลขเดียวที่ใช้จริง + ยอดรวม (คิดจากเครื่องเดียวกับตะกร้า)
        const i = tierIndex(m, qty);
        const unit = unitPriceAt(p, rate.label, m, key, qty) || cells[i] || 0;
        if (!unit) continue;
        lines.push(
          `• ${columnText(m, key)} — ${qty.toLocaleString()} ${m.unit || "ชิ้น"}: ` +
            `${formatPrice(unit)}/${m.unit || "ชิ้น"} (รวม ${formatPrice(unit * qty)})`,
        );
      } else {
        // ยังไม่บอกจำนวน → กางขั้นบันไดให้ครบทุกช่วง (system prompt ของ n8n ห้ามย่อเหลือราคาเริ่มต้น)
        const steps = cells
          .map((v, i) => (v > 0 ? `${tierText(m, i)} = ${formatPrice(v)}` : ""))
          .filter(Boolean)
          .join(" · ");
        if (steps) lines.push(`• ${columnText(m, key)}: ${steps}`);
      }
    }
    if (all.length > keys.length)
      lines.push(`  (ยังมีอีก ${all.length - keys.length} แบบในเรทนี้ — เลือกดูครบได้ที่หน้าสินค้า)`);
  }

  if (!printed) return null;

  const unit = rates[0].matrix.unit || "ชิ้น";
  const header = qty
    ? `${p.name} — สั่ง ${qty.toLocaleString()} ${unit}`
    : `${p.name} (ราคาต่อ ${unit} ตามช่วงจำนวน)`;

  return {
    answer: `${header}\n${lines.join("\n")}\n${url}`,
    // หลายคอลัมน์/หลายเรท = ลูกค้าต้องเลือกแบบก่อน → บอก n8n ว่าห้ามย่อรายการทิ้ง
    kind: printed > 1 ? "price-options" : "price",
    source: "web-price-engine",
    intent: qty ? "price_qty" : "price",
    product: { id: p.id, name: p.name, url },
  };
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
    answer: `${p.name}\n${lines.join("\n")}\n${SITE_URL}${productPath(p)}`,
    kind: "info",
    source: "web-price-engine",
    intent: "spec",
    product: { id: p.id, name: p.name, url: `${SITE_URL}${productPath(p)}` },
  };
}

/**
 * สินค้าที่เข้าข่ายคำถามนี้ — ใช้ AI เป็นหลัก ตกมาที่การเทียบตัวอักษรเมื่อ AI ใช้ไม่ได้
 * `broad` = ลูกค้าพูดชื่อกลุ่มกว้าง ๆ ที่มีหลายตัวเข้าข่าย → ผู้เรียกควรกางเมนูให้เลือกก่อน
 */
async function candidates(query: string): Promise<{ items: Lite[]; broad: boolean }> {
  const all = await catalog().catch(() => []);
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

/** ค้นหาสเปกสินค้าตามคำถาม — คำถามกว้างคืนเมนูให้เลือกก่อนเหมือนฝั่งราคา */
export async function searchSpec(query: string): Promise<PriceAnswer> {
  const q = query.trim();
  const { items, broad } = await candidates(q);
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
    return `• ${it.name}${price}\n  ${SITE_URL}${productPath(it as unknown as Product)}`;
  });
  return {
    answer:
      mode === "spec"
        ? `กลุ่มนี้มีหลายแบบ แต่ละแบบมีขนาด/ตัวเลือกไม่เหมือนกันครับ\n${lines.join("\n")}\n\nสนใจแบบไหนครับ เดี๋ยวบอกขนาดกับตัวเลือกให้ครบ`
        : `ของกลุ่มนี้มีหลายแบบ ราคาต่างกันตามแบบและจำนวนครับ\n${lines.join("\n")}\n\nสนใจแบบไหนกับจำนวนเท่าไหร่ครับ เดี๋ยวแจ้งเรทเต็มให้`,
    kind: "price-options",
    source: "web-price-engine",
    intent: mode === "spec" ? "spec_menu" : "price_menu",
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
  opts: { qty?: number | null; allowFallback?: boolean; timeoutMs?: number } = {},
): Promise<PriceAnswer> {
  const q = query.trim();
  const qty = opts.qty ?? parseQty(q);
  const allowFallback = opts.allowFallback !== false;

  const { items, broad } = await candidates(q);
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
