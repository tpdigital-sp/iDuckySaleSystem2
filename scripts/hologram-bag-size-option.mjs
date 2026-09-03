#!/usr/bin/env node
/**
 * กระเป๋าโฮโลแกรม (hologram-bag) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบตัวเลือก
 *
 *   node scripts/hologram-bag-size-option.mjs            (วาดภาพลง .cache/hologram-bag/upload ดูก่อน)
 *   node scripts/hologram-bag-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค ZIPLOCK (กระเป๋า/11-1_กระเป๋าโฮโลแกรม-candy bag-แฟ้มจิ๋ว/P-nZiplock-01.jpg):
 * กระเป๋าโฮโลแกรมมี "ขนาดเดียว" 15×21 ซม. · สกรีนลายไม่เกิน 15×10 ซม. · ซิปดำ/ซิปขาว
 * (candy bag 9×11 กับแฟ้มจิ๋ว เป็นสินค้าคนละตัว ไม่เกี่ยว)
 *
 * ทำ 2 อย่าง:
 *   1. เพิ่มกลุ่ม "ขนาด" ไว้หน้ากลุ่ม "สีซิป" — ตัวเลือกเดียว "15×21 ซม." ไม่บวกราคา
 *      พร้อมภาพวาดใหม่ (900×900) โชว์ตัวกระเป๋า+ลูกศรวัด 21/15 ซม. + กรอบสกรีน 15×10 ซม.
 *   2. เติม choice.imageSrc ให้กลุ่ม "สีซิป" จากรูปงานจริงในแกลเลอรี (ไม่ต้องวาด/อัปโหลด)
 *      ซิปดำ → images[0] (ซิปดำเต็มใบ) · ซิปขาว → images[1] (ซิปขาวเต็มใบ)
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "hologram-bag";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/hologram-bag/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "15×21 ซม.";
const ZIP_GROUP = "สีซิป";
/** ซิปดำ/ซิปขาว → index รูปงานจริงใน data.images (ลูกค้าชี้เอง: รูป 1/5 = ซิปดำ · รูป 4/5 = ซิปขาว) */
const ZIP_FROM_GALLERY = { "ซิปดำ": 0, "ซิปขาว": 3 };

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ shoulder-bag-option-art) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/**
 * ภาพ "ขนาดกระเป๋า" — ซองซิปล็อคโฮโลแกรมแนวนอน (ตามรูปงานจริง ด้านยาว 21 อยู่ล่าง)
 * ตัวซองไล่เฉดรุ้งพาสเทล + ซิปดำมีห่วงกลม + กรอบสกรีน 15×10 ซม. มีมาสคอตแทนลายลูกค้า
 */
