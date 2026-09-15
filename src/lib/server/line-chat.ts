import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { CHAT_COLLECTION, CHAT_OVERRIDE_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { toCustomerTag, type CustomerTag } from "@/lib/line-tags";

/**
 * 💬 คลังแชท LINE ของร้าน (Firestore ฐาน "ordersure") — ตัวกลางที่ทุกหน้าใช้ร่วมกัน
 *
 * ของเดิมอ่านคลังนี้อยู่ 2 ที่แล้วต่างคนต่างแคช:
 *   · /api/admin/line-customers        — ค้นหาลูกค้าตอนผูก LINE กับออเดอร์
 *   · /admin/line-customers (หน้านี้)  — ดูแลลูกค้า LINE + เปิด/ปิดบอทรายคน
 * รวมมาไว้ไฟล์เดียว แคชก้อนเดียว = เปิดหน้าดูแลลูกค้าไม่ได้ทำให้ค่าอ่าน Firestore เพิ่มอีกชุด
 *
 * ⚠️ คลังนี้มีห้องแชทหลักพันห้อง การอ่านทั้งคอลเลกชัน 1 รอบ = ค่าอ่านเท่าจำนวนห้อง
 *    เพราะงั้นต้องอ่านผ่าน loadChatIndex() ที่มีแคชเสมอ ห้ามยิง .get() ทั้งคอลเลกชันเอง
 */

/**
 * อายุแคช "ดัชนีเต็ม" — ยาวกว่าของอื่นเพราะ 1 รอบ = ค่าอ่านเท่าจำนวนห้องแชท (~9,500)
 * ค้นแล้วไม่เจอจะมีทางลัดดึงสดให้เองอยู่แล้ว (ดู /api/admin/line-customers) ไม่ต้องรีบหมดอายุ
 */
const CACHE_MS = 15 * 60 * 1000;
/** ของเบา ๆ (ตารางจับคู่ห้องแชท · ลิงก์จากออเดอร์) หมดอายุเร็วได้ ไม่เปลืองอะไร */
const LIGHT_CACHE_MS = 5 * 60 * 1000;

/**
 * ธง needsHumanFollowup ที่บอทยกไว้ "ไม่เคยถูกลบ" — วัดจริง 15 ก.ย. 69: ยกไว้ 552 ห้อง
 * แต่เพิ่งคุยกันในสัปดาห์นี้แค่ 41 ห้อง · เอามาโชว์ทั้ง 552 = คิวงานจริงจมหายไปในกองเก่า
 * → นับเป็น "รอแอดมินตอบ" เฉพาะห้องที่ยังคุยกันอยู่ในช่วงนี้เท่านั้น
 */
export const FOLLOWUP_WINDOW_DAYS = 7;

/** เอกสารสวิตช์บอท — { enabled: bot ตอบเฉพาะคนใน userIds, userIds: รายชื่อที่เปิด AI } */
export const WHITELIST_DOC = { col: "settings", id: "bot-whitelist" } as const;
/** ค่าตั้งต้นของระบบแชท (AdminBuddy เป็นคนเขียน) — ใช้เลข OA มาประกอบลิงก์ chat.line.biz */
const QUICK_SETUP_DOC = { col: "settings", id: "quick-setup" } as const;

export interface ChatRow {
  userId: string;
  /** ชื่อที่เอาไว้โชว์ตอนค้นหา — ชื่อจาก LINE (ไม่มี = "(ไม่มีชื่อ)") */
  name: string;
  /** ชื่อจริงจาก LINE (null = ลูกค้ายังไม่เคยให้ชื่อ / เพิ่มด้วยมือ) */
  displayName: string | null;
  /** ชื่อที่แอดมินตั้งทับเอง */
  adminAlias: string | null;
  adminNote: string;
  /** ป้ายความเร่งด่วนที่แอดมินติดไว้ (null = ไม่ติด) */
  tag: CustomerTag | null;
  picture?: string;
  /** ISO string — คุยกับร้านล่าสุดเมื่อไหร่ */
  lastSeen?: string;
  /** บอทยกธงว่า "ต้องให้คนตอบ" */
  needsHumanFollowup: boolean;
  /** กุญแจค้นหาจากชื่อ LINE */
  key: string;
  /** กุญแจค้นหาจากชื่อที่แอดมินตั้ง */
  aliasKey: string;
}

let cache: { at: number; rows: ChatRow[] } | null = null;
let overrides: { at: number; map: Record<string, string> } | null = null;
let orderChatIds: { at: number; map: Record<string, string> } | null = null;

/**
 * ทำข้อความให้เทียบกันได้จริง ก่อนเอาไปหา
 *  - NFC: รวมตัวอักษรที่เขียนได้หลายแบบให้เป็นแบบเดียว (ภาษาไทย/ยุโรปที่มีวรรณยุกต์)
 *  - ตัด variation selector (U+FE0E/U+FE0F): "❤️" ที่คีย์บอร์ดพิมพ์ ≠ "❤" ที่บางคนใช้ตั้งชื่อ
 *    ไม่ตัด = พิมพ์ ❤️ แล้วหาคนที่ใช้ ❤ ไม่เจอ (วัดจริงกับคลังแชท: พลาด 7 คน)
 *  - ตัดโทนสีผิว (U+1F3FB–U+1F3FF): พิมพ์ 🫰 ให้เจอ 🫰🏻 ด้วย
 *  - lowercase: อังกฤษพิมพ์เล็ก/ใหญ่ก็เจอ
 */
export function norm(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[︎️]/g, "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
}

/**
 * กุญแจ "ชื่อเดียวกัน" — ตัดตัวประดับที่คนชอบต่อท้ายชื่อสั้น ๆ ออก (จุด/ช่องว่าง/ขีด)
 * "S" · "S." · "s" ถือว่าเป็นชื่อเดียวกัน ตอนจัดอันดับผลค้นหา
 */
export function core(s: string): string {
  return norm(s).replace(/[\s._\-·]/g, "");
}

/** Timestamp ของ Firestore → ISO string (รับทั้งฝั่ง admin SDK และค่าที่เคยเขียนเป็น Date) */
function isoOf(v: unknown): string | undefined {
  const ts = v as { _seconds?: number; toDate?: () => Date } | undefined;
  if (!ts) return undefined;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof ts._seconds === "number") return new Date(ts._seconds * 1000).toISOString();
  return undefined;
}

