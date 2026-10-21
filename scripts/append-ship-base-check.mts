/**
 * 🚚 สั่งเพิ่มเข้าใบที่ยังไม่มีวิธีส่ง: ตะกร้า/หน้าชำระเงินต้องเลือกกล่อง+คิดส่งฟรีจาก "ทั้งใบ" ให้ตรงกับหน้าออเดอร์ (autoShipQuote)
 * npm run check:append-ship
 */
import { appendShipBase, shipCalcLines, shipRetailOnly } from "../src/lib/append-order";
import { autoShipQuote, pickShipping } from "../src/lib/shipping-auto";
import { isRetailRateLine, type Product } from "../src/lib/products";
import { shipFollowsItems, shipOriginUnknown } from "../src/lib/ship-label";
import { shipAutoFollowNow, type Order } from "../src/lib/admin-data";
import type { ShippingMethod } from "../src/lib/settings-shared";

const methods = [
  { id: "ems", name: "EMS (50)", price: 50 },
  { id: "ems100", name: "EMS (100)", price: 100, minSubtotal: 2000 },
  { id: "pickup", name: "มารับเอง", price: 0 },
] as unknown as ShippingMethod[];
const FREE_MIN = 3000;

// สินค้าทดสอบ: ราคาเดียว (ไม่มีเรทส่ง = ปลีกเสมอ) กับมีเรทส่งเริ่ม 50 ชิ้น
const plain = { id: "plain", name: "ของราคาเดียว", rates: [] } as unknown as Product;
const tiered = { id: "tiered", name: "ของมีเรทส่ง", rates: [{ label: "ส่ง", minQty: 50 }] } as unknown as Product;
const products = new Map<string, Product>([[plain.id, plain], [tiered.id, tiered]]);
const productOf = (id: string) => products.get(id);

type OItem = { productId: string; sel?: Record<string, string>; qty: number; unitPrice: number; name: string };
type Pick = { productId: string; selections: Record<string, string>; qty: number; unitPrice: number };

/** สูตรตะกร้าใหม่ (ย่อ: เฉพาะส่วนเลือกกล่อง + ส่งฟรี) */
function cart(base: OItem[] | null, picks: Pick[]) {
  const shipBase = base ? appendShipBase(base) : null;
  const lines = shipCalcLines(picks, shipBase);
  const subtotal = picks.reduce((s, p) => s + p.qty * p.unitPrice, 0) + (shipBase?.subtotal ?? 0);
  const auto = pickShipping(methods, {
    totalQty: lines.reduce((n, l) => n + l.qty, 0),
    subtotal,
    retailOnly: shipRetailOnly(lines, productOf),
    requiredIds: [],
  });
  const m = methods.find((x) => x.id === auto.id)!;
  const free = subtotal >= FREE_MIN;
  return { id: m.id, cost: m.price === 0 ? 0 : free ? 0 : m.price };
}
/** หน้าออเดอร์หลังบันทึก (autoShipOf) — ทั้งใบ */
function orderPage(all: OItem[]) {
  const q = autoShipQuote(
    all.map((it) => ({ productId: it.productId, name: it.name, qty: it.qty, selections: it.sel ?? {}, product: products.get(it.productId) })),
    methods,
    {
      subtotal: all.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      freeMin: FREE_MIN,
      retailOnly: all.every((it) => {
        const p = products.get(it.productId);
        return p ? isRetailRateLine(p, it.sel ?? {}, it.qty) : false;
      }),
    }
  );
  return { id: q.method!.id, cost: q.cost };
}

const cases: { name: string; base: OItem[]; picks: Pick[]; expect: string }[] = [
  {
    name: "งานพิเศษ ฿1,500 + หยิบเพิ่ม ฿600 → ยอดทั้งใบถึง 2,000 = EMS (100)",
    base: [{ productId: "special-item", name: "งานพิเศษ", qty: 1, unitPrice: 1500 }],
    picks: [{ productId: "plain", selections: {}, qty: 4, unitPrice: 150 }],
    expect: "ems100",
  },
  {
    name: "ของเดิม ฿2,600 + หยิบ ฿600 → ทั้งใบถึงส่งฟรี 3,000",
    base: [{ productId: "tiered", name: "ของมีเรทส่ง", qty: 60, unitPrice: 43.34 }],
    picks: [{ productId: "plain", selections: {}, qty: 4, unitPrice: 150 }],
    expect: "free",
  },
  {
    name: "ใบเดิมเป็นของปลีก ฿1,800 + หยิบปลีก ฿300 → ปลีกล้วน ไม่เด้งกล่องใหญ่",
    base: [{ productId: "plain", name: "ของราคาเดียว", qty: 12, unitPrice: 150 }],
    picks: [{ productId: "plain", selections: {}, qty: 2, unitPrice: 150 }],
    expect: "ems",
  },
  {
    name: "ใบเปล่า (ไม่มีของเดิม) → เหมือนตะกร้าปกติ",
    base: [],
    picks: [{ productId: "plain", selections: {}, qty: 2, unitPrice: 150 }],
    expect: "ems",
  },
];

