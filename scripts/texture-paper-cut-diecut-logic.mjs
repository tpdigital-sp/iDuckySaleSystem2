#!/usr/bin/env node
/**
 * "กระดาษ Texture Paper" (texture-paper) — ตรรกะ "ตัดเป็นขนาด" + "ไดคัทตามทรง"
 * ให้เหมือนหน้า "กระดาษอาร์ตมัน | PET" (paper-art-pet)
 *
 *   node scripts/texture-paper-cut-diecut-logic.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-cut-diecut-logic.mjs --write
 *
 * ทำ 3 อย่าง (รันซ้ำได้ — มีอยู่แล้วข้าม):
 *   1. กลุ่ม "ตัดเป็นขนาด" (โผล่เมื่อ การตัด = ตัดตามขนาด) — ติดป้าย + piecesPerUnit
 *      A4 = 2 · A5 = 4 · A6 = 8 · A7 = 16 ชิ้นต่อ 1 แผ่น A3 (หน้าเว็บสรุป "สั่ง 10 แผ่น = 40 ชิ้น" ได้)
 *   2. แทน "ขนาดอื่น ๆ (แจ้งขนาดกับแอดมิน)" ด้วย "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)"
 *      + ช่องกรอก "ขนาดตัด (กว้าง)/(สูง)" ที่โผล่เมื่อเลือกกำหนดขนาดเอง
 *   3. ช่องกรอก "ขนาดไดคัท (กว้าง)/(สูง)" โผล่เมื่อ การตัด = ไดคัทตามทรง
 *
 * ช่องกรอกทั้งหมดเป็น standardInput (งานปกติ ไม่ใช่งานสั่งทำ ราคายังคิดตามตารางเดิม)
 * ช่องด้าน "สูง" ถือ sheetYield → หน้าเว็บโชว์จำนวนชิ้นโดยประมาณต่อ 1 แผ่น A3
 * พื้นที่วางอิงโปรแกรม Print-Fit ของร้าน 43.76 × 28.89 ซม. เว้นระหว่างชิ้น 0.5 ซม.
 * (ชุดเดียวกับ paper-art-pet / sticker-uv / sticker-pp)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const EXPECT_NAME = "กระดาษ Texture Paper";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const MODE_LABEL = "การตัด";                       // แกนตารางราคา (driverLabels) — ห้ามแตะตัวเลือกในนี้
const MODE_CUT = "ตัดตามขนาด (A4 / A5 / A6 / A7)";
const MODE_DIECUT = "ไดคัทตามทรง";
const SIZE_LABEL = "ตัดเป็นขนาด";
const CUSTOM_NAME = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const OLD_CUSTOM_NAME = "ขนาดอื่น ๆ (แจ้งขนาดกับแอดมิน)";
const CUT_W_LABEL = "ขนาดตัด (กว้าง)";
const CUT_H_LABEL = "ขนาดตัด (สูง)";
const DIE_W_LABEL = "ขนาดไดคัท (กว้าง)";
const DIE_H_LABEL = "ขนาดไดคัท (สูง)";
const SHEET = { sheetW: 43.76, sheetH: 28.89, gap: 0.5, sheetName: "แผ่น A3" };

/** A4-A7 ได้กี่ชิ้นต่อ 1 แผ่น A3 (ชุดเดียวกับ paper-art-pet) — คีย์เทียบจากตัวอักษรหน้าชื่อ */
const PIECES = { A4: 2, A5: 4, A6: 8, A7: 16 };

const mkInput = (extraInput = {}) => ({
  kind: "number",
  unit: "ซม.",
  min: 1,
  max: 42,
  placeholder: "เช่น 5",
  ...extraInput,
});

/** คู่ช่องกรอก กว้าง×สูง — gate = เงื่อนไขแสดงผลที่ใช้ร่วมกันทั้งคู่ */
const sizeInputs = (wLabel, hLabel, gate) => [
  {
    label: wLabel,
    choices: [],
    display: "input",
    standardInput: true,
    ...gate,
    input: mkInput({ hint: "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด" }),
  },
  {
    label: hLabel,
    choices: [],
    display: "input",
    standardInput: true,
    ...gate,
    input: mkInput(),
    sheetYield: { pairLabel: wLabel, ...SHEET },
  },
];

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

