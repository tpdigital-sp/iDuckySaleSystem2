import { NextResponse } from "next/server";
import { catalogRefs, knowledgeItems, searchMinQty, searchPrice, searchSpec, type ProductRef } from "@/lib/server/price-answer";
import { priceSearch } from "@/lib/server/price-search";

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
    // ⚠️ CDN ของ Netlify ไม่เอา query string เป็นส่วนของ cache key — ?knowledge=1&offset=25 เคยได้หน้า offset=0 ที่แคชไว้ (24 ก.ย. 69)
    headers: { ...CORS, "Cache-Control": init.cache ?? "no-store", "Netlify-Vary": "query" },
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
  // 📚 ?knowledge=1 → ชุดถาม-ตอบทุกสินค้า (ให้ workflow ซิงก์เข้า Pinecone ของ n8n) — หนัก (~228 สินค้า × 4-6 รายการ) แคช 30 นาที
  if (u.searchParams.get("knowledge")) {
    const offset = Number(u.searchParams.get("offset") ?? 0) || 0;
    const limit = Number(u.searchParams.get("limit") ?? 25) || 25;
    const page = await knowledgeItems(offset, limit);
    return json(
      { site: "https://iduckystore.com", generatedAt: new Date().toISOString(), offset, limit, total: page.total, next: page.next, count: page.items.length, items: page.items },
      { cache: "no-store" },
    );
  }
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
async function answer(req: Request, body: Record<string, unknown>) {
  if (tooMany(clientIp(req))) return json({ error: "ถี่เกินไป" }, { status: 429 });
  const r = await priceSearch(body);
  return json(r.body, { status: r.status });
}
