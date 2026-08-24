#!/usr/bin/env node
/**
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) — ถอดกฎ "130 แกรม พิมพ์ได้ 1 ด้าน" (พิมพ์ 2 ด้านได้จริง)
 *
 *   node scripts/paper-art-pet-130-two-sides.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-art-pet-130-two-sides.mjs --write
 *
 * ที่มา: สคริปต์ paper-art-pet-add-130-150.mjs (24 ส.ค. 69) ใส่กฎล็อก 130 แกรม = พิมพ์ 1 ด้าน
 * แต่ตารางราคาทางการ https://www.iduckyofficial-pricelists.com/paperprice ระบุข้อจำกัดเดียวคือ
 * "กระดาษ 400แกรม ไม่สามารถ สกรีน 2 ด้านได้" — 130 แกรมจึงพิมพ์ 2 ด้านได้ (+10/แผ่น ตามตัวเลือกเดิม)
 * กฎ 400 แกรมคงไว้ตามเดิม · แก้ข้อความ "ข้อควรทราบ" (data.terms + data.tabs) ให้เหลือแค่ 400 แกรมด้วย
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "paper-art-pet";
const EXPECT_NAME = "กระดาษอาร์ตมัน | PET";
const PAPER_LABEL = "ชนิดกระดาษ";
const SIDES_LABEL = "จำนวนด้านที่พิมพ์";
const P130 = "กระดาษอาร์ตมัน 130 แกรม";

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

const isP130SidesRule = (r) =>
  r.when?.label === PAPER_LABEL &&
  r.limit?.label === SIDES_LABEL &&
  (r.when.choices ?? [r.when.choice]).every((c) => c === P130);

const hit = (d.rules ?? []).filter(isP130SidesRule);
if (hit.length > 0) {
  console.log("กฎที่จะถอด:", JSON.stringify(hit));
  d.rules = d.rules.filter((r) => !isP130SidesRule(r));
} else {
  console.log("· กฎ 130 แกรม → พิมพ์ 1 ด้าน ถูกถอดไปแล้ว");
}

/* ---------- ข้อความ "ข้อควรทราบ" ให้ตรงกับกฎ (เหลือข้อห้ามเฉพาะ 400 แกรม) ---------- */
const OLD_NOTE = "กระดาษ 130 แกรม และ 400 แกรม ไม่สามารถสกรีน 2 ด้านได้";
const NEW_NOTE = "กระดาษ 400 แกรม ไม่สามารถสกรีน 2 ด้านได้";
let noteFixed = 0;
if (typeof d.terms === "string" && d.terms.includes(OLD_NOTE)) {
  d.terms = d.terms.replaceAll(OLD_NOTE, NEW_NOTE);
  noteFixed++;
}
for (const tab of d.tabs ?? []) {
  if (typeof tab.text === "string" && tab.text.includes(OLD_NOTE)) {
    tab.text = tab.text.replaceAll(OLD_NOTE, NEW_NOTE);
    noteFixed++;
  }
}
console.log(`· แก้ข้อความข้อควรทราบ ${noteFixed} ที่ (terms/tabs)`);
if (hit.length === 0 && noteFixed === 0) die("ไม่มีอะไรต้องแก้ — ทุกอย่างถูกแก้ไปแล้ว");

// กฎ 400 แกรมต้องยังอยู่ (ข้อจำกัดจริงตามตารางราคา)
const p400Left = d.rules.some(
  (r) => r.when?.label === PAPER_LABEL && r.limit?.label === SIDES_LABEL
);
if (!p400Left) die("กฎ 400 แกรม → พิมพ์ 1 ด้าน หายไปด้วย — ผิดคาด หยุดก่อน");

if (!WRITE) {
  console.log("(dry run — เติม --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ ถอดกฎแล้ว — 130 แกรมเลือกพิมพ์ 2 ด้านได้ (คงกฎ 400 แกรมไว้)");
