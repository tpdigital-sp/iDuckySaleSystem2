/**
 * 🎨↩ เทส "รายการใหม่ยังไม่มีแบบ → ใบกลับไปรอทำแบบ" — npm run check:proof-reset
 *
 * เคสจริง (กราฟฟิกแจ้ง 21 ต.ค. 69): ลูกค้าอนุมัติแบบแล้ว แอดมินลบรายการแล้วเพิ่มใหม่ในใบเดิม
 * → ใบค้าง "อนุมัติแบบ" ทั้งที่รายการใหม่ไม่มีแบบ คิวกราฟฟิก (ชำระแล้ว/รอตรวจสอบ) ไม่เห็นงานนี้
 * กติกาอยู่ที่ resetProofStageForNewWork (src/lib/admin-data.ts) — ใช้ทั้ง PATCH แอดมิน และ /api/orders/append
 */
import { resetProofStageForNewWork, stageAfterPayment, type Order, type OrderItem } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

const approved: OrderItem = {
  productId: "1-4",
  name: "สแตนดี้อะคริลิค",
  qty: 10,
  unitPrice: 50,
  proofs: [{ url: "p1.jpg", at: "2026-10-20T03:00:00.000Z", review: "อนุมัติ" }],
  proofStatus: "อนุมัติ",
} as OrderItem;
const fresh: OrderItem = { productId: "2-1", name: "พวงกุญแจอะคริลิค", qty: 10, unitPrice: 50 } as OrderItem;
const noProof: OrderItem = { productId: "sp-1", name: "กล่องใส่งาน", qty: 1, unitPrice: 20, noProof: { by: "แอดมิน", at: "2026-10-21T00:00:00.000Z" } } as OrderItem;
const fee: OrderItem = { productId: "sp-2", name: "ค่าตัดไฟล์", qty: 1, unitPrice: 100 } as OrderItem;

const mk = (o: Partial<Order>): Order =>
  ({
    id: "OD-TEST",
    date: "",
    customer: "",
    phone: "",
    address: "",
    status: "อนุมัติแบบ",
    payment: "โอนธนาคาร",
    shipping: "",
    shippingCost: 0,
    paidTotal: 500,
    items: [approved],
    ...o,
  }) as Order;

// ── เคสหลัก: ลบรายการที่อนุมัติแล้ว → เพิ่มรายการใหม่ (2 ครั้งบันทึก) ───────────────────────
const base = mk({ items: [approved] });
const afterDelete = mk({ items: [] });
eq("ลบอย่างเดียว: ไม่มีรายการขาดแบบ → ไม่แตะสถานะ", resetProofStageForNewWork(base, afterDelete), null);

const afterAdd = mk({ items: [fresh] });
const r1 = resetProofStageForNewWork(afterDelete, afterAdd);
eq("เพิ่มใหม่ ยอดเท่าเดิม: อนุมัติแบบ → ชำระแล้ว", r1?.order.status, "ชำระแล้ว");
eq("เพิ่มใหม่: จำว่าถอยจากขั้นไหน", r1?.from, "อนุมัติแบบ");
eq("เพิ่มใหม่: log บอกชื่อรายการที่ขาด", r1?.note.includes("พวงกุญแจอะคริลิค"), true);

// ── เพิ่มรายการพิเศษเข้าใบที่ยังมีรายการเดิมอยู่ (ไม่ได้ลบ) ────────────────────────────
const r2 = resetProofStageForNewWork(base, mk({ items: [approved, fresh] }));
eq("เพิ่มรายการใหม่ข้างรายการเดิม: ถอยไปชำระแล้ว", r2?.order.status, "ชำระแล้ว");
eq("รายการเดิมยังอนุมัติอยู่ (ไม่แตะ proofStatus)", r2?.order.items[0].proofStatus, "อนุมัติ");
eq("รอตรวจแบบ + รายการใหม่: ถอยไปชำระแล้วเช่นกัน", resetProofStageForNewWork(mk({ status: "รอตรวจแบบ" }), mk({ status: "รอตรวจแบบ", items: [approved, fresh] }))?.order.status, "ชำระแล้ว");
eq("แก้ไขแบบ + รายการใหม่: ถอยไปชำระแล้ว", resetProofStageForNewWork(mk({ status: "แก้ไขแบบ" }), mk({ status: "แก้ไขแบบ", items: [approved, fresh] }))?.order.status, "ชำระแล้ว");

// ── ของที่ไม่ต้องทำแบบ ไม่นับ ───────────────────────────────────────────────────────────
eq("ติ๊กไม่ต้องทำแบบ: ไม่ถอย", resetProofStageForNewWork(base, mk({ items: [approved, noProof] })), null);
eq("บรรทัดค่าบริการ (ค่า…): ไม่ถอย", resetProofStageForNewWork(base, mk({ items: [approved, fee] })), null);
eq("รายการใหม่มีแบบมาแล้ว (จอออกแบบ): ไม่ถอย", resetProofStageForNewWork(base, mk({ items: [approved, { ...fresh, proofs: approved.proofs }] })), null);

