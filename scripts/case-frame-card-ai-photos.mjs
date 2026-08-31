#!/usr/bin/env node
/**
 * Case Frame Card — เพิ่มภาพ mockup (AI) ชุด "ใหม่" เข้าแกลเลอรีสินค้า
 *
 *   node scripts/case-frame-card-ai-photos.mjs                     # เตรียมไฟล์ + ดูว่าจะเพิ่มอะไร
 *   node scripts/case-frame-card-ai-photos.mjs --upload --write    # อัป Storage + เขียนแกลเลอรี
 *
 * ต้นทาง: /Volumes/iDuckyShop/- ตัวอย่าง เคสลูกค้าสั่งทำ/2568/9SEPTEMBER/เคส/Ai/ใหม่
 * เลือก 7 ใบจาก 20 ใบในโฟลเดอร์ (ยังมีอีก 15 ใบในโฟลเดอร์ย่อย "-" ที่ยังไม่ได้ใช้)
 *
 * ⚠️ เพดานแกลเลอรี MAX_PHOTOS = 12 (ProductEditor ตัดทิ้งตอนกดบันทึก)
 *    ของเดิม 5 ใบ + ชุดนี้ 7 ใบ = 12 พอดี — จะเพิ่มอีกต้องถอดของเดิมออกก่อน
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — เปลี่ยนภาพแล้วต้องขยับเลข V
 */
import { mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
const SRC_DIR = "/Volumes/iDuckyShop/- ตัวอย่าง เคสลูกค้าสั่งทำ/2568/9SEPTEMBER/เคส/Ai/ใหม่";
const OUT = ".cache/case-frame-card/upload";
const ID = "case-frame-card";
const EXPECT_NAME = "Case Frame Card";
const MAX_PHOTOS = 12; // ต้องตรงกับ ProductEditor.tsx
const V = "v1";

/**
 * ใบที่เลือก — อ้างด้วย "ลำดับที่เท่าไหร่เมื่อเรียงชื่อไฟล์" เพราะชื่อไฟล์ Gemini เป็นสตริงสุ่มอ่านไม่รู้เรื่อง
 * (ตรวจกับ FILE ที่เขียนกำกับไว้ทุกใบ — ถ้าโฟลเดอร์เปลี่ยน สคริปต์จะเตือนแทนที่จะหยิบผิดใบเงียบ ๆ)
 */
const PICKS = [
  { n: 5, file: "Gemini_Generated_Image_8cmxxd8cmxxd8cmx.png", label: "เคส Magsafe + ที่ชาร์จไร้สาย" },
  { n: 9, file: "Gemini_Generated_Image_d4s6mxd4s6mxd4s6.png", label: "วงแม่เหล็กบนหลังเคส" },
  { n: 12, file: "Gemini_Generated_Image_ktd7e0ktd7e0ktd7.png", label: "สอดการ์ดในกรอบ (Magsafe)" },
  { n: 13, file: "Gemini_Generated_Image_l0qvasl0qvasl0qv.png", label: "เทียบแบบธรรมดา / Magsafe" },
  { n: 16, file: "Gemini_Generated_Image_vgi0mdvgi0mdvgi0.png", label: "สอดการ์ดในกรอบ (ธรรมดา)" },
  { n: 18, file: "Gemini_Generated_Image_w88kinw88kinw88k.png", label: "วางคู่ ธรรมดา + Magsafe" },
  { n: 19, file: "Gemini_Generated_Image_yxzgewyxzgewyxzg.png", label: "ถือในมือ เห็นการ์ดเต็มกรอบ" },
];

const files = readdirSync(SRC_DIR)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .sort();

mkdirSync(OUT, { recursive: true });
const bufs = {};
for (const [i, p] of PICKS.entries()) {
  const actual = files[p.n - 1];
  if (actual !== p.file) throw new Error(`ใบที่ ${p.n} ในโฟลเดอร์ตอนนี้คือ "${actual}" ไม่ใช่ "${p.file}" — โฟลเดอร์เปลี่ยนไปแล้ว เช็คก่อน`);
  const name = `ai-${String(i + 1).padStart(2, "0")}-${V}`;
  // แกลเลอรีเดิมเป็น jpg 1200px — แปลงให้เข้าชุดกัน (PNG ต้นทางใบละ ~1 MB หนักเกินจำเป็น)
  const buf = await sharp(join(SRC_DIR, actual))
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  bufs[name] = { buf, label: p.label };
  console.log(`🖼  ${name}.jpg  ${Math.round(buf.length / 1024)} KB  ← ใบที่ ${p.n} · ${p.label}`);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

if (UPLOAD) {
  for (const [name, { buf }] of Object.entries(bufs)) {
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}.jpg`);
  }
} else {
  console.log("(ยังไม่อัปภาพ — ใส่ --upload ถ้าจะอัปจริง)");
}

const url = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (row.name !== EXPECT_NAME) throw new Error(`สินค้า ${ID} ชื่อ "${row.name}" ไม่ใช่ "${EXPECT_NAME}" — หยุดก่อน`);

const data = row.data;
// รูปเดิม (ถ่ายจริง) อยู่หน้าเสมอ — ชุด AI ต่อท้าย · รันซ้ำไม่เพิ่มซ้ำ (ตัดของชุดนี้ออกก่อนแล้วต่อใหม่)
const kept = (data.images ?? []).filter((im) => !/\/ai-\d\d-/.test(im.src ?? ""));
const added = Object.entries(bufs).map(([name, { label }]) => ({
  src: url(name),
  emoji: "📱",
  label,
  gradient: "from-violet-100 to-purple-200",
}));
data.images = [...kept, ...added];

console.log(`\nแกลเลอรี: ของเดิม ${kept.length} + ชุด AI ${added.length} = ${data.images.length} ใบ (เพดาน ${MAX_PHOTOS})`);
if (data.images.length > MAX_PHOTOS)
  throw new Error(`เกินเพดาน ${MAX_PHOTOS} ใบ — ProductEditor จะตัดทิ้งตอนกดบันทึก ถอดออกก่อน`);

if (WRITE) {
  const { error: e } = await sb.from("products").update({ data }).eq("id", ID);
  if (e) throw e;
  console.log("✅ เขียนเรียบร้อย");
} else {
  console.log("(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
}
