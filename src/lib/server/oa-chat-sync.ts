import "server-only";
import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { inBackground } from "@/lib/server/background";
import { loadChatIds, loadOaOwnerId } from "@/lib/server/line-chat";
import { fetchOaChatMessages, loadOaConfig, OA_AUTO_RESPONSE, OaError, type OaMessage } from "@/lib/server/line-oa-manager";

/**
 * 💬🔄 ดึงข้อความที่พนักงานพิมพ์เองใน LINE OA Manager (chat.line.biz) มาลง log ห้องแชท — ตอนเปิด/โพลห้องในหน้า /admin/chatbot/chats
 *
 * เจ้าของร้าน 15 ต.ค. 69: หน้าแชทอัปเดตสดแล้ว แต่ข้อความที่พนักงานตอบใน OA Manager ไม่เข้า (LINE ไม่ส่ง webhook ฝั่งแอดมิน)
 *   → เปิดห้อง = ถาม OA ว่าห้องนี้มีข้อความฝั่งบัญชีร้านใหม่กว่ารอบก่อนไหม แล้วเขียนลง log ด้วยรูปเดียวกับที่นำเข้าจาก CSV
 *     (scripts/import-oa-chat-csv.mts): role admin · mode "oa" · by ชื่อพนักงาน · id = oa-<sha1(เวลา(วินาที)|Account|ผู้ส่ง|ข้อความ)>
 *     → รัน CSV import ทีหลังก็ไม่ซ้ำ (id เดียวกัน) · ติด source "oa-live" แยกจาก "oa-csv"
 *
 *   · ต้องรู้ 2 อย่าง: คุกกี้ OA (settings/oa-manager) + รหัสห้องใน OA ของ userId นี้ (loadChatIds: customer-overrides + ลิงก์ในออเดอร์)
 *     ไม่มีอย่างใดอย่างหนึ่ง = ไม่ทำอะไร คืนสถานะให้หน้าจอบอก (ห้องเปิดได้ตามปกติ)
 *   · ยิง OA ไม่เกิน 1 ครั้ง/10 วิ ต่อห้อง (หน้าโพลทุก 3 วิ) · พลาด = พัก 60 วิ ต่อห้อง · คุกกี้ตาย (401/403) = พักทุกห้อง 60 วิ
 *   · รอ OA ไม่เกิน OA_WAIT_MS — ไม่ทันก็ตอบหน้าจอไปก่อน งานวิ่งต่อใน after() (Netlify แช่แข็งหลังตอบ · lib/server/background.ts) รอบโพลถัดไปเห็นเอง
 *   · เอาเฉพาะข้อความฝั่ง "บัญชีร้าน" (ลูกค้า webhook เก็บครบอยู่แล้ว) และกันซ้ำกับที่ log มีแล้ว (บอท/ตอบจากเว็บ/การ์ด ส่งผ่าน API ก็โผล่ใน OA เหมือนกัน):
 *     ข้อความเดียวกัน (ไม่สนช่องว่าง · n8n รวมหลายข้อความเป็น "a / b" → เทียบทีละท่อน) ห่าง ≤5 นาที = มีแล้ว · รูป/สติกเกอร์/ไฟล์ เทียบชนิด+เวลา ≤2 นาที
 *   · ไม่มีชื่อผู้พิมพ์ (OA ไม่บอก / ส่งผ่าน API) = role assistant mode "oa" (หน้าจอขึ้น "ร้าน (OA)") เหมือน "Unknown" ใน CSV · มีชื่อ = role admin → อัปเดต lastAdminAt
 *     + ล้างธง 🙋 รอแอดมิน (needsHumanFollowup) ถ้าแอดมินตอบหลังรอบบอทล่าสุด (เจ้าของร้าน 19 ต.ค. 69 · เดิมตอบใน OA แล้วธงค้าง ต้องตอบจากเว็บเท่านั้นถึงหาย)
 *   · ไม่แตะ lastSeen/messageCount (ของลูกค้า) · จำรอบล่าสุดที่ห้อง `oaSync` {at, chatId, path, added}
 */

