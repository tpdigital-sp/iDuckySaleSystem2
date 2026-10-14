import "server-only";
import { shopQuota, quotaResetText, type LineQuota } from "@/lib/server/line-quota";
import { pushShopAlert, type AlertCard } from "@/lib/server/line-alert";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { SITE_URL } from "@/lib/shop-info";

/**
 * 📣 เตือนโควตาข้อความ LINE ของ "บัญชีร้าน" ใกล้หมด → การ์ดเข้ากลุ่มแอดมิน (เจ้าของร้านสั่ง 14 ต.ค. 69)
 *
 * เดิมเห็นได้แค่ป้ายโควตาในหน้า /admin/chatbot/chats (คนต้องเปิดหน้านั้นอยู่) · 28 ก.ย. 69 หมดกลางคืนไม่มีใครรู้
 * จนการ์ดยืนยันเงินเข้าลูกค้าหายเงียบทั้งเช้า → ตอนนี้ cron ทุก 5 นาที (/api/cron/balance-notify) เรียก checkShopQuotaAlert
 *
 * - ระดับ 80 / 90 / 95 / 100% · ระดับละ 1 ใบต่อเดือน (ข้ามหลายระดับในรอบเดียว = ส่งใบเดียวของระดับสูงสุด)
 * - ส่งผ่าน pushShopAlert = บัญชีแจ้งเตือนของกลุ่มแอดมิน (คนละโควตากับบัญชีร้าน) · ถอยไปบัญชีร้านเฉพาะเมื่อบัญชีแจ้งเตือนส่งไม่ออก
 * - สถานะ: Firestore (ordersure) settings/line-quota-alert { month, sent[] } — ขึ้นเดือนใหม่ = เริ่มนับใหม่
 * - คาดการณ์: ใช้เฉลี่ยต่อวันของเดือนนี้ → วันที่คาดว่าหมด (ถ้าก่อนรีเซ็ต)
 */
export const QUOTA_LEVELS = [80, 90, 95, 100] as const;
const DOC = { col: "settings", id: "line-quota-alert" };
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** เวลาไทย (โควตา LINE รีเซ็ตต้นเดือนตามเวลาญี่ปุ่น ห่างไทย 2 ชม. — พอสำหรับคาดการณ์) */
const thNow = (now: Date) => new Date(now.getTime() + 7 * 3_600_000);

export interface QuotaForecast {
  pct: number;
  /** เฉลี่ยต่อวันของเดือนนี้ */
  perDay: number;
  /** คาดว่าใช้ทั้งเดือน */
  monthTotal: number;
  /** วันที่คาดว่าหมด "27 ต.ค." · null = พอถึงสิ้นเดือน */
  outOn: string | null;
}

/** คาดการณ์จากความเร็วที่ใช้จริงเดือนนี้ — ใช้ทั้งการ์ดเตือนและป้ายโควตาในหน้าแชท */
export function forecastQuota(q: LineQuota, now: Date = new Date()): QuotaForecast | null {
  if (q.limit === null || q.limit <= 0) return null;
  const t = thNow(now);
  const daysIn = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = t.getUTCDate() - 1 + (t.getUTCHours() * 60 + t.getUTCMinutes()) / 1440; // วันที่ผ่านไปแล้ว (มีเศษ)
  const perDay = q.used / Math.max(0.5, elapsed);
  const monthTotal = Math.round(perDay * daysIn);
  let outOn: string | null = null;
  if (q.left !== null && perDay > 0) {
    const dayOut = elapsed + q.left / perDay; // นับจากต้นเดือน
    if (dayOut < daysIn) outOn = `${Math.floor(dayOut) + 1} ${TH_MONTHS[t.getUTCMonth()]}`;
  }
  if (q.left === 0) outOn = "หมดแล้ว";
  return { pct: Math.round((q.used / q.limit) * 1000) / 10, perDay: Math.round(perDay), monthTotal, outOn };
}

