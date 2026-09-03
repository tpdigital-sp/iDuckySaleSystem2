/**
 * สร้างออเดอร์ทดสอบระบบมัดจำ 50% + สลิปโดนหัก ณ ที่จ่าย/ค่าธรรมเนียมโอน
 * — โคลนจากออเดอร์ต้นทาง (default: OD-260827-7142 ออเดอร์ทดสอบเดิม) เป็นใบใหม่
 *   เปิดโหมดมัดจำ 50% ให้เลย แล้วพิมพ์ยอดโอนที่ควรใช้ทดสอบแต่ละเคส
 *
 * ใช้: node scripts/deposit50-test-order.mjs [เลขออเดอร์ต้นทาง]
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const sourceId = process.argv[2] || "OD-260827-7142";
const { data: row, error } = await sb.from("orders").select("data").eq("id", sourceId).maybeSingle();
if (error) throw error;
if (!row) throw new Error(`ไม่พบออเดอร์ต้นทาง ${sourceId}`);
const src = row.data;

// ยอดรวมแบบเดียวกับ orderTotal ใน admin-data (subtotal + ส่งของ − ส่วนลด)
const itemDisc = (i) => {
  const d = i.discount;
  if (!d) return 0;
  if ((d.pct ?? 0) > 0) return Math.floor((i.qty * i.unitPrice * d.pct) / 100);
  return Math.max(0, d.amount ?? 0);
};
const subtotal = src.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
const itemDiscTotal = src.items.reduce((s, i) => s + itemDisc(i), 0);
const adminDisc = src.adminDiscount
  ? (src.adminDiscount.pct ?? 0) > 0
    ? Math.floor(((subtotal - itemDiscTotal) * src.adminDiscount.pct) / 100)
    : Math.max(0, src.adminDiscount.amount ?? 0)
  : 0;
const total = Math.max(0, subtotal + (src.shippingCost ?? 0) - (src.discount?.amount ?? 0) - adminDisc - itemDiscTotal);
const depositAmt = Math.ceil(total / 2);

const now = new Date();
const ymd = now.toISOString().slice(2, 10).replace(/-/g, "").slice(0, 6);
const id = `OD-${ymd}-${String(Math.floor(1000 + Math.random() * 9000))}`;
const key = randomBytes(24).toString("base64url");
const iso = now.toISOString();

const order = {
  ...src,
  id,
  key,
  customer: "ทดสอบมัดจำ 50% หัก ณ ที่จ่าย (ลบได้)",
  date: iso,
  status: "รอชำระเงิน",
  reorderOf: sourceId,
  deposit: { amount: depositAmt },
  // ล้างร่องรอยของใบต้นทาง — ใบใหม่ต้องเริ่มจากศูนย์
  slipUrl: undefined,
  slipPath: undefined,
  slipVerify: undefined,
  paidReportedAt: undefined,
  paidTotal: undefined,
  tracking: undefined,
  printedAt: undefined,
  printCount: undefined,
  lastPrintedAt: undefined,
  packPhotos: undefined,
  redoOrders: undefined,
  log: [
    { at: iso, by: "สคริปต์ทดสอบ", action: "สร้างออเดอร์ทดสอบ (สั่งซ้ำจาก " + sourceId + ")", detail: "ทดสอบระบบมัดจำ 50% + ตรวจสลิปโดนหัก ณ ที่จ่าย/ค่าธรรมเนียมโอน" },
    { at: iso, by: "สคริปต์ทดสอบ", action: "เปิดโหมดมัดจำ 50%", detail: `มัดจำ ${depositAmt} บาท จากยอด ${total} บาท` },
  ],
};

const { error: insErr } = await sb.from("orders").insert({ id, data: order });
if (insErr) throw insErr;

const r2 = (n) => Math.round(n * 100) / 100;
console.log(`✅ สร้างออเดอร์ทดสอบแล้ว: ${id} (โคลนจาก ${sourceId})`);
console.log(`   ยอดรวม ${total} บาท · มัดจำงวดแรก ${depositAmt} บาท`);
console.log(`   ลิงก์ลูกค้า: /order/${id}?key=${key}`);
console.log("");
console.log("💡 ยอดโอนที่ใช้ทดสอบ (งวดมัดจำ):");
console.log(`   ตรงเป๊ะ                    → ${depositAmt}`);
console.log(`   หัก ณ ที่จ่าย 1% งวดนี้     → ${r2(depositAmt - depositAmt * 0.01)}`);
console.log(`   หัก ณ ที่จ่าย 3% งวดนี้     → ${r2(depositAmt - depositAmt * 0.03)}`);
console.log(`   หัก 1% ทั้งออเดอร์          → ${r2(depositAmt - total * 0.01)}`);
console.log(`   หัก 3% ทั้งออเดอร์          → ${r2(depositAmt - total * 0.03)}`);
console.log(`   หัก 3% ฐานก่อน VAT งวดนี้   → ${r2(depositAmt - (depositAmt / 1.07) * 0.03)}`);
console.log(`   ค่าธรรมเนียมธนาคาร เช่น 25 → ${depositAmt - 25}`);
console.log(`   ⛔ ควรตกตรวจมือ เช่น ขาด 40 → ${depositAmt - 40}`);
