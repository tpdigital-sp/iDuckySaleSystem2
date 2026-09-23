#!/usr/bin/env node
/**
 * ➕ เพิ่มขนาด "5 × 7 นิ้ว" (ได้ 4 ชิ้น / แผ่น A3) เข้ากลุ่มตัดตามขนาด
 *
 *   node scripts/add-5x7-cut-size.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/add-5x7-cut-size.mjs --write
 *
 * ผู้ใช้สั่ง 23 ก.ย. 69 — หน้ากระดาษ Texture Paper ให้มี 5 × 7 นิ้ว เหมือนงานกระดาษตัวอื่น
 * (POSTCARD `postcard-th` มี "5 × 7 นิ้ว" badge "ได้ 4 ใบ / แผ่น A3" อยู่แล้ว — ใช้เลขเดียวกัน)
 *
 * 5 × 7 นิ้ว = 12.7 × 17.8 ซม. · เลข 4 มาจากร้าน (เท่ากับ POSTCARD) ไม่ใช่จากตัวจัดวาง —
 * ตัวคำนวณ Print-Fit ของช่องกรอกเองตอบ 3 เหมือนที่ A5 ตอบ 2 ทั้งที่ปุ่ม A5 เขียน 4
 * (ปุ่มขนาดสำเร็จใช้เลข piecesPerUnit ที่ร้านตั้งเอง ไม่เรียกตัวคำนวณ — ดู [[iducky-4x6-cut-size]])
 *
 * ตรวจก่อนเขียน: กลุ่มนี้ไม่ใช่แกนตารางราคา (แกนคือ ชนิดกระดาษ + การตัด) · data.rules ว่าง
 * → เพิ่มตัวเลือกได้ตรง ๆ ไม่มีช่องราคาให้เติม ไม่มี allow ให้ไปเติมชื่อ
 * เพิ่มสินค้าตัวอื่นภายหลังได้ที่ TARGETS (สติ๊กเกอร์ต้องเติมโควตาจุดไดคัทด้วย — โค้ดข้างล่างทำให้แล้ว)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PIECES = 4; // ชิ้นต่อแผ่น A3
const BADGE = `ได้ ${PIECES} ชิ้น / แผ่น A3`;
/** ชื่อแบบสั้น (กลุ่มที่เขียน "A4" เปล่า ๆ) และแบบมีวงเล็บ (กลุ่มที่เขียน "A4 (21 × 29.7 ซม.)") */
const NAME_PLAIN = "5 × 7 นิ้ว";
const NAME_WITH_CM = "5 × 7 นิ้ว (12.7 × 17.8 ซม.)";

/** id → กลุ่มขนาดที่ต้องเติม */
const TARGETS = {
  "texture-paper": ["ตัดเป็นขนาด"],
};

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};
const isFiveBySeven = (name) => /5\s*[×x]\s*7\s*นิ้ว/.test(name);

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
    if ((g.choices ?? []).some((c) => isFiveBySeven(c.name))) {
      notes.push(`= ${label} — มี 5 × 7 นิ้ว อยู่แล้ว`);
      continue;
    }
    // ชื่อขนาดในกลุ่มนี้เขียนแบบไหน — ดูจาก A4 ว่ามีวงเล็บบอกเซนติเมตรไหม
    const a4 = (g.choices ?? []).find((c) => c.name.startsWith("A4"));
    if (!a4) die(`${row.id} / ${label}: ไม่เจอตัวเลือก A4 (ผังกลุ่มเปลี่ยนไป — หยุดก่อน)`);
    const name = a4.name.includes("(") ? NAME_WITH_CM : NAME_PLAIN;
    const choice = { name, badge: BADGE, piecesPerUnit: PIECES };
    // วางต่อจากขนาดนิ้วตัวก่อนหน้า = ก่อน "📐 กำหนดขนาดเอง" (ไม่มีก็ต่อท้ายสุด)
    const at = (g.choices ?? []).findIndex((c) => c.name.startsWith("📐"));
    if (at < 0) g.choices.push(choice);
    else g.choices.splice(at, 0, choice);
    notes.push(`+ ${label} — เพิ่ม "${name}" (${BADGE}) ที่ลำดับ ${at < 0 ? g.choices.length : at + 1}`);
    dirty = true;

    // โควตาจุดไดคัทฟรี (สติ๊กเกอร์) — ยัดชื่อใหม่เข้าช่องเดียวกับ A5 ซึ่งได้ 4 ชิ้น/แผ่นเท่ากัน
    for (const o of d.options ?? []) {
      const rates = o.inputFee?.rates;
      if (!rates?.length) continue;
      const bucket = rates.find((r) => r.when?.label === label && (r.when.choices ?? []).some((c) => c.startsWith("A5")));
      if (!bucket) continue;
      if (bucket.when.choices.some(isFiveBySeven)) continue;
      bucket.when.choices.push(name);
      notes.push(`  ↳ ${o.label}: เข้าช่องเดียวกับ A5 (ฟรี ${bucket.free} จุด สูงสุด ${bucket.max})`);
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