/**
 * แกะ LINE userId จากสิ่งที่แอดมินวางมา — รับได้ทั้ง
 *   · U + hex 32 ตัว (userId จริง)
 *   · ลิงก์ห้องแชทของ LINE OA Manager: https://chat.line.biz/{ownerId}/chat/2U… (ต้องตัด "2" หน้าออก)
 *
 * ⚠️ ลำดับสำคัญ: ต้องเช็ครูปแบบ "2U…" ก่อนเสมอ ไม่งั้นจะไปคว้า ownerId ที่อยู่ต้นลิงก์มาแทน
 */
export function extractLineUserId(input: string): string | null {
  const t = (input || "").trim();
  if (!t) return null;
  const plain = t.match(/^(U[0-9a-f]{32})$/i);
  if (plain) return plain[1];
  const chat = t.match(/2(U[0-9a-f]{32})/i);
  if (chat) return chat[1];
  const any = t.match(/(U[0-9a-f]{32})/i);
  return any ? any[1] : null;
}

/** ฟิลด์ที่หน้ารายการต้องใช้ — ดึงเท่าที่ใช้ ไม่ต้องลากทั้งเอกสาร (ห้องแชทเก่ามีประวัติยาว) */
const LIST_FIELDS = [
  "userId",
  "displayName",
  "userName",
  "adminAlias",
  "adminNote",
  "adminTag",
  "pictureUrl",
  "lastSeen",
  "needsHumanFollowup",
] as const;

