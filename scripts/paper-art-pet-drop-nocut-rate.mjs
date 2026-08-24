#!/usr/bin/env node
/**
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) — ถอดกลุ่มเรท "ไม่ไดคัท (ขนาด A3)" ออกทั้งชุด
 *
 *   node scripts/paper-art-pet-drop-nocut-rate.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-art-pet-drop-nocut-rate.mjs --write
 *
 * ถอดออกทุกที่ที่อ้างถึง:
 *   1. d.priceRates — เรท no-die-cut ทั้งก้อน (label/desc/ตารางราคา/imageSrc)
 *   2. แกลเลอรี d.images — ภาพ rate-nocut.jpg (ไม่งั้นภาพค้างทั้งที่เรทหาย)
 *   3. แท็บรายละเอียดงานพิมพ์ — บรรทัด "• ไม่ไดคัท — เต็มแผ่นขนาด A3"
 *   4. description + highlight — เหลือการตัด 2 แบบ (ตัดตามขนาด / ไดคัทตามทรง)
 *   5. ช่วงราคาใหม่จากเรทที่เหลือ + คอลัมน์กระจก price ในตาราง products
 *      (ตารางกระจก d.pricing = เรทแรก cut-to-size อยู่แล้ว ไม่ต้องแตะ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "paper-art-pet";
const EXPECT_NAME = "กระดาษอาร์ตมัน | PET";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const DROP_IMG =
  "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/paper-art-pet/rate-nocut.jpg";

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;

/* ---------- 1) ถอดเรท no-die-cut ---------- */
const rateIdx = d.priceRates.findIndex((r) => r.id === "no-die-cut");
if (rateIdx < 0) die("ไม่พบเรท no-die-cut — อาจถอดไปแล้ว");
const [rate] = d.priceRates.splice(rateIdx, 1);
if (d.priceRates.length < 2) die("เหลือเรทน้อยกว่า 2 — ผิดคาด เช็คก่อน");

/* ---------- 2) ถอดภาพประจำเรทออกจากแกลเลอรี ---------- */
const imgIdx = d.images.findIndex((im) => im.src === DROP_IMG);
if (imgIdx < 0) die("ไม่พบ rate-nocut.jpg ในแกลเลอรี");
d.images.splice(imgIdx, 1);
if (d.imageSrc === DROP_IMG) d.imageSrc = d.images[0].src; // เผื่อปกชี้ภาพที่ถอด (ปัจจุบันปก = rate-diecut ไม่โดน)

/* ---------- 3) ข้อความประกอบ ---------- */
const replaceIn = (obj, field, from, to) => {
  if (!obj[field]?.includes(from)) die(`ไม่พบข้อความ "${from}" ใน ${field}`);
  obj[field] = obj[field].replaceAll(from, to);
};
const printTab = d.tabs.find((t) => t.text?.includes("• ไม่ไดคัท — เต็มแผ่นขนาด A3"));
if (!printTab) die("ไม่พบบรรทัด • ไม่ไดคัท ในแท็บ");
replaceIn(printTab, "text", "\n• ไม่ไดคัท — เต็มแผ่นขนาด A3", "");
replaceIn(d, "description", "เลือกได้ทั้งตัดตามขนาด ไดคัทตามทรง หรือเต็มแผ่น A3 ไม่ไดคัท", "เลือกได้ทั้งตัดตามขนาด หรือไดคัทตามทรง");
const hi = d.highlights.indexOf("เลือกการตัดได้ 3 แบบ — ตัดตามขนาด / ไดคัทตามทรง / ไม่ไดคัท");
if (hi < 0) die("ไม่พบ highlight การตัด 3 แบบ");
d.highlights[hi] = "เลือกการตัดได้ 2 แบบ — ตัดตามขนาด / ไดคัทตามทรง";

/* ---------- 4) ช่วงราคาใหม่จากเรทที่เหลือ (แบบเดียวกับ priceRange ใน src/lib/products.ts) ---------- */
const all = d.priceRates.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
d.price = d.priceMin;
d.savedAt = new Date().toISOString();

const leftover = JSON.stringify(d).match(/ไม่ไดคัท/g) || [];
console.log(`ถอดเรท "${rate.label}" (${rate.desc}) + ภาพ ${DROP_IMG.split("/").pop()}`);
console.log(`เรทที่เหลือ: ${d.priceRates.map((r) => r.label).join(" / ")}`);
console.log(`แกลเลอรีเหลือ ${d.images.length} ภาพ ภาพแรก: ${d.images[0].label} · ปก: ${d.imageSrc.split("/").pop()}`);
console.log(`ช่วงราคาใหม่: ฿${d.priceMin} – ฿${d.priceMax} · คำว่า "ไม่ไดคัท" เหลือค้างใน data: ${leftover.length} จุด`);
if (leftover.length > 0) die("ยังมีคำว่า ไม่ไดคัท ค้างอยู่ — เช็คก่อนเขียน");

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb
  .from("products")
  .update({ price: d.price, data: d })
  .eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว (สินค้ายังเป็นฉบับร่าง hidden ตามเดิม)");
