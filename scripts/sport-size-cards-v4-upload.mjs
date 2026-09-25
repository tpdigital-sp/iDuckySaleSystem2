#!/usr/bin/env node
/**
 * การ์ดขนาด S/M/L/XL ของ "เสื้อกีฬา ทรง SPORT" (id: sport) — รุ่น v4 = ภาพที่เจ้าของร้านทำมาเอง (25 ก.ย. 69)
 * ต้นฉบับ .webp 1145×1374 → เติมขอบซ้าย-ขวาสีพื้นเดิมให้เป็นจัตุรัส 1200×1200 JPG (ปุ่มตัวเลือกเป็นกล่องจัตุรัส)
 *
 *   node scripts/sport-size-cards-v4-upload.mjs            (แปลงลง .cache/sport-size-v4/ + ใบเทียบ)
 *   node scripts/sport-size-cards-v4-upload.mjs --write    (+ อัปโหลด + ตั้ง choice.imageSrc + อ่านกลับ)
 * ต้นฉบับวางที่ .cache/sport-size-v4/src/{s,m,l,xl}.webp (ไม่ได้อยู่ใน git)
 * ⚠️ แก้ภาพครั้งหน้าขึ้น v5 — ห้ามอัปทับชื่อเดิม (แคช 30 วัน)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PRODUCT_ID = "sport";
const VER = "v4";
const OUT = `.cache/sport-size-${VER}`;
mkdirSync(OUT, { recursive: true });
const SIZES = [{ key: "s", name: "S" }, { key: "m", name: "M" }, { key: "l", name: "L" }, { key: "xl", name: "XL" }];
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const bufs = {};
for (const sz of SIZES) {
  const src = sharp(`${OUT}/src/${sz.key}.webp`);
  const m = await src.metadata();
  const side = Math.max(m.width, m.height);
  const padX = side - m.width, padY = side - m.height;
  // ⚠️ sharp ทำ resize ก่อน extend เสมอไม่ว่าจะเรียกลำดับไหน → ต้องคั่น toBuffer() (กับดักเดียวกับ blur→threshold)
  const squared = await src
    .extend({ left: Math.floor(padX / 2), right: Math.ceil(padX / 2), top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2), background: { r: 241, g: 252, b: 253 } })
    .toBuffer();
  const buf = await sharp(squared).resize(1200, 1200).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const meta = await sharp(buf).metadata();
  if (meta.width !== 1200 || meta.height !== 1200) die(`${sz.key} ไม่เป็นจัตุรัส`);
  bufs[sz.key] = buf;
  writeFileSync(`${OUT}/size-${sz.key}-${VER}.jpg`, buf);
  console.log(`✓ size-${sz.key}-${VER}.jpg ${Math.round(buf.length / 1024)} KB`);
}
if (!WRITE) { console.log("(ยังไม่เขียน — รันซ้ำด้วย --write)"); process.exit(0); }

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const urlOf = (key) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${PRODUCT_ID}/size-${key}-${VER}.jpg`;

for (const sz of SIZES) {
  const path = `products/${PRODUCT_ID}/size-${sz.key}-${VER}.jpg`;
  const { error } = await sb.storage.from("product-images").upload(path, bufs[sz.key], { contentType: "image/jpeg", upsert: true });
  if (error) die(`อัปโหลด ${path}: ${error.message}`);
  const head = await fetch(urlOf(sz.key), { method: "HEAD" });
  if (!head.ok) die(`เปิด ${urlOf(sz.key)} ไม่ได้ (${head.status})`);
  console.log(`☁️  ${path}`);
}
const { data: row, error: e1 } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (e1) die(e1.message);
const d = structuredClone(row.data);
const groups = (d.options ?? []).filter((o) => o.label === "ขนาด");
if (groups.length !== 1) die(`กลุ่ม "ขนาด" มี ${groups.length} กลุ่ม`);
for (const sz of SIZES) {
  const c = groups[0].choices.find((x) => x.name === sz.name);
  if (!c) die(`ไม่พบตัวเลือก ${sz.name}`);
  c.imageSrc = urlOf(sz.key);
}
d.savedAt = new Date().toISOString();
const { data: rows, error: e2 } = await sb.from("products").update({ data: d }).eq("id", PRODUCT_ID).select("id");
if (e2) die(e2.message);
if (rows.length !== 1) die(`อัปเดตโดน ${rows.length} แถว`);
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === "ขนาด");
for (const sz of SIZES) {
  const v = bg.choices.find((x) => x.name === sz.name)?.imageSrc;
  if (typeof v !== "string" || v !== urlOf(sz.key)) die(`อ่านกลับ ${sz.name} ไม่ตรง: ${v}`);
}
if (back.data.savedAt !== d.savedAt) die("savedAt ไม่ตรง");
console.log(`✓ เขียนแล้ว อ่านกลับตรง 4 ไซซ์ · savedAt=${back.data.savedAt}`);
