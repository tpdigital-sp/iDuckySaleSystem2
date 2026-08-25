#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ กริ๊บต๊อก (griptok-th) — ทุกกลุ่ม
 *
 *   node scripts/griptok-th-option-images.mjs           # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-th-option-images.mjs --write   # อัปไฟล์ + เขียนสินค้า
 *
 * ที่มา (ผู้ใช้สั่ง 25 ส.ค. 69): ภาพจากหน้า pricelists /griptok
 * โซนตาราง "GRIPTOK | UV Printing" กับ "GRIPTOK Resin Coat"
 *   • แบบ ทรงกลม (UV)   ← 959b83_ee1464dc… (กลมลายเดซี่ งาน UV)
 *   • แบบ ทรงหัวใจ (UV) ← 959b83_ae5f7187… (หัวใจถือในมือ เห็นทรงชัด)
 *   • ฐาน สีขาว/สีดำ/สีใส ← ครอปจาก 959b83_ed8cf52f… (รูปฐาน 3 สี มีป้ายกำกับในภาพ)
 *       กล่องครอป (ต้นฉบับ 5515×4000 → ย่อ 900×900):
 *       ขาว (1100,950,2600,2450) · ดำ (2258,1350,3758,2850) · ใส (3473,1750,4973,3250)
 *   • เคลือบเรซิ่น (Add On) ← 959b83_36530e8e… (หัวใจเคลือบเรซิ่นหนาเงา เห็นความนูนชัด)
 * ไฟล์ประมวลผลแล้ว (ย่อ ≤1600px ตามนโยบายรูปสินค้า) อยู่ที่ .cache/griptok-th/
 *
 * เลือกตัวเลือกแล้วแกลเลอรีเด้งไปภาพนั้นเอง (ProductDetail ดูดภาพตัวเลือกเข้าแกลเลอรี
 * ให้อยู่แล้ว — ไม่กิน MAX_PHOTOS 5 ช่องของ images)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "griptok-th";
const DIR = ".cache/griptok-th";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/griptok-th`;

// [กลุ่ม, ชื่อตัวเลือก, ไฟล์ใน .cache]
const MAP = [
  ["แบบ", "ทรงกลม (UV)", "shape-round-uv-v1.jpg"],
  ["แบบ", "ทรงหัวใจ (UV)", "shape-heart-uv-v1.jpg"],
  ["ฐาน", "สีขาว", "base-white-v1.jpg"],
  ["ฐาน", "สีดำ", "base-black-v1.jpg"],
  ["ฐาน", "สีใส", "base-clear-v1.jpg"],
  ["เคลือบเรซิ่น (Add On)", "เคลือบเรซิ่น", "resin-coat-v1.jpg"],
];

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/griptok|กริ๊บต๊อก/i.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

for (const [group, choiceName, file] of MAP) {
  const opt = (d.options ?? []).find((o) => o.label === group);
  const choice = opt?.choices.find((c) => c.name === choiceName);
  if (!choice) throw new Error(`ไม่เจอตัวเลือก "${choiceName}" ในกลุ่ม "${group}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
  choice.imageSrc = `${BASE}/${file}`;
  console.log(`${group} → ${choiceName}: ${file} (${Math.round(readFileSync(`${DIR}/${file}`).length / 1024)} KB)`);
}

if (!WRITE) {
  console.log("\n(ยังไม่อัป/ไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

for (const [, , file] of MAP) {
  const buf = readFileSync(`${DIR}/${file}`);
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(`products/griptok-th/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw upErr;
  console.log(`⬆️  ${file} อัปแล้ว`);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;
console.log("\n✅ บันทึกแล้ว — ตัวเลือกทุกกลุ่มของ griptok-th มีภาพประกอบ");
