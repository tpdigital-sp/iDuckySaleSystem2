import "server-only";
import { FieldValue } from "firebase-admin/firestore";

/**
 * 📝 โหมด "บอทร่าง แอดมินกดส่ง" (เจ้าของร้าน 13 ต.ค. 69: "ฉันต้องการเป็นคนกดปุ่มส่งในสิ่งที่บอทตอบลูกค้า ยังไม่ต้องให้บอทส่งเอง กลัวให้ข้อมูลผิด")
 *
 * settings/bot-whitelist.mode = "draft" → บอท LINE (n8n LINE OA Bot) คิดคำตอบตามปกติ แต่ Reply Gate ไม่ส่งเข้า LINE
 *   ส่งมาเก็บที่ POST /api/bot/draft → saveBotDraft(): log ห้องนั้น role "draft" status "pending" + payload (ข้อความ LINE ทั้งชุด)
 *   แล้ว n8n ไปต่อที่ Save Memory (ความจำบอทจดคำตอบนี้ไว้เหมือนส่งแล้ว — ถ้าแอดมินแก้/ทิ้ง sendBotDraft/discardBotDraft ตามแก้ความจำให้)
 * หน้า /admin/chatbot/chats โชว์การ์ดร่างให้แก้ข้อความ → ส่ง (push นับโควตา LINE) หรือ ทิ้ง
 *
 * ⚠️ ร่างใหม่ของห้องเดียวกัน = ทับร่างเก่าที่ยังไม่ส่ง (status superseded) — Debounce ของบอทรวมข้อความลูกค้าที่ค้างตอบไว้ในรอบใหม่แล้ว
 * ⚠️ ส่งร่าง = push (reply token หมดอายุไปนานแล้ว) — นับโควตาเหมือนแอดมินพิมพ์ตอบ แต่ไม่พักบอท
 */
const COL = "line-conversations";
const MAX_PAYLOAD = 60_000;

export type DraftCard = { name: string; url: string; image?: string; price?: string };
export type LineMsg = { type: string; text?: string; altText?: string; [k: string]: unknown };

export function isDraftMode(mode: unknown): boolean {
  return String(mode ?? "") === "draft";
}

/** ข้อความ LINE ที่รับเก็บเป็นร่าง: text / image / flex / sticker ไม่เกิน 5 ฟอง (ข้อจำกัด LINE ต่อ 1 ครั้ง) */
export function cleanLineMessages(input: unknown): LineMsg[] {
  if (!Array.isArray(input)) return [];
  const ok = input
    .filter((m): m is LineMsg => !!m && typeof m === "object" && typeof (m as { type?: unknown }).type === "string")
    .filter((m) => ["text", "image", "flex", "sticker"].includes(m.type))
    .filter((m) => m.type !== "text" || String(m.text ?? "").trim())
    .slice(0, 5);
  return JSON.stringify(ok).length > MAX_PAYLOAD ? [] : ok;
}

