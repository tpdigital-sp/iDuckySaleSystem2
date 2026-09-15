import { PLACEMENT_SPEC_LABEL } from "./design-templates";
import { orderOtherDiscounts, paidSoFar, type Order, type OrderItem, type OrderStatus } from "@/lib/admin-data";
import { paymentEntries } from "@/lib/payments";
import { dealerRateOf, dealerTwinRate, publicTwinRate, RATE_LABEL, repriceCartGroups, type PriceRate, type Product } from "@/lib/products";

/**
 * 🤝 สลับ "ออเดอร์ที่ลูกค้าสั่งไปแล้ว" ไปเป็นราคาตัวแทนจำหน่าย (และกลับ)
 *
 * ทำไมต้องมี (OD-260915-3447 · 15 ก.ย. 69): ตัวแทนสั่งของโดย "ไม่ได้ล็อกอิน" — เว็บจึงไม่รู้ว่าเป็นตัวแทน
 * และคิดราคาปลีกให้ตามปกติ (Case Premium ฿350 แทนราคาตัวแทน ฿250 · แถมได้ส่วนลดโอนไวที่ตัวแทนไม่ควรได้)
 * ระบบตัวแทนยืนยันตัวตนจาก access token ตอนสั่งเท่านั้น (ดู /api/orders) ซึ่งกันคนปลอมได้ถูกแล้ว
 * แต่ไม่มีทาง "ย้อนแก้" ให้ใบที่พลาดไป — แอดมินต้องไล่พิมพ์ราคาทีละบรรทัดเอง แล้วก็ลืมถอดส่วนลดโอนไว
 * → รวมกติกาทั้งหมดไว้ที่นี่ที่เดียว ให้หน้าออเดอร์กดปุ่มเดียวจบ และคิดราคาด้วย "สมองเดียวกับตะกร้า"
 *
 * ⚠️ คิดราคาเฉพาะบรรทัดที่มาจากตารางราคาของสินค้าจริง (มี sel + โหลดสินค้าเจอ)
 *    ค่าบริการที่แยกเป็นบรรทัด (#designfee ค่าคละลาย · #boxfee ค่ากล่อง) และรายการที่แอดมินตีราคาเอง
 *    ไม่แตะ — เรทตัวแทนเป็นเรทแฝดที่คัดลอกกติกาคละ/ขั้นต่ำมาจากเรทปกติทั้งชุด ค่าพวกนี้จึงเท่าเดิม
 */

/** ขั้นที่ยัง "ตั้งราคา/เก็บเงิน" อยู่ — ชุดเดียวกับ order-early-pay / order-member-tier */
const OPEN_FOR_PRICING: OrderStatus[] = ["รอชำระเงิน", "รอตรวจสอบ"];

export type DealerRepriceLine = { name: string; from: number; to: number; qty: number; rate: string };

export interface DealerRepriceResult {
  order: Order;
  /** บรรทัดที่ราคาเปลี่ยนจริง (ไว้เขียน log / บอกแอดมิน) */
  changed: DealerRepriceLine[];
  /** บรรทัดสินค้าที่สลับเรทไม่ได้ (สินค้ายังไม่มีราคาตัวแทน / รายการที่แอดมินตีราคาเอง) */
  skipped: string[];
}

/**
 * ใบนี้ให้สลับราคาได้ไหม — คืน null = ได้ · คืนข้อความ = เหตุผลที่ไม่ได้
 * กติกาเดียวกับส่วนลดอื่น ๆ: **รับเงิน/แจ้งโอนแล้วห้ามขยับยอดย้อนหลัง** (ลูกค้าโอนตามยอดที่ระบบบอกไปแล้ว)
 */
export function dealerRepriceBlockedBy(o: Order): string | null {
  if (!o.items?.length) return "ใบนี้ยังไม่มีรายการ";
  if (o.claimOf) return "ใบเคลม/ทำใหม่ไม่คิดเงิน";
  if (o.flowAccount) return "ใบนี้ยอดต้องตรงกับบิล FlowAccount";
  if (!OPEN_FOR_PRICING.includes(o.status)) return `ใบนี้เลยขั้นเก็บเงินแล้ว (${o.status})`;
  if (paidSoFar(o) > 0 || o.paidReportedAt || paymentEntries(o).length > 0) return "ใบนี้มีเงินเข้า/แจ้งโอนแล้ว — แก้ยอดย้อนหลังไม่ได้";
  return null;
}

