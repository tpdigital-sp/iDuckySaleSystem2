/**
 * เพิ่ม "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)" ให้กลุ่ม "ขนาดใบ" ของกระดาษเย็บบน (package-staple-top)
 * ลูกค้ากรอกกว้าง×สูงเองเป็นซม. — ราคายังคิดต่อแผ่น A3 ละ 45 บาทตามตารางเดิม
 *
 * read-modify-write บนแถวจริง รันซ้ำได้ (idempotent) · --dry = ดูผลไม่บันทึก
 *  - เติมตัวเลือกเข้ากลุ่มขนาดใบ + เติมเซลล์ราคา 45 (กลุ่มนี้เป็น driver ของตารางราคา
 *    ถ้าไม่เติมเซลล์ ราคาจะหล่นไป product.price เงียบ ๆ)
 *  - เพิ่มช่องกรอก "ขนาดใบ (กว้าง)/(สูง)" (standardInput, ซม.) โผล่เมื่อเลือกกำหนดเอง
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "package-staple-top";
const GROUP = "ขนาดใบ";
const CUSTOM_NAME = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W_LABEL = "ขนาดใบ (กว้าง)";
const H_LABEL = "ขนาดใบ (สูง)";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DRY = process.argv.includes("--dry");

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) {
  console.log("SKIP —", error?.message || "not found");
  process.exit(1);
}
const p = row.data;
const opts = p.options || [];
const group = opts.find((o) => o.label === GROUP && Array.isArray(o.choices));
if (!group) {
  console.log(`SKIP — ไม่พบกลุ่ม "${GROUP}"`);
  process.exit(1);
}

let changed = 0;

// 1) เติมตัวเลือก "กำหนดขนาดเอง" ท้ายกลุ่มขนาดใบ
if (!group.choices.some((c) => c.name === CUSTOM_NAME)) {
  group.choices.push({ name: CUSTOM_NAME });
  changed++;
}

// 2) เติมเซลล์ราคาให้ driver — ราคาเดียวกับทุกขนาด (45/แผ่น A3 ทุกจำนวน)
if (p.pricing?.cells && !p.pricing.cells[CUSTOM_NAME]) {
  const anyCell = Object.values(p.pricing.cells)[0] || [p.price];
  p.pricing.cells[CUSTOM_NAME] = [...anyCell];
  changed++;
}

// 3) ช่องกรอกกว้าง/สูง โผล่เมื่อเลือกกำหนดเอง — แทรกถัดจากกลุ่มขนาดใบ
if (!opts.some((o) => o.label === W_LABEL)) {
  const showWhen = { label: GROUP, choices: [CUSTOM_NAME] };
  const mkInput = (extra) => ({
    kind: "number",
    unit: "ซม.",
    min: 2,
    max: 28,
    placeholder: "เช่น 7",
    ...extra,
  });
  const at = opts.indexOf(group) + 1;
  opts.splice(
    at,
    0,
    {
      label: W_LABEL,
      choices: [],
      display: "input",
      standardInput: true,
      showWhen,
      input: mkInput({ hint: "ขนาดใบสำเร็จ (หลังพับครอบปากถุง) หน่วยซม." }),
    },
    {
      label: H_LABEL,
      choices: [],
      display: "input",
      standardInput: true,
      showWhen,
      input: mkInput({ max: 20, placeholder: "เช่น 6" }),
    }
  );
  changed += 2;
}

p.options = opts;
console.log(`${ID} — changed ${changed}`);
console.log("  ขนาดใบ choices:", group.choices.map((c) => c.name).join(" | "));
console.log("  cells[custom]:", JSON.stringify(p.pricing?.cells?.[CUSTOM_NAME]));
console.log("  inputs:", opts.filter((o) => o.display === "input").map((o) => `${o.label} (${o.input.min}-${o.input.max} ${o.input.unit})`).join(" · "));

if (DRY) {
  console.log("  (dry run — ไม่บันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
console.log(upErr ? "  ❌ " + upErr.message : "  ✅ saved");
