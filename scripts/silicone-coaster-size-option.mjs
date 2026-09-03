#!/usr/bin/env node
/**
 * Silicone Coaster (silicone-coaster) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบตัวเลือก
 *
 *   node scripts/silicone-coaster-size-option.mjs            (วาดภาพลง .cache/silicone-coaster/upload ดูก่อน)
 *   node scripts/silicone-coaster-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค COASTER (50_ของใช้และของที่ระลึก/แผ่นรองแก้วน้ำ/P-nCoaster-01.jpg):
 * แผ่นซิลิโคนรองแก้วน้ำมี "ขนาดเดียว" ทรงกลม 10×10 ซม. · แผ่นซิลิโคนสีขาว บิดงอได้ ·
 * ผิวลื่น ไม่ดูดซับน้ำ · ไม่มีแผ่นกันลื่น · งานสกรีน UV
 *
 * เพิ่มกลุ่ม "ขนาด" ไว้เป็นกลุ่มแรก — ตัวเลือกเดียว "10×10 ซม. (ทรงกลม)" ไม่บวกราคา
 * พร้อมภาพวาดใหม่ (900×900) แผ่นกลมสีขาว + ลูกศรวัด 10 ซม. สองแกน + มาสคอตแทนลายสกรีน
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "silicone-coaster";
const VER = "v3";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/silicone-coaster/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "10×10 ซม. (ทรงกลม)";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ hologram-bag-size-option) */
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
 * ภาพ "ขนาดแผ่นรองแก้ว" — แผ่นกลมซิลิโคนสีขาววางตรงกลาง สกรีนลาย UV เต็มหน้า
 * มุมล่างขวามีแผ่นเล็กงอขึ้นเล็กน้อย สื่อว่าเนื้อซิลิโคนบิดงอได้
 */
function sizeArt() {
  /** 1 ซม. = 46 px → แผ่นกลม Ø10 ซม. = 460 px วางกลางการ์ดพอดี */
  const CM = 46;
  const R = (10 * CM) / 2;
  const cx = W / 2;
  const cy = 436;
  const r = MASCOT.ratio;
  let ah = R * 1.28;
  let aw = ah * r;
  if (aw > R * 1.5) { aw = R * 1.5; ah = aw / r; }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- เนื้อซิลิโคนขาว มีไฮไลต์นุ่ม ๆ ให้ดูเป็นแผ่นหนามน ๆ -->
    <radialGradient id="sili" cx="0.38" cy="0.32" r="0.95">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.7" stop-color="#f4f6f8"/>
      <stop offset="1" stop-color="#e6eaef"/>
    </radialGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f1f5f9"/>
      <stop offset="1" stop-color="#cbd5e1"/>
    </linearGradient>
    <!-- ลายจุดพาสเทลโทนฟ้า-teal ของแบรนด์ — ใช้เป็น "ลายพิมพ์ UV" บนหน้าแผ่น -->
    <pattern id="dots" width="72" height="72" patternUnits="userSpaceOnUse">
      <circle cx="14" cy="14" r="4.5" fill="#67d1e0"/>
      <circle cx="50" cy="44" r="2.8" fill="#8ad9e6"/>
      <circle cx="30" cy="60" r="1.8" fill="#a5e2ec"/>
    </pattern>
    <radialGradient id="face" cx="0.5" cy="0.42" r="0.85">
      <stop offset="0" stop-color="#f3fdfe"/>
      <stop offset="0.62" stop-color="#e3f7fa"/>
      <stop offset="1" stop-color="#cdeef4"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 10 × 10 ซม. (ทรงกลม)</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">แผ่นซิลิโคนสีขาว บิดงอได้ — ขนาดเดียว</text>

  <!-- เงา + ขอบหนาของแผ่น (แผ่นซิลิโคนมีความหนาเล็กน้อย) -->
  <ellipse cx="${cx}" cy="${cy + R * 0.06 + 14}" rx="${R * 1.02}" ry="${R * 0.98}" fill="#0f172a" opacity="0.07"/>
  <circle cx="${cx}" cy="${cy + 9}" r="${R}" fill="url(#edge)"/>
  <!-- ตัวแผ่น + ลายสกรีน UV เต็มหน้า (พื้นลายจุดพาสเทล + มาสคอตแทนลายลูกค้า) -->
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sili)" stroke="#c8d2dd" stroke-width="3"/>
  <clipPath id="coaster"><circle cx="${cx}" cy="${cy}" r="${R - 3}"/></clipPath>
  <g clip-path="url(#coaster)">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#face)"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#dots)" opacity="0.55"/>
    ${[[cx - R * 0.62, cy - R * 0.5, 12], [cx + R * 0.66, cy - R * 0.28, 9], [cx - R * 0.56, cy + R * 0.52, 9], [cx + R * 0.52, cy + R * 0.58, 12], [cx + R * 0.12, cy - R * 0.78, 8], [cx - R * 0.16, cy + R * 0.82, 8]].map(([x, y, s]) =>
      `<path d="M ${x} ${y - s} Q ${x + 3} ${y - 3} ${x + s} ${y} Q ${x + 3} ${y + 3} ${x} ${y + s} Q ${x - 3} ${y + 3} ${x - s} ${y} Q ${x - 3} ${y - 3} ${x} ${y - s} Z" fill="#5fcfdf" opacity="0.85"/>`).join("")}
  </g>
  <image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  <!-- ไฮไลต์โค้งด้านบน ให้ดูเป็นผิวเรียบลื่น -->
  <path d="M ${cx - R * 0.62} ${cy - R * 0.62} A ${R * 0.88} ${R * 0.88} 0 0 1 ${cx + R * 0.62} ${cy - R * 0.62}"
    fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.55"/>

  <!-- ลูกศรวัดสองแกน -->
  ${dim(cx - R, cy + R + 40, cx + R, cy + R + 40, "10 ซม.")}
  ${dim(cx - R - 42, cy - R, cx - R - 42, cy + R, "10 ซม.")}

  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายตามสั่งด้วยระบบ UV · เนื้อซิลิโคนยืดหยุ่น บิดงอได้ไม่แตกหัก</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ผิวเรียบลื่น ไม่ดูดซับน้ำ · ไม่มีแผ่นกันลื่นด้านหลัง</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-10x10-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — แผ่นกลม 10×10 ซม.`);

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

// กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้เป็นกลุ่มแรก
const sizeGroup = { label: SIZE_GROUP, choices: [{ name: SIZE_CHOICE, imageSrc: sizeUrl }] };
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.splice(0, 0, sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gotSize = back.data.options.find((o) => o.label === SIZE_GROUP)?.choices?.[0];
if (gotSize?.name !== SIZE_CHOICE || gotSize?.imageSrc !== sizeUrl) { console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", gotSize); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) อ่านกลับตรง · savedAt =`, back.data.savedAt);