function sizeArt() {
  /** 1 ซม. = 27 px → ซอง 21×15 = 567×405 px วางกลางการ์ดพอดี */
  const CM = 27;
  const bw = 21 * CM;
  const bh = 15 * CM;
  const bx = (W - bw) / 2;
  const by = 236;
  const zipY = by + 34; // แนวซิปใต้ขอบบน
  const sw = 15 * CM;
  const sh = 10 * CM;
  const scx = bx + bw / 2;
  const scy = by + 34 + (bh - 34) / 2 + 10; // กึ่งกลางพื้นที่ใต้ซิป
  const r = MASCOT.ratio;
  let aw = (sh - 24) * r;
  let ah = sh - 24;
  if (aw > sw - 40) { aw = sw - 40; ah = aw / r; }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- เฉดรุ้งโฮโลแกรมพาสเทล ตามวัสดุจริง -->
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bfeef7"/>
      <stop offset="0.28" stop-color="#d9d4fb"/>
      <stop offset="0.52" stop-color="#fcd3ec"/>
      <stop offset="0.74" stop-color="#fdeccb"/>
      <stop offset="1" stop-color="#c9f2df"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดกระเป๋า 15 × 21 ซม.</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ซองซิปล็อค PVC ใสโฮโลแกรม — ขนาดเดียว</text>

  <!-- ตัวซอง -->
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="14" fill="url(#holo)" stroke="#b8c4d6" stroke-width="3"/>
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="14" fill="url(#sheen)"/>
  <!-- แนวซิป + ห่วงดึงกลม (แบบซิปดำในรูปงานจริง) -->
  <line x1="${bx + 10}" y1="${zipY}" x2="${bx + bw - 10}" y2="${zipY}" stroke="#1e293b" stroke-width="9" stroke-linecap="round"/>
  <line x1="${bx + 10}" y1="${zipY}" x2="${bx + bw - 10}" y2="${zipY}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 6"/>
  <rect x="${bx + bw - 92}" y="${zipY - 9}" width="26" height="18" rx="5" fill="#1e293b"/>
  <circle cx="${bx + bw - 52}" cy="${zipY + 22}" r="17" fill="none" stroke="#1e293b" stroke-width="7"/>

  <!-- กรอบสกรีนลาย 15×10 ซม. -->
  <rect x="${scx - sw / 2}" y="${scy - sh / 2}" width="${sw}" height="${sh}" rx="10"
    fill="#ecfeff" fill-opacity="0.45" stroke="${OK}" stroke-width="3" stroke-dasharray="10 8"/>
  <image href="${MASCOT.uri}" x="${scx - aw / 2}" y="${scy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  ${dim(scx - sw / 2, scy + sh / 2 - 18, scx + sw / 2, scy + sh / 2 - 18, "15 ซม.", "above")}
  ${dim(scx + sw / 2 - 20, scy - sh / 2, scx + sw / 2 - 20, scy + sh / 2, "10 ซม.")}
  <rect x="${scx - 176}" y="${scy - sh / 2 - 22}" width="352" height="40" rx="20" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${scx}" y="${scy - sh / 2 + 6}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">สกรีนลายไม่เกิน 15 × 10 ซม.</text>

  <!-- ลูกศรวัดตัวซอง -->
  ${dim(bx, by + bh + 34, bx + bw, by + bh + 34, "21 ซม.")}
  ${dim(bx - 36, by, bx - 36, by + bh, "15 ซม.")}

  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายตามสั่งด้วยระบบ UV · เลือกซิปขาวหรือซิปดำได้</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">วัสดุพลาสติกใสอาจมีรอยขนแมวเล็กน้อย ไม่กระทบการใช้งาน</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-15x21-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ขนาดกระเป๋า 21×15 + กรอบสกรีน 15×10`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// 1. กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้หน้ากลุ่มสีซิป
const sizeGroup = { label: SIZE_GROUP, choices: [{ name: SIZE_CHOICE, imageSrc: sizeUrl }] };
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else {
  const atZip = options.findIndex((o) => o.label === ZIP_GROUP);
  options.splice(atZip < 0 ? 0 : atZip, 0, sizeGroup);
}

// 2. ภาพสีซิปจากแกลเลอรี
const zip = options.find((o) => o.label === ZIP_GROUP);
if (!zip) { console.error(`ไม่เจอกลุ่ม "${ZIP_GROUP}"`); process.exit(1); }
const zipUrls = {};
for (const [name, idx] of Object.entries(ZIP_FROM_GALLERY)) {
  const src = data.images?.[idx]?.src;
  const c = zip.choices?.find((c) => c.name === name);
  if (!src || !c) { console.error(`ไม่เจอรูปแกลเลอรี ${idx} หรือตัวเลือก "${name}"`); process.exit(1); }
  c.imageSrc = src;
  zipUrls[name] = src;
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gotSize = back.data.options.find((o) => o.label === SIZE_GROUP)?.choices?.[0];
if (gotSize?.name !== SIZE_CHOICE || gotSize?.imageSrc !== sizeUrl) { console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", gotSize); process.exit(1); }
for (const [name, url] of Object.entries(zipUrls)) {
  const got = back.data.options.find((o) => o.label === ZIP_GROUP)?.choices?.find((c) => c.name === name)?.imageSrc;
  if (got !== url) { console.error("อ่านกลับสีซิปไม่ตรง!", name, got); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) + ภาพสีซิป ${Object.keys(zipUrls).length} ตัว อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
