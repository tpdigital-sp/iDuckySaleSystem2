"use client";

/**
 * ตั้งค่าร้าน — ข้อมูลบัญชีรับเงิน (ให้ลูกค้าโอน)
 * เก็บใน Supabase เพื่อให้ "ลูกค้าเห็นได้" (localStorage ไม่พอ เพราะคนละเบราว์เซอร์)
 * — เก็บเป็นแถวพิเศษในตาราง products (มี RLS public-read + upsert ผ่าน service role อยู่แล้ว)
 *   ด้วย reserved id "__shop_payment__" · fetchProducts/Lite กรอง id ที่ขึ้นต้น "__" ออก
 *   เลี่ยงการสร้างตารางใหม่/รัน SQL · ถ้าต่อไปอยากแยกตาราง `shop_settings` ก็ย้ายได้
 */
import { getSupabase } from "./supabase";

export interface BankAccount {
  id: string;
  bank: string;        // เช่น "ธนาคารกสิกรไทย"
  accountName: string; // ชื่อบัญชี
  accountNo: string;   // เลขบัญชี
}

/** รูปแบบการจัดส่งที่ให้ลูกค้าเลือกตอนสั่งซื้อ */
export interface ShippingMethod {
  id: string;
  name: string;   // เช่น "ส่งธรรมดา (3-5 วัน)"
  price: number;  // ค่าส่ง (บาท)
}

/**
 * ตั้งค่าร้านทั้งหมด (เก็บรวมในเรคอร์ดเดียว id = __shop_payment__)
 * ชื่อ interface ยังเป็น ShopPayment เพื่อไม่ให้โค้ดเดิมพัง แต่ตอนนี้เก็บ "ทุกการตั้งค่า"
 */
export interface ShopPayment {
  banks: BankAccount[];
  /** พร้อมเพย์ (เบอร์โทร / เลขบัตร ปชช. / เลขนิติบุคคล) */
  promptpay?: string;
  promptpayName?: string;
  /** ข้อความ/ขั้นตอนให้ลูกค้า */
  note?: string;
  /** รูปแบบจัดส่ง — ไม่ตั้ง = ใช้ค่าเริ่มต้น */
  shipping?: ShippingMethod[];
  /** ซื้อครบเท่านี้ส่งฟรี (บาท) — 0 หรือไม่ตั้ง = ไม่มีโปรส่งฟรี */
  freeShippingMin?: number;
}

export const SETTINGS_ID = "__shop_payment__";
const LOCAL_KEY = "iducky-payment-v1";
export const EMPTY_PAYMENT: ShopPayment = { banks: [] };

/** ค่าเริ่มต้นถ้าแอดมินยังไม่ได้ตั้งค่าจัดส่ง */
export const DEFAULT_SHIPPING: ShippingMethod[] = [
  { id: "standard", name: "ส่งธรรมดา (3-5 วัน)", price: 50 },
  { id: "express", name: "ส่งด่วน (1-2 วัน)", price: 90 },
];
export const DEFAULT_FREE_SHIPPING_MIN = 999;

/** รูปแบบจัดส่งที่ใช้จริง (ตกไปใช้ค่าเริ่มต้นถ้ายังไม่ตั้ง/ตั้งไว้ว่าง) */
export function shippingOf(s: ShopPayment | null | undefined): ShippingMethod[] {
  const list = (s?.shipping ?? []).filter((m) => m.name?.trim());
  return list.length ? list : DEFAULT_SHIPPING;
}

/** ยอดขั้นต่ำส่งฟรี (0 = ปิดโปร) */
export function freeShippingMinOf(s: ShopPayment | null | undefined): number {
  return s?.freeShippingMin ?? DEFAULT_FREE_SHIPPING_MIN;
}

/** มีช่องทางรับเงินอย่างน้อย 1 อย่างไหม */
export function hasPayment(p: ShopPayment | null | undefined): boolean {
  if (!p) return false;
  return (p.banks ?? []).some((b) => b.accountNo?.trim()) || !!p.promptpay?.trim();
}

/** อ่านข้อมูลบัญชีร้าน (Supabase anon → public read; ไม่ตั้งค่า → localStorage เดโม) */
export async function fetchShopPayment(): Promise<ShopPayment> {
  const sb = getSupabase();
  if (!sb) {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) return JSON.parse(raw) as ShopPayment;
    } catch {
      /* ข้าม */
    }
    return EMPTY_PAYMENT;
  }
  const { data, error } = await sb.from("products").select("data").eq("id", SETTINGS_ID).maybeSingle();
  if (error || !data) return EMPTY_PAYMENT;
  return ((data.data as ShopPayment) ?? EMPTY_PAYMENT);
}

/** บันทึกบัญชีร้าน (แอดมิน) — ผ่าน API (service role); ไม่ตั้งค่า → localStorage */
export async function persistShopPayment(p: ShopPayment): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/shop-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (res.status === 503) {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(p));
        return { ok: true };
      } catch {
        return { ok: false, error: "storage-full" };
      }
    }
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "บันทึกไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}
