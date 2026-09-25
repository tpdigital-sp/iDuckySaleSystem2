import "server-only";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * 📣 บัญชี LINE ที่ใช้ "แจ้งเตือนร้าน" — แยกจากบัญชีที่คุยกับลูกค้า
 *
 * เจ้าของร้านสั่ง 14 ก.ย. 69: อยากให้ข้อความเข้ากลุ่มพนักงานมาจากบัญชีแยกต่างหาก
 * ไม่ใช่บัญชีร้านที่ลูกค้าทักอยู่ (iDuckyshop @146swmrt) — ข้อความในกลุ่มจะได้ไม่ปนกับงานลูกค้า
 * บัญชีแจ้งเตือนต้องเป็น channel ที่ไม่มีลูกค้าคุยด้วย เพราะ webhook ของมันจะถูกชี้มาที่เว็บนี้
 *
 * ⚠️ ทำไมไม่เก็บใน env: env รวมของไซต์ชน 4KB ของ Lambda อยู่แล้ว (ดู [[iducky-deploy]])
 *    token ตัวเดียวยาว ~170 ไบต์ ใส่แล้ว deploy ล่มทั้งเว็บ → เก็บลงแถวตั้งค่าในตาราง products แทน
 *
 * ⚠️ ทำไมต้องเข้ารหัส: แถวในตาราง products **อ่าน public ได้** (RLS เปิด select — ทดสอบยืนยันแล้ว)
 *    channel access token = สิทธิ์ส่งข้อความในนามบัญชีนั้น หลุดไม่ได้เด็ดขาด
 *    → เข้ารหัส AES-256-GCM ด้วยกุญแจที่คิดจาก ADMIN_SESSION_SECRET (อยู่ใน env ฝั่งเซิร์ฟเวอร์เท่านั้น)
 *    คนที่อ่านแถวไปได้แค่ก้อนไบต์ที่ถอดไม่ออก
 *
 * ⚠️ id ของห้องแชท (U…/C…) ผูกกับบัญชีที่รับ webhook — ใช้ข้ามบัญชีไม่ได้
 *    จึงบังคับให้ token กับปลายทางมาจากชุดเดียวกันเสมอ ตั้งมาไม่ครบคู่ = ถอยไปใช้บัญชีร้านทั้งคู่
 */
export const LINE_ALERT_ID = "__line_alert__";

export interface LineAlertDoc {
  /** token ที่เข้ารหัสแล้ว (ไม่เคยเก็บตัวจริง) */
  enc?: string;
  /** ห้องปลายทางทั่วไป — ออเดอร์สั่งจำนวนมาก · ของใกล้หมด · ใบสมัครตัวแทน */
  to?: string;
  /** ห้องปลายทางเรื่องเงิน — เคลม · ยอดค้างงวด 2 (ไม่ตั้ง = ใช้ to) */
  adminTo?: string;
  /**
   * 🛟 ปลายทางสำรองของ "บัญชีร้าน" — ใช้เมื่อบัญชีแจ้งเตือนส่งไม่ออก (โควตาหมด/ถูกเอาออกจากกลุ่ม)
   * ⚠️ ต้องเป็นเลขห้องที่ "บัญชีร้าน" ได้ยินเอง ใช้เลขของบัญชีแจ้งเตือนไม่ได้ (เลขผูกกับบัญชี)
   *    ไม่ตั้ง = ถอยไปใช้ LINE_STOCK_ALERT_TO / LINE_ADMIN_ALERT_TO ใน env ตามเดิม
   */
  shopTo?: string;
  /**
   * ⏰ เจอ "โควตาเดือนนี้หมด" (LINE 429) ครั้งล่าสุดเมื่อไหร่
   * 6 ชั่วโมงแรกข้ามบัญชีนั้นไปเลย ไม่ต้องรอ LINE ตีกลับทุกใบ — ประตูสร้างออเดอร์ await ตัวส่งอยู่
   */
  outAt?: string;
  /** การ์ดที่ส่งไม่ออก 20 ใบล่าสุด — ไว้ขึ้นแถบแดงหน้า /admin/line-groups */
  misses?: AlertMiss[];
  savedAt?: string;
  savedBy?: string;
}

