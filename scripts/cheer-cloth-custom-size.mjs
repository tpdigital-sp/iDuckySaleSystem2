#!/usr/bin/env node
/**
 * 📐 ผ้าเชียร์ (id 2-2-2 · slug ผ้าเชียร์) — เพิ่ม "กำหนดขนาดเอง" ในกลุ่มแกนราคา "ขนาด"
 *   [ผู้ใช้สั่ง 4 ก.ย. 69: "ต้องการให้กำหนดขนาดเองได้ บางครั้งลูกค้าทำขนาดเล็กกว่า"]
 *
 * ใช้ ProductOption.sizeInput โหมดใหม่ `match: "both"` (เทียบทั้งกว้างและยาว) —
 * ต่างจากพวงกุญแจ/สแตนดี้ที่ดูด้านยาวสุดอย่างเดียว เพราะผ้าเชียร์มีสองแถวที่ยาว 100 ซม.
 * เท่ากันแต่ราคาไม่เท่ากัน (15x100 ฿120 · 25x100 ฿130) — ดูด้านยาวอย่างเดียวจะคิดเงินขาด
 *
 *   • กรอกขนาดเอง → เกาะ "แถวมาตรฐานแถวแรกที่ครอบทั้งสองด้านได้" แล้วคิดราคาตามตารางเรทเดิม
 *     15×50 → แถว 20x60 (ถูกสุด) · 22×95 → แถว 25x100 · 25×150 พอดี → แถว 25x150
 *   • เล็กกว่ามาตรฐานสั่งได้เลย ไม่ต้องรอตีราคา (คิดเท่าขนาดมาตรฐานที่เล็กที่สุดที่ครอบได้)
 *   • ใหญ่กว่าทุกแถว (เกิน 25×150) = "💬 รอแอดมินตีราคา" — กดสั่งไว้ก่อนได้
 *     (อยากได้ราคาทันทีให้เลือกขนาดมาตรฐาน แล้วใช้กลุ่ม "ผ้ากว้างเกินขนาดมาตรฐาน" นิ้วละ ฿15/฿50 ตามเดิม)
 *   • เศษไม่เกินครึ่งเซนฯ ยังอยู่แถวเดิม (roundSlack 0.5 — 20.5×60 ยังเป็นแถว 20x60)
 *
 * แถมแก้ชื่อชุดตัวเลือก "4. ฐาน" → "4. ขนาดเกินมาตรฐาน"
 *   [ผู้ใช้สั่งรอบเดียวกัน: "ชื่อกลุ่มให้คล้ายกับตัวเลือก"]
 *   ชื่อเดิมมาจาก scripts/auto-option-sections.mjs จับคำผิด — /ฐาน/ ไปแมตช์คำว่า "มาตร_ฐาน_"
 *   ในชื่อกลุ่ม "ผ้ากว้างเกินขนาดมาตรฐาน (สกรีน 1 ด้าน)" (แก้ regex ที่สคริปต์นั้นแล้วเหมือนกัน)
 *
 * รันซ้ำได้ (idempotent) · read-modify-write บนแถวจริง + อ่านกลับเทียบ
 *   node scripts/cheer-cloth-custom-size.mjs --dry     ดูค่าที่จะเขียน ไม่แตะ DB
 *   node scripts/cheer-cloth-custom-size.mjs           เขียนจริง
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "2-2-2";
const SIZE_LABEL = "ขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ย.)";
const W_LABEL = "ขนาดกำหนดเอง (กว้าง)";
const H_LABEL = "ขนาดกำหนดเอง (ยาว)";
const UNIT = "ซม.";
const SECTION = "1. ขนาด";       // ชุดเดียวกับกลุ่ม "ขนาด" — ช่องกรอกจะได้อยู่ใต้ dropdown
const MAX_CM = 200;              // กันพิมพ์เลขหลุด (ใหญ่กว่าตาราง = ขอให้แอดมินตีราคา)
const OLD_SECTION = "4. ฐาน";
const NEW_SECTION = "4. ขนาดเกินมาตรฐาน";

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

// 1) ตัวเลือก "กำหนดขนาดเอง" ท้ายกลุ่มขนาด (ตัวนี้ไม่มีช่องราคาในตารางโดยตั้งใจ)
if (!size.choices.some((c) => c.name === CUSTOM)) {
  size.choices.push({ name: CUSTOM, desc: "เล็กหรือใหญ่กว่ามาตรฐานก็ได้ — ราคาคิดเท่าขนาดมาตรฐานที่ครอบได้" });
}

// 2) สเปกคิดราคา — เทียบ "ทั้งสองด้าน" กับแถวมาตรฐาน แล้วเกาะแถวแรกที่ครอบได้ (= ถูกที่สุด)
size.sizeInput = {
  choice: CUSTOM,
  widthLabel: W_LABEL,
  heightLabel: H_LABEL,
  match: "both",
  unit: UNIT,
  roundSlack: 0.5,
};

// 3) ช่องกรอกกว้าง/ยาว — โผล่เมื่อเลือก "กำหนดขนาดเอง" · งานปกติ (standardInput) บังคับกรอกก่อนสั่ง
const showWhen = { label: SIZE_LABEL, choices: [CUSTOM] };
const field = (label, placeholder, hint) => ({
  label,
  display: "input",
  standardInput: true,
  section: SECTION,
  showWhen,
  choices: [],                   // ⚠️ กลุ่ม input ต้องมี choices: [] เสมอ ไม่งั้นหน้าสินค้า 500
  input: { kind: "number", unit: UNIT, min: 1, max: MAX_CM, placeholder, required: true, hint },
});
const pair = [
  field(W_LABEL, "18", "ใส่ทศนิยมได้ เช่น 18.5"),
  field(
    H_LABEL,
    "55",
    `ราคาคิดเท่าขนาดมาตรฐานที่เล็กที่สุดที่ครอบขนาดนี้ได้ (18×55 = ราคาแถว 20x60cm) · ` +
      `ใหญ่กว่า 25×150 ${UNIT} แอดมินตีราคาให้ กดสั่งไว้ก่อนได้`
  ),
];
for (const f of pair) {
  const i = opts.findIndex((o) => o.label === f.label);
  if (i >= 0) opts[i] = { ...opts[i], ...f };
}
const missing = pair.filter((f) => !opts.some((o) => o.label === f.label));
if (missing.length) opts.splice(opts.indexOf(size) + 1, 0, ...missing);

// 4) ⚠️ กฎที่จำกัดรายชื่อขนาด ต้องอนุญาตตัวเลือกใหม่ด้วย ไม่งั้นมันหายเงียบ ๆ (ตอนนี้สินค้านี้ยังไม่มี rules)
let ruleFix = 0;
for (const r of p.rules || []) {
  if (r.limit?.label?.trim() !== SIZE_LABEL) continue;
  if (!r.limit.allow.includes(CUSTOM)) { r.limit.allow.push(CUSTOM); ruleFix++; }
}

// 5) ชื่อชุดตัวเลือกที่จับคำผิด — "4. ฐาน" ไม่เกี่ยวกับฐานอะไรเลย เป็นกลุ่มขนาดเกินมาตรฐาน
let secFix = 0;
for (const o of opts) if (o.section === OLD_SECTION) { o.section = NEW_SECTION; secFix++; }

p.options = opts;
p.savedAt = new Date().toISOString();
console.log(
  "ตัวเลือกในกลุ่มขนาด:", size.choices.length,
  "· ช่องกรอกที่เพิ่ม:", missing.length,
  "· กฎที่เติม allow:", ruleFix,
  "· กลุ่มที่เปลี่ยนชื่อชุด:", secFix
);
if (DRY) {
  console.log(JSON.stringify({ sizeInput: size.sizeInput, choices: size.choices, pair }, null, 1));
  process.exit(0);
}
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// 6) อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
const qSize = (q?.options || []).find((o) => o.label.trim() === SIZE_LABEL);
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
if (qSize?.sizeInput?.choice !== CUSTOM || qSize?.sizeInput?.match !== "both") die("อ่านกลับ sizeInput ไม่ตรง");
if (!qSize.choices.some((c) => c.name === CUSTOM)) die("อ่านกลับ ตัวเลือก custom หาย");
for (const f of pair) {
  const o = (q.options || []).find((x) => x.label === f.label);
  if (!o || o.display !== "input" || !Array.isArray(o.choices)) die("อ่านกลับ ช่องกรอกหาย/ไม่มี choices: " + f.label);
}
if ((q.options || []).some((o) => o.section === OLD_SECTION)) die("อ่านกลับ ชื่อชุด " + OLD_SECTION + " ยังค้าง");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
