/**
 * ใบเสนอราคา — แยกจากออเดอร์จริง
 *
 * ทำไมต้องแยก: แอดมินเสนอราคาให้ลูกค้ารายเดียวหลายใบ (หลายแบบ/หลายงบ) แต่ลูกค้าเลือกแค่ใบเดียว
 * ถ้าเก็บเป็น "ออเดอร์" ทุกใบ คิวกราฟฟิกจะเต็มไปด้วยงานที่ลูกค้ายังไม่ตกลง → ทำแบบผิดใบ
 * ใบเสนอราคาจึงอยู่คนละตาราง ไม่เข้าคิวงาน ไม่นับยอดขาย จนกว่าลูกค้าจะตกลง แล้วค่อยแปลงเป็นออเดอร์
 */
import type { LogEntry, OrderItem } from "./admin-data";

export type QuoteStatus = "ร่าง" | "ส่งให้ลูกค้าแล้ว" | "ลูกค้าตกลง" | "ไม่รับ" | "หมดอายุ";

export const QUOTE_STATUSES: QuoteStatus[] = ["ร่าง", "ส่งให้ลูกค้าแล้ว", "ลูกค้าตกลง", "ไม่รับ", "หมดอายุ"];

export const QUOTE_STYLES: Record<QuoteStatus, string> = {
  ร่าง: "bg-slate-100 text-slate-600 ring-slate-200",
  ส่งให้ลูกค้าแล้ว: "bg-sky-50 text-sky-700 ring-sky-200",
  ลูกค้าตกลง: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ไม่รับ: "bg-rose-50 text-rose-700 ring-rose-200",
  หมดอายุ: "bg-amber-50 text-amber-700 ring-amber-200",
};

export interface Quote {
  id: string;
  /** ลิงก์ลูกค้า (ต้องมี key ถึงเปิดได้) */
  key: string;
  customer: string;
  phone: string;
  address?: string;
  email?: string;
  /** วันที่ออกใบ (ข้อความไทยเหมือนออเดอร์) */
  date: string;
  items: OrderItem[];
  shippingCost: number;
  /** ส่วนลดท้ายบิล (บาท) */
  discount?: number;
  discountNote?: string;
  /** เงื่อนไข/หมายเหตุที่จะพิมพ์บนใบเสนอราคา */
  note?: string;
  status: QuoteStatus;
  /** ใบนี้ยืนราคาถึงเมื่อไร (ISO) — เลยแล้วขึ้น "หมดอายุ" */
  expiresAt?: string;
  /** ตกลงแล้วกลายเป็นออเดอร์ไหน */
  orderId?: string;
  /** เหตุผลที่ลูกค้าไม่รับ (ไว้ดูสถิติว่าแพ้เพราะอะไร) */
  declineReason?: string;
  createdBy?: string;
  log?: LogEntry[];
}

/** ยอดรวมของใบเสนอราคา (สินค้า + ค่าส่ง − ส่วนลด) */
export function quoteTotal(q: Quote): number {
  const sub = q.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  return Math.max(0, sub + (q.shippingCost || 0) - (q.discount || 0));
}

/** ใบนี้หมดอายุแล้วหรือยัง (นับเฉพาะใบที่ยังรอลูกค้าตอบ) */
export function quoteExpired(q: Quote): boolean {
  if (q.status === "ลูกค้าตกลง" || q.status === "ไม่รับ") return false;
  if (!q.expiresAt) return false;
  return new Date(q.expiresAt).getTime() < Date.now();
}

/** สถานะที่ควรแสดงจริง (คิดเรื่องหมดอายุให้ด้วย) */
export function quoteStatusOf(q: Quote): QuoteStatus {
  return quoteExpired(q) ? "หมดอายุ" : q.status;
}

/** เหลืออีกกี่วันถึงหมดอายุ (null = ไม่ได้ตั้ง) */
export function daysToExpire(q: Quote): number | null {
  if (!q.expiresAt) return null;
  const ms = new Date(q.expiresAt).getTime() - Date.now();
  return Math.ceil(ms / 86400_000);
}

/** ต่อท้ายประวัติ (รูปแบบเดียวกับออเดอร์) */
export function withQuoteLog(q: Quote, by: string, action: string, detail?: string): Quote {
  const entry: LogEntry = { at: new Date().toISOString(), by, action, ...(detail ? { detail } : {}) };
  return { ...q, log: [...(q.log ?? []), entry] };
}
