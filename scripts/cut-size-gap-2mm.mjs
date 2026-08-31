#!/usr/bin/env node
/**
 * 📐 กลุ่ม "ขนาดตัด → กำหนดขนาดเอง" — เว้นระยะระหว่างชิ้น 2 มม. ให้เหมือนกันทุกตัว
 *
 *   node scripts/cut-size-gap-2mm.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/cut-size-gap-2mm.mjs --write
 *
 * ผู้ใช้แจ้ง 31 ส.ค. 69 (หน้า paper-art-pet): กรอก 15 × 7.3 ซม. ระบบตอบ 9 ชิ้น/แผ่น A3
 * แต่ของจริงได้ 7 ชิ้น · และต้องการให้ "คำนวณออกมาเท่ากันทั้งหมด" ทั้งงานกระดาษและสติ๊กเกอร์
 *
 * สาเหตุ: sheetYield ของกลุ่มขนาดตัดตั้ง gap 0 = วางชิดกันสนิท ระบบเลยยัดชิ้นที่ 9 ลงไปได้
 * (2 คอลัมน์ × 4 แถว = 8 แล้วหมุนอีก 1 ชิ้นใส่แถบที่เหลือ) ซึ่งพิมพ์-ตัดจริงทำไม่ได้
 * → ตั้ง gap 0.2 (2 มม.) ตรงกับกติกาที่เขียนไว้ในคำอธิบายกลุ่มอยู่แล้ว "วางลายห่างกัน 2 มม.ขึ้นไป"
 *
 * ⚠️ ผลข้างเคียงที่ยอมรับแล้ว: กรอกขนาด A มือเอง (21 × 29.7) จะได้ 1 ไม่ใช่ 2 เพราะเว้นระยะแล้ว
 *    ไม่พอดีแผ่น — ปุ่มขนาดสำเร็จ (A4/A5/A6/A7/4×6 นิ้ว) ไม่กระทบ เพราะใช้เลข piecesPerUnit
 *    ที่ร้านตั้งไว้เอง ไม่ได้เรียกตัวคำนวณนี้
 * ⚠️ แตะเฉพาะกลุ่ม "ขนาดตัด" — กลุ่ม "ขนาดไดคัท" มี gap 0.5 กับพื้นที่วางของตัวเองอยู่แล้ว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const GAP = 0.2; // ซม. = 2 มม.
/** สเปกแผ่นที่ทุกตัวต้องเหมือนกัน — A3 เต็ม (งานตัดตามขนาดใช้ได้ทั้งแผ่น) */
const SHEET = { sheetW: 42, sheetH: 29.7 };

/** id → กลุ่มช่องกรอก "ด้านสูง" ที่ถือ sheetYield ของขนาดตัด */
const TARGETS = {
  "paper-art-pet": ["ขนาดตัด (สูง)"],
  "paper-foil": ["ขนาดตัด (สูง)"],
  "texture-paper": ["ขนาดตัด (สูง)"],
  "sticker-pp": ["ขนาดตัด (สูง)"],
  "sticker-uv": ["ขนาดตัด (สูง)", "ขนาดตัด ตร.ม. (สูง)"],
  "sticker-solvent": ["ขนาดตัด (สูง)"],
  "sticker-hologram": ["ขนาดตัด (สูง)"],
  "sticker-rainbow-film": ["ขนาดตัด (สูง)"],
  "sticker-gold-silver-rosegold": ["ขนาดตัด (สูง)"],
  "washi-sticker": ["ขนาดตัด (สูง)"],
  "reflective-sticker": ["ขนาดตัด (สูง)"],
  neon: ["ขนาดตัด (สูง)"],
};

/** เช็คผลลัพธ์ก่อนยอมเขียน — ตัวเลขที่ผู้ใช้ยืนยัน + เคสเต็มแผ่นที่เพิ่งแก้บั๊กไป */
const EXPECT = [
  { w: 15, h: 7.3, want: 7, why: "เคสที่ผู้ใช้แจ้ง" },
  { w: 29.7, h: 42, want: 1, why: "เต็มแผ่น A3 ต้องผ่าน (บั๊กที่เพิ่งแก้)" },
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/** จำนวนชิ้นต่อแผ่นแบบกริด (ทิศเดียวทั้งแผ่น) — ใช้ยืนยันคร่าว ๆ ว่าค่าที่ตั้งให้ผลตามคาด */
const gridFit = (w, h, W, H, gap) => {
  const one = (a, b) => Math.floor((W + gap) / (a + gap)) * Math.floor((H + gap) / (b + gap));
  return Math.max(one(w, h), one(h, w));
};

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", Object.keys(TARGETS));
if (error) die(error.message);
if (rows.length !== Object.keys(TARGETS).length) die(`ดึงได้ ${rows.length} ตัว จาก ${Object.keys(TARGETS).length}`);

let changed = 0;
for (const row of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  const d = row.data;
  let dirty = false;
  for (const label of TARGETS[row.id]) {
    const opt = (d.options ?? []).find((o) => o.label === label);
    if (!opt) die(`${row.id}: ไม่มีกลุ่ม "${label}"`);
    const cfg = opt.sheetYield;
    if (!cfg) die(`${row.id} / ${label}: ไม่ได้ตั้ง sheetYield`);
    const before = `${cfg.sheetW}×${cfg.sheetH} gap ${cfg.gap ?? 0}`;
    if (cfg.sheetW === SHEET.sheetW && cfg.sheetH === SHEET.sheetH && cfg.gap === GAP) {
      console.log(`= ${row.id} / ${label} — ตั้งไว้แล้ว (${before})`);
      continue;
    }
    Object.assign(cfg, SHEET, { gap: GAP });
    dirty = true;
    console.log(`✎ ${row.id} / ${label}  ${before} → 42×29.7 gap ${GAP}`);
  }
  if (!dirty) continue;
  changed++;
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", row.id);
    if (e2) die(`${row.id}: ${e2.message}`);
  }
}

console.log("\nตรวจผลของสเปกใหม่ (42 × 29.7 · เว้น 2 มม.):");
for (const e of EXPECT) {
  const got = gridFit(e.w, e.h, SHEET.sheetW, SHEET.sheetH, GAP);
  console.log(`  ${e.w} × ${e.h} → กริดทิศเดียวได้ ${got} ชิ้น (คาด ${e.want} — ${e.why})`);
}
console.log("  * ตัวจัดวางจริงของระบบหมุนคละทิศได้ ตัวเลขจริงเช็คด้วย sheetYieldCount() บนหน้าเว็บอีกที");

console.log(`\n${changed} สินค้าที่${WRITE ? "เขียนแล้ว" : "จะเปลี่ยน"}`);
if (!WRITE) console.log("— ยังไม่ได้เขียน (ใส่ --write)");
