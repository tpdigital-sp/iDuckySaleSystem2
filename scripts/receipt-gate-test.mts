/**
 * 🧾📷 เทสด่าน "ยังไม่ออกใบเสร็จ ห้ามปริ้น" + "ถ่ายภาพใบเสร็จทีละใบ" — npm run check:receipt-gate
 *
 * ที่มา (เจ้าของร้านสั่ง 9 ต.ค. 69): ลูกค้าสั่งเพิ่ม (บิลที่ 2) ยังไม่ออกใบเสร็จแต่งานปริ้น/ส่งไปแล้ว
 * และพนักงานปริ้นใบเสร็จใบเดียวกันซ้ำ 2 ชุด คนแพ็คนับได้ "2 ใบ" เลยส่งไป
 */
import { receiptPhotoPending, receiptsPending, type Order } from "../src/lib/admin-data";
import { judgeReceiptRead } from "../src/lib/server/receipt-ocr";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

const base = {
  id: "OD-TEST-1",
  customer: "ทดสอบ",
  status: "อนุมัติแบบ",
  items: [{ name: "สติ๊กเกอร์", qty: 1, unitPrice: 1000 }],
  shippingCost: 0,
  paidTotal: 1070,
  vat: { rate: 7, amount: 70 },
  flowAccount: { url: "https://x/QT010826", docNo: "QT010826", docTypeLabel: "ใบเสนอราคา", grandTotal: 1070 },
  flowAccountExtras: [{ url: "https://x/QT010852", docNo: "QT010852", docTypeLabel: "ใบเสนอราคา", grandTotal: 0 }],
} as unknown as Order;

// ── ด่านปริ้น ──
eq("ยังไม่มี INV ทั้ง 2 บิล → ค้างทั้งคู่", receiptsPending(base), ["QT010826", "QT010852"]);
const oneInv = { ...base, faInvoices: [{ docNo: "INV007682", ref: "QT010826" }] } as Order;
eq("ออก INV บิลหลักแล้ว บิลเพิ่มยังไม่ออก → ค้างบิลเพิ่ม (เคส 9 ต.ค.)", receiptsPending(oneInv), ["QT010852"]);
const twoInv = { ...base, faInvoices: [{ docNo: "INV007682", ref: "QT010826" }, { docNo: "INV007703", ref: "QT010852" }] } as Order;
eq("ออกครบ 2 บิล → ผ่าน", receiptsPending(twoInv), []);
eq("แอดมินยืนยันเอง → ผ่าน", receiptsPending({ ...oneInv, receiptsOk: { by: "a", at: "x" } } as Order), []);
eq("ส่ง E-tax แล้ว → ไม่กัน", receiptsPending({ ...base, taxInvoiceDelivery: "email" } as Order), []);
eq("ยังจ่ายไม่ครบ (มัดจำ) → ไม่กัน", receiptsPending({ ...base, paidTotal: 500 } as Order), []);
eq("ใบเว็บธรรมดาไม่มีใบกำกับ → ไม่กัน", receiptsPending({ ...base, flowAccount: undefined, flowAccountExtras: undefined, vat: undefined, paidTotal: 1000 } as Order), []);
eq(
  "วางลิงก์ INV เป็นเอกสารหลักแล้ว → ผ่าน",
  receiptsPending({ ...base, flowAccountExtras: undefined, taxInvoice: { docNo: "INV007700", docTypeLabel: "ใบกำกับภาษี/ใบเสร็จรับเงิน" } } as unknown as Order),
  []
);

