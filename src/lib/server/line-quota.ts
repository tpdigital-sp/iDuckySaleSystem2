import "server-only";

/**
 * 📊 โควตาข้อความรายเดือนของบัญชี LINE OA (อ่านอย่างเดียว ไม่เปลืองโควตา)
 *
 * ที่มา 28 ก.ย. 69: ปุ่ม 🔔 ทดสอบส่ง / การ์ดยืนยันเงินเข้า ขึ้น "โควตาข้อความของ LINE OA หมดแล้ว" ทั้งวัน
 * ตรวจแล้วบัญชีร้าน iDuckyshop ใช้ครบ 15,000/15,000 — ทั้งที่ระบบนี้ push ไปทั้งเดือนแค่ ~2,400 ข้อความ
 * (อีก ~12,600 ถูกใช้ระหว่างคืน 27 → เช้า 28 ก.ย. โดยทางอื่นที่ใช้ OA เดียวกัน: บรอดแคสต์จาก OA Manager / บอท n8n)
 * เดิมข้อความบอกแค่ "หมดแล้ว" ไม่มีตัวเลข ไม่มีวันรีเซ็ต แอดมินเลยไล่หาสาเหตุไม่ถูก → ตัวนี้ให้ตัวเลขไปด้วย
 *
 * ⚠️ endpoint คือ /v2/bot/message/quota (ไม่ใช่ /v2/bot/quota — อันนั้นตอบ "Not found" ทำให้เข้าใจผิดว่าถามไม่ได้)
 */
export interface LineQuota {
  /** เพดานทั้งเดือน (null = ไม่จำกัด/ถามไม่ได้) */
  limit: number | null;
  used: number;
  /** เหลืออีกกี่ข้อความ (null = ไม่จำกัด) */
  left: number | null;
}

const cache = new Map<string, { at: number; q: LineQuota | null }>();
const TTL = 5 * 60_000;

async function ask<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** โควตาของ token นี้ — แคช 5 นาที (ตัวเลขไม่ต้องสดวินาทีต่อวินาที) · `fresh` = ข้ามแคช */
export async function lineQuota(token: string, opts?: { fresh?: boolean }): Promise<LineQuota | null> {
  const hit = cache.get(token);
  if (!opts?.fresh && hit && Date.now() - hit.at < TTL) return hit.q;
  const [quota, used] = await Promise.all([
    ask<{ type?: string; value?: number }>("https://api.line.me/v2/bot/message/quota", token),
    ask<{ totalUsage?: number }>("https://api.line.me/v2/bot/message/quota/consumption", token),
  ]);
  let q: LineQuota | null = null;
  if (quota || used) {
    const limit = quota?.type === "limited" && typeof quota.value === "number" ? quota.value : null;
    const totalUsage = used?.totalUsage ?? 0;
    q = { limit, used: totalUsage, left: limit === null ? null : Math.max(0, limit - totalUsage) };
  }
  cache.set(token, { at: Date.now(), q });
  return q;
}

/** โควตาของ "บัญชีร้าน" (LINE_MESSAGING_ACCESS_TOKEN) ที่ใช้คุยกับลูกค้าทุกใบ */
export async function shopQuota(opts?: { fresh?: boolean }): Promise<LineQuota | null> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  return token ? lineQuota(token, opts) : null;
}

/** เพิ่งเห็นว่า "หมด" → ลืมแคช จะได้ไม่ค้างตัวเลขเก่า */
export function forgetLineQuota(token?: string): void {
  if (token) cache.delete(token);
  else cache.clear();
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** โควตา LINE รีเซ็ตวันที่ 1 ของเดือนถัดไป (เวลาญี่ปุ่น) — คืน "1 ต.ค." */
export function quotaResetText(now: Date = new Date()): string {
  // เดือนตามเวลาไทย (UTC+7) — ใกล้เคียง JST พอสำหรับบอกวัน
  const th = new Date(now.getTime() + 7 * 3_600_000);
  return `1 ${TH_MONTHS[(th.getUTCMonth() + 1) % 12]}`;
}

/** "ใช้ไป 15,000/15,000 ข้อความเดือนนี้" */
export function quotaText(q: LineQuota | null): string {
  if (!q) return "";
  const n = (v: number) => v.toLocaleString("th-TH");
  return q.limit === null ? `ใช้ไป ${n(q.used)} ข้อความเดือนนี้` : `ใช้ไป ${n(q.used)}/${n(q.limit)} ข้อความเดือนนี้`;
}