/**
 * 📭 รายการ "แจ้งเตือนที่ส่งไม่ออก"
 *
 * ⚠️ เก็บแค่หัวเรื่องกับสาเหตุ **ห้ามเก็บชื่อ/เบอร์/เลขออเดอร์** — แถวในตาราง products อ่าน public ได้
 *    (RLS เปิด select เหมือน __line_sources__) อยากรู้ว่าใบไหนให้ไปดูหน้างานตามหัวเรื่อง
 */
export interface AlertMiss {
  at: string;
  /** หัวการ์ด เช่น "✏️ ลูกค้าขอแก้ไขออเดอร์" */
  title: string;
  /** สาเหตุที่ LINE ไม่รับ */
  reason: string;
}

/** สภาพการตั้งค่าที่ปลอดภัยพอจะส่งให้หน้าจอแอดมิน (ไม่มี token ตัวจริง) */
export interface LineAlertStatus {
  hasToken: boolean;
  to: string;
  adminTo: string;
  /** ปลายทางสำรองที่ตั้งเอง (ว่าง = ใช้ค่าใน env ถ้ามี) */
  shopTo: string;
  /** มีทางสำรองให้ถอยไปจริงไหม (บัญชีร้าน + ปลายทางของบัญชีร้าน) */
  hasFallback: boolean;
  /** เจอโควตาหมดครั้งล่าสุด (ISO) — มีค่า = ตอนนี้ระบบข้ามบัญชีแจ้งเตือนอยู่ */
  outAt?: string;
  /** การ์ดที่ส่งไม่ออก ใหม่สุดขึ้นก่อน */
  misses: AlertMiss[];
  savedAt?: string;
  savedBy?: string;
  /** ครบคู่จนใช้งานได้จริงไหม (มี token + ปลายทาง) */
  ready: boolean;
}

function key(): Buffer | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return crypto.createHash("sha256").update(`line-alert:${secret}`).digest();
}

/** เข้ารหัส token → "iv.tag.cipher" (base64url ทั้งสามท่อน) */
export function sealToken(plain: string): string | null {
  const k = key();
  if (!k || !plain) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/** ถอดรหัสกลับ — พังเมื่อไหร่คืน null (กุญแจเปลี่ยน/ข้อมูลเสีย) ห้าม throw */
export function openToken(sealed?: string): string | null {
  const k = key();
  if (!k || !sealed) return null;
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !body) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

let cache: { at: number; doc: LineAlertDoc } | null = null;
const TTL = 10_000;

export async function loadLineAlert(): Promise<LineAlertDoc> {
  if (cache && Date.now() - cache.at < TTL) return cache.doc;
  const sb = getSupabaseAdmin();
  if (!sb) return {};
  const { data } = await sb.from("products").select("data").eq("id", LINE_ALERT_ID).maybeSingle();
  const doc = (data?.data as LineAlertDoc | undefined) ?? {};
  cache = { at: Date.now(), doc };
  return doc;
}

export async function saveLineAlert(patch: LineAlertDoc): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const old = await loadLineAlert();
  const doc: LineAlertDoc = { ...old, ...patch };
  // ⚠️ ตาราง products บังคับ name/category/price — ใส่ไม่ครบ upsert เงียบ ๆ ไม่เข้า
  await sb.from("products").upsert(
    {
      id: LINE_ALERT_ID,
      name: "(ตั้งค่าระบบ — บัญชีแจ้งเตือน LINE)",
      category: "__settings__",
      price: 0,
      data: doc,
    },
    { onConflict: "id" },
  );
  cache = { at: Date.now(), doc };
}

