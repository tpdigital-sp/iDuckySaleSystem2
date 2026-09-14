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
  savedAt?: string;
  savedBy?: string;
}

/** สภาพการตั้งค่าที่ปลอดภัยพอจะส่งให้หน้าจอแอดมิน (ไม่มี token ตัวจริง) */
export interface LineAlertStatus {
  hasToken: boolean;
  to: string;
  adminTo: string;
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
  if (c.hero) body.push({ type: "text", text: c.hero, size: "lg", weight: "bold", color: "#0F172A", wrap: true });
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
 * 📤 ส่งข้อความแจ้งร้าน — รับได้ทั้งการ์ด Flex และข้อความล้วน
 *
 * เลือกชุดที่ใช้แบบ "ทั้งคู่ต้องมาจากที่เดียวกัน":
 *   1. ตั้งบัญชีแจ้งเตือนไว้ครบ (token + ปลายทาง) → ใช้ชุดนั้น
 *   2. ไม่ครบ → ถอยไปใช้บัญชีร้าน + env เหมือนเดิมทุกประการ
 * money = เรื่องเงิน (เคลม · ยอดค้างงวด 2) ซึ่งเดิมมี LINE_ADMIN_ALERT_TO แยกอยู่แล้ว
 */
export async function pushShopAlert(
  msg: string | AlertCard,
  opts?: { money?: boolean },
): Promise<AlertResult> {
  const doc = await loadLineAlert();
  const tok = openToken(doc.enc);
  const mine = opts?.money ? doc.adminTo || doc.to : doc.to;

  let token: string | undefined;
  let to: string | undefined;
  let via: AlertResult["via"] = "none";
  if (tok && mine) {
    token = tok;
    to = mine;
    via = "alert";
  } else {
    token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
    to = opts?.money
      ? process.env.LINE_ADMIN_ALERT_TO || process.env.LINE_STOCK_ALERT_TO
      : process.env.LINE_STOCK_ALERT_TO;
    via = "shop";
  }
  if (!token || !to) return { ok: false, via: "none", reason: "ยังไม่ได้ตั้งบัญชีหรือปลายทางสำหรับแจ้งเตือน" };

  const messages =
    typeof msg === "string"
      ? [{ type: "text", text: msg }]
      : // altText ยาวเกิน 400 ตัวอักษร LINE ปฏิเสธทั้งข้อความ — ตัดไว้ก่อน
        [{ type: "flex", altText: msg.alt.slice(0, 380), contents: bubbleOf(msg) }];

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, via };
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
    return { ok: false, via, reason: hint };
  } catch (e) {
    return { ok: false, via, reason: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" };
  }
}
