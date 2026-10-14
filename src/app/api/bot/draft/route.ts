import { NextResponse } from "next/server";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { verifyBotToken } from "@/lib/server/customer-profile";
import { saveBotDraft } from "@/lib/server/bot-drafts";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * 📝 บอท n8n (Reply Gate) ฝากคำตอบเป็น "ร่าง" ตอนโหมดบอท = draft — ยังไม่ส่งถึงลูกค้า รอแอดมินกดส่งในหน้า /admin/chatbot/chats
 *   POST { uid, messages: LINE message[], cards?, mode? } · Authorization: Bearer <Firebase ID token ของบอท> หรือ x-cron-secret
 *   ตอบ { ok, id } · เก็บไม่ได้ = ok:false (Reply Gate จดลง log ตรงแทน)
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bySecret = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!bySecret && !(await verifyBotToken(req.headers.get("authorization")))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ ok: false, reason: "no firestore" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { uid?: string; messages?: unknown; cards?: unknown; mode?: unknown };
  const r = await saveBotDraft(db, String(b.uid ?? "").trim(), { messages: b.messages, cards: b.cards, mode: b.mode }).catch((e) => ({ ok: false as const, reason: (e as Error).message }));
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
