import { NextResponse } from "next/server";
import { draftEditableText, draftImages } from "@/lib/server/bot-drafts";
import { isDraftLive } from "@/lib/draft-live";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { loadChatIndex, norm, core } from "@/lib/server/line-chat";
import { loadChatTags } from "@/lib/server/chat-tags-store";
import { syncOaRoom, type OaLive } from "@/lib/server/oa-chat-sync";

/**
 * 💬 แชท LINE ที่บอทเห็น — อ่านจาก Firestore `ordersure/line-conversations` (บอท n8n เขียน)
 *
 * เจ้าของร้าน 8 ต.ค. 69 18:45: "อยากให้บอทเริ่มตอบจากลูกค้าใหม่ก่อน และบันทึกแชทด้วย"
 *   · ห้องแชท 1 ห้อง = 1 ไอดี LINE (เอกสาร) · ข้อความครบทุกตัวอยู่ใน subcollection `log` (ลูกค้าพิมพ์ + บอทตอบ + แอดมินตอบจากเว็บ (9 ต.ค. 69)
 *     — แอดมินพิมพ์เองใน LINE OA Manager ระบบไม่เห็น)
 *   · ใหม่/เก่า: `botScope` ที่บอทติดธงตอนข้อความแรกหลังเปิดโหมด (ห้องสร้างหลัง `settings/bot-whitelist.newSince` และไม่มีออเดอร์ = ใหม่)
 *     ห้องที่ยังไม่ติดธง → เทียบเวลาสร้างห้องกับ newSince
 *   · 9 ต.ค. 69 15:20 เพิ่ม: botAllowed (สวิตช์บอทรายคนใน bot-whitelist.userIds) · pausedUntil (botPausedUntil — แอดมินตอบจากเว็บ = พักบอท 30 นาที)
 *     · scope=waiting (รอแอดมิน: needsHumanFollowup และทักใน 48 ชม.)
 *
 * GET ?limit=50&scope=new|old|waiting|unread|draft|botdraft|all&q=ชื่อ  → รายการห้อง (ล่าสุดก่อน) · botdraft = ห้องที่เปิดร่างก่อนส่งรายคน (20 ต.ค. 69)
 *     &before=<lastSeen ISO ของแถวสุดท้ายที่มีแล้ว> → หน้าถัดไป (ห้องที่คุยก่อนเวลานั้น) · คำตอบมี next = cursor หน้าต่อไป ("" = หมดแล้ว)
 *     (15 ต.ค. 69 เจ้าของร้าน "ต้องการให้แสดงลูกค้าให้ครบ" — เดิมได้แค่ 80 ห้องล่าสุดแล้วตัน · ค้นหา/กรองป้ายยังเป็นชุดเดียวเหมือนเดิม)
 * GET ?id=U…                                      → ห้องเดียว + log 1,000 ตัวล่าสุด (fallback messages 20 ตัวล่าสุด)
 *     &after=<at ISO ของ entry ล่าสุดที่หน้าจอมีแล้ว> → เฉพาะ entry ที่ใหม่กว่านั้น (ถอยหลัง 2 นาทีเผื่อร่าง/รูปที่เพิ่งเปลี่ยนสถานะ) · partial=true
 *     (⚡ 15 ต.ค. 69 เจ้าของร้าน "ต้องการให้ update ข้อมูล realtime ก่อนเข้าตอบ" — หน้าแชทโพลทุก 3 วิ ถ้าดึง 1,000 entry ทุกรอบจะหนักเกิน)
 * GET ?since=<lastSeen ISO ของห้องล่าสุดที่หน้าจอมี> → เฉพาะห้องที่ขยับหลังเวลานั้น (≤60 ห้อง · กรอง scope/tag เหมือนรายการปกติ) · partial=true
 *   · 15 ต.ค. 69: log มีรายการที่นำเข้าจาก CSV ของ LINE OA Manager ด้วย (source "oa-csv" · แอดมินตอบใน OA = role admin mode "oa" by ชื่อ OA
 *     · ประวัติก่อนบอทเก็บ log) — ดู scripts/import-oa-chat-csv.mts
 *   · 💬🔄 15 ต.ค. 69 (รอบ 2): เปิด/โพลห้อง = ดึงข้อความที่พนักงานพิมพ์ใน OA Manager "สด" ลง log ก่อนอ่าน (source "oa-live" · lib/server/oa-chat-sync.ts
 *     · ต้องมีคุกกี้ OA + รู้รหัสห้อง OA ของ userId · ยิง OA ≤1 ครั้ง/10 วิ ต่อห้อง · รอ ≤4 วิ) · คำตอบมี oaLive บอกสถานะให้หัวห้องโชว์
 */
