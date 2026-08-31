#!/usr/bin/env npx tsx
/**
 * POSTCARD / โปสการ์ด (postcard-th) — ใส่รูปสินค้าจริงจากหน้าเว็บร้าน
 *
 *   npx tsx scripts/postcard-photo-from-site.mts           # โหลด+แปลงลง .cache ดูก่อน (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/postcard-photo-from-site.mts --write   # อัปขึ้น storage + เขียนสินค้า
 *
 * ผู้ใช้สั่ง (31 ส.ค. 69): เอา "ภาพที่ 1" จากหน้าสินค้าโปสการ์ดบน iduckyprintsstudio.com
 *   https://www.iduckyprintsstudio.com/postcard-duplicate/product_card/product/?productId=product
 *
 * ⚠️ หน้านั้นเป็นเพจ JS (getprintbox) — HTML ดิบไม่มี URL รูป ต้องอ่านจาก DOM ที่เรนเดอร์แล้ว
 *    รูปเสิร์ฟจาก cdn3.getprintbox.com ขนาดใหญ่สุดที่เปิดให้ดึงคือ Postcard_thumb_900x900
 *    (1800x1800 / ไม่มี suffix / _original ตอบ 403 หมด) · ไฟล์จริงเป็น webp แม้ URL ไม่บอกนามสกุล
 *
 * รูปทั้ง 6 ใบของหน้านั้น เรียงตามลำดับที่โชว์บนเว็บ (ตรวจแล้วว่าลิงก์ตัวเลือกขนาด 5x7 ก็ใช้ชุดเดียวกัน)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "postcard-th";
const DIR = ".cache/postcard-photos";
mkdirSync(`${DIR}/src`, { recursive: true });
mkdirSync(`${DIR}/upload`, { recursive: true });

/** รูปสินค้าบนหน้าเว็บร้าน เรียงตามลำดับที่โชว์ (ใบที่ 1 = เป็ดอ่านหนังสือบนขาตั้ง) */
const PHOTOS: [n: number, uuid: string, label: string][] = [
  [1, "bbe1b95e-9192-438a-b24e-bcb90cc504e1", "โปสการ์ดพิมพ์ลาย งานจริง — ตั้งโชว์บนขาตั้งไม้"],
  [2, "7cbac6f6-e998-4e0c-b372-9c163a73cd58", "โปสการ์ดพิมพ์ลาย — ลายปิกนิกซากุระ"],
  [3, "20495bef-d87e-4dbf-848d-e2442c5caa2c", "โปสการ์ด — ด้านหลังมีช่องจ่าหน้า/แสตมป์"],
  [4, "a7aca7bf-6b89-4aa0-84ec-cd6bca1e19df", "โปสการ์ด — เทียบขนาดสองใบ"],
  [5, "9da96927-88c5-4aac-807e-b056952b4114", "โปสการ์ด — งานจริงหลายลาย"],
  [6, "11a5c069-e416-45a6-9a50-3dd3de986641", "โปสการ์ด — เนื้อกระดาษและสีพิมพ์"],
];
const WANT = new Set([1, 2, 3, 4, 5, 6]); // ผู้ใช้สั่งเพิ่ม: เอามาให้ครบทุกรูป (หน้านั้นมี 6 รูป ทุกตัวเลือกขนาดใช้ชุดเดียวกัน)
const url = (uuid: string) => `https://cdn3.getprintbox.com/pbx2-tpdigital/media/productimage/${uuid}/Postcard_thumb_900x900`;
const fileOf = (n: number) => `site-photo-${n}-v1.jpg`;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}`;

const picked = PHOTOS.filter(([n]) => WANT.has(n));
for (const [n, uuid] of picked) {
  const src = `${DIR}/src/raw-${n}.webp`;
  if (!existsSync(src)) {
    const res = await fetch(url(uuid));
    if (!res.ok) throw new Error(`โหลดรูปที่ ${n} ไม่ได้: HTTP ${res.status}`);
    writeFileSync(src, Buffer.from(await res.arrayBuffer()));
    console.log(`⬇️  รูปที่ ${n}`);
  }
  // แปลง webp → jpeg ให้เข้าชุดกับรูปสินค้าตัวอื่น (900px อยู่ใต้เพดาน 1200 อยู่แล้ว ไม่ต้องย่อ)
  const meta = await sharp(src).metadata();
  await sharp(src).jpeg({ quality: 90 }).toFile(`${DIR}/upload/${fileOf(n)}`);
  console.log(`🖼  ${fileOf(n)} — ต้นฉบับ ${meta.width}×${meta.height} ${meta.format}`);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/POSTCARD|โปสการ์ด/i.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d: any = structuredClone(row.data);

// รูปที่โหลดมาใหม่ไปไว้หน้าสุด · รูปเดิมที่เป็นแค่กรอบอีโมจิ (ไม่มี src) ทิ้งได้
const fresh = picked.map(([n, , label]) => ({
  src: `${BASE}/${fileOf(n)}`,
  emoji: d.emoji ?? "💌",
  label,
  gradient: d.gradient ?? "from-sky-200 to-cyan-300",
}));
// รูปงานจริงจากหน้าเว็บร้านแทนที่ของเดิมทั้งหมด (ของเดิมเป็นภาพ mockup กระดาษวางบนโต๊ะ /landing/shot-postcard.webp)
// ⚠️ หน้าแก้ไขสินค้าหลังบ้านตัดแกลเลอรีเหลือ 5 รูป (MAX_PHOTOS) — กดบันทึกจากหลังบ้านแล้วรูปที่ 6 จะหลุด
d.images = fresh;
d.imageSrc = fresh[0].src;

console.log(`\nแกลเลอรีหลังแก้ (${d.images.length} รูป):`);
for (const im of d.images) console.log(` - ${im.label || "(ไม่มีคำบรรยาย)"} — ${im.src.split("/").pop()}`);
console.log(`รูปหลัก: ${d.imageSrc.split("/").pop()}`);

if (!WRITE) {
  console.log(`\n(ยังไม่อัป/ไม่เขียน — ดูไฟล์ที่ ${DIR}/upload แล้วรัน --write ถ้าโอเค)`);
  process.exit(0);
}

for (const [n] of picked) {
  const buf = readFileSync(`${DIR}/upload/${fileOf(n)}`);
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${fileOf(n)}`, buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw upErr;
  console.log(`⬆️  ${fileOf(n)} (${Math.round(buf.length / 1024)} KB)`);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) throw backErr;
const b: any = back.data;
const head = await fetch(`${BASE}/${fileOf(1)}`, { method: "HEAD" });
const checks: [string, unknown, unknown][] = [
  ["รูปหลัก", b.imageSrc, d.imageSrc],
  ["รูปแรกในแกลเลอรี", b.images[0]?.src, fresh[0].src],
  ["จำนวนรูปในแกลเลอรี", b.images.length, fresh.length],
  ["ไฟล์เปิดได้จริง", head.status, 200],
  ["ชนิดไฟล์", head.headers.get("content-type"), "image/jpeg"],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log("\n✅ บันทึกแล้ว — โปสการ์ดใช้รูปงานจริงใบที่ 1 จากหน้าเว็บร้านเป็นรูปหลัก");
