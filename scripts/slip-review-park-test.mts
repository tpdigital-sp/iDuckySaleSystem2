/**
 * 🚦 เทส "สลิปที่ SlipOK ตก/โอนขาด ต้องพาใบเข้า รอตรวจสอบ แม้งานเดินไปแล้ว" — npm run check:slip-review
 *
 * เคสจริง (OD-260911-8026 · เจ้าของร้านถาม 2 ต.ค. 69): ใบมัดจำ 50% อยู่ "อนุมัติแบบ" (ส่งผลิต 14 ก.ย.)
 *   พนักงานแนบสลิปงวด 2 แทนลูกค้า (K BIZ ไม่มี QR) → SlipOK ตก → ได้แค่บรรทัดประวัติ สถานะยัง "อนุมัติแบบ"
 *   → ชิป "รอตรวจสอบ" ในหน้า /admin/orders ขึ้น 0 ทั้งที่มีสลิปรอคนตรวจ
 *
 * กติกา (src/lib/admin-data.ts parkForSlipReview): ตั้ง "รอตรวจสอบ" ทุก phase · จำขั้นเดิมไว้ที่ reopenedFrom (ชุด REOPEN_FOR_BALANCE)
 *   · คิวปริ้น/แพ็ค/WIP ยังเห็นใบผ่าน queueStageOf/wipStageOf · เงินเข้า/รับยอดเอง → stageAfterPayment พากลับขั้นเดิม
 */
import { parkForSlipReview, queueStageOf, stageAfterPayment, waitingForBalanceFrom, type Order } from "../src/lib/admin-data";
import { hasPendingSlip, paymentEntries } from "../src/lib/payments";
import { isWipOrder, wipStageOf } from "../src/lib/wip-report";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

const mk = (o: Partial<Order>): Order =>
  ({
    id: "OD-TEST",
    date: "",
    customer: "",
    phone: "",
    address: "",
    status: "ชำระแล้ว",
    payment: "โอนธนาคาร",
    shipping: "",
    shippingCost: 0,
    items: [{ productId: "1-4", name: "สแตนดี้อะคริลิค", qty: 1, unitPrice: 100 }],
    ...o,
  }) as Order;

const failV = { status: "fail", at: "2026-10-02T02:26:50Z", detail: "ไม่มี QR" } as Order["slipVerify"];

// ── parkForSlipReview ───────────────────────────────────────────────────────
const parked = parkForSlipReview(mk({ status: "อนุมัติแบบ" }));
eq("อนุมัติแบบ + สลิปตก → รอตรวจสอบ", parked.status, "รอตรวจสอบ");
eq("จำขั้นเดิมไว้ที่ reopenedFrom", parked.reopenedFrom, "อนุมัติแบบ");
eq("กำลังผลิต ก็พักได้ (ชุดเดียวกับยอดโต)", parkForSlipReview(mk({ status: "กำลังผลิต" })).reopenedFrom, "กำลังผลิต");
eq("รอชำระเงิน → รอตรวจสอบ (ไม่มี reopenedFrom)", parkForSlipReview(mk({ status: "รอชำระเงิน" })), mk({ status: "รอตรวจสอบ" }));
eq(
  "รอชำระเงินที่เด้งมาจากยอดโต → รอตรวจสอบ คง reopenedFrom เดิม",
  parkForSlipReview(mk({ status: "รอชำระเงิน", reopenedFrom: "กำลังผลิต" })).reopenedFrom,
  "กำลังผลิต"
);
eq("รอตรวจสอบอยู่แล้ว = ไม่แตะ", parkForSlipReview(mk({ status: "รอตรวจสอบ", reopenedFrom: "อนุมัติแบบ" })).reopenedFrom, "อนุมัติแบบ");
eq("พักซ้ำไม่ทับ reopenedFrom", parkForSlipReview(parked).reopenedFrom, "อนุมัติแบบ");
eq("จัดส่งแล้ว ไม่ถอย", parkForSlipReview(mk({ status: "จัดส่งแล้ว" })).status, "จัดส่งแล้ว");
eq("เสร็จสิ้น ไม่ถอย", parkForSlipReview(mk({ status: "เสร็จสิ้น" })).status, "เสร็จสิ้น");
eq("ยกเลิก ไม่ถอย", parkForSlipReview(mk({ status: "ยกเลิก" })).status, "ยกเลิก");