/** การ์ดเตือนโควตา (แยกออกมาให้ทดสอบรูปการ์ดได้โดยไม่ต้องส่งจริง) */
export function quotaAlertCard(q: LineQuota, f: QuotaForecast, level: number, now: Date = new Date()): AlertCard {
  const n = (v: number) => v.toLocaleString("th-TH");
  const out = level >= 100;
  const limit = q.limit ?? 0;
  return {
    tone: out ? "#B91C1C" : level >= 95 ? "#C2410C" : level >= 90 ? "#D97706" : "#A16207",
    title: out ? "🚫 โควตา LINE ร้านหมดแล้ว" : `⚠️ โควตา LINE ร้านใช้ไป ${level}%`,
    headline: out
      ? "การ์ดแจ้งสถานะ/ยืนยันเงินเข้าส่งถึงลูกค้าไม่ได้จนกว่าจะรีเซ็ตหรือซื้อเพิ่ม (ระบบจดไว้และส่งย้อนหลังให้เอง)"
      : f.outOn
        ? `ถ้าใช้เท่านี้ต่อ คาดว่าหมดราว ${f.outOn} — ก่อนรีเซ็ต ${quotaResetText(now)}`
        : `ถ้าใช้เท่านี้ต่อ พอถึงรีเซ็ต ${quotaResetText(now)}`,
    heroLabel: "เหลือส่งได้อีก",
    hero: `${n(q.left ?? 0)} ข้อความ`,
    rows: [
      { label: "ใช้ไปแล้ว", value: `${n(q.used)} / ${n(limit)} (${f.pct}%)`, bold: true },
      { label: "เฉลี่ยต่อวัน", value: `${n(f.perDay)} ข้อความ` },
      { label: "คาดทั้งเดือน", value: `${n(f.monthTotal)} ข้อความ`, color: f.monthTotal > limit ? "#B91C1C" : undefined },
      { label: "รีเซ็ต", value: quotaResetText(now) },
    ],
    bullets: [
      "ตอบลูกค้าใน LINE OA Manager ไม่นับโควตา (ตอบจากหน้าแชทในระบบ/กดส่งร่างบอท = นับ)",
      "งดบรอดแคสต์จาก OA Manager จนกว่าจะรีเซ็ต",
      "ซื้อข้อความเพิ่มได้ใน LINE OA Manager › ตั้งค่า › การชำระเงิน",
    ],
    button: { label: "เปิดหน้าแชท", uri: `${SITE_URL}/admin/chatbot/chats` },
    alt: out
      ? `🚫 โควตา LINE ร้านหมดแล้ว (${n(q.used)}/${n(limit)}) · รีเซ็ต ${quotaResetText(now)}`
      : `⚠️ โควตา LINE ร้านใช้ไป ${level}% (${n(q.used)}/${n(limit)}) · เหลือ ${n(q.left ?? 0)}${f.outOn ? ` · คาดหมด ${f.outOn}` : ""}`,
  };
}

export interface QuotaAlertResult {
  pct?: number;
  level?: number;
  sent?: boolean;
  skipped?: string;
  reason?: string;
}

/** เรียกจาก cron ทุก 5 นาที · dry = ไม่ส่ง ไม่จด */
export async function checkShopQuotaAlert(opts: { dry?: boolean; now?: Date } = {}): Promise<QuotaAlertResult> {
  const now = opts.now ?? new Date();
  const q = await shopQuota({ fresh: true });
  if (!q) return { skipped: "ถามโควตาไม่ได้" };
  if (q.limit === null) return { skipped: "บัญชีไม่จำกัดโควตา" };
  const f = forecastQuota(q, now)!;
  const level = [...QUOTA_LEVELS].reverse().find((l) => f.pct >= l);
  if (!level) return { pct: f.pct, skipped: "ยังไม่ถึง 80%" };

  const db = getChatFirestore();
  if (!db) return { pct: f.pct, level, skipped: "ไม่มี Firestore" };
  const t = thNow(now);
  const month = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  const ref = db.collection(DOC.col).doc(DOC.id);
  const st = (await ref.get()).data() as { month?: string; sent?: number[] } | undefined;
  const sent = st?.month === month ? (st.sent ?? []) : [];
  if (sent.includes(level)) return { pct: f.pct, level, skipped: "เตือนระดับนี้ไปแล้วเดือนนี้" };
  if (opts.dry) return { pct: f.pct, level, skipped: "dry" };

  const r = await pushShopAlert(quotaAlertCard(q, f, level, now));
  if (r.ok) {
    // ข้ามหลายระดับพร้อมกัน = นับว่าเตือนระดับที่ต่ำกว่าแล้วด้วย (ไม่ส่ง 80 ตามหลัง 95)
    const done = [...new Set([...sent, ...QUOTA_LEVELS.filter((l) => l <= level)])];
    await ref.set({ month, sent: done, lastAt: now.toISOString(), lastPct: f.pct }, { merge: true });
  }
  return { pct: f.pct, level, sent: r.ok, reason: r.ok ? undefined : r.reason };
}
