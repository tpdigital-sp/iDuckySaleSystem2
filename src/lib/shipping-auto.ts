import type { ShippingMethod } from "@/lib/shop-settings";
import type { ShipOptionRule, ShipTier } from "@/lib/products";

/**
 * 🚚 เลือกวิธีจัดส่งให้อัตโนมัติ
 *
 * ปัญหาเดิม: ลูกค้าสั่งขายส่ง 200 ชิ้น แต่ระบบยังเลือก "EMS (50)" ให้ ของใส่กล่องเล็กไม่พอ
 * ร้านต้องมาไล่แก้ทีหลังทุกครั้ง
 *
 * กติกา (เอาอันที่ "ใหญ่ที่สุด" ที่เข้าเงื่อนไข):
 *  1) สินค้าบางตัวบังคับกล่องใหญ่เสมอ (ตั้งที่หน้าแก้ไขสินค้า → ค่าส่งขั้นต่ำ)
 *  2) จำนวนรวมถึงเกณฑ์ / ยอดรวมถึงเกณฑ์ (ตั้งที่ ตั้งค่าระบบ → การจัดส่ง)
 * ไม่เข้าเงื่อนไขไหนเลย = ใช้อันแรกในรายการเหมือนเดิม
 *
 * "ใหญ่กว่า" วัดจากราคาค่าส่ง — ค่าส่งแพงกว่า = กล่องใหญ่กว่า/หนักกว่า
 */

export interface AutoShipping {
  /** วิธีที่ระบบเลือกให้ */
  id: string;
  /** วิธีที่ถูกกว่านี้เลือกไม่ได้ (ของใส่ไม่พอ) — undefined = เลือกได้ทุกอัน */
  floorId?: string;
  /** เหตุผลสั้น ๆ ให้ลูกค้าเห็นว่าทำไมถึงเลือกอันนี้ */
  reason?: string;
}

export interface AutoShippingInput {
  /** จำนวนชิ้นรวมในตะกร้า */
  totalQty: number;
  /** ยอดสินค้ารวม (ยังไม่รวมค่าส่ง) */
  subtotal: number;
  /** วิธีจัดส่งขั้นต่ำที่สินค้าในตะกร้าบังคับไว้ (เอาเฉพาะตัวที่ตั้งค่าไว้) */
  requiredIds?: string[];
  /**
   * ทั้งตะกร้ายังเป็นเรทปลีก (เช่น 1-10 ชิ้น) — ยอดเงินถึงเกณฑ์ minSubtotal ก็ไม่เด้งกล่องใหญ่
   * (ของแพงแต่ไม่กี่ชิ้น กล่องเดิมใส่พอ) · เกณฑ์จำนวนชิ้น minQty ยังทำงานปกติ
   */
  retailOnly?: boolean;
}

const rank = (m: ShippingMethod) => m.price;

/** วิธีนี้ถูก "ปลุก" ด้วยเกณฑ์จำนวน/ยอดไหม */
function triggeredBy(m: ShippingMethod, input: AutoShippingInput): string | null {
  if (m.minQty && input.totalQty >= m.minQty) return `สั่ง ${input.totalQty} ชิ้น (ตั้งแต่ ${m.minQty} ชิ้นขึ้นไป)`;
  if (m.minSubtotal && input.subtotal >= m.minSubtotal && !input.retailOnly)
    return `ยอดสั่งซื้อถึง ${m.minSubtotal.toLocaleString()} บาท`;
  return null;
}

export function pickShipping(methods: ShippingMethod[], input: AutoShippingInput): AutoShipping {
  if (!methods.length) return { id: "" };

  let best = methods[0];
  let reason: string | undefined;

  // 1) สินค้าบังคับ — อันไหนใหญ่สุดชนะ
  for (const id of input.requiredIds ?? []) {
    const m = methods.find((x) => x.id === id);
    if (m && rank(m) > rank(best)) {
      best = m;
      reason = "มีสินค้าที่ต้องส่งแบบนี้อยู่ในตะกร้า";
    }
  }

  // 2) เกณฑ์จำนวน/ยอด — อันไหนใหญ่สุดชนะ
  for (const m of methods) {
    const why = triggeredBy(m, input);
    if (why && rank(m) > rank(best)) {
      best = m;
      reason = why;
    }
  }

  // ถูกกว่าที่เลือกไว้ = ของใส่ไม่พอ ล็อกไม่ให้เลือก (เฉพาะตอนที่มีเหตุผลจริง ๆ)
  return { id: best.id, ...(reason ? { floorId: best.id, reason } : {}) };
}