/** ข้อความสรุปของร่างไว้โชว์ในห้องแชท (แบบเดียวกับ logReply ของ Reply Gate) */
export function draftSummary(msgs: LineMsg[]): string {
  return msgs
    .map((m) => (m.type === "text" ? String(m.text ?? "") : m.type === "image" ? "[รูป]" : m.type === "flex" ? `[การ์ด] ${String(m.altText ?? "")}` : "[สติกเกอร์]"))
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

type FlexNode = { type?: string; text?: string; url?: string; contents?: FlexNode[] | FlexNode; body?: FlexNode; footer?: FlexNode; hero?: FlexNode; action?: { uri?: string } };

/** การ์ดสินค้าจาก Flex (bubble/carousel) → ไว้วาดในหน้าแชท — ตรรกะเดียวกับ logReply ของ Reply Gate (ชื่อ = ข้อความแรก · ราคา = บรรทัดที่มี ฿/บาท) */
export function cardsOfFlex(msgs: LineMsg[]): DraftCard[] {
  const out: DraftCard[] = [];
  for (const m of msgs) {
    if (m.type !== "flex" || !m.contents) continue;
    const c = m.contents as FlexNode;
    const bubbles = c.type === "carousel" ? (Array.isArray(c.contents) ? c.contents : []) : [c];
    for (const bb of bubbles) {
      if (!bb || out.length >= 6) continue;
      const body = Array.isArray(bb.body?.contents) ? bb.body.contents : [];
      const texts = body.filter((x) => x?.type === "text").map((x) => String(x.text ?? ""));
      const foot = Array.isArray(bb.footer?.contents) ? bb.footer.contents : [];
      const btn = foot.find((x) => x?.type === "button")?.action ?? {};
      out.push({
        name: (texts[0] ?? "").slice(0, 80),
        url: String(btn.uri ?? bb.hero?.action?.uri ?? ""),
        ...(bb.hero?.url ? { image: String(bb.hero.url) } : {}),
        ...(texts.slice(1).find((t) => /฿|บาท/.test(t)) ? { price: texts.slice(1).find((t) => /฿|บาท/.test(t))!.slice(0, 60) } : {}),
      });
    }
  }
  return out.filter((c) => c.name || c.url);
}

/** 🤖 บอทฝากร่าง — เขียน log + ธงห้อง + ทับร่างเก่าที่ยังค้าง */
export async function saveBotDraft(
  db: FirebaseFirestore.Firestore,
  uid: string,
  input: { messages: unknown; cards?: unknown; mode?: unknown },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!/^U[0-9a-f]{32}$/.test(uid)) return { ok: false, reason: "uid" };
  const messages = cleanLineMessages(input.messages);
  if (!messages.length) return { ok: false, reason: "ไม่มีข้อความ" };
  const given: DraftCard[] = Array.isArray(input.cards)
    ? (input.cards as Record<string, unknown>[])
        .filter((c) => c && typeof c === "object")
        .slice(0, 6)
        .map((c) => ({ name: String(c.name ?? "").slice(0, 80), url: String(c.url ?? ""), ...(c.image ? { image: String(c.image) } : {}), ...(c.price ? { price: String(c.price).slice(0, 60) } : {}) }))
    : [];
  const cards = given.length ? given : cardsOfFlex(messages);
  const ref = db.collection(COL).doc(uid);
  const now = new Date();
  // ร่างเก่าที่ยังไม่ส่ง → ถูกทับ (ร่างนี้ตอบรวมข้อความที่ค้างแล้ว)
  const old = await ref.collection("log").where("role", "==", "draft").where("status", "==", "pending").get();
  const batch = db.batch();
  for (const d of old.docs) batch.update(d.ref, { status: "superseded", supersededAt: now });
  const logRef = ref.collection("log").doc();
  batch.set(logRef, {
    role: "draft",
    status: "pending",
    text: draftSummary(messages),
    payload: JSON.stringify(messages),
    ...(cards.length ? { cards } : {}),
    mode: String(input.mode ?? ""),
    at: now,
  });
  batch.set(ref, { draftPendingAt: now, lastSeen: now }, { merge: true });
  await batch.commit();
  return { ok: true, id: logRef.id };
}

type MemMsg = { role?: unknown; text?: unknown; at?: unknown; notice?: unknown };
const msOf = (v: unknown): number => {
  if (!v) return NaN;
  if (v instanceof Date) return v.getTime();
  const t = (v as { toDate?: () => Date }).toDate?.();
  if (t) return t.getTime();
  return Date.parse(String(v));
};

/**
 * 🧠 ตามแก้ความจำบอท (room.messages ที่ Save Memory เขียนคำตอบร่างไว้ราวกับส่งแล้ว)
 *   ร่างที่ถูกทิ้ง/ทับ → ลบคำตอบนั้นออก · ร่างที่แอดมินแก้ก่อนส่ง → เปลี่ยนเป็นข้อความที่ส่งจริง
 *   จับคู่ด้วยเวลา: Save Memory จดหลังร่างเข้ามา 0–2 นาที (ร่าง at ≈ เวลาที่บอทฝาก)
 */
async function fixMemory(db: FirebaseFirestore.Firestore, uid: string, fixes: { at: number; text: string | null }[]): Promise<void> {
  if (!fixes.length) return;
  const ref = db.collection(COL).doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const list = (Array.isArray(snap.get("messages")) ? [...(snap.get("messages") as MemMsg[])] : []) as MemMsg[];
    let changed = false;
    for (const f of fixes) {
      let best = -1;
      let bestGap = Infinity;
      list.forEach((m, i) => {
        if (String(m.role ?? "") !== "assistant") return;
        if (m.notice) return; // บรรทัดการ์ดระบบ (chat-notice-log) ไม่ใช่คำตอบร่าง
        const gap = msOf(m.at) - f.at;
        if (!Number.isFinite(gap) || gap < -30_000 || gap > 180_000) return;
        if (Math.abs(gap) < bestGap) {
          bestGap = Math.abs(gap);
          best = i;
        }
      });
      if (best < 0) continue;
      if (f.text === null) list.splice(best, 1);
      else list[best] = { ...list[best], text: f.text };
      changed = true;
    }
    if (changed) tx.update(ref, { messages: list, messageCount: list.length });
  });
}

