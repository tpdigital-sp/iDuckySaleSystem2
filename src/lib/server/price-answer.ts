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
    .select("id, category, name:data->>name, slug:data->>slug, hidden:data->>hidden");
  return (data ?? [])
    .filter((r) => r.id && r.name && !String(r.category ?? "").startsWith("__") && r.hidden !== "true")
    .map((r) => ({ id: String(r.id), name: String(r.name), slug: r.slug ?? undefined, category: String(r.category ?? "") }));
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

/** ความยาวของสตริงย่อยที่ยาวที่สุดที่ตรงกัน (LCS แบบต่อเนื่อง) — วิธีเดียวกับที่ n8n ใช้ */
function lcsLen(a: string, b: string): number {
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
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
      const tokenScore = nameTokens(item)
        .filter((t) => q.includes(t))
        .reduce((s, t) => s + t.length, 0);
      const hay = norm(`${item.name} ${item.slug ?? ""}`);
      return { item, score: tokenScore ? tokenScore * 2 + lcsLen(q, hay) : 0 };
    })
    .filter((x) => x.score >= MIN_SCORE)
    // คะแนนเท่ากันให้ชื่อสั้นชนะ — ชื่อกว้างกว่าคือตัวที่ลูกค้าน่าจะหมายถึง (ยังไม่ได้ระบุรุ่นย่อย)
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length)
    .slice(0, 5);
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
    const keys = pickColumns(Object.keys(m.cells), query).slice(0, narrow ? 3 : MAX_COLUMNS);
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

  const hits = resolve(q, await catalog().catch(() => []));
  // สินค้าที่คะแนนสูสีกับอันดับ 1 = ลูกค้ายังไม่ได้เจาะจงรุ่น (เช่น "ถุงผ้าหูรูด" มี 2 ตัวบนเว็บ)
  // ต้องยกมาให้ครบเหมือนที่แอดมินตอบ ไม่ใช่เลือกให้เองตัวเดียวแล้วลูกค้าไม่รู้ว่ามีอีกแบบ
  const top = hits[0]?.score ?? 0;
  // เกณฑ์ต้องแน่นพอ ไม่งั้นคำว่า "อะคริลิค" ลากสินค้าคนละเรื่องเข้ามา
  // (เคยได้ "พรบ. อะคริลิค" แถมมากับคำถามพวงกุญแจอะคริลิค)
  const near = hits.filter((h) => h.score >= top * 0.85).slice(0, 3);
  const found: PriceAnswer[] = [];
  for (const { item } of near) {
    const full = await getProductServer(item.id).catch(() => undefined);
    if (!full) continue;
    const ans = quote(full, q, qty, near.length > 1);
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
    source: hits.length ? "web-price-engine" : "no-match",
    intent: "unknown",
  };
}
