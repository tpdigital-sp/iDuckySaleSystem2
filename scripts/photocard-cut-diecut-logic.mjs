#!/usr/bin/env node
/**
 * "Photo card Digital" (photocard-digital) — เพิ่มกลุ่มการตัด ใช้ตรรกะเดียวกับ
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) และ "กระดาษ Texture Paper" (texture-paper)
 *
 *   node scripts/photocard-cut-diecut-logic.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-cut-diecut-logic.mjs --write
 *
 * โครงที่ได้ (รันซ้ำได้ — มีอยู่แล้วข้าม):
 *   การตัด ─┬─ ขนาดโฟโต้การ์ด (5.5 × 8.5 ซม.)   ← ค่าเริ่มต้น · ได้ 20 ชิ้น / เซ็ต
 *           ├─ ตัดตามขนาด (A4 / A5 / A6 / A7) → กลุ่ม "ตัดเป็นขนาด"
 *           │     A4 = 2 · A5 = 4 · A6 = 8 · A7 = 16 ชิ้น / เซ็ต
 *           │     📐 กำหนดขนาดเอง → ช่องกรอก "ขนาดตัด (กว้าง)/(สูง)"
 *           └─ ไดคัทตามทรง → ช่องกรอก "ขนาดไดคัท (กว้าง)/(สูง)"
 *
 * 1 เซ็ต = 1 แผ่น A3 (เซ็ตละ 20 ใบ ขนาด 5.5 × 8.5 ซม.) — จำนวนชิ้นจึงนับ "ต่อ 1 เซ็ต" ตรง ๆ
 * ช่องด้าน "สูง" ถือ sheetYield พื้นที่วางจริงจาก Print-Fit 43.76 × 28.89 ซม. เว้นระหว่างชิ้น 0.5 ซม.
 * (sheetName ตั้งเป็นหน่วยขายตรง ๆ หน้าเว็บจะได้สรุป "สั่ง 3 เซ็ต = ได้ประมาณ N ชิ้น" ให้ด้วย)
 *
 * ทั้งกลุ่มไม่มี +฿ — การตัดทุกแบบราคาเท่าเดิม (ตามที่ร้านสั่ง 24 ส.ค. 69)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const EXPECT_NAME = "Photo card Digital";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const MODE_LABEL = "การตัด";
const MODE_CARD = "ขนาดโฟโต้การ์ด (5.5 × 8.5 ซม.)";
const MODE_CUT = "ตัดตามขนาด (A4 / A5 / A6 / A7)";
const MODE_DIECUT = "ไดคัทตามทรง";
const SIZE_LABEL = "ตัดเป็นขนาด";
const CUSTOM_NAME = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const CUT_W_LABEL = "ขนาดตัด (กว้าง)";
const CUT_H_LABEL = "ขนาดตัด (สูง)";
const DIE_W_LABEL = "ขนาดไดคัท (กว้าง)";
const DIE_H_LABEL = "ขนาดไดคัท (สูง)";
const AFTER_LABEL = "พิมพ์กี่ด้าน"; // แทรกกลุ่มการตัดไว้ก่อนกลุ่มนี้
const UNIT = "เซ็ต (20 ใบ)";
const SHEET = { sheetW: 43.76, sheetH: 28.89, gap: 0.5, sheetName: UNIT };

/** ขนาดตัดตายตัวได้กี่ชิ้นต่อ 1 เซ็ต (= 1 แผ่น A3) */
const CUT_SIZES = [
  { name: "A4 (21 × 29.7 ซม.)", per: 2 },
  { name: "A5 (14.8 × 21 ซม.)", per: 4 },
  { name: "A6 (10.5 × 14.8 ซม.)", per: 8 },
  { name: "A7 (7.4 × 10.5 ซม.)", per: 16 },
];
const CARD_PER_SET = 20;
const badge = (per) => `ได้ ${per} ชิ้น / เซ็ต`;