/** ร่างที่ถูกทิ้ง/ทับแต่ยังไม่ได้ตามแก้ความจำ → แก้รวดเดียว (เรียกตอนแอดมินกดส่ง/ทิ้ง) */
async function staleFixes(db: FirebaseFirestore.Firestore, uid: string): Promise<{ fixes: { at: number; text: null }[]; refs: FirebaseFirestore.DocumentReference[] }> {
  const snap = await db.collection(COL).doc(uid).collection("log").where("role", "==", "draft").where("status", "in", ["superseded", "discarded"]).get();
  const todo = snap.docs.filter((d) => d.get("memoryFixed") !== true);
  return { fixes: todo.map((d) => ({ at: msOf(d.get("at")), text: null })), refs: todo.map((d) => d.ref) };
}

async function clearFlagIfDone(db: FirebaseFirestore.Firestore, uid: string): Promise<void> {
  const left = await db.collection(COL).doc(uid).collection("log").where("role", "==", "draft").where("status", "==", "pending").limit(1).get();
  if (left.empty) await db.collection(COL).doc(uid).set({ draftPendingAt: FieldValue.delete() }, { merge: true });
}

export type DraftResult = { ok: true; entry: Record<string, unknown> } | { ok: false; status: number; error: string; quota?: boolean };

