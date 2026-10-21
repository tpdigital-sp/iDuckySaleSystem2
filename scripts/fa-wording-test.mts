/**
 * 🚫 เอกสาร FlowAccount ห้ามมีคำว่า "สกรีน" (ลูกค้านิติบุคคลจะต้องหัก ณ ที่จ่าย 3%) → แทนเป็น "พิมพ์" ตอนร่างทุกใบ
 * พนักงานบัญชีแจ้ง 21 ต.ค. 69 (OD-261021-9043 QT010967 "- งานสกรีน: สกรีน 1 ด้าน (ใต้)")
 *   npm run check:fa-wording
 */
import assert from "node:assert/strict";
import { quotationDraft, extraQuotationDraft, faWording } from "@/lib/server/fa-create";
import type { Order } from "@/lib/admin-data";

assert.equal(faWording("งานสกรีน: สกรีน 1 ด้าน (ใต้)"), "งานพิมพ์: พิมพ์ 1 ด้าน (ใต้)");
assert.equal(faWording("ค่าสกรีนฐาน"), "ค่าพิมพ์ฐาน");
assert.equal(faWording("ไม่มีคำต้องห้าม"), "ไม่มีคำต้องห้าม");

const o = {
  id: "OD-TEST-0000",
  customer: "ทดสอบ",
  status: "รอชำระเงิน",
  taxInvoice: { company: "บจก.ทดสอบ", taxId: "0105500000000", address: "กรุงเทพ" },
  vat: { amount: 476 },
  shippingCost: 100,
  charges: [{ label: "ค่าสกรีนด้านที่สอง", amount: 200 }],
  items: [
    { productId: "p1", name: "เสื้อสกรีน DTF", qty: 10, unitPrice: 300, selections: "เรทราคา: พิมพ์ DTF · ตำแหน่งสกรีน: หน้าอก" },
    { productId: "p2", name: "พวงกุญแจอะคริลิค", qty: 100, unitPrice: 65, selections: "ขนาด: 7cm · งานสกรีน: สกรีน 1 ด้าน (ใต้)" },
  ],
} as unknown as Order;

const d = quotationDraft(o);
const txt = JSON.stringify(d.lines);
assert.ok(!txt.includes("สกรีน"), `ยังมีคำว่าสกรีนในร่าง: ${txt}`);
assert.equal(d.lines[0].name, "เสื้อพิมพ์ DTF");
assert.ok(d.lines[1].description.includes("- งานพิมพ์: พิมพ์ 1 ด้าน (ใต้)"), d.lines[1].description);
assert.equal(d.lines.find((l) => l.pricePerUnit === 200)?.name, "ค่าพิมพ์ด้านที่สอง");
assert.equal(d.subTotal, 3000 + 6500 + 100 + 200);

const x = extraQuotationDraft({ ...o, flowAccount: { docNo: "INV000001", docType: "inv", docTypeLabel: "ใบกำกับภาษี" } } as unknown as Order, [{ idx: 1 }]);
assert.ok(!JSON.stringify(x.lines).includes("สกรีน"), "บิลเพิ่มยังมีคำว่าสกรีน");

// ออเดอร์ต้นทางต้องไม่ถูกแก้ (จอผลิตยังใช้คำเดิม)
assert.equal(o.items[1].selections, "ขนาด: 7cm · งานสกรีน: สกรีน 1 ด้าน (ใต้)");
console.log("✅ check:fa-wording ผ่าน 9 ข้อ");