/** ข้อความตัวเลือกที่ลูกค้าเห็น สร้างใหม่จาก sel ให้ตรงกัน (กติกาเดียวกับ checkout/edit-selections) */
function selectionsTextOf(sel: Record<string, string>): string {
  return Object.entries(sel)
    .filter(([k, v]) => k !== PLACEMENT_SPEC_LABEL && typeof v === "string" && v.trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

/** บรรทัดที่คิดราคาจากตารางสินค้าได้ (ค่าบริการ #designfee/#boxfee และรายการพิเศษไม่เข้า) */
function pricedIndexes(items: OrderItem[]): number[] {
  return items
    .map((it, i) => i)
    .filter((i) => {
      const it = items[i];
      return !!it.productId && !it.productId.includes("#") && !!it.sel && Object.keys(it.sel).length > 0;
    });
}

/**
 * คิดราคาใหม่ทั้งใบตามเรทตัวแทน (on) หรือเรทปกติ (off)
 * load: ตัวโหลดสินค้า (ส่งเข้ามาเพื่อให้สคริปต์/เทสต์เรียกได้โดยไม่ติด "server-only" ของ products-server)
 */
export async function repriceOrderForDealer(
  order: Order,
  on: boolean,
  load: (id: string) => Promise<Product | undefined>
): Promise<DealerRepriceResult> {
  const items = [...(order.items ?? [])];
  const idxs = pricedIndexes(items);
  const prods = new Map<string, Product>();
  for (const pid of [...new Set(idxs.map((i) => items[i].productId))]) {
    const p = await load(pid);
    if (p) prods.set(pid, p);
  }

  // 1) สลับคีย์ "เรทราคา" ของแต่ละบรรทัดไปเรทแฝดฝั่งตรงข้าม (ไม่มีเรทแฝด = คงเดิม แล้วรายงานว่าข้าม)
  const skipped: string[] = [];
  const nextSel = new Map<number, Record<string, string>>();
  for (const i of idxs) {
    const it = items[i];
    const p = prods.get(it.productId);
    if (!p) {
      skipped.push(it.name);
      continue;
    }
    const sel = it.sel!;
    const already = on ? !!dealerRateOf(p, sel) : !dealerRateOf(p, sel);
    if (already) continue; // อยู่ฝั่งที่ต้องการอยู่แล้ว — ไม่ต้องสลับ แต่ยังต้องคิดราคารวมล็อตใหม่
    const twin: PriceRate | undefined = on ? dealerTwinRate(p, sel) : publicTwinRate(p, sel);
    if (!twin) {
      skipped.push(it.name);
      continue;
    }
    nextSel.set(i, { ...sel, [RATE_LABEL]: twin.label });
  }

  // 2) คิดราคาด้วยตัวคิดราคาชุดเดียวกับตะกร้า — ขั้นราคาต้องนับยอดรวมทั้งล็อต ไม่ใช่ทีละบรรทัด
  const lines = idxs.map((i) => ({
    productId: items[i].productId,
    selections: nextSel.get(i) ?? items[i].sel!,
    qty: items[i].qty,
  }));
  const priced = repriceCartGroups(lines, (id) => prods.get(id));

  const changed: DealerRepriceLine[] = [];
  idxs.forEach((i, n) => {
    const it = items[i];
    const sel = nextSel.get(i);
    const unitPrice = priced[n]?.unitPrice ?? it.unitPrice;
    // โหลดสินค้าไม่เจอ/ตัวคิดราคาคืน 0 (สินค้าถูกลบ/ตารางเปลี่ยน) = คงราคาเดิม ดีกว่าทำใบเป็นศูนย์
    const keepPrice = !prods.has(it.productId) || unitPrice <= 0;
    if (!sel && (keepPrice || unitPrice === it.unitPrice)) return;
    const next: OrderItem = { ...it };
    if (sel) {
      next.sel = sel;
      next.selections = selectionsTextOf(sel);
    }
    if (!keepPrice && unitPrice !== it.unitPrice) {
      next.unitPrice = unitPrice;
      changed.push({ name: it.name, from: it.unitPrice, to: unitPrice, qty: it.qty, rate: (sel ?? it.sel!)[RATE_LABEL] ?? "" });
    }
    items[i] = next;
  });

  /**
   * 3) ธง + ส่วนลดที่ตัวแทนไม่ได้ — ตัวแทนได้ราคาเรทตัวแทนอย่างเดียว ไม่ได้ส่วนลดระดับ/โอนไว/ของแถม
   *    (กติกาเดียวกับตอนลูกค้าตัวแทนล็อกอินสั่งเอง ดู /api/orders) · ส่วนลดที่แอดมิน/คูปองใส่ไว้เองไม่แตะ
   *    — ตัวเลขนั้นตกลงกับลูกค้าไปแล้ว ให้แอดมินตัดสินใจเอง (บอกไว้ในผลลัพธ์)
   */
  let next: Order = { ...order, items };
  if (on) {
    next.dealer = true;
    if (next.earlyPay) {
      const { earlyPay: _drop, ...rest } = next;
      void _drop;
      next = rest;
    }
    if (next.discount?.tierId) {
      const { discount: _tier, ...rest } = next;
      void _tier;
      next = rest;
    }
    if (next.gifts?.length) next = { ...next, gifts: [] };
  } else {
    const { dealer: _off, ...rest } = next;
    void _off;
    next = rest;
  }
  return { order: next, changed, skipped };
}

/** ยังมีส่วนลดที่ระบบไม่ได้ถอดให้ (คูปอง/ส่วนลดที่แอดมินใส่เอง) — เตือนแอดมินหลังกดปุ่ม */
export function dealerLeftoverDiscount(o: Order): number {
  return orderOtherDiscounts(o);
}
