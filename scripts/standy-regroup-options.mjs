#!/usr/bin/env node
/**
 * standy (/products/สแตนดี้) — จัดลำดับกลุ่มตัวเลือกใหม่ + สวิตช์เปิด-ปิดอุปกรณ์เสริม
 *
 *   node scripts/standy-regroup-options.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/standy-regroup-options.mjs --write   # บันทึกจริง
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69: "จัดกลุ่มให้ใหม่ ฐานก็อยู่ในกลุ่มฐานไปเลย แบบนี้มันงง
 * และอุปกรณ์เสริม ทำปุ่มเปิด-ปิดให้"
 *
 * เดิมกลุ่มฐานกระจาย (ขนาดฐาน แทรกอยู่ระหว่าง ขนาดตัว กับ ฐานสแตนดี้ · สีอะคริลิคฐาน
 * ไปโผล่หลังเรื่องสีของตัว) → เรียงใหม่เป็น 2 ก้อน: เรื่องตัวสแตนดี้ก่อน แล้วค่อยเรื่องฐานทั้งยวง
 *
 *   ตัว:  ขนาดตัวสแตนดี้ → งานสกรีน → สีอะคริลิค → เลือกเฉดสีพิเศษ (ตัวสแตนดี้)
 *   ฐาน:  ฐานสแตนดี้ → ขนาดฐาน → ทรงฐาน → สีอะคริลิคฐาน → เลือกสีพิเศษของฐาน ×19
 *   ท้าย: อุปกรณ์เสริม (ติด collapsible = โชว์แค่สวิตช์ ปิดอยู่เป็นค่าเริ่มต้น)
 *
 * ปลอดภัยต่อราคา: driverLabels อ้างชื่อกลุ่มไม่ใช่ตำแหน่ง · กฎ limit มีแค่ ขนาดตัว↔งานสกรีน
 * ซึ่งลำดับสัมพัทธ์ไม่เปลี่ยน · ไม่แตะ choices/ค่าธรรมเนียมใด ๆ
 * (collapsible กับกลุ่ม display "multi" ใช้ได้ตามคอมเมนต์ใน products.ts — ปิดสวิตช์ = ล้างที่ติ๊ก)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

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

const { data: row, error } = await sb.from("products").select("data").eq("id", "standy").single();
if (error) throw new Error(`อ่าน standy ไม่สำเร็จ — ${error.message}`);
const d = structuredClone(row.data);

const take = (pred, what) => {
  const found = d.options.filter(pred);
  if (!found.length) throw new Error(`ไม่เจอกลุ่ม ${what}`);
  return found;
};
const one = (label) => {
  const g = take((o) => o.label === label, `"${label}"`);
  if (g.length > 1) throw new Error(`"${label}" มีซ้ำ ${g.length} กลุ่ม`);
  return g[0];
};

const shadeBody = one("เลือกเฉดสีพิเศษ (ตัวสแตนดี้)");
const baseShades = take((o) => o.label.startsWith("เลือกสีพิเศษของฐาน ("), "เฉดฐาน");
if (baseShades.length !== 19) throw new Error(`เฉดฐานต้องมี 19 กลุ่ม เจอ ${baseShades.length}`);

const ordered = [
  one("ขนาดตัวสแตนดี้"),
  one("งานสกรีน"),
  one("สีอะคริลิค"),
  shadeBody,
  one("ฐานสแตนดี้"),
  one("ขนาดฐาน"),
  one("ทรงฐาน"),
  one("สีอะคริลิคฐาน"),
  ...baseShades,
  one("อุปกรณ์เสริม"),
];

// กันตกหล่น: ทุกกลุ่มเดิมต้องอยู่ในลำดับใหม่ครบ ไม่มีเพิ่ม/หาย
if (ordered.length !== d.options.length) {
  const missed = d.options.filter((o) => !ordered.includes(o)).map((o) => o.label);
  throw new Error(`ลำดับใหม่ ${ordered.length} ≠ เดิม ${d.options.length} — ตกหล่น: ${missed.join(", ")}`);
}

const acc = one("อุปกรณ์เสริม");
if (acc.display !== "multi") throw new Error(`อุปกรณ์เสริม display=${acc.display} (คาดว่า multi) — เช็คก่อนติด collapsible`);
acc.collapsible = true;

d.options = ordered;
console.log("ลำดับใหม่:", d.options.map((o) => o.label.replace(/เลือกสีพิเศษของฐาน \(ขนาดฐาน (\d+).*/, "เฉดฐาน$1")).join(" | "));
console.log("อุปกรณ์เสริม: collapsible = true (โชว์สวิตช์ ปิดเป็นค่าเริ่มต้น · เปิดถึงเห็น NFC/แม่เหล็ก)");

// ตรวจ: driver/เงื่อนไข/กฎ ยังชี้กลุ่มที่มีจริงทั้งหมด
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
for (const r of d.rules ?? [])
  for (const lb of [r.when?.label, r.limit?.label].filter(Boolean))
    if (!optOf(lb)) throw new Error(`กฎอ้างกลุ่ม "${lb}" ที่ไม่มีจริง`);
console.log("✅ ตรวจผ่าน: กลุ่มครบ", d.options.length, "· driver/กฎ/เงื่อนไขชี้ถูกทุกตัว");

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — เติม --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", "standy");
if (up.error) throw new Error(`เขียนไม่สำเร็จ — ${up.error.message}`);
console.log("💾 บันทึก standy แล้ว");
