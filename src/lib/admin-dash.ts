/**
 * ตัวเลขสำหรับหน้าภาพรวมหลังบ้าน (/admin)
 * แยกออกมาเป็นฟังก์ชันล้วน ๆ เพื่อให้หน้าจอโง่ ๆ แค่วาดผล และทดสอบตัวเลขได้โดยไม่ต้องเปิดเว็บ
 *
 * ⚠️ วันที่ของออเดอร์เก็บเป็นข้อความไทย "20 ก.ค. 2569 14:22" (ดู api/admin/orders)
 *    ไม่ใช่ ISO — จึงต้องแกะเองก่อนเอาไปเทียบวัน
 */

import {
  amountDueNow,
  daysToUseBy,
  orderTotal,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "20 ก.ค. 2569 14:22" → Date (คืน null ถ้าแกะไม่ได้ เช่นออเดอร์เก่ารูปแบบอื่น) */
export function parseThaiDate(s?: string): Date | null {
  if (!s) return null;
  const p = s.replace(/,/g, " ").trim().split(/\s+/);
  const day = Number(p[0]);
  const month = TH_MONTHS.indexOf(p[1]);
  const year = Number(p[2]);
  if (!day || month < 0 || !year) return null;
  const [h, m] = (p[3] ?? "00:00").split(":").map(Number);
  return new Date(year - 543, month, day, h || 0, m || 0);
}

/** คีย์ระดับวัน (YYYY-MM-DD) — ใช้จับกลุ่มออเดอร์ต่อวัน */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** งานที่ "รอมือเรา" (ไม่ใช่รอลูกค้า) — ตัวเลขชุดนี้คือเหตุผลเดียวที่คนเปิดหน้านี้ */
export const NEEDS_US: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "อนุมัติแบบ", "แก้ไขแบบ"];
/** สถานะที่ถือว่างานจบแล้ว — ต้องเงียบกว่างานค้างเสมอ */
export const CLOSED: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];
/** ออเดอร์ที่ของยังต้องผลิต/แพ็ค */
const MAKING: OrderStatus[] = ["ชำระแล้ว", "อนุมัติแบบ", "กำลังผลิต"];

/** ออเดอร์มัดจำที่ยังเก็บเงินไม่ครบ — ต้องตามเก็บก่อนส่งของ */
const isDue = (o: Order) => !!o.deposit && !o.deposit.settledAt && o.status !== "ยกเลิก";
/** งานที่เลยวันใช้งานแล้ว หรือถึงกำหนดวันนี้ และยังไม่ได้ส่ง */
const isLate = (o: Order) => {
  if (CLOSED.includes(o.status)) return false;
  const d = daysToUseBy(o);
  return d !== null && d <= 0;
};

export interface DayPoint {
  key: string;
  /** ป้ายวันแบบสั้น "จ." "อ." … */
  label: string;
  total: number;
  isToday: boolean;
}

