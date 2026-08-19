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
  /** พนักงานสั่งแทนลูกค้า (เซิร์ฟเวอร์ตรวจสิทธิ์จากคุกกี้หลังบ้านเอง) */
  staffOrder?: boolean;
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

/**
 * ย่อสลิปที่ถ่ายจากกล้องมือถือก่อนส่ง (ด้านยาวสุด 2000px · JPEG)
 *
 * ⚠️ เหตุผล: เส้น /api/orders/slip วิ่งผ่าน Netlify Function ซึ่งรับ body ได้ ~6MB แบบ base64
 *    (= ไฟล์จริงราว 4.5MB) รูปถ่ายสลิปจากมือถือทะลุเพดานนี้ได้ง่าย แล้ว Netlify จะตอบเป็นหน้า error
 *    ที่ไม่ใช่ JSON → หน้าเว็บขึ้นแค่ "ไม่สำเร็จ" โดยไม่บอกสาเหตุ
 *    ย่อที่ 2000px ยังอ่าน QR/ตัวเลขในสลิปได้ครบ (SlipOK ตรวจผ่าน) · สลิปไฟล์เล็กอยู่แล้วส่งต้นฉบับเหมือนเดิม
 */
const SLIP_SHRINK_OVER = 2.5 * 1024 * 1024;

async function slipForUpload(slip: File): Promise<File> {
  if (slip.size <= SLIP_SHRINK_OVER || !slip.type.startsWith("image/")) return slip;
  try {
    const url = URL.createObjectURL(slip);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("อ่านรูปไม่ได้"));
      im.src = url;
    });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return slip;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    if (!blob || blob.size >= slip.size) return slip;
    return new File([blob], slip.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return slip; // ย่อไม่ได้ก็ส่งต้นฉบับไปตามเดิม
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
    fd.append("file", await slipForUpload(slip));
    const res = await fetch("/api/orders/slip", { method: "POST", body: fd });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.ok) return { ok: true };
    // Netlify ตัดตั้งแต่ยังไม่ถึงโค้ดเรา → ไม่มี JSON ให้อ่าน บอกรหัสสถานะไว้จะได้ไล่เหตุถูก
    return { ok: false, error: data?.error ?? `แจ้งโอนไม่สำเร็จ (รหัส ${res.status}) — ลองใหม่ หรือส่งสลิปทางไลน์ร้าน` };
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

/** ลูกค้าส่งแบบประเมินความพึงพอใจ (นิรนาม — เซิร์ฟเวอร์ไม่เก็บว่าออเดอร์ไหนให้คะแนนเท่าไหร่) */
export async function submitRating(
  orderId: string,
  key: string,
  payload: { score: number; tags: string[]; comment?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, key, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "ส่งแบบประเมินไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** ลูกค้าแก้ไขที่อยู่จัดส่ง (ได้จนกว่าร้านจะปริ้นใบงาน — เซิร์ฟเวอร์เช็ก printedAt) */
export async function updateOrderAddress(
  orderId: string,
  key: string,
  fields: { customer: string; phone: string; address: string }
): Promise<{ ok: boolean; order?: Order; locked?: boolean; error?: string }> {
  try {
    const res = await fetch("/api/orders/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, key, ...fields }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok
      ? { ok: true, order: data.order as Order }
      : { ok: false, locked: !!data.locked, error: data.error ?? "แก้ไขที่อยู่ไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** ลูกค้าตรวจแบบ — อนุมัติ หรือ ขอแก้ไข (พร้อมคอมเมนต์) · ระบุ proofIndex = ตรวจเฉพาะรูปนั้น */
export async function reviewProof(
  orderId: string,
  key: string,
  itemIndex: number,
  action: "approve" | "request",
  note?: string,
  proofIndex?: number
): Promise<{ ok: boolean; order?: Order; error?: string }> {
  try {
    const res = await fetch("/api/orders/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, key, itemIndex, action, note, proofIndex }),
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
  meta?: { qty?: number; note?: string; replaceIndex?: number }
): Promise<{ ok: boolean; order?: Order; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("orderId", orderId);
    fd.append("itemIndex", String(itemIndex));
    fd.append("file", file);
    if (meta?.qty) fd.append("qty", String(meta.qty));
    if (meta?.note) fd.append("note", meta.note);
    // เปลี่ยนรูปทับตำแหน่งเดิม (แก้ตามคำขอลูกค้า) — ตำแหน่ง/เลขรูปไม่เลื่อน
    if (meta?.replaceIndex !== undefined) fd.append("replaceIndex", String(meta.replaceIndex));
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

/**
 * ดึงออเดอร์เดียว (หน้ารายละเอียด) — เบากว่าดึงทั้งตาราง และได้ลิงก์สลิปที่เซ็นแล้วมาด้วย
 */
export async function fetchOrderAdmin(id: string): Promise<{ order?: Order; needsSetup: boolean }> {
  try {
    const res = await fetch(`/api/admin/orders?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return { order: (data.orders ?? [])[0], needsSetup: !!data.needsSetup };
  } catch {
    return { needsSetup: false };
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
