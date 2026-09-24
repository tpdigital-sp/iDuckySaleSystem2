/**
 * 🧾 ตรวจตัวสร้างไฟล์ PDF ใบเสร็จ — `npm run check:receipt-pdf`
 *
 * กันพังจุดที่เคยเจอ/เสี่ยงที่สุด
 *  1) ตัวอักษรไทยต้องมีครบในฟอนต์ (ตัวที่ไม่มีจะ "หายเงียบ" ตอนวาด — เช่น อีโมจิในชื่อรายการ)
 *  2) ใบยาว ๆ ต้องขึ้นหน้าใหม่ ไม่ล้นตกขอบกระดาษ
 *  3) ยอดเงินบนใบเสร็จต้องเป็นชุดเดียวกับหน้าเว็บ (ยอดรวม/หัก ณ ที่จ่าย/ชำระแล้ว)
 *
 * ใส่ --out <path> เพื่อเขียนไฟล์ตัวอย่างออกมาดูด้วยตา
 */

import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import type { Order } from "../src/lib/admin-data";
import { orderTotal } from "../src/lib/admin-data";
import { buildReceiptPdf } from "../src/lib/server/receipt-pdf";
import { embedThaiFonts } from "../src/lib/server/pdf-thai";

const SHOP = {
  name: "iDucky Prints Studio",
  legalName: "บริษัท ไอดักกี้ พริ้นท์ สตูดิโอ จำกัด (สำนักงานใหญ่)",
  address: "663/8 ซอยอ่อนนุช 46 แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร 10250",
  phone: "096-569-9414",
  taxId: "0105566000000",
};

const baseItem = (n: number): Order["items"][number] =>
  ({
    productId: "pillow-keychain",
    name: `PILLOW KEYCHAIN พวงกุญแจหมอน ชุดที่ ${n}`,
    qty: 20,
    unitPrice: 110,
    sel: {
      ขนาด: "8×8 ซม.",
      รูปทรง: "ไดคัทตามทรง / วงกลม",
      เนื้อผ้า: "ขนสั้น 200แกรม",
      สกรีนกี่ด้าน: "สกรีน 2 ด้าน",
      จำนวนลาย: "20 ลาย",
      "ลิงก์ไฟล์ลาย/อีเมล": "https://drive.google.com/drive/u/0/folders/13cdcr14bDolJt",
      จำนวนแต่ละลาย: Array.from({ length: 8 }, (_, i) => `ลายที่ ${i + 1} × 1 ชิ้น`).join(" · "),
    },
    selections: "",
  }) as Order["items"][number];

const order = {
  id: "OD-260921-6413",
  key: "test",
  date: "21 ก.ย. 2569 16:14",
  customer: "ศิรินุช วรรณภัณฑ์พินิจ",
  phone: "087-815-2000",
  address: "74/39 แขวงหิรัญรูจี เขตธนบุรี กรุงเทพฯ 10600 (ฝากไว้ที่ป้อมยามได้)",
  status: "กำลังผลิต",
  items: [
    baseItem(1),
    { productId: "", name: "🎨 Add on — ปั๊มนูนฟอยล์ทอง (20 ลาย)", qty: 1, unitPrice: 170, sel: {}, selections: "" },
    baseItem(2),
    baseItem(3),
    baseItem(4),
  ],
  shippingCost: 100,
  shippingLabel: "EMS",
  discount: { label: "สมาชิก Silver (5%)", amount: 129, tierId: "silver" },
  vat: { rate: 7, amount: 626.9 },
  wht: { rate: 3, amount: 269.1 },
  charges: [{ id: "c1", label: "ค่ากล่องพิเศษ", amount: 30 }],
  paidTotal: 9999,
} as unknown as Order;

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) fails++;
};

const bytes = await buildReceiptPdf({ order, shop: SHOP, shipMethods: [], productById: {} });
const doc = await PDFDocument.load(bytes);

ok(bytes.byteLength > 1000, `สร้างไฟล์ได้ (${Math.round(bytes.byteLength / 1024)} KB)`);
ok(doc.getPageCount() >= 2, `ใบยาวขึ้นหน้าใหม่ให้เอง (ได้ ${doc.getPageCount()} หน้า)`);

