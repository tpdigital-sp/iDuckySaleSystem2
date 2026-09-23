import { NextResponse } from "next/server";
import {
  catalogRefs,
  isMinQtyIntent,
  isPriceIntent,
  isSpecIntent,
  parseQty,
  searchMinQty,
  searchPrice,
  searchSpec,
  type PriceAnswer,
  type ProductRef,
} from "@/lib/server/price-answer";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 💰 ปลายทางกลางของ "ราคา" — ทุกช่องทางถามที่นี่ที่เดียว
 *
 * เดิม tool search_pricing ของ agent ใน n8n ยิงไปที่ webhook /pricing-search ซึ่งมีสมองราคา
 * เขียนมือแยกอีกชุด (Code node 50,000 ตัวอักษร) คนละตัวกับ unitPriceFor ที่ตะกร้าใช้คิดเงินจริง
 * ราคาที่บอทบอกกับราคาที่ลูกค้าจ่ายจึงไม่ผูกกัน · เส้นทางนี้ตอบด้วยเครื่องคิดเงินตัวเดียวกับตะกร้า
 *
 * รูปแบบคำตอบทำให้ "เหมือน webhook เดิมเป๊ะ" (answer/result/response/text/kind/source/intent)
 * → สลับ URL ใน tool search_pricing มาที่นี่ได้เลย ไม่ต้องแก้ system prompt ของ agent สักบรรทัด
 *
 * 23 ก.ย. 69 — เปิดให้บอทนอกเว็บใช้ลิงก์+รูปของเว็บจริง:
 *   · `product` / `products[]` มี `url` (หน้าสินค้า iduckystore.com) + `image` (ภาพปกสินค้า)
 *   · `links[]` / `images[]` = ชุดเดียวกันแบบแบน ๆ ให้ Code node ใน n8n หยิบง่าย
 *   · GET ?catalog=1 = รายชื่อสินค้าทั้งร้านพร้อมลิงก์/รูป/ช่วงราคา (AdminBuddy โหลดครั้งเดียวแทน price_links)
 *   · CORS เปิด — chat.html ของ AdminBuddy (localhost:8765 / Netlify) เรียกจากเบราว์เซอร์ตรง ๆ
 *   · เดาประเภทคำถามให้: ขั้นต่ำ → searchMinQty · สเปก → searchSpec · อื่น ๆ → searchPrice
 *     (บังคับได้ด้วย `mode`: "price" | "spec" | "minqty")
 *
 * ทดสอบ:  curl -X POST <SITE>/api/pricing/search -H 'Content-Type: application/json' \
 *              -d '{"query":"พวงกุญแจอะคริลิค 100 ชิ้น"}'
 * เทียบกับของเดิม: ใส่ "noFallback": true จะไม่ส่งต่อ n8n (เห็นชัดว่าเว็บตอบเองได้แค่ไหน)
 */

/** กันยิงรัว — 60 ครั้ง/นาที ต่อ IP (บอทเรียกถี่กว่าคนพิมพ์ จึงหลวมกว่าฝั่งแชท) */
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/** เปิดข้ามโดเมน — ปลายทางนี้เป็นสาธารณะอยู่แล้ว (ราคาเดียวกับหน้าสินค้า) ไม่มีข้อมูลลูกค้า */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function tooMany(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return list.length > RATE_MAX;
}

function clientIp(req: Request) {
  return (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
}

function json(body: unknown, init: { status?: number; cache?: string } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...CORS, "Cache-Control": init.cache ?? "no-store" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * GET ?catalog=1 → แคตตาล็อกทั้งร้าน `{ items: ProductRef[], count, site }`
 * GET ?q=… → เหมือน POST {query} (ไว้ทดสอบจากเบราว์เซอร์)
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("catalog")) {
    const items = await catalogRefs();
    return json({ site: "https://iduckystore.com", count: items.length, items }, { cache: "public, max-age=300" });
  }
  const q = (u.searchParams.get("q") ?? u.searchParams.get("query") ?? "").trim();
  if (!q) return json({ error: "ใส่ ?q=คำถาม หรือ ?catalog=1" }, { status: 400 });
  return answer(req, { query: q, mode: u.searchParams.get("mode") ?? undefined, noFallback: true });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  return answer(req, body);
}

/** ประเภทคำถาม — ขั้นต่ำก่อน (มีคำว่า "1 ชิ้น" ปนราคาได้) · สเปกเฉพาะเมื่อไม่ใช่คำถามเงิน */
function pickMode(query: string, forced?: unknown): "price" | "spec" | "minqty" {
  if (forced === "spec" || forced === "minqty" || forced === "price") return forced;
  if (isMinQtyIntent(query)) return "minqty";
  // isSpecIntent ตัดคำเรื่องเงิน (ราคา/บาท/เรท) ออกแล้ว — "ขนาดเท่าไหร่บ้าง" จึงเป็นสเปก ไม่ใช่ราคา
  // (isPriceIntent นับ "เท่าไหร่" เป็นราคา ถ้าเช็คตัวนั้นก่อนจะเทตารางราคาให้คนที่ถามขนาด)
  if (isSpecIntent(query)) return "spec";
  return "price";
}

