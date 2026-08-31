#!/usr/bin/env node
/**
 * Sticker-uv — ขั้นต่ำ 3 แผ่น A3 นับ "ทั้งล็อตต่อเนื้อสติ๊กเกอร์ 1 ชนิด" แทนการนับรายบรรทัด
 *
 *   node scripts/sticker-uv-lot-min-by-material.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-uv-lot-min-by-material.mjs --write
 *
 * ทำไม: ขั้นต่ำ 3 แผ่นเป็นของ "รอบผลิต" ไม่ใช่ของสเปคใดสเปคหนึ่ง — 3 แผ่นนั้นคละไดคัท 50%/100%
 * และคละขนาดกันได้ ตราบใดที่เนื้อสติ๊กเกอร์เป็นชนิดเดียวกัน แต่ละสเปค = คนละบรรทัดในตะกร้า
 * บรรทัดละ 1 แผ่น เดิมจึงติดขั้นต่ำรายบรรทัดจนสั่งไม่ได้เลยสักบรรทัด
 *
 * ตั้ง 2 ค่า:
 *   1. priceRates["ขายแบบ ขนาด A3"].minQtyScope = "lot"
 *      → หน้าสินค้าไม่ล็อกปุ่มสั่งอีก (ทยอยเพิ่มทีละแผ่นได้) ประตูขั้นต่ำย้ายไปตะกร้า/ชำระเงิน/เซิร์ฟเวอร์
 *   2. lotKeyOptions = ["เนื้อสติ๊กเกอร์"]
 *      → ล็อตแยกตามเนื้อ: เนื้อขาว 2 + เนื้อใส 1 ไม่นับว่าครบ 3 (ผลิตคนละรอบ)
 *        และช่วงราคา (tier) ก็นับแยกเนื้อเช่นกัน
 *
 * ไม่แตะ: เรท "ขายแบบ ขนาด ตารางเมตร" (ไม่มีขั้นต่ำ) · เรทคนละหน่วยแยกล็อตกันอยู่แล้วผ่าน hardMinQty
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-uv";
const EXPECT_NAME = "Sticker-uv";
const RATE_A3 = "ขายแบบ ขนาด A3";
const LOT_KEY = "เนื้อสติ๊กเกอร์";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;

const a3 = (d.priceRates ?? []).find((r) => r.label === RATE_A3);
if (!a3) die(`ไม่พบเรท "${RATE_A3}"`);
if (!a3.minQty || a3.minQty < 2) die(`เรท "${RATE_A3}" ยังไม่มี minQty — รัน sticker-uv-rate-position-min3.mjs ก่อน`);
const opt = (d.options ?? []).find((o) => o.label === LOT_KEY);
if (!opt) die(`ไม่พบกลุ่มตัวเลือก "${LOT_KEY}" — ตั้ง lotKeyOptions ไม่ได้`);

a3.minQtyScope = "lot";
d.lotKeyOptions = [LOT_KEY];
// pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน
if (d.priceRates[0].label === RATE_A3) d.pricing = a3.pricing;
d.savedAt = new Date().toISOString();

console.log(`ขั้นต่ำ: "${RATE_A3}" = ${a3.minQty} ${a3.pricing.unit} · นับที่ ${a3.minQtyScope} (ยอดรวมทั้งล็อต)`);
console.log(`แยกล็อตตาม: ${d.lotKeyOptions.join(" · ")} → ${opt.choices.map((c) => c.name).join(" | ")}`);
for (const r of d.priceRates)
  console.log(`  · ${r.label}: minQty=${r.minQty ?? "—"} scope=${r.minQtyScope ?? "line"} หน่วย=${r.pricing.unit}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows) — เช็ค id/สิทธิ์");

// อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง เลยต้องเช็คของจริงทุกครั้ง
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const b = back[0].data;
const bA3 = b.priceRates.find((r) => r.label === RATE_A3);
const ok = bA3?.minQtyScope === "lot" && bA3?.minQty === a3.minQty && JSON.stringify(b.lotKeyOptions) === JSON.stringify([LOT_KEY]);
console.log(
  `อ่านกลับ: A3 minQty=${bA3?.minQty} scope=${JSON.stringify(bA3?.minQtyScope)} · lotKeyOptions=${JSON.stringify(b.lotKeyOptions)}`
);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เสร็จ");
