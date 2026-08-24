#!/usr/bin/env node
/**
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) — เพิ่มกระดาษอาร์ตมัน 350 แกรม
 *
 *   node scripts/paper-art-pet-add-350.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-art-pet-add-350.mjs --write
 *
 * ราคา: ตามที่ร้านสั่ง = ราคา 300 แกรม บวก 5 บาท ทุกช่อง (ทุกเคลือบ ทุกขั้น ทุกเรท)
 * ตำแหน่ง: แทรกถัดจาก 300 แกรม (เรียงแกรมน้อย → มาก)
 * กฎ: เข้ากฎล็อกวัสดุ PET = สีขาว เหมือนกระดาษตัวอื่น · สกรีน 2 ด้านได้ตามปกติ (แบบ 300 แกรม)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "paper-art-pet";
const EXPECT_NAME = "กระดาษอาร์ตมัน | PET";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const PAPER_LABEL = "ชนิดกระดาษ";
const PET_MAT_LABEL = "วัสดุ PET";
const P300 = "กระดาษอาร์ตมัน 300 แกรม";
const P350 = "กระดาษอาร์ตมัน 350 แกรม";
const ADD = 5;
const COATS = ["ไม่เคลือบ", "เคลือบเงา", "เคลือบด้าน", "เคลือบพิเศษ"];

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

/* ---------- 1) เพิ่มตัวเลือกถัดจาก 300 แกรม ---------- */
const paperOpt = d.options.find((o) => o.label === PAPER_LABEL);
if (!paperOpt) die(`ไม่พบกลุ่ม ${PAPER_LABEL}`);
if (paperOpt.choices.some((c) => c.name === P350)) die(`มีตัวเลือก ${P350} อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
const at = paperOpt.choices.findIndex((c) => c.name === P300);
if (at < 0) die(`ไม่พบตัวเลือก ${P300}`);
paperOpt.choices.splice(at + 1, 0, { name: P350 });

/* ---------- 2) กฎล็อกวัสดุ PET = สีขาว (เติม 350 ต่อจาก 300 ในกฎเดิม) ---------- */
const matRule = d.rules.find((r) => r.when.label === PAPER_LABEL && r.limit.label === PET_MAT_LABEL);
if (!matRule) die(`ไม่พบกฎ ${PAPER_LABEL} → ${PET_MAT_LABEL}`);
const ruleAt = matRule.when.choices.indexOf(P300);
if (ruleAt < 0) die(`กฎวัสดุ PET ไม่มี ${P300}`);
matRule.when.choices.splice(ruleAt + 1, 0, P350);

/* ---------- 3) ราคา = 300 แกรม + 5 ทุกช่อง (ทุกเรท + ตารางกระจก d.pricing) ---------- */
const fillCells = (matrix, where) => {
  for (const coat of COATS) {
    const src = matrix.cells[`${P300}│${coat}`];
    if (!src) die(`ไม่พบราคา ${P300}│${coat} ใน ${where}`);
    const key = `${P350}│${coat}`;
    if (matrix.cells[key]) die(`มีราคา ${key} อยู่แล้วใน ${where}`);
    matrix.cells[key] = src.map((n) => n + ADD);
  }
};
for (const rate of d.priceRates) fillCells(rate.pricing, `เรท ${rate.id}`);
fillCells(d.pricing, "ตารางกระจก"); // ตารางกระจก = เรทแรก (ตัดตามขนาด) ตามที่หน้าแก้ไขสินค้าบันทึกเสมอ

/* ---------- 4) ข้อความประกอบ ---------- */
const replaceIn = (obj, field, from, to) => {
  if (!obj[field]?.includes(from)) die(`ไม่พบข้อความ "${from}" ใน ${field}`);
  obj[field] = obj[field].replaceAll(from, to);
};
replaceIn(d.tabs[0], "text", "กระดาษอาร์ตมัน หนา 130 / 150 / 300 / 400 แกรม", "กระดาษอาร์ตมัน หนา 130 / 150 / 300 / 350 / 400 แกรม");
replaceIn(d, "description", "(หนา 130 / 150 / 300 / 400 แกรม)", "(หนา 130 / 150 / 300 / 350 / 400 แกรม)");
const hi = d.highlights.indexOf("กระดาษอาร์ตมันนำเข้าจากเกาหลี 130 / 150 / 300 / 400 แกรม");
if (hi < 0) die("ไม่พบ highlight กระดาษ 130/150/300/400");
d.highlights[hi] = "กระดาษอาร์ตมันนำเข้าจากเกาหลี 130 / 150 / 300 / 350 / 400 แกรม";

/* ---------- 5) ช่วงราคา (แบบเดียวกับ priceRange ใน src/lib/products.ts) + คอลัมน์กระจก ---------- */
const all = d.priceRates.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
d.price = d.priceMin;
d.savedAt = new Date().toISOString();

console.log(`ตัวเลือกกระดาษ: ${paperOpt.choices.map((c) => c.name).join(" / ")}`);
for (const rate of d.priceRates)
  console.log(`ราคา 350 (${rate.id}│ไม่เคลือบ):`, rate.pricing.cells[`${P350}│ไม่เคลือบ`].join(", "));
console.log(`กฎวัสดุ PET when.choices:`, matRule.when.choices.join(" / "));
console.log(`ช่วงราคา: ฿${d.priceMin} – ฿${d.priceMax}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb
  .from("products")
  .update({ price: d.price, data: d })
  .eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว (สินค้ายังเป็นฉบับร่าง hidden ตามเดิม)");
