/**
 * ระบบระดับสมาชิก — สะสมยอดจ่ายจริงตลอดชีพ → ตกระดับ → ลด % อัตโนมัติ
 * ตั้งค่าได้ในหน้า /admin/settings (เก็บใน ShopPayment.tiers) · คำนวณสดจากตาราง orders ไม่ต้องมีตารางใหม่
 */
import { orderTotal, type Order, type OrderStatus } from "./admin-data";

export interface Tier {
  id: string;
  name: string; // เช่น "ซิลเวอร์"
  icon: string; // emoji
  minSpend: number; // ยอดสะสมขั้นต่ำที่จะเข้าระดับนี้ (บาท)
  discountPct: number; // ส่วนลด % ต่อออเดอร์
}

export const DEFAULT_TIERS: Tier[] = [
  { id: "bronze", name: "Bronze", icon: "🥉", minSpend: 0, discountPct: 0 },
  { id: "silver", name: "Silver", icon: "🥈", minSpend: 3000, discountPct: 3 },
  { id: "gold", name: "Gold", icon: "🥇", minSpend: 10000, discountPct: 5 },
  { id: "platinum", name: "Platinum", icon: "💎", minSpend: 30000, discountPct: 8 },
  { id: "diamond", name: "Diamond", icon: "👑", minSpend: 80000, discountPct: 12 },
];

/**
 * ระดับเริ่มต้น "ยังไม่เป็นสมาชิกระดับใด" — ใส่ให้เองเมื่อตารางที่ตั้งไว้เริ่มที่ยอด > 0
 * ทำไม: ร้านตั้ง Bronze ≥ ฿50,000 (ไม่มีระดับ ฿0) แต่โค้ดเคยถือว่า "ไม่มีระดับ = ระดับแรกในตาราง"
 * → ลูกค้าใหม่ยอด ฿0 ได้ Bronze 3% ทั้งใบเสนอราคา/สั่งเอง/หน้า account (QT-260908-3316, 8 ก.ย. 69)
 * ระดับนี้ไม่ถูกเก็บลงตั้งค่าร้าน (tiersConfigOf ไม่มี) เป็นแค่ขั้นล่างสุดตอนคำนวณ/แสดงผล
 */
export const BASE_TIER_ID = "member";
export const BASE_TIER: Tier = { id: BASE_TIER_ID, name: "สมาชิกทั่วไป", icon: "🙂", minSpend: 0, discountPct: 0 };

/** สี gradient + สีป้ายส่วนลด ต่อระดับ (โทนสีสด อิงโลหะ/อัญมณี) — คีย์ด้วย id, ไม่เจอใช้ลำดับวน */
const TIER_GRAD = [
  "linear-gradient(135deg,#7c4a21,#b06a34 55%,#c98a4e)", // bronze
  "linear-gradient(135deg,#525b67,#828d9c 55%,#a6afba)", // silver
  "linear-gradient(135deg,#b9791a,#e0a92a 55%,#f2c94c)", // gold
  "linear-gradient(135deg,#0b6b7a,#149bad 52%,#3fd0dd)", // platinum
  "linear-gradient(135deg,#5b2ec0,#4a54d6 45%,#3b7ae4)", // diamond
];
const TIER_PILL = ["#7c4a21", "#525b67", "#8a5a12", "#0b6b7a", "#4032a0"];
const TIER_ID_INDEX: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4 };
const BASE_GRAD = "linear-gradient(135deg,#64748b,#94a3b8 55%,#cbd5e1)";
const BASE_PILL = "#64748b";

