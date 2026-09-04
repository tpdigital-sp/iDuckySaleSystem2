#!/usr/bin/env node
/**
 * สติ๊กเกอร์สะท้อนแสง (reflective-sticker) — จัดกลุ่มตัวเลือกเป็น "ชุดตัวเลือก" 3 กรอบ
 * เหมือนหน้า POSTER (poster-a3) ที่ทำไว้เมื่อ 4 ก.ย. 69
 *
 *   node scripts/reflective-sticker-option-sections.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/reflective-sticker-option-sections.mjs --write
 *
 * `ProductOption.section` = กลุ่มที่ชื่อชุดเดียวกันและ "อยู่ติดกัน" จะถูกใส่กรอบเดียว มีหัวชุด
 *   กดหุบ/กางได้ · หุบแล้วหัวชุดโชว์ค่าที่เลือกไว้ต่อกันด้วย " · "
 *   เลขนำหน้าชื่อชุด = เลขในวงกลมหน้าหัวชุด (หน้าเว็บอ่าน `sec.match(/\d+/)`) → ชื่อชุดต้องขึ้นต้นด้วยเลข
 *
 * ลำดับยึดตามที่ร้านสั่งไว้รอบก่อน (ดู scripts/reflective-sticker-option-order.mjs):
 *   ขายแบบ > แบบไดคัท > ขอบไดคัท > ขนาดตัด > จำนวนจุดไดคัท
 *
 * กลุ่มที่ซ่อนอยู่ (showWhen ไม่ตรง) ถูกกรองทิ้งก่อนจับกรอบ → ชุดที่ไม่เหลือกลุ่มเลยจะไม่ขึ้นกรอบว่าง
 *   ไดคัท 100% : ชุด 1 + ชุด 2 (เหลือ ขนาดไดคัท กว้าง/สูง) · ชุด 3 หายไปทั้งกรอบ
 *   ไดคัท 50%  : ชุด 1 + ชุด 2 (ขนาดตัด + กว้าง/สูง ถ้ากำหนดเอง) + ชุด 3
 *
 * ⚠️ ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือก/ราคา/กฎ — เรียงลำดับ + เติม section เท่านั้น
 *    (คีย์ตารางราคาเป็นชื่อ ไม่ใช่ลำดับ · rules อ้างด้วย label)
 * รันซ้ำได้ ผลลัพธ์เหมือนเดิมทุกครั้ง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "reflective-sticker";
const EXPECT_NAME = "สติ๊กเกอร์สะท้อนแสง";

/** ลำดับ + ชุดที่ต้องการ (บนลงล่าง) — ชื่อกลุ่มต้องตรงกับใน DB เป๊ะ */
const PLAN = [
  ["ขายแบบ", "1. รูปแบบงาน"],
  ["แบบไดคัท", "1. รูปแบบงาน"],
  ["ขอบไดคัท", "1. รูปแบบงาน"],
  ["ขนาดตัด", "2. ขนาดชิ้นงาน"],
  ["ขนาดตัด (กว้าง)", "2. ขนาดชิ้นงาน"],
  ["ขนาดตัด (สูง)", "2. ขนาดชิ้นงาน"],
  ["ขนาดไดคัท (กว้าง)", "2. ขนาดชิ้นงาน"],
  ["ขนาดไดคัท (สูง)", "2. ขนาดชิ้นงาน"],
  ["จำนวนจุดไดคัท", "3. จุดไดคัท"],
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const die = (m) => { console.error("x " + m); process.exit(1); };

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;
const options = d.options ?? [];

/* แผนต้องครอบคลุมกลุ่มที่มีอยู่ "ครบและไม่เกิน" — มีกลุ่มใหม่/ชื่อเปลี่ยนเมื่อไหร่ให้หยุด ไม่ใช่ทำกลุ่มหาย */
const have = options.map((o) => o.label);
const want = PLAN.map(([l]) => l);
const missing = want.filter((l) => !have.includes(l));
const extra = have.filter((l) => !want.includes(l));
if (missing.length) die(`ในแผนมีกลุ่มที่ไม่มีใน DB: ${missing.join(" · ")}`);
if (extra.length) die(`DB มีกลุ่มที่ไม่อยู่ในแผน: ${extra.join(" · ")} — เติมลงแผนก่อนค่อยรัน`);
if (new Set(have).size !== have.length) die("มีกลุ่มชื่อซ้ำใน DB — สคริปต์นี้เรียงด้วยชื่อไม่ได้");
for (const [, sec] of PLAN) if (!/^\d+\./.test(sec)) die(`ชื่อชุด "${sec}" ไม่ได้ขึ้นต้นด้วยเลข — เลขวงกลมจะเพี้ยน`);

/* จัดลำดับใหม่ + ติดชื่อชุด (ตัวกลุ่มเดิมทั้งก้อน ไม่แตะฟิลด์อื่น) */
d.options = PLAN.map(([label, section]) => ({ ...options.find((o) => o.label === label), section }));

console.log(`${row.name} (${ID})\n\nลำดับ + ชุดใหม่:`);
let last = "";
for (const o of d.options) {
  if (o.section !== last) { console.log(`  +-- ${o.section}`); last = o.section; }
  const when = o.showWhen ? `   << แสดงเมื่อ ${o.showWhen.label} = ${o.showWhen.choices.join(" / ")}` : "";
  console.log(`  |   ${o.label}${when}`);
}
const wasSec = options.map((o) => o.section).filter(Boolean);
console.log(`\n(เดิม: ${have.join(" > ")})`);
console.log(`(เดิมมีชุดตัวเลือก: ${wasSec.length ? [...new Set(wasSec)].join(" · ") : "ไม่มี"})`);

if (!WRITE) { console.log("\n(ยังไม่เขียน — รันด้วย --write)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (updErr || !upd?.length) die(`update พัง/0 แถว ${updErr?.message ?? ""}`);

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const got = back.data.options.map((o) => `${o.section}|${o.label}`);
const expect = PLAN.map(([l, s]) => `${s}|${l}`);
if (got.join(" > ") !== expect.join(" > ")) die(`อ่านกลับลำดับ/ชุดไม่ตรง!\n  ได้: ${got.join(" > ")}`);
/* กันเผลอ: ตัวเลือกในทุกกลุ่ม ราคา และกฎต้องเท่าเดิมเป๊ะ */
for (const [label] of PLAN) {
  const a = options.find((o) => o.label === label);
  const b = back.data.options.find((o) => o.label === label);
  if (JSON.stringify(a.choices ?? null) !== JSON.stringify(b.choices ?? null)) die(`ตัวเลือกในกลุ่ม "${label}" เปลี่ยนไป`);
  if (JSON.stringify(a.input ?? null) !== JSON.stringify(b.input ?? null)) die(`ช่องกรอกของกลุ่ม "${label}" เปลี่ยนไป`);
  if (JSON.stringify(a.inputFee ?? null) !== JSON.stringify(b.inputFee ?? null)) die(`โควตา/ค่าบริการของกลุ่ม "${label}" เปลี่ยนไป`);
}
const priceKey = (x) => JSON.stringify([x?.pricing ?? null, x?.priceRates ?? null]);
if (priceKey(back.data) !== priceKey(row.data)) die("ตารางราคาเปลี่ยน!");
if (JSON.stringify(back.data.rules ?? null) !== JSON.stringify(row.data.rules ?? null)) die("กฎเปลี่ยน!");
console.log(`\nOK: ${back.data.options.length} กลุ่ม · 3 ชุด · ตัวเลือก/ช่องกรอก/ราคา/กฎครบเท่าเดิม · savedAt = ${back.data.savedAt}`);
