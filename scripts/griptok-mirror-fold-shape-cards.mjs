#!/usr/bin/env node
/**
 * GRIPTOK กระจกพับ (new-mt8fg70f-8328) — การ์ดตัวเลือก "แบบ" รอบ 2 ตามลิงก์ pgid ที่ผู้ใช้ชี้
 *
 *   node scripts/griptok-mirror-fold-shape-cards.mjs           # ครอปลง .cache ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-mirror-fold-shape-cards.mjs --write   # อัป + เขียนสินค้า
 *
 * ผู้ใช้ส่งลิงก์แกลเลอรีหน้า pricelists /griptok?pgid=lssydfpo4-… กำกับว่าแบบไหนคือคลิปไหน:
 *   ทรงกลม      = pgid 92ac0e3a… → คลิป 959b83_9a962234… (กริ๊บต๊อกกลมลาย Hogwarts เปิดฝากระจก)
 *   ทรงสี่เหลี่ยม = pgid adf05436… → คลิป 959b83_d7e313f2… (กระจกพับเหลี่ยม งาน UV เปิดฝาบนเคสลายเมฆ)
 * (แกะจาก griptok.html: item container pgi<id> → ไฟล์ f003 ของคลิปนั้น)
 *
 * ทำ 2 อย่าง:
 *   1. การ์ด "แบบ" 900×900 ครอปจากเฟรมโปสเตอร์ f002/f000 ของคลิปคู่นั้น → shape-*-v2 (v1 ทับไม่ได้ CDN แคช)
 *   2. แก้ป้ายคลิปในแกลเลอรีที่รอบแรกติดผิด (9a962234 ไม่ใช่ "ฐานพับ" — เป็นคลิปทรงกลม)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mt8fg70f-8328";
const DIR = ".cache/griptok-mirror-fold";
const SRC = `${DIR}/src`;
const OUT = `${DIR}/upload`;
mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}`;

// [ไฟล์เฟรมต้นทาง, url, ไฟล์การ์ด, กล่องครอป] — เฟรม 720×1280
const CARDS = [
  [
    "frame-round.jpg",
    "https://static.wixstatic.com/media/959b83_9a962234d29e4e10af707f17d010a0f3f002.jpg",
    "shape-round-v2.jpg",
    { left: 120, top: 540, width: 560, height: 560 },
  ],
  [
    "frame-square.jpg",
    "https://static.wixstatic.com/media/959b83_d7e313f27bf74b76b914987cf002cecaf000.jpg",
    "shape-square-v2.jpg",
    { left: 60, top: 505, width: 600, height: 600 },
  ],
];
for (const [src, url, out, box] of CARDS) {
  const path = `${SRC}/${src}`;
  if (!existsSync(path)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`โหลด ${src} ไม่ได้: HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    console.log(`⬇️  ${src}`);
  }
  await sharp(path).extract(box).resize(900, 900).jpeg({ quality: 88 }).toFile(`${OUT}/${out}`);
  console.log(`🖼  ${out}`);
}

const SHAPE_IMG = { ทรงกลม: "shape-round-v2.jpg", ทรงสี่เหลี่ยม: "shape-square-v2.jpg" };
// ป้ายแกลเลอรีตามคลิปจริง — คีย์คือไฟล์ videoSrc
const CLIP_LABELS = {
  "clip-fold-base-v1.mp4": "งานจริง — ทรงกลม เปิดฝาเป็นกระจก งานพิมพ์ UV",
  "clip-uv-print-v1.mp4": "งานจริง — ทรงสี่เหลี่ยม กระจกพับ งานพิมพ์ UV",
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/กระจกพับ/.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

const opt = (d.options ?? []).find((o) => o.label === "แบบ");
for (const [name, file] of Object.entries(SHAPE_IMG)) {
  const c = opt?.choices.find((c) => c.name === name);
  if (!c) throw new Error(`ไม่เจอตัวเลือก "${name}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
  c.imageSrc = `${BASE}/${file}`;
  console.log(`แบบ → ${name}: ${file}`);
}
for (const img of d.images ?? []) {
  const clip = Object.keys(CLIP_LABELS).find((f) => img.videoSrc?.endsWith(f));
  if (clip) {
    console.log(`ป้ายคลิป ${clip}: "${img.label}" → "${CLIP_LABELS[clip]}"`);
    img.label = CLIP_LABELS[clip];
  }
}

if (!WRITE) {
  console.log("\n(ยังไม่อัป/ไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

for (const file of Object.values(SHAPE_IMG)) {
  const buf = readFileSync(`${OUT}/${file}`);
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw upErr;
  console.log(`⬆️  ${file} (${Math.round(buf.length / 1024)} KB)`);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;
console.log("\n✅ บันทึกแล้ว — การ์ดแบบ 2 ทรงมาจากคลิปที่ผู้ใช้ชี้ + ป้ายคลิปในแกลเลอรีตรงทรงแล้ว");