export function statusOf(doc: LineAlertDoc): LineAlertStatus {
  const hasToken = !!openToken(doc.enc);
  const to = doc.to ?? "";
  return {
    hasToken,
    to,
    adminTo: doc.adminTo ?? "",
    shopTo: doc.shopTo ?? "",
    hasFallback: !!process.env.LINE_MESSAGING_ACCESS_TOKEN && !!(doc.shopTo || process.env.LINE_STOCK_ALERT_TO || process.env.LINE_ADMIN_ALERT_TO),
    outAt: doc.outAt,
    misses: doc.misses ?? [],
    savedAt: doc.savedAt,
    savedBy: doc.savedBy,
    ready: hasToken && !!to,
  };
}

/** token ของบัญชีแจ้งเตือน (ไม่ได้ตั้ง/ถอดไม่ออก = null) — ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น */
export async function alertToken(): Promise<string | null> {
  return openToken((await loadLineAlert()).enc);
}

let botCache: { at: number; token: string; userId: string | null } | null = null;

/**
 * userId ของ "บัญชีแจ้งเตือน" เอง — ใช้เทียบกับ destination ของ webhook
 * เพื่อรับเฉพาะ event ของบัญชีนี้จริง ๆ (กันคนนอกยิง JSON มั่วเข้ามาเขียนลงฐาน)
 * แคชไว้ 5 นาที เพราะ webhook ยิงถี่ได้ และค่านี้ไม่เปลี่ยนเลยตราบใดที่ token เดิม
 */
export async function alertBotUserId(): Promise<string | null> {
  const token = await alertToken();
  if (!token) return null;
  if (botCache && botCache.token === token && Date.now() - botCache.at < 300_000) return botCache.userId;
  let userId: string | null = null;
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) userId = ((await res.json()) as { userId?: string }).userId ?? null;
  } catch {
    /* ถามไม่ได้ = ไม่รับ event รอบนี้ ดีกว่าจดของที่ยืนยันไม่ได้ */
  }
  botCache = { at: Date.now(), token, userId };
  return userId;
}

export interface AlertResult {
  ok: boolean;
  /** ส่งจากบัญชีไหน — บัญชีแจ้งเตือนที่ตั้งไว้ หรือบัญชีร้านตามเดิม */
  via: "alert" | "shop" | "none";
  reason?: string;
  /** สถานะที่ LINE ตอบ (429 = โควตาเดือนนี้หมด · 403 = ไม่ได้อยู่ในห้อง · 401 = token ผิด) */
  status?: number;
  /** ส่งได้เพราะถอยไปใช้บัญชีร้าน (บัญชีแจ้งเตือนส่งไม่ออก) */
  fallback?: boolean;
}

/** แถว ป้าย-ค่า ในการ์ด (ชุดเดียวกับการ์ดที่ส่งหาลูกค้าใน notify.ts) */
export interface AlertRow {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}

/**
 * 🎴 การ์ดแจ้งเตือนร้าน — อ่านง่ายกว่าข้อความล้วนเยอะ โดยเฉพาะบนมือถือ
 * ทุกเรื่องใช้โครงเดียวกัน ต่างแค่สีหัวการ์ดกับปุ่มท้ายการ์ด
 */
export interface AlertCard {
  /** สีแถบหัวการ์ด — บอกความเร่งด่วนด้วยสี ไม่ต้องอ่านก็รู้ว่าเรื่องอะไร */
  tone: string;
  /** หัวข้อใหญ่บนแถบสี */
  title: string;
  /** ประโยคบอกว่าต้องทำอะไรต่อ */
  headline?: string;
  /**
   * ป้ายเล็กเหนือตัวเลขใหญ่ — บอกว่าตัวเลขนั้นคือยอดอะไร
   * ⚠️ ตัวเลขใหญ่ลอย ๆ ไม่มีป้าย คนอ่านเดาไม่ออกว่าเป็นยอดรวมหรือยอดค้าง (เจ้าของร้านทักเอง 14 ก.ย. 69)
   */
  heroLabel?: string;
  /** เลขที่/ชื่อหลักที่ต้องเด่นสุดในการ์ด */
  hero?: string;
  rows?: AlertRow[];
  /** รายการย่อย เช่นรายชื่อสินค้า/ออเดอร์ (ตัดที่ 15 บรรทัด กันการ์ดยาวเกิน) */
  bullets?: string[];
  /** กล่องข้อความเน้น (สีตามหัวการ์ด) */
  note?: string;
  button?: { label: string; uri: string };
  /** ข้อความในแถบแจ้งเตือน + เครื่องที่แสดง Flex ไม่ได้ */
  alt: string;
}

