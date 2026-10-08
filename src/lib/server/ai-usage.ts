import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { inBackground } from "@/lib/server/background";
import { BKK_TZ } from "@/lib/bangkok-time";
import {
  costUsd,
  tokensOf,
  DEFAULT_THB_PER_USD,
  type AiFeature,
  type GeminiUsage,
  type Bucket,
  type DayAgg,
  type AiEvent,
  type AiCostSettings,
  type AiDashboard,
} from "@/lib/ai-cost";

export type { Bucket, DayAgg, AiEvent, AiCostSettings, AiDashboard };

/**
 * 💸 บัญชีการใช้ AI ของร้าน — ทุกคำขอ Gemini/n8n ผ่านที่นี่แล้วลงบัญชีเอง (8 ต.ค. 69)
 *
 * ทำไมต้องมี: เดิม 10 จุดในโค้ดเรียก Gemini ด้วย fetch ตรง แล้วทิ้ง usageMetadata ทั้งหมด
 * เจ้าของร้านไม่รู้เลยว่าแชทบอทกินเงินวันละเท่าไหร่ จนบิล Google มาปลายเดือน → หน้า /admin/chatbot/costs
 *
 * เก็บ 2 ชั้นใน Firestore ฐาน "ordersure" (ฐานเดียวกับคลังความรู้/ประวัติแชทของบอท):
 *   · ai-usage/{auto}         1 เรคอร์ดต่อ 1 คำขอ — ไว้โชว์ "คำขอล่าสุด" สด ๆ บนแดชบอร์ด · มี expireAt ไว้ตั้ง TTL ในคอนโซล (14 วัน)
 *   · ai-usage-daily/{YYYY-MM-DD}  ยอดรวมต่อวัน (ตามเวลาไทย) แยกตามงาน/โมเดล/ชั่วโมง ด้วย FieldValue.increment
 *     → แดชบอร์ดอ่าน 31 เอกสารก็ได้ทั้งเดือน ไม่ต้องกวาดเรคอร์ดดิบเป็นพัน ๆ ทุก 10 วิ
 *
 * ⚠️ ค่าใช้จ่าย (USD) คิดตอนบันทึกจากตาราง lib/ai-cost.ts แล้วแช่ลงเรคอร์ด — เปลี่ยนราคาทีหลังไม่ย้อนแก้ยอดเก่า
 * ⚠️ เขียนแบบ inBackground (after()) — ห้ามให้การลงบัญชีทำให้แชทลูกค้าช้าหรือพัง: บันทึกไม่ได้ = log อย่างเดียว
 * ⚠️ ชื่อฟิลด์ซ้อนห้ามมีจุด: ชื่อโมเดล "gemini-2.5-flash" → คีย์ "gemini-2_5-flash" + เก็บชื่อจริงในฟิลด์ name
 */

export const AI_USAGE_COL = "ai-usage";
export const AI_DAILY_COL = "ai-usage-daily";
export const AI_SETTINGS_DOC = { col: "settings", id: "ai-cost" };
const RAW_TTL_DAYS = 14;

export type GeminiJson = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: GeminiUsage;
  error?: { message?: string; status?: string };
};

export type GeminiCall = {
  ok: boolean;
  status: number;
  /** JSON ที่ Gemini ตอบ (พยายาม parse แม้ตอน error เพื่อให้อ่าน error.message ได้) */
  json: GeminiJson | null;
  /** ตัวอักษรดิบ 300 ตัวแรกเมื่อ !ok — ไว้ log */
  errorText: string;
  ms: number;
};

/**
 * เรียก Gemini generateContent แล้วลงบัญชีให้เอง — ใช้แทน fetch ตรงทุกจุด
 * โยน error เฉพาะกรณีต่อไม่ได้/หมดเวลา (เหมือน fetch เดิม · ผู้เรียกมี try/catch อยู่แล้ว) — ก่อนโยนก็ลงบัญชีว่าล้ม
 * ไม่มีคีย์ = โยน Error ข้อความไทย (bot-kb เดิมทำแบบนี้ · จุดอื่นเช็คคีย์ก่อนเรียกอยู่แล้ว)
 */