// ── คิวงานยังเห็นใบที่ถูกพัก ───────────────────────────────────────────────
eq("queueStageOf มองใบที่พักเป็นขั้นเดิม", queueStageOf(parked), "อนุมัติแบบ");
eq("waitingForBalanceFrom ติดป้ายได้", waitingForBalanceFrom(parked), "อนุมัติแบบ");
eq("wipStageOf ตรงกัน", wipStageOf(parked), "อนุมัติแบบ");
eq("ยังอยู่ในรายงาน WIP", isWipOrder(parked), true);
eq("รอตรวจสอบธรรมดา (ยังไม่เคยจ่าย) ไม่เข้า WIP", isWipOrder(mk({ status: "รอตรวจสอบ" })), false);

// ── เงินเข้า → กลับขั้นเดิม ──────────────────────────────────────────────
eq("stageAfterPayment พากลับ อนุมัติแบบ", stageAfterPayment(parked), "อนุมัติแบบ");
eq("ขั้นแบบที่เดินระหว่างพัก ชนะ reopenedFrom", stageAfterPayment({ ...parked, proofStage: "รอตรวจแบบ" }), "รอตรวจแบบ");

// ── paymentEntries: ใบแรกที่เคยยืนยันแล้วต้องไม่กลายเป็น "ตก" ตอนใบถูกพัก ───
const normalParked = parkForSlipReview(
  mk({
    status: "กำลังผลิต",
    paidTotal: 100,
    slipPath: "a.jpg",
    slipVerify: failV, // ใบแรก SlipOK ตก แต่แอดมินยืนยันเงินเข้าเองไปแล้ว
    charges: [{ id: "c1", label: "ค่าส่งเพิ่ม", amount: 50, at: "2026-10-01T00:00:00Z", by: "x" }],
    payments: [{ id: "p1", path: "b.jpg", at: "2026-10-02T00:00:00Z", by: "แอดมิน", verify: failV, expected: 50 }],
  } as Partial<Order>)
);
const ents = paymentEntries(normalParked);
eq("ใบแรกยังนับว่าผ่าน (reopenedFrom = เคยผ่านประตูเงิน)", ents[0].state, "pass");
eq("ใบเพิ่มที่ตก = fail", ents[1].state, "fail");
eq("hasPendingSlip เห็นใบเพิ่มที่ตก", hasPendingSlip(normalParked), true);

// ── ใบมัดจำ 8026 จำลอง ────────────────────────────────────────────────────
const dep8026 = mk({
  status: "อนุมัติแบบ",
  paidTotal: 10973.12,
  deposit: { amount: 10973.12, firstPaidAt: "2026-09-11T04:10:00Z" },
  slipPath: "first.jpg",
  slipVerify: failV,
  payments: [{ id: "pmu", path: "second.jpg", at: "2026-10-02T02:26:50Z", by: "Phinyada", verify: failV, expected: 10973.12 }],
  items: [{ productId: "x", name: "สติ๊กเกอร์", qty: 1, unitPrice: 20510.5 }],
} as Partial<Order>);
const p8026 = parkForSlipReview(dep8026);
eq("8026: เข้ารอตรวจสอบ", p8026.status, "รอตรวจสอบ");
eq("8026: งานยังอยู่ อนุมัติแบบ", queueStageOf(p8026), "อนุมัติแบบ");
eq("8026: ใบแรก (มัดจำ) ยังผ่าน", paymentEntries(p8026)[0].state, "pass");
eq("8026: ใบเพิ่มรอตรวจ", paymentEntries(p8026)[1].state, "fail");

console.log(`✅ ผ่าน ${pass} เคส${fails.length ? ` · ❌ ตก ${fails.length}` : ""}`);
for (const f of fails) console.log("❌ " + f);
if (fails.length) process.exit(1);
