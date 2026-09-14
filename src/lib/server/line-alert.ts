import "server-only";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * 📣 บัญชี LINE ที่ใช้ "แจ้งเตือนร้าน" — แยกจากบัญชีที่คุยกับลูกค้า
 *
 * เจ้าของร้านสั่ง 14 ก.ย. 69: อยากให้ข้อความเข้ากลุ่มพนักงานมาจากบัญชีหลังบ้าน (iducky-admin)
 * ไม่ใช่บัญชีร้านที่ลูกค้าทักอยู่ (iDuckyshop) — ข้อความในกลุ่มจะได้ไม่ปนกับงานลูกค้า
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

export interface AlertResult {
  ok: boolean;
  /** ส่งจากบัญชีไหน — บัญชีแจ้งเตือนที่ตั้งไว้ หรือบัญชีร้านตามเดิม */
  via: "alert" | "shop" | "none";
  reason?: string;
}

/**
 * 📤 ส่งข้อความแจ้งร้าน 1 ข้อความ
 *
 * เลือกชุดที่ใช้แบบ "ทั้งคู่ต้องมาจากที่เดียวกัน":
 *   1. ตั้งบัญชีแจ้งเตือนไว้ครบ (token + ปลายทาง) → ใช้ชุดนั้น
 *   2. ไม่ครบ → ถอยไปใช้บัญชีร้าน + env เหมือนเดิมทุกประการ
 * money = เรื่องเงิน (เคลม · ยอดค้างงวด 2) ซึ่งเดิมมี LINE_ADMIN_ALERT_TO แยกอยู่แล้ว
 */
export async function pushShopAlert(text: string, opts?: { money?: boolean }): Promise<AlertResult> {
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

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
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
