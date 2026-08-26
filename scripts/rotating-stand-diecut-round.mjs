#!/usr/bin/env node
/**
 * rotating-stand: กลุ่ม "ไดคัท" เพิ่มทรงกลม — ชุดทรงเดียวกับสินค้าสแตนดี้ (กลม/สี่เหลี่ยม ฟรี · ตามทรงบวกเพิ่ม)
 *
 *   node scripts/rotating-stand-diecut-round.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/rotating-stand-diecut-round.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 — "มีทรงกลมด้วย เหมือนสินค้าสแตนดี้"
 * ราคาไม่เปลี่ยน: ทรงกลม/ทรงสี่เหลี่ยม ฟรี · ไดคัทตามทรง +20 เท่าเดิม
 * (คงลำดับ "ทรงสี่เหลี่ยม" ไว้ตัวแรก = ค่าเริ่มต้นเดิมของสินค้า — กรอบทรงตั้งปกติเป็นสี่เหลี่ยม)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "rotating-stand";
const LABEL = "ไดคัท";
const SQUARE = "ทรงสี่เหลี่ยม";
const ROUND = "ทรงกลม";
const DIECUT = "ไดคัทตามทรง";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่ได้ — ${error.message}`);
const p = structuredClone(row.data);
const opt = (p.options ?? []).find((o) => o.label === LABEL);
if (!opt) throw new Error(`ไม่มีกลุ่ม "${LABEL}" — ตรวจก่อน`);
if (opt.choices.some((c) => c.name === ROUND)) throw new Error("มีทรงกลมแล้ว — ไม่ต้องรันซ้ำ");
for (const pr of [...(p.priceRates ?? []).map((r) => r.pricing), p.pricing].filter(Boolean))
  if ((pr.driverLabels ?? []).includes(LABEL)) throw new Error(`"${LABEL}" เป็นแกนตารางราคา — ตรวจก่อน`);

const i = opt.choices.findIndex((c) => c.name === DIECUT);
if (i < 0) throw new Error(`ไม่เจอตัวเลือก "${DIECUT}" — ตรวจก่อน`);
opt.choices.splice(i, 0, { name: ROUND }); // แทรกก่อนไดคัทตามทรง → สี่เหลี่ยม · กลม · ตามทรง
opt.note = "ทรงกลม/ทรงสี่เหลี่ยมไม่บวกเพิ่ม · ไดคัทตามทรงของลาย บวกเพิ่มชิ้นละ 20 บาท (คิดทั้งชุด กรอบ + ตัวแขวน)";

const lines = String(p.terms ?? "").split("\n");
const j = lines.findIndex((l) => l.includes("*ไดคัทตามทรง บวกเพิ่มชิ้นละ 20 บาท"));
if (j >= 0) lines[j] = "*ไดคัทตามทรง บวกเพิ่มชิ้นละ 20 บาท (ทรงกลม/ทรงสี่เหลี่ยมไม่บวกเพิ่ม)";
p.terms = lines.join("\n");
p.savedAt = new Date().toISOString();

console.log(`📦 ${p.name} (${ID})`);
console.log(`   [${LABEL}] ` + opt.choices.map((c) => `${c.name}${c.extra ? ` +${c.extra}฿` : " ฟรี"}`).join(" · "));
console.log(`   note: ${opt.note}`);
if (j >= 0) console.log(`   เงื่อนไข: ${lines[j]}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
