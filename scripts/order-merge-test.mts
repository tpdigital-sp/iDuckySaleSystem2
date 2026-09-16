/**
 * 🧭 เทสตัวรวม 3 ทางของ PATCH /api/admin/orders — npx tsx --tsconfig tsconfig.json scripts/order-merge-test.mts
 *
 * ต่อจาก OD-260915-6742 (16 ก.ย. 69): หน้าออเดอร์ส่งออเดอร์ทั้งก้อน → หน้าจอค้างทับงานคนอื่นได้ทุกช่อง
 * แก้: หน้าจอส่งรายชื่อช่องที่แก้จริง (changedOrderKeys เทียบกับก้อนล่าสุดจากเซิร์ฟเวอร์) → เซิร์ฟเวอร์เอาช่องที่ไม่ได้แก้จากฐาน (applyChangedKeys)
 */
import { applyChangedKeys, keepCustomerVerdict, parseChangedKeys } from "../src/lib/server/order-merge";
import type { OrderItem } from "../src/lib/admin-data";
import { changedOrderKeys } from "../src/lib/order-repo";
import type { Order } from "../src/lib/admin-data";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};
const mk = (o: Partial<Order>): Order =>
  ({ id: "OD-TEST", date: "", customer: "A", phone: "", address: "", status: "รอชำระเงิน", payment: "โอนธนาคาร", shipping: "", shippingCost: 0, items: [{ productId: "p1", name: "ของ 1", qty: 1, unitPrice: 100 }], ...o }) as Order;

// ── หน้าจอ: หาว่าแก้ช่องไหน ─────────────────────────────────────────────────────
const base = mk({ savedAt: "2026-09-16T01:00:00Z" });
eq("ไม่แก้อะไร = ลิสต์ว่าง", changedOrderKeys(base, base), []);
eq("แก้ที่อยู่ = ['address']", changedOrderKeys({ ...base, address: "ใหม่" }, base), ["address"]);
eq("เพิ่มช่องใหม่ที่ base ไม่มี (ติ๊กงานเร่ง)", changedOrderKeys({ ...base, rush: true }, base), ["rush"]);
eq("ลบช่องที่ base มี (ยกเลิกติ๊ก)", changedOrderKeys(base, { ...base, rush: true }), ["rush"]);
eq("ค่าเท่ากันแต่ undefined vs ไม่มี key = ไม่นับ", changedOrderKeys({ ...base, rush: undefined }, base), []);
eq("ไม่มี base (ยังโหลดไม่เสร็จ) = null → ไม่ส่ง header", changedOrderKeys(base, null), null);
eq("base คนละใบ = null (กันส่งผิดใบ)", changedOrderKeys(base, { ...base, id: "OD-OTHER" }), null);

// ── เซิร์ฟเวอร์: header ────────────────────────────────────────────────────────
eq("อ่าน header", [...parseChangedKeys(encodeURIComponent(JSON.stringify(["address", "items"])))!], ["address", "items"]);
eq("ไม่มี header = null", parseChangedKeys(null), null);
eq("header พัง = null (ทำแบบเดิม)", parseChangedKeys("%%%"), null);
eq("header ไม่ใช่ array = null", parseChangedKeys(encodeURIComponent('{"a":1}')), null);

// ── เคสหน้าจอค้าง: ทางอื่นเขียนไประหว่างหน้าเปิด ─────────────────────────────────
/** ฐาน ณ ตอนบันทึก — มีของที่เกิดหลังหน้าจอโหลด */
const db = mk({
  items: [{ productId: "p1", name: "ของ 1", qty: 1, unitPrice: 100 }, { productId: "p2", name: "ลูกค้าสั่งเพิ่ม", qty: 2, unitPrice: 50, addedAt: "2026-09-16T01:10:00Z" }],
  editRequest: { text: "ขอเปลี่ยนสี", at: "2026-09-16T01:11:00Z" },
  lineUserId: "Uabc",
  productionSent: { by: "น้องปริ้น", at: "2026-09-16T01:12:00Z" },
  printedAt: "2026-09-16T01:13:00Z",
  savedAt: "2026-09-16T01:13:00Z",
} as Partial<Order>);
/** หน้าจอค้าง: โหลดตอน 01:00 (ไม่มีของพวกนั้น) แล้วแก้แค่ที่อยู่ */
const stale = { ...base, address: "ที่อยู่ใหม่" };
const changed = new Set(changedOrderKeys(stale, base)!);
const r = applyChangedKeys(db, { ...stale, items: db.items }, new Set([...changed, "items"]));
eq("ที่อยู่ที่แอดมินแก้ = ของหน้าจอ", r.order.address, "ที่อยู่ใหม่");
eq("คำขอแก้ไขของลูกค้าไม่หาย", r.order.editRequest?.text, "ขอเปลี่ยนสี");
eq("ผูกไลน์ไม่หาย", r.order.lineUserId, "Uabc");
eq("ติ๊กส่งผลิต/เวลาปริ้นไม่หาย", [!!r.order.productionSent, r.order.printedAt], [true, "2026-09-16T01:13:00Z"]);
eq("จดว่าคงอะไรไว้ (ไว้ลง log) — savedAt/log ไม่รายงาน (เซิร์ฟเวอร์เป็นเจ้าของ ไม่งั้นรกทุกครั้ง)", r.restored.sort(), ["editRequest", "lineUserId", "printedAt", "productionSent"].sort());
eq("savedAt ยังถูกคงจากฐานอยู่ (แค่ไม่รายงาน)", r.order.savedAt, "2026-09-16T01:13:00Z");

