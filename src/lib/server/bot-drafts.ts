import "server-only";
import { productFlex, productsLinkedIn } from "@/lib/server/product-card";
import { priceSearch } from "@/lib/server/price-search";
import { sitePriceMessages, type SiteAnswer } from "@/lib/server/site-price-flex";
import { FieldValue } from "firebase-admin/firestore";
import { DRAFT_TTL_MS } from "@/lib/draft-live";

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

/**
 * 🧾 ร่างที่มีลิงก์สินค้า iduckystore.com → ใส่การ์ดสินค้าจากเว็บ (รูปจากหน้าสินค้า · ชื่อ · ช่วงราคา · ปุ่ม "ดูราคา / สั่งเลย")
 * แทนภาพตารางราคาเก่า (Firebase price-link-images ที่ n8n แนบมา) — เจ้าของร้าน 14 ต.ค. 69 "อยากให้เป็นลิงก์ราคาแบบการ์ด · รูปจากในเว็บเป็นหลัก"
 *   · หาสินค้าในแคตตาล็อกไม่เจอ = คงร่างเดิม (รูปเดิมยังเป็นทางสำรอง)
 *   · ตัดเฉพาะรูปตารางราคาเก่า — รูปอื่น (บัญชีโอน ฯลฯ) คงไว้ · สินค้าที่มีการ์ดอยู่แล้วไม่ใส่ซ้ำ · การ์ดหลายตัว = carousel ข้อความเดียว
 */
const LEGACY_PRICE_IMG = /price-link-images|price_links/i;
export async function upgradeDraftMessages(messages: LineMsg[]): Promise<LineMsg[]> {
  const texts = messages.filter((m) => m.type === "text").map((m) => String(m.text ?? ""));
  const found = await productsLinkedIn(texts).catch(() => []);
  if (!found.length) return messages;
  const have = new Set(cardsOfFlex(messages).map((c) => c.url.toLowerCase()));
  const fresh = found.filter((p) => !have.has(p.url.toLowerCase()));
  const kept = messages.filter((m) => {
    if (m.type !== "image") return true;
    const x = m as { originalContentUrl?: unknown; previewImageUrl?: unknown };
    return !LEGACY_PRICE_IMG.test(`${x.originalContentUrl ?? ""} ${x.previewImageUrl ?? ""}`);
  });
  if (!fresh.length) return kept.length ? kept : messages;
  // ช่องข้อความ LINE มี 5 — การ์ดต่อท้ายข้อความ ก่อนรูปที่เหลือ (ถ้าเต็ม ตัดรูปท้ายสุดออกก่อน)
  const card = productFlex(fresh) as unknown as LineMsg;
  const out = [...kept.filter((m) => m.type !== "image"), card, ...kept.filter((m) => m.type === "image")];
  return out.slice(0, 5);
}

