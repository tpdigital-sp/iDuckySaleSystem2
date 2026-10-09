/**
 * 🎁🧾 เทส "ตัวอย่าง/ใบเสร็จไปกับรอบแบ่งส่ง" — npm run check:ship-round-extras
 * ที่มา (พนักงานขอ 9 ต.ค. 69): ลูกค้าบางคนให้ใบเสร็จไปกับงานตัวอย่าง · ส่งตัวอย่างรอบแรกแล้ว รอบที่เหลือยังถามให้ติ๊กใส่ตัวอย่าง
 */
import { nextRoundExtras, packGate, partialGate, receiptsShippedRound, roundSel, sampleShippedRound, shipmentExtras, type Order, type Shipment } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};
const has = (name: string, list: string[], needle: string, want = true) => eq(name, list.some((r) => r.includes(needle)), want);

const stamp = { by: "t", at: "2026-10-09T00:00:00Z" };
const proof = (url: string, qty: number) => ({ url, qty, unit: "ชิ้น", pack: { status: "ครบ" as const, ...stamp }, at: stamp.at });
const base = {
  id: "OD-TEST-2",
  customer: "ทดสอบ",
  status: "กำลังผลิต",
  items: [
    { name: "สติ๊กเกอร์", qty: 10, unitPrice: 100, noteAck: stamp, sampleRequired: stamp, proofs: [proof("a", 1), proof("b", 9)] },
  ],
  shippingCost: 0,
  paidTotal: 1070,
  vat: { rate: 7, amount: 70 },
  flowAccount: { url: "x", docNo: "QT010900", docTypeLabel: "ใบเสนอราคา", grandTotal: 1070 },
  faInvoices: [{ docNo: "INV007800", ref: "QT010900" }],
  packPhotos: [{ url: "p", ...stamp }],
  shipPlan: [{ proofs: [{ item: 0, proof: 0, url: "a", qty: 1 }], withSample: true, withReceipt: true, ...stamp }],
} as unknown as Order;

const sel = roundSel(base, base.shipPlan![0].proofs);
eq("แผนรอบ 1 มีธงตัวอย่าง+ใบเสร็จ", nextRoundExtras(base), { round: 1, sample: true, receipt: true });
const g0 = partialGate(base, sel);
has("ยังไม่ติ๊กตัวอย่าง → ติดด่าน", g0.reasons, "ชิ้นงานตัวอย่าง");
has("ยังไม่ถ่ายใบเสร็จ → ติดด่าน", g0.reasons, "INV007800");

const ready = {
  ...base,
  items: [{ ...base.items[0], samplePacked: stamp }],
  receiptPhotos: [{ docNo: "INV007800", url: "r", ...stamp }],
  taxInvoicePacked: stamp,
} as Order;
eq("ใส่ครบ → รอบ 1 ยิงได้", partialGate(ready, sel).reasons, []);
eq("ของในกล่องตอนยิง = ตัวอย่าง + ใบเสร็จ", shipmentExtras(ready), { samples: [0], receipts: ["INV007800"] });

const sh: Shipment = { tracking: "EQ1TH", ...stamp, proofs: base.shipPlan![0].proofs, ...shipmentExtras(ready) };
const after = { ...ready, shipments: [sh] } as Order;
eq("ตัวอย่างไปกับรอบ 1", sampleShippedRound(after, 0), 1);
eq("ใบเสร็จไปกับรอบ 1", receiptsShippedRound(after), 1);
eq("รอบสุดท้ายไม่ถามตัวอย่าง", packGate(after).unsampled, []);
eq("รอบสุดท้ายไม่ถามใบเสร็จ", packGate(after).taxInvoiceUnpacked, false);
eq("ยิงไปแล้ว ไม่ประทับซ้ำรอบหลัง", shipmentExtras(after), {});

// ไม่ได้ส่งไปรอบ 1 (รอบปกติ) → รอบสุดท้ายยังต้องใส่
const plain = { ...base, shipPlan: [{ ...base.shipPlan![0], withSample: undefined, withReceipt: undefined }] } as unknown as Order;
eq("แผนไม่มีธง → รอบนี้ไม่บังคับ", partialGate(plain, sel).reasons, []);
const plainAfter = { ...plain, shipments: [{ tracking: "EQ2TH", ...stamp, proofs: plain.shipPlan![0].proofs, ...shipmentExtras(plain) }] } as Order;
eq("ไม่ได้ใส่ตัวอย่างไป → รอบสุดท้ายยังต้องใส่", packGate(plainAfter).unsampled, ["สติ๊กเกอร์"]);
eq("ไม่ได้ใส่ใบเสร็จไป → รอบสุดท้ายยังต้องใส่", packGate(plainAfter).taxInvoiceUnpacked, true);

// บิลเพิ่มมาหลังส่งใบเสร็จรอบ 1 → รอบสุดท้ายต้องใส่ใบใหม่
const extraLater = {
  ...after,
  flowAccountExtras: [{ url: "y", docNo: "QT010950", docTypeLabel: "ใบเสนอราคา", grandTotal: 0 }],
} as unknown as Order;
eq("บิลเพิ่มทีหลัง → ยังไม่ครบ", receiptsShippedRound(extraLater), null);
eq("บิลเพิ่มทีหลัง → ด่านถามใบใหม่", packGate(extraLater).taxInvoiceUnpacked, true);

console.log(`✅ ผ่าน ${pass} ข้อ`);
if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ\n` + fails.join("\n"));
  process.exit(1);
}
