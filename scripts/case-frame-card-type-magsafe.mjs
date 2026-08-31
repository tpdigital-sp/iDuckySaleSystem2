/**
 * Case Frame Card — เพิ่มกลุ่ม "ประเภทเคส" (ผู้ใช้สั่ง 31 ส.ค. 69)
 *
 *   • ธรรมดา  — ราคาตามตารางเดิม
 *   • Magsafe — ตารางราคาของตัวเอง (400/350/300/250/230/220/200) · มีเฉพาะรุ่น iPhone 13 ขึ้นไป
 *
 * ประเภทเคสจึงเป็น "แกนตารางราคา" (driverLabels) ไม่ใช่ +฿ ต่อชิ้น เพราะส่วนต่างไม่เท่ากันทุกช่วง
 * (ช่วง 11-19 ต่างกัน 100 · ช่วง 200+ ต่างกัน 80) — ตารางเดิมกลายเป็นคอลัมน์ "ธรรมดา"
 *
 * กลุ่มใหม่วางไว้ "ก่อน" กลุ่มรุ่นมือถือ เพราะรายชื่อรุ่นขึ้นกับประเภทที่เลือก
 * และคุมด้วยกฎเงื่อนไข (rules) 2 ข้อ — เลือกประเภทไหน เห็นเฉพาะรุ่นที่ทำได้
 *
 * รุ่น iPhone 17 / 17 Air / 17 Pro / 17 Pro Max เป็นรุ่นใหม่ที่เพิ่มเข้ามาในสินค้านี้
 * และเปิดเฉพาะฝั่ง Magsafe (ลิสต์ที่ผู้ใช้ให้มามีแค่ฝั่ง Magsafe) — ฝั่งธรรมดายังเป็น 16 รุ่นเดิม
 *
 *   node scripts/case-frame-card-type-magsafe.mjs            # ดูสิ่งที่จะแก้ (ไม่เขียนจริง)
 *   node scripts/case-frame-card-type-magsafe.mjs --write    # เขียนลง Supabase
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "case-frame-card";
const TYPE_LABEL = "ประเภทเคส";
const MODEL_LABEL = "รุ่นมือถือ";
/** ตารางราคา/ชิ้น เรียงตาม tiers เดิม: 1-10 · 11-19 · 20-29 · 30-49 · 50-99 · 100-199 · 200+ */
const CELLS = {
  "ธรรมดา": [350, 250, 230, 200, 180, 150, 120],
  "Magsafe": [400, 350, 300, 250, 230, 220, 200],
};

/**
 * รุ่นฝั่ง "ธรรมดา" = 16 รุ่นเดิมของสินค้านี้ (ก่อนเพิ่ม iPhone 17)
 * ⚠️ เขียนตรง ๆ ไม่อ่านจากกลุ่ม — ไม่งั้นรันซ้ำครั้งที่ 2 จะกวาด iPhone 17 ที่เพิ่งเพิ่มเข้ามาด้วย
 */
const PLAIN_MODELS = [
  "iPhone 11",
  "iPhone 12",
  "iPhone 13",
  "iPhone 13 Pro",
  "iPhone 13 Pro Max",
  "iPhone 13 Mini",
  "iPhone 14",
  "iPhone 14 Pro",
  "iPhone 14 Pro Max",
  "iPhone 15",
  "iPhone 15 Pro",
  "iPhone 15 Pro Max",
  "iPhone 16",
  "iPhone 16 Plus",
  "iPhone 16 Pro",
  "iPhone 16 Pro Max",
];

/** รุ่นที่ทำ Magsafe ได้ — ตามลิสต์ที่ผู้ใช้ให้ (iPhone 13 ขึ้นไป ไม่รวม Mini) */
const MAGSAFE_MODELS = [
  "iPhone 13",
  "iPhone 13 Pro",
  "iPhone 13 Pro Max",
  "iPhone 14",
  "iPhone 14 Pro",
  "iPhone 14 Pro Max",
  "iPhone 15",
  "iPhone 15 Pro",
  "iPhone 15 Pro Max",
  "iPhone 16",
  "iPhone 16 Plus",
  "iPhone 16 Pro",
  "iPhone 16 Pro Max",
  "iPhone 17",
  "iPhone 17 Air",
  "iPhone 17 Pro",
  "iPhone 17 Pro Max",
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).maybeSingle();
if (error) throw error;
if (!row) throw new Error(`ไม่เจอสินค้า ${ID}`);

const data = row.data;
const models = data.options?.find((o) => o.label === MODEL_LABEL);
if (!models) throw new Error(`ไม่เจอกลุ่ม "${MODEL_LABEL}" — หยุดก่อน`);

const unknown = models.choices.map((c) => c.name).filter((n) => !PLAIN_MODELS.includes(n) && !MAGSAFE_MODELS.includes(n));
if (unknown.length) throw new Error(`มีรุ่นในสินค้าที่ไม่อยู่ในลิสต์ทั้งสองฝั่ง: ${unknown.join(", ")} — เช็คก่อน`);

