#!/usr/bin/env node
/**
 * Ceramic Coaster (/products/Ceramic-Coaster · id coaster-ceramic)
 *   1. เติม "ขนาด" จากใบสเปค P-nCoaster-01 ลงกลุ่มตัวเลือก "รูปทรง" (desc ทุกทรง + note หัวกลุ่ม)
 *      กลม 10.5 ซม. · สี่เหลี่ยม 10.2 ซม. · หกเหลี่ยม 9.5 ซม. · ทรงสัตว์เลี้ยง ~11×10.5 ซม.
 *   2. ภาพตัวเลือก "ทรงสัตว์เลี้ยง" = รูปงานจริง (แมวดำ) ครอปจากใบสเปค P-nCoaster-01 บนไดรฟ์
 *      (v1 เคยเป็นการ์ดวาดไดคัทตามมาสคอต — ผู้ใช้ส่งรูปจริงมาแทน 3 ก.ย. 69 · โค้ดวาดอยู่ในประวัติ git)
 *      ⚠️ ต้องต่อไดรฟ์ iDuckyShop ตอน regenerate ภาพ — สคริปต์ die พร้อมบอกทางถ้าไม่เจอไฟล์
 *
 *   node scripts/ceramic-coaster-shape-size.mjs            (วาดภาพลง .cache/coaster-ceramic/upload ดูก่อน)
 *   node scripts/ceramic-coaster-shape-size.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * ⚠️ ไม่แตะชื่อตัวเลือก — "ทรงกลม/ทรงสี่เหลี่ยม/ทรงหกเหลี่ยม/ทรงสัตว์เลี้ยง" เป็นคีย์ตารางราคา
 *    (pricing.cells + priceRates) เปลี่ยนชื่อ = ราคาหลุดเป็น fallback ทันที
 * รันซ้ำได้: เขียนทับ desc/note/imageSrc ตัวเดิม ไม่เพิ่มอะไรซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "coaster-ceramic";
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/coaster-ceramic/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "รูปทรง";
const PET = "ทรงสัตว์เลี้ยง";
const PET_FILE = `shape-pet-${VER}.jpg`;

/** ขนาดจากใบสเปค P-nCoaster-01 (ดู scripts/assets/proposals-gifts.json) */
const SIZES = {
  "ทรงกลม": { text: "10.5 ซม.", desc: "ขนาด 10.5 ซม. · ทรงกลมคลาสสิก เข้าได้กับทุกโต๊ะ" },
  "ทรงสี่เหลี่ยม": { text: "10.2 ซม.", desc: "ขนาด 10.2 ซม. · ทรงสี่เหลี่ยมมุมโค้ง ลุคเรียบโมเดิร์น" },
  "ทรงหกเหลี่ยม": { text: "9.5 ซม.", desc: "ขนาด 9.5 ซม. · ทรงหกเหลี่ยม วางเรียงต่อกันเป็นแพทเทิร์นสวย" },
  [PET]: { text: "~11×10.5 ซม.", desc: "ขนาดประมาณ 11×10.5 ซม. · ไดคัทตามรูปทรงสัตว์เลี้ยง/คาแรกเตอร์ในลายของคุณ" },
};
const NOTE = "ขนาดชิ้นงาน: กลม 10.5 · สี่เหลี่ยม 10.2 · หกเหลี่ยม 9.5 · ทรงสัตว์เลี้ยง ~11×10.5 ซม.";

// ── ภาพตัวเลือกทรงสัตว์เลี้ยง = รูปงานจริง (แมวดำ) ครอปจากใบสเปคบนไดรฟ์ ──
const SPEC = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/50_ของใช้และของที่ระลึก/แผ่นรองแก้วน้ำ/P-nCoaster-01.jpg";
// กรอบครอปคำนวณจากไฟล์ 6411×5000 — คอลัมน์ 2 ของใบสเปค (เช็คขอบแล้วไม่มีกรอบฟ้าการ์ดติดมา)
const CROP = { left: 1786, top: 1422, width: 884, height: 738 };

async function petPhoto() {
  if (!existsSync(SPEC)) {
    console.error(`ไม่เจอใบสเปค ${SPEC} — ต่อไดรฟ์ iDuckyShop ก่อนแล้วรันใหม่`);
    process.exit(1);
  }
  const meta = await sharp(SPEC).metadata();
  if (meta.width !== 6411) {
    console.error(`ใบสเปคไม่ใช่ 6411px (ได้ ${meta.width}) — กรอบครอปคำนวณจาก 6411 ตรวจก่อน`);
    process.exit(1);
  }
  return sharp(SPEC).extract(CROP).resize(1100).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

const petBuf = await petPhoto();
writeFileSync(`${OUT}/${PET_FILE}`, petBuf);
console.log(`🖼  ${OUT}/${PET_FILE}  ${Math.round(petBuf.length / 1024)} KB`);
console.log("\nคำอธิบายที่จะเขียน:");
for (const [name, s] of Object.entries(SIZES)) console.log(`  ${name} → ${s.desc}`);
console.log(`  note หัวกลุ่ม → ${NOTE}`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน DB ──────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${PET_FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, petBuf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const petUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", petUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const opt = (data.options ?? []).find((o) => o.label === GROUP);
if (!opt) { console.error(`ไม่เจอกลุ่ม "${GROUP}" — หยุดก่อน`); process.exit(1); }
const missing = Object.keys(SIZES).filter((n) => !opt.choices.some((c) => c.name === n));
if (missing.length) { console.error("ไม่พบตัวเลือก:", missing.join(", "), "— ชื่ออาจถูกแก้ ตรวจก่อน (เป็นคีย์ตารางราคา)"); process.exit(1); }

const cellKeys = Object.keys(data.pricing?.cells ?? {}).sort().join("|");
opt.note = NOTE;
for (const c of opt.choices) {
  const s = SIZES[c.name];
  if (!s) continue;
  c.desc = s.desc;
  if (c.name === PET) c.imageSrc = petUrl;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = (back.data.options ?? []).find((o) => o.label === GROUP);
const fails = [
  [g?.note === NOTE, "note หัวกลุ่มไม่ลง"],
  [g?.choices?.length === 4, "จำนวนตัวเลือกเปลี่ยน"],
  ...Object.entries(SIZES).map(([name, s]) => [g?.choices?.find((c) => c.name === name)?.desc === s.desc, `desc "${name}" ไม่ลง`]),
  [g?.choices?.find((c) => c.name === PET)?.imageSrc === petUrl, "ภาพทรงสัตว์เลี้ยงไม่ลง"],
  [Object.keys(back.data.pricing?.cells ?? {}).sort().join("|") === cellKeys, "คีย์ตารางราคาเปลี่ยน (ห้ามเกิด)"],
  [back.data.savedAt === data.savedAt, "savedAt ไม่ตรง — โดนเขียนแทรก/ค่าไม่ลง รันซ้ำ"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}": ขนาดลง desc ครบ 4 ทรง + note + ภาพทรงสัตว์เลี้ยง · savedAt =`, back.data.savedAt);
