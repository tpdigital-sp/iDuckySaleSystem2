#!/usr/bin/env node
/**
 * ผ้ารองจาน (placemat) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบตัวเลือก
 *
 *   node scripts/placemat-size-option.mjs            (วาดภาพลง .cache/placemat/upload ดูก่อน)
 *   node scripts/placemat-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค (40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/18_ผ้าขนหนู…ที่รองจาน…/P-nผ้ารองจาน+พรม-01.jpg):
 * ผ้ารองจาน ผ้าดิบ "ขนาดเดียว" 30×40 ซม. · พิมพ์ซับลิเมชั่นเต็มผืน · เย็บริมขอบ
 *
 * เพิ่มกลุ่ม "ขนาด" ไว้เป็นกลุ่มแรก — ตัวเลือกเดียว "30×40 ซม." ไม่บวกราคา
 * พร้อมภาพวาดใหม่ (900×900) ผืนผ้าดิบแนวนอน + วงจานพิมพ์ + ลูกศรวัดสองแกน + มาสคอตแทนลายสกรีน
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "placemat";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/placemat/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "30×40 ซม.";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ silicone-coaster-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  /* ป้ายแกนตั้งวางคร่อมกลางเส้น (พื้นขาวทับเส้น) — กันตัวเลขตกขอบการ์ดฝั่งซ้าย */
  const lx = vertical ? x1 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/**
 * ภาพ "ขนาดผ้ารองจาน" — ผืนผ้าดิบแนวนอน 40×30 พิมพ์ซับลิเมชั่นเต็มผืน
 * มีวงจาน + ช้อนส้อมจาง ๆ สื่อการใช้งานบนโต๊ะอาหาร ขอบเย็บริมโดยรอบ
 */
function sizeArt() {
  /** 1 ซม. = 16.5 px → ผืน 40×30 ซม. = 660×495 px วางกลางการ์ดพอดี */
  const CM = 16.5;
  const PW = 40 * CM;
  const PH = 30 * CM;
  const cx = W / 2;
  const cy = 440;
  const x0 = cx - PW / 2;
  const y0 = cy - PH / 2;
  /** วงจานพิมพ์บนผืน — ค่อนไปทางขวา เว้นที่ให้มาสคอตฝั่งซ้าย */
  const px = x0 + PW * 0.62;
  const py = cy + PH * 0.04;
  const pr = PH * 0.36;
  const r = MASCOT.ratio;
  let ah = PH * 0.62;
  let aw = ah * r;
  const mx = x0 + PW * 0.22;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- เนื้อผ้าดิบ โทนครีมธรรมชาติ มีไล่แสงนุ่ม ๆ -->
    <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbf7ee"/>
      <stop offset="0.6" stop-color="#f4eddd"/>
      <stop offset="1" stop-color="#ece2cc"/>
    </linearGradient>
    <!-- ลายทอผ้าดิบ — เส้นตารางบางถี่ ๆ -->
    <pattern id="weave" width="9" height="9" patternUnits="userSpaceOnUse">
      <path d="M 0 4.5 H 9" stroke="#d9cdb2" stroke-width="1" opacity="0.5"/>
      <path d="M 4.5 0 V 9" stroke="#d9cdb2" stroke-width="1" opacity="0.35"/>
    </pattern>
    <!-- ลายพิมพ์ซับโทนฟ้า-teal ของแบรนด์ บนผืน -->
    <pattern id="dots" width="76" height="76" patternUnits="userSpaceOnUse">
      <circle cx="16" cy="16" r="4.5" fill="#67d1e0" opacity="0.75"/>
      <circle cx="54" cy="46" r="2.8" fill="#8ad9e6" opacity="0.7"/>
      <circle cx="32" cy="64" r="1.8" fill="#a5e2ec" opacity="0.7"/>
    </pattern>
    <radialGradient id="plate" cx="0.42" cy="0.36" r="0.9">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.75" stop-color="#f6fbfd"/>
      <stop offset="1" stop-color="#e3eef4"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 30 × 40 ซม.</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ผ้าดิบ พิมพ์ซับลิเมชั่นเต็มผืน — ขนาดเดียว</text>

  <!-- เงาผืนผ้า -->
  <rect x="${x0 + 8}" y="${y0 + 16}" width="${PW}" height="${PH}" rx="10" fill="#0f172a" opacity="0.07"/>
  <!-- ตัวผืนผ้าดิบ + ลายทอ -->
  <rect x="${x0}" y="${y0}" width="${PW}" height="${PH}" rx="10" fill="url(#cloth)" stroke="#d3c6a8" stroke-width="3"/>
  <clipPath id="mat"><rect x="${x0 + 3}" y="${y0 + 3}" width="${PW - 6}" height="${PH - 6}" rx="8"/></clipPath>
  <g clip-path="url(#mat)">
    <rect x="${x0}" y="${y0}" width="${PW}" height="${PH}" fill="url(#weave)"/>
    <rect x="${x0}" y="${y0}" width="${PW}" height="${PH}" fill="url(#dots)"/>
    <!-- แถบตารางหมากรุกมุมซ้ายล่าง อ้างอิงลายตัวอย่างงานจริง -->
    ${[0, 1, 2, 3].map((i) => `<rect x="${x0 + i * 34}" y="${y0 + PH - 34 - (i % 2) * 34}" width="34" height="34" fill="#7fd6e3" opacity="0.5"/>`).join("")}
  </g>
  <!-- เส้นเย็บริมรอบผืน -->
  <rect x="${x0 + 14}" y="${y0 + 14}" width="${PW - 28}" height="${PH - 28}" rx="6" fill="none"
    stroke="#b9a97f" stroke-width="2.5" stroke-dasharray="10 7"/>

  <!-- วงจานบนผืน สื่อการใช้งาน -->
  <circle cx="${px}" cy="${py + 6}" r="${pr}" fill="#0f172a" opacity="0.05"/>
  <circle cx="${px}" cy="${py}" r="${pr}" fill="url(#plate)" stroke="#cfe3ec" stroke-width="3"/>
  <circle cx="${px}" cy="${py}" r="${pr * 0.68}" fill="none" stroke="#9fc9da" stroke-width="2.5" opacity="0.8"/>
  <!-- ช้อนจาง ๆ ขวาจาน (ฝั่งซ้ายเว้นให้มาสคอต) -->
  <g stroke="#a8bfcb" stroke-width="5" stroke-linecap="round" opacity="0.85" fill="none">
    <line x1="${px + pr + 26}" y1="${py - pr * 0.3}" x2="${px + pr + 26}" y2="${py + pr * 0.6}"/>
    <ellipse cx="${px + pr + 26}" cy="${py - pr * 0.42}" rx="9" ry="15" fill="#a8bfcb" stroke="none"/>
  </g>

  <!-- มาสคอตแทนลายสกรีนของลูกค้า ฝั่งซ้ายของผืน -->
  <image href="${MASCOT.uri}" x="${mx - aw / 2}" y="${cy - ah / 2 + PH * 0.05}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>

  <!-- ลูกศรวัดสองแกน -->
  ${dim(x0, y0 + PH + 42, x0 + PW, y0 + PH + 42, "40 ซม.")}
  ${dim(x0 - 42, y0, x0 - 42, y0 + PH, "30 ซม.")}

  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายตามสั่งระบบซับลิเมชั่น สีสดคมชัด ซักได้</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">เนื้อผ้าดิบเย็บริมขอบโดยรอบ · ไม่มีขั้นต่ำ</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-30x40-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ผืนผ้าดิบ 30×40 ซม.`);

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
