/**
 * ⚡ ตรวจกติกา "ส่วนลดโอนไว" — เทสต์เคส + สแกนออเดอร์จริง
 *
 *   npx tsx --tsconfig tsconfig.json scripts/early-pay-check.mts            เทสต์เคส (ใช้สินค้าจริงจากฐาน)
 *   npx tsx --tsconfig tsconfig.json scripts/early-pay-check.mts --scan 7   สแกนใบจริงย้อนหลัง 7 วัน หา "ควรได้แต่ไม่ได้"
 *
 * ใช้กติกาตัวเดียวกับที่ระบบคิดจริง (earlyPaySkipReason + earlyPayBaseOf ใน src/lib/server/order-early-pay.ts)
 * — ไม่มีกฎก๊อปมาไว้ในสคริปต์ ถ้ากติกาเปลี่ยน เทสต์นี้ตามเอง
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { earlyPayAmount, earlyPayOf, type EarlyPayDiscount } from "../src/lib/early-pay";
import { earlyPayBaseOf, earlyPayBillAdded, earlyPaySkipReason, syncOrderEarlyPay } from "../src/lib/server/order-early-pay";
import { itemsChanged } from "../src/lib/server/order-write";
import type { Order } from "../src/lib/admin-data";
import type { Product } from "../src/lib/products";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// สคริปต์รันนอก Next จึงโหลดสินค้าเอง (products-server ติด "server-only")
const cacheP = new Map<string, Product | undefined>();
const loadProduct = async (id: string) => {
  if (!cacheP.has(id)) {
    const { data } = await sb.from("products").select("data").eq("id", id).maybeSingle();
    cacheP.set(id, (data?.data as Product | undefined) ?? undefined);
  }
  return cacheP.get(id);
};

const { data: settRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
const cfg = earlyPayOf(settRow?.data as { earlyPay?: EarlyPayDiscount } | undefined);

/** ส่วนลดที่ใบนี้ควรได้ (บาท) + เหตุผลถ้าไม่ได้ */
async function dueOf(o: Order): Promise<{ due: number; skip: string | null }> {
  const skip = earlyPaySkipReason(o);
  if (skip) return { due: 0, skip };
  return { due: earlyPayAmount(await earlyPayBaseOf(o, loadProduct), cfg), skip: null };
}

const base = (over: Partial<Order> & { items: Order["items"] }): Order =>
  ({ id: "OD-TEST", customer: "เทสต์", phone: "", address: "", date: "", payment: "โอนธนาคาร", shipping: "ส่งธรรมดา", shippingCost: 50, status: "รอชำระเงิน", ...over }) as Order;

const line = (productId: string, qty: number, unitPrice: number, sel: Record<string, string> = {}) => ({ productId, name: productId, qty, unitPrice, sel });

/** เอกสาร FlowAccount ปลอมสำหรับเทสต์ (ตัวเลขไม่ถูกใช้ — กฎดูแค่ "มีบิลไหม") */
const FA: NonNullable<Order["flowAccount"]> = { url: "https://share.flowaccount.com/qt/th/test", docType: "qt", docTypeLabel: "ใบเสนอราคา", docNo: "QT010729", fetchedAt: new Date().toISOString() };

if (process.argv.includes("--scan")) {
  const days = Number(process.argv[process.argv.indexOf("--scan") + 1]) || 3;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await sb.from("orders").select("data").gte("created_at", since);
  const orders = (data ?? []).map((r) => r.data as Order).filter(Boolean);
  let checked = 0;
  const miss: string[] = [];
  for (const o of orders) {
    if (o.earlyPay) continue;
    const { due, skip } = await dueOf(o);
    if (skip) continue;
    checked++;
    if (due > 0) miss.push(`${o.id} · ${o.customer || "ไม่ระบุ"} — ควรลด ฿${due} (สถานะ ${o.status})`);
  }
  console.log(`สแกน ${orders.length} ใบ · เข้าเกณฑ์ ${checked} ใบ · ตกหล่น ${miss.length} ใบ`);
  for (const m of miss) console.log("  ❌", m);
  process.exit(miss.length ? 1 : 0);
}

/**
 * เทสต์เคส — สินค้าจริงจากฐาน (ตัวเลขอ้างจากที่วิเคราะห์ไว้ 10-14 ก.ย. 69)
 * calendar-desk = ราคาเดียวไม่มีขั้นต่ำ (83 ตัวที่เคยไม่ได้ลดเลย) · standy = มีตารางขั้นบันได
 */