/** 🤖 บอทฝากร่าง — เขียน log + ธงห้อง + ทับร่างเก่าที่ยังค้าง */
export async function saveBotDraft(
  db: FirebaseFirestore.Firestore,
  uid: string,
  input: { messages: unknown; cards?: unknown; mode?: unknown; source?: "web" },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!/^U[0-9a-f]{32}$/.test(uid)) return { ok: false, reason: "uid" };
  const messages = await upgradeDraftMessages(cleanLineMessages(input.messages));
  if (!messages.length) return { ok: false, reason: "ไม่มีข้อความ" };
  const given: DraftCard[] = Array.isArray(input.cards)
    ? (input.cards as Record<string, unknown>[])
        .filter((c) => c && typeof c === "object")
        .slice(0, 6)
        .map((c) => ({ name: String(c.name ?? "").slice(0, 80), url: String(c.url ?? ""), ...(c.image ? { image: String(c.image) } : {}), ...(c.price ? { price: String(c.price).slice(0, 60) } : {}) }))
    : [];
  const fromFlex = cardsOfFlex(messages);
  const cards = fromFlex.length ? fromFlex : given;
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
    // source "web" = ร่างบนเว็บเอง (↻/🤖 จากหน้าแชท · draftOnWeb) · ไม่มี = บอท n8n ฝากผ่าน /api/bot/draft
    ...(input.source ? { source: input.source } : {}),
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
      if (f.text === null) {
        // 🔁 20 ต.ค. 69 กด ↻/🤖 ซ้ำ ๆ: รอบร่างใหม่ Save Memory จดข้อความลูกค้าเดิมซ้ำคู่กับคำตอบ (at เดียวกัน) — เดิมลบแค่คำตอบ
        //    ข้อความลูกค้าซ้ำกองเต็ม 20 ช่อง (ห้อง iDuckyShop "3mm อคล ใส 1ด้าน" ×16) บริบท "พวงกุญแจ 5cm 10 ชิ้น" หลุด
        //    → เว็บคิดราคาไม่รู้ว่าสินค้าอะไร ตกไปเส้น agent ช้า 7–19 วิ + ตอบผิดสินค้า · ข้อความคู่ที่ซ้ำกับของเก่าในความจำ = ลบด้วย
        const prev = list[best - 1];
        const lines = String(prev?.text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
        const older = list.slice(0, best - 1).filter((m) => String(m.role ?? "") === "user").map((m) => String(m.text ?? ""));
        const dupUser = !!prev && String(prev.role ?? "") === "user" && msOf(prev.at) === msOf(list[best].at) && lines.length > 0 && lines.every((l) => older.some((t) => t.includes(l)));
        list.splice(dupUser ? best - 1 : best, dupUser ? 2 : 1);
      } else list[best] = { ...list[best], text: f.text };
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
  // ⏳ ร่างเก่าเกิน 24 ชม. / หมดอายุแล้ว = ห้ามส่ง (19 ต.ค. 69 ร่างค้างจาก 14–15 ต.ค. ยังกดส่งได้ — คำตอบเก่าหลายวันหลุดถึงลูกค้า)
  if (status === "expired" || Date.now() - msOf(d.get("at")) > DRAFT_TTL_MS) return { ok: false, status: 409, error: "ร่างนี้เก่าเกิน 24 ชม. แล้ว — ส่งไม่ได้ พิมพ์ตอบลูกค้าใหม่ในช่องด้านล่าง" };
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
/**  reason "expired" = ร่างหมดอายุ (scripts/expire-stale-drafts.mts · 19 ต.ค. 69) — ทิ้งแบบเดียวกัน ความจำบอทถูกตามแก้ด้วย */
export async function closePendingDrafts(db: FirebaseFirestore.Firestore, uid: string, who: string, reason: "admin-replied" | "expired" = "admin-replied"): Promise<number> {
  const snap = await db.collection(COL).doc(uid).collection("log").where("role", "==", "draft").where("status", "==", "pending").get();
  if (snap.empty) {
    await clearFlagIfDone(db, uid);
    return 0;
  }
  const now = new Date();
  await Promise.all(snap.docs.map((d) => d.ref.update({ status: "discarded", discardedBy: who, discardedAt: now, discardReason: reason })));
  const stale = await staleFixes(db, uid);
  await fixMemory(db, uid, stale.fixes).catch(() => {});
  await Promise.all(stale.refs.map((r) => r.update({ memoryFixed: true }).catch(() => {})));
  await clearFlagIfDone(db, uid);
  return snap.size;
}

/** ข้อความฟองแรกของร่าง (ให้แอดมินแก้) — payload เก็บเป็น JSON ของข้อความ LINE */
/**
 * 🖼 รูปที่ร่างจะส่งไปพร้อมข้อความ (ข้อความ image ใน payload) — หน้าแชทโชว์เป็นภาพย่อให้แอดมินเห็นก่อนกดส่ง
 * (เจ้าของร้าน 14 ต.ค. 69 "ต้องการเห็นภาพก่อน" · เดิมขึ้นแค่ "🖼 รูป")
 */
export function draftImages(payload: unknown): { url: string; preview: string }[] {
  try {
    return cleanLineMessages(JSON.parse(String(payload ?? "[]")))
      .filter((m) => m.type === "image")
      .map((m) => {
        const x = m as { originalContentUrl?: unknown; previewImageUrl?: unknown };
        const url = String(x.originalContentUrl ?? x.previewImageUrl ?? "");
        return { url, preview: String(x.previewImageUrl ?? url) };
      })
      .filter((x) => /^https:\/\//.test(x.url));
  } catch {
    return [];
  }
}

export function draftEditableText(payload: unknown): string {
  try {
    const msgs = cleanLineMessages(JSON.parse(String(payload ?? "[]")));
    return String(msgs.find((m) => m.type === "text")?.text ?? "");
  } catch {
    return "";
  }
}

/**
 * 🤖 "ให้บอทร่างตอนนี้" (เจ้าของร้าน 19 ต.ค. 69 "เปิด 📝 ร่างก่อนส่ง หลังจากที่ลูกค้าพิมพ์แชทมาแล้ว อยากให้ chatbot แสดงได้ไหม")
 * บอทร่างเฉพาะตอนมีข้อความใหม่เข้ามา → ข้อความที่ลูกค้าพิมพ์ไว้ก่อนเปิดสวิตช์ไม่มีร่าง
 * → เก็บข้อความลูกค้าที่ยังไม่มีใครตอบ (หลังคำตอบร้านล่าสุด) แล้วยิงเข้า webhook บอทเหมือนลูกค้าพิมพ์มาใหม่ พร้อมธง redraft
 *   n8n (LINE OA Bot): Parse LINE Event พก redraft · Build AI Request ไม่จดข้อความลูกค้าซ้ำ + บังคับร่าง (draftOnly) + ข้ามการพักบอท
 *   · โหนด HTTP Request (ส่งต่อ line-2track) ส่ง events ว่างเมื่อ body.redraft · ไม่มี replyToken = ส่งเข้า LINE ไม่ได้อยู่แล้ว
 *   ร่างกลับมาทาง /api/bot/draft ตามปกติ (~15–30 วิ) · กันกดรัว 45 วิ/ห้อง
 */
const BOT_WEBHOOK = "https://n8n.iduckybot.com/webhook/line-webhook-chatbot";
const REDRAFT_GAP_MS = 45_000;
/** via = "web" ร่างเสร็จแล้วในคำขอนี้ (ms = เวลาที่ใช้) · "n8n" ส่งให้บอท n8n ร่าง ร่างจะตามมาทีหลัง */
export type RedraftResult = { ok: true; count: number; text: string; via: "web" | "n8n"; ms?: number } | { ok: false; status: number; error: string };

/**
 * ⚡ 20 ต.ค. 69 เจ้าของร้าน "ก็ยังคงช้าเหมือนเดิม": กด ↻/🤖 แล้วร่างวิ่ง เว็บ → n8n (webhook 1–2 วิ · โหนดต่อคิว ~3 วิ) → เว็บ (pricing/search ~3 วิ) → n8n → เว็บ (bot/draft)
 *   รวม 7–10 วิ ทั้งที่สมองราคากับที่เก็บร่างอยู่บนเว็บนี้เอง → ร่างบนเว็บโดยตรง: เรียก priceSearch() ในโปรเซสเดียวกัน แล้วเขียนร่าง+ความจำบอทเอง
 *   เว็บตอบไม่ได้ (ไม่ใช่เรื่องราคา/สินค้า · เรื่องออเดอร์ · มีรูปเกี่ยวข้อง · ช้าเกิน) → คืน null ให้ส่ง n8n ตามเดิม (agent + คลังความรู้)
 *   ด่านคัดคำถามชุดเดียวกับ Build AI Request ใน n8n · ความจำบอท (room.messages) จดเหมือน Save Memory (ร่างถูกทิ้ง/แก้ → fixMemory ตามแก้ได้เหมือนเดิม)
 *   ข้อความจริงจากลูกค้ายังไปทาง n8n ทั้งหมด — ทางนี้เฉพาะแอดมินสั่งร่างจากหน้าแชท
 */
const WEB_SKIP_RE = /ออเดอร์|สลิป|โอนแล้ว|เลขพัสดุ|แทร็ค|track|ไฟล์แนบ|ขอคุยแอดมิน|เคลม/i;
const HANDOFF_RE = /ขอคุยแอดมิน|คุยกับแอดมิน|ติดต่อแอดมิน|เรียกแอดมิน|แอดมินอยู่ไหม|แอดมินอยู่มั้ย|มีแอดมินไหม|มีแอดมินมั้ย|ขอคุยกับคน|คุยกับคนจริง|ขอคนจริง|ไม่เอาบอท|ไม่คุยกับบอท|ขอแอดมิน|แอดมินตอบหน่อย|talk to (a )?human|admin please/i;
/** คำตอบสำรองของบอทที่ไม่ควรติดไปในประวัติ (Build AI Request · FALLBACK_RE) */
const FALLBACK_RE = /ขอเช็ก|เดี๋ยวแอดมินตอบกลับ|ฝ่ายผลิตแจ้งกลับ|แอดมินจะติดต่อกลับ|ขอแอดมินเช็ก/;
const SESSION_GAP_MS = 6 * 3600_000;
const IMG_FRESH_MS = 20 * 60_000;
const WEB_DRAFT_TIMEOUT_MS = 12_000;
type WebDraftResult = { ok: true; id: string; ms: number } | { ok: false; reason: string };
async function draftOnWeb(db: FirebaseFirestore.Firestore, uid: string, room: FirebaseFirestore.DocumentSnapshot, text: string, images: number): Promise<WebDraftResult> {
  const t0 = Date.now();
  const query = text.trim();
  const queryText = query.replace(/https?:\/\/\S+/g, "").trim();
  const shortNumReply = /^\s*(?:ข้อ|เอา|เลือก|แบบ|ขอ)?\s*\d{1,4}\s*(?:ชิ้น|อัน|ใบ|แผ่น|เซ็ต|เซต|ค่ะ|คะ|ครับ|นะคะ|เลย|จ้า)*\s*$/.test(queryText);
  if (!query || (queryText.length < 4 && !shortNumReply)) return { ok: false, reason: "short" };
  if (WEB_SKIP_RE.test(query) || HANDOFF_RE.test(query)) return { ok: false, reason: "topic" };
  // รูปปนอยู่ / มีรูปเข้ามาใน 20 นาที → บอท n8n มีผลวิเคราะห์รูปและกติกาตอบรวมรูป เว็บไม่มี
  if (images > 0) return { ok: false, reason: "image" };
  const lastImageAt = msOf(room.get("lastImageAt"));
  if (Number.isFinite(lastImageAt) && Date.now() - lastImageAt < IMG_FRESH_MS) return { ok: false, reason: "image-recent" };

  // ประวัติรอบนี้จากความจำบอท (เหมือน Build AI Request: ตัดคำตอบสำรอง · เงียบเกิน 6 ชม. = คนละรอบ · 16 บรรทัดท้าย)
  const raw = (Array.isArray(room.get("messages")) ? (room.get("messages") as MemMsg[]) : []).map((m) => ({
    role: String(m.role ?? "") === "user" ? "user" : "assistant",
    text: String(m.text ?? "").trim(),
    at: msOf(m.at),
  }));
  const clean = raw.filter((m) => m.role === "user" || !FALLBACK_RE.test(m.text));
  const session: typeof clean = [];
  let prevAt = Date.now();
  for (let i = clean.length - 1; i >= 0 && session.length < 16; i--) {
    const at = clean[i].at;
    if (Number.isFinite(at) && prevAt - at > SESSION_GAP_MS) break;
    if (Number.isFinite(at)) prevAt = at;
    session.unshift(clean[i]);
  }
  const history = session.map((m) => ({ role: m.role, text: m.text.slice(0, 400), at: Number.isFinite(m.at) ? new Date(m.at).toISOString() : undefined }));
  const context = history.filter((m) => m.role === "user").map((m) => m.text).slice(-5);
  const pf = (room.get("profile") ?? {}) as { text?: unknown; textAt?: unknown };
  const pAt = msOf(pf.textAt);
  const profile = typeof pf.text === "string" && Number.isFinite(pAt) && Date.now() - pAt < SESSION_GAP_MS ? pf.text : "";

  let site: SiteAnswer;
  try {
    const r = await Promise.race([
      priceSearch({ query, context, history, profile, noFallback: true }),
      new Promise<"timeout">((res) => setTimeout(() => res("timeout"), WEB_DRAFT_TIMEOUT_MS)),
    ]);
    if (r === "timeout") return { ok: false, reason: "timeout" };
    if (r.status !== 200) return { ok: false, reason: `http ${r.status}` };
    site = r.body as SiteAnswer;
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  const built = sitePriceMessages(site, query);
  if (!built) return { ok: false, reason: `intent ${String(site.intent ?? "")}` };

  const saved = await saveBotDraft(db, uid, { messages: built.messages, mode: "site", source: "web" });
  if (!saved.ok) return { ok: false, reason: saved.reason };
  // 🧠 ความจำบอท (เหมือน Save Memory ของ n8n): จดข้อความลูกค้า + คำตอบ เวลาเดียวกัน (fixMemory จับคู่จากเวลา) · ข้อความลูกค้าเดิมที่จดไว้แล้ว ไม่จดซ้ำ
  const ref = db.collection(COL).doc(uid);
  await db
    .runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const list = (Array.isArray(snap.get("messages")) ? [...(snap.get("messages") as MemMsg[])] : []) as MemMsg[];
      const now = new Date();
      const lastUser = [...list].reverse().find((m) => String(m.role ?? "") === "user");
      if (!lastUser || String(lastUser.text ?? "").trim() !== query) list.push({ role: "user", text: query, at: now });
      list.push({ role: "assistant", text: built.replyText, at: now });
      const next = list.slice(-20);
      tx.set(ref, { messages: next, messageCount: next.length, lastSeen: now, needsHumanFollowup: built.needsHumanFollowup }, { merge: true });
    })
    .catch(() => {});
  return { ok: true, id: saved.id, ms: Date.now() - t0 };
}

/** force = ร่างใหม่จากการ์ดร่าง (↻) — ร่างเดิมกลับมาแล้ว ไม่ต้องรอช่วงกันกดรัว */
export async function requestRedraft(db: FirebaseFirestore.Firestore, uid: string, who: string, opts: { force?: boolean } = {}): Promise<RedraftResult> {
  const ref = db.collection(COL).doc(uid);
  const room = await ref.get();
  if (!room.exists) return { ok: false, status: 404, error: "ไม่พบห้องแชทนี้" };
  const last = msOf(room.get("redraftAt"));
  if (!opts.force && Number.isFinite(last) && Date.now() - last < REDRAFT_GAP_MS) return { ok: false, status: 429, error: "เพิ่งสั่งให้บอทร่างไป — รอร่างขึ้นสักครู่ (ราว 15–30 วินาที)" };
  // ไล่จากข้อความล่าสุดย้อนขึ้นไป หยุดที่คำตอบร้าน (แอดมิน/บอท/ระบบ/ร่างที่ยังรอส่ง) — เหลือแต่ข้อความลูกค้าที่ยังไม่ได้ตอบ
  const snap = await ref.collection("log").orderBy("at", "desc").limit(40).get();
  const lines: string[] = [];
  let images = 0;
  for (const d of snap.docs) {
    const role = String(d.get("role") ?? "");
    if (role === "draft") {
      if (String(d.get("status") ?? "") === "pending" && Date.now() - msOf(d.get("at")) < DRAFT_TTL_MS) return { ok: false, status: 409, error: "ห้องนี้มีร่างรอส่งอยู่แล้ว — ส่งหรือกด \"ไม่ส่ง\" ร่างเดิมก่อน" };
      continue;
    }
    if (role !== "user") break;
    if (d.get("type") === "image") {
      images++;
      continue;
    }
    const t = String(d.get("text") ?? "").trim();
    if (t && !/^\[ลูกค้าส่ง(ไฟล์|สติกเกอร์)\]/.test(t)) lines.unshift(t);
  }
  if (!lines.length) return { ok: false, status: 409, error: images ? "ข้อความที่ค้างตอบมีแต่รูป — บอทร่างจากรูปย้อนหลังไม่ได้ พิมพ์ตอบเองได้เลย" : "ไม่มีข้อความลูกค้าที่ยังไม่ได้ตอบ" };
  const text = lines.join("\n").slice(0, 2000);
  await ref.set({ redraftAt: new Date(), redraftBy: who }, { merge: true });
  // ⚡ ร่างบนเว็บก่อน (คำถามราคา/สินค้า ~3–4 วิ) · ตอบไม่ได้ค่อยส่ง n8n
  const web = await draftOnWeb(db, uid, room, text, images).catch((e): WebDraftResult => ({ ok: false, reason: (e as Error).message }));
  if (web.ok) return { ok: true, count: lines.length, text, via: "web", ms: web.ms };
  console.info(`[redraft] ${uid.slice(0, 8)} เว็บร่างไม่ได้ (${web.reason}) → n8n`);
  const id = `redraft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const res = await fetch(BOT_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destination: "",
        redraft: true,
        events: [{ type: "message", mode: "active", redraft: true, webhookEventId: id, timestamp: Date.now(), replyToken: "", source: { type: "user", userId: uid }, message: { type: "text", id, text } }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    await ref.set({ redraftAt: FieldValue.delete() }, { merge: true }).catch(() => {});
    return { ok: false, status: 502, error: `ส่งให้บอทไม่ได้ (${(e as Error).message}) — ลองใหม่อีกครั้ง` };
  }
  return { ok: true, count: lines.length, text, via: "n8n" };
}