// items: route ตัดสินเองว่าหน้าจอแตะไหม — ถ้าไม่แตะเอาชุดฐาน (รวมของที่ลูกค้าสั่งเพิ่ม)
eq("หน้าจอไม่แตะ items → route ใช้ db.items (2 รายการ)", changed.has("items"), false);

// ── หน้าจอสด: แก้หลายช่องรวมลบช่อง ─────────────────────────────────────────────
const fresh = { ...db, rush: undefined, productionSent: undefined, status: "กำลังผลิต" } as Order; // แอดมินยกเลิกติ๊กส่งผลิต + เปลี่ยนสถานะ
const ch2 = new Set(changedOrderKeys(fresh, db)!);
const r2 = applyChangedKeys(db, fresh, ch2);
eq("ยกเลิกติ๊กส่งผลิตจากหน้าจอสด = ลบได้", r2.order.productionSent, undefined);
eq("เปลี่ยนสถานะได้", r2.order.status, "กำลังผลิต");
eq("ไม่มีอะไรถูกคงทับ", r2.restored, []);

// ── ไม่มี header = ทำแบบเดิม (หน้าจออื่น/เวอร์ชันเก่า) ───────────────────────────────
const r3 = applyChangedKeys(db, stale, null);
eq("ไม่มี header: ก้อนจากหน้าจอเป็นหลักตามเดิม (editRequest หาย — พฤติกรรมเดิมที่ยอมรับสำหรับหน้าอื่น)", [r3.order.editRequest, r3.restored], [undefined, []]);

// ── ค่าเท่ากันไม่ถูกนับว่า "คง" (ไม่ให้ log รก) ─────────────────────────────────────
eq("บันทึกปกติจากหน้าจอสด แก้ช่องเดียว = restored ว่าง", applyChangedKeys(db, { ...db, address: "x" }, new Set(["address"])).restored, []);
eq("id ไม่ถูกแตะแม้ไม่อยู่ในลิสต์", applyChangedKeys(db, { ...db, address: "x" }, new Set(["address"])).order.id, "OD-TEST");

// ── 🧑‍⚖️ ผลตรวจแบบของลูกค้า — หน้าจอค้างทับไม่ได้ (OD-260915-5892 · 16 ก.ย. 69) ──────────────────
const P1 = "https://x/proofs/a.jpg";
const P2 = "https://x/proofs/b.jpg";
/** ฐาน: ลูกค้าอนุมัติแล้วตอน 05:31 */
const approvedItem: OrderItem = {
  productId: "p1", name: "สายคล้องคอ", qty: 20, unitPrice: 90,
  proofs: [{ url: P1, at: "2026-09-16T05:03:18Z", by: "bt", review: "อนุมัติ", reviewAt: "2026-09-16T05:31:23Z" }],
  proofStatus: "อนุมัติ", proofReviewedAt: "2026-09-16T05:31:23Z",
};
/** หน้าจอโหลดไว้ 05:03 (ก่อนลูกค้ากด) แล้วติ๊ก "มีงานตัวอย่าง" → ส่งรายการทั้งก้อนแบบเก่า */
const staleItem: OrderItem = {
  ...approvedItem, proofs: [{ url: P1, at: "2026-09-16T05:03:18Z", by: "bt" }], proofStatus: "รอตรวจ", proofReviewedAt: undefined,
  sampleRequired: { by: "โดนัท", at: "2026-09-16T05:44:56Z" },
};
const k1 = keepCustomerVerdict(approvedItem, staleItem, "2026-09-16T05:03:24Z");
eq("หน้าจอค้างติ๊กงานตัวอย่าง: ผลอนุมัติทั้งรายการยังอยู่", k1.proofStatus, "อนุมัติ");
eq("…review ต่อรูปยังอยู่ (พร้อมเวลา)", [k1.proofs?.[0].review, k1.proofs?.[0].reviewAt], ["อนุมัติ", "2026-09-16T05:31:23Z"]);
eq("…ติ๊กของหน้าจอยังติดตามปกติ", k1.sampleRequired?.by, "โดนัท");
eq("…เวลาตัดสินติดกลับมาด้วย", k1.proofReviewedAt, "2026-09-16T05:31:23Z");

