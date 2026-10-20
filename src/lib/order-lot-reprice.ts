import { isFreeOrder, type Order, type OrderItem } from "@/lib/admin-data";
import { repriceCartGroups, type Product } from "@/lib/products";

/**
 * 🧮 ลูกค้าสั่งเพิ่มในออเดอร์เดิมจนยอดรวมทั้งใบเข้าเรทส่ง → "ราคาต่อชิ้นต้องเท่ากันทั้งบิล"
 *
 * ทำไม (เจ้าของร้านสั่ง 21 ก.ย. 69 · OD-260917-1401):
 * ผ้าคลุมไหล่ 10 ผืน (฿400) แล้วลูกค้ากด "สั่งเพิ่มในออเดอร์นี้" อีก 3 ผืน — รวม 13 ผืนเข้าขั้นส่ง ฿350
 * ของที่เพิ่มได้ ฿350 ถูกแล้ว (ตะกร้านับของเดิมร่วมล็อตตั้งแต่ 19 ก.ย. ดู appendLotLines) แต่ 10 ผืนแรก
 * ยังค้างที่ ฿400 → ใบเดียวกัน ของอย่างเดียวกัน ผลิตรอบเดียวกัน แต่ราคาต่อชิ้นไม่เท่ากัน
 * (กติกาเดิมคือ "ของเดิมจ่ายแล้ว ไม่แตะ" — เจ้าของร้านเปลี่ยนเป็นปรับให้เท่ากันทั้งใบ)
 *
 * กติกา:
 * - คิดราคาด้วยสมองเดียวกับตะกร้า (repriceCartGroups) จากรายการทั้งใบ = ล็อตผลิตจริง
 * - **ลดได้อย่างเดียว ห้ามขึ้นราคา** — ราคาที่แจ้งลูกค้าไปแล้วห้ามแพงขึ้นย้อนหลัง
 *   (รวมถึงบรรทัดที่แอดมินตีราคาพิเศษให้ต่ำกว่าตาราง — min() คงราคานั้นไว้)
 * - ลดเฉพาะบรรทัดที่ "ถูกลงเพราะของที่เพิ่งเพิ่ม" — เทียบกับราคาที่ล็อตเดิม (ไม่มีของใหม่) ได้ในวันนี้
 *   ตารางราคาที่ร้านขยับหลังลูกค้าสั่งจึงไม่ไหลย้อนเข้าใบเก่าโดยไม่ตั้งใจ
 * - ค่าบริการที่แยกบรรทัด (#designfee ค่าคละลาย · #boxfee ค่ากล่อง) ไม่แตะ — ล็อตใหญ่ขึ้นค่าคละอาจ "เพิ่ม"
 *   ซึ่งเท่ากับเก็บเงินเพิ่มย้อนหลัง ไม่ทำ
 */

export type LotRepriceLine = { name: string; from: number; to: number; qty: number };

export interface LotRepriceResult {
  order: Order;
  /** บรรทัดที่ราคาต่อชิ้นลดลงจริง (ไว้เขียน log / บอกลูกค้า) */
  changed: LotRepriceLine[];
}

/** ใบนี้ปรับราคาทั้งบิลได้ไหม — null = ได้ · ข้อความ = เหตุผลที่ไม่ได้ */
export function lotRepriceBlockedBy(o: Order): string | null {
  if (!o.items?.length) return "ใบนี้ยังไม่มีรายการ";
  if (isFreeOrder(o)) return "ใบเคลม/ส่งฟรี ไม่คิดเงิน";
  if (o.flowAccount) return "ใบนี้ยอดต้องตรงกับบิล FlowAccount";
  return null;
}

/** บรรทัดที่คิดราคาจากตารางสินค้าได้ (ค่าบริการ #designfee/#boxfee และรายการพิเศษไม่เข้า) */
function pricedIndexes(items: OrderItem[]): number[] {
  return items
    .map((_, i) => i)
    .filter((i) => {
      const it = items[i];
      return !!it.productId && !it.productId.includes("#") && !!it.sel && Object.keys(it.sel).length > 0;
    });
}

/**
 * คิดราคาต่อชิ้นใหม่ทั้งใบตามยอดรวมล็อต แล้วลดบรรทัดเดิมให้เท่ากับของที่เพิ่งเพิ่ม
 *
 * @param addedIdx index ของบรรทัดที่เพิ่งเพิ่มเข้าใบ (ไม่ส่งมา = ถือว่าบรรทัดท้าย ๆ ที่มี addedAt ใหม่สุดคือของใหม่ไม่ได้ → เทียบกับราคาที่เก็บไว้อย่างเดียว)
 * @param load ตัวโหลดสินค้า (ส่งเข้ามาเพื่อให้สคริปต์/เทสต์เรียกได้โดยไม่ติด "server-only")
 */
