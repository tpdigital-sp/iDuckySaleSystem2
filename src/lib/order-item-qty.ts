import {
  ART_BACK_LABEL,
  ART_LABEL,
  DESIGN_LABEL,
  RATE_LABEL,
  activeRate,
  dealerRateOf,
  designCountOf,
  maxDesignsFor,
  needsQuote,
  perUnitCapacity,
  publicRates,
  qtyFromAreaOf,
  repriceCartGroups,
  type Product,
} from "@/lib/products";
import type { OrderItem } from "@/lib/admin-data";

/**
 * 🔢 แก้จำนวนของรายการในออเดอร์ให้ "เหมือนตะกร้า" — เจ้าของร้านสั่ง 10 ก.ย. 69
 * (แอดมินหยิบสินค้าจากหน้าร้านใส่ออเดอร์งานพิเศษแล้ว อยากปรับจำนวนต่อได้โดยไม่ต้องลบแล้วหยิบใหม่)
 *
 * กติกาเดียวกับ changeQty ของหน้าตะกร้า (src/app/(shop)/cart/page.tsx):
 *   • สินค้าคิดตามพื้นที่ (qtyFromArea) — จำนวนล็อกตามขนาดที่กรอก ปรับไม่ได้
 *   • ลดต่ำกว่าขั้นต่ำของเรทที่เลือกไว้ → สลับลงเรทที่รับจำนวนนั้นได้ (เรทตัวแทนไม่สลับ)
 *   • สินค้าล็อกโควตาคละลาย (hardMaxDesigns) → จำนวนลายหดตามจำนวนใหม่
 *   • ราคา/หน่วยคิดใหม่ตามขั้นบันไดด้วย repriceCartGroups ตัวเดียวกับตะกร้า
 *     (รวมล็อตกับรายการสเปคเดียวกันในออเดอร์ให้เหมือนตะกร้า แต่เขียนทับเฉพาะรายการที่แก้ —
 *      รายการอื่นอาจถูกแอดมินตีราคาเองไว้ ห้ามไปเปลี่ยนเงียบ ๆ)
 *
 * ไม่ใช่สินค้าหน้าร้าน (งานพิเศษ/สินค้าถูกลบ/ไม่มี sel) หรือแอดมินตีราคาเองไว้ (quoteNote)
 * → เปลี่ยนแค่จำนวน คงราคา/หน่วยเดิม
 */
export interface QtyChange {
  /** ฟิลด์ที่ต้องเขียนทับลงรายการ */
  patch: Partial<OrderItem>;
  /** ราคา/หน่วยใหม่ (undefined = ไม่ได้คิดใหม่ คงเดิม) */
  unitPrice?: number;
  /** สลับเรทราคาให้ (จาก → ไป) */
  rateChanged?: { from: string; to: string };
  /** โควตาลายถูกหดลงเหลือกี่ลาย */
  designCapped?: number;
}

/** จำนวนของรายการนี้ล็อกตามขนาดที่กรอกไว้ (สินค้าคิดตามพื้นที่) — ปรับในออเดอร์ไม่ได้ เหมือนตะกร้า */
export function qtyLockedByArea(product: Product | undefined, item: OrderItem): boolean {
  if (!product) return false;
  const sel = item.sel ?? {};
  if (!Object.keys(sel).length) return false;
  return qtyFromAreaOf(product, sel) != null;
}

/** รายการนี้เป็นสินค้าจากหน้าร้านที่รู้สเปคแบบหัวข้อ (คิดราคาใหม่ได้) ไหม */
export function isShopLine(product: Product | undefined, item: OrderItem): product is Product {
  if (!product) return false;
  if (item.productId.includes("#")) return false; // บรรทัดค่าธรรมเนียม/ของแถมที่ผูกกับสินค้า
  return Object.values(item.sel ?? {}).some((v) => typeof v === "string" && v.trim() !== "");
}

/**
 * แทนค่าหัวข้อในข้อความรายละเอียด ("หัวข้อ: ค่า · หัวข้อ: ค่า") ทีละหัวข้อ
 * แก้เฉพาะหัวข้อที่เปลี่ยน — ข้อความส่วนอื่นที่แอดมินเคยแก้มือไว้ไม่แตะ · ไม่เจอหัวข้อ = ต่อท้าย
 */
