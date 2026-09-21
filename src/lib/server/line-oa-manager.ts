import "server-only";
import { getChatFirestore } from "@/lib/server/firebase-admin";

/**
 * 🏷 ป้ายแชทจาก LINE OA Manager (chat.line.biz) — เช่น "แจ้งยอด" ที่พนักงานติดไว้ตอนคุยกับลูกค้า
 *
 * ⚠️ ป้ายพวกนี้ "ไม่มี" ใน Messaging API ของ LINE (โทเคน LINE_MESSAGING_ACCESS_TOKEN ดึงไม่ได้)
 *    มีแค่ใน OA Manager ซึ่งเป็นหน้าเว็บที่ต้องล็อกอิน → ทางเดียวคือยิง API ภายในของ chat.line.biz
 *    ด้วยคุกกี้ล็อกอินของพนักงาน (เจ้าของร้านวางไว้ครั้งเดียวที่ settings/oa-manager ฐาน ordersure)
 *
 *  · คุกกี้อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งกลับหน้าเว็บ (ส่งแค่ 4 ตัวท้ายไว้ให้รู้ว่าตั้งแล้ว)
 *  · คุกกี้หมดอายุ = LINE ตอบ 401/403 หรือเด้งไปหน้า login → หน้าจอขึ้นเตือนให้วางใหม่
 *  · API ภายในไม่มีเอกสาร ชื่อฟิลด์อาจต่างจากที่คาดไว้ → normalize แบบเผื่อหลายชื่อ + ปุ่ม "ทดสอบ" คืนผลดิบ
 *
 * ⚠️ รหัสห้องแชท (chatId) ของ OA Manager ≠ userId ในคลังแชท Firestore (ดู line-chat.ts)
 *    การจับคู่ใช้ตารางที่พนักงานยืนยันไว้ (customer-overrides.managerUserId + ลิงก์ในออเดอร์) เท่านั้น
 *    ห้องที่ยังจับคู่ไม่ได้ = โชว์เป็นแถว "จาก OA" ด้วยชื่อ/รูปที่ OA ส่งมา (ยังเปิดแชทได้ แต่แก้/ปิดบอทไม่ได้)
 */

const BASE = "https://chat.line.biz";
const CONFIG_DOC = { col: "settings", id: "oa-manager" } as const;
/** ป้ายที่ดึงถ้ายังไม่ได้ตั้ง — เจ้าของร้านขอ 16 ก.ย. 69 */
export const DEFAULT_TAG_NAMES = ["แจ้งยอด"];
/** ผลที่ดึงได้ใช้ซ้ำได้นานเท่านี้ — พนักงานติด/ถอดป้ายทั้งวัน แต่ไม่ต้องสดถึงวินาที */
const CACHE_MS = 2 * 60 * 1000;
/** ดึงพลาด (คุกกี้หมด/LINE ล่ม) ไม่ยิงซ้ำถี่ ๆ */
const FAIL_CACHE_MS = 60 * 1000;
/** ห้องต่อป้ายสูงสุดที่ยอมไล่หน้า — เกินนี้ถือว่าป้ายนั้นใช้เป็นคิวงานไม่ได้อยู่แล้ว */
const MAX_CHATS_PER_TAG = 500;
const TIMEOUT_MS = 10_000;

export interface OaConfig {
  /** ค่า Cookie ทั้งบรรทัดที่จะส่งให้ chat.line.biz (มี ses=… เป็นอย่างน้อย) */
  cookie: string;
  /** ชื่อป้ายใน OA Manager ที่อยากเห็นในหน้า /admin/line-customers */
  tagNames: string[];
  /** เลข OA (U…) ที่ตั้งทับ — ว่าง = ใช้ค่าจาก settings/quick-setup */
  botId: string;
  savedBy: string;
  savedAt: string;
}

export interface OaTag {
  id: string;
  name: string;
}

export interface OaChat {
  chatId: string;
  name: string;
  picture?: string;
  /** ISO — OA Manager อัปเดตห้องนี้ล่าสุดเมื่อไหร่ (ข้อความล่าสุด) */
  updatedAt?: string;
  /** ชื่อป้ายที่ห้องนี้ติดอยู่ (เฉพาะป้ายที่เราดึง) */
  tagNames: string[];
}

