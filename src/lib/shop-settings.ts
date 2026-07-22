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

export interface ShopPayment {
  banks: BankAccount[];
  /** พร้อมเพย์ (เบอร์โทร / เลขบัตร ปชช. / เลขนิติบุคคล) */
  promptpay?: string;
  promptpayName?: string;
  /** ข้อความ/ขั้นตอนให้ลูกค้า */
  note?: string;
}

export const SETTINGS_ID = "__shop_payment__";
const LOCAL_KEY = "iducky-payment-v1";
export const EMPTY_PAYMENT: ShopPayment = { banks: [] };

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
