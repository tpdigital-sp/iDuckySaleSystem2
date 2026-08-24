#!/usr/bin/env node
/**
 * sticker-pp (สลัก Sticker-PP-Digital) — แยกตัวเลือกตามแบบไดคัท
 *
 *   node scripts/sticker-pp-diecut50-cut-sizes.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-pp-diecut50-cut-sizes.mjs --write
 *
 * ทำ 2 อย่าง:
 *   1. เพิ่มกลุ่ม "ขนาดตัด" A4 = 2 · A5 = 4 · A6 = 8 · A7 = 16 ชิ้นต่อแผ่น A3 (badge)
 *      โผล่เฉพาะเมื่อเลือก "ไดคัท 50%" — แทรกถัดจากกลุ่ม "แบบไดคัท"
 *   2. ช่องกรอก "ขนาดไดคัท (กว้าง)/(สูง)" เดิมโผล่ทั้ง 50%/100% → เหลือเฉพาะ "ไดคัท 100%"
 *      (จำนวนโดยประมาณต่อแผ่น A3 โชว์จาก sheetYield เดิมอยู่แล้ว)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-pp";
const EXPECT_NAME = "สติ๊กเกอร์";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const DIE_LABEL = "แบบไดคัท";
const CUT_LABEL = "ขนาดตัด";
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

if (d.options.some((o) => o.label === CUT_LABEL)) die(`มีกลุ่ม ${CUT_LABEL} อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
const dieGroup = d.options.find((o) => o.label === DIE_LABEL);
if (!dieGroup) die(`ไม่พบกลุ่ม ${DIE_LABEL}`);
const half = dieGroup.choices.find((c) => c.name.includes("50%"))?.name;
const full = dieGroup.choices.find((c) => c.name.includes("100%"))?.name;
if (!half || !full) die(`ตัวเลือกแบบไดคัทไม่ตรงที่คาด (${dieGroup.choices.map((c) => c.name).join(", ")})`);

// 1. กลุ่มขนาดตัด — เฉพาะไดคัท 50% (ตัดเป็นแผ่นตามขนาดมาตรฐาน ลอกทีละดวง)
const CUT_GROUP = {
  label: CUT_LABEL,
  choices: [
    { name: "A4", badge: "ได้ 2 ชิ้น / แผ่น A3" },
    { name: "A5", badge: "ได้ 4 ชิ้น / แผ่น A3" },
    { name: "A6", badge: "ได้ 8 ชิ้น / แผ่น A3" },
    { name: "A7", badge: "ได้ 16 ชิ้น / แผ่น A3" },
  ],
  showWhen: { label: DIE_LABEL, choices: [half] },
};
const at = d.options.findIndex((o) => o.label === DIE_LABEL);
d.options.splice(at + 1, 0, CUT_GROUP);

// 2. ช่องขนาดไดคัท — เหลือเฉพาะไดคัท 100%
for (const label of [DIE_W_LABEL, DIE_H_LABEL]) {
  const opt = d.options.find((o) => o.label === label);
  if (!opt) die(`ไม่พบกลุ่ม ${label}`);
  if (opt.showWhen?.label !== DIE_LABEL) die(`${label}: showWhen ไม่ได้ผูกกับ ${DIE_LABEL} — โครงสร้างเปลี่ยน หยุดก่อน`);
  opt.showWhen = { label: DIE_LABEL, choices: [full] };
}
d.savedAt = new Date().toISOString();

console.log(`กลุ่มทั้งหมด: ${d.options.map((o) => o.label).join(" / ")}`);
console.log(`ขนาดตัด (เฉพาะ "${half}"): ${CUT_GROUP.choices.map((c) => `${c.name} (${c.badge})`).join(" · ")}`);
console.log(`ช่องขนาดไดคัท: โผล่เฉพาะ "${full}"`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว");