const COL = "line-conversations";

type Row = {
  id: string;
  displayName: string;
  pictureUrl: string;
  lastSeen: string;
  createdAt: string;
  messageCount: number;
  lastUserText: string;
  scope: "new" | "old";
  botScope: string;
  needsHumanFollowup: boolean;
  botAllowed: boolean;
  /** 📝 โหมดร่างรายคน (settings/bot-whitelist.draftUserIds · 19 ต.ค. 69) */
  botDraft: boolean;
  pausedUntil: string;
  lastAdminAt: string;
  /** 🟢 ยังไม่ได้เปิดอ่านบนเว็บหลังลูกค้าทักล่าสุด (webReadAt < lastSeen และ lastAdminAt < lastSeen) */
  unread: boolean;
  /** 📝 มีร่างคำตอบของบอทรอแอดมินกดส่ง (โหมด draft · 13 ต.ค. 69) */
  draftPending: boolean;
  /** 🏷📝 ป้ายความเร่งด่วน (urgent/rush/normal) · โน้ตแอดมิน · ชื่อที่ตั้งเอง — ฟิลด์เดียวกับหน้า /admin/line-customers */
  adminTag: string;
  /** 🏷 หลายป้าย — ไม่มีฟิลด์ (ข้อมูลเก่า) ใช้ [adminTag] */
  adminTags: string[];
  /** 🤖 ป้ายระดับที่ AI ติดให้ (lib/server/chat-urgency.ts) */
  aiTag?: { key: string; reason: string; at: string };
  adminNote: string;
  /** 📝 หลายโน้ต (≤10) — ข้อมูลเก่าที่มีแต่ adminNote → แปลงเป็น 1 รายการ */
  adminNotes: { id: string; text: string; by: string; at: string }[];
  adminAlias: string;
};
type CardRef = { name: string; url: string; image?: string; price?: string };
type LogEntry = { id?: string; role: string; text: string; at: string; type?: string; mode?: string; by?: string; status?: string; approvedBy?: string; edited?: boolean; draftText?: string; imageUrl?: string; messageId?: string; imageExpired?: boolean; card?: { name: string; url: string }; cards?: CardRef[]; file?: { url: string; name: string; size: number }; notice?: Notice; draftImages?: { url: string; preview: string }[]; flex?: unknown[] };
/** 🎴 การ์ดแจ้งลูกค้าที่ระบบส่งเอง (lib/server/chat-notice-log.ts) */
type Notice = { orderId: string; title: string; color: string; asText?: boolean };
type Settings = { mode: string; newSince: string; enabled: boolean; userIds: string[]; draftUserIds: string[]; allReadAt: string };

function iso(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  return "";
}

async function botSettings(db: Firestore): Promise<Settings> {
  try {
    const d = await db.collection("settings").doc("bot-whitelist").get();
    const x = d.data() ?? {};
    const ids = Array.isArray(x.userIds) ? (x.userIds as unknown[]).map((v) => String(v)) : [];
    const draftIds = Array.isArray(x.draftUserIds) ? (x.draftUserIds as unknown[]).map((v) => String(v)) : [];
    let allReadAt = "";
    try {
      const r = await db.collection("settings").doc("chat-read").get();
      allReadAt = iso(r.data()?.allReadAt);
    } catch {}
    return { mode: String(x.mode ?? ""), newSince: iso(x.newSince), enabled: x.enabled === true, userIds: ids, draftUserIds: draftIds, allReadAt };
  } catch {
    return { mode: "", newSince: "", enabled: false, userIds: [], draftUserIds: [], allReadAt: "" };
  }
}

const WAIT_MS = 48 * 3600_000;