/** เอกสาร 1 ใบ → 1 แถวในรายการ (ใช้ร่วมกันทั้งดัชนีเต็มและการดึงทีละหน้า) */
export function rowOfDoc(d: FirebaseFirestore.DocumentSnapshot): ChatRow {
  const displayName = ((d.get("displayName") as string) || (d.get("userName") as string) || "").trim() || null;
  const adminAlias = ((d.get("adminAlias") as string) || "").trim() || null;
  return {
    userId: (d.get("userId") as string) || d.id,
    name: displayName || "(ไม่มีชื่อ)",
    displayName,
    adminAlias,
    adminNote: ((d.get("adminNote") as string) || "").trim(),
    tag: toCustomerTag(d.get("adminTag")),
    picture: d.get("pictureUrl") as string,
    lastSeen: isoOf(d.get("lastSeen")),
    needsHumanFollowup: !!d.get("needsHumanFollowup"),
    key: norm(displayName || "(ไม่มีชื่อ)"),
    aliasKey: adminAlias ? norm(adminAlias) : "",
  };
}

/**
 * ดึงรายชื่อ "ทีละหน้า" จาก Firestore ตรง ๆ — ค่าอ่าน ~20 ครั้ง ไม่ใช่ทั้งคลัง
 * ใช้ตอนเปิดหน้ามาเฉย ๆ (ไม่ได้ค้น ไม่ได้กรอง) ซึ่งเป็นกรณีที่เจอบ่อยที่สุด
 *
 * ⚠️ เรียงด้วย lastSeen = ห้องที่ไม่มี lastSeen จะไม่ติดมา (มีอยู่ ~9 ห้องจากเก้าพันกว่า)
 *    ซึ่งตรงกับหัวข้อ "คุยกับร้านล่าสุด" อยู่แล้ว · จะเห็นห้องพวกนั้นได้ตอนค้นหา
 */
