#!/usr/bin/env node
/**
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) — เพิ่มกระดาษ 130 / 150 แกรม (เนื้อโปสเตอร์) + เอาภาพที่ 1 ออก
 *
 *   node scripts/paper-art-pet-add-130-150.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-art-pet-add-130-150.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/paperprice
 *   ตาราง "กระดาษอาร์ตมัน | POSTER (โปสเตอร์)" — กระดาษหนา 130 แกรม และ 150 แกรม (อ่านเมื่อ 24 ส.ค. 69)
 *   ตารางบนเว็บเป็นราคา "ไม่ไดคัท" 5 ขั้น (ขั้นสุดท้าย "500 แผ่นขึ้นไป") — สินค้าในระบบใช้ 7 ขั้น
 *   จึงถือค่าขั้น 500+ เดียวกันสำหรับ 500-1999 / 2000-4999 / 5000+
 *   กติกาบวกเพิ่มตามหน้าเว็บ (ตรงกับที่ร้านสั่ง): ไดคัทตามขนาด +10/แผ่น · ไดคัทตามทรง +20/แผ่น
 *
 * เงื่อนไข: กระดาษ 130 แกรม สกรีน 2 ด้านไม่ได้ (150 แกรมสกรีน 2 ด้านได้ปกติ)
 *
 * ภาพที่ 1 ของแกลเลอรี (rate-cut.jpg — รูป Postcard ประจำเรท "ตัดตามขนาด") ถูกถอดออก:
 *   แกลเลอรีดูดภาพประจำเรทกลับเข้ามาเอง (ดู galleryImages ใน ProductDetail) จึงต้องลบ
 *   imageSrc ของเรทตัดตามขนาดด้วย ไม่งั้นภาพโผล่กลับมาท้ายแกลเลอรี
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
const COAT_LABEL = "เคลือบ (เฉพาะด้านหน้า)";
const SIDES_LABEL = "จำนวนด้านที่พิมพ์";
const PET_MAT_LABEL = "วัสดุ PET";
const P130 = "กระดาษอาร์ตมัน 130 แกรม";
const P150 = "กระดาษอาร์ตมัน 150 แกรม";

/** ตาราง POSTER (ราคาไม่ไดคัท) — [ไม่เคลือบ, เคลือบเงา/ด้าน, เคลือบพิเศษ] × 7 ขั้น */
const POSTER = {
  [P130]: {
    "ไม่เคลือบ": [40, 30, 20, 18, 16, 16, 16],
    "เคลือบเงา/ด้าน": [50, 40, 30, 28, 26, 26, 26],
    "เคลือบพิเศษ": [70, 60, 55, 55, 55, 55, 55],
  },
  [P150]: {
    "ไม่เคลือบ": [45, 35, 25, 20, 18, 18, 18],
    "เคลือบเงา/ด้าน": [55, 45, 40, 30, 28, 28, 28],
    "เคลือบพิเศษ": [75, 70, 65, 65, 65, 65, 65],
  },
};
/** บวกเพิ่มต่อแผ่นตามเรทการตัด (id เรทในสินค้า) */
const RATE_ADD = { "cut-to-size": 10, "die-cut": 20, "no-die-cut": 0 };
/** ตัวเลือกเคลือบในกลุ่ม → คอลัมน์ตาราง POSTER */
const COAT_COL = {
  "ไม่เคลือบ": "ไม่เคลือบ",
  "เคลือบเงา": "เคลือบเงา/ด้าน",
  "เคลือบด้าน": "เคลือบเงา/ด้าน",
  "เคลือบพิเศษ": "เคลือบพิเศษ",
};

const DROP_IMG =
  "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/paper-art-pet/rate-cut.jpg";

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

