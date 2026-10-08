/**
 * 💸 ตารางราคา + ชื่องานของ AI ที่ร้านจ่าย — ฟังก์ชันล้วน ใช้ได้ทั้งเซิร์ฟเวอร์/หน้าจอ/สคริปต์ทดสอบ
 *
 * ที่มา (8 ต.ค. 69): เจ้าของร้านขอ "แดชบอร์ดดูค่าใช้จ่ายแบบ realtime" ในหมวด Chatbot
 * เดิมทุกจุดเรียก Gemini ทิ้ง usageMetadata ไปเลย ไม่มีใครรู้ว่าบอทกินเงินวันละเท่าไหร่ จนบิล Google มา
 *
 * ราคา = USD ต่อ 1 ล้านโทเคน ตามหน้า ai.google.dev/pricing (ชั้นจ่ายเงิน · ตรวจล่าสุด 8 ต.ค. 69)
 * ⚠️ ค่าใช้จ่ายคิด "ตอนบันทึก" แล้วเก็บลงเรคอร์ดเลย — เปลี่ยนตารางนี้ทีหลังไม่ย้อนแก้ยอดเก่า (เหมือนต้นทุนสต๊อกที่แช่ ณ วันขาย)
 * โทเคน "คิด" (thoughtsTokenCount) ของ 2.5 Flash/Pro คิดราคาเท่า output · โทเคนที่โดนแคชคิด 25% ของ input
 */

export type ModelPrice = {
  in: number;
  out: number;
  cached: number;
  /** ราคาโปรโมชันหมดอายุ → ตั้งแต่วันนี้ (YYYY-MM-DD) ใช้ราคาชุดใหม่ (3.x Flash ขึ้นราคา 1 ม.ค. 2027) */
  after?: { date: string; in: number; out: number; cached: number };
  /** รุ่นเก่าที่ Google ขึ้นป้าย legacy แล้ว — หน้าแดชบอร์ดติดป้ายเตือน */
  legacy?: boolean;
};

/**
 * ราคาตามหน้า ai.google.dev/gemini-api/docs/pricing "Last updated 2026-10-07" (ตรวจ 8 ต.ค. 69)
 * ชั้นจ่ายเงิน · ข้อความ/รูป (เสียงแพงกว่า ไม่ได้ใช้) · ≤200k โทเคนสำหรับ Pro (ร้านไม่เคยส่งเกิน)
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // ── รุ่นปัจจุบัน (3.x) ──
  "gemini-3.8-flash": { in: 0.75, out: 3.75, cached: 0.075, after: { date: "2027-01-01", in: 1.5, out: 7.5, cached: 0.15 } },
  "gemini-3.7-flash": { in: 0.75, out: 3.75, cached: 0.075, after: { date: "2027-01-01", in: 1.5, out: 7.5, cached: 0.15 } },
  "gemini-3.6-flash": { in: 0.75, out: 3.75, cached: 0.075, after: { date: "2027-01-01", in: 1.5, out: 7.5, cached: 0.15 } },
  "gemini-3.5-flash": { in: 1.5, out: 9, cached: 0.15 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5, cached: 0.03 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5, cached: 0.025 },
  "gemini-3.1-pro": { in: 2, out: 12, cached: 0.2 },
  "gemini-3-flash": { in: 0.5, out: 3, cached: 0.05 },
  // ── Claude (Anthropic) — n8n ChatBot ใช้ Sonnet 5.5 ตั้งแต่ 8 ต.ค. 69 (ราคา platform.claude.com) ──
  "claude-sonnet-5-5": { in: 2, out: 10, cached: 0.2 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cached: 0.01 },
  "claude-opus-5-5": { in: 4, out: 20, cached: 0.2 },
  // ── รุ่นเก่า (legacy) — เว็บย้ายออกหมดแล้ว 8 ต.ค. 69 (เก็บไว้คิดค่าใช้จ่ายย้อนหลัง) ──
  "gemini-2.5-pro": { in: 1.25, out: 10, cached: 0.125, legacy: true },
  "gemini-2.5-flash": { in: 0.3, out: 2.5, cached: 0.03, legacy: true },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4, cached: 0.01, legacy: true },
  "gemini-2.0-flash": { in: 0.1, out: 0.4, cached: 0.025, legacy: true },
  "gemini-2.0-flash-lite": { in: 0.075, out: 0.3, cached: 0.01875, legacy: true },
};

/** โมเดลที่ไม่รู้จัก (รุ่นใหม่กว่าตาราง) → คิดเท่า 3.5 Flash จะได้ไม่ประเมินต่ำไป */
const FALLBACK_PRICE: ModelPrice = MODEL_PRICES["gemini-3.5-flash"];

