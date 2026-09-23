/**
 * 🚦 เทส "ขั้นแบบงานห้ามข้ามประตูการเงิน" — npx tsx --tsconfig tsconfig.json scripts/proof-stage-test.mts
 *
 * เคสจริงที่ทำให้ต้องมีกติกานี้ (OD-260915-7543 · เจ้าของร้านแจ้ง 23 ก.ย. 69):
 *   16 ก.ย. สลิปใบแรก 5,294 ผ่าน → ใบเดินถึง "อนุมัติแบบ"
 *   22 ก.ย. ลูกค้าสั่งเพิ่ม ยอดโตเป็น 7,631 → ใบเด้งกลับ "รอชำระเงิน" (reopenedFrom = "อนุมัติแบบ") ค้าง 2,337
 *          แนบสลิปอีก 3 ใบ SlipOK ตรวจไม่ผ่านสักใบ (สลิป K BIZ ไม่มี QR) — ยังไม่มีใครนับยอด
 *          กราฟฟิกส่งแบบใหม่ ลูกค้ากดอนุมัติ → /api/orders/review เขียน status = "อนุมัติแบบ" ทับ
 *          → ใบดูเหมือนจ่ายครบ (ป้ายสลิปใบแรกกลายเป็น "ผ่าน" เพราะคิดจากสถานะ) เข้าคิวปริ้น/ส่งผลิต
 *
 * กติกา (src/lib/admin-data.ts): ค้างเงินอยู่ → ขั้นแบบไปจำที่ proofStage สถานะบนใบไม่ขยับ
 * เงินเข้าครบเมื่อไหร่ ทุกทางรับเงินพากลับขั้นที่จำไว้ด้วย stageAfterPayment()
 */
import { awaitingPayment, effectiveStage, paidStatusFor, stageAfterPayment, withProofStage, type Order } from "../src/lib/admin-data";

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

// ── ใบปกติ (เงินเข้าแล้ว) — ขั้นแบบเขียนลงสถานะตรง ๆ เหมือนเดิม ────────────────────
eq("เงินเข้าแล้ว: ส่งแบบ → รอตรวจแบบ", withProofStage(mk({ status: "ชำระแล้ว" }), "รอตรวจแบบ").status, "รอตรวจแบบ");
eq("เงินเข้าแล้ว: อนุมัติ → อนุมัติแบบ", withProofStage(mk({ status: "รอตรวจแบบ" }), "อนุมัติแบบ").status, "อนุมัติแบบ");
eq("เงินเข้าแล้ว: ไม่ต้องจำขั้นไว้", withProofStage(mk({ status: "ชำระแล้ว" }), "รอตรวจแบบ").proofStage, undefined);
eq("ใบยกเลิก: ไม่แตะอะไรเลย", withProofStage(mk({ status: "ยกเลิก" }), "อนุมัติแบบ").status, "ยกเลิก");

// ── เคสจริง OD-260915-7543 ────────────────────────────────────────────────────────
/** ใบหลังเด้งกลับเพราะสั่งเพิ่ม — สลิปใบใหม่ยังไม่มีใครนับยอด */
const reopened = mk({
  status: "รอชำระเงิน",
  reopenedFrom: "อนุมัติแบบ",
  paidTotal: 5294,
  items: [{ productId: "1-4", name: "สแตนดี้อะคริลิค", qty: 1, unitPrice: 7631 }],
  payments: [{ id: "p1", path: "x.jpg", at: "2026-09-22T11:17:01.740Z", by: "ToEy", verify: { status: "fail", at: "2026-09-22T11:17:01.740Z" } }],
});
eq("ใบเด้งกลับ: ยังอยู่หน้าประตูการเงิน", awaitingPayment(reopened), true);

const afterProof = withProofStage(reopened, "รอตรวจแบบ");
eq("ค้างเงิน: กราฟฟิกส่งแบบ สถานะไม่ขยับ", afterProof.status, "รอชำระเงิน");
eq("ค้างเงิน: ขั้นแบบไปอยู่ที่ proofStage", afterProof.proofStage, "รอตรวจแบบ");

const afterApprove = withProofStage(afterProof, "อนุมัติแบบ");
eq("ค้างเงิน: ลูกค้าอนุมัติแบบ สถานะยังไม่ข้ามประตู", afterApprove.status, "รอชำระเงิน");
eq("ค้างเงิน: จำไว้ว่าอนุมัติแบบแล้ว", afterApprove.proofStage, "อนุมัติแบบ");
eq("ค้างเงิน: บอร์ดกราฟฟิกเห็นขั้นจริง", effectiveStage(afterApprove), "อนุมัติแบบ");

// เงินเข้าครบ → กลับไปขั้นแบบที่ทำไว้ ไม่ต้องตรวจแบบซ้ำ
eq("เงินครบ: กลับไปขั้นแบบที่จำไว้", stageAfterPayment(afterApprove), "อนุมัติแบบ");
eq("เงินครบ: ขั้นแบบใหม่ชนะขั้นก่อนถูกเด้ง", stageAfterPayment(withProofStage(reopened, "รอตรวจแบบ")), "รอตรวจแบบ");
eq("เงินครบ: ไม่มีอะไรจำไว้ → ใช้ขั้นก่อนถูกเด้ง", stageAfterPayment(reopened), "อนุมัติแบบ");
eq("เงินครบ: ใบใหม่ไม่มีทั้งสองอย่าง → ตามปกติ", stageAfterPayment(mk({ status: "รอตรวจสอบ" })), paidStatusFor(mk({ status: "รอตรวจสอบ" })));

// ── ขอแก้ไขแบบระหว่างค้างเงิน ─────────────────────────────────────────────────────
const askEdit = withProofStage(afterApprove, "แก้ไขแบบ");
eq("ค้างเงิน: ขอแก้ไขแบบ ก็ไม่ดันสถานะ", askEdit.status, "รอชำระเงิน");
eq("เงินครบ: กลับไป แก้ไขแบบ ไม่ใช่ อนุมัติแบบ", stageAfterPayment(askEdit), "แก้ไขแบบ");

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส\n\n${fails.join("\n\n")}\n` : "");
console.log(`${fails.length ? "❌" : "✅"} ผ่าน ${pass}/${pass + fails.length} เคส`);
process.exit(fails.length ? 1 : 0);
