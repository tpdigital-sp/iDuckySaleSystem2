#!/usr/bin/env node
/**
 * PILLOW KEYCHAIN (pillow-keychain) — ภาพกลุ่ม "เนื้อผ้า" ใช้ "ใบสเปคผ้าจริงของร้าน"
 *
 *   node scripts/pillow-keychain-fabric-photo.mjs           (เตรียมภาพลง .cache/pillow-keychain/upload ดูก่อน)
 *   node scripts/pillow-keychain-fabric-photo.mjs --write    (+ อัปโหลด storage + ตั้ง imageSrc + อ่านกลับเทียบ)
 *
 * เจ้าของร้านส่งใบสเปค 2 ใบมาให้ใช้ (4 ก.ย. 69) — ของจริงถ่ายสวอตช์ผ้า + วงซูมผิวผ้า + คำอธิบาย
 * แทนการ์ดที่สคริปต์วาดเอง (pillow-keychain-screen-fabric-art.mjs รอบแรก) เพราะรูปจริงบอกผิวผ้าได้ตรงกว่า
 *
 * ต้นทาง (ไดรฟ์ร้าน · 1970×1970):
 *   - ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ/2.ผ้าขนสั้น 200แกรม.jpg
 *   - ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ/5.ผ้าแคนวาส 8 ออนซ์.jpg
 *   (ทั้งโฟลเดอร์มีผ้า 16 ชนิด ใช้กับสินค้างานผ้าตัวอื่นได้อีก)
 *
 * ⚠️ ไดรฟ์ไม่ได้ต่อตลอด — สำเนาต้นฉบับไว้ที่ .cache/pillow-keychain/ref/ ครั้งแรกที่รัน
 *    รอบต่อไปถ้าไดรฟ์ไม่ได้ต่อ ก็ยังรันซ้ำได้จากสำเนา (แบบเดียวกับ iducky-assets.mjs)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — เปลี่ยนรูปเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "pillow-keychain";
const VER = "v1";
const OUT = `.cache/${PRODUCT_ID}/upload`;
const REF = `.cache/${PRODUCT_ID}/ref`;
mkdirSync(OUT, { recursive: true });
mkdirSync(REF, { recursive: true });

const DRIVE = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ";
const FABRIC_GROUP = "เนื้อผ้า";

const JOBS = [
  { src: "2.ผ้าขนสั้น 200แกรม.jpg", file: `fabric-plush-photo-${VER}.jpg`, choice: "ขนสั้น 200แกรม" },
  { src: "5.ผ้าแคนวาส 8 ออนซ์.jpg", file: `fabric-canvas-photo-${VER}.jpg`, choice: "แคนวาส (8 oz)" },
];

/** ต้นฉบับจากไดรฟ์ก่อน ถ้าไม่ได้ต่อค่อยใช้สำเนาที่แคชไว้ */
function source(name) {
  const cached = `${REF}/${name}`;
  const src = `${DRIVE}/${name}`;
  if (existsSync(src)) { copyFileSync(src, cached); return src; }
  if (existsSync(cached)) return cached;
  throw new Error(`หาไฟล์ "${name}" ไม่เจอ — ต่อไดรฟ์ iDuckyShop แล้วรันใหม่หนึ่งครั้งเพื่อเก็บสำเนา`);
}

for (const j of JOBS) {
  const path = source(j.src);
  j.buf = await sharp(path).resize(1400, 1400, { fit: "inside" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  const meta = await sharp(j.buf).metadata();
  console.log(`🖼  ${OUT}/${j.file}  ${meta.width}×${meta.height}  ${Math.round(j.buf.length / 1024)} KB — ${FABRIC_GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${PRODUCT_ID}/`);

// อ่าน DB สดก่อนเขียนเสมอ + dump สภาพเดิมกันเหนียว (สคริปต์ไม่ผ่าน API = ไม่มี product_revisions)
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const g = (data.options ?? []).find((o) => o.label === FABRIC_GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${FABRIC_GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${FABRIC_GROUP}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;   // ป้าย popular / ชื่อ / ราคา เดิมไม่แตะ
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === FABRIC_GROUP);
for (const j of JOBS) {
  const c = bg?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
}
const plush = bg.choices.find((c) => c.name === "ขนสั้น 200แกรม");
if (plush?.popular !== true) { console.error("ป้ายนิยมหาย!", plush); process.exit(1); }
console.log(`✓ ตั้งรูปใบสเปคผ้าจริง ${JOBS.length} ใบ · ป้ายนิยมยังอยู่ · savedAt =`, back.data.savedAt);
