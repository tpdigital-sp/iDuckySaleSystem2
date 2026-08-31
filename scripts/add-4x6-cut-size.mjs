#!/usr/bin/env node
/**
 * ➕ เพิ่มขนาด "4 × 6 นิ้ว" (ได้ 8 ชิ้น / แผ่น A3) เข้ากลุ่มตัดตามขนาด / ไดคัท 50%
 *
 *   node scripts/add-4x6-cut-size.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/add-4x6-cut-size.mjs --write
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69 — งานกระดาษ + สติ๊กเกอร์ ตัวไหนมีรายการขนาดสำเร็จ (A4/A5/A6/A7)
 * ให้มี 4 × 6 นิ้ว ด้วย · 4×6 นิ้ว = 10.2 × 15.2 ซม. ใกล้ A6 → ได้ 8 ชิ้นต่อแผ่น A3
 * (ตรงกับที่ POSTCARD ใช้อยู่: 4"x6" = 8 แผ่น / 1 A3)
 *
 * ตรวจแล้วก่อนเขียน: ทั้ง 12 กลุ่มนี้ "ไม่ใช่แกนตารางราคา" และไม่มี rule limit/allow แตะอยู่
 * → เพิ่มตัวเลือกได้ตรง ๆ ไม่มีช่องราคาให้เติม และไม่มีชื่อที่ต้องไปเติมใน allow
 *
 * ของแถมที่ต้องทำคู่กัน: กลุ่ม "จำนวนจุดไดคัท" ของสติ๊กเกอร์แจกโควตาจุดฟรีตาม "ชื่อขนาด"
 * → ต้องยัดชื่อใหม่เข้าช่องเดียวกับ A6 (ฟรี 25 จุด สูงสุด 50) ไม่งั้นตกไปใช้ค่ากลาง (ฟรี 5 จุด)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PIECES = 8; // ชิ้นต่อแผ่น A3
const BADGE = `ได้ ${PIECES} ชิ้น / แผ่น A3`;
/** ชื่อแบบสั้น (กลุ่มที่ตั้งชื่อขนาดเป็น "A4" เปล่า ๆ) และแบบมีวงเล็บ (กลุ่มที่เขียน "A4 (21 × 29.7 ซม.)") */
const NAME_PLAIN = "4 × 6 นิ้ว";
const NAME_WITH_CM = "4 × 6 นิ้ว (10.2 × 15.2 ซม.)";

/** id → กลุ่มขนาดที่ต้องเติม (สินค้าเดียวมีได้หลายกลุ่ม เช่น Sticker-uv มีเรท A3 กับ ตร.ม.) */
const TARGETS = {
  // ── งานกระดาษ (ตัดตามขนาด) ──
  "paper-art-pet": ["ขนาดตัด"],
  "paper-foil": ["ตัดเป็นขนาด"],
  "texture-paper": ["ตัดเป็นขนาด"],
  // ── สติ๊กเกอร์ (ไดคัท 50%) ──
  "sticker-pp": ["ขนาดตัด"],
  "sticker-uv": ["ขนาดตัด", "ขนาดตัด (ตร.ม.)"],
  "sticker-solvent": ["ขนาดตัด"],
  "sticker-hologram": ["ขนาดตัด"],
  "sticker-rainbow-film": ["ขนาดตัด"],
  "sticker-gold-silver-rosegold": ["ขนาดตัด"],
  "washi-sticker": ["ขนาดตัด"],
  "reflective-sticker": ["ขนาดตัด"],
  neon: ["ขนาดตัด"],
};

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};
/** ตัวเลือกนี้คือ 4×6 นิ้วหรือเปล่า (เผื่อเคยเติมด้วยชื่ออื่นเล็กน้อย) */
const isFourBySix = (name) => /4\s*[×x]\s*6\s*นิ้ว/.test(name);

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", Object.keys(TARGETS));
if (error) die(error.message);
if (rows.length !== Object.keys(TARGETS).length)
  die(`ดึงสินค้าได้ ${rows.length} ตัว จากที่ต้องการ ${Object.keys(TARGETS).length} ตัว`);

let touched = 0;
for (const row of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  const d = row.data;
  const notes = [];
  let dirty = false;

  for (const label of TARGETS[row.id]) {
    const g = (d.options ?? []).find((o) => o.label === label);
    if (!g) die(`${row.id}: ไม่มีกลุ่ม "${label}"`);
    if ((g.choices ?? []).some((c) => isFourBySix(c.name))) {
      notes.push(`= ${label} — มี 4 × 6 นิ้ว อยู่แล้ว`);
      continue;
    }
    // ชื่อขนาดในกลุ่มนี้เขียนแบบไหน — ดูจาก A4 ว่ามีวงเล็บบอกเซนติเมตรไหม
    const a4 = (g.choices ?? []).find((c) => c.name.startsWith("A4"));
    if (!a4) die(`${row.id} / ${label}: ไม่เจอตัวเลือก A4 (ผังกลุ่มเปลี่ยนไป — หยุดก่อน)`);
    const name = a4.name.includes("(") ? NAME_WITH_CM : NAME_PLAIN;
    const choice = { name, badge: BADGE, piecesPerUnit: PIECES };
    // วางไว้ท้ายรายการขนาดสำเร็จ = ก่อน "📐 กำหนดขนาดเอง" (ไม่มีก็ต่อท้ายสุด)
    const at = (g.choices ?? []).findIndex((c) => c.name.startsWith("📐"));
    if (at < 0) g.choices.push(choice);
    else g.choices.splice(at, 0, choice);
    notes.push(`+ ${label} — เพิ่ม "${name}" (${BADGE}) ที่ลำดับ ${at < 0 ? g.choices.length : at + 1}`);
    dirty = true;

    // โควตาจุดไดคัทฟรี — ยัดชื่อใหม่เข้าช่องเดียวกับ A6 ของกลุ่ม "จำนวนจุดไดคัท" ที่อ้างกลุ่มขนาดนี้
    for (const o of d.options ?? []) {
      const rates = o.inputFee?.rates;
      if (!rates?.length) continue;
      const bucket = rates.find((r) => r.when?.label === label && (r.when.choices ?? []).some((c) => c.startsWith("A6")));
      if (!bucket) continue;
      if (bucket.when.choices.some(isFourBySix)) continue;
      bucket.when.choices.push(name);
      notes.push(`  ↳ ${o.label}: เข้าช่องเดียวกับ A6 (ฟรี ${bucket.free} จุด สูงสุด ${bucket.max})`);
    }
  }

  console.log(`\n### ${row.id} | ${row.name}`);
  notes.forEach((n) => console.log("  " + n));
  if (!dirty) continue;
  touched++;
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", row.id);
    if (e2) die(`${row.id}: ${e2.message}`);
  }
}

console.log(`\n${touched} สินค้าที่${WRITE ? "เขียนแล้ว" : "จะเปลี่ยน"}`);
if (!WRITE) console.log("— ยังไม่ได้เขียน (ใส่ --write)");
