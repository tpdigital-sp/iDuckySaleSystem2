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
  shippingCost: number;
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

/** คีย์ของรายการในตะกร้าที่ลูกค้าเลือก "ส่งเข้าออเดอร์เดิม" (null = ยังไม่เคยเลือก → ถือว่าทั้งตะกร้า) */
const PICKS_KEY = "iducky-append-picks-v1";

export function getAppendPicks(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

export function setAppendPicks(keys: string[]) {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify(keys));
  } catch {}
}

export function clearAppendPicks() {
  try {
    localStorage.removeItem(PICKS_KEY);
  } catch {}
}