export interface DashMetrics {
  /** จำนวนงานที่รอมือเราทั้งหมด (ตัวเลขพาดหัวของบอร์ด) */
  needUs: number;
  /** ออเดอร์ที่ยังไม่ปิด — ตัวเทียบให้ needUs ว่าคิดเป็นสัดส่วนเท่าไหร่ */
  openTotal: number;
  countBy: Record<OrderStatus, number>;
  /** ตรวจสลิป / เริ่มผลิตได้ / แบบต้องแก้ / รอส่งของ */
  toCheckSlip: number;
  toStart: number;
  toFixProof: number;
  making: number;
  /** งานเร่ง + เลยกำหนด (นับใบไม่ซ้ำ) */
  urgent: number;
  late: number;
  rush: number;
  /** มัดจำค้าง */
  dueCount: number;
  dueAmount: number;
  /** ยอดขาย */
  salesToday: number;
  salesYesterday: number;
  avg7: number;
  series: DayPoint[];
  /** ใบที่รับเข้าวันนี้ / เมื่อวาน */
  newToday: number;
  newYesterday: number;
  /** ของที่ต้องทำ รวมจำนวนตามชื่อรายการ (มากไปน้อย) */
  workload: { name: string; qty: number; orders: number }[];
  /** ออเดอร์เรียงใหม่→เก่า พร้อมวันที่ที่แกะแล้ว */
  recent: Order[];
  /** ใบที่รอมือเรา เรียงเก่า→ใหม่ (ค้างนานสุดขึ้นก่อน) */
  queue: Order[];
}

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export function computeDash(orders: Order[], now: Date = new Date()): DashMetrics {
  const alive = orders.filter((o) => o.status !== "ยกเลิก");
  const open = orders.filter((o) => !CLOSED.includes(o.status));

  const countBy = {} as Record<OrderStatus, number>;
  for (const o of orders) countBy[o.status] = (countBy[o.status] ?? 0) + 1;

  // ── ยอดขาย 7 วันล่าสุด (รวมวันนี้) ──
  const byDay = new Map<string, number>();
  const newByDay = new Map<string, number>();
  for (const o of alive) {
    const d = parseThaiDate(o.date);
    if (!d) continue;
    const k = dayKey(d);
    byDay.set(k, (byDay.get(k) ?? 0) + orderTotal(o));
    newByDay.set(k, (newByDay.get(k) ?? 0) + 1);
  }
  const series: DayPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(d);
    series.push({ key: k, label: DOW[d.getDay()], total: byDay.get(k) ?? 0, isToday: i === 0 });
  }
  const todayKey = series[6].key;
  const yesterdayKey = series[5].key;
  const avg7 = Math.round(series.reduce((s, p) => s + p.total, 0) / 7);

  // ── ของที่ต้องผลิต รวมตามชื่อรายการ ──
  const load = new Map<string, { qty: number; orders: number }>();
  for (const o of orders.filter((x) => MAKING.includes(x.status))) {
    const seen = new Set<string>();
    for (const it of o.items) {
      const cur = load.get(it.name) ?? { qty: 0, orders: 0 };
      cur.qty += it.qty;
      if (!seen.has(it.name)) {
        cur.orders += 1;
        seen.add(it.name);
      }
      load.set(it.name, cur);
    }
  }

  const sortByDate = (a: Order, b: Order, dir: 1 | -1) => {
    const ta = parseThaiDate(a.date)?.getTime() ?? 0;
    const tb = parseThaiDate(b.date)?.getTime() ?? 0;
    return (tb - ta) * dir;
  };

  const lateList = open.filter(isLate);
  const rushList = open.filter((o) => o.rush);
  const urgentIds = new Set([...lateList, ...rushList].map((o) => o.id));

  return {
    needUs: orders.filter((o) => NEEDS_US.includes(o.status)).length,
    openTotal: open.length,
    countBy,
    toCheckSlip: countBy["รอตรวจสอบ"] ?? 0,
    toStart: (countBy["ชำระแล้ว"] ?? 0) + (countBy["อนุมัติแบบ"] ?? 0),
    toFixProof: countBy["แก้ไขแบบ"] ?? 0,
    making: countBy["กำลังผลิต"] ?? 0,
    urgent: urgentIds.size,
    late: lateList.length,
    rush: rushList.length,
    dueCount: alive.filter(isDue).length,
    dueAmount: alive.filter(isDue).reduce((s, o) => s + amountDueNow(o), 0),
    salesToday: byDay.get(todayKey) ?? 0,
    salesYesterday: byDay.get(yesterdayKey) ?? 0,
    avg7,
    series,
    newToday: newByDay.get(todayKey) ?? 0,
    newYesterday: newByDay.get(yesterdayKey) ?? 0,
    workload: [...load.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty),
    recent: [...orders].sort((a, b) => sortByDate(a, b, 1)),
    queue: [...orders.filter((o) => NEEDS_US.includes(o.status))].sort((a, b) => sortByDate(a, b, -1)),
  };
}

/** วันที่วันนี้แบบไทยเต็ม "ศ. 22 ส.ค. 2569" — ทีมงานคุยกันด้วย พ.ศ. */
export function thaiToday(now: Date = new Date()): string {
  return now.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