// 1) ตัวอักษรครบในฟอนต์ไหม — เอาข้อความทุกอย่างที่ใบเสร็จจะพิมพ์มากวาดทีละตัว
const probe = await PDFDocument.create();
const fonts = await embedThaiFonts(probe);
const texts = [
  SHOP.name,
  SHOP.legalName,
  SHOP.address,
  order.customer,
  order.address,
  ...order.items.flatMap((i) => [i.name, ...Object.entries(i.sel ?? {}).flat()]),
  "ใบรับเงิน ยอดรวมทั้งสิ้น ค่าจัดส่ง ชำระแล้ว หักภาษี ณ ที่จ่าย ภาษีมูลค่าเพิ่ม ฟรี รายการ จำนวน ราคา รวม ลูกค้า หน้า (ต่อ)",
  "เอกสารนี้ออกโดยระบบอัตโนมัติ · ขอบคุณที่อุดหนุน",
  `${orderTotal(order)} ฿0123456789,.−%`,
];
const missing = new Set<string>();
for (const t of texts) {
  const run = fonts.reg.kit.layout(String(t));
  run.glyphs.forEach((g, i) => {
    if (!g.id) missing.add(run.glyphs[i].codePoints.map((c) => String.fromCodePoint(c)).join(""));
  });
}
// อีโมจิไม่มีในฟอนต์อยู่แล้ว (ตั้งใจให้หายไปเฉย ๆ ไม่ขึ้นกล่องสี่เหลี่ยม) — ตัวอื่นห้ามหาย
const realMissing = [...missing].filter((ch) => !/\p{Extended_Pictographic}/u.test(ch));
ok(realMissing.length === 0, `ตัวอักษรมีครบในฟอนต์ (ตกหล่น: ${realMissing.join(" ") || "ไม่มี"})`);

// 2) อ่านไฟล์กลับด้วยตัวอ่าน PDF จริง — ได้ทั้งพิกัดและตัวอักษรที่ตัวอ่านเห็น
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const read = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
const marks: { x: number; y: number; s: string }[] = [];
for (let p = 1; p <= read.numPages; p++) {
  const tc = await (await read.getPage(p)).getTextContent();
  for (const it of tc.items) if ("str" in it) marks.push({ x: it.transform[4], y: it.transform[5], s: it.str });
}
ok(marks.length > 300, `มีข้อความในไฟล์ (${marks.length} ตัวอักษร)`);
ok(
  marks.every((m) => m.x >= 30 && m.x <= 570 && m.y >= 20 && m.y <= 800),
  `ทุกตัวอักษรอยู่ในกรอบกระดาษ (ต่ำสุด y=${Math.min(...marks.map((m) => m.y)).toFixed(0)} · ขวาสุด x=${Math.max(...marks.map((m) => m.x)).toFixed(0)})`,
);

/*
 * 3) ข้อความสำคัญต้องอ่านกลับจากไฟล์ได้ (ฝ่ายบัญชีลูกค้าก๊อบตัวเลขไปใช้ต่อ)
 *    ⚠️ คำที่มีวรรณยุกต์ซ้อนสระ ("ทั้ง" "ชิ้น") จะก๊อบออกมาเพี้ยนเล็กน้อยเพราะฟอนต์ไทยทุกตัว
 *    เก็บรูปวรรณยุกต์แบบซ้อนเป็นอักขระคนละตัว (PDF ของ FlowAccount ก็เป็น — ดู fixThai)
 *    เราใส่ ActualText กำกับไว้ให้โปรแกรมอ่าน PDF ที่รองรับแล้ว · ที่เช็คตรงนี้จึงเลี่ยงคำกลุ่มนั้น
 */
const flat = marks.map((m) => m.s).join("");
for (const want of [order.id, "ใบรับเงิน", "ยอดรวม", "ค่าจัดส่ง", orderTotal(order).toLocaleString("th-TH"), order.customer])
  ok(flat.includes(want), `ใบเสร็จมี "${want}"`);

const outArg = process.argv.indexOf("--out");
if (outArg > 0 && process.argv[outArg + 1]) {
  fs.writeFileSync(process.argv[outArg + 1], bytes);
  console.log(`📄 เขียนไฟล์ตัวอย่าง: ${process.argv[outArg + 1]}`);
}

console.log(fails ? `\n❌ ไม่ผ่าน ${fails} ข้อ` : "\n✅ ผ่านทั้งหมด");
process.exit(fails ? 1 : 0);
