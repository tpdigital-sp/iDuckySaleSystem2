import { NextResponse } from "next/server";
import { buildChatContext } from "@/lib/server/chat-context";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * แชทลูกค้าหน้าเว็บ → ต่อเข้า "สมองเดียวกัน" กับหน้าแชทของ AdminBuddy (chat.html)
 *
 * ทำไมต้องผ่าน API route ไม่ยิงตรงจากเบราว์เซอร์:
 *  - หน้า chat.html เป็นไฟล์สแตติกในเครื่อง (localhost:8765) ลูกค้าเรียกไม่ได้
 *    ตัวที่ตอบจริงคือ n8n webhook ที่ chat.html เรียกอยู่ → เว็บร้านคุยกับ webhook ตัวเดียวกัน
 *  - ซ่อน URL/คีย์ไม่ให้โผล่ฝั่งลูกค้า + กันสแปมได้ + ไม่ติด CORS
 *
 * ตั้งค่าได้ด้วย env CHAT_WEBHOOK_URL (ถ้าไม่ตั้ง ใช้ตัวเดียวกับ chat.html)
 */
const WEBHOOK = process.env.CHAT_WEBHOOK_URL || "https://n8n.iduckybot.com/webhook/knowledge-chat";

/** เผื่อ n8n คิดนาน — ยาวกว่านี้ฟังก์ชันบน Netlify จะโดนตัดก่อน */
const TIMEOUT_MS = 25_000;

/** กันสแปมแบบง่าย ๆ ในหน่วยความจำ (ต่อ instance) — 20 ข้อความ/5 นาที ต่อ IP */
const RATE_MAX = 20;
const RATE_WINDOW_MS = 5 * 60_000;
const hits = new Map<string, number[]>();

function tooMany(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return list.length > RATE_MAX;
}

/** n8n ตอบมาได้หลายทรง — ดึงข้อความออกมาให้ได้ทุกแบบ (ล้อตาม chat.html) */
function pickReply(data: unknown): string {
  if (typeof data === "string") return data.trim();
  if (Array.isArray(data)) {
    for (const item of data) {
      const t = pickReply(item);
      if (t) return t;
    }
    return "";
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["output", "text", "response", "message", "answer", "reply"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    if (o.data) return pickReply(o.data);
  }
  return "";
}

export async function POST(req: Request) {
  let body: { message?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const message = (body.message ?? "").trim().slice(0, 1000);
  const sessionId = (body.sessionId ?? "").trim().slice(0, 80) || `web-${Date.now()}`;
  if (!message) return NextResponse.json({ error: "ยังไม่ได้พิมพ์ข้อความ" }, { status: 400 });

  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  if (tooMany(ip))
    return NextResponse.json(
      { error: "ส่งข้อความถี่เกินไปครับ พักสักครู่แล้วลองใหม่ หรือทักไลน์ร้านได้เลย" },
      { status: 429 },
    );

  // แนบบริบทชุดเดียวกับที่หน้าแชท AdminBuddy (chat.html) ส่ง — แค็ตตาล็อก/ลิงก์ราคา/คลังความรู้
  // ล้มก็ยังถามต่อได้ แค่ได้คำตอบกว้างกว่าเดิม จึงไม่ให้ throw ออกมา
  const ctx = await buildChatContext(message).catch(() => null);

  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sessionId,
        userId: `web-${sessionId}`,
        source: "website",
        systemMessage: ctx?.systemMessage,
        knowledgeContext: ctx?.knowledgeContext,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "ผู้ช่วยตอบไม่ทันครับ ทักไลน์ร้านได้เลย เดี๋ยวแอดมินดูแลต่อให้" }, { status: 502 });
    }

    const raw = await res.text();
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* บาง workflow ตอบเป็นข้อความเปล่า ๆ */
    }

    const reply = pickReply(data);
    if (!reply || /error in workflow|internal error/i.test(reply)) {
      return NextResponse.json({ error: "ตอนนี้ผู้ช่วยตอบไม่ได้ครับ ทักไลน์ร้านได้เลย เดี๋ยวแอดมินช่วยดูให้" }, { status: 502 });
    }

    return NextResponse.json({ reply }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ผู้ช่วยตอบช้ากว่าปกติครับ ลองพิมพ์ใหม่ หรือทักไลน์ร้านได้เลย" }, { status: 504 });
  }
}