function patchSelectionsText(text: string, changes: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(changes)) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s·\\s|\\n)(${esc}:\\s*)([^·\\n]*)`);
    if (re.test(out)) out = out.replace(re, (_m, pre: string, head: string) => `${pre}${head}${v}`);
    else out = out ? `${out} · ${k}: ${v}` : `${k}: ${v}`;
  }
  return out;
}

export function orderItemQtyChange(
  items: OrderItem[],
  index: number,
  nextQty: number,
  productOf: (id: string) => Product | undefined
): QtyChange | null {
  const it = items[index];
  if (!it) return null;
  const next = Math.max(1, Math.floor(nextQty));
  if (!Number.isFinite(next) || next === it.qty) return null;

  const p = productOf(it.productId);
  // งานพิเศษ/สินค้าที่ไม่รู้จัก/ไม่มีสเปคแบบหัวข้อ → แค่เปลี่ยนจำนวน
  if (!isShopLine(p, it)) return { patch: { qty: next } };
  if (qtyLockedByArea(p, it)) return null;

  let sel = { ...(it.sel ?? {}) };
  const out: QtyChange = { patch: { qty: next } };

  // เรทตัวแทนจำหน่าย: สั่งได้ตั้งแต่ชิ้นแรก ไม่สลับลงเรทอื่น
  const dealerLine = !!dealerRateOf(p, sel);
  const rates = publicRates(p);
  let rate = activeRate(p, sel);
  if (!dealerLine && rates.length > 1 && rate && (rate.minQty ?? 1) > next) {
    const fit = [...rates]
      .filter((r) => (r.minQty ?? 1) <= next)
      .sort((a, b) => (b.minQty ?? 1) - (a.minQty ?? 1))[0];
    if (fit && fit.label !== rate.label) {
      out.rateChanged = { from: rate.label, to: fit.label };
      sel = { ...sel, [RATE_LABEL]: fit.label };
      rate = fit;
    }
  }
  // 🔒 โควตาคละลายต้องหดตามจำนวน (สั่ง 12 ชิ้นคละ 4 ลาย แล้วลดเหลือ 11 ชิ้น = เลี่ยงกติกาไม่ได้)
  if (p.hardMaxDesigns && rate?.minPerDesign) {
    const cap = maxDesignsFor(rate, next, perUnitCapacity(p, sel) ?? 1);
    if (designCountOf(sel) > cap) {
      out.designCapped = cap;
      sel = { ...sel, [DESIGN_LABEL]: `${cap} ลาย` };
    }
  }

  const selChanged: Record<string, string> = {};
  for (const [k, v] of Object.entries(sel)) if ((it.sel ?? {})[k] !== v) selChanged[k] = v;
  if (Object.keys(selChanged).length) {
    out.patch.sel = sel;
    out.patch.selections = patchSelectionsText(it.selections ?? "", selChanged);
  }

  // 💬 แอดมินตีราคาเองไว้ / งานที่ต้องตีราคา → คงราคาเดิม ไม่คิดใหม่
  if (it.quoteNote || needsQuote(p, sel)) return out;

  const lines = items.map((x, i) => ({
    productId: x.productId,
    selections: i === index ? sel : (x.sel ?? {}),
    qty: i === index ? next : x.qty,
  }));
  const priced = repriceCartGroups(lines, productOf)[index];
  const unit = Math.round(priced?.unitPrice ?? 0);
  // คิดใหม่แล้วได้ ฿0 ทั้งที่เดิมมีราคา = สเปคเก่าหาช่องตารางไม่เจอ → คงราคาเดิมไว้ (ไม่ทำยอดหายเงียบ ๆ)
  if (unit > 0 && unit !== it.unitPrice) {
    out.unitPrice = unit;
    out.patch.unitPrice = unit;
  }
  return out;
}

/**
 * 🛠 แปลงรายการในออเดอร์กลับเป็นบรรทัดตะกร้า — ไว้เปิดหน้าสินค้าโหมดแก้ไข (?edit=) ให้แอดมินแก้ตัวเลือก
 * ภาพลายที่ตอน checkout ถูกดึงออกไปเป็น artworkUrls/artworkBackUrls ใส่กลับเป็นคีย์เดิม (คั่น " | ")
 * หน้าสินค้าจะติ๊กสเปค/จำนวน/ลายเดิมให้ครบ
 */
export function cartSelectionsOf(item: OrderItem): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const [k, v] of Object.entries(item.sel ?? {})) if (typeof v === "string" && v.trim() !== "") sel[k] = v;
  const back = new Set(item.artworkBackUrls ?? []);
  const front = (item.artworkUrls ?? []).filter((u) => !back.has(u));
  if (front.length) sel[ART_LABEL] = front.join(" | ");
  if (back.size) sel[ART_BACK_LABEL] = [...back].join(" | ");
  return sel;
}

/** ตัวบอกว่า "รายการที่ i ของออเดอร์นี้ถูกส่งไปแก้ตัวเลือกที่หน้าร้าน" — เก็บในเครื่องแอดมิน */
export const ORDER_REPLACE_KEY = "iducky-order-replace-v1";

export interface OrderReplaceMarker {
  orderId: string;
  index: number;
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  /** จำนวนรายการตอนกดแก้ — ของใหม่เข้ามาแล้วรายการต้องมากกว่านี้ */
  itemCount: number;
  at: number;
}

/** หมดอายุใน 3 ชม. — แอดมินเปิดหน้าสินค้าแล้วทิ้งไว้ ไม่ควรมาแทนที่รายการในวันหลัง */
export const ORDER_REPLACE_TTL_MS = 3 * 60 * 60 * 1000;

export function readReplaceMarker(): OrderReplaceMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ORDER_REPLACE_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as OrderReplaceMarker;
    if (!m?.orderId || typeof m.index !== "number") return null;
    if (Date.now() - (m.at || 0) > ORDER_REPLACE_TTL_MS) {
      localStorage.removeItem(ORDER_REPLACE_KEY);
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

export function writeReplaceMarker(m: OrderReplaceMarker | null) {
  try {
    if (m) localStorage.setItem(ORDER_REPLACE_KEY, JSON.stringify(m));
    else localStorage.removeItem(ORDER_REPLACE_KEY);
  } catch {}
}

/**
 * ของใหม่จากหน้าร้านเข้าออเดอร์แล้ว → หิ้วสิ่งที่หน้าร้านไม่รู้จักจากรายการเดิมมาให้ (แบบงาน · หมายเหตุ · ติ๊กต่าง ๆ)
 * แล้วถอดรายการเดิมออก · คืน null ถ้ายังไม่เข้าเงื่อนไข (ของใหม่ยังไม่มา / รายการเดิมไม่ตรงกับตอนกด)
 */
export function applyReplaceMarker(
  items: OrderItem[],
  m: OrderReplaceMarker
): { items: OrderItem[]; old: OrderItem; fresh: OrderItem } | null {
  if (items.length <= m.itemCount) return null;
  const old = items[m.index];
  if (!old || old.productId !== m.productId || old.name !== m.name || old.qty !== m.qty || old.unitPrice !== m.unitPrice)
    return null;
  // ของที่เพิ่งเข้ามา = บรรทัดสินค้าแรกที่ต่อท้ายจากตอนกดแก้ (ข้ามบรรทัด Add on/ค่าธรรมเนียมที่ id ลงท้าย #…)
  // ไม่บังคับให้เป็นสินค้าตัวเดิม — งานพิเศษที่พิมพ์เอง (special-item) แก้แล้วกลายเป็นสินค้าจริงจากหน้าร้าน
  let freshIdx = -1;
  for (let i = m.itemCount; i < items.length; i++) {
    if (i !== m.index && !items[i].productId.includes("#")) {
      freshIdx = i;
      break;
    }
  }
  if (freshIdx < 0) return null;
  const cur = items[freshIdx];
  const hasArt = (cur.artworkUrls?.length ?? 0) > 0;
  const fresh: OrderItem = {
    ...cur,
    ...(old.proofs?.length ? { proofs: old.proofs } : {}),
    ...(old.proofUrl ? { proofUrl: old.proofUrl } : {}),
    ...(old.proofStatus ? { proofStatus: old.proofStatus } : {}),
    ...(old.proofNote ? { proofNote: old.proofNote } : {}),
    ...(old.proofUpdatedAt ? { proofUpdatedAt: old.proofUpdatedAt } : {}),
    ...(old.graphicAck ? { graphicAck: old.graphicAck } : {}),
    ...(old.noteAck ? { noteAck: old.noteAck } : {}),
    ...(old.sampleRequired ? { sampleRequired: old.sampleRequired } : {}),
    ...(old.samplePacked ? { samplePacked: old.samplePacked } : {}),
    ...(old.noProof ? { noProof: old.noProof } : {}),
    ...(old.adminNote ? { adminNote: old.adminNote } : {}),
    ...(old.reuseArt && !cur.reuseArt ? { reuseArt: old.reuseArt } : {}),
    ...(!hasArt && old.artworkUrls?.length
      ? {
          artworkUrls: old.artworkUrls,
          ...(old.artworkBackUrls ? { artworkBackUrls: old.artworkBackUrls } : {}),
          ...(old.artworkQty ? { artworkQty: old.artworkQty } : {}),
          ...(old.artworkSize ? { artworkSize: old.artworkSize } : {}),
        }
      : {}),
  };
  const next = items.map((x, i) => (i === freshIdx ? fresh : x)).filter((_, i) => i !== m.index);
  return { items: next, old, fresh };
}