const COL = "line-conversations";
const THROTTLE_MS = 10_000;
const FAIL_MS = 60_000;
const OA_WAIT_MS = 4_000;
const FIRST_WINDOW_MS = 48 * 3600_000;
const UNMAPPED_MS = 10 * 60_000;
const TEXT_WIN_MS = 5 * 60_000;
const MEDIA_WIN_MS = 2 * 60_000;

export type OaLive =
  | { state: "off"; reason: "no-cookie" | "no-bot" }
  | { state: "unmapped" }
  | { state: "ok"; added: number; at: string; pending?: boolean }
  | { state: "error"; error: string; at: string };

type Cached = { at: number; result: OaLive; job?: Promise<OaLive> };
const perRoom = new Map<string, Cached>();
/** คุกกี้ตาย/ต่อไม่ได้ — ไม่ยิงห้องไหนเลยจนกว่าจะพ้นเวลานี้ */
let globalFailUntil = 0;
let globalFailMsg = "";

/** ข้อความแทนรูป/ไฟล์ — ชุดเดียวกับ CSV import (hash ใช้คำดิบของ LINE · ที่โชว์ใช้คำอ่านง่าย) */
const MEDIA: Record<string, { raw: string; show: string }> = {
  image: { raw: "คุณส่งรูป", show: "🖼 ส่งรูปภาพ (ดูใน OA Manager)" },
  sticker: { raw: "คุณส่งสติกเกอร์", show: "(ส่งสติกเกอร์)" },
  file: { raw: "คุณส่งไฟล์", show: "📎 ส่งไฟล์ (ดูใน OA Manager)" },
  video: { raw: "คุณส่งวิดีโอ", show: "🎬 ส่งวิดีโอ (ดูใน OA Manager)" },
  location: { raw: "คุณส่งตำแหน่งที่ตั้ง", show: "(ส่งตำแหน่งที่ตั้ง)" },
  audio: { raw: "คุณส่งข้อความเสียง", show: "🎤 ส่งข้อความเสียง (ดูใน OA Manager)" },
};

const ws = (t: string) => t.replace(/\s+/g, " ").trim();

function tsOf(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "string") return Date.parse(v) || 0;
  const t = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  return 0;
}

/** รหัส entry แบบเดียวกับ CSV import → เวลาปัดเป็นวินาที (CSV ไม่มีมิลลิวินาที) · ผู้ส่งว่าง = "Unknown" เหมือน CSV */
export function oaEntryId(atMs: number, by: string, rawText: string): string {
  const sec = Math.floor(atMs / 1000) * 1000;
  return `oa-${createHash("sha1").update(`${sec}|Account|${by || "Unknown"}|${rawText}`).digest("hex").slice(0, 20)}`;
}

/** log ที่เป็นรอบบอท (ตอบเอง/ร่าง) — ไม่นับข้อความฝั่งร้านที่ดึงจาก OA (mode oa/auto) */
export function isBotTurn(role: unknown, mode: unknown): boolean {
  return role === "draft" || (role === "assistant" && mode !== "oa" && mode !== "auto");
}

export type Existing = { at: number; type: string; parts: string[] };

export function alreadyLogged(m: OaMessage, atMs: number, existing: Existing[]): boolean {
  const media = MEDIA[m.type];
  if (media || !m.text) {
    return existing.some((e) => e.type === m.type && Math.abs(e.at - atMs) <= MEDIA_WIN_MS);
  }
  const t = ws(m.text);
  return existing.some((e) => Math.abs(e.at - atMs) <= TEXT_WIN_MS && e.parts.includes(t));
}

/**
 * ซิงก์ห้องเดียว — เรียกจาก GET /api/admin/chatbot/chats?id= (ทั้งเปิดเต็มและโพล after=)
 * room = ข้อมูลเอกสารห้องที่ route อ่านมาแล้ว (ใช้ oaSync.at) · ไม่ throw (คืนสถานะเสมอ)
 */