/* ── 📦 ค่าส่งขั้นบันไดตามจำนวนชิ้น (ต่อสินค้า) ──
 * ของหนักอย่างแผ่นหินรองแก้ว ค่าส่งจริงขึ้นกับจำนวนแผ่น ไม่ใช่กล่องแบน ๆ ราคาเดียว
 * แอดมินตั้งตารางไว้ที่หน้าแก้ไขสินค้า → ระบบคิดจากจำนวนที่ลูกค้าสั่งเอง
 */

/* ── 🎛️ ค่าส่งที่ขึ้นกับตัวเลือก (ขนาดมีผลกับกล่อง) ──
 * สินค้าตัวเดียวกันแต่คนละขนาด ค่าส่งไม่เท่ากัน — แอดมินตั้งเงื่อนไขต่อตัวเลือกได้
 * เข้าเงื่อนไขข้อไหน = ใช้ค่าของข้อนั้นแทนค่ากลางของสินค้า
 */

/** สินค้าเท่าที่การคิดค่าส่งต้องใช้ (รับ Product ตรง ๆ ได้ ไม่ต้อง import ทั้งก้อน) */
export interface ShipConfig {
  shippingId?: string;
  shipTiers?: ShipTier[];
  shipTierExtra?: number;
  shipTierMethodId?: string;
  shipRules?: ShipOptionRule[];
}

/** ค่าส่งที่ใช้จริงของแถวหนึ่งในตะกร้า (หลังเอาเงื่อนไขตัวเลือกมาทับค่ากลางแล้ว) */
export interface ShipProfile {
  /** วิธีจัดส่งขั้นต่ำ */
  shippingId?: string;
  tiers?: ShipTier[];
  extra?: number;
  overflowMethodId?: string;
  /** เงื่อนไขที่เข้า (มีค่า = ตารางตามจำนวนมาจากเงื่อนไขนี้ ต้องแยกกลุ่มนับจำนวน) */
  ruleKey: string;
  /** ป้ายกำกับเงื่อนไขไว้โชว์ในตะกร้า เช่น "ขนาด: A2" */
  ruleLabel?: string;
}

/** เงื่อนไขข้อแรกที่ตรงกับตัวเลือกที่ลูกค้าเลือก (ไม่ตรงข้อไหน = undefined) */
function matchShipRule(
  rules: ShipOptionRule[] | undefined,
  selections: Record<string, string>
): { rule: ShipOptionRule; index: number } | undefined {
  const list = rules ?? [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r.label || !r.choices?.length) continue;
    const chosen = selections[r.label];
    if (chosen && r.choices.includes(chosen)) return { rule: r, index: i };
  }
  return undefined;
}

/**
 * รวมค่าส่งของสินค้า + เงื่อนไขตามตัวเลือก ให้เหลือชุดเดียวที่เอาไปคิดเงินได้
 * เงื่อนไขทับเฉพาะส่วนที่ตั้งไว้ — ตั้งแค่วิธีส่งขั้นต่ำ ตารางตามจำนวนก็ยังใช้ของกลาง
 * (ตารางของเงื่อนไขมาเป็นชุด: ตาราง+ส่วนเกิน+วิธีส่งสำรอง ไม่ผสมกับของกลาง)
 */
export function shipProfileOf(p: ShipConfig | undefined, selections: Record<string, string> = {}): ShipProfile {
  const base: ShipProfile = {
    shippingId: p?.shippingId,
    tiers: p?.shipTiers,
    extra: p?.shipTierExtra,
    overflowMethodId: p?.shipTierMethodId,
    ruleKey: "",
  };
  const hit = matchShipRule(p?.shipRules, selections);
  if (!hit) return base;
  const { rule, index } = hit;
  const ownTiers = (rule.shipTiers ?? []).filter((t) => t.minQty > 0).length > 0;
  return {
    shippingId: rule.shippingId || base.shippingId,
    tiers: ownTiers ? rule.shipTiers : base.tiers,
    extra: ownTiers ? rule.shipTierExtra : base.extra,
    overflowMethodId: ownTiers ? rule.shipTierMethodId : base.overflowMethodId,
    // ตารางคนละชุด = ต้องนับจำนวนแยกกลุ่ม (ใช้ตารางกลาง = รวมนับกับแถวอื่นเหมือนเดิม)
    ruleKey: ownTiers ? `r${index}` : "",
    ruleLabel: `${rule.label}: ${selections[rule.label]}`,
  };
}

