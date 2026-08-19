"use client";

/**
 * ออเดอร์ของฉัน — ตัวกลางเรียก /api/orders/mine ที่ใช้ผลร่วมกันทั้งหน้า
 *
 * ทำไมต้องมี: หน้า /account เรียกเอง · กระดิ่งแจ้งเตือนบนแถบเมนูก็เรียก · หน้าประวัติ/เช็คเอาต์ก็เรียก
 * ถ้าต่างคนต่างยิงจะได้ Lambda + ตรวจ token + อ่านตาราง ซ้ำกันหลายรอบต่อการเปิดหน้าครั้งเดียว
 * ที่นี่จึงรวมให้เหลือคำขอเดียว (คำขอที่ค้างอยู่ใช้ร่วมกัน) แล้วแคชสั้นๆ ต่ออีกนิด
 */
import { getAccessToken } from "./customer-auth";
import type { Order } from "./admin-data";

export interface MyOrders {
  orders: Order[];
  /** ยังไม่ได้สร้างตาราง orders ใน Supabase */
  needsSetup?: boolean;
}

/** อายุแคช — สั้นพอที่กลับมาหน้าเดิมแล้วยังเห็นของใหม่ แต่ยาวพอให้หลายคอมโพเนนต์ในหน้าเดียวใช้ร่วมกัน */
const TTL = 20_000;

let inflight: Promise<MyOrders> | null = null;
let cached: { at: number; value: MyOrders } | null = null;

async function load(): Promise<MyOrders> {
  const token = await getAccessToken();
  const res = await fetch("/api/orders/mine", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  }).catch(() => null);
  const j: Partial<MyOrders> = res ? await res.json().catch(() => ({})) : {};
  const value: MyOrders = { orders: j.orders ?? [], needsSetup: j.needsSetup };
  cached = { at: Date.now(), value };
  return value;
}

/** ดึงออเดอร์ของฉัน — `force` = ข้ามแคช (ใช้ตอนกลับมาที่แท็บหลังไปจ่ายเงิน/อนุมัติแบบ) */
export function fetchMyOrders(opts?: { force?: boolean }): Promise<MyOrders> {
  if (!opts?.force) {
    if (cached && Date.now() - cached.at < TTL) return Promise.resolve(cached.value);
    if (inflight) return inflight;
  }
  const p = load().finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
}

/** ล้างแคช — เรียกหลังทำอะไรที่เปลี่ยนออเดอร์ (สั่งซื้อ/อัปสลิป/ออกจากระบบ) */
export function clearMyOrders() {
  cached = null;
  inflight = null;
}
