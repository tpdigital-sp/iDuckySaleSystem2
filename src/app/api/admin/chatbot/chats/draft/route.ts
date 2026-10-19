import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/line-chat";
import { sendBotDraft, discardBotDraft, requestRedraft } from "@/lib/server/bot-drafts";
import { openLearningFromDraft } from "@/lib/server/bot-learning";
import { inBackground } from "@/lib/server/background";
import { classifyRoom } from "@/lib/server/chat-urgency";
import { syncCurrentCycleSoon } from "@/lib/server/chat-stats-sync";
import { FieldValue } from "firebase-admin/firestore";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";

export const runtime = "nodejs";

/**
 * 📝 ร่างคำตอบของบอท (โหมด draft — เจ้าของร้าน 13 ต.ค. 69)
 *   POST { action: "send", id, logId, text? }   → push เข้า LINE (แก้ข้อความก่อนส่งได้) · สิทธิ์ chat.reply
 *   POST { action: "discard", id, logId }       → ทิ้ง ลูกค้าไม่ได้รับ · สิทธิ์ chat.reply
 *   POST { action: "learn", id, logId }         → ไม่ส่ง + เปิดเรื่องในหน้า 🎓 บอทเรียนรู้ ให้แอดมินตอบลูกค้าเองแล้วสอนบอท (14 ต.ค. 69) · สิทธิ์ chat.reply
 *   POST { action: "mode", mode }               → สลับโหมดบอททั้งร้าน "draft" (ร่างให้กดส่ง) / "log-only" (เก็บแชทอย่างเดียว) · สิทธิ์ settings.manage
 *   POST { action: "delete", id, logId }        → ✕ ลบร่างทิ้งเฉย ๆ (ไม่ส่ง · ไม่เปิดเรื่องบอทเรียนรู้) · เฉพาะเจ้าของร้าน (Administrator) · 19 ต.ค. 69
 *   POST { action: "redraft", id }              → 🤖 ให้บอทร่างข้อความลูกค้าที่ค้างตอบตอนนี้ (19 ต.ค. 69 · requestRedraft) · สิทธิ์ chat.reply
 *   POST { action: "user", id, on }             → 📝 โหมดร่างรายคน (เจ้าของร้าน 19 ต.ค. 69 "เปิดโหมดร่างกับลูกค้าที่เลือกได้ไหม") · สิทธิ์ settings.manage
 *       เก็บที่ settings/bot-whitelist.draftUserIds — n8n Build AI Request: draftOnly = mode "draft" หรือ uid อยู่ในรายชื่อนี้
 *       (คนในรายชื่อ บอทคิดคำตอบให้แม้ร้านอยู่ log-only แต่เก็บเป็นร่างเสมอ ไม่ส่งถึงลูกค้าเอง)
 */
const MODES = ["draft", "log-only"] as const;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; logId?: string; text?: unknown; mode?: string; on?: boolean };
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

  if (b.action === "user") {
    const gate = await requirePerm("settings.manage");
    if (gate.res) return gate.res;
    const uid = String(b.id ?? "").trim();
    if (!/^U[0-9a-f]{32}$/.test(uid)) return NextResponse.json({ error: "รหัสห้องแชทไม่ถูกต้อง" }, { status: 400 });
    const on = b.on === true;
    const who = gate.actor.name || gate.actor.username;
    await db
      .collection("settings")
      .doc("bot-whitelist")
      .set({ draftUserIds: on ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid), draftUsersBy: who, draftUsersAt: new Date() }, { merge: true });
    if (!on) return NextResponse.json({ ok: true, on, saved: "ปิดร่างให้ลูกค้านี้แล้ว — กลับไปตามโหมดบอทของร้าน" });
    // 🤖 เปิดแล้วร่างเลย (เจ้าของร้าน 19 ต.ค. 69 "เมื่อเปิด 📝 ร่างก่อนส่ง แล้ว อยากให้ระบบทำงานอัตโนมัติเลย")
    //   ลูกค้าพิมพ์ค้างไว้ก่อนเปิด → สั่งบอทร่างทันที (requestRedraft ตัวเดียวกับปุ่ม 🤖) · ไม่มีข้อความค้าง/มีร่างอยู่แล้ว = เปิดเฉย ๆ
    const rd = await requestRedraft(db, uid, who);
    return NextResponse.json({
      ok: true,
      on,
      redraft: rd.ok,
      saved: rd.ok
        ? `เปิดร่างให้ลูกค้านี้แล้ว · 🤖 บอทกำลังร่างคำตอบข้อความที่ค้าง ${rd.count} ข้อความ — ขึ้นในห้องราว 15–30 วินาที`
        : rd.status === 502
          ? `เปิดร่างให้ลูกค้านี้แล้ว · แต่สั่งบอทร่างข้อความที่ค้างไม่สำเร็จ (${rd.error})`
          : "เปิดร่างให้ลูกค้านี้แล้ว — ลูกค้าพิมพ์มาเมื่อไหร่ บอทร่างคำตอบรอแอดมินกดส่ง",
    });
  }

  const gate = await requirePerm("chat.reply");
  if (gate.res) return gate.res;
  const id = String(b.id ?? "").trim();
  if (b.action === "redraft") {
    if (!/^U[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "รหัสห้องแชทไม่ถูกต้อง" }, { status: 400 });
    const r = await requestRedraft(db, id, gate.actor.name || gate.actor.username);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, count: r.count, saved: `🤖 ส่งข้อความลูกค้า ${r.count} ข้อความให้บอทร่างแล้ว — ร่างจะขึ้นในห้องราว 15–30 วินาที` });
  }
  const logId = String(b.logId ?? "").trim();
  if (!/^U[0-9a-f]{32}$/.test(id) || !/^[A-Za-z0-9]{10,40}$/.test(logId)) return NextResponse.json({ error: "ข้อมูลร่างไม่ถูกต้อง" }, { status: 400 });
  const who = gate.actor.name || gate.actor.username;

  if (b.action === "delete") {
    // ✕ เจ้าของร้าน 19 ต.ค. 69 "เพิ่มกากบาทกดลบให้หน่อย เห็นแค่สิทธิ์เจ้าของก่อน" — ร่างผิด/ไร้สาระ ลบทิ้งโดยไม่ต้องสอนบอท
    if (gate.actor.role !== ROLE_ADMINISTRATOR) return NextResponse.json({ error: "ลบร่างได้เฉพาะเจ้าของร้าน" }, { status: 403 });
    const r = await discardBotDraft(db, id, logId, who);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, saved: "ลบร่างแล้ว — ลูกค้าไม่ได้รับข้อความนี้" });
  }
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
    // 🤖🏷 ร้านเพิ่งตอบ → ให้ AI ประเมินป้ายความเร่งด่วนใหม่ทันที (ตอบครบแล้ว 🔴 ลดเป็น 🟢 ไม่ต้องรอลูกค้าพิมพ์มาอีก)
    inBackground("chat urgency", classifyRoom(id));
    return NextResponse.json({ ok: true, sent: true, entry: r.entry });
  }
  return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
}