export async function syncOaRoom(db: Firestore, userId: string, room: Record<string, unknown>): Promise<OaLive> {
  const now = Date.now();
  const cfg = await loadOaConfig();
  if (!cfg?.cookie) return { state: "off", reason: "no-cookie" };
  const cur = perRoom.get(userId);
  if (cur && now - cur.at < (cur.result.state === "error" ? FAIL_MS : THROTTLE_MS)) {
    // งานรอบก่อนยังวิ่งอยู่ (ตอบหน้าจอไปก่อนเพราะ OA ช้า) → ให้รอบนี้รอผลเดียวกันในเวลาที่เหลือ
    return cur.job ? waitFor(cur.job, cur.result) : cur.result;
  }
  if (now < globalFailUntil) return { state: "error", error: globalFailMsg, at: new Date(globalFailUntil - FAIL_MS).toISOString() };

  const botId = cfg.botId || (await loadOaOwnerId(db));
  if (!botId) return { state: "off", reason: "no-bot" };
  // รหัสห้อง OA: ตารางจับคู่ก่อน · ไม่มี = ลอง userId ตรง ๆ (OA จริง 15 ต.ค. 69: หลายห้อง chatId == userId ของลูกค้า · ห้องที่ไม่ใช่ OA ตอบ list ว่าง/404)
  //   ลองแล้วไม่ได้ = จำว่า unmapped ไว้ UNMAPPED_MS ไม่ยิงซ้ำทุกโพล
  const mapped = (await loadChatIds(db).catch(() => ({}) as Awaited<ReturnType<typeof loadChatIds>>))[userId]?.id;
  const chatId = mapped || userId;
  if (!mapped && cur?.result.state === "unmapped" && now - cur.at < UNMAPPED_MS) return cur.result;

  const job = pull(db, userId, room, botId, chatId, cfg.cookie, !mapped)
    .then((r) => {
      perRoom.set(userId, { at: Date.now(), result: r });
      return r;
    })
    .catch((e: unknown) => {
      const r: OaLive = { state: "error", error: e instanceof Error ? e.message : String(e), at: new Date().toISOString() };
      perRoom.set(userId, { at: Date.now(), result: r });
      return r;
    });
  const placeholder: OaLive = { state: "ok", added: 0, at: new Date(now).toISOString(), pending: true };
  perRoom.set(userId, { at: now, result: placeholder, job });
  inBackground("oa-chat-sync", job);
  return waitFor(job, placeholder);
}

