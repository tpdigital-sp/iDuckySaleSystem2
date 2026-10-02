/**
 * 🗂 รายงานงานค้าง โอนแล้ว→กำลังผลิต — ชนิดข้อมูลที่ "ตัดแล้ว" ใช้ร่วมกันระหว่าง API (/api/admin/orders/wip) กับหน้า /admin/reports/wip
 *
 * ทำไมไม่ส่ง Order ทั้งก้อน: ฝ่ายผลิต (สิทธิ์ wip.view) ต้องเห็นแค่ เลขที่/ชื่อ/รายการ/วันส่ง/สถานะ
 * ห้ามเห็นเบอร์ ที่อยู่ สลิป LINE ยอดเงิน — จึงกำหนดฟิลด์เป็น allowlist ที่นี่ แล้วให้เซิร์ฟเวอร์เติม
 * `phone`/`total` เฉพาะคนที่มีสิทธิ์ (orders.view / orders.money)
 *
 * ⚠️ เพิ่มฟิลด์ที่นี่ = เพิ่มสิ่งที่ฝ่ายผลิตเห็น — คิดก่อนว่าเขาต้องใช้จริงไหม
 */
import type { OrderStatus } from "./admin-data";

export interface WipItem {
  productId: string;
  name: string;
  qty: number;
  selections?: string;
  sel?: Record<string, string>;
  unitYield?: { per: number; piece: string; unit: string };
  /** ลายที่ลูกค้าแนบ (ทั้งหมด) · ด้านหลัง = ส่วนย่อยของ artworkUrls (งานพิมพ์ 2 ด้าน) */
  artworkUrls?: string[];
  artworkBackUrls?: string[];
  /** จำนวนต่อลาย / ขนาดต่อลาย (key = url) */
  artworkQty?: Record<string, number>;
  artworkSize?: Record<string, { w: number; h: number }>;
  /** แบบงานจากกราฟฟิก — รูป + จำนวน/หน่วย/โน้ต (ไม่ส่งผลตรวจนับแพ็ค) */
  proofs?: { url: string; qty?: number; unit?: string; note?: string; review?: "อนุมัติ" | "ขอแก้ไข" }[];
  proofStatus?: "รอตรวจ" | "อนุมัติ" | "ขอแก้ไข";
  /** รายการนี้ไม่ต้องทำแบบ (ค่าบริการ/ยอดเพิ่ม) */
  noProof?: boolean;
}

export interface WipOrder {
  id: string;
  customer: string;
  /** "30 ก.ย. 2569 14:15" (ฟอร์แมตเดียวกับ Order.date) */
  date: string;
  status: OrderStatus;
  /** ใบที่เด้งกลับ "รอชำระเงิน" เพราะค้างส่วนต่าง — ขั้นงานจริงที่จำไว้ */
  reopenedFrom?: OrderStatus;
  shipping?: string;
  shippingLabel?: string;
  shipDate?: { from?: string; to?: string };
  useByDate?: string;
  rush?: boolean;
  printedAt?: string;
  readyToShip?: { by: string; at: string };
  deposit?: { firstPaidAt?: string; settledAt?: string };
  needsPurchase?: { arrivedAt?: string; note?: string };
  items: WipItem[];
  /** เฉพาะคนมีสิทธิ์ orders.view */
  phone?: string;
  /** ยอดรวมใบ — เฉพาะคนมีสิทธิ์ orders.money */
  total?: number;
}

export interface WipResponse {
  ok: boolean;
  error?: string;
  /** เวลาที่เซิร์ฟเวอร์ตอบ (ISO) */
  at?: string;
  /** ผู้เรียกเห็นเบอร์/ลิงก์ออเดอร์ได้ไหม (orders.view) */
  full?: boolean;
  /** ผู้เรียกเห็นยอดเงินได้ไหม (orders.money) */
  money?: boolean;
  /** ผู้เรียกติ๊ก "งานเสร็จพร้อมส่ง" ได้ไหม */
  mayTick?: boolean;
  orders: WipOrder[];
}

/** สถานะที่รายงานนี้ครอบ — เรียงตามลำดับงาน (เงินเข้า → แบบ → ผลิต) */
export const WIP_STATUSES: OrderStatus[] = ["ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ", "กำลังผลิต"];

/** ขั้นงานจริงของใบ — ใบที่เด้งกลับรอชำระเงินเพราะค้างส่วนต่าง ยังนับตามขั้นที่จำไว้ (ตรงกับ queueStageOf) */
export function wipStageOf(o: Pick<WipOrder, "status" | "reopenedFrom">): OrderStatus {
  // รอตรวจสอบ + reopenedFrom = สลิปงวดหลัง/ใบเพิ่มรอคนตรวจ งานยังเดินอยู่ขั้นเดิม (parkForSlipReview)
  return (o.status === "รอชำระเงิน" || o.status === "รอตรวจสอบ") && o.reopenedFrom ? o.reopenedFrom : o.status;
}

/** ใบนี้อยู่ในรายงานไหม (ไม่รวมยกเลิก) */
export function isWipOrder(o: Pick<WipOrder, "status" | "reopenedFrom">): boolean {
  return o.status !== "ยกเลิก" && WIP_STATUSES.includes(wipStageOf(o));
}

/** ป้ายสถานะที่ควรโชว์ — ใบมัดจำที่เพิ่งรับงวดแรกต้องเห็นว่าเงินเข้าแค่ครึ่ง (ตรงกับ orderStatusLabel) */
export function wipStatusLabel(o: Pick<WipOrder, "status" | "deposit">): string {
  if (o.status === "ชำระแล้ว" && o.deposit?.firstPaidAt) return o.deposit.settledAt ? "ชำระแล้ว 50% หลัง" : "ชำระแล้ว 50% แรก";
  return o.status;
}
