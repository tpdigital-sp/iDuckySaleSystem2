#!/usr/bin/env node
/**
 * สแตนดี้อะคริลิค หมุนได้ — ข้อความค่าสกรีนลายฐานให้ครอบคลุมทุกขนาดฐานที่เลือกได้
 *
 *   node scripts/standee-rotating-base-screen-copy.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/standee-rotating-base-screen-copy.mjs --write    # บันทึกจริง
 *
 * หลังแยกฐานมาตรฐานเป็น 3 / 4 / 5 ซม. (26 ส.ค. 69) ข้อความยังเขียนว่า "5-6 ซม. +10"
 * ทำให้ฐาน 3-4 ซม. ที่เลือกได้ ไม่มีอัตราในข้อความ — แก้เป็น "3-6 ซม. +10"
 * (ราคาในตารางคิด 3/4/5/6 ซม. = +10 อยู่แล้วทุกช่อง สคริปต์นี้แก้เฉพาะ "คำ" ไม่แตะราคา)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "standee-rotating";
/** แทนที่ทีละคู่ — ต้องเจอครบทุกคู่ ไม่งั้นแปลว่าข้อความถูกแก้ไปแล้ว/เปลี่ยนโครง */
const SWAPS = [
  ["ค่าสกรีนลายฐานคิดตามขนาดฐาน — 5-6 ซม. +10", "ค่าสกรีนลายฐานคิดตามขนาดฐาน — 3-6 ซม. +10"],
  ["ฐานสกรีนลาย — ฐาน 5-6 ซม. +10", "ฐานสกรีนลาย — ฐาน 3-6 ซม. +10"],
  ["คิดเพิ่มตามขนาดฐาน (5-6 ซม. +10 ถึง 11-12 ซม. +25 บาท)", "คิดเพิ่มตามขนาดฐาน (3-6 ซม. +10 ถึง 11-12 ซม. +25 บาท)"],
];

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

const { data, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่ได้ — ${error.message}`);
let s = JSON.stringify(data.data);
for (const [from, to] of SWAPS) {
  const n = s.split(from).length - 1;
  if (n === 0) throw new Error(`ไม่เจอข้อความ "${from}" — แก้ไปแล้วหรือข้อความเปลี่ยน ตรวจก่อน`);
  s = s.split(from).join(to);
  console.log(`📝 ${n} ที่: "${from}"\n        → "${to}"`);
}
const d = JSON.parse(s);
d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log(`✅ บันทึก ${ID} แล้ว`);