const MAX_BULLETS = 15;

function row(r: AlertRow) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      { type: "text", text: r.label, size: "sm", color: "#94A3B8", flex: 2 },
      {
        type: "text",
        text: r.value,
        size: "sm",
        color: r.color ?? "#334155",
        weight: r.bold ? "bold" : "regular",
        flex: 3,
        align: "end",
        wrap: true,
      },
    ],
  };
}

/** การ์ด → ข้อความ Flex 1 ใบ */
function bubbleOf(c: AlertCard): unknown {
  const shown = (c.bullets ?? []).slice(0, MAX_BULLETS);
  const hidden = (c.bullets ?? []).length - shown.length;
  const body: unknown[] = [];
  if (c.headline) body.push({ type: "text", text: c.headline, size: "sm", color: "#334155", wrap: true });
  if (c.hero)
    body.push({
      type: "box",
      layout: "vertical",
      spacing: "none",
      contents: [
        ...(c.heroLabel
          ? [{ type: "text", text: c.heroLabel, size: "xs", color: "#94A3B8", wrap: true }]
          : []),
        { type: "text", text: c.hero, size: "lg", weight: "bold", color: "#0F172A", wrap: true },
      ],
    });
  if (c.rows?.length) {
    body.push({ type: "separator", color: "#E2E8F0" });
    body.push({ type: "box", layout: "vertical", spacing: "sm", contents: c.rows.map(row) });
  }
  if (shown.length) {
    body.push({ type: "separator", color: "#E2E8F0" });
    body.push({
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: [
        ...shown.map((t) => ({ type: "text", text: `• ${t}`, size: "sm", color: "#334155", wrap: true })),
        ...(hidden > 0
          ? [{ type: "text", text: `…และอีก ${hidden.toLocaleString("th-TH")} รายการ`, size: "xs", color: "#94A3B8" }]
          : []),
      ],
    });
  }
  if (c.note) {
    body.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#F8FAFC",
      cornerRadius: "8px",
      paddingAll: "10px",
      contents: [{ type: "text", text: c.note, size: "xs", color: "#475569", wrap: true }],
    });
  }

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: c.tone,
      paddingAll: "14px",
      contents: [
        { type: "text", text: "แจ้งเตือนร้าน iDucky", size: "xs", color: "#FFFFFFCC" },
        { type: "text", text: c.title, size: "xl", weight: "bold", color: "#FFFFFF", wrap: true },
      ],
    },
    body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", contents: body },
    ...(c.button
      ? {
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "12px",
            contents: [
              {
                type: "button",
                style: "primary",
                height: "sm",
                color: c.tone,
                action: { type: "uri", label: c.button.label, uri: c.button.uri },
              },
            ],
          },
        }
      : {}),
  };
}

