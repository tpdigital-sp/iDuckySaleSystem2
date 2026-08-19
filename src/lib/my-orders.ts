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

/**
 * สำเนาชุดล่าสุดเก็บไว้ในเครื่อง — เปิดหน้าครั้งต่อไปเอามาวาดทันที แล้วค่อยดึงของใหม่มาทับเบื้องหลัง
 * ทำไมต้องมี: API ของเว็บ (serverless) ตอบช้า ~0.6-1.8 วิ ต่อคำขอ ไม่ว่าจะปรับโค้ดยังไงก็ยังต้องรอเน็ต
 * ระหว่างนั้นหน้าจะโล่งเป็นโครงกระดูก · มีสำเนาไว้ = ผู้ใช้เห็นของจริงตั้งแต่วินาทีแรก
 * ล้างทิ้งเมื่อออกจากระบบ/เปลี่ยนบัญชี (clearMyOrders) และไม่ใช้ถ้าเก่าเกิน 1 วัน
 */
const STORE_KEY = "ducky_my_orders";
const STORE_MAX_AGE = 24 * 60 * 60 * 1000;

/** อ่านสำเนาในเครื่องของบัญชีนี้ — ไม่มี/เก่าเกินไป/คนละบัญชี = null */
export function readStoredOrders(cid: string): Order[] | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { cid?: string; at?: number; orders?: Order[] };
    if (j.cid !== cid || !j.orders) return null;
    if (!j.at || Date.now() - j.at > STORE_MAX_AGE) return null;
    return j.orders;
  } catch {
    return null;
  }
}

function writeStoredOrders(cid: string, orders: Order[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ cid, at: Date.now(), orders }));
  } catch {
    /* พื้นที่เต็ม — ไม่เป็นไร แค่ครั้งหน้าจะเห็นโครงกระดูกก่อน */
  }
}

let inflight: Promise<MyOrders> | null = null;
let cached: { at: number; value: MyOrders } | null = null;
/** บัญชีที่กำลังใช้อยู่ — ไว้เขียนสำเนาลงเครื่องให้ถูกคน */
let owner: string | null = null;

/** บอกว่าตอนนี้เป็นบัญชีไหน (หน้าเรียกตอนรู้ตัวตนแล้ว) */
export function setOrdersOwner(cid: string) {
  owner = cid;
}

async function load(): Promise<MyOrders> {
  const token = await getAccessToken();
  const res = await fetch("/api/orders/mine", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  }).catch(() => null);
  const j: Partial<MyOrders> = res ? await res.json().catch(() => ({})) : {};
  const value: MyOrders = { orders: j.orders ?? [], needsSetup: j.needsSetup };
  cached = { at: Date.now(), value };
  // เก็บสำเนาไว้เฉพาะตอนได้ของจริง (401/เน็ตหลุด → j.orders ไม่มี → ไม่ทับของเดิม)
  if (owner && j.orders) writeStoredOrders(owner, value.orders);
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
  owner = null;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ข้าม */
  }
}