const CASES: { name: string; order: Order; want: number | string }[] = [
  { name: "ปลีก 1 ชิ้น ฿260 → ลด 5", order: base({ items: [line("calendar-desk", 1, 260)] }), want: 5 },
  { name: "ปลีกยอดเกิน 999 → ลด 10", order: base({ items: [line("calendar-desk", 1, 1200)] }), want: 10 },
  { name: "งานพิเศษ (special-item) นับเป็นปลีก → ลด 5", order: base({ items: [line("special-item", 1, 425)] }), want: 5 },
  { name: "สแตนดี้ 34 ชิ้น (เข้าเรทส่ง) → ไม่ลด", order: base({ items: [line("standy", 34, 50)] }), want: 0 },
  { name: "ปนเรทส่ง 1 บรรทัด → ไม่ลดทั้งใบ", order: base({ items: [line("standy", 34, 50), line("calendar-desk", 1, 260)] }), want: 0 },
  { name: "ยังไม่ตีราคา (ยอด 0) → ไม่ลด", order: base({ items: [line("special-item", 1, 0)] }), want: 0 },
  { name: "ตัวแทนจำหน่าย → ข้าม", order: base({ items: [line("calendar-desk", 1, 260)], dealer: true }), want: "ตัวแทนจำหน่าย" },
  { name: "มีส่วนลดอื่น → ข้าม", order: base({ items: [line("calendar-desk", 1, 260)], discount: { label: "สมาชิก", amount: 20 } }), want: "มีส่วนลดอื่น" },
  { name: "มีเงินเข้าแล้ว → ข้าม (ห้ามแก้ย้อนหลัง)", order: base({ items: [line("calendar-desk", 1, 260)], paidTotal: 310 }), want: "มีเงินเข้า/แจ้งโอนแล้ว" },
  { name: "แนบสลิปแล้วรอตรวจ → ข้าม", order: base({ items: [line("calendar-desk", 1, 260)], paidReportedAt: new Date().toISOString() }), want: "มีเงินเข้า/แจ้งโอนแล้ว" },
  { name: "ใบเสนอราคา → ข้าม (นโยบาย)", order: base({ items: [line("calendar-desk", 1, 260)], quoteOf: "QT-1" }), want: "ใบเสนอราคา" },
  // 🧾 บิลบริษัท (เจ้าของร้านสั่ง 24 ก.ย. 69) — ยอดในเว็บต้องตรงเอกสารที่ลูกค้าถือ ห้ามลด ฿5/฿10
  { name: "ผูกบิล FlowAccount → ข้าม (นโยบาย)", order: base({ items: [line("calendar-desk", 1, 260)], flowAccount: FA }), want: "บิล FlowAccount" },
  { name: "มีใบกำกับภาษีบริษัท → ข้าม (นโยบาย)", order: base({ items: [line("calendar-desk", 1, 260)], taxInvoice: { company: "บริษัท ทดสอบ จำกัด", address: "กรุงเทพ" } }), want: "ใบกำกับภาษี/บิล VAT" },
  { name: "เปิด VAT ตามบิล → ข้าม (นโยบาย)", order: base({ items: [line("calendar-desk", 1, 260)], vat: { rate: 7, amount: 18.2 } }), want: "ใบกำกับภาษี/บิล VAT" },
  { name: "ใบเคลม → ข้าม", order: base({ items: [line("calendar-desk", 1, 260)], claimOf: "OD-1" }), want: "ใบเคลม" },
  { name: "เลยขั้นเก็บเงิน (กำลังผลิต) → ข้าม", order: base({ items: [line("calendar-desk", 1, 260)], status: "กำลังผลิต" }), want: "เลยขั้นเก็บเงินแล้ว" },
  { name: "ล็อกส่วนลดแล้ว → ข้าม", order: base({ items: [line("calendar-desk", 1, 260)], earlyPay: { label: "⚡", amount: 5, lockedAt: new Date().toISOString() } }), want: "ล็อก/ติ๊กไม่รับแล้ว" },
  { name: "ติ๊กไม่รับส่วนลด → ข้าม", order: base({ items: [line("calendar-desk", 1, 260)], earlyPay: { label: "⚡", amount: 5, waivedAt: new Date().toISOString() } }), want: "ล็อก/ติ๊กไม่รับแล้ว" },
  { name: "ใบเปล่า → ข้าม", order: base({ items: [] }), want: "ไม่มีรายการ" },
];

/**
 * ประตูเขียนออเดอร์คิดกฎใหม่เฉพาะตอน "รายการ/ราคาเปลี่ยน" — บันทึกเรื่องอื่นต้องไม่ไปสตาร์ทนาฬิกาใหม่ให้ใบเก่า
 */
const TOUCH: { name: string; a: Order; b: Order; want: boolean }[] = [
  { name: "เพิ่มรายการพิเศษ → คิดใหม่", a: base({ items: [] }), b: base({ items: [line("special-item", 1, 425)] }), want: true },
  { name: "ตีราคาจาก 0 → คิดใหม่", a: base({ items: [line("special-item", 1, 0)] }), b: base({ items: [line("special-item", 1, 425)] }), want: true },
  { name: "แก้จำนวน → คิดใหม่", a: base({ items: [line("standy", 1, 380)] }), b: base({ items: [line("standy", 34, 50)] }), want: true },
  { name: "ผูกไลน์/เปลี่ยนสถานะเฉย ๆ → ไม่คิดใหม่", a: base({ items: [line("standy", 1, 380)] }), b: base({ items: [line("standy", 1, 380)], status: "ชำระแล้ว" }), want: false },
  { name: "เปลี่ยนค่าส่ง → ไม่คิดใหม่ (ค่าส่งไม่อยู่ในฐาน)", a: base({ items: [line("standy", 1, 380)] }), b: base({ items: [line("standy", 1, 380)], shippingCost: 0 }), want: false },
];

