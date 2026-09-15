/**
 * 🧾 ไล่หาใบที่ "ตัวเลขภาษีไม่ตรงกับยอดในใบงาน" (VAT / หัก ณ ที่จ่าย ค้างของฐานเก่า)
 *
 *   npx tsx --tsconfig tsconfig.json scripts/order-tax-scan.mts               (ดูเฉย ๆ ทุกใบ)
 *   npx tsx --tsconfig tsconfig.json scripts/order-tax-scan.mts OD-260915-1705 --apply
 *   npx tsx --tsconfig tsconfig.json scripts/order-tax-scan.mts --apply       (แก้ทุกใบที่เจอ)
 *
 * ทำไม (OD-260915-1705 · 15 ก.ย. 69): ใบเสนอราคาแก้จำนวน 12 → 5 ชิ้น · แอดมินกด "ดึงรายการตามเอกสาร"
 * รายการเปลี่ยนตามแต่ VAT/หัก ณ ที่จ่ายยังเป็นเลขของ 12 ชิ้น → ยอดในระบบไม่ตรงบิลที่ลูกค้าถือ
 * ตั้งแต่ 15 ก.ย. 69 กติกาอยู่ที่ประตูเขียนออเดอร์แล้ว (reconcileOrderTax) ตัวนี้ไว้เก็บใบเก่า
 *
 * ⚠️ ไม่แตะสถานะ/ยอดชำระ/ไม่ส่งไลน์ — แก้แล้วถ้าใบไหนกลายเป็นชำระครบ ให้เปิดหน้าออเดอร์กดยืนยันเงินเข้าเอง
 *    (จะได้ยิง msVerify/ตัดสต๊อก/ยอดขาย/แต้ม ครบตามปกติ)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderTaxBase, orderTaxDrift, orderTotal, withLog, type Order } from "../src/lib/admin-data";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = new Set(args.filter((a) => a.startsWith("OD-")));
const thb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BY = "ตรวจภาษีย้อนหลัง (สคริปต์)";

const { data, error } = await sb.from("orders").select("id,data");
if (error) {
  console.error(error.message);
  process.exit(1);
}
const rows = ((data ?? []) as { id: string; data: Order }[])
  .filter((r) => (only.size ? only.has(r.id) : true))
  .filter((r) => r.data?.vat?.rate || r.data?.wht?.rate)
  .sort((a, b) => (a.id < b.id ? 1 : -1));

let bad = 0;
let fixed = 0;
for (const r of rows) {
  const o = r.data;
  const drift = orderTaxDrift(o);
  if (Math.abs(drift.vat) < 0.01 && Math.abs(drift.wht) < 0.01) continue;
  bad++;
  // คิดใหม่จาก "ฐานปัจจุบัน" — ใช้กติกาเดียวกับประตูเขียน โดยหลอกว่าก้อนก่อนหน้าคือใบที่ภาษีตรงฐานเก่าอยู่แล้ว
  const base = orderTaxBase(o);
  const want = {
    ...o,
    ...(o.vat?.rate ? { vat: { ...o.vat, amount: Math.round(base * o.vat.rate) / 100 } } : {}),
    ...(o.wht?.rate ? { wht: { ...o.wht, amount: Math.round(base * o.wht.rate) / 100 } } : {}),
  };
  console.log(
    `${r.id} · ${o.status}${o.flowAccount?.docNo ? ` · ${o.flowAccount.docNo}` : ""} · ยอดก่อน VAT ${thb(base)}\n` +
      `   VAT ${thb(o.vat?.amount ?? 0)} → ${thb(want.vat?.amount ?? 0)} · หัก ณ ที่จ่าย ${thb(o.wht?.amount ?? 0)} → ${thb(want.wht?.amount ?? 0)}` +
      ` · ยอดรวม ${thb(orderTotal(o))} → ${thb(orderTotal(want))} · จ่ายมาแล้ว ${thb(o.paidTotal ?? 0)}`
  );
  if (!apply) continue;
  const next = withLog(
    { ...want, savedAt: new Date().toISOString() },
    BY,
    "คิดภาษีใหม่ตามยอดในใบงาน",
    `ยอดก่อน VAT ${thb(base)} · VAT ${thb(o.vat?.amount ?? 0)} → ${thb(want.vat?.amount ?? 0)}` +
      ` · หัก ณ ที่จ่าย ${thb(o.wht?.amount ?? 0)} → ${thb(want.wht?.amount ?? 0)} · ยอดรวม ${thb(orderTotal(o))} → ${thb(orderTotal(want))}`
  );
  const { error: e } = await sb.from("orders").update({ data: next }).eq("id", r.id);
  if (e) console.log(`   ❌ บันทึกไม่สำเร็จ: ${e.message}`);
  else {
    fixed++;
    console.log("   ✅ บันทึกแล้ว");
  }
}

console.log(`\nใบที่มีภาษี ${rows.length} ใบ · ภาษีไม่ตรงยอด ${bad} ใบ${apply ? ` · แก้แล้ว ${fixed} ใบ` : bad ? " (ใส่ --apply เพื่อเขียนจริง)" : ""}`);