export interface OaTagged {
  ok: boolean;
  error?: string;
  /** ป้ายที่ตั้งให้ดึง + จำนวนห้อง (-1 = ป้ายนี้ไม่มีใน OA Manager) */
  tags: { name: string; count: number }[];
  /** ห้องทั้งหมดที่ติดป้ายอย่างน้อย 1 ป้าย · key = chatId */
  chats: Record<string, OaChat>;
  fetchedAt: number;
}

let configCache: { at: number; cfg: OaConfig | null } | null = null;
let tagged: OaTagged | null = null;
let inflight: Promise<OaTagged> | null = null;
/** เส้นทาง API ที่เคยใช้ได้ — จำไว้จะได้ไม่ต้องลองผิดทุกครั้ง */
const knownPath: Record<string, string> = {};

/* ── ค่าตั้ง ─────────────────────────────────────────── */

export async function loadOaConfig(fresh = false): Promise<OaConfig | null> {
  if (!fresh && configCache && Date.now() - configCache.at < CACHE_MS) return configCache.cfg;
  const db = getChatFirestore();
  if (!db) return null;
  try {
    const snap = await db.collection(CONFIG_DOC.col).doc(CONFIG_DOC.id).get();
    const cfg: OaConfig | null = snap.exists
      ? {
          cookie: String(snap.get("cookie") ?? ""),
          tagNames: normTagNames(snap.get("tagNames")),
          botId: String(snap.get("botId") ?? ""),
          savedBy: String(snap.get("savedBy") ?? ""),
          savedAt: String(snap.get("savedAt") ?? ""),
        }
      : null;
    configCache = { at: Date.now(), cfg };
    return cfg;
  } catch {
    return configCache?.cfg ?? null;
  }
}

export async function saveOaConfig(
  patch: Partial<Pick<OaConfig, "cookie" | "tagNames" | "botId">>,
  by: string
): Promise<OaConfig | null> {
  const db = getChatFirestore();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase (FIREBASE_SERVICE_ACCOUNT_B64)");
  const fields: Record<string, unknown> = { savedBy: by, savedAt: new Date().toISOString() };
  if (patch.cookie !== undefined) fields.cookie = normalizeCookie(patch.cookie);
  if (patch.tagNames !== undefined) fields.tagNames = normTagNames(patch.tagNames);
  if (patch.botId !== undefined) fields.botId = patch.botId.trim();
  await db.collection(CONFIG_DOC.col).doc(CONFIG_DOC.id).set(fields, { merge: true });
  configCache = null;
  tagged = null; // ค่าตั้งใหม่ = ผลเก่าใช้ไม่ได้
  return loadOaConfig(true);
}

function normTagNames(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const x of arr) {
    const s = String(x ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * รับสิ่งที่พนักงานวางมาให้ได้หลายแบบ:
 *   · ค่าช่อง ses อย่างเดียว → เติม "ses=" ให้
 *   · "ses=…" หรือทั้งบรรทัด Cookie ที่ก๊อปจาก DevTools (Network → Request Headers → cookie)
 *   · "Cookie: ses=…" → ตัดคำนำหน้าออก
 */
export function normalizeCookie(raw: string): string {
  let s = (raw || "").trim().replace(/^cookie:\s*/i, "");
  if (!s) return "";
  if (!s.includes("=")) s = `ses=${s}`;
  return s
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("; ");
}

/** ค่า XSRF-TOKEN ในคุกกี้ (ถ้ามี) — บาง API ของ OA Manager ต้องส่งกลับใน header ด้วย */
function xsrfOf(cookie: string): string {
  const m = cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/i);
  return m ? decodeURIComponent(m[1]) : "";
}

/** 4 ตัวท้ายของ ses ไว้ให้หน้าจอบอกว่า "ตั้งคุกกี้ไว้แล้ว" โดยไม่โชว์ทั้งค่า */
export function cookieHint(cookie: string): string {
  const m = cookie.match(/(?:^|;\s*)ses=([^;]+)/i);
  const v = m ? m[1] : cookie;
  return v ? `…${v.slice(-4)}` : "";
}

/* ── ยิง API ภายในของ OA Manager ──────────────────────── */

export class OaError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
  }
}

