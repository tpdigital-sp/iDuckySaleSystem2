import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { answerChat, type ChatProduct } from "@/lib/server/chat-answer";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 🤖 หลังบ้านของหน้า /admin/chatbot — แอดมินถามผู้ช่วยแทนลูกค้า แล้วคัดลอกคำตอบไปตอบใน LINE OA
 *
 * ย้ายมาจาก AdminBuddy chat.html (พอร์ต 8765 · 3 ต.ค. 69) ที่ถือคีย์ Gemini/Firebase ไว้ในหน้าเว็บ
 * ที่นี่ใช้สมองตัวเดียวกับแชทลูกค้าหน้าเว็บ (lib/server/chat-answer.ts โหมด staff)
 *
 * ประวัติบันทึกลง Firestore `chat-history` (ฐาน ordersure) ทรงเดียวกับที่ chat.html เขียน
 * → หน้า chathistory.html เดิมยังเห็นต่อได้ · ชื่อแอดมินมาจากบัญชีที่ล็อกอิน (ไม่ต้องพิมพ์ชื่อแบบเดิม)
 */
const HISTORY_COL = "chat-history";
const MAX_SAVED = 50;

/** products = สินค้า/รูปใต้คำตอบ (เฉพาะหน้านี้ · chathistory.html เดิมไม่อ่านช่องนี้ ไม่กระทบ) */
type Turn = { role: "user" | "bot"; text: string; timestamp: string; products?: ChatProduct[]; fromSite?: boolean };

/** GET → ประวัติแชทล่าสุด 30 รอบ (ทุกคน) · ?id= → ข้อความในรอบนั้น */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ sessions: [], offline: true });
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) {
      const d = await db.collection(HISTORY_COL).doc(id).get();
      if (!d.exists) return NextResponse.json({ error: "ไม่พบประวัติแชทนี้" }, { status: 404 });
      const x = d.data() ?? {};
      return NextResponse.json({ id: d.id, adminName: x.adminName ?? "", messages: (x.messages ?? []) as Turn[] });
    }
    // orderBy ฟิลด์เดียว ไม่ต้องสร้าง composite index
    const snap = await db.collection(HISTORY_COL).orderBy("lastActivity", "desc").limit(30).get();
    const sessions = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        adminName: String(x.adminName ?? ""),
        summary: String(x.summary ?? ""),
        lastActivity: String(x.lastActivity ?? ""),
        messageCount: Number(x.messageCount ?? 0),
      };
    });
    return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `โหลดประวัติไม่ได้: ${(e as Error).message}` }, { status: 502 });
  }
}

/** POST {message, sessionId, docId?, history[]} → {reply, docId} */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  let body: { message?: string; sessionId?: string; docId?: string; history?: { role?: string; text?: string; products?: ChatProduct[]; fromSite?: boolean }[]; debug?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "ยังไม่ได้พิมพ์คำถาม" }, { status: 400 });
  const sessionId = (body.sessionId ?? "").trim().slice(0, 80) || `admin-${Date.now()}`;
  const history = (body.history ?? []).filter((t) => typeof t?.text === "string" && t.text.trim());

  const r = await answerChat(
    { message, sessionId, debug: body.debug, history: history.map((t) => ({ role: t.role === "bot" ? "shop" : "customer", text: t.text })) },
    { ip: "admin", staff: true },
  );

  // 📝 บันทึกประวัติ — บันทึกไม่ได้ก็ยังส่งคำตอบให้แอดมินตามปกติ
  let docId = (body.docId ?? "").trim() || null;
  const db = getChatFirestore();
  if (db && r.body.reply) {
    try {
      const now = new Date().toISOString();
      const messages: Turn[] = [
        ...history.map((t) => ({
          role: (t.role === "bot" ? "bot" : "user") as Turn["role"],
          text: String(t.text).slice(0, 2000),
          timestamp: now,
          ...(t.role === "bot" && Array.isArray(t.products) && t.products.length ? { products: t.products.slice(0, 6) } : {}),
          ...(t.role === "bot" && t.fromSite ? { fromSite: true } : {}),
        })),
        { role: "user" as const, text: message.slice(0, 2000), timestamp: now },
        {
          role: "bot" as const,
          text: r.body.reply.slice(0, 2000),
          timestamp: now,
          ...(r.body.products?.length ? { products: r.body.products } : {}),
          ...(r.body.fromSite ? { fromSite: true } : {}),
        },
      ];
      const data = {
        sessionId,
        adminName: gate.actor.name || gate.actor.username,
        lastActivity: now,
        messageCount: messages.length,
        summary: messages.filter((m) => m.role === "user").map((m) => m.text).slice(0, 3).join(" | ").slice(0, 200),
        messages: messages.slice(-MAX_SAVED),
        source: "admin-chatbot",
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (docId) await db.collection(HISTORY_COL).doc(docId).set(data, { merge: true });
      else docId = (await db.collection(HISTORY_COL).add({ ...data, startTime: now })).id;
    } catch {
      /* ประวัติหาย 1 รอบ ไม่ใช่เหตุให้คำตอบหาย */
    }
  }

  return NextResponse.json({ ...r.body, docId }, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
