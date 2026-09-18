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
}

export function clearAppendTarget() {
  localStorage.removeItem(KEY);
}

/** ติ๊กเลือกรายการที่จะสั่ง → ย้ายไปอยู่ที่ lib/cart-select (ใช้ได้ทุกโหมด ไม่ใช่แค่ตอนสั่งเพิ่ม) */
