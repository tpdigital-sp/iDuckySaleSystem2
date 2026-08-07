"use client";

/**
 * 🛒 "ติ๊กเลือกรายการที่จะสั่ง" ในตะกร้า
 *
 * เก็บเป็นรายการที่ลูกค้า "เอาติ๊กออก" ไม่ใช่รายการที่เลือก —
 * ของที่เพิ่งหยิบใส่ตะกร้าจะถูกเลือกให้อัตโนมัติ (ไม่ต้องกลับมาไล่ติ๊กใหม่)
 * ที่ไม่ติ๊กจะค้างอยู่ในตะกร้าต่อ สั่งทีหลังได้
 */
const KEY = "iducky-cart-unpicked-v1";

export function getUnpicked(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
    return Array.isArray(arr) ? arr.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function setUnpicked(keys: string[]) {
  try {
    if (keys.length) localStorage.setItem(KEY, JSON.stringify(keys));
    else localStorage.removeItem(KEY);
  } catch {
    // storage เต็ม/ถูกปิด — ถือว่าเลือกทั้งหมดไปก่อน ดีกว่าพังทั้งหน้า
  }
}

export function clearUnpicked() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
