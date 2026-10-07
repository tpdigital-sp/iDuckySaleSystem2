/**
 * 📈 ตัวเลขสำหรับหน้ารายงานยอดขาย/กำไร (/admin/reports)
 *
 * แยกเป็นฟังก์ชันล้วน ๆ เหมือน admin-dash.ts — เซิร์ฟเวอร์เรียกคำนวณแล้วส่งแต่ผลสรุปให้หน้าจอ
 * (ไม่ส่งออเดอร์ทั้งก้อนข้ามเน็ตไปคิดที่เบราว์เซอร์ — เดือนหนึ่งหลายร้อยใบ เปลืองโควตาเปล่า ๆ)
 *
 * กติกาที่ยึดตลอดไฟล์นี้
 *  · "ยอดขาย" = ใบที่ยังไม่ยกเลิก คิดตามวันที่บนใบ (o.date เวลาไทย) ไม่ใช่วันที่เงินเข้า
 *  · ทุกตัวเลขต้องมีตัวเทียบ → คิดช่วงก่อนหน้าที่ยาวเท่ากันมาคู่กันเสมอ
 *  · ต้นทุนมาจาก ledger สต๊อกเท่านั้น และ "ไม่ครบทุกใบ" → กำไรต้องคิดเฉพาะใบที่รู้ต้นทุนจริง
 *    ห้ามเอาต้นทุนบางใบไปลบยอดขายทั้งหมด (กำไรจะดูดีเกินจริง)
 */

import {
  adminDiscountAmount,
  itemDiscountAmount,
  orderChargesTotal,
  orderDiscountTotal,
  orderEarlyPayAmount,
  orderItemDiscounts,
  orderSubtotal,
  orderTotal,
  orderVatAmount,
  isPaidStatus,
  paidSoFar,
  type Order,
} from "./admin-data";
import { dayKey, parseThaiDate } from "./admin-dash";
import { bkkParts } from "./bangkok-time";
import { quoteStatusOf, quoteTotal, type Quote } from "./quotes";

/** ยาวเกินกี่วันถึงสรุปเป็นรายเดือนแทนรายวัน (2 เดือนเต็มยังอ่านเป็นแท่งรายวันไหว) */
const MONTHLY_OVER_DAYS = 62;

export interface ReportTotals {
  /** จำนวนใบที่นับเป็นยอดขาย (ไม่รวมใบยกเลิก) */
  orders: number;
  /** ยอดรวมทั้งบิลตามที่ลูกค้าต้องจ่าย (รวมค่าส่ง/VAT/ค่าบริการ − ส่วนลดทุกชั้น) */
  revenue: number;
  /** ยอดสินค้าก่อนส่วนลด */
  goods: number;
  shipping: number;
  vat: number;
  /** ค่าบริการเพิ่มที่เก็บทีหลัง (ค่าตัดภาพ/ค่าเร่งงาน) */
  charges: number;
  /** ส่วนลดแยกชั้น — เอาไว้ดูว่าเงินที่ลดไปหายไปทางไหนมากที่สุด */
  discountTier: number;
  discountCoupon: number;
  discountAdmin: number;
  discountEarlyPay: number;
  discountTotal: number;
  /** เงินที่เก็บได้จริงแล้วของใบในช่วงนี้ */
  paid: number;
  /** ยอดที่ยังเก็บไม่ได้ของใบในช่วงนี้ (รวมทั้งใบที่ยังไม่โอนเลย และงวดหลังของใบมัดจำ) */
  outstanding: number;
  /** 💰 ใบที่ชำระเงินแล้ว (ดู isPaidOrder) — การ์ดหัวหน้ารายงานใช้ชุดนี้ ไม่ใช่ทุกใบ (เจ้าของร้านขอ 7 ต.ค. 69) */
  paidOrders: number;
  /** ยอดรวมทั้งบิลของใบที่ชำระเงินแล้ว */
  paidRevenue: number;
  /** ส่วนที่ใบชำระแล้วยังค้างอยู่ (งวดหลังของใบมัดจำ / ยอดโตหลังโอน) */
  paidOutstanding: number;
  /** ใบที่ลูกค้ายังไม่ชำระเงินเลย (รอชำระ/รอตรวจสอบ ไม่มียอดยืนยัน) */
  unpaidOrders: number;
  unpaidValue: number;
  /** ใบที่ถูกยกเลิกในช่วงนี้ (ไม่นับเป็นยอดขาย แต่ต้องรู้ว่าหลุดมือไปเท่าไหร่) */
  cancelled: number;
  cancelledValue: number;
  /** ฐานคิดกำไร = สินค้า + ค่าบริการ − ส่วนลดทุกชั้น (ไม่รวมค่าส่งและ VAT ซึ่งไม่ใช่ของร้าน) */
  saleBase: number;
  /** ต้นทุนวัสดุที่ตัดจากคลังได้จริง */
  cogs: number;
  /** จำนวนใบที่มีต้นทุนให้คิด */
  costedOrders: number;
  /** ฐานคิดกำไรเฉพาะใบที่รู้ต้นทุน — ตัวหารของ % กำไร */
  costedSaleBase: number;
  /** กำไรขั้นต้นของใบที่รู้ต้นทุน = costedSaleBase − cogs */
  profit: number;
}