async function oaGet(path: string, cookie: string): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      cookie,
      accept: "application/json, text/plain, */*",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36",
      referer: `${BASE}/`,
      "x-requested-with": "XMLHttpRequest",
    };
    const xsrf = xsrfOf(cookie);
    if (xsrf) headers["x-xsrf-token"] = xsrf;
    const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual", signal: ctl.signal, cache: "no-store" });
    // เด้งไปหน้า login = คุกกี้หมดอายุ
    if (res.status >= 300 && res.status < 400)
      throw new OaError("คุกกี้ OA Manager หมดอายุ — ล็อกอิน chat.line.biz ใหม่แล้ววางคุกกี้อีกครั้ง", 401);
    if (res.status === 401 || res.status === 403)
      throw new OaError("OA Manager ไม่รับคุกกี้นี้ (401/403) — ล็อกอิน chat.line.biz ใหม่แล้ววางคุกกี้อีกครั้ง", res.status);
    const text = await res.text();
    if (!res.ok) throw new OaError(`OA Manager ตอบ ${res.status} ที่ ${path}`, res.status, text.slice(0, 300));
    try {
      return JSON.parse(text);
    } catch {
      // HTML กลับมาแทน JSON = โดนส่งไปหน้า login แบบเงียบ
      throw new OaError("OA Manager ส่งหน้าเว็บกลับมาแทนข้อมูล — น่าจะคุกกี้หมดอายุ", 401, text.slice(0, 200));
    }
  } catch (e) {
    if (e instanceof OaError) throw e;
    const name = (e as Error).name;
    throw new OaError(name === "AbortError" ? "chat.line.biz ไม่ตอบใน 10 วินาที" : `ต่อ chat.line.biz ไม่ได้: ${(e as Error).message}`, 0);
  } finally {
    clearTimeout(timer);
  }
}

/** ลองหลายเส้นทาง (API ภายในเปลี่ยนเวอร์ชันได้) — เส้นไหนตอบ 2xx จำไว้ใช้รอบหน้า */
async function oaGetFirst(key: string, paths: string[], cookie: string): Promise<{ path: string; body: unknown }> {
  const order = knownPath[key] ? [knownPath[key], ...paths.filter((p) => p !== knownPath[key])] : paths;
  let last: OaError | null = null;
  for (const path of order) {
    try {
      const body = await oaGet(path, cookie);
      knownPath[key] = path;
      return { path, body };
    } catch (e) {
      const err = e as OaError;
      // คุกกี้พัง/ต่อไม่ได้ = ลองเส้นอื่นก็ไม่ช่วย
      if (err.status === 401 || err.status === 403 || err.status === 0) throw err;
      last = err;
    }
  }
  throw last ?? new OaError("ไม่มีเส้นทาง API ให้ลอง", 0);
}