/**
 * 📊 โควตาข้อความของบัญชีแจ้งเตือน — ไว้ขึ้นหน้าจอ ไม่ให้ตาย
 *
 * ⚠️ กับดักที่ทำให้ไลน์เงียบทั้งวัน 24 ก.ย. 69: การ์ด 1 ใบที่ส่งเข้า "กลุ่ม"
 *    LINE ตัดโควตา **เท่าจำนวนคนในกลุ่ม** ไม่ใช่ 1 ข้อความ
 *    บัญชีแจ้งเตือน iducky-admin เป็นแพ็กเกจฟรี = 300 ข้อความ/เดือน · กลุ่มแอดมินมี 8 คน
 *    → ส่งได้เดือนละ ~37 ใบเท่านั้น พอครบ LINE ตอบ 429 "You have reached your monthly limit."
 *    แล้วทุกการ์ดก็หายเงียบ เพราะไม่มีใครดูค่าที่ตัวส่งคืนมา
 */
export interface AlertQuota {
  /** ส่งได้ทั้งเดือนกี่ข้อความ (null = ไม่จำกัด/ถามไม่ได้) */
  limit: number | null;
  used: number;
  left: number | null;
  /** คนในห้องปลายทาง — การ์ด 1 ใบตัดโควตาเท่านี้ (แชทเดี่ยว = 1) */
  members: number | null;
  /** ส่งการ์ดได้อีกกี่ใบ */
  cards: number | null;
}

let quotaCache: { at: number; token: string; to: string; q: AlertQuota } | null = null;
const QUOTA_TTL = 600_000;

async function ask<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** โควตาของบัญชี+ห้องคู่หนึ่ง (แคช 10 นาที — ตัวเลขนี้ไม่ต้องสดวินาทีต่อวินาที) */
async function quotaOf(token: string, to: string): Promise<AlertQuota | null> {
  if (quotaCache && quotaCache.token === token && quotaCache.to === to && Date.now() - quotaCache.at < QUOTA_TTL)
    return quotaCache.q;
  const [quota, used, members] = await Promise.all([
    ask<{ type?: string; value?: number }>("https://api.line.me/v2/bot/message/quota", token),
    ask<{ totalUsage?: number }>("https://api.line.me/v2/bot/message/quota/consumption", token),
    to.startsWith("C")
      ? ask<{ count?: number }>(`https://api.line.me/v2/bot/group/${encodeURIComponent(to)}/members/count`, token)
      : Promise.resolve({ count: 1 }),
  ]);
  if (!quota && !used) return null;
  const limit = quota?.type === "limited" && typeof quota.value === "number" ? quota.value : null;
  const totalUsage = used?.totalUsage ?? 0;
  const per = members?.count ?? null;
  const left = limit === null ? null : Math.max(0, limit - totalUsage);
  const q: AlertQuota = {
    limit,
    used: totalUsage,
    left,
    members: per,
    cards: left === null ? null : per ? Math.floor(left / per) : left,
  };
  quotaCache = { at: Date.now(), token, to, q };
  return q;
}

/** โควตาของบัญชีที่ใช้ส่งอยู่ตอนนี้ — หน้า /admin/line-groups เรียกตัวนี้ */
export async function alertQuota(): Promise<AlertQuota | null> {
  const doc = await loadLineAlert();
  const tok = openToken(doc.enc);
  if (tok && doc.to) return quotaOf(tok, doc.to);
  const shop = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  const to = doc.shopTo || process.env.LINE_STOCK_ALERT_TO;
  return shop && to ? quotaOf(shop, to) : null;
}

/**
 * 📭 จดการ์ดที่ส่งไม่ออก — เดิมตัวส่งคืน { ok:false } แล้วทุกคนที่เรียกก็ทิ้งค่าไปเฉย ๆ
 * ไลน์เงียบทั้งวันโดยไม่มีใครรู้ (24 ก.ย. 69) เพราะไม่มีที่ไหนเก็บว่า "ส่งไม่ผ่าน"
 * ⚠️ ห้ามจดชื่อ/เบอร์/เลขออเดอร์ลงแถวนี้ — products อ่าน public ได้ (ดู AlertMiss)
 */
