#!/usr/bin/env node
/**
 * "Photo card Digital" (photocard-digital) — ถอดกลุ่ม "การตัด" ออกทั้งชุด
 * (ร้านสั่ง 24 ส.ค. 69 หลังเห็นของจริงบนหน้า — งานนี้ตัดขนาดโฟโต้การ์ดอย่างเดียว)
 *
 *   node scripts/photocard-cut-drop-modes.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-cut-drop-modes.mjs --write
 *
 * ถอด "ตัดตามขนาด (A4 / A5 / A6 / A7)" + "ไดคัทตามทรง" แล้วเหลือตัวเลือกเดียวไม่ได้ —
 * หน้าสินค้ามองกลุ่มที่เหลือตัวเลือกเดียวเป็น "ถูกกำหนดอัตโนมัติ" แล้วโชว์เป็นป้ายล็อก 🔒
 * พร้อมข้อความที่ไม่ตรงความจริง จึงถอดทั้งกลุ่มรวมกลุ่มที่ห้อยอยู่:
 *   "การตัด" · "ตัดเป็นขนาด" · "ขนาดตัด (กว้าง)/(สูง)" · "ขนาดไดคัท (กว้าง)/(สูง)"
 * แล้วแก้ข้อควรทราบเป็น "ขนาดอื่น/ไดคัทตามทรง แจ้งในหมายเหตุถึงร้าน"
 * (รันซ้ำได้ — ถอดไปแล้วจะบอกว่าไม่มีอะไรให้ถอด)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const EXPECT_NAME = "Photo card Digital";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const DROP_GROUPS = [
  "การตัด",
  "ตัดเป็นขนาด",
  "ขนาดตัด (กว้าง)",
  "ขนาดตัด (สูง)",
  "ขนาดไดคัท (กว้าง)",
  "ขนาดไดคัท (สูง)",
];

const TERMS = [
  // ข้อความรุ่นก่อนหน้า (ทั้งสองรุ่น) → รุ่นล่าสุด
  "เลือกการตัดได้ 3 แบบ — ขนาดโฟโต้การ์ด 5.5×8.5 ซม. (20 ใบ/เซ็ต) · ตัดตามขนาด A4 A5 A6 A7 หรือกำหนดขนาดเอง · ไดคัทตามทรง — ทุกแบบราคาเท่ากัน (1 เซ็ต = 1 แผ่น A3 ตัดได้กี่ชิ้นตามขนาดที่เลือก)",
  "ตัดขนาดโฟโต้การ์ด 5.5×8.5 ซม. (20 ใบ/เซ็ต) — ต้องการตัดขนาดอื่น เช่น A4 A5 A6 A7 หรือไดคัทตามทรง แจ้งในหมายเหตุถึงร้าน",
];
const NEW_TERM = TERMS[TERMS.length - 1];

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

const before = d.options.length;
const removed = d.options.filter((o) => DROP_GROUPS.includes(o.label)).map((o) => o.label);
d.options = d.options.filter((o) => !DROP_GROUPS.includes(o.label));
if (before === d.options.length) die("ไม่มีกลุ่มการตัดให้ถอดแล้ว");

// กฎ (OptionRule) ที่อ้างกลุ่มที่ถอด — ปัจจุบันไม่มี แต่เช็คไว้กันข้อมูลค้าง
const orphanRules = (d.rules ?? []).filter(
  (r) => DROP_GROUPS.includes(r.limit?.label) || DROP_GROUPS.includes(r.when?.label)
);
if (orphanRules.length) die(`มีกฎอ้างกลุ่มที่ถอด ${orphanRules.length} ข้อ — เช็คก่อน`);

const oldTerm = TERMS.find((t) => d.terms?.includes(t));
if (!oldTerm) die("ไม่พบข้อควรทราบบรรทัดการตัด — เช็คก่อน");
d.terms = d.terms.replace(oldTerm, NEW_TERM);
d.savedAt = new Date().toISOString();

console.log(`ถอด ${removed.length} กลุ่ม: ${removed.join(" / ")}`);
console.log(`กลุ่มที่เหลือ: ${d.options.map((o) => o.label).join(" / ")}`);
console.log(`ข้อควรทราบ → ${NEW_TERM}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว (สินค้ายังเป็นฉบับร่าง hidden ตามเดิม)");
