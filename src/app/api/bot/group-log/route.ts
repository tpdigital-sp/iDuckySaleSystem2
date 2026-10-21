import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { verifyBotToken } from "@/lib/server/customer-profile";
import { CHAT_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";
import { cacheLineImage } from "@/lib/server/line-image-cache";
import { inBackground } from "@/lib/server/background";
import { isLineUserId, lineRoomKind } from "@/lib/line-room-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 👥 จดข้อความจาก "ไลน์กลุ่ม" (C…) / ห้องรวม (R…) ลงคลังแชท line-conversations — 21 ต.ค. 69
 *   เจ้าของร้าน: "หน้า /admin/chatbot/chats?id=… ถ้าเป็น Line group จะแสดงไหม → รองรับกลุ่มที่ขึ้นต้นด้วย C ได้ไหม"
 *
 * ทำไมต้องมี: n8n (LINE OA Bot) ตั้งคีย์ห้องจาก source.userId อย่างเดียว ข้อความในกลุ่มจึงไม่ถูกจดเป็นห้องของกลุ่ม
 *   → โหนด Group Log (docs/n8n-site-price/group-log.code.js) วางหน้า Parse LINE Event: event ที่ source.type เป็น group/room
 *     ส่งมาที่นี่ทั้งก้อนแล้วตัดทิ้งจากสาย (บอทไม่ตอบในกลุ่ม · เก็บแชทอย่างเดียว) เว็บเป็นคนแกะ/ถามชื่อกลุ่ม/ชื่อคนพิมพ์เอง
 *
 * POST { events: LineEvent[] } · สิทธิ์: Authorization: Bearer <Firebase ID token ของบัญชีบอท> (ตัวที่ Debounce แคชไว้) หรือ x-cron-secret
 *   · ห้อง = line-conversations/{groupId} ฟิลด์ชุดเดียวกับห้องลูกค้า (displayName/pictureUrl/nameLower/lastSeen/lastUserText/messageCount)
 *     + kind "group"|"room" · memberCount · members.{uid} = {name, pic, at} (แคชชื่อสมาชิก 7 วัน) · profileAt (ชื่อ/รูปกลุ่มถามใหม่ทุก 24 ชม.)
 *   · log/{webhookEventId} = {role:"user", text, at, type, messageId, senderId, senderName, senderPic, source:"group"} — ใช้ eventId เป็น doc id
 *     LINE ส่งซ้ำ (isRedelivery) ก็ไม่เบิ้ล · เข้า/ออกกลุ่ม = role "system"
 *   · รูป/ไฟล์: จด messageId แล้วให้ cacheLineImage ดึงจาก LINE เก็บถาวรเบื้องหลัง (เหมือนห้องลูกค้า)
 */
type LineSource = { type?: string; groupId?: string; roomId?: string; userId?: string };
type LineMessage = { type?: string; id?: string; text?: string; fileName?: string; fileSize?: number; address?: string; title?: string; stickerId?: string; packageId?: string };
type LineEvent = { type?: string; webhookEventId?: string; timestamp?: number; source?: LineSource; message?: LineMessage; joined?: { members?: LineSource[] }; left?: { members?: LineSource[] } };

const LINE_API = "https://api.line.me/v2/bot";
const PROFILE_TTL = 24 * 3600_000;
const MEMBER_TTL = 7 * 24 * 3600_000;
const LOG_ID_RE = /^[A-Za-z0-9]{10,40}$/;
/** Timestamp ของ Firestore → ms (ไม่มี/ไม่ใช่ = 0) */
const millisOf = (v: unknown): number => (v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : 0);

async function lineGet<T>(path: string, token: string): Promise<T | null> {
  try {
    const r = await fetch(`${LINE_API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** ชื่อ/รูป/จำนวนสมาชิกของกลุ่ม (ห้องรวม R… LINE ไม่มีชื่อให้ — ได้แค่จำนวน) */
async function roomProfile(kind: "group" | "room", id: string, token: string): Promise<{ name: string; pic: string; count: number }> {
  const base = kind === "group" ? `/group/${id}` : `/room/${id}`;
  const [summary, count] = await Promise.all([
    kind === "group" ? lineGet<{ groupName?: string; pictureUrl?: string }>(`${base}/summary`, token) : Promise.resolve(null),
    lineGet<{ count?: number }>(`${base}/members/count`, token),
  ]);
  return { name: String(summary?.groupName ?? "").trim(), pic: String(summary?.pictureUrl ?? ""), count: Number(count?.count ?? 0) || 0 };
}

async function memberProfile(kind: "group" | "room", id: string, uid: string, token: string): Promise<{ name: string; pic: string } | null> {
  const p = await lineGet<{ displayName?: string; pictureUrl?: string }>(`/${kind}/${id}/member/${uid}`, token);
  return p ? { name: String(p.displayName ?? "").trim(), pic: String(p.pictureUrl ?? "") } : null;
}

function textOf(m: LineMessage | undefined): { text: string; type: string; preview: string } {
  const t = String(m?.type ?? "text");
  if (t === "text") return { text: String(m?.text ?? ""), type: "text", preview: String(m?.text ?? "") };
  if (t === "image") return { text: "", type: "image", preview: "[รูป]" };
  if (t === "sticker") return { text: "(สติกเกอร์)", type: "sticker", preview: "(สติกเกอร์)" };
  if (t === "location") return { text: `📍 ${[m?.title, m?.address].filter(Boolean).join(" · ")}`, type: "text", preview: "📍 ตำแหน่ง" };
  const name = String(m?.fileName ?? "").trim() || (t === "video" ? "วิดีโอ" : t === "audio" ? "เสียง" : "ไฟล์");
  return { text: `[ไฟล์] ${name}`, type: "file", preview: `[ไฟล์] ${name}` };
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bySecret = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!bySecret && !(await verifyBotToken(req.headers.get("authorization")))) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 401 });
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN ?? "";

  let body: { events?: LineEvent[] };
  try {
    body = (await req.json()) as { events?: LineEvent[] };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  const out: { id: string; logId: string | null; skipped?: string }[] = [];
  for (const ev of events.slice(0, 50)) {
    const s = ev.source ?? {};
    const id = String(s.groupId ?? s.roomId ?? "").trim();
    const kind = lineRoomKind(id);
    if (!kind || kind === "user") {
      out.push({ id, logId: null, skipped: "ไม่ใช่กลุ่ม/ห้องรวม" });
      continue;
    }
    try {
      out.push({ id, logId: await logEvent(db, kind, id, ev, token) });
    } catch (e) {
      out.push({ id, logId: null, skipped: (e as Error).message.slice(0, 120) });
    }
  }
  return NextResponse.json({ ok: true, results: out }, { headers: { "Cache-Control": "no-store" } });
}

async function logEvent(db: Firestore, kind: "group" | "room", id: string, ev: LineEvent, token: string): Promise<string | null> {
  const ref = db.collection(CHAT_COLLECTION).doc(id);
  const snap = await ref.get();
  const x = (snap.data() ?? {}) as Record<string, unknown>;
  const at = ev.timestamp && Number.isFinite(ev.timestamp) ? new Date(Number(ev.timestamp)) : new Date();
  const senderId = String(ev.source?.userId ?? "").trim();
  const patch: Record<string, unknown> = { kind, lastSeen: at };
  if (!snap.exists) Object.assign(patch, { [kind === "group" ? "groupId" : "roomId"]: id, createdBy: "iducky-web", isGroup: true });

  // ชื่อ/รูป/จำนวนสมาชิกของห้อง: ยังไม่มี หรือเกิน 24 ชม. → ถาม LINE (ตอนบอทเพิ่งเข้ากลุ่ม/ออกจากกลุ่มก็ถามใหม่)
  const profileAt = millisOf(x.profileAt);
  const rejoin = ev.type === "join" || ev.type === "memberJoined" || ev.type === "memberLeft";
  if (token && (!x.displayName || rejoin || Date.now() - profileAt > PROFILE_TTL)) {
    const p = await roomProfile(kind, id, token);
    const name = p.name || String(x.displayName ?? "") || (kind === "group" ? `กลุ่ม ${id.slice(0, 8)}…` : `ห้องรวม ${id.slice(0, 8)}…`);
    Object.assign(patch, { displayName: name, nameLower: name.toLowerCase(), pictureUrl: p.pic || String(x.pictureUrl ?? ""), memberCount: p.count, profileAt: new Date() });
  }

  // ชื่อคนพิมพ์: แคชไว้ใน members.{uid} 7 วัน (LINE ให้ชื่อสมาชิกกลุ่มได้ทีละคน · คนที่ไม่ยอมรับเงื่อนไข = ไม่มีชื่อ)
  let sender: { name: string; pic: string } | null = null;
  if (isLineUserId(senderId)) {
    const members = (x.members ?? {}) as Record<string, { name?: string; pic?: string; at?: unknown }>;
    const cached = members[senderId];
    const cachedAt = millisOf(cached?.at);
    if (cached?.name && Date.now() - cachedAt < MEMBER_TTL) sender = { name: String(cached.name), pic: String(cached.pic ?? "") };
    else if (token) {
      sender = await memberProfile(kind, id, senderId, token);
      if (sender) patch.members = { [senderId]: { name: sender.name, pic: sender.pic, at: new Date() } };
    }
  }
  const senderName = sender?.name || (senderId ? `สมาชิก ${senderId.slice(1, 7)}` : "");

  let entry: Record<string, unknown> | null = null;
  if (ev.type === "message") {
    const m = textOf(ev.message);
    entry = {
      role: "user",
      text: m.text,
      at,
      type: m.type,
      source: "group",
      ...(ev.message?.id ? { messageId: String(ev.message.id) } : {}),
      ...(m.type === "file" ? { fileName: String(ev.message?.fileName ?? ""), fileSize: Number(ev.message?.fileSize ?? 0) || 0, mediaType: String(ev.message?.type ?? "") } : {}),
      ...(senderId ? { senderId } : {}),
      ...(senderName ? { senderName } : {}),
      ...(sender?.pic ? { senderPic: sender.pic } : {}),
    };
    patch.lastUserText = `${senderName ? `${senderName}: ` : ""}${m.preview}`.slice(0, 200);
    patch.messageCount = FieldValue.increment(1);
  } else if (ev.type === "join") {
    entry = { role: "system", text: "🤖 บัญชีร้านถูกเชิญเข้าห้องนี้", at, type: "text", source: "group" };
    patch.lastUserText = "🤖 บัญชีร้านเข้าห้อง";
  } else if (ev.type === "leave") {
    entry = { role: "system", text: "🚪 บัญชีร้านออกจากห้องนี้แล้ว", at, type: "text", source: "group" };
    patch.leftAt = at;
  } else if (ev.type === "memberJoined" || ev.type === "memberLeft") {
    const n = (ev.type === "memberJoined" ? ev.joined?.members : ev.left?.members)?.length ?? 0;
    entry = { role: "system", text: ev.type === "memberJoined" ? `👋 สมาชิกเข้าห้อง ${n} คน` : `🚪 สมาชิกออกจากห้อง ${n} คน`, at, type: "text", source: "group" };
  } else {
    // unfollow/postback/อื่น ๆ — ไม่ต้องจด แต่ยังอัปเดตห้อง (ชื่อ/สมาชิก) ถ้าเพิ่งถาม LINE มา
    await ref.set(patch, { merge: true });
    return null;
  }

  const eventId = String(ev.webhookEventId ?? "").trim();
  const logRef = LOG_ID_RE.test(eventId) ? ref.collection("log").doc(eventId) : ref.collection("log").doc();
  if (LOG_ID_RE.test(eventId) && (await logRef.get()).exists) return logRef.id; // LINE ส่งซ้ำ (isRedelivery) — จดแล้ว
  await Promise.all([logRef.set(entry), ref.set(patch, { merge: true })]);
  if (entry.type === "image" || entry.type === "file") inBackground("group media cache", cacheLineImage(db, id, logRef.id, { timeoutMs: entry.type === "file" ? 25_000 : 15_000 }));
  return logRef.id;
}
