/**
 * ➗ receiveDepositFirst — เมนู "เปลี่ยนสถานะ → ชำระแล้ว" บนใบมัดจำต้องเท่ากับปุ่ม "ยืนยันรับมัดจำ 50%"
 * (OD-260928-1506 · 30 ก.ย. 69) รัน: npm run check:deposit-first
 */
import assert from "node:assert/strict";
import { amountDueNow, depositFirstNetPerDocChange, depositFollowTotal, depositInstallments, hasUnpaidBalance, orderBalance, orderFullyPaid, orderStatusLabel, receiveDepositFirst, type Order } from "../src/lib/admin-data";

const AT = "2026-09-30T05:51:52.042Z";
const base = (over: Partial<Order> = {}): Order =>
  ({
    id: "OD-260928-1506",
    key: "k",
    date: "28 ก.ย. 2569",
    status: "รอตรวจสอบ",
    customerName: "OUR",
    phone: "",
    address: "",
    payment: "โอนธนาคาร",
    shipping: "ส่งธรรมดา",
    shippingCost: 100,
    items: [
      { productId: "a", name: "พวงกุญแจ", qty: 500, unitPrice: 35, selections: {} },
      { productId: "b", name: "NFC", qty: 200, unitPrice: 56.5, selections: {} },
    ],
    vat: { rate: 7, amount: 2023 },
    wht: { rate: 3, amount: 867 },
    deposit: { amount: 15461.5 },
    ...over,
  }) as unknown as Order;

let n = 0;
const ok = (name: string) => console.log(`  ✓ ${++n} ${name}`);

// 1) ใบรอตรวจสอบ (สลิปตก) → ชำระแล้ว = งวดแรก ไม่ใช่ครบ
{
  const o = receiveDepositFirst(base(), AT);
  assert.equal(o.status, "ชำระแล้ว");
  assert.equal(o.deposit?.firstPaidAt, AT);
  assert.equal(o.paidTotal, 15461.5);
  assert.equal(orderBalance(o), 15461.5);
  assert.equal(hasUnpaidBalance(o), true);
  assert.equal(orderFullyPaid(o), false);
  assert.equal(orderStatusLabel(o), "ชำระแล้ว 50% แรก");
  assert.equal(amountDueNow(o), 15461.5);
  ok("รอตรวจสอบ → ชำระแล้ว 50% แรก · paidTotal = ยอดมัดจำ · ค้างงวด 2");
}
// 2) รอชำระเงิน (ไม่มีสลิป) ก็เหมือนกัน
{
  const o = receiveDepositFirst(base({ status: "รอชำระเงิน" }), AT);
  assert.equal(o.status, "ชำระแล้ว");
  assert.equal(o.paidTotal, 15461.5);
  ok("รอชำระเงิน → ชำระแล้ว 50% แรก");
}
// 3) รับงวดแรกไปแล้ว → เรียกซ้ำไม่ทับ
{
  const first = receiveDepositFirst(base(), AT);
  const again = receiveDepositFirst({ ...first, status: "รอตรวจแบบ" }, "2026-10-01T00:00:00.000Z");
  assert.equal(again.deposit?.firstPaidAt, AT);
  assert.equal(again.status, "รอตรวจแบบ");
  assert.equal(again.paidTotal, 15461.5);
  ok("เรียกซ้ำบนใบที่รับงวดแรกแล้ว = ไม่เปลี่ยนอะไร");
}
// 4) ใบธรรมดา (ไม่มี deposit) → คืนใบเดิม
{
  const o = base({ deposit: undefined });
  assert.equal(receiveDepositFirst(o, AT), o);
  ok("ใบไม่ใช่มัดจำ = ไม่แตะ");
}
// 5) ใบที่แบบเดินไปแล้ว (สถานะขั้นแบบ ไม่ใช่หน้าประตูการเงิน) → ตั้งงวดแรกแต่ไม่ถอยสถานะ
{
  const o = receiveDepositFirst(base({ status: "อนุมัติแบบ" }), AT);
  assert.equal(o.status, "อนุมัติแบบ");
  assert.equal(o.deposit?.firstPaidAt, AT);
  assert.equal(o.paidTotal, 15461.5);
  ok("ใบขั้นแบบ: ตั้งงวดแรก สถานะคงเดิม");
}
// 6) เคยนับยอดบางส่วน (credited) มากกว่ามัดจำ → ไม่ถอย paidTotal ลง
{
  const o = receiveDepositFirst(base({ paidTotal: 16000, slipVerify: { status: "fail", credited: 16000 } as Order["slipVerify"] }), AT);
  assert.equal(o.paidTotal, 16000);
  ok("นับบางส่วนไว้มากกว่ามัดจำ = คงยอดที่มากกว่า");
}
// 7) มัดจำตั้งเกินยอดบิล → ไม่เกิน orderTotal
{
  const o = receiveDepositFirst(base({ deposit: { amount: 99999 } }), AT);
  assert.equal(o.paidTotal, 30923);
  ok("มัดจำเกินบิล = ตัดที่ยอดบิล");
}
// 8) 💸 ลูกค้าโอนงวดแรกขาด (OD-261007-2540) → นับเท่าที่ได้ · ส่วนขาดยกไปงวด 2 · หัก ณ ที่จ่ายงวดแรกคงเดิม
{
  const b = base();
  const before = depositInstallments(b)!;
  const net = before.firstNet - 1313; // เงินเข้าจริงขาด 1,313
  const o = receiveDepositFirst(b, AT, net + before.firstWht);
  const inst = depositInstallments(o)!;
  assert.equal(o.deposit?.firstShort, 1313);
  assert.equal(o.deposit?.amount, 15461.5);
  assert.equal(inst.firstWht, before.firstWht);
  assert.equal(inst.firstNet, Math.round(net * 100) / 100);
  assert.equal(inst.secondNet, Math.round((before.secondNet + 1313) * 100) / 100);
  assert.equal(orderBalance(o), Math.round((before.second + 1313) * 100) / 100);
  assert.equal(amountDueNow(o), orderBalance(o));
  assert.equal(o.status, "ชำระแล้ว");
  ok("โอนขาด = งวด 2 รับส่วนที่ขาดเพิ่ม");
}
// 9) กรอกยอดเท่า/เกินงวด → ไม่ติดธงขาด
{
  const o = receiveDepositFirst(base(), AT, 15461.5);
  assert.equal(o.deposit?.firstShort, undefined);
  assert.equal(o.paidTotal, 15461.5);
  ok("กรอกครบ = ไม่มี firstShort");
}