export async function repriceOrderLot(
  order: Order,
  load: (id: string) => Promise<Product | undefined>,
  addedIdx?: number[]
): Promise<LotRepriceResult> {
  if (lotRepriceBlockedBy(order)) return { order, changed: [] };

  const items = [...(order.items ?? [])];
  const idxs = pricedIndexes(items);
  if (idxs.length < 2) return { order, changed: [] };

  const prods = new Map<string, Product>();
  for (const pid of [...new Set(idxs.map((i) => items[i].productId))]) {
    const p = await load(pid);
    if (p) prods.set(pid, p);
  }
  if (!prods.size) return { order, changed: [] };
  const productOf = (id: string) => prods.get(id);

  const lines = idxs.map((i) => ({ productId: items[i].productId, selections: items[i].sel!, qty: items[i].qty }));
  const after = repriceCartGroups(lines, productOf);

  /**
   * ราคาของล็อต "ก่อนมีของที่เพิ่งเพิ่ม" (คิดด้วยตารางวันนี้เหมือนกัน) — ใช้เป็นฐานเทียบ
   * บรรทัดเดิมที่ราคาไม่ได้ถูกลงเพราะของใหม่ = ไม่แตะ
   */
  const added = new Set(addedIdx ?? []);
  const beforeAt = new Map<number, number>();
  if (added.size) {
    const keep = idxs.map((idx, n) => ({ idx, n })).filter(({ idx }) => !added.has(idx));
    if (keep.length) {
      const base = repriceCartGroups(
        keep.map(({ n }) => lines[n]),
        productOf
      );
      keep.forEach(({ n }, k) => beforeAt.set(n, base[k]?.unitPrice ?? 0));
    }
  }

  const changed: LotRepriceLine[] = [];
  idxs.forEach((idx, n) => {
    const it = items[idx];
    const computed = after[n]?.unitPrice ?? 0;
    // สินค้าถูกลบ/ตารางไม่มีราคาสเปคนี้แล้ว → คงราคาเดิม ดีกว่าทำบรรทัดเป็นศูนย์
    if (!(computed > 0) || !prods.has(it.productId)) return;
    if (!added.has(idx)) {
      const base = beforeAt.get(n);
      // ของเดิม: ต้องถูกลงเพราะของที่เพิ่งเพิ่มเท่านั้น (ไม่มีฐานเทียบ = ไม่แตะ)
      if (!(base !== undefined && base > 0 && computed < base)) return;
    }
    const to = Math.min(it.unitPrice, computed); // ลดอย่างเดียว
    if (to === it.unitPrice) return;
    items[idx] = { ...it, unitPrice: to };
    changed.push({ name: it.name, from: it.unitPrice, to, qty: it.qty });
  });

  return { order: changed.length ? { ...order, items } : order, changed };
}

/** สรุปสั้น ๆ ไว้เขียน log — "ผ้าคลุมไหล่ ฿400 → ฿350 (10 ชิ้น)" */
export function lotRepriceNote(changed: LotRepriceLine[]): string {
  return changed.map((c) => `${c.name} ฿${c.from.toLocaleString()} → ฿${c.to.toLocaleString()} (${c.qty} ชิ้น)`).join(" · ");
}

