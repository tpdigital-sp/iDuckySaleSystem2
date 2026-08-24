#!/usr/bin/env node
/**
 * Sticker-uv — กลุ่ม "ขนาดตัด" แยกตามเรทราคา + ช่องขนาดไดคัทเหลือเฉพาะ 100%
 *
 *   node scripts/sticker-uv-diecut-cut-sizes.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-uv-diecut-cut-sizes.mjs --write
 *
 * ทำ 3 อย่าง (ตามแบบ sticker-pp-diecut50-cut-sizes.mjs แต่มี 2 เรท):
 *   1. เรท "ขายแบบ ขนาด A3" + ไดคัท 50% → กลุ่ม "ขนาดตัด" A4=2 · A5=4 · A6=8 · A7=16 ชิ้น/แผ่น A3
 *   2. เรท "ขายแบบ ขนาด ตารางเมตร" + ไดคัท 50% → กลุ่ม "ขนาดตัด (ตร.ม.)" A4=16 · A5=32 · A6=64 · A7=128 ชิ้น/ตร.ม.
 *      (1 ตร.ม. = 8 แผ่น A3 → ตัวเลข = ต่อแผ่น ×8 · โจทย์เขียน A7=256 แต่ขัดกับกติกา ×8 เอง จึงใช้ 128)
 *   3. ช่องกรอก "ขนาดไดคัท (กว้าง)/(สูง)" เดิมโผล่ทั้ง 50%/100% → เหลือเฉพาะ "ไดคัท 100%"
 *      (จำนวนโดยประมาณต่อแผ่น A3 โชว์จาก sheetYield เดิมอยู่แล้ว ใช้ได้ทั้งสองเรท)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-uv";
const EXPECT_NAME = "Sticker-uv";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const RATE_LABEL = "เรทราคา"; // ตรงกับ RATE_LABEL ใน src/lib/products.ts
const RATE_A3 = "ขายแบบ ขนาด A3";
const RATE_SQM = "ขายแบบ ขนาด ตารางเมตร";
const DIE_LABEL = "แบบไดคัท";
const CUT_A3_LABEL = "ขนาดตัด";
const CUT_SQM_LABEL = "ขนาดตัด (ตร.ม.)";
const DIE_W_LABEL = "ขนาดไดคัท (กว้าง)";
const DIE_H_LABEL = "ขนาดไดคัท (สูง)";

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

for (const lb of [RATE_A3, RATE_SQM]) {
  if (!(d.priceRates ?? []).some((r) => r.label === lb)) die(`ไม่พบเรทราคา "${lb}"`);
}
for (const lb of [CUT_A3_LABEL, CUT_SQM_LABEL]) {
  if (d.options.some((o) => o.label === lb)) die(`มีกลุ่ม ${lb} อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
}
const dieGroup = d.options.find((o) => o.label === DIE_LABEL);
if (!dieGroup) die(`ไม่พบกลุ่ม ${DIE_LABEL}`);
const half = dieGroup.choices.find((c) => c.name.includes("50%"))?.name;
const full = dieGroup.choices.find((c) => c.name.includes("100%"))?.name;
if (!half || !full) die(`ตัวเลือกแบบไดคัทไม่ตรงที่คาด (${dieGroup.choices.map((c) => c.name).join(", ")})`);

// 1+2. กลุ่มขนาดตัด — เฉพาะไดคัท 50% แยกกลุ่มตามเรท (จำนวนต่อหน่วยขายไม่เท่ากัน)
const cutGroup = (label, rate, per, unit) => ({
  label,
  choices: [
    { name: "A4", badge: `ได้ ${per[0]} ชิ้น / ${unit}` },
    { name: "A5", badge: `ได้ ${per[1]} ชิ้น / ${unit}` },
    { name: "A6", badge: `ได้ ${per[2]} ชิ้น / ${unit}` },
    { name: "A7", badge: `ได้ ${per[3]} ชิ้น / ${unit}` },
  ],
  showWhen: { label: DIE_LABEL, choices: [half] },
  showWhenAlso: { label: RATE_LABEL, choices: [rate] },
});
const CUT_A3 = cutGroup(CUT_A3_LABEL, RATE_A3, [2, 4, 8, 16], "แผ่น A3");
const CUT_SQM = cutGroup(CUT_SQM_LABEL, RATE_SQM, [16, 32, 64, 128], "ตร.ม.");
const at = d.options.findIndex((o) => o.label === DIE_LABEL);
d.options.splice(at + 1, 0, CUT_A3, CUT_SQM);

// 3. ช่องขนาดไดคัท — เหลือเฉพาะไดคัท 100%
for (const label of [DIE_W_LABEL, DIE_H_LABEL]) {
  const opt = d.options.find((o) => o.label === label);
  if (!opt) die(`ไม่พบกลุ่ม ${label}`);
  if (opt.showWhen?.label !== DIE_LABEL) die(`${label}: showWhen ไม่ได้ผูกกับ ${DIE_LABEL} — โครงสร้างเปลี่ยน หยุดก่อน`);
  opt.showWhen = { label: DIE_LABEL, choices: [full] };
}
d.savedAt = new Date().toISOString();

console.log(`กลุ่มทั้งหมด: ${d.options.map((o) => o.label).join(" / ")}`);
for (const g of [CUT_A3, CUT_SQM]) {
  console.log(`${g.label} (เมื่อ "${half}" + เรท "${g.showWhenAlso.choices[0]}"):`);
  console.log(`  ${g.choices.map((c) => `${c.name} (${c.badge})`).join(" · ")}`);
}
console.log(`ช่องขนาดไดคัท: โผล่เฉพาะ "${full}" (ทั้งสองเรท — sheetYield ต่อแผ่น A3 เดิม)`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว");
