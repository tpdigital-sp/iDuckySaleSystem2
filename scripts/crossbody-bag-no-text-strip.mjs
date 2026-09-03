#!/usr/bin/env node
/**
 * แถบตัวอย่างของตัวเลือก "ไม่มีตัวอักษร (ปักเฉพาะลาย)" ในกลุ่มฟอนต์ของ crossbody-bag
 *
 *   node scripts/crossbody-bag-no-text-strip.mjs            (วาดลง .cache/crossbody-bag/upload)
 *   node scripts/crossbody-bag-no-text-strip.mjs --write     (+ อัปโหลด + ตั้ง choice.imageSrc + อ่านกลับ)
 *
 * ทำไมต้องมี: ตาราง sampleGrid วาดช่องสีเทาที่มีเครื่องหมาย "?" ให้ตัวเลือกที่ไม่มี imageSrc
 * (ProductDetail:3237) — ตัวเลือกแรกของกลุ่มเลยดูเหมือนรูปโหลดไม่ขึ้น ทั้งที่ตั้งใจให้ว่าง
 * ขนาด 800×75 ให้เท่าแถบฟอนต์ต้นทาง (products/new-mt2saszv-9863/font-E1-v1.jpg) พอดี
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "crossbody-bag";
const GROUP = "ฟอนต์ตัวปัก (ถ้ามีข้อความ)";
const CHOICE = "ไม่มีตัวอักษร (ปักเฉพาะลาย)";
const VER = "v1";
const OUT = ".cache/crossbody-bag/upload";
mkdirSync(OUT, { recursive: true });

const W = 800, H = 75;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
// เส้นประ + ข้อความจาง ๆ อ่านออกว่า "ช่องนี้คือไม่ปักตัวอักษร" ไม่ใช่รูปเสีย
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="10 8"/>
  <text x="${W / 2}" y="${H / 2 + 9}" font-family="${TH}" font-size="27" text-anchor="middle" fill="#94a3b8">— ปักเฉพาะลาย ไม่มีตัวอักษร —</text>
</svg>`;

const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
const file = `font-none-${VER}.jpg`;
writeFileSync(`${OUT}/${file}`, buf);
console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB  ${W}×${H}`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${file}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", upErr); process.exit(1); }
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const c = data.options?.find((o) => o.label === GROUP)?.choices?.find((c) => c.name === CHOICE);
if (!c) { console.error(`ไม่เจอตัวเลือก "${CHOICE}" ในกลุ่ม "${GROUP}"`); process.exit(1); }
c.imageSrc = url;
data.savedAt = new Date().toISOString();
const { error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID);
if (updErr) { console.error(updErr); process.exit(1); }

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options.find((o) => o.label === GROUP)?.choices?.find((c) => c.name === CHOICE)?.imageSrc;
if (got !== url) { console.error("อ่านกลับไม่ตรง", got); process.exit(1); }
console.log("✓", url);