function toRow(id: string, x: Record<string, unknown>, createdAt: string, cfg: Settings): Row {
  const botScope = String(x.botScope ?? "");
  const scope: Row["scope"] = botScope === "new" || botScope === "old" ? botScope : cfg.newSince && createdAt && createdAt >= cfg.newSince ? "new" : "old";
  const paused = iso(x.botPausedUntil);
  const lastSeen = iso(x.lastSeen);
  const readAt = [iso(x.webReadAt), cfg.allReadAt].filter(Boolean).sort().pop() ?? "";
  const lastAdmin = iso(x.lastAdminAt);
  // นับเฉพาะที่ทักใน 48 ชม. — ห้องเก่าก่อนมีระบบอ่านแล้ว (9 ต.ค. 69) ไม่ต้องขึ้น "ยังไม่อ่าน" ทั้ง 400 ห้อง
  const recent = !!lastSeen && Date.now() - new Date(lastSeen).getTime() < WAIT_MS;
  const unread = recent && (!readAt || readAt < lastSeen) && (!lastAdmin || lastAdmin < lastSeen);
  // พรีวิวบรรทัดสุดท้ายแบบ LINE: lastUserText (บอทเขียน) ว่างในหลายห้อง → ถอยไปใช้ข้อความท้ายสุดใน messages[] (ความจำบอท 20 ตัว)
  const msgs = Array.isArray(x.messages) ? (x.messages as { role?: unknown; text?: unknown }[]) : [];
  const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
  const preview = String(x.lastUserText ?? "") || (lastMsg ? `${String(lastMsg.role ?? "") === "user" ? "" : "ร้าน: "}${String(lastMsg.text ?? "")}` : "");
  return {
    id,
    displayName: String(x.displayName ?? ""),
    pictureUrl: String(x.pictureUrl ?? ""),
    lastSeen,
    createdAt,
    messageCount: Number(x.messageCount ?? 0) || 0,
    lastUserText: preview.replace(/\s+/g, " ").slice(0, 120),
    scope,
    botScope,
    needsHumanFollowup: x.needsHumanFollowup === true,
    botAllowed: cfg.userIds.includes(id),
    botDraft: cfg.draftUserIds.includes(id),
    pausedUntil: paused && paused > new Date().toISOString() ? paused : "",
    lastAdminAt: lastAdmin,
    unread,
    // 📝 ร่างค้างจากโหมดร่างทั้งร้านช่วง 14–15 ต.ค. ไม่นับ: หมดอายุ 24 ชม. หรือร้านตอบไปแล้ว (lib/draft-live.ts · 19 ต.ค. 69)
    draftPending: isDraftLive(iso(x.draftPendingAt), lastAdmin),
    adminTag: String(x.adminTag ?? ""),
    adminTags: Array.isArray(x.adminTags) ? (x.adminTags as unknown[]).map(String).filter(Boolean) : x.adminTag ? [String(x.adminTag)] : [],
    aiTag:
      x.aiTag && typeof x.aiTag === "object"
        ? { key: String((x.aiTag as Record<string, unknown>).key ?? ""), reason: String((x.aiTag as Record<string, unknown>).reason ?? ""), at: String((x.aiTag as Record<string, unknown>).at ?? "") }
        : undefined,
    adminNote: String(x.adminNote ?? ""),
    adminNotes: Array.isArray(x.adminNotes)
      ? (x.adminNotes as Record<string, unknown>[]).map((n) => ({ id: String(n.id ?? ""), text: String(n.text ?? ""), by: String(n.by ?? ""), at: String(n.at ?? "") })).filter((n) => n.id && n.text)
      : x.adminNote
        ? [{ id: "legacy", text: String(x.adminNote), by: String(x.adminNoteBy ?? ""), at: String(x.adminNoteAt ?? "") }]
        : [],
    adminAlias: String(x.adminAlias ?? ""),
  };
}

const isWaiting = (r: Row) => r.needsHumanFollowup && !!r.lastSeen && Date.now() - new Date(r.lastSeen).getTime() < WAIT_MS;

