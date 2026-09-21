import type { Order, OrderItem } from "@/lib/admin-data";
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
  if (o.claimOf) return "ใบเคลม/ทำใหม่ไม่คิดเงิน";
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
