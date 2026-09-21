"use client";

/**
 * "โหมดสั่งเพิ่ม" — ลูกค้ากดสั่งเพิ่มจากหน้าออเดอร์เดิม
 * เก็บไว้ใน localStorage เพื่อให้หน้าตะกร้า/ชำระเงินรู้ว่าต้องเพิ่มเข้าออเดอร์ไหน
 * (แทนที่จะสร้างออเดอร์ใหม่ → ลูกค้าไม่ต้องจ่ายค่าส่งซ้ำ ร้านไม่ต้องส่ง 2 กล่อง)
 */
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