export async function callGemini(o: { feature: AiFeature; model: string; body: Record<string, unknown>; timeoutMs: number; apiKey?: string }): Promise<GeminiCall> {
  const key = o.apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์");
  const model = o.model.replace(/^models\//, "");
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(o.body),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
  } catch (e) {
    recordAiCall({ feature: o.feature, model, ok: false, status: 0, ms: Date.now() - t0, error: e instanceof Error ? e.name : "fetch" });
    throw e;
  }
  const ms = Date.now() - t0;
  const text = await res.text().catch(() => "");
  let json: GeminiJson | null = null;
  try {
    json = text ? (JSON.parse(text) as GeminiJson) : null;
  } catch {
    json = null;
  }
  recordAiCall({
    feature: o.feature,
    model,
    ok: res.ok,
    status: res.status,
    ms,
    usage: json?.usageMetadata,
    error: res.ok ? undefined : (json?.error?.message || text).slice(0, 160),
  });
  return { ok: res.ok, status: res.status, json, errorText: res.ok ? "" : text.slice(0, 300), ms };
}

/** ข้อความรวมทุก part ของคำตอบแรก */
export function geminiText(j: GeminiJson | null | undefined): string {
  return (j?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

/** การส่งต่อให้ n8n (ไม่มีโทเคน · ค่าใช้จ่าย 0 ในบัญชีนี้ — เครื่อง n8n/โมเดลข้างในจ่ายแยกต่างหาก) นับครั้ง+เวลา ไว้ดูว่าคำถามหลุดไปข้างนอกเท่าไหร่ */
export function recordN8nCall(feature: "n8n_chat" | "n8n_pricing", ok: boolean, ms: number, error?: string): void {
  recordAiCall({ feature, model: "n8n", ok, status: ok ? 200 : 0, ms, error });
}

/* ── บันทึก ─────────────────────────────────────────────── */

type CallEvent = { feature: AiFeature; model: string; ok: boolean; status: number; ms: number; usage?: GeminiUsage; error?: string };

function bkkDayHour(d: Date): { day: string; hour: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: BKK_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  // hour12:false บางรันไทม์คืน "24" ตอนเที่ยงคืน
  const hour = p.hour === "24" ? "00" : p.hour;
  return { day: `${p.year}-${p.month}-${p.day}`, hour };
}

/** คีย์วันตามเวลาไทย (YYYY-MM-DD) */
export function aiDayKey(d: Date = new Date()): string {
  return bkkDayHour(d).day;
}

const modelKey = (m: string) => m.replace(/[.~/[\]*]/g, "_");

function recordAiCall(ev: CallEvent): void {
  const db = getChatFirestore();
  if (!db) return;
  const at = new Date();
  const { day, hour } = bkkDayHour(at);
  const t = tokensOf(ev.usage);
  const usd = ev.model === "n8n" ? 0 : costUsd(ev.model, t);
  const inc = FieldValue.increment;
  const fail = ev.ok ? 0 : 1;

  const raw = {
    at: at.toISOString(),
    dayKey: day,
    feature: ev.feature,
    model: ev.model,
    ok: ev.ok,
    status: ev.status,
    ms: ev.ms,
    ...t,
    costUsd: usd,
    ...(ev.error ? { error: ev.error } : {}),
    // ไว้ตั้งนโยบาย TTL ที่คอนโซล Firestore (ฟิลด์ expireAt) — ไม่ตั้งก็แค่กองไว้ ไม่กระทบแดชบอร์ด
    expireAt: new Date(at.getTime() + RAW_TTL_DAYS * 86_400_000),
  };

  const bucket = { calls: inc(1), fail: inc(fail), costUsd: inc(usd), inTok: inc(t.inTok), outTok: inc(t.outTok), thinkTok: inc(t.thinkTok), ms: inc(ev.ms) };
  const daily = {
    dayKey: day,
    updatedAt: raw.at,
    ...bucket,
    cachedTok: inc(t.cachedTok),
    byFeature: { [ev.feature]: bucket },
    byModel: { [modelKey(ev.model)]: { name: ev.model, ...bucket } },
    hours: { [hour]: { calls: inc(1), fail: inc(fail), costUsd: inc(usd) } },
  };

  inBackground(
    `ai-usage ${ev.feature}`,
    Promise.all([db.collection(AI_USAGE_COL).add(raw), db.collection(AI_DAILY_COL).doc(day).set(daily, { merge: true })]),
  );
}

/* ── อ่านให้แดชบอร์ด ─────────────────────────────────────── */

export const DEFAULT_AI_SETTINGS: AiCostSettings = { thbPerUsd: DEFAULT_THB_PER_USD, monthlyBudgetThb: 0, fixedCosts: [] };

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
function bucketOf(x: Record<string, unknown> | undefined): Bucket {
  return { calls: num(x?.calls), fail: num(x?.fail), costUsd: num(x?.costUsd), inTok: num(x?.inTok), outTok: num(x?.outTok), thinkTok: num(x?.thinkTok), ms: num(x?.ms) };
}

export function emptyDay(dayKey: string): DayAgg {
  return { dayKey, ...bucketOf(undefined), cachedTok: 0, byFeature: {}, byModel: {}, hours: {} };
}

function dayOf(id: string, x: Record<string, unknown>): DayAgg {
  const byFeature: DayAgg["byFeature"] = {};
  for (const [k, v] of Object.entries((x.byFeature ?? {}) as Record<string, Record<string, unknown>>)) byFeature[k] = bucketOf(v);
  const byModel: DayAgg["byModel"] = {};
  for (const [k, v] of Object.entries((x.byModel ?? {}) as Record<string, Record<string, unknown>>)) byModel[k] = { name: String(v?.name ?? k), ...bucketOf(v) };
  const hours: DayAgg["hours"] = {};
  for (const [k, v] of Object.entries((x.hours ?? {}) as Record<string, Record<string, unknown>>))
    hours[k] = { calls: num(v?.calls), fail: num(v?.fail), costUsd: num(v?.costUsd) };
  return { dayKey: String(x.dayKey ?? id), ...bucketOf(x), cachedTok: num(x.cachedTok), byFeature, byModel, hours };
}

/** วันที่ (YYYY-MM-DD) ถอยหลัง n วันจากวันไทยปัจจุบัน */
export function shiftDay(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export async function readAiSettings(db: Firestore): Promise<AiCostSettings> {
  try {
    const snap = await db.collection(AI_SETTINGS_DOC.col).doc(AI_SETTINGS_DOC.id).get();
    const x = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
    const fixed = Array.isArray(x.fixedCosts)
      ? (x.fixedCosts as Record<string, unknown>[])
          .map((f) => ({ name: String(f?.name ?? "").trim(), thb: num(f?.thb) }))
          .filter((f) => f.name)
      : [];
    return { thbPerUsd: num(x.thbPerUsd, DEFAULT_THB_PER_USD) || DEFAULT_THB_PER_USD, monthlyBudgetThb: Math.max(0, num(x.monthlyBudgetThb)), fixedCosts: fixed };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export async function writeAiSettings(db: Firestore, s: AiCostSettings): Promise<void> {
  await db.collection(AI_SETTINGS_DOC.col).doc(AI_SETTINGS_DOC.id).set(
    { thbPerUsd: s.thbPerUsd, monthlyBudgetThb: s.monthlyBudgetThb, fixedCosts: s.fixedCosts, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

export async function readAiDashboard(opts?: { days?: number; feed?: number }): Promise<AiDashboard> {
  const days = Math.min(92, Math.max(7, opts?.days ?? 31));
  const feedN = Math.min(100, Math.max(0, opts?.feed ?? 40));
  const db = getChatFirestore();
  const today = aiDayKey();
  const start = shiftDay(today, -(days - 1));
  const base: AiDashboard = {
    at: new Date().toISOString(),
    today,
    days: Array.from({ length: days }, (_, i) => emptyDay(shiftDay(start, i))),
    feed: [],
    settings: DEFAULT_AI_SETTINGS,
    tracking: { gemini: !!process.env.GEMINI_API_KEY, db: !!db },
  };
  if (!db) return base;

  const [dailySnap, feedSnap, settings] = await Promise.all([
    db.collection(AI_DAILY_COL).where("dayKey", ">=", start).get(),
    feedN ? db.collection(AI_USAGE_COL).orderBy("at", "desc").limit(feedN).get() : null,
    readAiSettings(db),
  ]);
  const byKey = new Map(dailySnap.docs.map((d) => [d.id, dayOf(d.id, d.data())]));
  base.days = base.days.map((d) => byKey.get(d.dayKey) ?? d);
  base.feed =
    feedSnap?.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        at: String(x.at ?? ""),
        feature: String(x.feature ?? ""),
        model: String(x.model ?? ""),
        ok: x.ok !== false,
        status: num(x.status),
        ms: num(x.ms),
        costUsd: num(x.costUsd),
        inTok: num(x.inTok),
        outTok: num(x.outTok),
        thinkTok: num(x.thinkTok),
        cachedTok: num(x.cachedTok),
        totalTok: num(x.totalTok),
        ...(x.error ? { error: String(x.error) } : {}),
      };
    }) ?? [];
  base.settings = settings;
  return base;
}