// ── แก้รายการเดิม (จำนวน/ราคา) ไม่นับว่าเป็นงานใหม่ ─────────────────────────────────────
eq("แก้จำนวนรายการเดิม: ไม่ถอย", resetProofStageForNewWork(base, mk({ items: [{ ...approved, qty: 20 }] })), null);
eq("ลบแบบของรายการเดิมทิ้ง (ต้องทำใหม่): ถอยไปชำระแล้ว", resetProofStageForNewWork(base, mk({ items: [{ ...approved, proofs: [], proofStatus: undefined }] }))?.order.status, "ชำระแล้ว");
eq("รูปถูกล้างตามนโยบาย (imagesPurgedAt): ไม่นับว่าขาดแบบ", resetProofStageForNewWork(base, mk({ imagesPurgedAt: "2026-10-16T00:00:00.000Z", items: [{ ...approved, proofs: [] }] })), null);

// ── ขั้นที่ไม่ใช่ขั้นแบบงาน ไม่แตะ ────────────────────────────────────────────────────────
eq("ชำระแล้วอยู่แล้ว: ไม่ต้องทำอะไร", resetProofStageForNewWork(mk({ status: "ชำระแล้ว" }), mk({ status: "ชำระแล้ว", items: [approved, fresh] })), null);
eq("กำลังผลิต: ไม่แตะ (ด่านปริ้นดูแล)", resetProofStageForNewWork(mk({ status: "กำลังผลิต" }), mk({ status: "กำลังผลิต", items: [approved, fresh] })), null);
eq("ยกเลิก: ไม่แตะ", resetProofStageForNewWork(mk({ status: "ยกเลิก" }), mk({ status: "ยกเลิก", items: [approved, fresh] })), null);

// ── ยอดโต → เด้งไปรอชำระเงินแล้ว (reopenedFrom = อนุมัติแบบ) ต้องแก้ความจำให้กลับ "ชำระแล้ว" ─────
const reopened = mk({ status: "รอชำระเงิน", reopenedFrom: "อนุมัติแบบ", items: [approved, { ...fresh, unitPrice: 80 }] });
const r3 = resetProofStageForNewWork(base, reopened);
eq("เด้งกลับรอชำระเงิน: สถานะยังค้างหน้าประตูเงิน", r3?.order.status, "รอชำระเงิน");
eq("เด้งกลับ: ความจำเปลี่ยนเป็นชำระแล้ว (ไม่ใช่อนุมัติแบบ)", r3?.order.reopenedFrom, "ชำระแล้ว");
eq("เด้งกลับ: เงินเข้าครบแล้วกลับไปชำระแล้ว = คิวกราฟฟิก", r3 ? stageAfterPayment(r3.order) : null, "ชำระแล้ว");
eq("เด้งกลับ: จำว่าเดิมจะกลับไปอนุมัติแบบ", r3?.from, "อนุมัติแบบ");

// ค้างเงินอยู่แล้ว + ลูกค้าเคยอนุมัติแบบระหว่างค้างเงิน (proofStage) → เพิ่มของใหม่ ต้องล้าง proofStage
const unpaidApproved = mk({ status: "รอชำระเงิน", proofStage: "อนุมัติแบบ", paidTotal: 0 });
const r4 = resetProofStageForNewWork(unpaidApproved, { ...unpaidApproved, items: [approved, fresh] });
eq("ค้างเงิน + proofStage อนุมัติแบบ: ล้าง proofStage", r4?.order.proofStage, undefined);
eq("ค้างเงิน: ไม่มี reopenedFrom ก็ไม่ปั้นขึ้นมา", r4?.order.reopenedFrom, undefined);
eq("ค้างเงิน: เงินเข้าแล้วไป ชำระแล้ว", r4 ? stageAfterPayment(r4.order) : null, "ชำระแล้ว");

// เด้งกลับจาก "กำลังผลิต" (reopenedFrom = กำลังผลิต) → ไม่ใช่ขั้นแบบ ไม่แตะ
eq("reopenedFrom กำลังผลิต: ไม่แตะ", resetProofStageForNewWork(mk({ status: "กำลังผลิต" }), mk({ status: "รอชำระเงิน", reopenedFrom: "กำลังผลิต", items: [approved, fresh] })), null);
// รอชำระเงินธรรมดา (ยังไม่เคยจ่าย ไม่มีความจำ) → stageAfterPayment = ชำระแล้วอยู่แล้ว ไม่ต้องทำอะไร
eq("ใบยังไม่เคยจ่าย: ไม่แตะ", resetProofStageForNewWork(mk({ status: "รอชำระเงิน", paidTotal: undefined }), mk({ status: "รอชำระเงิน", paidTotal: undefined, items: [approved, fresh] })), null);

// ── ใบใหม่ไม่มี prev (ทางสร้างใบ) — ไม่ควรมีใครเรียก แต่ถ้าเรียกต้องไม่พัง ─────────────────
eq("ไม่มี prev: นับจาก 0", resetProofStageForNewWork(null, mk({ items: [fresh] }))?.order.status, "ชำระแล้ว");

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส\n\n${fails.join("\n\n")}\n` : "");
console.log(`${fails.length ? "❌" : "✅"} ผ่าน ${pass}/${pass + fails.length} เคส`);
process.exit(fails.length ? 1 : 0);
