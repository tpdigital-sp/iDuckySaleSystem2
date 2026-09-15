#!/usr/bin/env node
/**
 * 📐 กิ๊บติดผมอะคริลิค (otheracrylicproducts5-1) — เจ้าของร้านสั่ง 15 ก.ย. 69 (ภาพมาร์กหน้าสินค้า)
 *
 *  1) กลุ่ม "ติดกิ๊บ" เดิมมีแค่ ซ้าย/ขวา → เพิ่ม **"ด้านอื่นๆ (แนบภาพประกอบ)"**
 *     (ลูกค้าอยากได้ตำแหน่งอื่น ส่งภาพประกอบมาบอกเอา)
 *  2) กลุ่ม "ขนาด" เดิมมีแค่ 2-6 ซม. → เพิ่ม 2 ตัวเลือกท้ายเมนู
 *     • "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)" + ช่องกรอก (ProductOption.sizeInput เหมือนกริ๊บต๊อก/พวงกุญแจ)
 *     • "📄 ขนาดอื่น / ตามไฟล์ (กราฟฟิกวัดให้ตอนทำแบบ)" — ไม่ต้องวัดเอง
 *
 * 💰 ราคาสินค้าตัวนี้ **ไม่ได้ขึ้นกับขนาด** (pricing.driverLabels = [] · cells คีย์ "") ราคาวิ่งตามจำนวนอย่างเดียว
 *    ของเดิมคิดขนาดเกินด้วยกลุ่มสเต็ปเปอร์ "เพิ่มขนาด" (โผล่เมื่อเลือก 6 cm · เซนละ ฿10 · สูงสุด 5 ซม.)
 *    → ตั้ง sizeInput ให้ตรงกติกาเดิมเป๊ะ ๆ: overRate 10 · askOver 11 (6+5)
 *      ≤ 6 ซม. = ราคาปกติ · 7-11 ซม. = +฿10 ต่อ ซม. ที่เกิน 6 · เกิน 11 ซม. = 💬 รอแอดมินตีราคา
 *    (เลือก "กำหนดขนาดเอง" แล้วกลุ่ม "เพิ่มขนาด" ไม่โผล่ เพราะ showWhen ผูกกับชื่อแถว "6 cm" — ไม่คิดซ้ำ)
 *
 * รันซ้ำได้ (idempotent) · --dry = ดูอย่างเดียว · เขียนแล้วอ่านกลับเทียบทุกข้อ
 *   node scripts/hair-clip-custom-size.mjs --dry
 *   node scripts/hair-clip-custom-size.mjs
 *
 * ⚠️ ภาพประกอบของ 3 ตัวเลือกใหม่อยู่ที่ scripts/hair-clip-more-option-art.mjs (รันต่อจากสคริปต์นี้)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "otheracrylicproducts5-1";
const SIZE_LABEL = "ขนาด";
const SIDE_GROUP = "ติดกิ๊บ";

const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const BY_FILE = "📄 ขนาดอื่น / ตามไฟล์ (กราฟฟิกวัดให้ตอนทำแบบ)";
const OTHER_SIDE = "ด้านอื่นๆ (แนบภาพประกอบ)";
const SIDE_INPUT = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";

const UNIT = "ซม.";
const FREE_CM = 6;     // แถวใหญ่สุดในเมนู (ราคาเท่ากันทุกแถว)
const OVER_RATE = 10;  // เกิน 6 ซม. คิดเพิ่ม ซม. ละ ฿10 (เท่ากลุ่ม "เพิ่มขนาด" เดิม)
const ASK_OVER = 11;   // เกินกว่านี้ = แอดมินตีราคา (เดิมสเต็ปเปอร์ให้เพิ่มได้สูงสุด 5 ซม.)
const MAX_CM = 30;     // กันพิมพ์เลขหลุด (เกิน ASK_OVER ยังกรอกได้ = ขอให้ตีราคา)

const BY_FILE_NOTE =
  `ไม่ต้องวัดเอง — กราฟฟิกวัดจากไฟล์ลายที่ส่งมา แล้วแจ้งขนาดจริงตอนส่งแบบให้ตรวจ · ` +
  `ถ้าด้านที่ยาวที่สุดเกิน ${FREE_CM} ${UNIT} คิดเพิ่ม ${UNIT}ละ ฿${OVER_RATE} (แจ้งยอดก่อนเริ่มผลิต)`;

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const DRY = process.argv.includes("--dry");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];

const size = opts.find((o) => o.label.trim() === SIZE_LABEL);
if (!size) die("ไม่พบกลุ่ม " + SIZE_LABEL);
const side = opts.find((o) => o.label.trim() === SIDE_GROUP);
if (!side) die("ไม่พบกลุ่ม " + SIDE_GROUP);

// ⚠️ ด่านกันของเก่าหาย: แถว "6 cm" คือตัวที่กลุ่ม "เพิ่มขนาด" ผูก showWhen ไว้ และเป็นแถวใหญ่สุดที่ overRate ใช้เป็นฐาน
if (!size.choices.some((c) => c.name === `${FREE_CM} cm`)) die(`ไม่เจอแถว "${FREE_CM} cm" ในกลุ่มขนาด — กติกาคิดส่วนเกินจะเพี้ยน`);
const step = opts.find((o) => o.label.trim() === "เพิ่มขนาด");
if (step && Number(step.choices?.[0]?.extra) !== OVER_RATE)
  die(`กลุ่ม "เพิ่มขนาด" คิด ซม.ละ ฿${step.choices?.[0]?.extra} ไม่ใช่ ฿${OVER_RATE} — แก้ OVER_RATE ให้ตรงกันก่อน`);

// 1) ตัวเลือกใหม่ในกลุ่ม "ติดกิ๊บ" (การ์ด — desc คือคำอธิบายใต้ชื่อ)
let addedSide = 0;
const otherSide = side.choices.find((c) => c.name === OTHER_SIDE);
const OTHER_DESC = "ตำแหน่งอื่นตามต้องการ · แนบภาพประกอบมาพร้อมไฟล์ลาย";
if (otherSide) otherSide.desc = OTHER_DESC;
else { side.choices.push({ name: OTHER_SIDE, desc: OTHER_DESC }); addedSide++; }

// 2) ตัวเลือกใหม่ท้ายกลุ่ม "ขนาด" — กำหนดเอง แล้วต่อด้วยตามไฟล์ (ลำดับเดียวกับสินค้าแผ่นทั้งร้าน)
let addedSize = 0;
if (!size.choices.some((c) => c.name === CUSTOM)) { size.choices.push({ name: CUSTOM }); addedSize++; }
const custom = size.choices.find((c) => c.name === CUSTOM);
custom.desc = `กรอกขนาดเอง · เกิน ${FREE_CM} ${UNIT} คิดเพิ่ม ${UNIT}ละ ฿${OVER_RATE}`;
if (!size.choices.some((c) => c.name === BY_FILE)) { size.choices.push({ name: BY_FILE }); addedSize++; }
const byFile = size.choices.find((c) => c.name === BY_FILE);
byFile.desc = "กราฟฟิกวัดจากไฟล์ลายให้";
byFile.selectedNote = BY_FILE_NOTE;

// 3) สเปกคิดราคาของ "กำหนดขนาดเอง" — ด้านยาวสุดช่องเดียว (สินค้านี้ไดคัทตามทรงลาย วัดด้านยาวสุดอยู่แล้ว)
//    heightLabel ชี้ช่องเดียวกับ widthLabel = โหมดกรอกด้านเดียว (ดู SizeInputSpec ใน src/lib/products.ts)
size.sizeInput = {
  choice: CUSTOM,
  widthLabel: SIDE_INPUT,
  heightLabel: SIDE_INPUT,
  askOver: ASK_OVER,
  overRate: OVER_RATE,
  unit: UNIT,
};

// 4) ช่องกรอกด้านยาวสุด — โผล่เมื่อเลือก "กำหนดขนาดเอง" · บังคับกรอกก่อนสั่ง (standardInput)
//    ⚠️ สินค้านี้แบ่งชุดตัวเลือกไว้แล้ว ช่องกรอกต้องมี section เดียวกับกลุ่มขนาด ไม่งั้นโผล่นอกกรอบหัวข้อ
const field = {
  label: SIDE_INPUT,
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE_LABEL, choices: [CUSTOM] },
  section: size.section,
  choices: [],
  input: {
    kind: "number",
    unit: UNIT,
    min: 1,
    max: MAX_CM,
    placeholder: "7.5",
    required: true,
    hint:
      `วัดด้านที่ยาวที่สุดของชิ้นอะคริลิค ใส่ทศนิยมได้ เช่น 7.5 · เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม ` +
      `(3.5 ${UNIT} = แถว 3 cm · 3.6 ${UNIT} = แถว 4 cm) · เกิน ${FREE_CM} ${UNIT} คิดเพิ่ม ${UNIT}ละ ฿${OVER_RATE} ` +
      `· เกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`,
  },
};
let addedField = 0;
const fi = opts.findIndex((o) => o.label === field.label);
if (fi >= 0) opts[fi] = { ...opts[fi], ...field };
else { opts.splice(opts.indexOf(size) + 1, 0, field); addedField++; }

// 5) ⚠️ กฎที่จำกัดรายชื่อตัวเลือก ต้องอนุญาตตัวใหม่ด้วย ไม่งั้นมันหายเงียบ ๆ (ตอนนี้สินค้านี้ยังไม่มีกฎ)
let ruleFix = 0;
for (const r of p.rules || []) {
  const lb = r.limit?.label?.trim();
  const add = lb === SIZE_LABEL ? [CUSTOM, BY_FILE] : lb === SIDE_GROUP ? [OTHER_SIDE] : [];
  for (const n of add) if (!r.limit.allow.includes(n)) { r.limit.allow.push(n); ruleFix++; }
}

p.options = opts;
p.savedAt = new Date().toISOString();
console.log(
  `ตัวเลือกที่เพิ่ม — ${SIDE_GROUP}: ${addedSide} · ${SIZE_LABEL}: ${addedSize} · ช่องกรอก: ${addedField} · กฎที่เติม allow: ${ruleFix}`
);
console.log(`กติกาคิดเงิน: ≤${FREE_CM} ${UNIT} ราคาปกติ · เกินคิด ${UNIT}ละ ฿${OVER_RATE} ถึง ${ASK_OVER} ${UNIT} · เกินกว่านั้นรอตีราคา`);
if (DRY) {
  console.log(JSON.stringify({ sizeInput: size.sizeInput, choices: size.choices.map((c) => c.name), side: side.choices.map((c) => c.name), field }, null, 1));
  process.exit(0);
}

const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// 6) อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
const qSize = (q.options || []).find((o) => o.label.trim() === SIZE_LABEL);
const qSide = (q.options || []).find((o) => o.label.trim() === SIDE_GROUP);
if (!qSide?.choices.some((c) => c.name === OTHER_SIDE)) die("อ่านกลับ ตัวเลือก " + OTHER_SIDE + " หาย");
for (const n of [CUSTOM, BY_FILE]) if (!qSize?.choices.some((c) => c.name === n)) die("อ่านกลับ ตัวเลือกหาย: " + n);
if (qSize.sizeInput?.choice !== CUSTOM) die("อ่านกลับ sizeInput.choice ไม่ตรง");
if (qSize.sizeInput.overRate !== OVER_RATE || qSize.sizeInput.askOver !== ASK_OVER) die("อ่านกลับ เรทส่วนเกิน/เพดานไม่ตรง");
if (qSize.sizeInput.heightLabel !== SIDE_INPUT) die("อ่านกลับ heightLabel ไม่ได้ชี้ช่องเดียวกับ widthLabel");
if (qSize.choices.find((c) => c.name === BY_FILE)?.selectedNote !== BY_FILE_NOTE) die("อ่านกลับ selectedNote ของตามไฟล์ไม่ตรง");
const qf = (q.options || []).find((o) => o.label === SIDE_INPUT);
if (!qf || qf.display !== "input" || qf.input?.required !== true || qf.input?.integer === true)
  die("อ่านกลับ ช่องกรอกหาย/ไม่บังคับกรอก/บล็อกทศนิยม");
if (qf.section !== qSize.section) die("อ่านกลับ ช่องกรอกอยู่คนละชุดกับกลุ่มขนาด");
if (qf.showWhen?.choices?.[0] !== CUSTOM) die("อ่านกลับ showWhen ของช่องกรอกไม่ตรง");
// ของเดิมต้องไม่หายไปกับการเขียนรอบนี้
if (!qSize.choices.some((c) => c.name === `${FREE_CM} cm` && c.imageSrc)) die("อ่านกลับ แถว 6 cm / ภาพประกอบหาย");
if (!(q.options || []).find((o) => o.label === "เพิ่มขนาด")?.showWhen?.choices?.includes(`${FREE_CM} cm`))
  die("อ่านกลับ showWhen ของกลุ่ม \"เพิ่มขนาด\" หลุด");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ · savedAt =", q.savedAt);
