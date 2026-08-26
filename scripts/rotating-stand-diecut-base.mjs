#!/usr/bin/env node
/**
 * rotating-stand: เพิ่ม 2 กลุ่มตัวเลือก — ไดคัทตามทรง + ขนาดฐาน
 *
 *   node scripts/rotating-stand-diecut-base.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/rotating-stand-diecut-base.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 — https://iduckystore.com/products/rotating-stand
 *   • ไดคัทตามทรง บวกเพิ่ม 20 บาท
 *   • ฐานเริ่มที่ขนาด 3-4 ซม. (ราคารวมสกรีนลายฐานแล้ว) เพิ่มขนาดฐานคิด ซม.ละ 10 บาท สูงสุด 10 ซม.
 *
 * ทั้งสองกลุ่มเป็น +฿ แบนทุกช่วงจำนวน (ไม่ใช่แกนตารางราคา) — ตารางราคาคอลัมน์เดียวของสินค้าไม่ถูกแตะ
 * แบบเดียวกับกลุ่ม "เพิ่มขนาดอะคริลิค" (ซม.ละ 20) ที่มีอยู่แล้วบนสินค้าตัวนี้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "rotating-stand";

const DIECUT_LABEL = "ไดคัท";
const SQUARE = "ทรงสี่เหลี่ยม";
const DIECUT = "ไดคัทตามทรง";
const BASE_LABEL = "ขนาดฐาน";
const BASE_STD = "ฐาน 3-4 ซม. (มาตรฐาน)";
/** ฐานมาตรฐาน 3-4 ซม. ฟรี · เกินจากนั้นคิด ซม.ละ 10 บาท (นับจาก 4 ซม.) เพดาน 10 ซม. */
const BASE_CM = [5, 6, 7, 8, 9, 10];
const BASE_PER_CM = 10;
const baseName = (cm) => `ฐาน ${cm} ซม.`;

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
const grp = (l) => (p.options ?? []).find((o) => o.label === l);

// ── กันรันซ้ำ ─────────────────────────────────────────────────────────────────
if (grp(DIECUT_LABEL)) throw new Error(`มีกลุ่ม "${DIECUT_LABEL}" แล้ว — เพิ่มไปแล้ว ไม่ต้องรันซ้ำ`);
if (grp(BASE_LABEL)) throw new Error(`มีกลุ่ม "${BASE_LABEL}" แล้ว — เพิ่มไปแล้ว ไม่ต้องรันซ้ำ`);
// ทั้งสองกลุ่มต้องไม่ชนแกนตารางราคา (ไม่งั้นราคาหล่นไป product.price เงียบ ๆ)
for (const r of [...(p.priceRates ?? []).map((r) => r.pricing), p.pricing].filter(Boolean))
  for (const d of r.driverLabels ?? [])
    if (d === DIECUT_LABEL || d === BASE_LABEL) throw new Error(`"${d}" เป็นแกนตารางราคาอยู่ — ตรวจก่อน`);

// ── 1) ไดคัท (สี่เหลี่ยม ฟรี · ตามทรง +20) ────────────────────────────────────
const diecut = {
  label: DIECUT_LABEL,
  note: "ไดคัทตามทรงของลาย บวกเพิ่มชิ้นละ 20 บาท (คิดทั้งชุด กรอบ + ตัวแขวน)",
  choices: [{ name: SQUARE }, { name: DIECUT, extra: 20 }],
};

// ── 2) ขนาดฐาน (3-4 ซม. ฟรี รวมสกรีนลายฐาน · เกินนั้น ซม.ละ 10 เพดาน 10 ซม.) ──
const base = {
  label: BASE_LABEL,
  stockBearing: true,
  note: "ฐานมาตรฐาน 3-4 ซม. ราคารวมสกรีนลายฐานแล้ว · เพิ่มขนาดฐานคิดเซนติเมตรละ 10 บาท (สูงสุด 10 ซม.)",
  choices: [
    { name: BASE_STD },
    ...BASE_CM.map((cm) => ({ name: baseName(cm), extra: (cm - 4) * BASE_PER_CM })),
  ],
};

p.options = [...(p.options ?? []), diecut, base];

// ── 3) เงื่อนไขใต้สินค้า — เสริมบรรทัดใหม่ต่อจากบรรทัดที่เกี่ยวข้อง ──────────────
const lines = String(p.terms ?? "").split("\n");
const put = (afterRe, line) => {
  if (lines.some((l) => l.includes(line))) return;
  const i = lines.findIndex((l) => afterRe.test(l));
  if (i < 0) lines.push(line);
  else lines.splice(i + 1, 0, line);
};
put(/ขนาดตัว/, "*ไดคัทตามทรง บวกเพิ่มชิ้นละ 20 บาท (ทรงสี่เหลี่ยมไม่บวกเพิ่ม)");
put(/ฐาน/, "*เพิ่มขนาดฐานจาก 3-4 ซม. คิดเซนติเมตรละ 10 บาท · ขนาดฐานสูงสุด 10 ซม.");
p.terms = lines.join("\n");

p.savedAt = new Date().toISOString();

// ── สรุป ─────────────────────────────────────────────────────────────────────
console.log(`📦 ${p.name} (${ID})`);
for (const o of [diecut, base])
  console.log(`   [${o.label}] ` + o.choices.map((c) => `${c.name}${c.extra ? ` +${c.extra}฿` : " (ฟรี)"}`).join(" · "));
console.log(`   กลุ่มทั้งหมด: ${p.options.map((o) => o.label).join(" · ")}`);
console.log("\nเงื่อนไข:\n" + p.terms);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
