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

/** ลูกค้าสั่งซื้อ → สร้างออเดอร์ (public API, service role เขียน) */
export async function placeOrder(
  input: CreateOrderInput
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, orderId: data.id } : { ok: false, error: data.error ?? "สั่งซื้อไม่สำเร็จ" };
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