/**
 * 🧮↩ ขาย้อนของ repriceOrderLot — ล็อตในใบ "หดลง" (ลบรายการ · แก้ตัวเลือกแทนที่รายการ · ลดจำนวน) → ราคาที่เคยได้เพราะล็อตใหญ่ต้องคืนกลับ
 *
 * ทำไม (OD-260910-5776 · 20 ต.ค. 69 พนักงานแจ้ง): ถุงผ้าหูรูด 40 ใบ ฿110 → ลูกค้าสั่งเพิ่ม 25 ใบ รวม 65 = ขั้น 50-199 ฿105
 * (ของที่เพิ่มได้ ฿105 + ระบบลด 40 ใบเดิมเป็น ฿105) → แอดมินลบ 40 ใบเดิมออก เหลือ 25 ใบ แต่ค้าง ฿105
 * ทั้งที่ 25 ใบอยู่ขั้น 11-29 = ฿120 · ลบรายการไม่เคยคิดราคาใหม่เลย ลูกค้าโอนมาที่ ฿105 ไปแล้ว
 *
 * กติกา:
 * - เทียบราคาตาราง "ก่อนหด" กับ "หลังหด" ของบรรทัดเดียวกัน (สมองเดียวกับตะกร้า repriceCartGroups ทั้งคู่)
 *   ขึ้นราคาเฉพาะบรรทัดที่แพงขึ้น "เพราะล็อตหด" เท่านั้น — ตารางที่ร้านขยับเองไม่ไหลเข้าใบ
 * - ขึ้นเท่าส่วนต่างของตาราง แต่ไม่เกินราคาตารางหลังหด: ราคาพิเศษที่แอดมินตีต่ำกว่าตาราง ส่วนลดยังอยู่
 * - บรรทัดที่แอดมินตีราคาเอง (quoteNote) · ค่าบริการ # · งานพิเศษ ไม่แตะ · ใบเคลม/ใบ FlowAccount ไม่แตะ
 *
 * ⇅ ขาลงด้วย (OD-261020-2478 · 20 ต.ค. 69 "ราคายังไม่เสถียร"): แอดมินแก้จำนวนบรรทัดหนึ่งจาก 5 → 65 รวมล็อต 85 ใบ = ฿105
 * แต่อีกบรรทัด 20 ใบค้าง ฿120 (ราคาตอนล็อตยังเล็ก) — แก้จำนวนคิดราคาให้แค่บรรทัดที่แก้ · ตัวนี้เดิมขึ้นอย่างเดียว
 * → ล็อตโตจนตารางถูกลง = ลดบรรทัดอื่นเท่าส่วนต่างตาราง แต่ไม่ต่ำกว่าราคาตารางหลังเปลี่ยน (เหมือน repriceOrderLot)
 *   บรรทัดที่ราคาต่ำกว่าตารางอยู่แล้ว (ราคาพิเศษ) ไม่ลดซ้ำ
 *
 * @param prev รายการก่อนหด
 * @param next รายการหลังหด (ผลจริงที่จะบันทึก)
 * @param prevIndex บรรทัดที่ j ของ next คือบรรทัดไหนของ prev (-1 = บรรทัดใหม่ ไม่มีฐานเทียบ = ไม่แตะ)
 * @param skip index ของ next ที่ห้ามแตะ (เช่นบรรทัดที่เพิ่งแก้จำนวน คิดราคาให้แล้ว)
 */
export function relotAfterShrink(
  order: Order,
  prev: OrderItem[],
  next: OrderItem[],
  prevIndex: number[],
  productOf: (id: string) => Product | undefined,
  skip: number[] = []
): { items: OrderItem[]; changed: LotRepriceLine[] } {
  if (isFreeOrder(order) || order.flowAccount) return { items: next, changed: [] };
  const before = tableUnitPrices(prev, productOf);
  const after = tableUnitPrices(next, productOf);
  const skipSet = new Set(skip);

  const items = [...next];
  const changed: LotRepriceLine[] = [];
  after.forEach((a, j) => {
    const it = items[j];
    if (skipSet.has(j) || it.quoteNote || !productOf(it.productId)) return;
    const pi = prevIndex[j] ?? -1;
    const b = pi >= 0 ? before.get(pi) : undefined;
    // ราคาตารางหาไม่เจอ (สเปคเก่า/สินค้าถูกลบ) หรือขั้นตารางไม่ได้ขยับเพราะล็อตเปลี่ยน → คงเดิม
    if (!(a > 0) || b === undefined || !(b > 0) || a === b) return;
    const to =
      a > b
        ? Math.round(Math.max(it.unitPrice, Math.min(a, it.unitPrice + (a - b)))) // ล็อตหด: ขึ้นได้ไม่เกินตาราง
        : Math.round(Math.min(it.unitPrice, Math.max(a, it.unitPrice + (a - b)))); // ล็อตโต: ลดได้ไม่ต่ำกว่าตาราง
    if (to === it.unitPrice) return;
    items[j] = { ...it, unitPrice: to };
    changed.push({ name: it.name, from: it.unitPrice, to, qty: it.qty });
  });
  return { items: changed.length ? items : next, changed };
}

/**
 * ราคา/หน่วยตามตารางของแต่ละบรรทัด คิดทั้งใบเป็นล็อตเดียว (สมองเดียวกับตะกร้า) — index ของ items → ราคา (0 = ตารางไม่มีราคาสเปคนี้)
 * เฉพาะบรรทัดที่คิดจากตารางได้ (ไม่มี # · มี sel) · ใช้ทั้ง relotAfterShrink และป๊อปอัปตรวจราคา
 */
export function tableUnitPrices(items: OrderItem[], productOf: (id: string) => Product | undefined): Map<number, number> {
  const idxs = pricedIndexes(items);
  const got = repriceCartGroups(
    idxs.map((i) => ({ productId: items[i].productId, selections: items[i].sel!, qty: items[i].qty })),
    productOf
  );
  const m = new Map<number, number>();
  idxs.forEach((i, n) => m.set(i, got[n]?.unitPrice ?? 0));
  return m;
}
