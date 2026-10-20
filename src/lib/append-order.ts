"use client";

/**
 * "โหมดสั่งเพิ่ม" — ลูกค้ากดสั่งเพิ่มจากหน้าออเดอร์เดิม
 * เก็บไว้ใน localStorage เพื่อให้หน้าตะกร้า/ชำระเงินรู้ว่าต้องเพิ่มเข้าออเดอร์ไหน
 * (แทนที่จะสร้างออเดอร์ใหม่ → ลูกค้าไม่ต้องจ่ายค่าส่งซ้ำ ร้านไม่ต้องส่ง 2 กล่อง)
 */
import { isRetailRateLine, type Product } from "./products";

const KEY = "iducky-append-order-v1";

export interface AppendTarget {
  id: string;
  key: string;
  /** ค่าจัดส่งเดิมของออเดอร์ — โชว์ให้ลูกค้ารู้ว่าไม่โดนคิดซ้ำ */
  shippingCost?: number;
  /**
   * 🚚 ออเดอร์ปลายทางยังไม่เคยเลือกวิธีส่ง (ใบเปล่าจาก "สร้างออเดอร์งานพิเศษ") → ตะกร้า/หน้าชำระเงินคิดค่าส่งตามปกติ
   * แล้วส่งไปให้ออเดอร์นั้นตอนเพิ่มรายการ (ไม่ใช่ "ไม่คิดค่าส่งซ้ำ" เพราะยังไม่มีค่าส่งให้ซ้ำ) · ดู shippingUnset() ใน ship-label.ts
   */
  needShipping?: boolean;
  /**
   * 🚚⚡ ค่าส่งของใบปลายทางระบบเลือกให้ + ยังไม่มีเงินเข้า (shipAutoFollowNow) → ตะกร้า/หน้าชำระเงินคิดค่าส่งใหม่จาก "ทั้งใบ"
   * แล้วส่งไปแทนค่าเดิม · ลูกค้าจ่ายเฉพาะส่วนต่างจาก shippingCost เดิม (เจ้าของร้าน 20 ต.ค. 69 · OD-261020-2478)
   */
  shipFollow?: boolean;
  /**
   * 🧮 ของที่อยู่ในออเดอร์เดิมอยู่แล้ว (สำเนาตอนกดปุ่มสั่งเพิ่ม) — ตะกร้านับรวมเป็นล็อตผลิตเดียวกันตอนคิดขั้นราคา
   * (เดิม 13 แผ่น + เพิ่ม 7 แผ่น = ขั้น 20 แผ่น ไม่ใช่ขั้น 7 แผ่น · OD-260916-2955) — ตะกร้าดึงของสดจากออเดอร์ซ้ำอีกที
   * ชุดนี้เป็นตัวสำรองตอนดึงไม่สำเร็จ · ดู appendLotLines / cart-context.tsx
   */
  lotItems?: AppendLotLine[];
}

/** บรรทัดของออเดอร์เดิมที่ร่วมล็อตกับของที่สั่งเพิ่ม — รูปเดียวกับบรรทัดที่ repriceCartGroups รับ */
export interface AppendLotLine {
  productId: string;
  selections: Record<string, string>;
  qty: number;
}

/** แจ้งตะกร้า (CartProvider อยู่ค้างข้ามหน้า) ว่าโหมดสั่งเพิ่มเปลี่ยน — แท็บอื่นรู้ผ่านอีเวนต์ storage */
export const APPEND_CHANGED_EVENT = "iducky:append-changed";

/**
 * รายการในออเดอร์เดิม → บรรทัดร่วมล็อต · เอาเฉพาะสินค้าหน้าร้านที่รู้สเปคแบบหัวข้อ (sel)
 * บรรทัดค่าธรรมเนียม/ของแถม (productId มี #) และงานพิเศษที่ไม่มี sel ไม่ร่วมล็อต
 */
export function appendLotLines(
  items: { productId?: string; sel?: Record<string, string>; qty?: number }[] | undefined
): AppendLotLine[] {
  const out: AppendLotLine[] = [];
  for (const it of items ?? []) {
    if (!it.productId || it.productId.includes("#") || !(Number(it.qty) > 0)) continue;
    const selections: Record<string, string> = {};
    for (const [k, v] of Object.entries(it.sel ?? {})) if (typeof v === "string" && v.trim() !== "") selections[k] = v;
    if (!Object.keys(selections).length) continue;
    out.push({ productId: it.productId, selections, qty: Number(it.qty) });
  }
  return out;
}