let fail = 0;
for (const c of cases) {
  const before = cart(null, c.picks); // สูตรเดิม: ของที่หยิบอย่างเดียว
  const after = cart(c.base, c.picks);
  const page = orderPage([...c.base, ...c.picks.map((p) => ({ productId: p.productId, sel: p.selections, qty: p.qty, unitPrice: p.unitPrice, name: p.productId }))]);
  const gotKey = after.cost === 0 && after.id !== "pickup" ? "free" : after.id;
  const ok = gotKey === c.expect && after.id === page.id && after.cost === page.cost;
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}\n   เดิม ${before.id} ฿${before.cost} → ใหม่ ${after.id} ฿${after.cost} · หน้าออเดอร์ ${page.id} ฿${page.cost}`);
}
// ⚡ ค่าส่งของใบไหน "ปรับตามรายการเอง" (OD-261020-2478 · แก้จำนวนแล้วค่าส่งค้าง)
const L = (action: string, detail = "") => ({ at: "", by: "", action, detail });
const base = { id: "T", status: "รอชำระเงิน", items: [], shippingCost: 100, shippingLabel: "EMS (100)" } as unknown as Order;
const follow: [string, boolean, boolean][] = [
  ["ธง shipAuto true", shipFollowsItems({ shipAuto: true }), true],
  ["ธง shipAuto false ชนะประวัติ", shipFollowsItems({ shipAuto: false, log: [L("เปลี่ยนวิธีส่ง", "(อัตโนมัติ — x)")] }), false],
  ["ใบเก่า: หยิบจากหน้าร้านใส่ค่าส่ง", shipFollowsItems({ log: [L("สั่งเพิ่มในออเดอร์เดิม", "1 รายการ · ใส่ค่าส่ง EMS (100) ฿100")] }), true],
  ["ใบเก่า: เลือก ⚡ อัตโนมัติ", shipFollowsItems({ log: [L("เปลี่ยนวิธีส่ง", "— ฿0 → EMS (50) ฿50 (อัตโนมัติ — x)")] }), true],
  ["ใบเก่า: อัตโนมัติแล้วแอดมินพิมพ์ค่าส่งเอง", shipFollowsItems({ log: [L("เปลี่ยนวิธีส่ง", "(อัตโนมัติ — x)"), L("แก้ค่าจัดส่ง", "฿50 → ฿80")] }), false],
  ["ใบเก่า: ไม่มีร่องรอย (ลูกค้าสั่งเองจากตะกร้า)", shipFollowsItems({ log: [L("สร้างออเดอร์")] }), false],
  ["ปรับได้: ระบบเลือก + ยังไม่จ่าย", shipAutoFollowNow({ ...base, shipAuto: true }), true],
  ["ไม่ปรับ: มีเงินเข้าแล้ว", shipAutoFollowNow({ ...base, shipAuto: true, paidTotal: 500 } as Order), false],
  ["ไม่ปรับ: มารับเอง", shipAutoFollowNow({ ...base, shipAuto: true, shippingLabel: "มารับเอง", shippingCost: 0 }), false],
  ["ไม่ปรับ: ใบจากใบเสนอราคา", shipAutoFollowNow({ ...base, shipAuto: true, quoteOf: "QT-1" } as Order), false],
  // 🤷 ใบจากหน้าร้านก่อนมีธง: ไม่มีร่องรอยว่าใครตั้ง → หน้าออเดอร์เทียบกับที่ระบบคิดจากรายการเดิม / ขึ้นปุ่มแนะนำ (21 ต.ค. 69)
  ["ที่มาไม่รู้: ไม่มีธง ไม่มี log วิธีส่ง", shipOriginUnknown({ log: [L("สร้างออเดอร์")] }), true],
  ["ที่มารู้: มีธง shipAuto (true/false ก็รู้)", shipOriginUnknown({ shipAuto: false }), false],
  ["ที่มารู้: มี log เปลี่ยนวิธีส่ง", shipOriginUnknown({ log: [L("เปลี่ยนวิธีส่ง", "x")] }), false],
  ["ที่มารู้: มี log แก้ค่าจัดส่ง", shipOriginUnknown({ log: [L("แก้ค่าจัดส่ง", "฿50 → ฿80")] }), false],
  ["ที่มารู้: หยิบจากหน้าร้านใส่ค่าส่ง", shipOriginUnknown({ log: [L("สั่งเพิ่มในออเดอร์เดิม", "ใส่ค่าส่ง EMS (50) ฿50")] }), false],
  ["ที่มาไม่รู้: สั่งเพิ่มแต่ไม่ได้ใส่ค่าส่ง", shipOriginUnknown({ log: [L("สั่งเพิ่มในออเดอร์เดิม", "1 รายการ")] }), true],
];
for (const [name, got, want] of follow) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${name} → ${got}`);
}
const total = cases.length + follow.length;
console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : `\n✅ ผ่านทั้ง ${total} ข้อ`);
process.exit(fail ? 1 : 0);
