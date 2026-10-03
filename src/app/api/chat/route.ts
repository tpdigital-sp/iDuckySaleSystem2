import { NextResponse } from "next/server";
import { answerChat, type ChatBody } from "@/lib/server/chat-answer";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * แชทลูกค้าหน้าเว็บ (ChatWidget/HomeChat) — ตัวสมองอยู่ที่ lib/server/chat-answer.ts
 * (ใช้ร่วมกับหน้า 🤖 ผู้ช่วยตอบแชท หลังบ้าน /api/admin/chatbot)
 */
export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  const r = await answerChat(body, { ip });
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
