/**
 * 🧭 เทสตัวรวม 3 ทางของ PATCH /api/admin/orders — npx tsx --tsconfig tsconfig.json scripts/order-merge-test.mts
 *
 * ต่อจาก OD-260915-6742 (16 ก.ย. 69): หน้าออเดอร์ส่งออเดอร์ทั้งก้อน → หน้าจอค้างทับงานคนอื่นได้ทุกช่อง
 * แก้: หน้าจอส่งรายชื่อช่องที่แก้จริง (changedOrderKeys เทียบกับก้อนล่าสุดจากเซิร์ฟเวอร์) → เซิร์ฟเวอร์เอาช่องที่ไม่ได้แก้จากฐาน (applyChangedKeys)
 */
import { applyChangedKeys, parseChangedKeys } from "../src/lib/server/order-merge";
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

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส\n\n${fails.join("\n\n")}\n` : "");
console.log(`${fails.length ? "❌" : "✅"} ผ่าน ${pass}/${pass + fails.length} เคส`);
process.exit(fails.length ? 1 : 0);