export async function loadChatPage(
  db: FirebaseFirestore.Firestore,
  page: number,
  pageSize: number
): Promise<{ rows: ChatRow[]; total: number }> {
  const base = db.collection(CHAT_COLLECTION).orderBy("lastSeen", "desc");
  const [snap, count] = await Promise.all([
    base
      .select(...LIST_FIELDS)
      .offset(Math.max(0, page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    db.collection(CHAT_COLLECTION).count().get(),
  ]);
  return { rows: snap.docs.map(rowOfDoc), total: count.data().count };
}

/**
 * ดึงเฉพาะห้องที่ตรงเงื่อนไขเดียว เช่น "ติดป้ายด่วนมาก" หรือ "บอทยกธงให้คนตอบ"
 *
 * ⚠️ ใส่ได้แค่ where เดียวและห้าม orderBy ฟิลด์อื่น — Firestore สร้างดัชนีฟิลด์เดียวให้เอง
 *    แต่ where+orderBy คนละฟิลด์ต้องไปสร้าง composite index ในคอนโซลก่อน ไม่งั้น query พัง
 *    เรียงเองในหน่วยความจำแทน (ชุดที่ได้มาเล็ก)
 *
 * คืน null เมื่อผลลัพธ์เยอะเกิน cap — แปลว่าไม่คุ้มที่จะยิงแยก ให้ไปใช้ดัชนีเต็มแทน
 */
export async function loadChatByField(
  db: FirebaseFirestore.Firestore,
  field: string,
  value: unknown,
  cap = 2000
): Promise<ChatRow[] | null> {
  const snap = await db
    .collection(CHAT_COLLECTION)
    .where(field, "==", value)
    .select(...LIST_FIELDS)
    .limit(cap + 1)
    .get();
  if (snap.size > cap) return null;
  return sortByLastSeen(snap.docs.map(rowOfDoc));
}

/** ดึงห้องตามรายชื่อรหัส (เช่น รายชื่อที่เปิดให้บอทตอบ) — คืน null ถ้ารายชื่อยาวเกินจะคุ้ม */
export async function loadChatByIds(
  db: FirebaseFirestore.Firestore,
  ids: string[],
  cap = 300
): Promise<ChatRow[] | null> {
  if (!ids.length) return [];
  if (ids.length > cap) return null;
  const refs = ids.map((id) => db.collection(CHAT_COLLECTION).doc(id));
  const docs = await db.getAll(...refs, { fieldMask: [...LIST_FIELDS] });
  return sortByLastSeen(docs.filter((d) => d.exists).map(rowOfDoc));
}

/** คนคุยล่าสุดไว้บนสุด — ทุกทางที่ดึงรายชื่อต้องเรียงแบบเดียวกัน */
function sortByLastSeen(rows: ChatRow[]): ChatRow[] {
  return rows.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

/** ดัชนีที่แคชไว้ (ต่อให้เกินอายุแล้ว) — ไม่ยอมอ่านคลังใหม่ให้ · null = ยังไม่เคยอ่าน */
export function peekChatIndex(): { rows: ChatRow[]; ageMs: number } | null {
  return cache ? { rows: cache.rows, ageMs: Date.now() - cache.at } : null;
}

/** กันหลายคำขอพร้อมกันสั่งอ่านทั้งคลังซ้ำซ้อน — คนมาทีหลังรอผลของคนแรก */
let inflight: Promise<ChatRow[]> | null = null;

/**
 * อ่านรายชื่อ "ทั้งคลัง" มาทำดัชนีในหน่วยความจำ (มีแคช) — เรียงคนคุยล่าสุดไว้บนสุด
 *
 * ⚠️ 1 รอบ = ค่าอ่านเท่าจำนวนห้องแชท (ตอนนี้ ~9,500) เรียกเฉพาะตอนที่ต้องมองทั้งคลังจริง ๆ
 *    คือ "ค้นหา" กับ "กรอง" เท่านั้น · เปิดหน้ามาเฉย ๆ ให้ใช้ loadChatPage()
 */
export async function loadChatIndex(db: FirebaseFirestore.Firestore, fresh = false): Promise<ChatRow[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  // มีคนกำลังอ่านอยู่แล้ว = ของสดกำลังมา ไม่ต้องยิงซ้ำ (ขอสดก็รอชุดนั้นได้)
  if (inflight) return inflight;
  const job = (async () => {
    const snap = await db.collection(CHAT_COLLECTION).select(...LIST_FIELDS).get();
    // เรียงคนคุยล่าสุดไว้บนสุดตั้งแต่ตอนทำดัชนี — ผลค้นหาจะได้เรียงมาให้เลย
    const rows = sortByLastSeen(snap.docs.map(rowOfDoc));
    cache = { at: Date.now(), rows };
    return rows;
  })();
  inflight = job;
  try {
    return await job;
  } finally {
    if (inflight === job) inflight = null;
  }
}

/** ห้องนี้ยังรอแอดมินตอบอยู่จริงไหม (ธงค้าง + ยังคุยกันอยู่ในช่วงนี้) */
export function isWaitingForAdmin(r: Pick<ChatRow, "needsHumanFollowup" | "lastSeen">): boolean {
  if (!r.needsHumanFollowup || !r.lastSeen) return false;
  return Date.now() - new Date(r.lastSeen).getTime() <= FOLLOWUP_WINDOW_DAYS * 86_400_000;
}

/** ดัชนีถูกอ่านสดครั้งล่าสุดเมื่อไหร่ (ms) — หน้าจอเอาไปบอกว่า "ข้อมูลที่เห็นเก่าแค่ไหน" */
export function chatIndexAge(): number | null {
  return cache ? Date.now() - cache.at : null;
}

/** ตารางจับคู่ "รหัสในลิงก์ OA Manager" ↔ userId จริง (คอลเลกชันเล็ก แคชรอบเดียวกับดัชนี) */
export async function loadOverrides(db: FirebaseFirestore.Firestore, fresh = false): Promise<Record<string, string>> {
  if (!fresh && overrides && Date.now() - overrides.at < LIGHT_CACHE_MS) return overrides.map;
  const snap = await db.collection(CHAT_OVERRIDE_COLLECTION).select("managerUserId").get();
  const map: Record<string, string> = {};
  snap.docs.forEach((d) => {
    const v = (d.get("managerUserId") as string) || "";
    if (v) map[d.id] = v;
  });
  overrides = { at: Date.now(), map };
  return map;
}

/**
 * รหัสห้องแชทที่พนักงานเคยวางไว้ในออเดอร์ (Supabase orders.data.lineChatUrl คู่กับ lineUserId)
 *
 * ⚠️ รหัสท้ายลิงก์ OA Manager "ไม่ใช่" userId และเดาจาก userId ไม่ได้เลย
 *    (วัดจริง 15 ก.ย. 69: คู่ที่มีอยู่ 215 คู่ ไม่มีสักคู่ที่สองค่านี้ตรงกัน)
 *    ตารางจับคู่จึงเป็นทางเดียวที่จะรู้ลิงก์ห้องแชทของลูกค้าคนหนึ่ง
 */
async function loadOrderChatIds(fresh = false): Promise<Record<string, string>> {
  if (!fresh && orderChatIds && Date.now() - orderChatIds.at < LIGHT_CACHE_MS) return orderChatIds.map;
  const map: Record<string, string> = {};
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const { data } = await sb
        .from("orders")
        .select("lineChatUrl:data->>lineChatUrl,lineUserId:data->>lineUserId")
        .not("data->>lineChatUrl", "is", null)
        .not("data->>lineUserId", "is", null);
      for (const r of (data ?? []) as { lineChatUrl?: string; lineUserId?: string }[]) {
        const id = chatIdInUrl(r.lineChatUrl ?? "");
        if (id && r.lineUserId) map[r.lineUserId] = id; // ใบใหม่กว่าอยู่ท้ายรายการ = ทับของเก่าให้เอง
      }
    } catch {
      /* อ่านออเดอร์ไม่ได้ก็แค่ไม่มีลิงก์ให้กด */
    }
  }
  orderChatIds = { at: Date.now(), map };
  return map;
}

/** แกะรหัสห้องแชทออกจากลิงก์ OA Manager (รองรับทั้งแบบมีเลข 2 นำหน้าและไม่มี) */
export function chatIdInUrl(url: string): string | null {
  const m = (url || "").match(/chat\/2?([A-Za-z][0-9a-f]{32})/i);
  return m ? m[1] : null;
}

/**
 * รหัสห้องแชทของลูกค้าทุกคนที่ "รู้" — ตารางจับคู่ที่ตั้งเองมาก่อน ไม่มีค่อยใช้ของที่เคยวางในออเดอร์
 * (ตั้งเองคือค่าที่คนยืนยันแล้ว ส่วนของออเดอร์เป็นของที่เก็บตกมาให้ ไม่ต้องกรอกซ้ำ)
 */
export interface ChatIdHit {
  /** รหัสที่ใช้ต่อท้ายลิงก์ chat.line.biz */
  id: string;
  /** เก็บตกมาจากลิงก์ที่พนักงานเคยวางไว้ในออเดอร์ (ไม่ได้ตั้งไว้ในตารางจับคู่โดยตรง) */
  fromOrder: boolean;
}

export async function loadChatIds(
  db: FirebaseFirestore.Firestore,
  fresh = false
): Promise<Record<string, ChatIdHit>> {
  const [ovr, fromOrders] = await Promise.all([loadOverrides(db, fresh), loadOrderChatIds(fresh)]);
  const out: Record<string, ChatIdHit> = {};
  for (const [uid, id] of Object.entries(fromOrders)) out[uid] = { id, fromOrder: true };
  for (const [uid, id] of Object.entries(ovr)) out[uid] = { id, fromOrder: false };
  return out;
}

/** แก้ค่าในดัชนีที่แคชไว้ให้ตรงกับที่เพิ่งเขียนลงฐาน — จะได้ไม่ต้องอ่านทั้งคลังใหม่หลังกดแก้ทีละคน */
export function patchChatRow(userId: string, patch: Partial<Pick<ChatRow, "adminAlias" | "adminNote" | "tag">>): void {
  const row = cache?.rows.find((r) => r.userId === userId);
  if (!row) return;
  if (patch.adminAlias !== undefined) {
    row.adminAlias = patch.adminAlias || null;
    row.aliasKey = row.adminAlias ? norm(row.adminAlias) : "";
  }
  if (patch.adminNote !== undefined) row.adminNote = patch.adminNote;
  if (patch.tag !== undefined) row.tag = patch.tag;
}

export function dropChatRow(userId: string): void {
  if (cache) cache.rows = cache.rows.filter((r) => r.userId !== userId);
  if (overrides) delete overrides.map[userId];
}

export function setOverride(userId: string, managerUserId: string): void {
  if (!overrides) return;
  if (managerUserId) overrides.map[userId] = managerUserId;
  else delete overrides.map[userId];
}

/** ทิ้งแคชทั้งก้อน — ใช้ตอนเพิ่มลูกค้าใหม่ (ดัชนียังไม่มีคนนั้น) */
export function invalidateChatIndex(): void {
  cache = null;
  overrides = null;
}

export interface Whitelist {
  /** เปิด = บอทตอบเฉพาะคนใน allowed · ปิด = บอทตอบทุกคน */
  enabled: boolean;
  allowed: Set<string>;
}

/** อ่านสวิตช์บอท (เอกสารใบเดียว อ่านสดทุกครั้ง — ค่าอ่าน 1 ครั้ง แต่ต้องตรงกับที่ตั้งจริงเสมอ) */
export async function loadWhitelist(db: FirebaseFirestore.Firestore): Promise<Whitelist> {
  const snap = await db.collection(WHITELIST_DOC.col).doc(WHITELIST_DOC.id).get();
  if (!snap.exists) return { enabled: false, allowed: new Set() };
  const ids = snap.get("userIds");
  return { enabled: !!snap.get("enabled"), allowed: new Set(Array.isArray(ids) ? (ids as string[]) : []) };
}

/** เลข OA ที่เอาไปประกอบลิงก์ chat.line.biz — ระบบแชทเป็นคนตั้งไว้ที่ settings/quick-setup */
export async function loadOaOwnerId(db: FirebaseFirestore.Firestore): Promise<string> {
  try {
    const snap = await db.collection(QUICK_SETUP_DOC.col).doc(QUICK_SETUP_DOC.id).get();
    if (!snap.exists) return "";
    const list = snap.get("oaOwnerIds");
    const first = (Array.isArray(list) ? (list[0] as { id?: string })?.id : "") || (snap.get("oaOwnerId") as string) || "";
    return /^U[0-9a-f]{32}$/i.test(first) ? first : "";
  } catch {
    return "";
  }
}

/** ลิงก์ห้องแชทใน LINE OA Manager — ไม่รู้เลข OA หรือไม่รู้รหัสห้อง = ไม่มีลิงก์ให้กด */
export function chatUrlOf(oaOwnerId: string, chatId?: string | null): string | null {
  return oaOwnerId && chatId ? `https://chat.line.biz/${oaOwnerId}/chat/${chatId}` : null;
}

/** เปิด/ปิดบอทให้ลูกค้ารายคน */
export async function setBotAllowed(db: FirebaseFirestore.Firestore, userId: string, allow: boolean): Promise<void> {
  const ref = db.collection(WHITELIST_DOC.col).doc(WHITELIST_DOC.id);
  await ref.set(
    { userIds: allow ? FieldValue.arrayUnion(userId) : FieldValue.arrayRemove(userId) },
    { merge: true }
  );
}

/** เปิด/ปิดโหมด whitelist ทั้งระบบ */
export async function setWhitelistMode(db: FirebaseFirestore.Firestore, enabled: boolean): Promise<void> {
  await db.collection(WHITELIST_DOC.col).doc(WHITELIST_DOC.id).set({ enabled }, { merge: true });
}

export { getChatFirestore };
