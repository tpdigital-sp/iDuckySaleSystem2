#!/usr/bin/env node
/**
 * rotating-stand: แยกตัวเลือกฐาน "3-4 ซม." เป็น "ฐาน 3 ซม." กับ "ฐาน 4 ซม." (ทั้งคู่ราคามาตรฐาน ไม่บวกเพิ่ม)
 *
 *   node scripts/rotating-stand-base-3-4-split.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/rotating-stand-base-3-4-split.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 — "แยกฐาน 3,4 ให้หน่อย"
 * ราคาไม่เปลี่ยน: 3 ซม. และ 4 ซม. = ราคามาตรฐาน (0 บาท) · 5 ซม.ขึ้นไปยังคิด ซม.ละ 10 เหมือนเดิม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "rotating-stand";
const BASE_LABEL = "ขนาดฐาน";
const OLD = "ฐาน 3-4 ซม. (มาตรฐาน)";

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
const base = (p.options ?? []).find((o) => o.label === BASE_LABEL);
if (!base) throw new Error(`ไม่มีกลุ่ม "${BASE_LABEL}" — ตรวจก่อน`);

const i = base.choices.findIndex((c) => c.name === OLD);
if (i < 0) {
  if (base.choices.some((c) => c.name === "ฐาน 3 ซม.")) throw new Error("แยกไปแล้ว — ไม่ต้องรันซ้ำ");
  throw new Error(`ไม่เจอตัวเลือก "${OLD}" — ตรวจก่อน`);
}
// กลุ่มนี้ต้องไม่เป็นแกนตารางราคา (ไม่งั้นแยกตัวเลือกแล้วเซลล์ราคาหาย → ราคาหล่นไป product.price)
for (const pr of [...(p.priceRates ?? []).map((r) => r.pricing), p.pricing].filter(Boolean))
  if ((pr.driverLabels ?? []).includes(BASE_LABEL)) throw new Error(`"${BASE_LABEL}" เป็นแกนตารางราคา — ตรวจก่อน`);

const old = base.choices[i];
base.choices.splice(i, 1, ...[3, 4].map((cm) => ({ ...old, name: `ฐาน ${cm} ซม.`, badge: "มาตรฐาน" })));
p.savedAt = new Date().toISOString();

console.log(`📦 ${p.name} (${ID})`);
console.log(
  `   [${BASE_LABEL}] ` +
    base.choices.map((c) => `${c.name}${c.extra ? ` +${c.extra}฿` : ` ฟรี${c.badge ? ` (${c.badge})` : ""}`}`).join(" · ")
);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
