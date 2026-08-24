#!/usr/bin/env node
/**
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) — จำนวนต่อแผ่นของงานไดคัท เว้นระยะระหว่างชิ้น 5 มม.
 *
 *   node scripts/paper-art-pet-diecut-gap.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-art-pet-diecut-gap.mjs --write
 *
 * งานไดคัทวางชิ้นงานติดกันไม่ได้ — ตั้ง sheetYield.gap = 0.5 ซม. (5 มม.)
 * สูตรต่อแกนกลายเป็น ⌊(แผ่น + gap) ÷ (ชิ้น + gap)⌋ เช่น 5×5 ซม. บน A3 = 5 × 7 = 35 ชิ้น (เดิม 40)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "paper-art-pet";
const EXPECT_NAME = "กระดาษอาร์ตมัน | PET";
const DIE_H_LABEL = "ขนาดไดคัท (สูง)";
const GAP = 0.5;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

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

const opt = d.options.find((o) => o.label === DIE_H_LABEL);
if (!opt?.sheetYield) die(`ไม่พบกลุ่ม ${DIE_H_LABEL} ที่มี sheetYield`);
if (opt.sheetYield.gap === GAP) die(`gap เป็น ${GAP} อยู่แล้ว`);
opt.sheetYield.gap = GAP;
d.savedAt = new Date().toISOString();

console.log(`sheetYield ใหม่:`, JSON.stringify(opt.sheetYield));

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว (สินค้ายังเป็นฉบับร่าง hidden ตามเดิม)");