/** หา array ในคำตอบ — API ภายในห่อ list ด้วยชื่อไม่แน่นอน */
function pickList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["list", "tags", "chats", "items", "data", "result"]) {
      const v = o[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
      if (v && typeof v === "object") {
        const inner = pickList(v);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function toTag(o: Record<string, unknown>): OaTag | null {
  const id = str(o.id ?? o.tagId ?? o.tag_id);
  const name = str(o.name ?? o.tagName ?? o.label ?? o.title).trim();
  return id && name ? { id, name } : null;
}

function isoOf(v: unknown): string | undefined {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === "string" && v) {
    const d = new Date(/^\d+$/.test(v) ? Number(v) : v);
    return isFinite(d.getTime()) ? d.toISOString() : undefined;
  }
  return undefined;
}

function toChat(o: Record<string, unknown>): Omit<OaChat, "tagNames"> | null {
  const profile = (o.profile ?? o.user ?? {}) as Record<string, unknown>;
  const chatId = str(o.chatId ?? o.id ?? o.chat_id ?? profile.userId);
  if (!chatId) return null;
  const name = str(profile.name ?? profile.displayName ?? o.nickname ?? o.name ?? o.displayName).trim();
  const picture = str(profile.iconUrl ?? profile.pictureUrl ?? profile.picture ?? o.iconUrl ?? o.pictureUrl) || undefined;
  const last = (o.lastMessage ?? o.latestMessage ?? {}) as Record<string, unknown>;
  const updatedAt = isoOf(o.updatedAt ?? o.lastMessageAt ?? o.lastUpdatedAt ?? last.timestamp ?? last.createdAt ?? o.timestamp);
  return { chatId, name: name || "(ไม่มีชื่อ)", picture, updatedAt };
}

/** รายชื่อป้ายทั้งหมดใน OA Manager */
export async function fetchOaTags(botId: string, cookie: string): Promise<{ path: string; tags: OaTag[]; raw: unknown }> {
  const { path, body } = await oaGetFirst("tags", [`/api/v1/bots/${botId}/tags`, `/api/v2/bots/${botId}/tags`], cookie);
  return { path, tags: pickList(body).map(toTag).filter((t): t is OaTag => !!t), raw: body };
}

/** ห้องแชทที่ติดป้ายนี้ — ไล่หน้าจนหมดหรือถึงเพดาน */
export async function fetchOaChatsByTag(
  botId: string,
  tagId: string,
  cookie: string
): Promise<{ path: string; chats: Omit<OaChat, "tagNames">[]; raw: unknown }> {
  const out: Omit<OaChat, "tagNames">[] = [];
  const seen = new Set<string>();
  let next = "";
  let path = "";
  let raw: unknown = null;
  for (let i = 0; i < 20 && out.length < MAX_CHATS_PER_TAG; i++) {
    const qs = new URLSearchParams({ folderType: "ALL", tagIds: tagId, limit: "50", sortKey: "UPDATED_AT", sortOrder: "DESC" });
    if (next) qs.set("next", next);
    const r = await oaGetFirst("chats", [`/api/v2/bots/${botId}/chats?${qs}`, `/api/v1/bots/${botId}/chats?${qs}`], cookie);
    path = r.path;
    if (i === 0) raw = r.body;
    const list = pickList(r.body);
    for (const o of list) {
      const c = toChat(o);
      if (c && !seen.has(c.chatId)) {
        seen.add(c.chatId);
        out.push(c);
      }
    }
    const body = r.body as Record<string, unknown> | null;
    next = str(body?.next ?? body?.nextCursor ?? body?.cursor);
    if (!next || list.length === 0) break;
  }
  return { path, chats: out, raw };
}

/* ── รวมทุกป้ายที่ตั้งไว้ (มีแคช) ───────────────────────── */

/** ผลที่แคชไว้ (ไม่ยิงใหม่) — null = ยังไม่เคยดึง */
export function peekOaTagged(): OaTagged | null {
  return tagged;
}

/** ยังใช้ผลที่แคชไว้ได้ไหม (สำเร็จ 2 นาที · พลาด 1 นาที) */
function isFreshEnough(t: OaTagged): boolean {
  return Date.now() - t.fetchedAt < (t.ok ? CACHE_MS : FAIL_CACHE_MS);
}

/**
 * ดึงห้องที่ติดป้ายตามค่าตั้ง (ทุกป้ายรวมกัน) — มีแคช + กันยิงซ้อน
 * ไม่ได้ตั้งคุกกี้ = คืน null (หน้าจอไม่ต้องโชว์อะไรเกี่ยวกับ OA)
 */
export async function loadOaTagged(botIdFallback: string, fresh = false): Promise<OaTagged | null> {
  const cfg = await loadOaConfig();
  if (!cfg?.cookie) return null;
  if (!fresh && tagged && isFreshEnough(tagged)) return tagged;
  if (inflight) return inflight;
  const job = (async (): Promise<OaTagged> => {
    const botId = cfg.botId || botIdFallback;
    const names = cfg.tagNames.length ? cfg.tagNames : DEFAULT_TAG_NAMES;
    const out: OaTagged = { ok: true, tags: [], chats: {}, fetchedAt: Date.now() };
    if (!botId) {
      out.ok = false;
      out.error = "ไม่รู้เลข OA (U…) — ตั้งในกล่องเชื่อม OA Manager";
      return out;
    }
    try {
      const { tags } = await fetchOaTags(botId, cookie(cfg));
      for (const name of names) {
        const tag = tags.find((t) => t.name.trim() === name) ?? tags.find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
        if (!tag) {
          out.tags.push({ name, count: -1 });
          continue;
        }
        const { chats } = await fetchOaChatsByTag(botId, tag.id, cookie(cfg));
        out.tags.push({ name, count: chats.length });
        for (const c of chats) {
          const cur = out.chats[c.chatId];
          if (cur) {
            if (!cur.tagNames.includes(name)) cur.tagNames.push(name);
          } else out.chats[c.chatId] = { ...c, tagNames: [name] };
        }
      }
    } catch (e) {
      out.ok = false;
      out.error = (e as Error).message;
      // ดึงพลาดแต่มีของเก่า → ใช้ของเก่าไปก่อน แค่ติดเหตุผลไว้
      if (tagged?.ok) {
        out.tags = tagged.tags;
        out.chats = tagged.chats;
      }
    }
    return out;
  })();
  inflight = job;
  try {
    tagged = await job;
    return tagged;
  } finally {
    if (inflight === job) inflight = null;
  }
}

const cookie = (cfg: OaConfig) => cfg.cookie;

/** ตัด "2" ที่บางลิงก์นำหน้า chatId — ให้เทียบกับตารางจับคู่ได้ทั้งสองแบบ */
export function chatIdKeys(chatId: string): string[] {
  const bare = chatId.replace(/^2(?=[A-Za-z][0-9a-f]{32}$)/i, "");
  return bare === chatId ? [chatId, `2${chatId}`] : [chatId, bare];
}

/**
 * ทดสอบการเชื่อมต่อ — คืนผลดิบเท่าที่จะช่วยไล่ปัญหาได้ (เส้นทางที่ใช้ · ชื่อป้ายที่เจอ · ฟิลด์ตัวอย่างของห้อง)
 * ไม่ส่งคุกกี้กลับ · ไม่ส่งข้อมูลลูกค้าทั้งชุด แค่ตัวอย่างใบเดียว
 */
export async function probeOa(botIdFallback: string): Promise<{
  ok: boolean;
  botId: string;
  error?: string;
  tagsPath?: string;
  tags?: string[];
  chatsPath?: string;
  sampleKeys?: string[];
  sample?: Record<string, unknown>;
  matchedTag?: string;
  chatCount?: number;
}> {
  const cfg = await loadOaConfig(true);
  const botId = cfg?.botId || botIdFallback;
  if (!cfg?.cookie) return { ok: false, botId, error: "ยังไม่ได้วางคุกกี้" };
  if (!botId) return { ok: false, botId, error: "ไม่รู้เลข OA (U…)" };
  try {
    const t = await fetchOaTags(botId, cfg.cookie);
    const names = cfg.tagNames.length ? cfg.tagNames : DEFAULT_TAG_NAMES;
    const want = t.tags.find((x) => names.includes(x.name.trim())) ?? t.tags[0];
    const res: Awaited<ReturnType<typeof probeOa>> = { ok: true, botId, tagsPath: t.path, tags: t.tags.map((x) => x.name) };
    if (!t.tags.length) {
      res.ok = false;
      res.error = "ต่อได้แต่อ่านรายชื่อป้ายไม่ออก (รูปแบบคำตอบไม่ตรงที่คาด)";
      res.sample = (t.raw && typeof t.raw === "object" ? (t.raw as Record<string, unknown>) : { raw: t.raw }) as Record<string, unknown>;
      return res;
    }
    if (want) {
      const c = await fetchOaChatsByTag(botId, want.id, cfg.cookie);
      res.matchedTag = want.name;
      res.chatsPath = c.path;
      res.chatCount = c.chats.length;
      const first = pickList(c.raw)[0];
      if (first) {
        res.sampleKeys = Object.keys(first);
        res.sample = first;
      }
    }
    return res;
  } catch (e) {
    const err = e as OaError;
    return { ok: false, botId, error: err.message + (err.detail ? ` · ${err.detail}` : "") };
  }
}