/** คืนสี gradient + สีป้ายของระดับ (index = ตำแหน่งในลิสต์ ใช้เมื่อ id ไม่ตรงมาตรฐาน) */
export function tierColor(tier: { id: string }, index = 0): { gradient: string; pill: string } {
  if (tier.id === BASE_TIER_ID) return { gradient: BASE_GRAD, pill: BASE_PILL }; // ระดับเริ่มต้น = เทากลาง ไม่ใช่สีทองแดง
  const i = TIER_ID_INDEX[tier.id] ?? index;
  const k = ((i % TIER_GRAD.length) + TIER_GRAD.length) % TIER_GRAD.length;
  return { gradient: TIER_GRAD[k], pill: TIER_PILL[k] };
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  โมเดลระดับสมาชิก: "STATUS-LOCK" (ล็อกระดับ + ทบทวนปีละครั้ง)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * กติกา (เลือกใช้แบบนี้เพราะร้านพิมพ์สั่งทำ ลูกค้าซื้อเป็นก้อนใหญ่แต่ไม่ถี่ —
 * ระดับต้องไม่ตกกลางคันทั้งที่เพิ่งซื้อก้อนโตไป และอธิบายลูกค้าง่าย):
 *
 *  1) ขึ้นระดับทันที — พอ "ยอดสะสมในรอบปีปัจจุบัน" (tierCycleSpend) ถึงเกณฑ์ระดับที่สูงกว่า
 *     ระดับขยับขึ้นทันที (ข้ามหลายขั้นได้ถ้าออเดอร์ก้อนใหญ่) และ "เริ่มนับรอบใหม่ 12 เดือน"
 *     (รีเซ็ต anchor = วันนี้, cycleSpend = 0) → ได้เวลาเต็มปีในการรักษาระดับใหม่
 *
 *  2) รักษาระดับ — ครบรอบปี (anchor + 365 วัน) ดูว่ายอดในรอบนั้นถึงเกณฑ์ระดับปัจจุบันไหม
 *       • ถึง → ต่ออายุ อยู่ระดับเดิม เริ่มรอบใหม่
 *       • ไม่ถึง → ลดลง "1 ขั้น" (ไม่ร่วงหลายขั้นรวด ให้โอกาสไต่กลับ) เริ่มรอบใหม่
 *
 *  3) ส่วนลด — คิดจาก "ระดับที่ล็อกอยู่" (tierLevel) ไม่ใช่ยอดสด → ระดับนิ่งทั้งปี
 *
 *  4) แต้ม (1 บาท = 1 แต้ม) มีไว้ "นับระดับ" เท่านั้น แลกไม่ได้
 *
 * ต่างจากโมเดล rolling (แต้มแต่ละก้อนหมดอายุคนละเวลา ระดับค่อย ๆ ไหลลง):
 * status-lock ให้ความรู้สึก "ขึ้นระดับแล้วอยู่ยาว 1 ปี" ตรงกับ "ยกยอดมาปีถัดไป" ของระบบเดิม
 *
 * สถานะระดับของลูกค้าเก็บบน contact 3 ช่อง (ดู lib/contacts.ts):
 *   tierLevel      = id ระดับที่ล็อกอยู่ (เช่น "gold")
 *   tierAnchor     = วันเริ่มรอบปีปัจจุบัน (ISO) — ครบรอบ = anchor + 365 วัน
 *   tierCycleSpend = ยอดสะสม (บาท) เฉพาะรอบนี้ ใช้ตัดสินขึ้น/รักษาระดับ
 */

/** ความยาว 1 รอบสมาชิก (วัน) — ครบรอบแล้วทบทวนระดับหนึ่งครั้ง */
export const TIER_CYCLE_DAYS = 365;

/** สถานะระดับที่เก็บบน contact — ภาษากลางระหว่างเซิร์ฟเวอร์ (award/cron) กับหน้าจอ */
export type TierStatus = {
  /** id ระดับที่ล็อกอยู่ — ไม่มี = ยังไม่เคยมีสถานะ (ใช้ระดับต่ำสุด) */
  levelId?: string;
  /** วันเริ่มรอบปีปัจจุบัน (ISO) */
  anchor?: string;
  /** ยอดสะสมบาทในรอบนี้ */
  cycleSpend?: number;
};

/** สถานะที่ถือว่า "จ่ายแล้ว" — นับเข้ายอดสะสม (ไม่นับ รอชำระ/รอตรวจสลิป/ยกเลิก) */
const PAID_STATUSES: OrderStatus[] = ["ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ", "กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"];

/** เรียงระดับจากต่ำ→สูง · ตกไปใช้ค่าเริ่มต้นถ้ายังไม่ตั้ง · ตารางที่ไม่มีระดับ ฿0 จะได้ระดับเริ่มต้น (0%) เติมหน้าสุด */
export function tiersOf(list?: Tier[] | null): Tier[] {
  const t = list && list.length ? list : DEFAULT_TIERS;
  const sorted = [...t].filter((x) => x.id !== BASE_TIER_ID).sort((a, b) => a.minSpend - b.minSpend);
  if (!sorted.length || sorted[0].minSpend > 0) sorted.unshift(BASE_TIER);
  return sorted;
}