// เติมรุ่นที่ยังไม่มีในกลุ่ม (iPhone 17 ทั้ง 4 ตัว) ต่อท้าย
const added = [];
for (const name of MAGSAFE_MODELS) {
  if (models.choices.some((c) => c.name === name)) continue;
  models.choices.push({ name });
  added.push(name);
}

// รุ่นในลิสต์ Magsafe ที่หาไม่เจอ = ชื่อไม่ตรงกัน ต้องรู้ก่อนเขียน
const missing = MAGSAFE_MODELS.filter((n) => !models.choices.some((c) => c.name === n));
if (missing.length) throw new Error(`ชื่อรุ่นไม่ตรงกับในสินค้า: ${missing.join(", ")}`);

// กลุ่มประเภทเคส — วางไว้บนสุด (ต้องเลือกก่อน เพราะรายชื่อรุ่นขึ้นกับค่านี้)
const typeGroup = {
  label: TYPE_LABEL,
  display: "cards",
  note: "ราคาต่อชิ้นขึ้นกับประเภทที่เลือก — กดสลับแล้วตารางราคาด้านบนจะเปลี่ยนตาม",
  choices: [
    {
      name: "ธรรมดา",
      desc: "เคสกรอบการ์ดแบบมาตรฐาน ไม่มีแม่เหล็ก",
    },
    {
      name: "Magsafe",
      desc: "ฝังแม่เหล็ก MagSafe ใช้กับที่ชาร์จไร้สาย/อุปกรณ์แม่เหล็กได้",
      selectedNote: "**Magsafe มีเฉพาะรุ่น iPhone 13 ขึ้นไป** (ไม่มีรุ่น Mini) — รายชื่อรุ่นด้านล่างปรับให้แล้ว",
    },
  ],
};

data.options = [typeGroup, ...data.options.filter((o) => o.label !== TYPE_LABEL)];

// กฎเงื่อนไข: เลือกประเภทไหน เห็นเฉพาะรุ่นที่ทำประเภทนั้นได้
data.rules = [
  ...(data.rules ?? []).filter((r) => r.when?.label !== TYPE_LABEL),
  { when: { label: TYPE_LABEL, choice: "ธรรมดา", choices: ["ธรรมดา"] }, limit: { label: MODEL_LABEL, allow: PLAIN_MODELS } },
  { when: { label: TYPE_LABEL, choice: "Magsafe", choices: ["Magsafe"] }, limit: { label: MODEL_LABEL, allow: MAGSAFE_MODELS } },
];

// ประเภทเคสเป็นแกนตารางราคา — ตารางเดิม (คอลัมน์เดียว key "") กางเป็น 2 คอลัมน์
// ⚠️ ต้องแก้ทั้ง data.pricing และ priceRates[].pricing (เรทแรกต้องตรงกับ pricing เสมอ)
const matrices = [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)].filter(Boolean);
if (!matrices.length) throw new Error("ไม่เจอตารางราคา — หยุดก่อน");
for (const m of matrices) {
  if (m.tiers.length !== CELLS["ธรรมดา"].length)
    throw new Error(`ช่วงจำนวนในตารางมี ${m.tiers.length} ขั้น แต่ราคาที่ให้มามี ${CELLS["ธรรมดา"].length} ขั้น`);
  m.driverLabels = [TYPE_LABEL];
  m.cells = { "ธรรมดา": [...CELLS["ธรรมดา"]], "Magsafe": [...CELLS["Magsafe"]] };
}
const all = Object.values(CELLS).flat();
data.priceMin = Math.min(...all);
data.priceMax = Math.max(...all);
data.price = CELLS["ธรรมดา"][0];

// ข้อความจุดเด่นที่บอกช่วงรุ่นที่รองรับ — ตกยุคแล้วเพราะเพิ่ม iPhone 17 (รันซ้ำได้ ไม่เจอก็ข้าม)
const HL_FROM = "รองรับ iPhone 11 – iPhone 16 Pro Max";
const HL_TO = "รองรับ iPhone 11 – iPhone 17 Pro Max (Magsafe เริ่มที่ iPhone 13)";
data.highlights = (data.highlights ?? []).map((h) => (h === HL_FROM ? HL_TO : h));

console.log(`${ID}: เพิ่มกลุ่ม "${TYPE_LABEL}" เป็นแกนตารางราคา (${matrices.length} ตาราง)`);
console.log(`  ธรรมดา  ${CELLS["ธรรมดา"].join(" / ")}`);
console.log(`  Magsafe ${CELLS["Magsafe"].join(" / ")}`);
console.log(`  ช่วงราคา ฿${data.priceMin}-฿${data.priceMax}`);
console.log(`  รุ่นทั้งหมดในกลุ่ม ${models.choices.length} รุ่น · เพิ่มใหม่ ${added.length ? added.join(", ") : "—"}`);
console.log(`  ธรรมดา ${PLAIN_MODELS.length} รุ่น · Magsafe ${MAGSAFE_MODELS.length} รุ่น`);

if (WRITE) {
  const { error: e } = await sb.from("products").update({ data }).eq("id", ID);
  if (e) throw e;
}
console.log(WRITE ? "✅ เขียนเรียบร้อย" : "👀 dry-run — เติม --write เพื่อเขียนจริง");