export interface ReportPoint {
  key: string;
  /** ป้ายบนแกน — วันที่แบบสั้น หรือชื่อเดือน */
  label: string;
  revenue: number;
  orders: number;
}

/** 1 แถวในตารางอันดับ (สินค้า / ลูกค้า / ช่องทาง) */
export interface ReportRow {
  key: string;
  label: string;
  /** บรรทัดรองใต้ชื่อ (เบอร์โทร / วันที่ซื้อล่าสุด) */
  sub?: string;
  qty: number;
  orders: number;
  revenue: number;
  /** ต้นทุนที่คิดได้ของแถวนี้ (undefined = ไม่มีข้อมูลต้นทุนเลย) */
  cost?: number;
  /** ยอดขายเฉพาะส่วนที่รู้ต้นทุน — ใช้คิด % กำไรของแถวให้ตรงฐาน */
  costedRevenue?: number;
}

export interface QuoteStats {
  /** ใบที่ส่งให้ลูกค้าแล้ว (ไม่นับฉบับร่าง) */
  issued: number;
  accepted: number;
  declined: number;
  expired: number;
  /** ยังรอลูกค้าตอบ */
  pending: number;
  acceptedValue: number;
  /** มูลค่าใบที่ลูกค้าไม่รับ/ปล่อยหมดอายุ */
  lostValue: number;
  /** ปิดได้กี่ % ของใบที่ตอบกลับมาแล้ว (null = ยังไม่มีใบที่ตอบ) */
  rate: number | null;
}

