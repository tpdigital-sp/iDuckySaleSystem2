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
  understand,
  type Pick,
  type PriceAnswer,
  type ProductRef,
  type Understanding,
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
 * คำถามที่ไม่ได้ถามราคา/สเปก/ขั้นต่ำ/จำนวนเลย — เครื่องคิดราคาต้อง "ไม่ตอบ" ปล่อยให้ agent ที่มีความจำตอบแทน
 * เจอจริง 23 ก.ย. 69 ในไลน์: ลูกค้าคุยเรื่องของติดรถยนต์อยู่แล้วพิมพ์ต่อว่า "เอาแบบกันฝนค่ะ" → เครื่องคิดราคาไม่รู้บริบท
 * จับคำว่า "กันฝน" เป็น "ร่มกอล์ฟ" แล้วเทตารางราคาร่มทับคำตอบของ agent ("ส่งไฟล์ยังไง" ก็เคยได้เมนูพวงกุญแจ)
 * ยกเว้นพิมพ์มาแค่ "ชื่อสินค้า/หมวด" สั้น ๆ ("เคสมือถือ" · agent ส่งชื่อสินค้าโดด ๆ) → ตอบได้
 */
function productQueryAllowed(query: string, qty: number | null): boolean {
  // "ตัวนี้เอา 50 ชิ้น" = อ้างถึงสินค้าที่คุยค้างไว้ — เครื่องคิดราคาไม่มีความจำ ตอบไปก็ผิดตัว ให้ agent ตอบ
  if (/ตัวนี้|อันนี้|แบบนี้|ตัวนั้น|อันนั้น|แบบนั้น|ตัวเดิม|แบบเดิม|อันเดิม|เหมือนเดิม|ตัวเมื่อกี้|อันเมื่อกี้|ที่ว่า|ตัวข้างบน/.test(query))
    return false;
  if (qty || isPriceIntent(query) || isSpecIntent(query) || isMinQtyIntent(query)) return true;
  // ประโยคที่มีคำกริยา/คำลงท้าย = คุยต่อจากบริบท ไม่ใช่ชื่อสินค้า
  return (
    query.length <= 24 &&
    !/ยังไง|อย่างไร|ไหม|มั้ย|ทำไม|ที่ไหน|เมื่อไหร่|กี่วัน|ส่ง|ไฟล์|โอน|ชำระ|เคลม|อยาก|เอา|ขอ|ค่ะ|คะ|ครับ|นะ|หน่อย|ได้|แบบ|ตัวนี้|อันนี้|ตัวนั้น/.test(
      query,
    )
  );
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
  let qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : parseQty(query);

  // 🧠 ข้อความก่อนหน้าของลูกค้า (เก่า→ใหม่) — LINE/AdminBuddy ส่งมาให้ชั้นเข้าใจคำถามใช้แก้ "เอาแบบกันฝน" ให้เป็นสินค้าจริง
  const context = (Array.isArray(body.context) ? body.context : typeof body.context === "string" ? [body.context] : [])
    .map((c) => String(c ?? "").trim())
    .filter(Boolean)
    .slice(-5);
  const u: Understanding | null = body.mode ? null : await understand(query, context);

  let mode: "price" | "spec" | "minqty" = pickMode(query, body.mode);
  let searchQuery = query;
  let pick: Pick | undefined;
  let ans: PriceAnswer | null = null;

  if (u) {
    // ลูกค้าถามหาของที่ร้านไม่มี → บอกตรง ๆ + เสนอตัวใกล้เคียง (เจอจริง 23 ก.ย. 69: "พวงกุญแจหนังปัก" ได้เมนูพวงกุญแจอะคริลิค/หมอนกลับไป)
    if (u.notInCatalog && ["price", "spec", "minqty"].includes(u.intent)) {
      const what = u.requested || query;
      const alts = u.alternatives;
      const lines = alts.map((a) => {
        const pr =
          a.priceMin && a.priceMax && a.priceMax > a.priceMin
            ? ` — ฿${a.priceMin.toLocaleString()}-${a.priceMax.toLocaleString()}`
            : a.priceMin
              ? ` — เริ่ม ฿${a.priceMin.toLocaleString()}`
              : "";
        return `• ${a.name}${pr}\n  ${a.url}`;
      });
      const text = alts.length
        ? `ตอนนี้ร้านยังไม่มี "${what}" ค่ะ ที่ใกล้เคียงกันมี:\n${lines.join("\n")}\nถ้าต้องการ "${what}" โดยเฉพาะ ทักแอดมินให้ตีราคาได้เลยค่ะ`
        : `ตอนนี้ร้านยังไม่มี "${what}" ค่ะ ถ้าต้องการงานลักษณะนี้ ทักแอดมินให้ตีราคาได้เลยค่ะ`;
      ans = { answer: text, kind: "info", source: "understood:not-in-catalog", intent: "not_in_catalog", product: alts[0], products: alts };
    } else if (["knowledge", "order", "chitchat", "other", "followup"].includes(u.intent)) {
      ans = { answer: "", kind: "skip", source: `understood:${u.intent}`, intent: "unknown" };
    } else {
      // price/spec/minqty — LLM ชี้สินค้ามาก็ใช้ ไม่ชี้ (แต่เขียนคำถามใหม่ให้ครบแล้ว เช่น "ที่ติดรถยนต์แบบกันฝนมีแบบไหนบ้าง")
      // ก็เอาคำถามฉบับสมบูรณ์ไปค้นต่อตามปกติ — เคยตั้งให้ skip แล้วบอทเงียบทั้งที่ตีความถูก (24 ก.ย. 69)
      mode = u.intent === "spec" ? "spec" : u.intent === "minqty" ? "minqty" : "price";
      if (u.ids.length) pick = { ids: u.ids, broad: u.broad };
      if (!qty && u.qty) qty = u.qty;
      // ใช้คำถามฉบับสมบูรณ์ (มีชื่อสินค้าจากบริบท) ไว้เลือกคอลัมน์/จับคู่ — แต่คงจำนวนจากข้อความจริง
      if (u.standalone && u.standalone.length <= 200) searchQuery = u.standalone;
      // ราคาโดยไม่ระบุสินค้าเลย (ถามลอย ๆ ว่า "ราคาเท่าไหร่") → ให้เส้นเดิมลองจับคู่จากข้อความ
    }
  }

  if (!ans) {
    if (!u && mode === "price" && !productQueryAllowed(query, qty)) {
      ans = { answer: "", kind: "skip", source: "not-a-product-question", intent: "unknown" };
    } else if (mode === "minqty") {
      ans = await searchMinQty(searchQuery, pick);
    } else if (mode === "spec") {
      ans = await searchSpec(searchQuery, pick);
    } else {
      ans = await searchPrice(searchQuery, { qty, allowFallback: body.noFallback !== true, pick });
    }
    // ขั้นต่ำ/สเปกตอบไม่ได้ → ลองราคาต่อ (คำถามอย่าง "สั่ง 1 ชิ้นได้ไหม ราคาเท่าไหร่" ไม่ควรตอบว่างเปล่า)
    if (mode !== "price" && ans.kind === "skip") {
      ans = await searchPrice(searchQuery, { qty, allowFallback: body.noFallback !== true, pick });
    }
  }

  if (!u && /_menu$/.test(ans.intent) && !productQueryAllowed(query, qty)) {
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
    // สิ่งที่ชั้นเข้าใจคำถามสรุปได้ — ไว้ดีบัก/ให้บอทปลายทางตัดสินใจ (ไม่มี = ใช้ regex)
    understood: u
      ? {
          intent: u.intent,
          products: u.products,
          qty: u.qty,
          standalone: u.standalone,
          confidence: u.confidence,
          notInCatalog: u.notInCatalog,
          requested: u.requested,
          alternatives: u.alternatives.map((a) => a.name),
        }
      : null,
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
