#!/usr/bin/env node
/**
 * GRIPTOK กระจกพับ (new-mt8fg70f-8328) — ตัวเลือก "แบบ" เป็นคลิป (ผู้ใช้สั่ง "ฉันต้องการเป็น vdo")
 *
 *   node scripts/griptok-mirror-fold-shape-video.mjs           # ดูก่อน
 *   node scripts/griptok-mirror-fold-shape-video.mjs --write   # เขียนจริง
 *
 * ใส่ videoSrc ให้ตัวเลือกทรงกลม/ทรงสี่เหลี่ยม ชี้คลิปคู่ที่ผู้ใช้กำกับด้วยลิงก์ pgid
 * (ไฟล์คลิปอยู่ใน storage แล้วจากรอบสร้างสินค้า) — การ์ดจะเล่นคลิปวนแทนภาพนิ่ง
 * และกดเลือกแล้วแกลเลอรีเด้งไปช่องคลิปนั้น (กลไกใหม่ใน ProductDetail: choice.videoSrc)
 * imageSrc (การ์ด v2) คงไว้เป็นโปสเตอร์ระหว่างคลิปโหลด
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mt8fg70f-8328";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}`;

const SHAPE_CLIP = {
  ทรงกลม: "clip-fold-base-v1.mp4", // คลิปกลมลาย Hogwarts เปิดฝากระจก (pgid 92ac0e3a…)
  ทรงสี่เหลี่ยม: "clip-uv-print-v1.mp4", // คลิปเหลี่ยมเปิดฝาบนเคสลายเมฆ (pgid adf05436…)
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/กระจกพับ/.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

const opt = (d.options ?? []).find((o) => o.label === "แบบ");
for (const [name, file] of Object.entries(SHAPE_CLIP)) {
  const c = opt?.choices.find((c) => c.name === name);
  if (!c) throw new Error(`ไม่เจอตัวเลือก "${name}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
  c.videoSrc = `${BASE}/${file}`;
  console.log(`แบบ → ${name}: 🎬 ${file}`);
}

if (!WRITE) {
  console.log("\n(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;
console.log("\n✅ บันทึกแล้ว — การ์ดแบบทั้ง 2 ทรงเป็นคลิป");