export function priceOf(model: string, at: Date = new Date()): ModelPrice {
  const m = model.toLowerCase().replace(/^models\//, "");
  // "gemini-3.1-pro-preview" / "gemini-2.5-flash-preview-09-2025" → หยิบตัวที่เป็นคำนำหน้ายาวสุด
  const key = MODEL_PRICES[m]
    ? m
    : Object.keys(MODEL_PRICES)
        .filter((k) => m.startsWith(k))
        .sort((a, b) => b.length - a.length)[0];
  const p = key ? MODEL_PRICES[key] : FALLBACK_PRICE;
  if (p.after && at.toISOString().slice(0, 10) >= p.after.date) return { ...p, in: p.after.in, out: p.after.out, cached: p.after.cached, after: undefined };
  return p;
}

export function isLegacyModel(model: string): boolean {
  return !!priceOf(model).legacy;
}

/** usageMetadata ที่ Gemini ส่งกลับมาท้ายทุกคำตอบ */
export type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
};

export type TokenCount = { inTok: number; outTok: number; thinkTok: number; cachedTok: number; totalTok: number };

export function tokensOf(u: GeminiUsage | undefined | null): TokenCount {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const inTok = n(u?.promptTokenCount);
  const outTok = n(u?.candidatesTokenCount);
  const thinkTok = n(u?.thoughtsTokenCount);
  const cachedTok = Math.min(inTok, n(u?.cachedContentTokenCount));
  const totalTok = n(u?.totalTokenCount) || inTok + outTok + thinkTok;
  return { inTok, outTok, thinkTok, cachedTok, totalTok };
}

/** ค่าใช้จ่ายของ 1 คำขอ (USD) — ปัดที่ 1e-8 พอ ไม่ให้ทศนิยมยาวไร้ความหมายใน Firestore */
export function costUsd(model: string, t: TokenCount, at: Date = new Date()): number {
  const p = priceOf(model, at);
  const billedIn = t.inTok - t.cachedTok;
  const usd = (billedIn * p.in + t.cachedTok * p.cached + (t.outTok + t.thinkTok) * p.out) / 1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}

/**
 * ชื่องานที่เรียก AI — คีย์ใช้ "_" เท่านั้น (เป็นชื่อฟิลด์ซ้อนใน Firestore ห้ามมีจุด)
 * ป้ายเป็นคำที่แอดมินพูดกัน ไม่ใช่ชื่อฟังก์ชัน
 */
export const AI_FEATURES = {
  chat_parse: { label: "วิเคราะห์คำถามลูกค้า", group: "แชทลูกค้า" },
  chat_answer: { label: "ตอบเองจากข้อมูลร้าน", group: "แชทลูกค้า" },
  chat_price_reply: { label: "เรียบเรียงคำตอบราคา", group: "แชทลูกค้า" },
  price_understand: { label: "เข้าใจคำถามราคา", group: "เครื่องคิดราคา" },
  price_pick: { label: "เลือกสินค้าที่ลูกค้าหมายถึง", group: "เครื่องคิดราคา" },
  price_info: { label: "อ่านหน้าสินค้าตอบความรู้", group: "เครื่องคิดราคา" },
  kb_ai: { label: "งาน AI คลังความรู้/ตารางราคา", group: "หลังบ้าน" },
  slip_ocr: { label: "อ่านสลิปไม่มี QR", group: "หลังบ้าน" },
  customer_profile: { label: "สรุปโปรไฟล์ลูกค้า LINE", group: "หลังบ้าน" },
  n8n_chat: { label: "ส่งต่อให้ n8n ตอบ (knowledge-chat)", group: "n8n" },
  n8n_pricing: { label: "ส่งต่อให้ n8n ค้นราคา", group: "n8n" },
} as const;