/** ค่าส่งของสินค้าตัวเดียวตามจำนวนที่สั่ง (0 = ไม่ได้ตั้งตาราง/จำนวนไม่ถึงขั้นแรก) */
export function qtyShipFee(qty: number, tiers: ShipTier[] | undefined, extraPerPiece?: number): number {
  const rows = (tiers ?? [])
    .filter((t) => t.minQty > 0 && t.price >= 0)
    .sort((a, b) => a.minQty - b.minQty);
  if (!rows.length || qty <= 0) return 0;

  let hit: ShipTier | null = null;
  for (const r of rows) if (qty >= r.minQty) hit = r;
  // ต่ำกว่าขั้นแรก = ยังไม่เข้าเกณฑ์ตาราง → คิดตามวิธีส่งปกติ
  // (ร้านตั้งตารางเริ่ม 11 ชิ้นได้ แปลว่าต่ำกว่านั้นกล่องธรรมดาเอาอยู่)
  if (!hit) return 0;

  const last = rows[rows.length - 1];
  // เกินขั้นสุดท้าย + ตั้งราคาต่อชิ้นส่วนเกินไว้ → บวกเพิ่มตามชิ้นที่เกิน
  if (hit === last && extraPerPiece && extraPerPiece > 0 && qty > last.minQty) {
    return last.price + (qty - last.minQty) * extraPerPiece;
  }
  return hit.price;
}

export interface QtyShipLine {
  name: string;
  qty: number;
  fee: number;
  /** เกินขั้นสุดท้ายจนต้องเปลี่ยนเป็นวิธีส่งนี้ (เช่น ส่งแมสเซนเจอร์) */
  switchedTo?: ShippingMethod;
}

/**
 * รวมค่าส่งตามจำนวนของทั้งตะกร้า (คิดแยกทีละสินค้า แล้วบวกกัน)
 * คืน fee รวม + รายละเอียดต่อสินค้า + วิธีส่งที่สินค้าบางตัวบังคับเปลี่ยน (เกินขั้นสุดท้าย)
 */
export function cartQtyShipFee(
  items: { name: string; qty: number; tiers?: ShipTier[]; extra?: number; overflowMethodId?: string }[],
  methods: ShippingMethod[] = []
): { fee: number; lines: QtyShipLine[]; forceIds: string[] } {
  const lines: QtyShipLine[] = [];
  const forceIds: string[] = [];
  for (const it of items) {
    const rows = (it.tiers ?? []).filter((t) => t.minQty > 0).sort((a, b) => a.minQty - b.minQty);
    const last = rows[rows.length - 1];
    const m0 = it.overflowMethodId ? methods.find((x) => x.id === it.overflowMethodId) : undefined;
    // ⚠️ วิธีส่งราคา 0 (มารับเอง/ส่งฟรี) ใช้เป็น "วิธีส่งตอนเกินขั้น" ไม่ได้ —
    // ไม่งั้นสั่งเยอะ ๆ กลายเป็นส่งฟรี (ร้านเสียค่าส่งเอง) · ตั้งพลาดไว้ = คิดตามตารางตามปกติแทน
    const m = m0 && m0.price > 0 ? m0 : undefined;
    // เกินขั้นสุดท้าย + ตั้ง "เปลี่ยนเป็นวิธีส่ง" ไว้ → ไม่คิดตามตาราง ใช้วิธีนั้นแทน (ราคาวิธีคุมเอง)
    if (last && m && it.qty > last.minQty) {
      lines.push({ name: it.name, qty: it.qty, fee: 0, switchedTo: m });
      forceIds.push(m.id);
      continue;
    }
    const fee = qtyShipFee(it.qty, it.tiers, it.extra);
    if (fee > 0) lines.push({ name: it.name, qty: it.qty, fee });
  }
  return { fee: lines.reduce((s, l) => s + l.fee, 0), lines, forceIds };
}

/** วิธีนี้เลือกได้ไหม เทียบกับขั้นต่ำที่ระบบคำนวณไว้ */
export function shippingAllowed(m: ShippingMethod, methods: ShippingMethod[], auto: AutoShipping): boolean {
  if (!auto.floorId) return true;
  // ค่าส่ง 0 = มารับเอง / ส่งฟรี — ไม่ใช่กล่องพัสดุ ห้ามล็อกไม่ว่าจะสั่งเยอะแค่ไหน
  if (m.price === 0) return true;
  const floor = methods.find((x) => x.id === auto.floorId);
  return !floor || rank(m) >= rank(floor);
}
