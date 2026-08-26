#!/usr/bin/env node
/**
 * standee-frame-card (สแตนดี้ + Frame Card) — จัดลำดับกลุ่มตัวเลือกใหม่ให้เรื่องฐานอยู่ติดกัน
 *
 *   node scripts/standee-frame-card-regroup.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/standee-frame-card-regroup.mjs --write   # บันทึกจริง
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69 (ต่อจากจัดกลุ่ม standy): เดิม ขนาดฐาน/ฐานสแตนดี้/ทรงฐาน แทรกอยู่กลาง
 * เรื่องตัวสแตนดี้ แล้วสีอะคริลิคฐานไปโผล่ท้ายสุด → เรียงเป็น 2 ก้อนแบบเดียวกับ standy:
 *
 *   ตัว:  ขนาดตัวสแตนดี้ → งานสกรีน → แนววางงาน → สีอะคริลิค → เลือกสีพิเศษ (ขนาด …) ×6
 *   ฐาน:  ฐานสแตนดี้ → ขนาดฐาน → ทรงฐาน → สีอะคริลิคฐาน → เลือกสีพิเศษของฐาน ×19
 *
 * ไม่แตะ choices/ค่าธรรมเนียม · driver (ขนาดตัวสแตนดี้, งานสกรีน) อ้างชื่อไม่ใช่ตำแหน่ง · ไม่มีกฎ limit
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "standee-frame-card";

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

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
const d = structuredClone(row.data);

const one = (label) => {
  const found = d.options.filter((o) => o.label === label);
  if (found.length !== 1) throw new Error(`กลุ่ม "${label}" เจอ ${found.length} กลุ่ม (ต้องมี 1)`);
  return found[0];
};
const bodyShades = d.options.filter((o) => o.label.startsWith("เลือกสีพิเศษ (ขนาด "));
const baseShades = d.options.filter((o) => o.label.startsWith("เลือกสีพิเศษของฐาน ("));
if (bodyShades.length !== 6) throw new Error(`เฉดตัวต้องมี 6 กลุ่ม เจอ ${bodyShades.length}`);
if (baseShades.length !== 19) throw new Error(`เฉดฐานต้องมี 19 กลุ่ม เจอ ${baseShades.length}`);

const ordered = [
  one("ขนาดตัวสแตนดี้"),
  one("งานสกรีน"),
  one("แนววางงาน"),
  one("สีอะคริลิค"),
  ...bodyShades,
  one("ฐานสแตนดี้"),
  one("ขนาดฐาน"),
  one("ทรงฐาน"),
  one("สีอะคริลิคฐาน"),
  ...baseShades,
];
if (ordered.length !== d.options.length) {
  const missed = d.options.filter((o) => !ordered.includes(o)).map((o) => o.label);
  throw new Error(`ลำดับใหม่ ${ordered.length} ≠ เดิม ${d.options.length} — ตกหล่น: ${missed.join(", ")}`);
}
d.options = ordered;
console.log("ลำดับใหม่:", d.options.map((o) => o.label.replace(/เลือกสีพิเศษของฐาน \(ขนาดฐาน (\d+).*/, "เฉดฐาน$1").replace(/เลือกสีพิเศษ \(ขนาด (\d+).*/, "เฉดตัว$1")).join(" | "));

const optOf = (label) => d.options.find((o) => o.label === label);
for (const o of d.options)
  for (const cond of [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])].filter(Boolean)) {
    const t = optOf(cond.label);
    if (!t) throw new Error(`"${o.label}" ชี้กลุ่ม "${cond.label}" ที่ไม่มีจริง`);
    const miss = cond.choices.filter((c) => !t.choices.map((x) => x.name).includes(c));
    if (miss.length) throw new Error(`"${o.label}" ชี้ตัวเลือกที่ไม่มีจริง — ${miss.join(", ")}`);
  }
for (const r of d.priceRates ?? [])
  for (const lb of r.pricing?.driverLabels ?? [])
    if (!optOf(lb)) throw new Error(`driver "${lb}" หาย — ห้ามเกิด`);
console.log("✅ ตรวจผ่าน: กลุ่มครบ", d.options.length, "· driver/เงื่อนไขชี้ถูกทุกตัว");

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — เติม --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`เขียนไม่สำเร็จ — ${up.error.message}`);
console.log(`💾 บันทึก ${ID} แล้ว`);