/* ---------- 1) เพิ่มตัวเลือกกระดาษ 130 / 150 (เรียงแกรมน้อย → มาก ตามหน้าเว็บตารางราคา) ---------- */
const paperOpt = d.options.find((o) => o.label === PAPER_LABEL);
if (!paperOpt) die(`ไม่พบกลุ่ม ${PAPER_LABEL}`);
for (const name of [P130, P150]) {
  if (paperOpt.choices.some((c) => c.name === name)) die(`มีตัวเลือก ${name} อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
}
paperOpt.choices.unshift({ name: P130 }, { name: P150 });

/* ---------- 2) กฎเงื่อนไข ---------- */
// 130 แกรม สกรีน 2 ด้านไม่ได้ (แบบเดียวกับกฎ 400 แกรมเดิม)
d.rules.push({
  when: { label: PAPER_LABEL, choice: P130, choices: [P130] },
  limit: { allow: ["พิมพ์ 1 ด้าน"], label: SIDES_LABEL },
});
// กระดาษ (ไม่ใช่ PET) → ล็อกวัสดุ PET = สีขาว เพื่อให้ Add On เป็น "พิมพ์รองสีเงิน" — เติม 130/150 เข้ากฎเดิม
const matRule = d.rules.find((r) => r.when.label === PAPER_LABEL && r.limit.label === PET_MAT_LABEL);
if (!matRule) die(`ไม่พบกฎ ${PAPER_LABEL} → ${PET_MAT_LABEL}`);
matRule.when.choices = [P130, P150, ...matRule.when.choices];

/* ---------- 3) เติมราคาเข้า rate card ทุกเรท (+ ตารางกระจก d.pricing = เรทแรก) ---------- */
const fillCells = (matrix, add) => {
  if (matrix.tiers.length !== 7) die(`ตารางมี ${matrix.tiers.length} ขั้น (คาด 7)`);
  for (const [paper, cols] of Object.entries(POSTER)) {
    for (const [coat, col] of Object.entries(COAT_COL)) {
      const key = `${paper}│${coat}`;
      if (matrix.cells[key]) die(`มีราคา ${key} อยู่แล้ว`);
      matrix.cells[key] = cols[col].map((n) => n + add);
    }
  }
};
for (const rate of d.priceRates) {
  const add = RATE_ADD[rate.id];
  if (add === undefined) die(`ไม่รู้จักเรท ${rate.id}`);
  fillCells(rate.pricing, add);
}
fillCells(d.pricing, RATE_ADD["cut-to-size"]); // ตารางกระจก = เรทแรก (ตัดตามขนาด) ตามที่หน้าแก้ไขสินค้าบันทึกเสมอ

/* ---------- 4) เอาภาพที่ 1 (rate-cut.jpg) ออกจากแกลเลอรี + ภาพประจำเรทตัดตามขนาด ---------- */
if (d.images[0]?.src !== DROP_IMG) die("ภาพที่ 1 ไม่ใช่ rate-cut.jpg — โครงสร้างเปลี่ยน เช็คก่อน");
d.images.shift();
const cutRate = d.priceRates.find((r) => r.id === "cut-to-size");
if (cutRate?.imageSrc === DROP_IMG) delete cutRate.imageSrc;
if (d.imageSrc === DROP_IMG) d.imageSrc = d.images[0].src; // หน้าปกชี้ภาพที่ถอด → เลื่อนเป็นภาพแรกใหม่

/* ---------- 5) ข้อความประกอบ ---------- */
const replaceIn = (obj, field, from, to) => {
  if (!obj[field]?.includes(from)) die(`ไม่พบข้อความ "${from}" ใน ${field}`);
  obj[field] = obj[field].replaceAll(from, to);
};
replaceIn(d.tabs[0], "text", "กระดาษอาร์ตมัน หนา 300 / 400 แกรม", "กระดาษอาร์ตมัน หนา 130 / 150 / 300 / 400 แกรม");
replaceIn(d.tabs[1], "text", "• กระดาษ 400 แกรม ไม่สามารถสกรีน 2 ด้านได้", "• กระดาษ 130 แกรม และ 400 แกรม ไม่สามารถสกรีน 2 ด้านได้");
replaceIn(d, "terms", "• กระดาษ 400 แกรม ไม่สามารถสกรีน 2 ด้านได้", "• กระดาษ 130 แกรม และ 400 แกรม ไม่สามารถสกรีน 2 ด้านได้");
replaceIn(d, "description", "(หนา 300 / 400 แกรม)", "(หนา 130 / 150 / 300 / 400 แกรม)");
const hi = d.highlights.indexOf("กระดาษอาร์ตมันนำเข้าจากเกาหลี 300 / 400 แกรม");
if (hi < 0) die("ไม่พบ highlight กระดาษ 300/400");
d.highlights[hi] = "กระดาษอาร์ตมันนำเข้าจากเกาหลี 130 / 150 / 300 / 400 แกรม";

/* ---------- 6) ช่วงราคา (แบบเดียวกับ priceRange ใน src/lib/products.ts) + คอลัมน์กระจก ---------- */
const all = d.priceRates.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
d.price = d.priceMin;
d.savedAt = new Date().toISOString();

console.log(`ราคาใหม่ 130 แกรม (ไม่ไดคัท│ไม่เคลือบ):`, d.priceRates.find((r) => r.id === "no-die-cut").pricing.cells[`${P130}│ไม่เคลือบ`].join(", "));
console.log(`ราคาใหม่ 150 แกรม (ไดคัทตามทรง│เคลือบพิเศษ):`, d.priceRates.find((r) => r.id === "die-cut").pricing.cells[`${P150}│เคลือบพิเศษ`].join(", "));
console.log(`ช่วงราคา: ฿${d.priceMin} – ฿${d.priceMax} · ตัวเลือกกระดาษ: ${paperOpt.choices.map((c) => c.name).join(" / ")}`);
console.log(`แกลเลอรีเหลือ ${d.images.length} ภาพ ภาพแรก: ${d.images[0].label} · ปก: ${d.imageSrc.split("/").pop()}`);

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
