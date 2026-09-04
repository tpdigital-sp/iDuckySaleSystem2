#!/usr/bin/env node
/**
 * POSTER (poster-a3) — เรียงลำดับกลุ่มตัวเลือกใหม่ + จัดเป็น "ชุดตัวเลือก" 3 กรอบ
 *
 *   node scripts/poster-a3-option-sections.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/poster-a3-option-sections.mjs --write
 *
 * ลำดับที่ร้านสั่ง (3 ก.ย. 69): ชนิดกระดาษ → แนวกระดาษ → จำนวนด้านที่พิมพ์ → เคลือบ (เฉพาะด้านหน้า)
 * กลุ่มลูกที่ "แสดงเมื่อ" ขึ้นกับกลุ่มไหน ให้ตามหลังกลุ่มแม่ของมันเสมอ:
 *   วัสดุ PET / พิมพ์รองขาว ← ชนิดกระดาษ · เคลือบ (เงา/ด้าน/พิเศษ) ← เคลือบ (เฉพาะด้านหน้า)
 *   เคลือบด้านหลัง ← จำนวนด้านที่พิมพ์ แต่จัดไว้ท้ายชุด "เคลือบผิว" ให้เรื่องเคลือบอยู่กรอบเดียวกันหมด
 *
 * ProductOption.section = กลุ่มที่ชื่อชุดเดียวกันและ "อยู่ติดกัน" จะถูกใส่กรอบเดียว มีหัวชุดกด หุบ/กาง ได้
 *   เลขนำหน้าชื่อชุดกลายเป็นเลขในวงกลมหน้าหัวชุด (หน้าเว็บอ่าน sec.match(/\d+/))
 * ⚠️ ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือก/ราคา/กฎ — สลับลำดับกับเติม section เท่านั้น
 *    (คีย์ตารางราคาเป็นชื่อ ไม่ใช่ลำดับ · rules อ้างด้วย label · สินค้านี้ไม่มี rateAfterOption ที่นับลำดับ)
 * รันซ้ำได้ ผลลัพธ์เหมือนเดิมทุกครั้ง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "poster-a3";
const EXPECT_NAME = "POSTER";

/** ลำดับ + ชุดที่ต้องการ (บนลงล่าง) — ชื่อกลุ่มต้องตรงกับใน DB เป๊ะ */
const PLAN = [
  ["ชนิดกระดาษ", "1. เนื้อกระดาษ"],
  ["วัสดุ PET", "1. เนื้อกระดาษ"],
  ["พิมพ์รองขาว", "1. เนื้อกระดาษ"],
  ["แนวกระดาษ", "2. แนววาง + จำนวนด้าน"],
  ["จำนวนด้านที่พิมพ์", "2. แนววาง + จำนวนด้าน"],
  ["เคลือบ (เฉพาะด้านหน้า)", "3. เคลือบผิว"],
  ["เคลือบ", "3. เคลือบผิว"],
  ["เคลือบด้านหลัง", "3. เคลือบผิว"],
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };

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

/* จัดลำดับใหม่ + ติดชื่อชุด (ตัวกลุ่มเดิมทั้งก้อน ไม่แตะฟิลด์อื่น) */
d.options = PLAN.map(([label, section]) => ({ ...options.find((o) => o.label === label), section }));

console.log("ลำดับใหม่:");
let last = "";
for (const o of d.options) {
  if (o.section !== last) { console.log(`  ┌ ${o.section}`); last = o.section; }
  const when = o.showWhen ? `  ← แสดงเมื่อ ${o.showWhen.label} = ${o.showWhen.choices.join("/")}` : "";
  console.log(`  │ ${o.label}${when}`);
}
console.log(`(เดิม: ${have.join(" → ")})`);

if (!WRITE) { console.log("\n(ยังไม่เขียน — รันด้วย --write)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (updErr || !upd?.length) die(`update พัง/0 แถว ${updErr?.message ?? ""}`);

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const got = back.data.options.map((o) => `${o.section}|${o.label}`);
const expect = PLAN.map(([l, s]) => `${s}|${l}`);
if (got.join("→") !== expect.join("→")) die(`อ่านกลับลำดับ/ชุดไม่ตรง!\n  ได้: ${got.join(" → ")}`);
/* กันเผลอ: จำนวนตัวเลือก ราคา และกฎต้องเท่าเดิมทุกกลุ่ม */
for (const [label] of PLAN) {
  const a = options.find((o) => o.label === label);
  const b = back.data.options.find((o) => o.label === label);
  if (a.choices.length !== b.choices.length) die(`ตัวเลือกในกลุ่ม "${label}" หาย (${a.choices.length} → ${b.choices.length})`);
  if (JSON.stringify(a.choices) !== JSON.stringify(b.choices)) die(`ตัวเลือกในกลุ่ม "${label}" เปลี่ยนไป`);
}
if (Object.keys(back.data.pricing.cells).length !== Object.keys(d.pricing.cells).length) die("คีย์ตารางราคาเปลี่ยน!");
if ((back.data.rules ?? []).length !== (row.data.rules ?? []).length) die("จำนวนกฎเปลี่ยน!");
console.log(`\n✓ เรียงใหม่ ${back.data.options.length} กลุ่ม · 3 ชุด · ตัวเลือก/ราคา/กฎครบเท่าเดิม · savedAt =`, back.data.savedAt);