// ── ➗🔄 depositFollowTotal — ยอดบิลเปลี่ยนหลังเปิดมัดจำ (OD-261007-2540 · 16 ต.ค. 69) ──
const bill2540 = (sub: number, vat: number, wht: number, over: Partial<Order> = {}): Order =>
  base({
    id: "OD-261007-2540",
    shippingCost: 0,
    items: [{ productId: "a", name: "Photo Frame", qty: 1, unitPrice: sub, selections: {} }],
    vat: { rate: 7, amount: vat },
    wht: { rate: 3, amount: wht },
    ...over,
  });
// 10) งวดแรกรับแล้ว + เคยบันทึกโอนขาด 1,313 (เทียบกับใบเก่า) → ซิงก์ใบใหม่: มัดจำ 66,192.88 → 64,842 · โอนขาดหาย · paidTotal ขยับตามฐานบิล
{
  const prev = bill2540(123725, 8660.75, 3711.75, { deposit: { amount: 66192.88, firstPaidAt: AT, firstShort: 1313 }, paidTotal: 64879.88, status: "อนุมัติแบบ" });
  assert.equal(depositInstallments(prev)!.firstNet, 63024);
  const synced = { ...prev, items: [{ ...prev.items[0], unitPrice: 121200 }], vat: { rate: 7, amount: 8484 }, wht: { rate: 3, amount: 3636 } };
  const r = depositFollowTotal(prev, synced);
  assert.equal(r.order.deposit?.amount, 64842);
  assert.equal(r.order.deposit?.firstShort, undefined);
  assert.equal(r.order.paidTotal, 64842);
  const inst = depositInstallments(r.order)!;
  assert.equal(inst.first, 64842);
  assert.equal(inst.firstNet, 63024);
  assert.equal(inst.secondNet, 63024);
  assert.equal(orderBalance(r.order), 64842);
  assert.ok(r.note?.includes("ลบ") && r.note.includes("1,313.00"), r.note);
  ok("2540: ซิงก์ใบที่ถูกแก้ → มัดจำ 64,842 · โอนขาด 1,313 หาย · งวด 2 โอนจริง 63,024");
}
// 11) ยังไม่รับงวดแรก → แค่ขยับยอดมัดจำตามสัดส่วน ไม่แตะ paidTotal
{
  const prev = bill2540(123725, 8660.75, 3711.75, { deposit: { amount: 66192.88 } });
  const r = depositFollowTotal(prev, { ...prev, items: [{ ...prev.items[0], unitPrice: 121200 }], vat: { rate: 7, amount: 8484 }, wht: { rate: 3, amount: 3636 } });
  assert.equal(r.order.deposit?.amount, 64842);
  assert.equal(r.order.paidTotal, undefined);
  ok("ยังไม่รับงวดแรก: ขยับยอดมัดจำอย่างเดียว");
}
// 12) ยอดรวมไม่เปลี่ยน / เก็บครบแล้ว / ไม่ใช่ใบมัดจำ → คืน next เดิม ไม่มี note
{
  const prev = bill2540(121200, 8484, 3636, { deposit: { amount: 64842 } });
  assert.equal(depositFollowTotal(prev, { ...prev }).note, undefined);
  const settled = bill2540(123725, 8660.75, 3711.75, { deposit: { amount: 66192.88, firstPaidAt: AT, settledAt: AT }, paidTotal: 132385.75 });
  assert.equal(depositFollowTotal(settled, { ...settled, vat: { rate: 7, amount: 8484 } }).order.deposit?.amount, 66192.88);
  assert.equal(depositFollowTotal(bill2540(1, 0, 0, { deposit: undefined }), bill2540(2, 0, 0, { deposit: undefined })).note, undefined);
  ok("ไม่เปลี่ยน/ครบแล้ว/ไม่ใช่มัดจำ = ไม่แตะ");
}
// 13) โอนขาดจริง (ไม่ใช่เพราะใบเก่า) → ซิงก์แล้วส่วนที่ขาดคิดใหม่ตามงวดใหม่ ไม่หาย
{
  const prev = bill2540(123725, 8660.75, 3711.75, { deposit: { amount: 66192.88, firstPaidAt: AT, firstShort: 4337 }, paidTotal: 61855.88 });
  assert.equal(depositInstallments(prev)!.firstNet, 60000);
  const r = depositFollowTotal(prev, { ...prev, items: [{ ...prev.items[0], unitPrice: 121200 }], vat: { rate: 7, amount: 8484 }, wht: { rate: 3, amount: 3636 } });
  assert.equal(r.order.deposit?.firstShort, 3024);
  assert.equal(depositInstallments(r.order)!.firstNet, 60000);
  assert.equal(r.order.paidTotal, 61818);
  ok("โอนขาดจริง: ส่วนที่ขาดคิดใหม่ 4,337 → 3,024 · เงินเข้าจริง 60,000 เท่าเดิม");
}
// 14) depositFirstNetPerDocChange — cron ติดธงเอกสารถูกแก้ → บอกงวดแรกที่ควรโอนตามใบใหม่
{
  const o = bill2540(123725, 8660.75, 3711.75, {
    deposit: { amount: 66192.88 },
    flowAccount: { url: "u", docType: "qt", docTypeLabel: "ใบเสนอราคา", docNo: "QT010841", grandTotal: 132385.75, wht: 3711.75, fetchedAt: AT, docChanged: { at: AT, total: 129684, wht: 3636, mismatch: true } },
  });
  const h = depositFirstNetPerDocChange(o)!;
  assert.deepEqual(h, { total: 129684, wht: 3636, firstNet: 63024 });
  assert.equal(depositFirstNetPerDocChange({ ...o, flowAccount: { ...o.flowAccount!, docChanged: undefined } }), null);
  assert.equal(depositFirstNetPerDocChange({ ...o, flowAccount: { ...o.flowAccount!, docChanged: { at: AT, total: 129684, wht: 3636, mismatch: false } } }), null);
  ok("เอกสารถูกแก้: งวดแรกตามใบใหม่ = 63,024 (ตรงที่ลูกค้าโอน)");
}
console.log(`\n✅ deposit-first ผ่าน ${n} เคส`);
