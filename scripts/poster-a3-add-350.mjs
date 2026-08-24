#!/usr/bin/env node
/**
 * POSTER (poster-a3) — เพิ่มชนิดกระดาษ "กระดาษหนา 350 แกรม"
 *
 *   node scripts/poster-a3-add-350.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/poster-a3-add-350.mjs --write
 *
 * ราคา: ทุกช่องในตาราง (ทั้ง 3 คอลัมน์เคลือบ × 7 ขั้น) = ราคา 300 แกรม + 5 บาท ตามที่ร้านสั่ง
 * เงื่อนไข: สกรีน 2 ด้านได้เหมือน 300 แกรม (กฎล็อก 1 ด้านมีแค่ 130/400 — ไม่แตะ)
 * ตัวเลือกใหม่ยังไม่มีภาพประกอบ (ไฟล์ paper-350.jpg ยังไม่มีในสตอเรจ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "poster-a3";
const EXPECT_NAME = "POSTER";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const PAPER_LABEL = "ชนิดกระดาษ";
const P300 = "กระดาษหนา 300 แกรม";
const P350 = "กระดาษหนา 350 แกรม";
const P400 = "กระดาษหนา 400 แกรม";
const COATS = ["ไม่เคลือบ", "เคลือบเงา / ด้าน", "เคลือบพิเศษ"];
const ADD = 5;

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

/* ---------- 1) เพิ่มตัวเลือกกระดาษ 350 แกรม แทรกระหว่าง 300 กับ 400 ---------- */
const paperOpt = d.options.find((o) => o.label === PAPER_LABEL);
if (!paperOpt) die(`ไม่พบกลุ่ม ${PAPER_LABEL}`);
if (paperOpt.choices.some((c) => c.name === P350)) die(`มีตัวเลือก ${P350} อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
const at400 = paperOpt.choices.findIndex((c) => c.name === P400);
if (at400 < 0) die(`ไม่พบตัวเลือก ${P400}`);
paperOpt.choices.splice(at400, 0, { name: P350 });

/* ---------- 2) ราคา = 300 แกรม + 5 ทุกช่อง ---------- */
if (d.pricing.tiers.length !== 7) die(`ตารางมี ${d.pricing.tiers.length} ขั้น (คาด 7)`);
for (const coat of COATS) {
  const base = d.pricing.cells[`${P300}│${coat}`];
  if (!base) die(`ไม่พบราคา ${P300}│${coat}`);
  if (d.pricing.cells[`${P350}│${coat}`]) die(`มีราคา ${P350}│${coat} อยู่แล้ว`);
  d.pricing.cells[`${P350}│${coat}`] = base.map((n) => n + ADD);
}

/* ---------- 3) ข้อความประกอบ (350 สกรีน 2 ด้านได้เหมือน 300 — terms ไม่ต้องแก้) ---------- */
const replaceIn = (obj, field, from, to) => {
  if (!obj[field]?.includes(from)) die(`ไม่พบข้อความ "${from}" ใน ${field}`);
  obj[field] = obj[field].replaceAll(from, to);
};
replaceIn(d, "description", "เลือกความหนาได้ 4 แบบ", "เลือกความหนาได้ 5 แบบ");
const hi = d.highlights.indexOf("กระดาษอาร์ตมันนำเข้าจากเกาหลี 130 / 150 / 300 / 400 แกรม");
if (hi < 0) die("ไม่พบ highlight กระดาษ 130/150/300/400");
d.highlights[hi] = "กระดาษอาร์ตมันนำเข้าจากเกาหลี 130 / 150 / 300 / 350 / 400 แกรม";
replaceIn(d.tabs[0], "text", "เลือกความหนาได้ 130 / 150 / 300 / 400 แกรม", "เลือกความหนาได้ 130 / 150 / 300 / 350 / 400 แกรม");
replaceIn(d.tabs[1], "text", "(150 / 300 แกรม สกรีน 2 ด้านได้)", "(150 / 300 / 350 แกรม สกรีน 2 ด้านได้)");

/* ---------- 4) ช่วงราคา + คอลัมน์กระจก ---------- */
const all = Object.values(d.pricing.cells).flat().filter((n) => n > 0);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
d.price = d.priceMin;
d.savedAt = new Date().toISOString();

for (const coat of COATS) console.log(`${P350}│${coat}:`, d.pricing.cells[`${P350}│${coat}`].join(", "));
console.log(`ช่วงราคา: ฿${d.priceMin} – ฿${d.priceMax}`);
console.log(`ตัวเลือกกระดาษ: ${paperOpt.choices.map((c) => c.name).join(" / ")}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ price: d.price, data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log(`✓ เขียน Supabase แล้ว (สินค้ายัง hidden=${d.hidden} ตามเดิม)`);