async function noteMiss(title: string, reason: string): Promise<void> {
  console.error(`[line-alert] ส่งแจ้งเตือนไม่ออก: ${title} — ${reason}`);
  try {
    const old = await loadLineAlert();
    const misses: AlertMiss[] = [{ at: new Date().toISOString(), title, reason }, ...(old.misses ?? [])].slice(0, 20);
    await saveLineAlert({ misses });
  } catch {
    /* จดไม่ได้ก็ช่างมัน อย่าให้ล้มทับงานที่เรียกมา */
  }
}

/** ลบรายการที่พลาดทิ้ง (แอดมินอ่านแล้ว) */
export async function clearAlertMisses(): Promise<void> {
  await saveLineAlert({ misses: [] });
}

export interface Attempt {
  via: "alert" | "shop";
  token: string;
  to: string;
}

/**
 * ลำดับการส่ง: บัญชีแจ้งเตือนก่อน → ไม่ผ่านค่อยถอยไปบัญชีร้าน
 * ⚠️ เลขห้องผูกกับบัญชี ใช้ข้ามบัญชีไม่ได้ — ทางสำรองจึงต้องมีเลขห้องของ "บัญชีร้าน" เองเท่านั้น
 *    (doc.shopTo ที่ตั้งในหน้าแอดมิน หรือ LINE_STOCK_ALERT_TO / LINE_ADMIN_ALERT_TO เดิมใน env)
 * export ไว้ให้ npm run check:alert เรียกตรวจลำดับได้ โดยไม่ต้องยิงข้อความจริง
 */
export function planOf(doc: LineAlertDoc, money: boolean): Attempt[] {
  const out: Attempt[] = [];
  const tok = openToken(doc.enc);
  const mine = money ? doc.adminTo || doc.to : doc.to;
  // เพิ่งเจอโควตาหมดไม่ถึง 6 ชม. = ข้ามไปเลย ไม่ต้องเสียเวลารอ LINE ตีกลับทุกใบ
  // (ไม่ข้ามยาวถึงสิ้นเดือน เผื่อร้านอัปเกรดแพ็กเกจระหว่างเดือนแล้วต้องกลับมาใช้ได้เอง)
  const resting = doc.outAt ? Date.now() - Date.parse(doc.outAt) < 6 * 3_600_000 : false;
  if (tok && mine && !resting) out.push({ via: "alert", token: tok, to: mine });

  const shopToken = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  const shopTo =
    doc.shopTo ||
    (money ? process.env.LINE_ADMIN_ALERT_TO || process.env.LINE_STOCK_ALERT_TO : process.env.LINE_STOCK_ALERT_TO) ||
    "";
  if (shopToken && shopTo) out.push({ via: "shop", token: shopToken, to: shopTo });

  // ไม่มีทางสำรองเลย = ลองบัญชีแจ้งเตือนอยู่ดี ดีกว่าไม่ส่งอะไรเลย
  if (!out.length && tok && mine) out.push({ via: "alert", token: tok, to: mine });
  return out;
}

/** ยิงจริง 1 ครั้ง — ไม่ throw ออกไปข้างนอกเด็ดขาด */
async function sendOne(a: Attempt, messages: unknown[]): Promise<AlertResult> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ to: a.to, messages }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, via: a.via };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    // 403 = บัญชีไม่ได้อยู่ในกลุ่มนั้น (หรือถูกบล็อก) · 401 = token ผิด/หมดอายุ · 429 = โควตาหมด
    const hint =
      res.status === 403
        ? "บัญชีที่ใช้ส่งไม่ได้อยู่ในห้องนั้น — เชิญเข้ากลุ่มแล้วอย่าเอาออก"
        : res.status === 401
          ? "token ไม่ถูกต้องหรือหมดอายุ"
          : res.status === 429
            ? "โควตาข้อความของบัญชีนั้นหมดเดือนนี้"
            : body?.message || `LINE ตอบ ${res.status}`;
    return { ok: false, via: a.via, reason: hint, status: res.status };
  } catch (e) {
    return { ok: false, via: a.via, reason: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" };
  }
}