/* ---------- ตรวจโครงเดิมก่อนแตะ ---------- */
const modeOpt = d.options.find((o) => o.label === MODE_LABEL);
if (!modeOpt) die(`ไม่พบกลุ่ม "${MODE_LABEL}"`);
const modeNames = modeOpt.choices.map((c) => c.name);
for (const want of [MODE_CUT, MODE_DIECUT]) {
  if (!modeNames.includes(want)) die(`ไม่พบตัวเลือก "${want}" ในกลุ่ม ${MODE_LABEL} (มี: ${modeNames.join(" / ")})`);
}
const sizeOpt = d.options.find((o) => o.label === SIZE_LABEL);
if (!sizeOpt) die(`ไม่พบกลุ่ม "${SIZE_LABEL}"`);
if (sizeOpt.showWhen?.label !== MODE_LABEL || !sizeOpt.showWhen.choices.includes(MODE_CUT)) {
  die(`กลุ่ม ${SIZE_LABEL} ไม่ได้ผูกกับ ${MODE_LABEL} = ${MODE_CUT} ตามที่คาด`);
}
if (d.pricing?.unit !== SHEET.sheetName) die(`หน่วยขายไม่ใช่ ${SHEET.sheetName} (${d.pricing?.unit}) — ป้ายจำนวนชิ้นจะเพี้ยน`);

const log = [];

/* ---------- 1) ป้าย + piecesPerUnit ของ A4-A7 ---------- */
for (const c of sizeOpt.choices) {
  const key = (c.name.match(/^A[4-7]/) || [])[0];
  if (!key) continue;
  const per = PIECES[key];
  const badge = `ได้ ${per} ชิ้น / ${SHEET.sheetName}`;
  const same = c.piecesPerUnit === per && c.badge === badge;
  c.badge = badge;
  c.piecesPerUnit = per;
  log.push(`  · ${c.name} → ${badge}${same ? " (เท่าเดิม)" : ""}`);
}
if (log.length !== 4) die(`อ่านขนาด A4-A7 ได้ ${log.length} ตัว (คาด 4) — โครงสร้างเปลี่ยน หยุดก่อน`);

/* ---------- 2) กำหนดขนาดเอง แทน "ขนาดอื่น ๆ" ---------- */
const oldIdx = sizeOpt.choices.findIndex((c) => c.name === OLD_CUSTOM_NAME);
if (oldIdx >= 0) {
  sizeOpt.choices[oldIdx] = { name: CUSTOM_NAME };
  log.push(`  · "${OLD_CUSTOM_NAME}" → "${CUSTOM_NAME}"`);
} else if (!sizeOpt.choices.some((c) => c.name === CUSTOM_NAME)) {
  sizeOpt.choices.push({ name: CUSTOM_NAME });
  log.push(`  · เพิ่ม "${CUSTOM_NAME}"`);
}

/* ---------- 3) ช่องกรอกขนาดตัด + ขนาดไดคัท ---------- */
const cutGate = {
  showWhen: { label: SIZE_LABEL, choices: [CUSTOM_NAME] },
  showWhenAlso: { label: MODE_LABEL, choices: [MODE_CUT] },
};
const dieGate = { showWhen: { label: MODE_LABEL, choices: [MODE_DIECUT] } };
const added = [
  ...sizeInputs(CUT_W_LABEL, CUT_H_LABEL, cutGate),
  ...sizeInputs(DIE_W_LABEL, DIE_H_LABEL, dieGate),
].filter((o) => !d.options.some((x) => x.label === o.label));

// วางต่อท้ายกลุ่ม "ตัดเป็นขนาด" — เป็นคำถามต่อเนื่องจากโหมดการตัดที่เพิ่งเลือกด้านบน
d.options.splice(d.options.indexOf(sizeOpt) + 1, 0, ...added);
d.savedAt = new Date().toISOString();

console.log(`${SIZE_LABEL} (โผล่เมื่อ ${MODE_LABEL} = ${MODE_CUT}):`);
log.forEach((l) => console.log(l));
console.log(`\nช่องกรอกที่เพิ่ม: ${added.map((o) => o.label).join(" / ") || "— (มีครบแล้ว)"}`);
console.log(`  ขนาดตัด → โผล่เมื่อ ${SIZE_LABEL} = กำหนดขนาดเอง (และ ${MODE_LABEL} = ตัดตามขนาด)`);
console.log(`  ขนาดไดคัท → โผล่เมื่อ ${MODE_LABEL} = ${MODE_DIECUT}`);
console.log(`  sheetYield: ${JSON.stringify(SHEET)}`);
console.log(`\nกลุ่มทั้งหมด: ${d.options.map((o) => o.label).join(" / ")}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว");
