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
  couponCode?: string;
  items: { productId: string; name: string; selections: string; sel?: Record<string, string>; qty: number; unitPrice: number }[];
}

/** ลูกค้าสั่งซื้อ → สร้างออเดอร์ (public API, service role เขียน) · คืน key ลับสำหรับแจ้งโอน */
export async function placeOrder(
  input: CreateOrderInput
): Promise<{ ok: boolean; orderId?: string; key?: string; coupon?: { applied: boolean; reason?: string }; error?: string }> {
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, orderId: data.id, key: data.key, coupon: data.coupon } : { ok: false, error: data.error ?? "สั่งซื้อไม่สำเร็จ" };
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

/** ลูกค้าสั่งเพิ่มเข้าออเดอร์เดิม (ไม่คิดค่าส่งซ้ำ) */
export async function appendToOrder(
  orderId: string,
  key: string,
  items: CreateOrderInput["items"]
): Promise<{ ok: boolean; owed?: number; error?: string }> {
  try {
    const res = await fetch("/api/orders/append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, key, items }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, owed: data.owed } : { ok: false, error: data.error ?? "สั่งเพิ่มไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** ลูกค้าเปิดหน้าเช็คออเดอร์ (ต้องมี key จากลิงก์) */
export async function fetchOrderForCustomer(
  id: string,
  key: string
): Promise<{ order?: Order; error?: string }> {
  try {
    const res = await fetch(`/api/orders/view?id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { order: data.order as Order } : { error: data.error ?? "เปิดออเดอร์ไม่สำเร็จ" };
  } catch {
    return { error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** ลูกค้าตรวจแบบ — อนุมัติ หรือ ขอแก้ไข (พร้อมคอมเมนต์) */
export async function reviewProof(
  orderId: string,
  key: string,
  itemIndex: number,
  action: "approve" | "request",
  note?: string
): Promise<{ ok: boolean; order?: Order; error?: string }> {
  try {
    const res = await fetch("/api/orders/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, key, itemIndex, action, note }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, order: data.order as Order } : { ok: false, error: data.error ?? "ส่งผลตรวจไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** กราฟฟิก/แอดมิน อัปโหลดภาพแบบงาน (เพิ่มรูปใหม่เข้ารายการ) · ระบุจำนวน/รายละเอียดของรูปนี้ได้ */
export async function uploadProof(
  orderId: string,
  itemIndex: number,
  file: File,
  meta?: { qty?: number; note?: string }
): Promise<{ ok: boolean; order?: Order; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("orderId", orderId);
    fd.append("itemIndex", String(itemIndex));
    fd.append("file", file);
    if (meta?.qty) fd.append("qty", String(meta.qty));
    if (meta?.note) fd.append("note", meta.note);
    const res = await fetch("/api/admin/orders/proof", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, order: data.order as Order } : { ok: false, error: data.error ?? "อัปโหลดแบบไม่สำเร็จ" };
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
