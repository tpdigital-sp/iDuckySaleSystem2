"use client";

/**
 * "โหมดหยิบใส่ใบเสนอราคา" — แอดมินกดจากหน้าใบเสนอราคา แล้วไปเลือกสินค้าจริงที่หน้าร้าน
 * (ได้ตัวเลือก/ราคาขั้นบันไดอัตโนมัติ เหมือนลูกค้าสั่งเอง) แล้วกดโยนเข้าใบเสนอราคาจากหน้าตะกร้า
 * ต่างจาก append-order: ปลายทางเป็น "ใบเสนอราคา" ไม่ใช่ออเดอร์ — ยังไม่เข้าคิวกราฟฟิก
 */
const KEY = "iducky-append-quote-v1";

export interface QuoteTarget {
  id: string;
  customer: string;
}

export function getQuoteTarget(): QuoteTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as QuoteTarget;
    return t?.id ? t : null;
  } catch {
    return null;
  }
}

export function setQuoteTarget(t: QuoteTarget) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {}
}

export function clearQuoteTarget() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