/**
 * 📤 ส่งข้อความแจ้งร้าน — รับได้ทั้งการ์ด Flex และข้อความล้วน
 *
 * เลือกชุดที่ใช้แบบ "ทั้งคู่ต้องมาจากที่เดียวกัน":
 *   1. ตั้งบัญชีแจ้งเตือนไว้ครบ (token + ปลายทาง) → ใช้ชุดนั้น
 *   2. ส่งไม่ออก (โควตาหมด/ถูกเอาออกจากกลุ่ม/token เสีย) → ถอยไปบัญชีร้าน + ปลายทางของบัญชีร้าน
 *   3. ไม่ผ่านทั้งคู่ → จดไว้ในรายการ "ส่งไม่ออก" ให้ขึ้นแถบแดงหน้า /admin/line-groups
 * money = เรื่องเงิน (เคลม · ยอดค้างงวด 2) ซึ่งเดิมมี LINE_ADMIN_ALERT_TO แยกอยู่แล้ว
 */
export async function pushShopAlert(
  msg: string | AlertCard,
  opts?: { money?: boolean },
): Promise<AlertResult> {
  const doc = await loadLineAlert();
  const plan = planOf(doc, !!opts?.money);
  const title = typeof msg === "string" ? msg.slice(0, 60) : msg.title;
  if (!plan.length) {
    const reason = "ยังไม่ได้ตั้งบัญชีหรือปลายทางสำหรับแจ้งเตือน";
    await noteMiss(title, reason);
    return { ok: false, via: "none", reason };
  }

  let last: AlertResult = { ok: false, via: "none" };
  for (const a of plan) {
    /*
     * ⚠️ เหลือโควตาน้อย = เตือนไปในการ์ดใบนี้เลย ไม่ยิงการ์ดเตือนใบใหม่
     * (การ์ดเตือนก็กินโควตาเท่ากับคนในกลุ่ม — จะยิ่งเร่งให้หมดเร็ว)
     */
    const q = a.via === "alert" ? await quotaOf(a.token, a.to) : null;
    const lowNote =
      q && q.cards !== null && q.cards <= 5
        ? `⚠️ โควตาแจ้งเตือนเดือนนี้เหลือส่งได้อีก ${q.cards.toLocaleString("th-TH")} ใบ (ใช้ไป ${q.used.toLocaleString("th-TH")}/${(q.limit ?? 0).toLocaleString("th-TH")} ข้อความ · การ์ด 1 ใบตัด ${(q.members ?? 1).toLocaleString("th-TH")} ข้อความตามจำนวนคนในกลุ่ม) — หมดแล้วไลน์จะเงียบทั้งกลุ่ม`
        : "";
    const card =
      typeof msg === "string" || !lowNote ? msg : { ...msg, note: msg.note ? `${msg.note}\n\n${lowNote}` : lowNote };
    const messages =
      typeof card === "string"
        ? [{ type: "text", text: lowNote ? `${card}\n\n${lowNote}` : card }]
        : // altText ยาวเกิน 400 ตัวอักษร LINE ปฏิเสธทั้งข้อความ — ตัดไว้ก่อน
          [{ type: "flex", altText: card.alt.slice(0, 380), contents: bubbleOf(card) }];

    last = await sendOne(a, messages);
    if (last.ok) {
      // กลับมาส่งได้แล้ว = ล้างธงโควตาหมด (เช่น ขึ้นเดือนใหม่/อัปเกรดแพ็กเกจ)
      if (a.via === "alert" && doc.outAt) await saveLineAlert({ outAt: undefined });
      return { ...last, fallback: a.via === "shop" && plan.length > 1 };
    }
    if (a.via === "alert" && last.status === 429) {
      quotaCache = null;
      await saveLineAlert({ outAt: new Date().toISOString() });
    }
  }

  await noteMiss(title, last.reason ?? "ส่งไม่สำเร็จ");
  return last;
}
