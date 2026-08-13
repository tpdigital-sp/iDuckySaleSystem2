import { NextResponse } from "next/server";
import { buildChatContext, getKbTitleCandidates } from "@/lib/server/chat-context";
import { answerFromContext, askBackMessage, parseCustomerMessage } from "@/lib/server/chat-parse";

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
  const t0 = Date.now();
  let body: { message?: string; sessionId?: string; debug?: boolean };
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

  // ขั้นวิเคราะห์คำถามด้วย Gemini ก่อน (Smart Preprocessing แบบ chat.html)
  // — แยกสินค้า/วัสดุ/จำนวน/ประเภทคำถาม + เลือกหัวข้อ KB · ล้มเหลว = null แล้วใช้จับคู่คำแทน
  const kbTitles = await getKbTitleCandidates(message).catch(() => []);
  const parsed = await parseCustomerMessage(message, kbTitles);

  // ถามราคาแต่ AI ไม่แน่ใจว่าสินค้าอะไร → ถามลูกค้ากลับเลย ไม่เดาราคามั่ว (เหมือน chat.html)
  const askBack = askBackMessage(parsed);
  if (askBack) return NextResponse.json({ reply: askBack }, { headers: { "Cache-Control": "no-store" } });

  // แนบบริบทชุดเดียวกับที่หน้าแชท AdminBuddy (chat.html) ส่ง
  // — ผลวิเคราะห์ + ลิงก์สินค้าบนเว็บ + แค็ตตาล็อก/ลิงก์ราคา/คลังความรู้
  // ล้มก็ยังถามต่อได้ แค่ได้คำตอบกว้างกว่าเดิม จึงไม่ให้ throw ออกมา
  const ctx = await buildChatContext(message, parsed).catch(() => null);

  // 🔗 แนบลิงก์หน้าสินค้าบนเว็บต่อท้ายคำตอบ — agent ของ n8n ไม่ยอมใส่ลิงก์เองแม้ป้อนให้ใน context
  // (system prompt ของ workflow คุมรูปแบบคำตอบไว้) เว็บเลยแนบเองจากผลค้นหาสินค้าในระบบ
  // ใส่เฉพาะเมื่อค้นเจอสินค้าที่ตรงจริง และคำตอบยังไม่มีลิงก์เว็บร้านอยู่แล้ว
  const withProductLinks = (reply: string): string => {
    const linksToAttach = (ctx?.productLinks ?? []).slice(0, 2);
    if (!linksToAttach.length || /https?:\/\//.test(reply)) return reply;
    const lines = linksToAttach.map((l) => `• ${l.name}${l.price ? ` (${l.price})` : ""}\n${l.url}`);
    return `${reply}\n\n🛒 กดดูรายละเอียด/สั่งซื้อบนเว็บได้เลย:\n${lines.join("\n")}`;
  };

  let reply = "";
  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // ฝัง "คำแนะนำระบบ" ต่อท้ายข้อความ (สั่งให้ค้นราคา/จับวัสดุ/แปลงเซ็ต) แบบเดียวกับ chat.html
        message: message + (ctx?.messageHint ?? ""),
        sessionId,
        userId: `web-${sessionId}`,
        source: "website",
        systemMessage: ctx?.systemMessage,
        knowledgeContext: ctx?.knowledgeContext,
      }),
      // งบเวลารวมของฟังก์ชันมี 30 วิ (Netlify) — หักที่ใช้ไปแล้ว และกันท้ายไว้ ~7 วิ ให้ fallback ตอบเอง
      // (agent ฝั่ง n8n ใช้เวลา 6-20+ วิ แล้วแต่คำถาม — เกินโควตาเมื่อไหร่ตัดไปใช้ fallback ดีกว่าปล่อย error)
      signal: AbortSignal.timeout(Math.max(8_000, Math.min(TIMEOUT_MS, 22_000 - (Date.now() - t0)))),
    });

    if (res.ok) {
      const raw = await res.text();
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        /* บาง workflow ตอบเป็นข้อความเปล่า ๆ */
      }
      const picked = pickReply(data);
      if (picked && !/error in workflow|internal error/i.test(picked)) reply = picked;
    }
  } catch {
    /* n8n ช้าเกิน/ล่ม → ไปใช้ fallback ข้างล่าง */
  }

  // 🛟 n8n ไม่ตอบ/ตอบไม่ได้ → ตอบเองด้วย Gemini จาก context ที่ประกอบไว้ (แบบเดียวกับ fallback ของ chat.html)
  // ลูกค้าได้คำตอบจากข้อมูลร้านจริงเสมอ ดีกว่าข้อความ "ผู้ช่วยตอบช้า" เปล่า ๆ
  if (!reply) {
    const direct = await answerFromContext(message, ctx?.systemMessage, ctx?.knowledgeContext);
    if (direct) reply = direct;
  }

  if (!reply) {
    return NextResponse.json({ error: "ตอนนี้ผู้ช่วยตอบไม่ได้ครับ ทักไลน์ร้านได้เลย เดี๋ยวแอดมินช่วยดูให้" }, { status: 502 });
  }

  return NextResponse.json(
    {
      reply: withProductLinks(reply),
      // โหมดดีบัก (ส่ง debug:true มากับคำถาม) — ดูผลวิเคราะห์/ลิงก์ที่ระบบจับได้ ไว้ไล่ปัญหาคำตอบเพี้ยน ไม่มีข้อมูลลับ
      ...(body.debug ? { debug: { parsed, stats: ctx?.stats, links: ctx?.productLinks } } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