/**
 * 🚚 ของทั้งใบเดิม — ไว้คิดวิธีส่ง/ส่งฟรีจาก "ทั้งใบ" ตอนสั่งเพิ่มเข้าใบที่ยังไม่เคยเลือกวิธีส่ง (needShipping)
 * เดิมตะกร้า/หน้าชำระเงินคิดจากของที่หยิบรอบนี้อย่างเดียว (เจ้าของร้าน 20 ต.ค. 69): ใบมีงานพิเศษ ฿1,500 หยิบเพิ่ม ฿600
 * → เห็นแค่ ฿600 กล่องใหญ่/ส่งฟรีไม่เด้ง ทั้งที่เซิร์ฟเวอร์ (/api/orders/append) กับหน้าออเดอร์ (autoShipOf) ดูทั้งใบ
 * สูตรเดียวกับ autoShipOf หน้าออเดอร์: ทุกบรรทัด · ยอด = qty × unitPrice
 */
export interface AppendShipBase {
  /** ยอดสินค้าทั้งใบเดิม (ยังไม่รวมค่าส่ง/ส่วนลด) */
  subtotal: number;
  lines: AppendLotLine[];
}

export function appendShipBase(
  items: { productId?: string; sel?: Record<string, string>; qty?: number; unitPrice?: number }[] | undefined
): AppendShipBase {
  let subtotal = 0;
  const lines: AppendLotLine[] = [];
  for (const it of items ?? []) {
    const qty = Number(it.qty) || 0;
    if (!(qty > 0)) continue;
    subtotal += qty * (Number(it.unitPrice) || 0);
    lines.push({ productId: it.productId ?? "", selections: { ...(it.sel ?? {}) }, qty });
  }
  return { subtotal: Math.round(subtotal * 100) / 100, lines };
}

/** บรรทัดที่ใช้คิดวิธีส่ง — base = มาจากใบเดิม (ไม่ใช่ของในตะกร้า) */
export interface ShipCalcLine {
  productId: string;
  selections: Record<string, string>;
  qty: number;
  /** เรทที่ตะกร้ารวมล็อตสรุปให้ (เฉพาะของในตะกร้า) */
  rateLabel?: string;
  base?: boolean;
}

/** ของที่หยิบรอบนี้ + ของทั้งใบเดิม (base = null → เฉพาะของที่หยิบ เหมือนเดิม) */
export function shipCalcLines(
  picked: { productId: string; selections: Record<string, string>; qty: number; merged?: { rateLabel?: string } }[],
  base: AppendShipBase | null
): ShipCalcLine[] {
  return [
    ...picked.map((i) => ({ productId: i.productId, selections: i.selections, qty: i.qty, rateLabel: i.merged?.rateLabel })),
    ...(base?.lines ?? []).map((l) => ({ ...l, base: true })),
  ];
}

/**
 * ทั้งชุดยังเป็นเรทปลีกไหม (ปลีกล้วน = ยอดถึงเกณฑ์ก็ไม่เด้งกล่องใหญ่)
 * ของในตะกร้า: สินค้าที่ยังไม่รู้จัก = ปลีก (กติกาเดิมของตะกร้า)
 * ของในใบเดิม: งานพิเศษ/สินค้าที่ไม่มีในร้าน = ไม่ปลีก (กติกาเดียวกับหน้าออเดอร์ — สองที่ต้องได้กล่องเดียวกัน)
 */
export function shipRetailOnly(lines: ShipCalcLine[], productOf: (id: string) => Product | undefined): boolean {
  return lines.every((l) => {
    const p = l.productId ? productOf(l.productId) : undefined;
    if (!p) return !l.base;
    return isRetailRateLine(p, l.selections, l.qty, l.rateLabel);
  });
}

export function getAppendTarget(): AppendTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as AppendTarget;
    return t?.id ? t : null;
  } catch {
    return null;
  }
}

export function setAppendTarget(t: AppendTarget) {
  localStorage.setItem(KEY, JSON.stringify(t));
  window.dispatchEvent(new Event(APPEND_CHANGED_EVENT));
}

export function clearAppendTarget() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(APPEND_CHANGED_EVENT));
}

/** ติ๊กเลือกรายการที่จะสั่ง → ย้ายไปอยู่ที่ lib/cart-select (ใช้ได้ทุกโหมด ไม่ใช่แค่ตอนสั่งเพิ่ม) */
