#!/usr/bin/env node
/**
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) — กลุ่มตัวเลือกตามเรทการตัด
 *
 *   node scripts/paper-art-pet-cut-size-options.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-art-pet-cut-size-options.mjs --write
 *
 * เพิ่ม 3 กลุ่ม (ทั้งหมดโผล่ตามเรทที่เลือก ผ่าน showWhen "เรทราคา"):
 *   1. "ขนาดตัด" (เรทตัดตามขนาด) — A4 = 2 · A5 = 4 · A6 = 8 · A7 = 16 ชิ้นต่อแผ่น A3 (ป้าย badge)
 *      ไม่มี +฿ — ราคาคิดต่อแผ่น A3 เท่าเดิมไม่ว่าตัดขนาดไหน
 *   2-3. "ขนาดไดคัท (กว้าง)" / "ขนาดไดคัท (สูง)" (เรทไดคัทตามทรง) — ช่องกรอกตัวเลข ซม.
 *      เป็นช่องกรอกงานปกติ (standardInput ไม่ใช่งานสั่งทำ ราคายังคิดตามตาราง)
 *      ช่อง "สูง" ตั้ง sheetYield ให้หน้าเว็บโชว์จำนวนชิ้นโดยประมาณต่อ 1 แผ่น A3 (29.7 × 42 ซม.)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "paper-art-pet";
const EXPECT_NAME = "กระดาษอาร์ตมัน | PET";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const RATE_LABEL = "เรทราคา";
const CUT_LABEL = "ขนาดตัด";
const DIE_W_LABEL = "ขนาดไดคัท (กว้าง)";
const DIE_H_LABEL = "ขนาดไดคัท (สูง)";

const CUT_GROUP = {
  label: CUT_LABEL,
  choices: [
    { name: "A4", badge: "ได้ 2 ชิ้น / แผ่น A3" },
    { name: "A5", badge: "ได้ 4 ชิ้น / แผ่น A3" },
    { name: "A6", badge: "ได้ 8 ชิ้น / แผ่น A3" },
    { name: "A7", badge: "ได้ 16 ชิ้น / แผ่น A3" },
  ],
  showWhen: { label: RATE_LABEL, choices: ["ตัดตามขนาด"] },
};

const dieInput = (label, hint, extra = {}) => ({
  label,
  choices: [],
  display: "input",
  standardInput: true,
  input: { kind: "number", unit: "ซม.", min: 1, max: 42, placeholder: "เช่น 5", hint },
  showWhen: { label: RATE_LABEL, choices: ["ไดคัทตามทรง"] },
  ...extra,
});
const DIE_W_GROUP = dieInput(DIE_W_LABEL, "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด");
const DIE_H_GROUP = dieInput(DIE_H_LABEL, undefined, {
  // ช่องหลังของคู่กว้าง×สูง — กรอกครบแล้วหน้าเว็บโชว์จำนวนชิ้นโดยประมาณต่อ 1 แผ่น A3
  sheetYield: { pairLabel: DIE_W_LABEL, sheetW: 29.7, sheetH: 42, sheetName: "แผ่น A3" },
});

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

for (const label of [CUT_LABEL, DIE_W_LABEL, DIE_H_LABEL]) {
  if (d.options.some((o) => o.label === label)) die(`มีกลุ่ม ${label} อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
}
const rateLabels = d.priceRates.map((r) => r.label);
for (const want of ["ตัดตามขนาด", "ไดคัทตามทรง"]) {
  if (!rateLabels.includes(want)) die(`ไม่พบเรท "${want}" (มี: ${rateLabels.join(", ")})`);
}

// วางไว้บนสุดของกลุ่มตัวเลือก — เป็นคำถามต่อเนื่องจากเรทการตัดที่เพิ่งเลือกด้านบน
d.options.unshift(CUT_GROUP, DIE_W_GROUP, DIE_H_GROUP);
d.savedAt = new Date().toISOString();

console.log(`กลุ่มทั้งหมด: ${d.options.map((o) => o.label).join(" / ")}`);
console.log(`ขนาดตัด: ${CUT_GROUP.choices.map((c) => `${c.name} (${c.badge})`).join(" · ")}`);
console.log(`ช่องไดคัท: ${DIE_W_LABEL} + ${DIE_H_LABEL} (1–42 ซม. · sheetYield A3 29.7×42)`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว (สินค้ายังเป็นฉบับร่าง hidden ตามเดิม)");
