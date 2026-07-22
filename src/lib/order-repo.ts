"use client";

/** ชั้นเข้าถึงออเดอร์จริง (Supabase ตาราง orders ผ่าน API ฝั่งเซิร์ฟเวอร์) */
import type { Order } from "./admin-data";

export interface CreateOrderInput {
  customerName: string;
  phone: string;
  address: string;
  email?: string;
  customerId?: string;
  shipping: string;
  shippingCost: number;
  subtotal: number;
  total: number;
  items: { productId: string; name: string; selections: string; qty: number; unitPrice: number }[];
}

/** ลูกค้าสั่งซื้อ → สร้างออเดอร์ (public API, service role เขียน) · คืน key ลับสำหรับแจ้งโอน */
export async function placeOrder(
  input: CreateOrderInput
): Promise<{ ok: boolean; orderId?: string; key?: string; error?: string }> {
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, orderId: data.id, key: data.key } : { ok: false, error: data.error ?? "สั่งซื้อไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** ลูกค้าแจ้งโอน → อัปโหลดสลิป + เปลี่ยนสถานะออเดอร์เป็น "รอตรวจสอบ" (ยืนยันด้วย key ลับ) */
export async function reportPayment(
  orderId: string,
  key: string | undefined,
  slip: File
): Promise<{ ok: boolean; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("orderId", orderId);
    if (key) fd.append("key", key);
    fd.append("file", slip);
    const res = await fetch("/api/orders/slip", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "แจ้งโอนไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** แอดมินดึงออเดอร์ทั้งหมด · needsSetup = true เมื่อตาราง orders ยังไม่ถูกสร้าง */
export async function fetchOrdersAdmin(): Promise<{ orders: Order[]; needsSetup: boolean }> {
  try {
    const res = await fetch("/api/admin/orders", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return { orders: data.orders ?? [], needsSetup: !!data.needsSetup };
  } catch {
    return { orders: [], needsSetup: false };
  }
}

/** แอดมินอัปเดตออเดอร์ (เช่น เปลี่ยนสถานะ) */
export async function saveOrderAdmin(order: Order): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    return res.ok;
  } catch {
    return false;
  }
}