/** ✅ แอดมินกดส่งร่าง (แก้ข้อความได้) → push เข้า LINE · log กลายเป็นคำตอบ assistant ที่แอดมินอนุมัติ */
export async function sendBotDraft(
  db: FirebaseFirestore.Firestore,
  uid: string,
  logId: string,
  opts: { text?: string; who: string; token: string },
): Promise<DraftResult> {
  const ref = db.collection(COL).doc(uid);
  const logRef = ref.collection("log").doc(logId);
  const d = await logRef.get();
  if (!d.exists || d.get("role") !== "draft") return { ok: false, status: 404, error: "ไม่พบร่างนี้" };
  const status = String(d.get("status") ?? "");
  if (status === "sent") return { ok: false, status: 409, error: "ร่างนี้ส่งไปแล้ว" };
  if (status === "sending") return { ok: false, status: 409, error: "กำลังส่งร่างนี้อยู่" };
  if (status === "discarded") return { ok: false, status: 409, error: "ร่างนี้ถูกทิ้งไปแล้ว — ส่งไม่ได้" };
  let msgs: LineMsg[] = [];
  try {
    msgs = cleanLineMessages(JSON.parse(String(d.get("payload") ?? "[]")));
  } catch {
    msgs = [];
  }
  // แอดมินแก้ข้อความ → ทับฟองข้อความแรก (ไม่มีฟองข้อความ = เติมไว้หน้าสุด) · ว่าง = ตัดฟองข้อความทิ้ง
  const edited = typeof opts.text === "string";
  if (edited) {
    const t = String(opts.text).trim().slice(0, 4900);
    const i = msgs.findIndex((m) => m.type === "text");
    if (t) {
      if (i >= 0) msgs[i] = { type: "text", text: t };
      else msgs.unshift({ type: "text", text: t });
    } else if (i >= 0) msgs.splice(i, 1);
    msgs = msgs.slice(0, 5);
  }
  if (!msgs.length) return { ok: false, status: 400, error: "ร่างนี้ไม่มีข้อความให้ส่ง" };

  // กันกดซ้ำสองเครื่องพร้อมกัน — จองสถานะก่อนยิง LINE
  const claimed = await db.runTransaction(async (tx) => {
    const cur = await tx.get(logRef);
    const s = String(cur.get("status") ?? "");
    if (s === "sent" || s === "sending" || s === "discarded") return false;
    tx.update(logRef, { status: "sending" });
    return true;
  });
  if (!claimed) return { ok: false, status: 409, error: "ร่างนี้กำลังส่งหรือส่งไปแล้ว" };

  let res: Response;
  try {
    res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
      body: JSON.stringify({ to: uid, messages: msgs }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    await logRef.update({ status }).catch(() => {});
    return { ok: false, status: 502, error: `ต่อ LINE ไม่ได้ — ${(e as Error).message}` };
  }
  if (!res.ok) {
    await logRef.update({ status }).catch(() => {});
    const detail = await res.text().catch(() => "");
    const quota = res.status === 429;
    return {
      ok: false,
      status: quota ? 429 : 502,
      quota,
      error: quota ? "โควตาข้อความ LINE เดือนนี้หมดแล้ว — คัดลอกร่างไปตอบใน LINE OA Manager แทนนะคะ" : `LINE ไม่รับข้อความ (HTTP ${res.status}) ${detail.slice(0, 160)}`,
    };
  }

  const now = new Date();
  const finalText = draftSummary(msgs);
  const original = String(d.get("text") ?? "");
  const changed = finalText !== original;
  await logRef.update({
    role: "assistant",
    status: "sent",
    text: finalText,
    payload: JSON.stringify(msgs),
    approvedBy: opts.who,
    approvedAt: now,
    sentAt: now,
    ...(changed ? { draftText: original, edited: true } : {}),
    ...(changed || status === "superseded" ? {} : { memoryFixed: true }),
  });
  await db.collection(COL).doc(uid).set({ lastSeen: now, lastAdminAt: now, lastAdminBy: opts.who, needsHumanFollowup: false }, { merge: true });

  // ความจำบอท: ร่างนี้ถูกแก้ → เปลี่ยนเป็นข้อความที่ส่งจริง · ร่างอื่นที่ทิ้ง/ทับ → ลบ
  const stale = await staleFixes(db, uid);
  const fixes: { at: number; text: string | null }[] = [...stale.fixes];
  if (changed) fixes.push({ at: msOf(d.get("at")), text: finalText });
  await fixMemory(db, uid, fixes).catch(() => {});
  await Promise.all([...stale.refs.map((r) => r.update({ memoryFixed: true }).catch(() => {})), changed ? logRef.update({ memoryFixed: true }).catch(() => {}) : null]);
  await clearFlagIfDone(db, uid);
  return { ok: true, entry: { id: logId, role: "assistant", text: finalText, at: now.toISOString(), by: opts.who, mode: "draft-approved" } };
}

/** 🗑 แอดมินทิ้งร่าง — ลูกค้าไม่ได้รับอะไร · ลบคำตอบนี้ออกจากความจำบอท */
export async function discardBotDraft(db: FirebaseFirestore.Firestore, uid: string, logId: string, who: string): Promise<DraftResult> {
  const logRef = db.collection(COL).doc(uid).collection("log").doc(logId);
  const d = await logRef.get();
  if (!d.exists || d.get("role") !== "draft") return { ok: false, status: 404, error: "ไม่พบร่างนี้" };
  const status = String(d.get("status") ?? "");
  if (status === "sent" || status === "sending") return { ok: false, status: 409, error: "ร่างนี้ส่งไปแล้ว" };
  await logRef.update({ status: "discarded", discardedBy: who, discardedAt: new Date() });
  const stale = await staleFixes(db, uid);
  await fixMemory(db, uid, stale.fixes).catch(() => {});
  await Promise.all(stale.refs.map((r) => r.update({ memoryFixed: true }).catch(() => {})));
  await clearFlagIfDone(db, uid);
  return { ok: true, entry: { id: logId, status: "discarded" } };
}

/** ✍️ แอดมินพิมพ์ตอบเองในห้องที่มีร่างค้าง → ร่างค้างทั้งหมดถือว่าทิ้ง (ไม่ให้ห้องติดป้าย "ร่างรอส่ง" ค้าง) */
export async function closePendingDrafts(db: FirebaseFirestore.Firestore, uid: string, who: string): Promise<number> {
  const snap = await db.collection(COL).doc(uid).collection("log").where("role", "==", "draft").where("status", "==", "pending").get();
  if (snap.empty) return 0;
  const now = new Date();
  await Promise.all(snap.docs.map((d) => d.ref.update({ status: "discarded", discardedBy: who, discardedAt: now, discardReason: "admin-replied" })));
  const stale = await staleFixes(db, uid);
  await fixMemory(db, uid, stale.fixes).catch(() => {});
  await Promise.all(stale.refs.map((r) => r.update({ memoryFixed: true }).catch(() => {})));
  await clearFlagIfDone(db, uid);
  return snap.size;
}

/** ข้อความฟองแรกของร่าง (ให้แอดมินแก้) — payload เก็บเป็น JSON ของข้อความ LINE */
export function draftEditableText(payload: unknown): string {
  try {
    const msgs = cleanLineMessages(JSON.parse(String(payload ?? "[]")));
    return String(msgs.find((m) => m.type === "text")?.text ?? "");
  } catch {
    return "";
  }
}