const mkInput = (extra = {}) => ({ kind: "number", unit: "ซม.", min: 1, max: 42, placeholder: "เช่น 5", ...extra });

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
const units = new Set([d.pricing?.unit, ...(d.priceRates ?? []).map((r) => r.pricing?.unit)].filter(Boolean));
if (units.size !== 1 || !units.has(UNIT)) die(`หน่วยขายไม่ใช่ "${UNIT}" ทั้งหมด (${[...units].join(" / ")}) — จำนวนชิ้นจะเพี้ยน`);
const at = d.options.findIndex((o) => o.label === AFTER_LABEL);
if (at < 0) die(`ไม่พบกลุ่ม "${AFTER_LABEL}" — โครงสร้างเปลี่ยน หยุดก่อน`);
for (const label of [MODE_LABEL, SIZE_LABEL, CUT_W_LABEL, CUT_H_LABEL, DIE_W_LABEL, DIE_H_LABEL]) {
  if (d.options.some((o) => o.label === label)) die(`มีกลุ่ม "${label}" อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
}

/* ---------- กลุ่มการตัด + กลุ่มขนาด + ช่องกรอก ---------- */
const modeGroup = {
  label: MODE_LABEL,
  choices: [
    // ค่าเริ่มต้น — ขนาดโฟโต้การ์ดมาตรฐาน 1 เซ็ต = 20 ใบ
    { name: MODE_CARD, badge: badge(CARD_PER_SET), piecesPerUnit: CARD_PER_SET },
    { name: MODE_CUT },
    { name: MODE_DIECUT },
  ],
};
const sizeGroup = {
  label: SIZE_LABEL,
  choices: [
    ...CUT_SIZES.map((s) => ({ name: s.name, badge: badge(s.per), piecesPerUnit: s.per })),
    { name: CUSTOM_NAME },
  ],
  showWhen: { label: MODE_LABEL, choices: [MODE_CUT] },
};
const added = [
  modeGroup,
  sizeGroup,
  ...sizeInputs(CUT_W_LABEL, CUT_H_LABEL, {
    showWhen: { label: SIZE_LABEL, choices: [CUSTOM_NAME] },
    showWhenAlso: { label: MODE_LABEL, choices: [MODE_CUT] },
  }),
  ...sizeInputs(DIE_W_LABEL, DIE_H_LABEL, { showWhen: { label: MODE_LABEL, choices: [MODE_DIECUT] } }),
];
d.options.splice(at, 0, ...added);

/* ---------- ข้อควรทราบ: บรรทัด "แจ้งในหมายเหตุ" ไม่จริงแล้ว เลือกบนหน้าได้เลย ---------- */
const OLD_TERM = "ตัดตามขนาดอื่นได้ เช่น A4 A5 A6 A7 (แจ้งในหมายเหตุถึงร้าน)";
const NEW_TERM =
  "เลือกการตัดได้ 3 แบบ — ขนาดโฟโต้การ์ด 5.5×8.5 ซม. (20 ใบ/เซ็ต) · ตัดตามขนาด A4 A5 A6 A7 หรือกำหนดขนาดเอง · ไดคัทตามทรง — ทุกแบบราคาเท่ากัน (1 เซ็ต = 1 แผ่น A3 ตัดได้กี่ชิ้นตามขนาดที่เลือก)";
if (!d.terms?.includes(OLD_TERM)) die(`ไม่พบข้อควรทราบบรรทัด "${OLD_TERM}"`);
d.terms = d.terms.replace(OLD_TERM, NEW_TERM);
d.savedAt = new Date().toISOString();

console.log(`${MODE_LABEL}: ${modeGroup.choices.map((c) => c.name + (c.badge ? ` [${c.badge}]` : "")).join(" · ")}`);
console.log(`${SIZE_LABEL} (โผล่เมื่อ ${MODE_LABEL} = ${MODE_CUT}):`);
sizeGroup.choices.forEach((c) => console.log(`  · ${c.name}${c.badge ? ` → ${c.badge}` : ""}`));
console.log(`\nช่องกรอก: ${CUT_W_LABEL}/${CUT_H_LABEL} (เมื่อกำหนดขนาดเอง) · ${DIE_W_LABEL}/${DIE_H_LABEL} (เมื่อ ${MODE_DIECUT})`);
console.log(`sheetYield: ${JSON.stringify(SHEET)}`);
console.log(`\nกลุ่มทั้งหมด: ${d.options.map((o) => o.label).join(" / ")}`);
console.log(`ข้อควรทราบ → ${NEW_TERM}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว (สินค้ายังเป็นฉบับร่าง hidden ตามเดิม)");