let fail = 0;
for (const t of TOUCH) {
  const got = itemsChanged(t.a, t.b);
  const ok = got === t.want;
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} [ประตู] ${t.name}${ok ? "" : `  (ได้ ${got})`}`);
}
/**
 * 🧾➖ ใบที่ได้ส่วนลดไปแล้ว แล้วมาออกบิลทีหลัง — ประตูต้องเอาส่วนลดออกให้ (ยอดต้องตรงบิล)
 * แต่ห้ามแตะใบที่ลูกค้าโอน/แจ้งโอนตามตัวเลขเดิมไปแล้ว (ไม่งั้นค้าง ฿5/฿10 ปลอม แล้วไลน์ไปทวง — OD-260923-5389)
 */
const EP5 = { label: "⚡ ส่วนลดโอนไว", amount: 5 };
// ⚠️ ใส่ได้เฉพาะเคส "มีบิล" — เคสไม่มีบิลจะไปเข้าทางที่ต้องโหลดสินค้าผ่าน products-server ซึ่งสคริปต์นอก Next อ่านไม่ได้
//    (เคสคิดยอดปกติอยู่ใน CASES ด้านบนแล้ว ซึ่งโหลดสินค้าจากฐานเอง)
const DROP: { name: string; order: Order; want: number }[] = [
  { name: "ได้ส่วนลดแล้วผูกบิล FlowAccount → เอาออก", order: base({ items: [line("calendar-desk", 1, 260)], earlyPay: EP5, flowAccount: FA }), want: 0 },
  { name: "ได้ส่วนลดแล้วกรอกใบกำกับภาษี → เอาออก", order: base({ items: [line("calendar-desk", 1, 260)], earlyPay: EP5, taxInvoice: { company: "บริษัท ทดสอบ จำกัด", address: "กรุงเทพ" } }), want: 0 },
  { name: "ออกบิลแต่ลูกค้าแจ้งโอนแล้ว → คงส่วนลดเดิม", order: base({ items: [line("calendar-desk", 1, 260)], earlyPay: EP5, flowAccount: FA, paidReportedAt: new Date().toISOString() }), want: 5 },
  { name: "ออกบิลแต่มีเงินเข้าแล้ว → คงส่วนลดเดิม", order: base({ items: [line("calendar-desk", 1, 260)], earlyPay: EP5, flowAccount: FA, paidTotal: 305 }), want: 5 },
];

/** ประตูต้องเรียกกฎใหม่ตอน "เพิ่งออกบิล" ด้วย แม้รายการไม่ขยับ */
const BILLED: { name: string; a: Order; b: Order; want: boolean }[] = [
  { name: "เพิ่งผูกบิล FlowAccount → คิดใหม่", a: base({ items: [line("calendar-desk", 1, 260)] }), b: base({ items: [line("calendar-desk", 1, 260)], flowAccount: FA }), want: true },
  { name: "เพิ่งกรอกใบกำกับภาษี → คิดใหม่", a: base({ items: [line("calendar-desk", 1, 260)] }), b: base({ items: [line("calendar-desk", 1, 260)], taxInvoice: { company: "บริษัท ทดสอบ จำกัด", address: "กรุงเทพ" } }), want: true },
  { name: "ใบมีบิลอยู่แล้ว บันทึกเรื่องอื่น → ไม่คิดใหม่", a: base({ items: [line("calendar-desk", 1, 260)], flowAccount: FA }), b: base({ items: [line("calendar-desk", 1, 260)], flowAccount: FA, status: "ชำระแล้ว" }), want: false },
  { name: "ใบธรรมดา บันทึกเรื่องอื่น → ไม่คิดใหม่", a: base({ items: [line("calendar-desk", 1, 260)] }), b: base({ items: [line("calendar-desk", 1, 260)], status: "ชำระแล้ว" }), want: false },
];

for (const t of BILLED) {
  const got = earlyPayBillAdded(t.a, t.b);
  const ok = got === t.want;
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} [ประตู·บิล] ${t.name}${ok ? "" : `  (ได้ ${got})`}`);
}
for (const d of DROP) {
  const got = (await syncOrderEarlyPay(sb, d.order)).earlyPay?.amount ?? 0;
  const ok = got === d.want;
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} [เอาออก] ${d.name}${ok ? "" : `  (ได้ ${got} · ควรได้ ${d.want})`}`);
}
for (const c of CASES) {
  const { due, skip } = await dueOf(c.order);
  const got = skip ?? due;
  const ok = got === c.want;
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}${ok ? "" : `  (ได้ ${got} · ควรได้ ${c.want})`}`);
}
const total = CASES.length + TOUCH.length + BILLED.length + DROP.length;
console.log(fail ? `\n❌ ตก ${fail}/${total} เคส` : `\n✅ ผ่านครบ ${total} เคส`);
process.exit(fail ? 1 : 0);