export async function GET(req: Request) {
  const gate = await requirePerm(["reports.view", "chat.reply"]);
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const u = new URL(req.url);
  const cfg = await botSettings(db);
  const settingsOut = { mode: cfg.mode, newSince: cfg.newSince, enabled: cfg.enabled };
  const id = (u.searchParams.get("id") ?? "").trim();

  if (id) {
    if (!/^U[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const ref = db.collection(COL).doc(id);
    const d = await ref.get();
    if (!d.exists) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404 });
    const x = (d.data() ?? {}) as Record<string, unknown>;
    const row = toRow(d.id, x, iso(d.createTime), cfg);
    // 💬🔄 ดึงข้อความฝั่งแอดมินจาก OA Manager ลง log ก่อน (ไม่มีคุกกี้/ไม่รู้ห้อง = ข้ามทันที · OA ช้า = ตอบไปก่อน งานวิ่งต่อใน after())
    const oaLive: OaLive = await syncOaRoom(db, id, x).catch((e: unknown) => ({ state: "error", error: e instanceof Error ? e.message : String(e), at: new Date().toISOString() }));
    // 📥 15 ต.ค. 69 นำเข้าประวัติจาก CSV OA Manager (scripts/import-oa-chat-csv.mts) ทำให้บางห้องมี log หลายพัน entry ย้อนไปปี 2567
    //    เดิม orderBy asc limit 1000 = ได้ 1,000 ตัว "เก่าสุด" แล้วข้อความล่าสุดหาย → เอา 1,000 ตัวล่าสุดแล้วกลับลำดับ
    // ⚡ 15 ต.ค. 69 realtime: หน้าจอส่ง after = at ของ entry ล่าสุดที่มีแล้ว → อ่านเฉพาะที่ใหม่กว่า (ถอย 2 นาที ให้ entry เดิมที่เพิ่งเปลี่ยนสถานะ เช่น ร่าง→ส่งแล้ว/รูปแคชแล้ว ถูกส่งซ้ำไปทับ)
    //    where+orderBy ฟิลด์เดียวกัน ไม่ต้องมีดัชนีผสม · ฟิลด์ at เป็น Timestamp ทุกแหล่ง (n8n/reply/CSV import — ตรวจ 15 ต.ค. 69)
    const afterRaw = (u.searchParams.get("after") ?? "").trim();
    const after = afterRaw && !Number.isNaN(new Date(afterRaw).getTime()) ? new Date(afterRaw) : null;
    const logSnap = after
      ? await ref.collection("log").where("at", ">", Timestamp.fromMillis(after.getTime() - 120_000)).orderBy("at", "asc").limit(300).get()
      : await ref.collection("log").orderBy("at", "desc").limit(1000).get();
    const logDocs = after ? logSnap.docs : logSnap.docs.reverse();
    const log: LogEntry[] = logDocs.map((e) => {
      const y = e.data() as Record<string, unknown>;
      const card = y.card && typeof y.card === "object" ? (y.card as { name?: unknown; url?: unknown }) : null;
      // 🧾 การ์ดที่บอทส่ง (Reply Gate เขียน cards[] ตั้งแต่ 9 ต.ค. 69 17:40) → หน้าแชทวาดเป็นการ์ดสินค้าเหมือนใน LINE
      const cards: CardRef[] = Array.isArray(y.cards)
        ? (y.cards as Record<string, unknown>[]).filter((c) => c && typeof c === "object").map((c) => ({ name: String(c.name ?? ""), url: String(c.url ?? ""), image: c.image ? String(c.image) : undefined, price: c.price ? String(c.price) : undefined })).filter((c) => c.name || c.url)
        : [];
      return {
        id: e.id,
        role: String(y.role ?? ""),
        text: String(y.text ?? ""),
        at: iso(y.at),
        type: y.type ? String(y.type) : undefined,
        mode: y.mode ? String(y.mode) : undefined,
        by: y.by ? String(y.by) : undefined,
        // 📝 ร่างของบอท: pending/superseded/discarded/sent · คำตอบที่แอดมินอนุมัติ = approvedBy
        status: y.status ? String(y.status) : undefined,
        approvedBy: y.approvedBy ? String(y.approvedBy) : undefined,
        edited: y.edited === true ? true : undefined,
        draftText: y.role === "draft" ? draftEditableText(y.payload) : undefined,
        draftImages: y.role === "draft" ? draftImages(y.payload) : undefined,
        imageUrl: y.imageUrl ? String(y.imageUrl) : undefined,
        // รูปจากลูกค้า: ยังไม่ได้ดึง → หน้าเว็บใช้ /api/admin/chatbot/chats/image?uid&log (ดึงจาก LINE แล้วแคชขึ้น Storage)
        messageId: y.messageId ? String(y.messageId) : undefined,
        imageExpired: y.imageExpired === true && String(y.type ?? "") === "image" ? true : undefined,
        card: card ? { name: String(card.name ?? ""), url: String(card.url ?? "") } : undefined,
        cards: cards.length ? cards : undefined,
        // 🧾 19 ต.ค. 69 ข้อความ Flex ที่ส่งให้ลูกค้าจริง (จาก payload) → หน้าแชทวาดการ์ดตารางราคาเหมือนใน LINE (FlexView)
        flex: flexOf(y.payload),
        notice:
          y.notice && typeof y.notice === "object"
            ? (() => {
                const n = y.notice as Record<string, unknown>;
                return { orderId: String(n.orderId ?? ""), title: String(n.title ?? ""), color: String(n.color ?? ""), asText: n.asText === true ? true : undefined };
              })()
            : undefined,
        file: y.file && typeof y.file === "object" && (y.file as { url?: unknown }).url
          ? { url: String((y.file as { url: unknown }).url), name: String((y.file as { name?: unknown }).name ?? "ไฟล์"), size: Number((y.file as { size?: unknown }).size ?? 0) || 0 }
          : String(y.type ?? "") === "file"
            ? // 📎 ไฟล์จากลูกค้า (Parse LINE Event): url = ที่แคชแล้ว หรือให้หน้าเว็บดึงผ่าน /chats/image (route เดียวกัน รองรับ type file)
              { url: y.imageUrl ? String(y.imageUrl) : "", name: String(y.fileName ?? "ไฟล์"), size: Number(y.fileSize ?? 0) || 0 }
            : undefined,
      };
    });
    // ห้องเก่าก่อนมี log (8 ต.ค. 69) → ใช้ messages 20 ตัวล่าสุดที่บอทเก็บไว้
    const messages: LogEntry[] = Array.isArray(x.messages)
      ? (x.messages as Record<string, unknown>[]).map((m) => ({ role: String(m.role ?? ""), text: String(m.text ?? ""), at: iso(m.at) }))
      : [];
    return NextResponse.json({ ...row, log, messages: after ? [] : messages, partial: !!after, settings: settingsOut, oaLive }, { headers: { "Cache-Control": "no-store" } });
  }

  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit") ?? 50) || 50));
  const batch = Math.min(400, limit * 6);
  const scope = (u.searchParams.get("scope") ?? "all").trim();
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase();
  // 🏷 กรองตามป้าย (14 ต.ค. 69) — ถามฐานตรงด้วย array-contains (ไม่ใช่แค่ 400 ห้องล่าสุด) · ไม่ต้องมีดัชนีผสมเพราะไม่ orderBy
  const tag = (u.searchParams.get("tag") ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  // 📜 หน้าถัดไป: lastSeen (ISO · มิลลิวินาทีครบ) ของแถวสุดท้ายที่หน้าจอมีแล้ว → เริ่มอ่านถัดจากห้องนั้น (ฟิลด์ใน Firestore เป็น Timestamp)
  const beforeRaw = (u.searchParams.get("before") ?? "").trim();
  const before = beforeRaw && !Number.isNaN(new Date(beforeRaw).getTime()) ? new Date(beforeRaw) : null;
  // ⚡ 15 ต.ค. 69 realtime: since = lastSeen ของห้องล่าสุดที่หน้าจอมี → อ่านเฉพาะห้องที่ขยับหลังนั้น (ปกติ 0–3 ห้อง) หน้าจอโพลทุก 5 วิได้โดยไม่อ่าน 400 ห้องซ้ำ
  const sinceRaw = (u.searchParams.get("since") ?? "").trim();
  const since = !q && !before && sinceRaw && !Number.isNaN(new Date(sinceRaw).getTime()) ? new Date(sinceRaw) : null;
  // 🐢 14 ต.ค. 69 "หน้าแชทโหลดช้ามาก": เดิมอ่านห้องเต็ม 400 ห้อง ~1.4 MB ทุกครั้ง (และซ้ำทุก 30 วิ) — 1.1 MB เป็น `profile` (สรุปลูกค้าของบอท)
  // ที่รายชื่อไม่ได้ใช้ → อ่านเฉพาะช่องที่ toRow ใช้ (วัดตรง: 2.9 วิ → 0.24 วิ) · หน้าห้อง (?id=) ยังอ่านเต็มเหมือนเดิม
  const LIST_FIELDS = [
    "displayName", "pictureUrl", "lastSeen", "lastUserText", "messageCount", "messages", "botScope", "needsHumanFollowup", "botPausedUntil",
    "lastAdminAt", "webReadAt", "draftPendingAt", "adminTag", "adminTags", "adminNote", "adminNotes", "adminNoteBy", "adminNoteAt", "adminAlias",
  ];
  let snap;
  if (q) {
    // 🔎 14 ต.ค. 69 เจ้าของร้าน "ค้นหาไม่ได้จริง": เดิมค้นแค่ nameLower "ขึ้นต้นด้วย" คำค้น (ชื่อที่ขึ้นต้นด้วยอีโมจิ/ชื่อที่แอดมินตั้ง/คำกลางชื่อ ไม่เจอ)
    // → ค้นจากดัชนีทั้งคลัง (loadChatIndex แคช 15 นาที ใช้ร่วมกับหน้าลูกค้า LINE · ครั้งแรก ~4 วิ) แบบ "มีคำนี้อยู่ในชื่อ" ทั้งชื่อ LINE และชื่อที่แอดมินตั้ง
    // + วาง userId ได้ · รวมกับ nameLower ขึ้นต้นด้วยแบบสด (ห้องที่เพิ่งเกิดหลังทำดัชนี) · ขึ้นต้นด้วยคำค้นมาก่อน แล้วเรียงคนคุยล่าสุด
    const nq = norm(q);
    const cq = core(q);
    const [idx, fresh] = await Promise.all([
      loadChatIndex(db).catch(() => []),
      db.collection(COL).where("nameLower", ">=", q).where("nameLower", "<", `${q}\uf8ff`).limit(50).select().get().catch(() => null),
    ]);
    const starts = (r: { key: string; aliasKey: string }) => Number(r.key.startsWith(nq) || (!!r.aliasKey && r.aliasKey.startsWith(nq)));
    const hit = idx
      .filter((r) => r.key.includes(nq) || (!!r.aliasKey && r.aliasKey.includes(nq)) || (cq.length >= 2 && core(r.name).includes(cq)) || r.userId.toLowerCase() === q)
      .sort((a, b) => starts(b) - starts(a))
      .map((r) => r.userId);
    const ids = [...new Set([...hit, ...(fresh?.docs.map((d) => d.id) ?? [])])].slice(0, 100);
    const docs = ids.length ? await db.getAll(...ids.map((id) => db.collection(COL).doc(id)), { fieldMask: LIST_FIELDS }) : [];
    const order = new Map(ids.map((id, n) => [id, n]));
    snap = { docs: docs.filter((d) => d.exists).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) };
  } else if (since) {
    snap = await db.collection(COL).where("lastSeen", ">", Timestamp.fromDate(since)).orderBy("lastSeen", "desc").limit(60).select(...LIST_FIELDS).get();
  } else if (scope === "botdraft" && !tag) {
    // 📝 ห้องที่เปิดโหมดร่างรายคน (เจ้าของร้าน 20 ต.ค. 69 "เพิ่ม filter กรอง ร่างก่อนส่ง") — อ่านตรงตามรายชื่อ draftUserIds ไม่ใช่แค่ 400 ห้องล่าสุด
    const ids = cfg.draftUserIds.slice(0, 300);
    const docs = ids.length ? await db.getAll(...ids.map((id) => db.collection(COL).doc(id)), { fieldMask: LIST_FIELDS }) : [];
    snap = { docs: docs.filter((d) => d.exists) };
  } else if (tag) {
    snap = await db.collection(COL).where("adminTags", "array-contains", tag).limit(300).select(...LIST_FIELDS).get();
  } else {
    let qry = db.collection(COL).orderBy("lastSeen", "desc");
    if (before) qry = qry.startAfter(Timestamp.fromDate(before));
    snap = await qry.limit(batch).select(...LIST_FIELDS).get();
  }
  let rows = snap.docs.map((d) => toRow(d.id, (d.data() ?? {}) as Record<string, unknown>, iso(d.createTime), cfg));
  // กรองป้าย (array-contains ใส่ startAfter ไม่ได้ถ้าไม่มี composite index) → ชุดเดียว ≤300 แล้วตัดหน้าในหน่วยความจำด้วย lastSeen
  const byIds = scope === "botdraft" && !q && !tag && !since;
  if (before && (q || tag || byIds)) {
    const b = before.toISOString();
    rows = rows.filter((r) => r.lastSeen && r.lastSeen < b);
  }
  // ชุดดิบเต็มก้อน = ยังมีห้องเก่ากว่านี้อีก (เฉพาะรายการปกติ — ค้นหา/กรองป้ายได้ชุดเดียว)
  const rawFull = !q && !tag && !byIds && rows.length >= batch;
  const rawLast = rawFull ? rows[rows.length - 1].lastSeen : "";
  // ตัวนับบนชิป นับจากชุดที่โหลดมา (ล่าสุด ≤400 ห้อง) ก่อนกรอง/ตัด
  const waitingCount = rows.filter(isWaiting).length;
  const unreadCount = rows.filter((r) => r.unread).length;
  const draftCount = rows.filter((r) => r.draftPending).length;
  if (scope === "new" || scope === "old") rows = rows.filter((r) => r.scope === scope);
  if (scope === "waiting") rows = rows.filter(isWaiting);
  if (scope === "unread") rows = rows.filter((r) => r.unread);
  if (scope === "draft") rows = rows.filter((r) => r.draftPending);
  if (scope === "botdraft") rows = rows.filter((r) => r.botDraft);
  if (tag && (q || since)) rows = rows.filter((r) => r.adminTags.includes(tag));
  // ค้นหา: คงลำดับ "ชื่อขึ้นต้นด้วยคำค้นก่อน" ที่จัดไว้ (ดัชนีเรียงคนคุยล่าสุดมาแล้ว)
  if (!q) rows.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
  // ⚡ ห้องที่ขยับ: ส่งเฉพาะแถว ไม่นับชิป/cursor (หน้าจอเอาไปแทนที่แถวเดิมแล้วดันขึ้นบน · โหลดเต็มทุก 30 วิ ยังอยู่)
  if (since) return NextResponse.json({ rows, settings: settingsOut, count: rows.length, partial: true }, { headers: { "Cache-Control": "no-store" } });
  const overflow = rows.length > limit;
  rows = rows.slice(0, limit);
  // cursor หน้าต่อไป: ยังมีแถวที่กรองแล้วเหลือ → ต่อจากแถวสุดท้ายที่ส่ง · ไม่เหลือแต่ชุดดิบเต็ม → ต่อจากห้องสุดท้ายของชุดดิบ (หน้านั้นอาจกรองออกหมดก็ได้)
  // รอแอดมิน/ยังไม่อ่าน นับเฉพาะที่ทักใน 48 ชม. → เลยช่วงนั้นแล้วไม่มีทางเจอเพิ่ม หยุดเลย ไม่ไล่อ่านทั้งคลัง (หมื่นกว่าห้อง)
  let next = overflow ? rows[rows.length - 1].lastSeen : rawLast;
  if (next && (scope === "waiting" || scope === "unread") && Date.now() - new Date(next).getTime() > WAIT_MS) next = "";
  const tagCounts = before ? {} : await countByTag(db);
  return NextResponse.json({ rows, settings: settingsOut, count: rows.length, waitingCount, unreadCount, draftCount, botDraftCount: cfg.draftUserIds.length, tagCounts, next }, { headers: { "Cache-Control": "no-store" } });
}