// ใบเก่าที่ยังไม่มี reviewAt/proofReviewedAt (ตรวจก่อนวันนี้) — กติกา "รีเซ็ตเป็นรอตรวจโดยไม่มีรูปใหม่ = ค้าง" ยังคุ้มครอง
const legacy: OrderItem = { ...approvedItem, proofs: [{ url: P1, at: "2026-09-16T05:03:18Z", review: "อนุมัติ" }], proofReviewedAt: undefined };
const k2 = keepCustomerVerdict(legacy, staleItem, "2026-09-16T05:03:24Z");
eq("ใบเก่าไม่มีประทับเวลา: รอตรวจโดยไม่มีรูปใหม่ = คงอนุมัติ", [k2.proofStatus, k2.proofs?.[0].review], ["อนุมัติ", "อนุมัติ"]);

// กราฟฟิกอัปรูปใหม่ (มี url ใหม่) → รีเซ็ตเป็น "รอตรวจ" ได้ตามเดิม แต่ review ของรูปเดิมไม่หาย
const reupload: OrderItem = { ...staleItem, proofs: [...(staleItem.proofs ?? []), { url: P2, at: "2026-09-16T06:00:00Z", by: "bt" }], sampleRequired: undefined };
const k3 = keepCustomerVerdict(approvedItem, reupload, "2026-09-16T05:03:24Z");
eq("อัปรูปใหม่: รายการกลับเป็นรอตรวจได้", k3.proofStatus, "รอตรวจ");
eq("…รูปเดิมยังจำว่าลูกค้าอนุมัติไว้ · รูปใหม่ยังไม่มีผล", [k3.proofs?.[0].review, k3.proofs?.[1].review], ["อนุมัติ", undefined]);

// ลบรูปหมด → proofStatus ว่างได้ (ไม่ใช่การรีเซ็ต)
const k4 = keepCustomerVerdict(approvedItem, { ...staleItem, proofs: [], proofStatus: undefined }, "2026-09-16T05:03:24Z");
eq("ลบรูปหมด: สถานะแบบว่างตามที่หน้าจอสั่ง", k4.proofStatus, undefined);

// ลูกค้าขอแก้ไขพร้อมคอมเมนต์ → หน้าจอค้างส่งรอตรวจมา = คงขอแก้ไข+คอมเมนต์
const editItem: OrderItem = { ...approvedItem, proofs: [{ url: P1, at: "2026-09-16T05:03:18Z", review: "ขอแก้ไข", reviewNote: "ขอเปลี่ยนสี", reviewAt: "2026-09-16T05:31:23Z" }], proofStatus: "ขอแก้ไข", proofNote: "รูปที่ 1: ขอเปลี่ยนสี" };
const k5 = keepCustomerVerdict(editItem, staleItem, "2026-09-16T05:03:24Z");
eq("ขอแก้ไข+คอมเมนต์ไม่หาย", [k5.proofStatus, k5.proofNote, k5.proofs?.[0].reviewNote], ["ขอแก้ไข", "รูปที่ 1: ขอเปลี่ยนสี", "ขอเปลี่ยนสี"]);

// หน้าจอสด (เห็นผลตรวจแล้ว) ส่งค่าเดิมกลับมา = ไม่แตะอะไร
const k6 = keepCustomerVerdict(approvedItem, { ...approvedItem, sampleRequired: { by: "โดนัท", at: "x" } }, "2026-09-16T05:32:00Z");
eq("หน้าจอสดส่งค่าเดิม = เหมือนเดิมทุกช่อง", [k6.proofStatus, k6.proofs?.[0].review], ["อนุมัติ", "อนุมัติ"]);

// ไม่มีของเดิม (รายการใหม่) = เอาของหน้าจอ
eq("รายการใหม่ไม่มีฐาน = ของหน้าจอ", keepCustomerVerdict(undefined, staleItem, "").proofStatus, "รอตรวจ");

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส\n\n${fails.join("\n\n")}\n` : "");
console.log(`${fails.length ? "❌" : "✅"} ผ่าน ${pass}/${pass + fails.length} เคส`);
process.exit(fails.length ? 1 : 0);
