/**
 * 🧪 เทส "ของแถมคิดซ้ำตามยอดรวมทั้งใบ + ธงจำนวนเพิ่มให้กราฟฟิกรับทราบ" (src/lib/server/order-gifts.ts)
 *   npm run check:order-gifts
 * เคสต้นเรื่อง OD-261006-8507 (8 ต.ค. 69): รองหลัง 7×7 (24 ใบ/แผ่น · เศษไม่เต็มแผ่นได้ซองใส) 80 → สั่งเพิ่ม 20
 */
import { applyGiftSync } from "../src/lib/server/order-gifts";
import { giftBumpLabel, giftBumpPending, type GiftPromo } from "../src/lib/gifts";
import { packGate, type Order, type OrderItem } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

const promo: GiftPromo = {
  id: "gift-backing-package",
  name: "แพ็กเกจรองหลัง",
  minQty: 1,
  step: 1,
  giveQty: 1,
  sizes: [{ label: "7 × 7 cm", perSheet: 24 }, { label: "9 × 9 cm", perSheet: 15 }],
  partial: { name: "ซองใส-หลังขาว", minFill: 1 },
  productIds: ["keyring-copy-copy"],
  needArtwork: true,
  active: true,
};
const promos = [promo];
const catOf = () => "acrylic";
const NOW = new Date("2026-10-08T08:28:53.292Z");
const item = (qty: number, added?: boolean): OrderItem =>
  ({ productId: "keyring-copy-copy", name: "พวงกุญแจอะคริลิค", selections: "", sel: { ขนาด: "5cm" }, qty, unitPrice: 55, ...(added ? { addedAt: NOW.toISOString() } : {}) }) as OrderItem;
const mk = (items: OrderItem[], extra: Partial<Order> = {}): Order =>
  ({ id: "OD-TEST", date: "", customer: "A", phone: "", address: "", status: "รอชำระเงิน", payment: "โอนธนาคาร", shipping: "", shippingCost: 0, items, ...extra }) as Order;
const gift80 = {
  promoId: promo.id,
  name: promo.name,
  size: "7 × 7 cm",
  qty: 80,
  printedQty: 72,
  fallbackQty: 8,
  fallbackName: "ซองใส-หลังขาว",
  needArtwork: true,
  artworkUrls: ["a.png", "b.png"],
  proofs: [{ url: "p1.jpg", at: "2026-10-07T13:08:29.298Z", by: "bt", review: "อนุมัติ" as const }],
  proofStatus: "อนุมัติ" as const,
};

// ── เคสต้นเรื่อง: 80 → +20 ──────────────────────────────────────────────────
{
  const r = applyGiftSync(mk([item(80), item(20, true)], { gifts: [gift80] }), promos, catOf, NOW);
  const g = r.order.gifts![0];
  eq("จำนวนชุด 80 → 100", [g.qty, g.printedQty, g.fallbackQty], [100, 96, 4]);
  eq("ลาย/แบบ/ผลอนุมัติ/ขนาด คงเดิม", [g.artworkUrls, g.proofs?.length, g.proofStatus, g.size], [["a.png", "b.png"], 1, "อนุมัติ", "7 × 7 cm"]);
  eq("ปักธงจำนวนเพิ่มให้กราฟฟิก", g.qtyBump, { at: NOW.toISOString(), from: 80, to: 100, was: { printedQty: 72, fallbackQty: 8 } });
  eq("ข้อความบอกว่าต้องทำเพิ่มเท่าไร", giftBumpLabel(g), "แพ็กเกจรองหลัง (7 × 7 cm) 72 → 96 (+24) · ซองใส-หลังขาว 8 → 4");
  eq("รายงานการเปลี่ยน", r.changed, [{ name: promo.name, from: 80, to: 100, note: "แพ็กเกจรองหลัง (7 × 7 cm) ×96 + ซองใส-หลังขาว ×4" }]);
  const gate = packGate({ ...r.order, packPhotos: ["x"] });
  eq("ด่านแพ็คล็อกจนกราฟฟิกรับทราบ", [gate.ready, gate.giftBump.length], [false, 1]);
  const acked = { ...r.order, gifts: [{ ...g, qtyBump: { ...g.qtyBump!, ackAt: "2026-10-08T09:00:00.000Z", ackBy: "bt" } }] };
  eq("รับทราบแล้ว ธงหาย", giftBumpPending(acked.gifts[0]), null);
  eq("รับทราบแล้ว ด่านแพ็คไม่ติดเรื่องของแถม", packGate(acked).giftBump, []);
}
// ── สั่งเพิ่มซ้ำก่อนรับทราบ: ยังเทียบกับจำนวนตอนแรก ────────────────────────
{
  const first = applyGiftSync(mk([item(80), item(20, true)], { gifts: [gift80] }), promos, catOf, NOW).order;
  const again = applyGiftSync({ ...first, items: [...first.items, item(10, true)] }, promos, catOf, new Date("2026-10-09T00:00:00Z")).order;
  eq("เพิ่มอีก 10 → 110 · from ยังเป็น 80", [again.gifts![0].qty, again.gifts![0].qtyBump?.from, again.gifts![0].qtyBump?.to], [110, 80, 110]);
}
// ── ไม่ลด · ไม่แตะเมื่อเท่าเดิม · ตัวแทน/เคลมไม่ได้ของแถม ──────────────────
{
  eq("ยอดเท่าเดิม = ไม่เปลี่ยน", applyGiftSync(mk([item(80)], { gifts: [gift80] }), promos, catOf, NOW).changed, []);
  const less = applyGiftSync(mk([item(50)], { gifts: [gift80] }), promos, catOf, NOW);
  eq("ของลดลง = ไม่ลดของแถม (แอดมินดูเอง)", [less.changed, less.order.gifts![0].qty], [[], 80]);
  eq("ตัวแทนจำหน่ายไม่ได้ของแถม", applyGiftSync(mk([item(80), item(20, true)], { dealer: true }), promos, catOf, NOW).changed, []);
  eq("ใบเคลมไม่ได้ของแถม", applyGiftSync(mk([item(80), item(20, true)], { claimOf: "OD-X" }), promos, catOf, NOW).changed, []);
}
// ── โปรที่เพิ่งเข้าเงื่อนไข (ใบไม่เคยมีของแถม) = เพิ่มใหม่ ไม่ปักธง ─────────
{
  const r = applyGiftSync(mk([item(30), item(20, true)]), promos, catOf, NOW);
  eq("เพิ่มของแถมใหม่ 50 ชุด (2 แผ่น = 48 + ซอง 2)", [r.order.gifts![0].qty, r.order.gifts![0].printedQty, r.order.gifts![0].fallbackQty, r.order.gifts![0].qtyBump], [50, 48, 2, undefined]);
}

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass})\n\n${fails.join("\n\n")}\n` : `✅ ผ่านทั้ง ${pass} ข้อ`);
process.exit(fails.length ? 1 : 0);