/** 🏷 จำนวนห้องต่อป้าย (นับทั้งคลังด้วย count() — 1 read ต่อ 1,000 ห้อง) · แคช 60 วิ เพราะหน้าแชทรีเฟรชรายชื่อทุก 30 วิ */
let tagCountCache: { at: number; counts: Record<string, number> } | null = null;
async function countByTag(db: Firestore): Promise<Record<string, number>> {
  if (tagCountCache && Date.now() - tagCountCache.at < 60_000) return tagCountCache.counts;
  try {
    const tags = await loadChatTags();
    const pairs = await Promise.all(
      tags.map(async (t) => [t.key, (await db.collection(COL).where("adminTags", "array-contains", t.key).count().get()).data().count] as const)
    );
    tagCountCache = { at: Date.now(), counts: Object.fromEntries(pairs) };
    return tagCountCache.counts;
  } catch {
    return tagCountCache?.counts ?? {};
  }
}

/** contents ของข้อความ flex ใน payload (JSON ข้อความ LINE ที่บอทส่ง/ร่าง) — ไม่มี = undefined */
function flexOf(payload: unknown): unknown[] | undefined {
  if (typeof payload !== "string" || !payload.includes('"flex"')) return undefined;
  try {
    const msgs = JSON.parse(payload) as unknown;
    if (!Array.isArray(msgs)) return undefined;
    const out = msgs.filter((m) => m && typeof m === "object" && (m as { type?: unknown }).type === "flex" && (m as { contents?: unknown }).contents).map((m) => (m as { contents: unknown }).contents);
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}
