#!/usr/bin/env node
/**
 * rotating-stand: บอกขนาดมาตรฐานให้ชัดในกลุ่ม "เพิ่มขนาดอะคริลิค"
 *
 *   node scripts/rotating-stand-std-size-label.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/rotating-stand-std-size-label.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 — เมนู "ขนาดมาตรฐาน" ไม่บอกว่ากี่เซนติเมตร ลูกค้าเดาไม่ออก
 * ขนาดมาตรฐาน = "ไม่เกิน 9 ซม." ตามเงื่อนไขใต้สินค้า (*ขนาดตัวเริ่มที่ไม่เกิน 9 ซม ราคารวมสกรีน 2 ด้าน)
 * ราคาไม่เปลี่ยน — แก้แค่ชื่อตัวเลือก (ใส่ขนาดที่ได้ต่อท้าย) + note ใต้หัวข้อกลุ่ม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "rotating-stand";
const LABEL = "เพิ่มขนาดอะคริลิค";
const STD_CM = 9;
const PER_CM = 20;

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
for (const pr of [...(p.priceRates ?? []).map((r) => r.pricing), p.pricing].filter(Boolean))
  if ((pr.driverLabels ?? []).includes(LABEL)) throw new Error(`"${LABEL}" เป็นแกนตารางราคา — เปลี่ยนชื่อไม่ได้`);

let changed = 0;
for (const c of opt.choices) {
  if (/ซม\.\)$/.test(c.name)) continue; // ใส่ขนาดต่อท้ายไปแล้ว
  const m = /^เพิ่ม (\d+) ซม\.$/.exec(c.name);
  if (c.name === "ขนาดมาตรฐาน") c.name = `ขนาดมาตรฐาน (ไม่เกิน ${STD_CM} ซม.)`;
  else if (m) c.name = `เพิ่ม ${m[1]} ซม. (ไม่เกิน ${STD_CM + Number(m[1])} ซม.)`;
  else throw new Error(`ชื่อตัวเลือกไม่เข้าสูตร "${c.name}" — ตรวจก่อน`);
  changed++;
}
opt.note = `ขนาดตัวมาตรฐานไม่เกิน ${STD_CM} ซม. ราคารวมสกรีน 2 ด้านแล้ว · ใหญ่กว่านั้นคิดเซนติเมตรละ ${PER_CM} บาท (ขนาดวัดจากด้านที่ยาวที่สุด)`;
p.savedAt = new Date().toISOString();

console.log(`📦 ${p.name} (${ID}) — เปลี่ยนชื่อ ${changed} ตัวเลือก`);
console.log(`   [${LABEL}] ` + opt.choices.map((c) => `${c.name}${c.extra ? ` +${c.extra}฿` : ""}`).join(" · "));
console.log(`   note: ${opt.note}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