/**
 * คำถามที่ไม่ได้ถามราคา/สเปก/ขั้นต่ำ/จำนวนเลย ("ส่งไฟล์ยังไง") — ตัวจับคู่สินค้าด้วย AI ยังหยิบหมวดกว้าง ๆ
 * มาเป็นเมนูได้ (เจอจริง: ได้เมนูพวงกุญแจ 6 ตัว) → เมนูตอบได้เฉพาะเมื่อลูกค้าถามเรื่องพวกนี้จริง
 * สินค้าเจาะจงยังตอบตามปกติ (agent อาจส่งมาแค่ชื่อสินค้าโดด ๆ)
 */
function menuAllowed(query: string, qty: number | null): boolean {
  if (qty || isPriceIntent(query) || isSpecIntent(query) || isMinQtyIntent(query)) return true;
  // พิมพ์มาแค่ชื่อหมวดสั้น ๆ ("เคสมือถือ") = อยากดูว่ามีอะไรบ้าง ให้เมนูได้ · ประโยคคำถามเรื่องอื่นไม่ให้
  return query.length <= 24 && !/ยังไง|อย่างไร|ไหม|มั้ย|ทำไม|ที่ไหน|เมื่อไหร่|กี่วัน|ส่ง|ไฟล์|โอน|ชำระ|เคลม/.test(query);
}

async function answer(req: Request, body: Record<string, unknown>) {
  const t0 = Date.now();

  // agent ฝั่ง n8n ส่งชื่อฟิลด์ไม่แน่นอนตามที่ LLM เลือกใส่ — รับให้ครบทุกชื่อที่เจอ
  const query = String(body.query ?? body.message ?? body.text ?? body.q ?? "")
    .trim()
    .slice(0, 500);
  if (!query) return json({ error: "ยังไม่ได้ส่งคำค้น" }, { status: 400 });

  if (tooMany(clientIp(req))) return json({ error: "ถี่เกินไป" }, { status: 429 });

  const qtyRaw = Number(body.qty ?? body.quantity ?? 0);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : parseQty(query);
  const mode = pickMode(query, body.mode);

  let ans: PriceAnswer;
  if (mode === "minqty") {
    ans = await searchMinQty(query);
  } else if (mode === "spec") {
    ans = await searchSpec(query);
  } else {
    ans = await searchPrice(query, { qty, allowFallback: body.noFallback !== true });
  }
  // ขั้นต่ำ/สเปกตอบไม่ได้ → ลองราคาต่อ (คำถามอย่าง "สั่ง 1 ชิ้นได้ไหม ราคาเท่าไหร่" ไม่ควรตอบว่างเปล่า)
  if (mode !== "price" && ans.kind === "skip") {
    ans = await searchPrice(query, { qty, allowFallback: body.noFallback !== true });
  }

  if (/_menu$/.test(ans.intent) && !menuAllowed(query, qty)) {
    ans = { answer: "", kind: "skip", source: "not-a-product-question", intent: "unknown" };
  }

  // ไม่มีคำตอบและไม่ใช่คำถามราคา → บอก agent ตรง ๆ ว่าเครื่องมือนี้ไม่ใช่ทางของคำถามนี้
  const text =
    ans.answer ||
    (isPriceIntent(query)
      ? "ยังไม่มีราคาของรายการนี้ในระบบ รบกวนถามแอดมินให้ตีราคาให้นะครับ"
      : "คำถามนี้ไม่ใช่คำถามราคา ไม่ต้องใช้ผลจากเครื่องมือนี้");

  const products: ProductRef[] = ans.products?.length ? ans.products : ans.product ? [ans.product] : [];
  const product = ans.product ?? products[0];

  return json({
    // 4 ชื่อนี้ซ้ำกันโดยตั้งใจ — workflow เดิมอ่านคนละฟิลด์กันแล้วแต่โหนด
    answer: text,
    result: text,
    response: text,
    text,
    kind: ans.kind,
    source: ans.source,
    intent: ans.intent,
    mode,
    found: ans.kind !== "skip" && !!ans.answer,
    qty: qty ?? null,
    ...(product ? { product } : {}),
    products,
    // แบน ๆ ให้ Code node / Flex builder หยิบตรง ๆ — ลิงก์และรูปของเว็บจริงเท่านั้น
    links: products.map((p) => p.url),
    images: products.map((p) => p.image).filter((s): s is string => !!s),
    site: "https://iduckystore.com",
    ms: Date.now() - t0,
  });
}
