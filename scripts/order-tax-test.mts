/**
 * 🧾 เทสกติกา "ภาษีต้องตามยอด" — npx tsx --tsconfig tsconfig.json scripts/order-tax-test.mts
 *
 * กติกาที่เทส (src/lib/admin-data.ts):
 *   orderTaxBase         ฐานภาษี = สินค้า + ค่าส่ง − ส่วนลด (ไม่รวมค่าบริการเพิ่ม)
 *   reconcileOrderTax    ฐานขยับ → VAT/หัก ณ ที่จ่าย คิดใหม่ตามเรต · ยอดที่คนตั้งใจใส่เองต้องไม่โดนทับ
 *   orderTaxDrift        ตัวเลขภาษีที่ค้างของฐานเก่า
 *   reconciledOrderAmounts  ยอดที่ "ควรจะเป็น" ไว้ให้ด่านตรวจสลิปรู้ว่ายอดในระบบเชื่อไม่ได้
 */
import { orderTaxBase, orderTaxDrift, orderTotal, reconcileOrderTax, reconciledOrderAmounts, type Order } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

const mk = (o: Partial<Order>): Order =>
  ({ id: "OD-TEST", date: "", customer: "", phone: "", address: "", status: "รอชำระเงิน", payment: "โอนธนาคาร", shipping: "", shippingCost: 0, items: [], ...o }) as Order;

// ── เคสจริง OD-260915-1705: ใบเสนอราคา QT010660 แก้จำนวน 12 → 5 ชิ้น ──────────────────
const before = mk({
  items: [{ productId: "special-item", name: "Arm patch", qty: 12, unitPrice: 304 }],
  vat: { rate: 7, amount: 255.36 },
  wht: { rate: 3, amount: 109.44 },
});
const after = mk({ ...before, items: [{ productId: "special-item", name: "Arm patch", qty: 5, unitPrice: 304 }] });

eq("ฐานภาษีใบเดิม", orderTaxBase(before), 3648);
eq("ยอดรวมใบเดิมตรงบิล 3,903.36", orderTotal(before), 3903.36);
eq("ดึงรายการใหม่มาแล้วภาษียังไม่ตาม = ยอดเพี้ยน 1,775.36", orderTotal(after), 1775.36);

const fixed = reconcileOrderTax(before, after);
eq("คิดภาษีใหม่: VAT", fixed?.order.vat, { rate: 7, amount: 106.4 });
eq("คิดภาษีใหม่: หัก ณ ที่จ่าย", fixed?.order.wht, { rate: 3, amount: 45.6 });
eq("ยอดรวมหลังคิดใหม่ = ยอดตามใบ 1,626.40", orderTotal(fixed!.order), 1626.4);
eq("ยอดโอนจริง = ที่ลูกค้าโอนมา 1,580.80", Math.round((orderTotal(fixed!.order) - 45.6) * 100) / 100, 1580.8);
eq("คิดซ้ำอีกรอบไม่มีอะไรให้แก้ (idempotent)", reconcileOrderTax(after, fixed!.order), null);

// ── ด่านตรวจสลิป: ใบที่ภาษีค้างของฐานเก่า ต้องรู้ว่ายอดที่ถูกคือเท่าไหร่ ────────────────
eq("ตัวเลขภาษีค้างของฐานเก่า", orderTaxDrift(after), { vat: -148.96, wht: -63.84 });
eq("ยอดที่ควรจะเป็น [รวม, โอนจริง]", reconciledOrderAmounts(after), [1626.4, 1580.8]);
eq("ใบที่ภาษีตรงเรตอยู่แล้ว = ไม่มียอดสำรอง", reconciledOrderAmounts(fixed!.order), []);

// ── ห้ามแตะของที่คนตั้งใจใส่เอง ────────────────────────────────────────────────────
eq("ฐานไม่ขยับ = ไม่คิดใหม่", reconcileOrderTax(before, mk({ ...before, customer: "ชื่อใหม่" })), null);
eq(
  "ผู้เรียกส่งยอดภาษีใหม่มาเอง (ซิงก์ตามเอกสาร) = เชื่อตามนั้น",
  reconcileOrderTax(before, { ...after, vat: { rate: 7, amount: 106.41 }, wht: { rate: 3, amount: 45.61 } })?.order.vat,
  undefined
);
eq(
  "แอดมินพิมพ์ยอดหักทับเองตามใบ 50 ทวิ (ไม่ตรงเรต × ฐานเก่า) = ไม่แตะ แม้ VAT จะถูกคิดใหม่",
  reconcileOrderTax({ ...before, wht: { rate: 3, amount: 100 } }, { ...after, wht: { rate: 3, amount: 100 } })?.order.wht,
  { rate: 3, amount: 100 }
);
eq("ใบธรรมดาไม่มีภาษี = ไม่เกี่ยว", reconcileOrderTax(mk({ items: [{ productId: "p", name: "a", qty: 1, unitPrice: 100 }] }), mk({ items: [{ productId: "p", name: "a", qty: 2, unitPrice: 100 }] })), null);

// ── ฐานภาษี: ค่าส่ง/ส่วนลดนับ · ค่าบริการเพิ่มไม่นับ (เก็บทีหลังนอกบิลที่ออกไปแล้ว) ──────
const ship = mk({
  items: [{ productId: "special-item", name: "งาน", qty: 1, unitPrice: 4408 }],
  shippingCost: 100,
  vat: { rate: 7, amount: 315.56 },
  wht: { rate: 3, amount: 135.24 },
});
eq("ฐาน = สินค้า + ค่าส่ง", orderTaxBase(ship), 4508);
eq("ยอดรวมตรงบิล OD-260911-5435 (4,823.56)", orderTotal(ship), 4823.56);
const pickup = reconcileOrderTax(ship, { ...ship, shippingCost: 0 });
eq("เปลี่ยนเป็นมารับเอง → VAT ตามฐานใหม่", pickup?.order.vat?.amount, 308.56);
eq("ค่าบริการเพิ่มไม่เข้าฐานภาษี", orderTaxBase({ ...ship, charges: [{ id: "c1", label: "ค่าเร่ง", amount: 500, at: "" }] } as Order), 4508);

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส\n\n${fails.join("\n\n")}\n` : "");
console.log(`${fails.length ? "❌" : "✅"} ผ่าน ${pass}/${pass + fails.length} เคส`);
process.exit(fails.length ? 1 : 0);