async function waitFor(job: Promise<OaLive>, fallback: OaLive): Promise<OaLive> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const slow = new Promise<OaLive>((res) => {
    timer = setTimeout(() => res(fallback), OA_WAIT_MS);
  });
  try {
    return await Promise.race([job, slow]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pull(db: Firestore, userId: string, room: Record<string, unknown>, botId: string, chatId: string, cookie: string, guessed: boolean): Promise<OaLive> {
  const nowIso = new Date().toISOString();
  let fetched;
  try {
    fetched = await fetchOaChatMessages(botId, chatId, cookie, 50);
  } catch (e) {
    const err = e as OaError;
    if (err instanceof OaError && (err.status === 401 || err.status === 403 || err.status === 0)) {
      globalFailUntil = Date.now() + FAIL_MS;
      globalFailMsg = err.message;
    }
    // เดา userId เป็นรหัสห้องแล้ว OA ตอบ 404 = ห้องนี้ใช้รหัสอื่น ต้องผูกเอง
    if (guessed && err instanceof OaError && err.status === 404) return { state: "unmapped" };
    return { state: "error", error: (e as Error).message, at: nowIso };
  }
  // เดา userId แล้ว OA ตอบ list ว่าง = ไม่ใช่ห้องนี้ (ห้องจริงมีอย่างน้อยข้อความลูกค้า) → ยังไม่ผูก
  if (guessed && !fetched.messages.length) return { state: "unmapped" };
  const prevSync = tsOf((room.oaSync as Record<string, unknown> | undefined)?.at);
  const since = prevSync ? prevSync - 2 * 60_000 : Date.now() - FIRST_WINDOW_MS;
  const candidates = fetched.messages.filter((m) => m.from === "account" && Date.parse(m.at) >= since);
  const ref = db.collection(COL).doc(userId);
  let added = 0;
  let lastAdmin = 0;
  if (candidates.length) {
    const minAt = Math.min(...candidates.map((m) => Date.parse(m.at))) - TEXT_WIN_MS;
    const logSnap = await ref.collection("log").where("at", ">=", Timestamp.fromMillis(minAt)).select("role", "text", "type", "at", "mode").get();
    const ids = new Set(logSnap.docs.map((d) => d.id));
    // รอบบอทล่าสุด (ตอบ/ร่าง) — ธงรอแอดมินมาจากรอบบอทเท่านั้น · ก่อน minAt = เก่ากว่าข้อความแอดมินทุกตัวอยู่แล้ว
    const lastBot = Math.max(0, ...logSnap.docs.filter((d) => isBotTurn(d.get("role"), d.get("mode"))).map((d) => tsOf(d.get("at"))));
    const existing: Existing[] = logSnap.docs
      .filter((d) => d.get("role") !== "user" && d.get("role") !== "draft")
      .map((d) => ({ at: tsOf(d.get("at")), type: String(d.get("type") ?? "text"), parts: String(d.get("text") ?? "").split(" / ").map(ws).filter(Boolean) }));
    const batch = db.batch();
    for (const m of candidates) {
      const atMs = Date.parse(m.at);
      const media = MEDIA[m.type];
      const text = media ? media.show : m.text;
      if (!text) continue;
      const id = oaEntryId(atMs, m.by, media ? media.raw : m.text);
      if (ids.has(id) || alreadyLogged(m, atMs, existing)) continue;
      // มีชื่อ (bizId พนักงาน) = แอดมินพิมพ์ใน OA · __AUTO_RESPONSE = ตอบกลับอัตโนมัติของ LINE (mode auto เหมือน CSV) · ไม่มี bizId = ส่งผ่าน API (บอท/เว็บ — ปกติกันซ้ำไปแล้ว)
      const entry: Record<string, unknown> = m.by
        ? { role: "admin", type: media ? m.type : "text", text, mode: "oa", by: m.by }
        : { role: "assistant", type: media ? m.type : "text", text, mode: m.bizId === OA_AUTO_RESPONSE ? "auto" : "oa", by: "" };
      if (m.id) entry.oaMessageId = m.id;
      batch.set(ref.collection("log").doc(id), { ...entry, at: Timestamp.fromMillis(atMs), source: "oa-live", importedAt: Timestamp.now() });
      ids.add(id);
      added++;
      if (m.by && atMs > lastAdmin) lastAdmin = atMs;
    }
    const patch: Record<string, unknown> = { oaSync: { at: Timestamp.now(), chatId: fetched.chatId, path: fetched.path, added } };
    if (lastAdmin && lastAdmin > tsOf(room.lastAdminAt)) patch.lastAdminAt = Timestamp.fromMillis(lastAdmin);
    // แอดมินตอบใน OA หลังบอทส่งต่อ = รับงานแล้ว → ล้างธงแบบเดียวกับตอบจากเว็บ (reply route) · บอทยกธงใหม่ทีหลังได้ตามปกติ
    if (lastAdmin && lastAdmin >= lastBot && room.needsHumanFollowup === true) patch.needsHumanFollowup = false;
    batch.set(ref, patch, { merge: true });
    await batch.commit();
  } else {
    await ref.set({ oaSync: { at: Timestamp.now(), chatId: fetched.chatId, path: fetched.path, added: 0 } }, { merge: true });
  }
  return { state: "ok", added, at: nowIso };
}
