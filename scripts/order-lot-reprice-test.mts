/**
 * 🧪 เทสกติกา "สั่งเพิ่มจนเข้าเรทส่ง → ราคาต่อชิ้นเท่ากันทั้งบิล" (src/lib/order-lot-reprice.ts)
 *
 *   npm run check:lot-reprice
 *
 * เคสจริงที่เป็นต้นเรื่อง (เจ้าของร้านสั่ง 21 ก.ย. 69 · OD-260917-1401):
 * ผ้าคลุมไหล่ 100x100 10 ผืน ฿400 → ลูกค้าสั่งเพิ่ม 3 ผืน รวม 13 ผืน = ขั้น 11-49 ฿350
 * ของที่เพิ่มได้ ฿350 แล้ว (ตะกร้านับของเดิมร่วมล็อต) แต่ 10 ผืนแรกต้องลดตามด้วย
 */
import { repriceOrderLot } from "../src/lib/order-lot-reprice";
import type { Order, OrderItem } from "../src/lib/admin-data";
import type { Product } from "../src/lib/products";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

/** สินค้าทดสอบ: เรทเดียว ขั้นต่ำ 11 ชิ้น · 1-10 = ฿400 · 11-49 = ฿350 · 50+ = ฿320 */
const shawl: Product = {
  id: "shawl",
  name: "ผ้าคลุมไหล่",
  price: 450,
  category: "ผ้า",
  options: [{ label: "ขนาด", choices: [{ name: "100x100cm" }, { name: "70x70cm" }] }],
  priceRates: [
    {
      label: "เรทที่ 1",
      minQty: 11,
      pricing: {
        driverLabels: ["ขนาด"],
        tiers: [{ upTo: 10 }, { upTo: 49 }, { upTo: null }],
        cells: { "100x100cm": [400, 350, 320], "70x70cm": [250, 230, 200] },
      },
    },
  ],
} as unknown as Product;

const load = async (id: string) => (id === shawl.id ? shawl : undefined);
const sel = { ขนาด: "100x100cm" };
const line = (qty: number, unitPrice: number, added?: boolean): OrderItem =>
  ({
    productId: "shawl",
    name: "ผ้าคลุมไหล่",
    selections: "ขนาด: 100x100cm",
    sel,
    qty,
    unitPrice,
    ...(added ? { addedAt: "2026-09-21T07:26:02.812Z" } : {}),
  }) as OrderItem;
const mk = (items: OrderItem[], extra: Partial<Order> = {}): Order =>
  ({ id: "OD-TEST", date: "", customer: "A", phone: "", address: "", status: "รอชำระเงิน", payment: "โอนธนาคาร", shipping: "", shippingCost: 0, items, ...extra }) as Order;
const units = (o: Order) => o.items.map((i) => i.unitPrice);

// ── เคสต้นเรื่อง: 10 ผืน ฿400 + สั่งเพิ่ม 3 ผืน ──────────────────────────────
{
  const order = mk([line(2, 400), line(2, 400), line(2, 400), line(4, 400), line(1, 350, true), line(1, 350, true), line(1, 350, true)]);
  const r = await repriceOrderLot(order, load, [4, 5, 6]);
  eq("ของเดิมลดลงมาเท่าของใหม่ทั้งบิล", units(r.order), [350, 350, 350, 350, 350, 350, 350]);
  eq("รายงานเฉพาะบรรทัดที่เปลี่ยนจริง", r.changed.length, 4);
  eq("ยอดที่ลดรวม", r.changed.reduce((s, c) => s + (c.from - c.to) * c.qty, 0), 500);
}

// ── ของที่เพิ่มไม่ได้ทำให้ขั้นราคาเปลี่ยน = ไม่แตะราคาเดิม ────────────────────
{
  const order = mk([line(20, 350), line(2, 350, true)]);
  const r = await repriceOrderLot(order, load, [1]);
  eq("ยังอยู่ขั้นเดิม (22 ผืน) → ไม่มีอะไรเปลี่ยน", r.changed.length, 0);
}

// ── ห้ามขึ้นราคาย้อนหลัง ──────────────────────────────────────────────────────
{
  // แอดมินตีราคาพิเศษให้บรรทัดเดิม ฿300 (ถูกกว่าตาราง) — ห้ามถูกดันขึ้นเป็น ฿350
  const order = mk([line(10, 300), line(3, 350, true)]);
  const r = await repriceOrderLot(order, load, [1]);
  eq("ราคาพิเศษที่ถูกกว่าตารางคงไว้", units(r.order), [300, 350]);
  eq("ไม่รายงานว่าเปลี่ยน", r.changed.length, 0);
}
{
  // ของใหม่ถูกส่งมาแพงกว่าราคาล็อต (หน้าจอเก่า/ไม่ได้นับของเดิม) → ลดให้ด้วย
  const order = mk([line(10, 400), line(3, 400, true)]);
  const r = await repriceOrderLot(order, load, [1]);
  eq("บรรทัดใหม่ที่ราคาค้างมาแพง ก็ลดลงมาที่ราคาล็อต", units(r.order), [350, 350]);
}

// ── บรรทัดที่ไม่ใช่สินค้าในตาราง ─────────────────────────────────────────────
{
  const fee = { productId: "shawl#designfee", name: "🎨 Add on", selections: "", sel: {}, qty: 1, unitPrice: 8 } as OrderItem;
  const special = { productId: "special-item", name: "งานพิเศษ", selections: "", qty: 1, unitPrice: 900 } as OrderItem;
  const order = mk([line(10, 400), fee, special, line(3, 350, true)]);
  const r = await repriceOrderLot(order, load, [3]);
  eq("ค่าคละลาย/งานพิเศษไม่ถูกแตะ", units(r.order), [350, 8, 900, 350]);
}

// ── ใบที่ห้ามขยับยอด ─────────────────────────────────────────────────────────
{
  const order = mk([line(10, 400), line(3, 350, true)], { flowAccount: { id: "x" } } as Partial<Order>);
  const r = await repriceOrderLot(order, load, [1]);
  eq("ใบ FlowAccount ยอดต้องตรงบิล — ไม่แตะ", units(r.order), [400, 350]);
}
{
  const order = mk([line(10, 400), line(3, 350, true)], { claimOf: "OD-OTHER" });
  const r = await repriceOrderLot(order, load, [1]);
  eq("ใบเคลมไม่คิดเงิน — ไม่แตะ", units(r.order), [400, 350]);
}

// ── ไม่รู้ว่าบรรทัดไหนคือของใหม่ (เรียกโดยไม่ส่ง addedIdx) ───────────────────
{
  const order = mk([line(10, 400), line(3, 350)]);
  const r = await repriceOrderLot(order, load);
  eq("ไม่มีฐานเทียบ = ไม่ลดของเดิมมั่ว", units(r.order), [400, 350]);
}

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass})\n\n${fails.join("\n\n")}\n` : `✅ ผ่านทั้ง ${pass} ข้อ`);
process.exit(fails.length ? 1 : 0);
