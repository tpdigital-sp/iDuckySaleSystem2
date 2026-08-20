#!/usr/bin/env node
/**
 * แผ่น "HOW TO PRINT" ของร้าน — อธิบายงานสกรีนอะคริลิคทุกแบบในภาพเดียว
 * (สกรีน 1 ด้าน ใต้/บน · 2 ด้าน ใต้-บน/บน-บน · 3 เลเยอร์ · 4 เลเยอร์ งานประกบ 2 ชิ้น)
 *
 *   node scripts/acrylic-howto-print.mjs                  # ครอป/ย่อไว้ดูก่อน (ไม่แตะคลัง/ฐานข้อมูล)
 *   node scripts/acrylic-howto-print.mjs --upload         # อัปขึ้น Supabase Storage (โฟลเดอร์กลาง)
 *   node scripts/acrylic-howto-print.mjs --upload --write # แนบเข้าแท็บของสินค้าใน TARGETS ด้วย
 *
 * ต้นฉบับเป็นงานฝ่าย Content (ก.พ. 2024) อยู่ในไดรฟ์ร้าน ขนาด 2867×5000
 * เก็บไว้ที่ "โฟลเดอร์กลาง" acrylic-howto/ ไม่ใช่ของสินค้าตัวใดตัวหนึ่ง — สินค้าอะคริลิคทุกตัว
 * ที่มีตัวเลือกงานสกรีนอ้างไฟล์เดียวกันได้ (แบบเดียวกับชาร์ตสีกลางใน scripts/acrylic-colors.mjs)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV
 * ⚠️ ย่อเหลือกว้าง 1600 px — แผ่นนี้เป็นภาพ "อ่านตัวหนังสือ" ถ้าย่อ 1200 เท่ารูปสินค้าทั่วไป
 *    ตัวอักษรกำกับเล็ก ๆ อย่าง "จะมีฟิล์มใสติดอยู่ด้านหน้าอะคริลิค" จะอ่านไม่ออก
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");

/** ต้นฉบับ — ไล่จากไดรฟ์ร้านก่อน (ไดรฟ์ไม่ได้ต่อตลอด จึงแคชไว้ใช้ซ้ำ) */
const SOURCES = [
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/howto-Print_Mesa de trabajo 1.jpg",
  ".cache/acrylic-howto/source.jpg",
];
const OUT = ".cache/acrylic-howto";
const REV = "v1";
const NAME = `howto-print-${REV}`;
const WIDTH = 1600;

/** สินค้าที่ให้แนบแผ่นนี้เข้าแท็บ — tab ต้องมีอยู่แล้ว (สคริปต์ไม่สร้างแท็บใหม่ให้) */
const TARGETS = [{ id: "standy", tab: "รายละเอียดงานสกรีน/ไฟล์" }];

/** บรรทัดที่เติมท้ายข้อความในแท็บ ให้ลูกค้ารู้ว่าให้ดูภาพประกอบด้านล่าง */
const NOTE =
  "• ดูแผ่น “HOW TO PRINT” ด้านล่าง — เทียบให้เห็นครบทุกแบบ (สกรีนใต้/บน · 2 ด้าน ใต้-บน/บน-บน · 3 และ 4 เลเยอร์)";

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
const URL_OF = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/acrylic-howto/${NAME}.jpg`;

const src = SOURCES.find((f) => existsSync(f));
if (!src) throw new Error(`ไม่พบต้นฉบับ — ต่อไดรฟ์ร้านก่อน หรือวางไฟล์ไว้ที่ ${SOURCES[1]}`);

mkdirSync(OUT, { recursive: true });
// เก็บสำเนาต้นฉบับไว้ในแคช เผื่อวันหลังไดรฟ์ไม่ได้ต่อ
if (src !== SOURCES[1]) writeFileSync(SOURCES[1], readFileSync(src));

const meta = await sharp(src).metadata();
const buf = await sharp(src).resize(WIDTH).jpeg({ quality: 85, chromaSubsampling: "4:4:4" }).toBuffer();
writeFileSync(`${OUT}/${NAME}.jpg`, buf);
console.log(`🎨 ${NAME}.jpg — ต้นฉบับ ${meta.width}×${meta.height} → กว้าง ${WIDTH} (${Math.round(buf.length / 1024)} KB)`);
console.log(`   ${OUT}/${NAME}.jpg`);

if (UPLOAD) {
  const { error } = await sb.storage
    .from("product-images")
    .upload(`products/acrylic-howto/${NAME}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  console.log(`⬆️  ${URL_OF}`);
}

if (!WRITE) {
  console.log("\n(ยังไม่แนบเข้าสินค้า — ใส่ --upload --write ถ้าต้องการใช้จริง)");
  process.exit(0);
}

for (const t of TARGETS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", t.id).single();
  if (error) throw new Error(`${t.id}: อ่านไม่สำเร็จ — ${error.message}`);
  const d = structuredClone(row.data);
  const tab = d.tabs?.find((x) => x.title === t.tab);
  if (!tab) throw new Error(`${t.id}: ไม่เจอแท็บ "${t.tab}"`);

  tab.images = [...new Set([...(tab.images ?? []), URL_OF])];
  tab.imageSize = "lg"; // แผ่นนี้เป็นภาพอ่านตัวหนังสือ ต้องเต็มความกว้าง
  if (!tab.text.includes("HOW TO PRINT")) tab.text = `${tab.text.trimEnd()}\n${NOTE}`;

  console.log(`\n📦 ${d.name} (${t.id}) → แท็บ "${t.tab}"`);
  console.log(`   รูปในแท็บ: ${tab.images.length} ใบ · ขนาด ${tab.imageSize}`);
  const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", t.id);
  if (saveErr) throw new Error(`${t.id}: บันทึกไม่สำเร็จ — ${saveErr.message}`);
  console.log("   ✅ บันทึกแล้ว");
}