/** ยอดสะสมตลอดชีพ = ผลรวม orderTotal ของออเดอร์ที่จ่ายแล้ว (ไว้โชว์เฉย ๆ ไม่ใช้ตัดสินระดับแล้ว) */
export function paidSpend(orders: Order[]): number {
  return orders.filter((o) => PAID_STATUSES.includes(o.status)).reduce((s, o) => s + orderTotal(o), 0);
}

/** ระดับที่ยอดเท่านี้ "เข้าเกณฑ์" (ระดับสูงสุดที่ยอดถึง) — ใช้ตอนขึ้น/รักษาระดับ */
export function tierForSpend(spend: number, list?: Tier[] | null): Tier {
  const t = tiersOf(list);
  let cur = t[0];
  for (const x of t) if (spend >= x.minSpend) cur = x;
  return cur;
}

/** ระดับถัดไป (null = สูงสุดแล้ว) */
export function nextTier(spend: number, list?: Tier[] | null): Tier | null {
  return tiersOf(list).find((x) => x.minSpend > spend) ?? null;
}

/** ระดับที่ต่ำกว่าลงมา 1 ขั้น (null = ต่ำสุดแล้ว) — ใช้ตอนลดระดับ */
export function lowerTier(levelId: string | undefined, list?: Tier[] | null): Tier | null {
  const t = tiersOf(list);
  const i = t.findIndex((x) => x.id === levelId);
  return i > 0 ? t[i - 1] : null;
}

/** ส่วนลดของระดับ คิดบน "ราคาสินค้า" (ก่อนค่าส่ง) · ปัดลงเป็นจำนวนเต็มบาท */
export function tierDiscountAmount(subtotal: number, pct: number): number {
  if (pct <= 0 || subtotal <= 0) return 0;
  return Math.floor((subtotal * pct) / 100);
}

/** ระดับที่ล็อกอยู่ตอนนี้ (จาก TierStatus) — ไม่มีสถานะ = ระดับต่ำสุด */
export function lockedTier(status: TierStatus | null | undefined, list?: Tier[] | null): Tier {
  const t = tiersOf(list);
  return t.find((x) => x.id === status?.levelId) ?? t[0];
}

/**
 * ── ได้แต้มจากออเดอร์ (award) ──
 * บวกยอดเข้ารอบปัจจุบัน แล้วเช็คขึ้นระดับ · คืนสถานะใหม่ + upgraded (ขึ้นระดับไหม)
 * ขึ้นระดับ = รีเซ็ตรอบใหม่ (ได้เวลาเต็มปีรักษาระดับที่สูงขึ้น)
 */
export function applyEarn(status: TierStatus | null | undefined, amount: number, list?: Tier[] | null, now: number = Date.now()): TierStatus & { upgraded: boolean } {
  const t = tiersOf(list);
  const curLevel = t.find((x) => x.id === status?.levelId) ?? t[0];
  const anchor = status?.anchor ?? new Date(now).toISOString();
  const cycleSpend = (Number(status?.cycleSpend) || 0) + Math.max(0, amount);
  const qualified = tierForSpend(cycleSpend, list);
  if (qualified.minSpend > curLevel.minSpend) {
    // ขึ้นระดับ → ล็อกระดับใหม่ + เริ่มรอบใหม่ (การซื้อครั้งนี้ "ใช้" ไปกับการอัปเกรด)
    return { levelId: qualified.id, anchor: new Date(now).toISOString(), cycleSpend: 0, upgraded: true };
  }
  return { levelId: curLevel.id, anchor, cycleSpend, upgraded: false };
}

/** ── ยกเลิกออเดอร์ (revoke) ── หักยอดออกจากรอบปัจจุบัน (ไม่ลดระดับกลางรอบ รอทบทวนตอนครบรอบ) */
export function applyRevoke(status: TierStatus | null | undefined, amount: number, list?: Tier[] | null): TierStatus {
  const t = tiersOf(list);
  const curLevel = t.find((x) => x.id === status?.levelId) ?? t[0];
  return {
    levelId: curLevel.id,
    anchor: status?.anchor ?? new Date().toISOString(),
    cycleSpend: Math.max(0, (Number(status?.cycleSpend) || 0) - Math.max(0, amount)),
  };
}