export type AiFeature = keyof typeof AI_FEATURES;

export function featureLabel(f: string): string {
  return (AI_FEATURES as Record<string, { label: string }>)[f]?.label ?? f;
}

/** ชื่อโมเดลสั้น ๆ ไว้โชว์: gemini-3.5-flash-lite → 3.5 Flash-Lite · claude-sonnet-5-5 → Claude Sonnet 5.5 */
export function modelLabel(m: string): string {
  if (m === "n8n") return "n8n";
  // claude-sonnet-5-5 → Claude Sonnet 5.5
  const c = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(m);
  if (c) return `Claude ${c[1][0].toUpperCase()}${c[1].slice(1)} ${c[2]}${c[3] ? `.${c[3]}` : ""}`;
  return m
    .replace(/^models\//, "")
    .replace(/^gemini-/, "")
    .replace(/-flash-lite/, " Flash-Lite")
    .replace(/-flash/, " Flash")
    .replace(/-pro/, " Pro")
    .replace(/-preview.*$/, " Preview");
}

/* ── ทรงข้อมูลที่เซิร์ฟเวอร์ (lib/server/ai-usage.ts) ส่งให้หน้าแดชบอร์ด — อยู่ไฟล์นี้เพื่อให้ client component import type ได้ ── */

export type Bucket = { calls: number; fail: number; costUsd: number; inTok: number; outTok: number; thinkTok: number; ms: number };

export type DayAgg = Bucket & {
  dayKey: string;
  cachedTok: number;
  byFeature: Record<string, Bucket>;
  byModel: Record<string, Bucket & { name: string }>;
  /** "00".."23" → ยอดรายชั่วโมง (เวลาไทย) */
  hours: Record<string, { calls: number; fail: number; costUsd: number }>;
};

export type AiEvent = {
  id: string;
  at: string;
  feature: string;
  model: string;
  ok: boolean;
  status: number;
  ms: number;
  costUsd: number;
  error?: string;
} & TokenCount;

export type AiCostSettings = {
  thbPerUsd: number;
  /** งบ Gemini ต่อเดือน (บาท) · 0 = ไม่ตั้ง */
  monthlyBudgetThb: number;
  /** ค่าบริการรายเดือนอื่นของบอท (n8n/LINE OA/Pinecone) ให้เห็นภาพรวมในหน้าเดียว */
  fixedCosts: { name: string; thb: number }[];
};

export type AiDashboard = {
  at: string;
  today: string;
  /** วันละ 1 ตัว เรียงเก่า→ใหม่ ครบทุกวัน (วันที่ไม่มีการใช้ = ศูนย์) */
  days: DayAgg[];
  /** คำขอล่าสุด ใหม่→เก่า */
  feed: AiEvent[];
  settings: AiCostSettings;
  /** มีคีย์ Gemini + ฐานข้อมูลพร้อม = บัญชีเดินอยู่ */
  tracking: { gemini: boolean; db: boolean };
};

/** USD → บาท (อัตราตั้งได้ในหน้าแดชบอร์ด · ค่าเริ่มต้นประมาณการ) */
export const DEFAULT_THB_PER_USD = 33;

export function thb(usd: number, rate = DEFAULT_THB_PER_USD): number {
  return usd * rate;
}

/** แสดงบาทให้อ่านง่าย: < ฿1 โชว์ 2 ตำแหน่ง · < ฿100 โชว์ 1 ตำแหน่ง · มากกว่านั้นปัดเต็ม */
export function fmtThb(v: number): string {
  if (!Number.isFinite(v)) return "฿0";
  const abs = Math.abs(v);
  const digits = abs < 1 ? 2 : abs < 100 ? 1 : 0;
  return `฿${v.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("th-TH");
}
