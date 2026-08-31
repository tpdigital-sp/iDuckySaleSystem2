import { NextResponse } from "next/server";
import { isPriceIntent, parseQty, searchPrice } from "@/lib/server/price-answer";

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
 * ทดสอบ:  curl -X POST <SITE>/api/pricing/search -H 'Content-Type: application/json' \
 *              -d '{"query":"พวงกุญแจอะคริลิค 100 ชิ้น"}'
 * เทียบกับของเดิม: ใส่ "noFallback": true จะไม่ส่งต่อ n8n (เห็นชัดว่าเว็บตอบเองได้แค่ไหน)
 */

/** กันยิงรัว — 60 ครั้ง/นาที ต่อ IP (บอทเรียกถี่กว่าคนพิมพ์ จึงหลวมกว่าฝั่งแชท) */
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function tooMany(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return list.length > RATE_MAX;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  // agent ฝั่ง n8n ส่งชื่อฟิลด์ไม่แน่นอนตามที่ LLM เลือกใส่ — รับให้ครบทุกชื่อที่เจอ
  const query = String(body.query ?? body.message ?? body.text ?? body.q ?? "")
    .trim()
    .slice(0, 500);
  if (!query) return NextResponse.json({ error: "ยังไม่ได้ส่งคำค้น" }, { status: 400 });

  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  if (tooMany(ip)) return NextResponse.json({ error: "ถี่เกินไป" }, { status: 429 });

  const qtyRaw = Number(body.qty ?? body.quantity ?? 0);
  const ans = await searchPrice(query, {
    qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : parseQty(query),
    allowFallback: body.noFallback !== true,
  });

  // ไม่มีคำตอบและไม่ใช่คำถามราคา → บอก agent ตรง ๆ ว่าเครื่องมือนี้ไม่ใช่ทางของคำถามนี้
  const answer =
    ans.answer ||
    (isPriceIntent(query)
      ? "ยังไม่มีราคาของรายการนี้ในระบบ รบกวนถามแอดมินให้ตีราคาให้นะครับ"
      : "คำถามนี้ไม่ใช่คำถามราคา ไม่ต้องใช้ผลจากเครื่องมือนี้");

  return NextResponse.json(
    {
      // 4 ชื่อนี้ซ้ำกันโดยตั้งใจ — workflow เดิมอ่านคนละฟิลด์กันแล้วแต่โหนด
      answer,
      result: answer,
      response: answer,
      text: answer,
      kind: ans.kind,
      source: ans.source,
      intent: ans.intent,
      ...(ans.product ? { product: ans.product } : {}),
      ms: Date.now() - t0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