/**
 * ── ทบทวนตอนครบรอบ (renewal) ── เรียกจาก cron รายวัน
 * ถ้ายังไม่ครบรอบ → คืน { changed:false } (ไม่ทำอะไร)
 * ครบรอบแล้ว: ยอดในรอบถึงเกณฑ์ระดับเดิม → ต่ออายุ(อยู่เดิม) · ไม่ถึง → ลด 1 ขั้น · เริ่มรอบใหม่เสมอ
 */
export function applyRenewal(status: TierStatus | null | undefined, list?: Tier[] | null, now: number = Date.now()): { status: TierStatus; changed: boolean; renewed: boolean; from?: Tier; to?: Tier } {
  const t = tiersOf(list);
  const curLevel = t.find((x) => x.id === status?.levelId) ?? t[0];
  const anchorMs = Date.parse(status?.anchor ?? "");
  if (isNaN(anchorMs) || now < anchorMs + TIER_CYCLE_DAYS * 86400_000) {
    return { status: status ?? { levelId: curLevel.id, anchor: new Date(now).toISOString(), cycleSpend: 0 }, changed: false, renewed: false };
  }
  const cycleSpend = Number(status?.cycleSpend) || 0;
  const iso = new Date(now).toISOString();
  if (cycleSpend >= curLevel.minSpend || curLevel.minSpend <= 0) {
    // รักษาระดับได้ (หรือเป็นระดับต่ำสุดที่ลดไม่ได้) → ต่ออายุ เริ่มรอบใหม่
    return { status: { levelId: curLevel.id, anchor: iso, cycleSpend: 0 }, changed: false, renewed: true, from: curLevel, to: curLevel };
  }
  const down = lowerTier(curLevel.id, list) ?? t[0];
  return { status: { levelId: down.id, anchor: iso, cycleSpend: 0 }, changed: true, renewed: false, from: curLevel, to: down };
}

/**
 * ── ข้อมูลครบรอบสำหรับการ์ดหน้า account ──
 * คืนวันครบรอบ, เหลืออีกกี่วัน, ต้องซื้อเพิ่มอีกเท่าไหร่ถึงรักษาระดับ, ถ้าไม่ถึงจะลดเป็นระดับไหน
 * คืน null = ระดับต่ำสุด (ไม่มีอะไรจะลด)
 */
export function tierRenewalInfo(status: TierStatus | null | undefined, list?: Tier[] | null, now: number = Date.now()): { at: string; days: number; level: Tier; dropTo: Tier | null; needMore: number; willRenew: boolean; cycleSpend: number } | null {
  const level = lockedTier(status, list);
  if (level.minSpend <= 0) return null; // ระดับต่ำสุด ลดไม่ได้
  const anchorMs = Date.parse(status?.anchor ?? "");
  if (isNaN(anchorMs)) return null;
  const at = anchorMs + TIER_CYCLE_DAYS * 86400_000;
  const cycleSpend = Number(status?.cycleSpend) || 0;
  const needMore = Math.max(0, level.minSpend - cycleSpend);
  return {
    at: new Date(at).toISOString(),
    days: Math.ceil((at - now) / 86400_000),
    level,
    dropTo: lowerTier(level.id, list),
    needMore,
    willRenew: needMore <= 0,
    cycleSpend,
  };
}

/**
 * ── สร้างสถานะระดับตั้งต้นให้ลูกค้าเดิม (ยกยอดจากระบบเก่า) ──
 * ให้ระดับตามยอดสะสมเดิม + เริ่มรอบปีจากวันนำเข้า + cycleSpend = 0
 * (ปีแรกอยู่ระดับที่ยกมา ต้องซื้อสะสมใหม่เพื่อรักษา = ตรงกับ "ยกยอดมาปีถัดไป")
 */
export function seedTierStatus(lifetimeSpend: number, importedAtISO: string | undefined, list?: Tier[] | null, now: number = Date.now()): TierStatus {
  const level = tierForSpend(lifetimeSpend, list);
  const anchorMs = Date.parse(importedAtISO ?? "");
  return { levelId: level.id, anchor: new Date(isNaN(anchorMs) ? now : anchorMs).toISOString(), cycleSpend: 0 };
}