// ── ➗ ใบมัดจำ = ใบเสร็จ 2 งวด (พนักงานขอ 21 ต.ค. 69 · OD-260928-1506) ──
const depBalance = {
  ...base,
  flowAccountExtras: undefined,
  paidTotal: 30923,
  items: [{ name: "เสื้อ", qty: 1, unitPrice: 28900 }],
  vat: { rate: 7, amount: 2023 },
  deposit: { amount: 15461.5, firstPaidAt: "2026-09-30T05:51:52.042Z", settledAt: "2026-10-21T03:01:52.527Z" },
  flowAccount: {
    url: "https://x/BL002003",
    docNo: "BL002003",
    docType: "bl",
    docTypeLabel: "ใบวางบิล/ใบแจ้งหนี้",
    grandTotal: 30923,
    deposit: { kind: "balance", amount: 15461.5, refDocNo: "BL002002" },
  },
} as unknown as Order;
eq("มัดจำ (ใบยอดคงเหลือ) ยังไม่มี INV → ค้างทั้ง 2 งวด", receiptsPending(depBalance), ["BL002003", "BL002002"]);
const depHalf = { ...depBalance, faInvoices: [{ docNo: "INV007652", ref: "BL002002", date: "2026-09-29", total: 15461.5 }] } as Order;
eq("ออก INV งวดมัดจำแล้วใบเดียว → ยังค้างงวดคงเหลือ (เคส 1506)", receiptsPending(depHalf), ["BL002003"]);
const depBoth = {
  ...depBalance,
  faInvoices: [
    { docNo: "INV007652", ref: "BL002002", date: "2026-09-29", total: 15461.5 },
    { docNo: "INV007780", ref: "BL002003", date: "2026-10-20", total: 15461.5 },
  ],
} as Order;
eq("ออกครบ 2 งวด → ผ่าน", receiptsPending(depBoth), []);
eq("ครบ 2 งวด → แพ็คต้องถ่าย 2 ใบ (INV)", receiptPhotoPending(depBoth), ["INV007780", "INV007652"]);
eq("มัดจำยังเก็บงวดหลังไม่ครบ → ไม่กัน (รอบตัวอย่าง)", receiptsPending({ ...depHalf, paidTotal: 15461.5, deposit: { amount: 15461.5, firstPaidAt: "2026-09-30T05:51:52.042Z" } } as Order), []);
eq("INV ใบเดียวยอดเต็ม (ออกใบเสร็จรวม 2 งวด) → ผ่าน", receiptsPending({ ...depBalance, faInvoices: [{ docNo: "INV007800", ref: "BL002003", total: 30923 }] } as Order), []);
// เปิดโหมดมัดจำเองจาก QT — ใบงวดออกเองใน FlowAccount เลขไม่รู้ (OD-261007-2540)
const depManual = {
  ...depBalance,
  paidTotal: 129684,
  items: [{ name: "เสื้อ", qty: 1, unitPrice: 121200 }],
  vat: { rate: 7, amount: 8484 },
  deposit: { amount: 64842, firstPaidAt: "2026-10-09T10:53:05.628Z", settledAt: "2026-10-16T05:00:28.831Z" },
  flowAccount: { url: "https://x/QT010841", docNo: "QT010841", docType: "qt", docTypeLabel: "ใบเสนอราคา", grandTotal: 129684 },
} as unknown as Order;
eq("มัดจำแบบเปิดเอง ยังไม่มี INV → ค้าง QT + งวดคงเหลือ", receiptsPending(depManual), ["QT010841", "ใบเสร็จงวดคงเหลือ (ยังไม่ออก)"]);
const manualHalf = { ...depManual, faInvoices: [{ docNo: "INV007743", ref: "BL002114", date: "2026-10-16", total: 64842 }] } as Order;
eq("INV ครึ่งแรกอ้างใบแจ้งหนี้ที่ไม่รู้จัก → เติมงวดมัดจำ ค้างงวดคงเหลือ (เคส 2540)", receiptsPending(manualHalf), ["ใบเสร็จงวดคงเหลือ (ยังไม่ออก)"]);
const manualBoth = { ...depManual, faInvoices: [{ docNo: "INV007790", ref: "BL002130", date: "2026-10-21", total: 64842 }, { docNo: "INV007743", ref: "BL002114", date: "2026-10-16", total: 64842 }] } as Order;
eq("INV 2 ใบอ้างเลขไม่รู้จัก → เติมตามวันที่ ผ่าน", receiptsPending(manualBoth), []);
eq("… แพ็คถ่าย 2 ใบ เรียงงวดมัดจำก่อน", receiptPhotoPending(manualBoth), ["INV007743", "INV007790"]);
const legacyHalf = { ...manualHalf, taxInvoice: { company: "บจก.ทดสอบ", docNo: "BL002114", docTypeLabel: "ใบวางบิล/ใบแจ้งหนี้" } } as unknown as Order;
eq("เลขใบแจ้งหนี้มัดจำอยู่ในฟอร์มรุ่นเก่า (2540 จริง) → INV จับคู่งวดมัดจำ ค้างงวดคงเหลือ", receiptsPending(legacyHalf), ["ใบเสร็จงวดคงเหลือ (ยังไม่ออก)"]);
eq("แอดมินยืนยันเอง → ผ่าน (ใบมัดจำ)", receiptsPending({ ...manualHalf, receiptsOk: { by: "a", at: "x" } } as Order), []);
eq("ใบธรรมดา (ไม่มัดจำ) ยังนับบิลเดียว", receiptsPending({ ...base, flowAccountExtras: undefined, faInvoices: [{ docNo: "INV007682", ref: "QT010826" }] } as Order), []);

// ── ภาพใบเสร็จฝั่งแพ็ค ──
eq("ยังไม่ถ่ายเลย → ต้องถ่าย 2 เลขที่ (INV)", receiptPhotoPending(twoInv), ["INV007682", "INV007703"]);
eq(
  "ถ่ายไป 1 ใบ → เหลือ 1",
  receiptPhotoPending({ ...twoInv, receiptPhotos: [{ docNo: "INV007682", url: "u", by: "b", at: "t" }] } as Order),
  ["INV007703"]
);
eq("ส่งอีเมลแล้ว → ไม่ต้องถ่าย", receiptPhotoPending({ ...twoInv, taxInvoiceDelivery: "email" } as Order), []);

// ── AI อ่านเลขในภาพ ──
const others = ["INV007682", "QT010826"];
eq("อ่านเลขตรง → ผ่าน", judgeReceiptRead(["INV007703"], "INV007703", ["QT010852"], others, []), { ok: true, read: "INV007703" });
eq("อ่านไม่ออก → รับไว้", judgeReceiptRead(null, "INV007703", [], others, []), { ok: true });
eq("อ่านได้เลขแปลก → รับไว้แต่จดเลข", judgeReceiptRead(["INV999999"], "INV007703", [], others, []).ok, true);
eq(
  "ปริ้นใบเดิมซ้ำ (ถ่าย INV007682 อีกรอบในช่อง INV007703) → ไม่รับ",
  judgeReceiptRead(["INV007682"], "INV007703", ["QT010852"], others, ["INV007682"]).ok,
  false
);
eq("ถ่ายใบของอีกช่อง (ยังไม่เคยถ่าย) → ไม่รับ", judgeReceiptRead(["INV007682"], "INV007703", [], others, []).ok, false);

console.log(`✅ ผ่าน ${pass} ข้อ`);
if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ\n` + fails.join("\n"));
  process.exit(1);
}
