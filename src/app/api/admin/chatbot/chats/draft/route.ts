import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/line-chat";
import { sendBotDraft, discardBotDraft } from "@/lib/server/bot-drafts";
import { openLearningFromDraft } from "@/lib/server/bot-learning";
import { inBackground } from "@/lib/server/background";
import { syncCurrentCycleSoon } from "@/lib/server/chat-stats-sync";

export const runtime = "nodejs";

/**
 * 📝 ร่างคำตอบของบอท (โหมด draft — เจ้าของร้าน 13 ต.ค. 69)
 *   POST { action: "send", id, logId, text? }   → push เข้า LINE (แก้ข้อความก่อนส่งได้) · สิทธิ์ chat.reply
 *   POST { action: "discard", id, logId }       → ทิ้ง ลูกค้าไม่ได้รับ · สิทธิ์ chat.reply
 *   POST { action: "learn", id, logId }         → ไม่ส่ง + เปิดเรื่องในหน้า 🎓 บอทเรียนรู้ ให้แอดมินตอบลูกค้าเองแล้วสอนบอท (14 ต.ค. 69) · สิทธิ์ chat.reply
 *   POST { action: "mode", mode }               → สลับโหมดบอททั้งร้าน "draft" (ร่างให้กดส่ง) / "log-only" (เก็บแชทอย่างเดียว) · สิทธิ์ settings.manage
 */
const MODES = ["draft", "log-only"] as const;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; logId?: string; text?: unknown; mode?: string };
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });

  if (b.action === "mode") {
    const gate = await requirePerm("settings.manage");
    if (gate.res) return gate.res;
    const mode = String(b.mode ?? "");
    if (!(MODES as readonly string[]).includes(mode)) return NextResponse.json({ error: "โหมดไม่ถูกต้อง" }, { status: 400 });
    const who = gate.actor.name || gate.actor.username;
    await db.collection("settings").doc("bot-whitelist").set({ mode, modeBy: who, modeAt: new Date() }, { merge: true });
    return NextResponse.json({
      ok: true,
      mode,
      saved: mode === "draft" ? "เปิดโหมดร่าง — บอทร่างคำตอบให้ทุกห้อง ลูกค้ายังไม่ได้รับจนกว่าจะกดส่ง" : "ปิดโหมดร่าง — บอทเก็บแชทอย่างเดียว ไม่ร่าง ไม่ตอบ",
    });
  }

  const gate = await requirePerm("chat.reply");
  if (gate.res) return gate.res;
  const id = String(b.id ?? "").trim();
  const logId = String(b.logId ?? "").trim();
  if (!/^U[0-9a-f]{32}$/.test(id) || !/^[A-Za-z0-9]{10,40}$/.test(logId)) return NextResponse.json({ error: "ข้อมูลร่างไม่ถูกต้อง" }, { status: 400 });
  const who = gate.actor.name || gate.actor.username;

  if (b.action === "discard" || b.action === "learn") {
    const r = await discardBotDraft(db, id, logId, who);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    if (b.action === "discard") return NextResponse.json({ ok: true, saved: "ทิ้งร่างแล้ว — ลูกค้าไม่ได้รับข้อความนี้" });
    const learningId = await openLearningFromDraft(db, id, logId, who).catch(() => null);
    return NextResponse.json({
      ok: true,
      learningId,
      saved: learningId ? "ไม่ส่งร่างแล้ว — พิมพ์ตอบลูกค้าเองได้เลย · เรื่องนี้ไปรอสอนบอทที่หน้า 🎓 บอทเรียนรู้" : "ไม่ส่งร่างแล้ว (เปิดเรื่องให้บอทเรียนรู้ไม่สำเร็จ)",
    });
  }
  if (b.action === "send") {
    const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
    if (!token) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า LINE (LINE_MESSAGING_ACCESS_TOKEN)" }, { status: 503 });
    const r = await sendBotDraft(db, id, logId, { text: typeof b.text === "string" ? b.text : undefined, who, token });
    if (!r.ok) return NextResponse.json({ error: r.error, quota: r.quota }, { status: r.status });
    inBackground("chat-stats sync", syncCurrentCycleSoon(db));
    return NextResponse.json({ ok: true, sent: true, entry: r.entry });
  }
  return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
}