export interface ReportData {
  from: string;
  to: string;
  days: number;
  /** ช่วงก่อนหน้าที่ยาวเท่ากัน — ตัวเทียบของทุกตัวเลข */
  prevFrom: string;
  prevTo: string;
  totals: ReportTotals;
  prev: ReportTotals;
  seriesUnit: "day" | "month";
  series: ReportPoint[];
  /** ตารางอันดับ 3 ชุดนี้นับเฉพาะใบที่เงินเข้าแล้ว (ดู isPaidOrder) */
  products: ReportRow[];
  customers: ReportRow[];
  channels: ReportRow[];
  quotes: QuoteStats;
  /** ใบที่หาต้นทุนไม่ได้เลย — หน้าจอต้องบอกตรง ๆ ว่ากำไรคิดจากแค่ส่วนหนึ่ง */
  costGap: { orders: number; revenue: number };
  /** จำนวนจริงทั้งหมด (ตารางอันดับตัดมาโชว์แค่ส่วนบน — ห้ามโชว์ความยาวตารางเป็นจำนวนลูกค้า) */
  totalProducts: number;
  totalCustomers: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

/** วันที่บนใบ (ข้อความไทย) → คีย์ YYYY-MM-DD · null = ใบเก่าที่แกะวันไม่ได้ */
export function orderDayKey(o: { date?: string }): string | null {
  const d = parseThaiDate(o.date);
  return d ? dayKey(d) : null;
}

/** อยู่ในช่วง from..to ไหม (เทียบเป็นข้อความ YYYY-MM-DD — ไม่ต้องยุ่งกับโซนเวลาเลย) */
const inRange = (key: string | null, from: string, to: string) => !!key && key >= from && key <= to;

/** เวลา ISO (UTC) → คีย์วันตามเวลาไทย — paidAt ถูกประทับเป็น ISO ที่เซิร์ฟเวอร์ (Netlify = UTC) */
function isoDayKeyBkk(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = bkkParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/**
 * 📅 วันที่ใช้จัดกลุ่มใบในรายงาน (เจ้าของร้านกำหนด 7 ต.ค. 69)
 *  · ใบที่ชำระแล้ว = วันที่เข้าขั้นชำระแล้ว (paidAt) — ใบ ก.ย. ที่โอน ต.ค. ต้องเป็นยอด ต.ค. ไม่ใช่ ก.ย.
 *  · ใบที่ยังไม่ชำระ/ยกเลิก = วันที่บนใบ (ยังไม่มีวันเงินเข้า)
 *  · ใบชำระแล้วที่ไม่มี paidAt (ใบเก่าก่อน backfill) ถอยไปใช้วันที่บนใบ — ห้ามหายจากรายงาน
 */
export function reportDayKey(o: Order): string | null {
  if (isPaidOrder(o) && o.paidAt) return isoDayKeyBkk(o.paidAt) ?? orderDayKey(o);
  return orderDayKey(o);
}

/** ใบนี้อยู่ในช่วงรายงาน from..to ไหม (ตามกติกา reportDayKey) — สคริปต์ตรวจใช้ตัวเดียวกับเซิร์ฟเวอร์ */
export const inReportWindow = (o: Order, from: string, to: string) => inRange(reportDayKey(o), from, to);

/** จำนวนวันในช่วง (รวมวันเริ่มและวันจบ) */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/** เลื่อนวัน (บวก/ลบ) บนคีย์ YYYY-MM-DD */
export function shiftDay(key: string, days: number): string {
  const t = Date.parse(`${key}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** ช่วงก่อนหน้าที่ยาวเท่ากัน (ต่อท้ายกันพอดี ไม่ทับกัน) */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const n = daysBetween(from, to);
  return { from: shiftDay(from, -n), to: shiftDay(from, -1) };
}

const emptyTotals = (): ReportTotals => ({
  orders: 0,
  revenue: 0,
  goods: 0,
  shipping: 0,
  vat: 0,
  charges: 0,
  discountTier: 0,
  discountCoupon: 0,
  discountAdmin: 0,
  discountEarlyPay: 0,
  discountTotal: 0,
  paid: 0,
  outstanding: 0,
  paidOrders: 0,
  paidRevenue: 0,
  paidOutstanding: 0,
  unpaidOrders: 0,
  unpaidValue: 0,
  cancelled: 0,
  cancelledValue: 0,
  saleBase: 0,
  cogs: 0,
  costedOrders: 0,
  costedSaleBase: 0,
  profit: 0,
});

/** ฐานคิดกำไรของใบเดียว — สินค้า + ค่าบริการ − ส่วนลดทุกชั้น (ไม่รวมค่าส่ง/VAT) */
export function orderSaleBase(o: Order): number {
  return money(Math.max(0, orderSubtotal(o) + orderChargesTotal(o) - orderDiscountTotal(o)));
}

/** รวมตัวเลขของกองออเดอร์ (ต้องกรองช่วงวันมาแล้ว) · costs = ต้นทุนต่อใบจาก ledger สต๊อก */
export function sumTotals(orders: Order[], costs?: Map<string, number>): ReportTotals {
  const t = emptyTotals();
  for (const o of orders) {
    if (o.status === "ยกเลิก") {
      t.cancelled += 1;
      t.cancelledValue += orderTotal(o);
      continue;
    }
    const total = orderTotal(o);
    const paid = paidSoFar(o);
    t.orders += 1;
    t.revenue += total;
    t.goods += orderSubtotal(o);
    t.shipping += o.shippingCost ?? 0;
    t.vat += orderVatAmount(o);
    t.charges += orderChargesTotal(o);
    // ส่วนลดก้อน discount ใช้ช่องเดียวกันทั้งคูปองและระดับสมาชิก — แยกด้วยว่ามีรหัสคูปองไหม
    const d = o.discount;
    if (d?.amount) {
      if (d.couponCode) t.discountCoupon += d.amount;
      else t.discountTier += d.amount;
    }
    t.discountAdmin += adminDiscountAmount(o) + orderItemDiscounts(o);
    t.discountEarlyPay += orderEarlyPayAmount(o);
    t.paid += paid;
    t.outstanding += Math.max(0, total - paid);
    if (isPaidOrder(o)) {
      t.paidOrders += 1;
      t.paidRevenue += total;
      t.paidOutstanding += Math.max(0, total - paid);
    } else {
      t.unpaidOrders += 1;
      t.unpaidValue += total;
    }

    const base = orderSaleBase(o);
    t.saleBase += base;
    const cost = costs?.get(o.id);
    if (cost != null && cost > 0) {
      t.cogs += cost;
      t.costedOrders += 1;
      t.costedSaleBase += base;
    }
  }
  t.discountTotal = t.discountTier + t.discountCoupon + t.discountAdmin + t.discountEarlyPay;
  t.profit = t.costedSaleBase - t.cogs;
  for (const k of Object.keys(t) as (keyof ReportTotals)[]) t[k] = money(t[k]);
  return t;
}

const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** ป้ายแกนนอน — "5 ก.ย." สำหรับรายวัน · "ก.ย. 69" สำหรับรายเดือน */
function pointLabel(key: string, unit: "day" | "month"): string {
  const [y, m, d] = key.split("-").map(Number);
  const month = TH_MONTH_SHORT[(m || 1) - 1] ?? "";
  if (unit === "month") return `${month} ${String((y || 0) + 543).slice(-2)}`;
  return `${d} ${month}`;
}

/**
 * กราฟยอดชำระเงินตามช่วงเวลา — เฉพาะใบที่ชำระแล้ว นับตามวันที่เงินเข้า (reportDayKey) ให้ตรงกับการ์ดหัว
 * เติมวัน/เดือนที่ไม่มีเงินเข้าเป็น 0 ด้วย ไม่งั้นกราฟโกหกว่าไม่มีวันเงียบ
 */
export function buildSeries(
  orders: Order[],
  from: string,
  to: string
): { unit: "day" | "month"; points: ReportPoint[] } {
  const unit: "day" | "month" = daysBetween(from, to) > MONTHLY_OVER_DAYS ? "month" : "day";
  const bucket = (key: string) => (unit === "month" ? key.slice(0, 7) : key);
  const acc = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    if (!isPaidOrder(o)) continue;
    const key = reportDayKey(o);
    if (!key) continue;
    const b = bucket(key);
    const cur = acc.get(b) ?? { revenue: 0, orders: 0 };
    cur.revenue += orderTotal(o);
    cur.orders += 1;
    acc.set(b, cur);
  }
  const points: ReportPoint[] = [];
  if (unit === "day") {
    for (let k = from; k <= to; k = shiftDay(k, 1)) {
      const v = acc.get(k);
      points.push({ key: k, label: pointLabel(k, "day"), revenue: money(v?.revenue ?? 0), orders: v?.orders ?? 0 });
    }
  } else {
    let k = `${from.slice(0, 7)}-01`;
    const last = `${to.slice(0, 7)}-01`;
    while (k <= last) {
      const b = k.slice(0, 7);
      const v = acc.get(b);
      points.push({ key: b, label: pointLabel(`${b}-01`, "month"), revenue: money(v?.revenue ?? 0), orders: v?.orders ?? 0 });
      const [y, m] = b.split("-").map(Number);
      k = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
  }
  return { unit, points };
}

/**
 * ⚠️ รหัสที่ "ไม่ใช่สินค้าจริง" — ห้ามเอามารวมเป็นสินค้าตัวเดียวกัน
 *  · special-item = ของสั่งพิเศษที่แอดมินพิมพ์เอง (Magsafe Wallet, Cable Care, Arm patch … ใช้รหัสนี้หมด)
 *  · id ที่มี "#" = รายการพ่วงที่ระบบสร้างเอง (เช่น <สินค้า>#designfee ค่าคละลาย)
 * รวมตามรหัสพวกนี้จะได้แถวปลอมก้อนโต แล้วติดชื่อของใบสุดท้ายที่เจอ (เจอจริงตอนตรวจ 15 ก.ย. 69:
 * "แผ่นหินรองแก้ว ฿874,507" ซึ่งที่จริงคือของสั่งพิเศษ 10 กว่าชนิดรวมกัน) → กลุ่มพวกนี้ให้ยึด "ชื่อรายการ" แทน
 */
export function isRealProductId(id: string | undefined): boolean {
  return !!id && id !== "special-item" && !id.includes("#");
}

/**
 * 🏷️ ชื่อสินค้าแบบ "ไม่ติดสเปค" — ของสั่งพิเศษทุกตัวใช้รหัส special-item ร่วมกัน จึงต้องยึดชื่อ
 * แต่แอดมินพิมพ์ชื่อติดสเปคต่อท้าย ("กระดาษอาร์ตมัน 300 แกรม // ไดคัทตามทรง (มุมมน)" vs "// ตัดตามขนาด")
 * → สินค้าเดียวกันแตกเป็นหลายแถว แถวละ 1 ใบ (เจ้าของร้านทัก 7 ต.ค. 69 "แสดงต่อออเดอร์ ไม่ได้รวม")
 * ตัดส่วนหลัง "//" และเครื่องหมายเน้น ** ทิ้ง · วงเล็บไม่ตัด เพราะบางทีคือชื่อรุ่นจริง ("Card Holder (ไม่รับสาย)")
 */
export function productBaseName(name: string | undefined): string {
  return (name ?? "")
    .split("//")[0]
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * คีย์จัดกลุ่มสินค้า — รหัสจริงยึดรหัส (ชื่อบนใบแก้ได้) · ของสั่งพิเศษยึดชื่อแบบไม่ติดสเปค ไม่สนตัวพิมพ์เล็ก/ใหญ่
 * null = รายการพ่วงที่ระบบสร้างเอง (<สินค้า>#designfee ค่าคละลาย ฯลฯ) ไม่ใช่สินค้า ไม่ขึ้นอันดับ (ยอดยังอยู่ในยอดรวม)
 */
export function productGroupKey(it: Order["items"][number]): string | null {
  if (isRealProductId(it.productId)) return it.productId;
  if (it.productId?.includes("#")) return null;
  const base = productBaseName(it.name) || it.productId || "(ไม่ระบุ)";
  return `n:${base.toLowerCase()}`;
}

/** ชื่อที่โชว์ของแถว — รหัสจริงใช้ชื่อบนใบตามเดิม · กลุ่มที่ยึดชื่อใช้ชื่อไม่ติดสเปค */
const productLabelOf = (it: Order["items"][number]) => (isRealProductId(it.productId) ? it.name : productBaseName(it.name) || it.name);

/**
 * 👤 รวมใบของลูกค้าคนเดียวกัน — ใบหนึ่งมี contactId อีกใบไม่มี (สั่งเองไม่ล็อกอิน) แต่เบอร์เดียวกัน
 * เคยคิดคีย์ทีละใบ (contactId || customerId || เบอร์) → คนเดียวกันได้ 2 คีย์ แยกเป็น 2 แถว
 * ตอนนี้ผูกทุกตัวระบุ (ผู้ติดต่อ/บัญชี/เบอร์) ของใบเดียวกันเป็นกลุ่มเดียว (union-find) แล้วค่อยนับ
 * คืน Map<orderId, คีย์กลุ่ม> · เบอร์สั้นกว่า 9 หลัก ("0", "-") ไม่ใช่เบอร์ ห้ามใช้ผูก
 */
export function customerGroups(orders: Order[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    // บีบเส้นทาง
    let c = k;
    while (parent.get(c) !== undefined && parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    if (!parent.has(r)) parent.set(r, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const idsOf = (o: Order): string[] => {
    const digits = (o.phone ?? "").replace(/\D/g, "");
    return [o.contactId && `c:${o.contactId}`, o.customerId && `u:${o.customerId}`, digits.length >= 9 ? `p:${digits}` : ""].filter(Boolean) as string[];
  };
  for (const o of orders) {
    const ids = idsOf(o);
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }
  const out = new Map<string, string>();
  for (const o of orders) {
    const ids = idsOf(o);
    // ไม่มีตัวระบุเลย → ยึดชื่อ (พิมพ์ต่างกันก็คนละแถว ไม่มีทางรู้ดีกว่านี้) · ไม่มีชื่อ → ใบนั้นเป็นแถวของตัวเอง
    out.set(o.id, ids.length ? find(ids[0]) : o.customer?.trim() ? `n:${o.customer.trim()}` : `o:${o.id}`);
  }
  return out;
}

/**
 * สินค้าขายดี — 1 แถว = 1 สินค้า (ยึด productId เพราะชื่อบนใบแก้ได้ · ของสั่งพิเศษยึดชื่อ ดู isRealProductId)
 * ยอดของแถว = ราคาบรรทัดหลังหักส่วนลดรายรายการ (ยังไม่หักส่วนลดท้ายบิล — เฉลี่ยลงรายบรรทัดไม่ได้อย่างซื่อสัตย์)
 */
export function topProducts(orders: Order[], costs?: Map<string, number>, limit = 12): ReportRow[] {
  const acc = new Map<string, ReportRow & { costed: number; names: Map<string, number> }>();
  for (const o of orders) {
    if (o.status === "ยกเลิก") continue;
    const orderCost = costs?.get(o.id);
    const base = orderSaleBase(o);
    const seen = new Set<string>();
    for (const it of o.items) {
      const key = productGroupKey(it);
      if (!key) continue;
      const label = productLabelOf(it);
      const row = acc.get(key) ?? { key, label, qty: 0, orders: 0, revenue: 0, cost: 0, costedRevenue: 0, costed: 0, names: new Map() };
      const line = money(it.qty * it.unitPrice - itemDiscountAmount(it));
      // ชื่อที่โชว์ = ชื่อที่ทำยอดได้มากสุดของรหัสนี้ (ไม่ใช่ชื่อของใบล่าสุด ซึ่งสุ่มตามลำดับข้อมูล)
      if (label) row.names.set(label, (row.names.get(label) ?? 0) + line);
      row.qty += it.qty;
      row.revenue += line;
      if (!seen.has(key)) {
        row.orders += 1;
        seen.add(key);
      }
      // ต้นทุนเก็บเป็นก้อนต่อใบ ไม่ได้แยกรายบรรทัด → เฉลี่ยตามสัดส่วนยอดของบรรทัดในใบนั้น
      if (orderCost != null && orderCost > 0 && base > 0) {
        row.cost = (row.cost ?? 0) + money((orderCost * line) / base);
        row.costedRevenue = (row.costedRevenue ?? 0) + line;
        row.costed += 1;
      }
      acc.set(key, row);
    }
  }
  return [...acc.values()]
    .map(({ costed, names, ...r }) => ({
      ...r,
      label: [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? r.label,
      revenue: money(r.revenue),
      cost: costed > 0 ? money(r.cost ?? 0) : undefined,
      costedRevenue: costed > 0 ? money(r.costedRevenue ?? 0) : undefined,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** ลูกค้าที่ซื้อมากสุด — รวมใบของคนเดียวกันด้วยผู้ติดต่อ/บัญชี/เบอร์โทร (ชื่อสะกดต่างกันได้) */
export function topCustomers(orders: Order[], limit = 12): ReportRow[] {
  const acc = new Map<string, ReportRow & { last: string }>();
  const groups = customerGroups(orders.filter((o) => o.status !== "ยกเลิก"));
  for (const o of orders) {
    if (o.status === "ยกเลิก") continue;
    const digits = (o.phone ?? "").replace(/\D/g, "");
    // เบอร์ที่กรอกไว้มั่ว ๆ ("0", "-") ไม่ใช่เบอร์ — ห้ามโชว์ใต้ชื่อ
    const phone = digits.length >= 9 ? o.phone : "";
    const key = groups.get(o.id) ?? o.id;
    const row = acc.get(key) ?? { key, label: o.customer || "(ไม่ระบุชื่อ)", sub: phone, qty: 0, orders: 0, revenue: 0, last: "" };
    row.orders += 1;
    row.qty += o.items.reduce((s, i) => s + i.qty, 0);
    row.revenue += orderTotal(o);
    const k = reportDayKey(o) ?? "";
    if (k > row.last) {
      row.last = k;
      row.label = o.customer || row.label;
      row.sub = phone || row.sub;
    }
    acc.set(key, row);
  }
  return [...acc.values()]
    .map(({ last, ...r }) => ({ ...r, revenue: money(r.revenue), sub: [r.sub, last ? `ล่าสุด ${pointLabel(last, "day")}` : ""].filter(Boolean).join(" · ") }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** ออเดอร์ใบนี้มาทางไหน — ลำดับสำคัญ: ตัวแทน > จากใบเสนอราคา > แอดมินสั่งแทน > ลูกค้าล็อกอิน > ทั่วไป */
export function channelOf(o: Order): string {
  if (o.dealer) return "ตัวแทนจำหน่าย";
  if (o.quoteOf) return "จากใบเสนอราคา";
  if (o.placedBy) return "แอดมินสั่งแทน";
  if (o.customerId) return "ลูกค้าล็อกอินสั่งเอง";
  return "สั่งเองไม่ได้ล็อกอิน";
}

export function byChannel(orders: Order[]): ReportRow[] {
  const acc = new Map<string, ReportRow>();
  for (const o of orders) {
    if (o.status === "ยกเลิก") continue;
    const key = channelOf(o);
    const row = acc.get(key) ?? { key, label: key, qty: 0, orders: 0, revenue: 0 };
    row.orders += 1;
    row.qty += o.items.reduce((s, i) => s + i.qty, 0);
    row.revenue += orderTotal(o);
    acc.set(key, row);
  }
  return [...acc.values()].map((r) => ({ ...r, revenue: money(r.revenue) })).sort((a, b) => b.revenue - a.revenue);
}

/**
 * 💰 ใบนี้ "ชำระเงินแล้ว" ไหม — ดูสถานะอย่างเดียว: ทุกสถานะตั้งแต่ "ชำระแล้ว" ขึ้นไป (ชำระแล้ว→รอตรวจแบบ→…→เสร็จสิ้น)
 * ไม่นับ รอชำระเงิน · รอตรวจสอบ · ยกเลิก (เจ้าของร้านกำหนด 7 ต.ค. 69 — ใบรอตรวจสอบที่นับยอดบางส่วนแล้วก็ยังไม่นับ จนกว่าสถานะจะเปลี่ยน)
 */
export function isPaidOrder(o: Order): boolean {
  return isPaidStatus(o.status);
}

/** อัตราปิดใบเสนอราคา — นับตามวันที่ออกใบ */
export function quoteStats(quotes: Quote[]): QuoteStats {
  const s: QuoteStats = { issued: 0, accepted: 0, declined: 0, expired: 0, pending: 0, acceptedValue: 0, lostValue: 0, rate: null };
  for (const q of quotes) {
    const st = quoteStatusOf(q);
    if (st === "ร่าง") continue;
    s.issued += 1;
    const v = quoteTotal(q);
    if (st === "ลูกค้าตกลง" || st === "สร้างออเดอร์แล้ว") {
      s.accepted += 1;
      s.acceptedValue += v;
    } else if (st === "ไม่รับ") {
      s.declined += 1;
      s.lostValue += v;
    } else if (st === "หมดอายุ") {
      s.expired += 1;
      s.lostValue += v;
    } else {
      s.pending += 1;
    }
  }
  const answered = s.accepted + s.declined + s.expired;
  s.rate = answered > 0 ? Math.round((s.accepted / answered) * 100) : null;
  s.acceptedValue = money(s.acceptedValue);
  s.lostValue = money(s.lostValue);
  return s;
}

/** รวมทุกอย่างของหน้ารายงาน — เซิร์ฟเวอร์เรียกตัวนี้ตัวเดียว */
export function buildReport(input: {
  orders: Order[];
  quotes: Quote[];
  costs: Map<string, number>;
  from: string;
  to: string;
}): ReportData {
  const { from, to, costs } = input;
  const prevR = previousRange(from, to);
  // 📅 ใบชำระแล้วเข้าช่วงตามวันเงินเข้า · ใบยังไม่ชำระ/ยกเลิกตามวันที่บนใบ (ดู reportDayKey)
  const cur = input.orders.filter((o) => inReportWindow(o, from, to));
  const prev = input.orders.filter((o) => inReportWindow(o, prevR.from, prevR.to));
  const quotesCur = input.quotes.filter((q) => inRange(orderDayKey(q), from, to));

  const totals = sumTotals(cur, costs);
  const live = cur.filter((o) => o.status !== "ยกเลิก");
  const { unit, points } = buildSeries(cur, from, to);
  // 💰 ตารางอันดับ (สินค้า/ลูกค้า/ช่องทาง) นับเฉพาะใบที่ชำระเงินแล้ว (เจ้าของร้านขอ 7 ต.ค. 69)
  // ใบที่ยังรอโอนไม่ใช่ยอดที่ได้จริง — ขึ้นอันดับแล้วหลอกว่าขายดี · ยอดรวม/กราฟยังนับทุกใบ (มี paid/outstanding แยกอยู่แล้ว)
  const paidCur = cur.filter(isPaidOrder);

  return {
    from,
    to,
    days: daysBetween(from, to),
    prevFrom: prevR.from,
    prevTo: prevR.to,
    totals,
    prev: sumTotals(prev, costs),
    seriesUnit: unit,
    series: points,
    products: topProducts(paidCur, costs),
    customers: topCustomers(paidCur),
    channels: byChannel(paidCur),
    quotes: quoteStats(quotesCur),
    costGap: {
      orders: live.length - totals.costedOrders,
      revenue: money(totals.saleBase - totals.costedSaleBase),
    },
    totalProducts: topProducts(paidCur, costs, Number.MAX_SAFE_INTEGER).length,
    totalCustomers: topCustomers(paidCur, Number.MAX_SAFE_INTEGER).length,
  };
}

/** % เปลี่ยนแปลงเทียบช่วงก่อน — null = ช่วงก่อนเป็น 0 (เทียบไม่ได้ ห้ามโชว์ +∞%) */
export function deltaPct(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}
