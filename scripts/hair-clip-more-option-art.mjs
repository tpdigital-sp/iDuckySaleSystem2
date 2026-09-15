#!/usr/bin/env node
/**
 * 🖼 ภาพประกอบ 3 ตัวเลือกใหม่ของ **กิ๊บติดผมอะคริลิค** (otheracrylicproducts5-1)
 * ที่ scripts/hair-clip-custom-size.mjs เพิ่มเข้า DB ไว้ (15 ก.ย. 69) — รันสคริปต์นั้นก่อน
 *
 *   node scripts/hair-clip-more-option-art.mjs           วาดลง .cache/hair-clip/upload อย่างเดียว
 *   node scripts/hair-clip-more-option-art.mjs --write   + อัปโหลด storage + เขียน DB + อ่านกลับเทียบ
 *
 * ภาษาภาพต่อจาก 2 สคริปต์เดิม (hair-clip-option-art / hair-clip-size-option-art) เพื่อให้อยู่ชุดเดียวกัน:
 *   • กลุ่ม "ติดกิ๊บ" = เป็ด iDucky ใส่กิ๊บ + ป้ายฝั่งวงรีสีฟ้า  → ใบใหม่ใช้จุดไข่ปลา 3 ตำแหน่ง + "?" + การ์ดรูปที่แนบมา
 *   • กลุ่ม "ขนาด"   = กิ๊บโลหะคงที่ + ชิ้นอะคริลิค + ไม้บรรทัด 0-6 ซม. สเกลเดียวกันทุกใบ
 *       - กำหนดขนาดเอง = ชิ้นงานยืดออกเป็นเส้นประ + ช่องกรอก "?" + ไม้บรรทัดไม่ไฮไลต์
 *       - ตามไฟล์      = แผ่นไฟล์ลาย + ลูกศรไป "กราฟฟิกวัดให้"
 * ⚠️ กล่องรูปเป็นจัตุรัส (80px การ์ด / 40px เมนูเลื่อน) — ไฟล์ 900×900 ย่อทั้งใบ ไม่ถูกครอป
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่
 * ⚠️ ห้ามเปลี่ยนชื่อกลุ่ม/ชื่อตัวเลือก (ผูกกับ sizeInput · showWhen · กติกาคิดราคา)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "otheracrylicproducts5-1";
const VER = "v1";
const OUT = ".cache/hair-clip/upload";
mkdirSync(OUT, { recursive: true });

const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const BY_FILE = "📄 ขนาดอื่น / ตามไฟล์ (กราฟฟิกวัดให้ตอนทำแบบ)";
const OTHER_SIDE = "ด้านอื่นๆ (แนบภาพประกอบ)";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const GOLD = "#e6bb6a";
const GOLD_DK = "#b98c39";
const GOLD_LT = "#f7e2b4";

const MASCOT = await mascotDataUri("hello", 420);

const frame = (body, tint = "#ffffff") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="${tint}" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;
const jpg = (svg) => sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

const files = [];
const push = (group, choice, name, buf, desc) => {
  const file = `${name}-${VER}.jpg`;
  const path = `${OUT}/${file}`;
  writeFileSync(path, buf);
  files.push({ group, choice, file, path, desc });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${group} / ${choice}`);
};

// ── ชิ้นส่วนร่วมของกลุ่ม "ขนาด" (สเกลเดียวกับ hair-clip-size-option-art.mjs) ──
const CM = 138;        // 1 ซม. = 138 px
const CLIP_CM = 5.5;   // ตัวกิ๊บโลหะ — คงที่ทุกใบ ใช้เป็นหลักเทียบขนาด
const CX = 450;
const BASE = 452;      // ก้นชิ้นอะคริลิค = สันบนของกิ๊บ

const metalClip = () => {
  const len = CLIP_CM * CM;
  const x0 = CX - len / 2;
  const x1 = CX + len / 2;
  const upTop = BASE;
  const upBot = BASE + 30;
  const loTop = BASE + 34;
  const loBot = BASE + 62;
  let teeth = "";
  for (let x = x0 + 16; x < x0 + len * 0.72; x += 22)
    teeth += `<path d="M ${x} ${loBot - 1} l 11 -12 l 11 12 Z" fill="${GOLD_DK}" opacity="0.5"/>`;
  return `
    <path d="M ${x0 + 14} ${loTop} L ${x1 - 26} ${loTop} Q ${x1} ${(loTop + loBot) / 2} ${x1 - 26} ${loBot}
             L ${x0 + 14} ${loBot} Q ${x0 - 2} ${(loTop + loBot) / 2} ${x0 + 14} ${loTop} Z"
      fill="${GOLD}" stroke="${GOLD_DK}" stroke-width="3"/>
    ${teeth}
    <path d="M ${x0 + 10} ${upTop} L ${x1 - 30} ${upTop} Q ${x1 + 4} ${(upTop + upBot) / 2} ${x1 - 30} ${upBot}
             L ${x0 + 10} ${upBot} Q ${x0 - 6} ${(upTop + upBot) / 2} ${x0 + 10} ${upTop} Z"
      fill="${GOLD_LT}" stroke="${GOLD_DK}" stroke-width="3"/>
    <line x1="${x0 + 26}" y1="${upTop + 11}" x2="${x1 - 62}" y2="${upTop + 11}" stroke="#ffffff" stroke-width="8"
      stroke-linecap="round" opacity="0.8"/>
    <circle cx="${x1 - 96}" cy="${upBot + 2}" r="12" fill="${GOLD}" stroke="${GOLD_DK}" stroke-width="3"/>
    <circle cx="${x1 - 96}" cy="${upBot + 2}" r="4" fill="${GOLD_DK}"/>`;
};

/** หัวลายกลม (ลายเป็ดในวงกลม) — ใช้เป็นหัวของชิ้นอะคริลิคและรูปย่อในการ์ดไฟล์ */
const artHead = (cx, cy, r, id) => `
  <clipPath id="ah${id}"><circle cx="${cx}" cy="${cy}" r="${r - 2}"/></clipPath>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#5aa9c4" stroke-width="4"/>
  <image href="${MASCOT.uri}" x="${cx - r * 0.86}" y="${cy - r * 0.86}" width="${r * 1.72}" height="${r * 1.72}"
    preserveAspectRatio="xMidYMid meet" clip-path="url(#ah${id})"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#5aa9c4" stroke-width="4"/>`;

/**
 * ชิ้นอะคริลิค: หัวลายกลม + แถบทึบยาว solidCm แล้วต่อด้วยแถบ "เส้นประ" อีก dashCm
 * (เส้นประ = ความยาวที่ลูกค้าเป็นคนบอก / กราฟฟิกเป็นคนวัด)
 */
const acrylic = (solidCm, dashCm, id) => {
  const headD = Math.min(solidCm * CM * 0.6, 2.0 * CM);
  const r = headD / 2;
  const x0 = CX - ((solidCm + dashCm) * CM) / 2;
  const cy = BASE - r;
  const sh = headD * 0.58;
  const sx = x0 + headD * 0.34;
  const xs = x0 + solidCm * CM;             // ปลายส่วนทึบ
  const xe = x0 + (solidCm + dashCm) * CM;  // ปลายส่วนเส้นประ
  return `
    <g>
      <rect x="${sx}" y="${cy - sh / 2}" width="${xs - sx}" height="${sh}" rx="${sh * 0.3}"
        fill="#bfe6f4" stroke="#5aa9c4" stroke-width="4"/>
      ${dashCm > 0 ? `<rect x="${xs - 6}" y="${cy - sh / 2}" width="${xe - xs + 6}" height="${sh}" rx="${sh * 0.3}"
        fill="#e0f4fb" stroke="${OK}" stroke-width="4" stroke-dasharray="16 12"/>` : ""}
      ${artHead(x0 + r, cy, r, id)}
      <path d="M ${x0 + headD * 0.9} ${cy + sh * 0.14} q ${sh * 0.3} ${-sh * 0.3} ${sh * 0.6} 0"
        fill="none" stroke="#7fc6de" stroke-width="5" stroke-linecap="round"/>
    </g>`;
};

/** ไม้บรรทัด 0-6 ซม. สเกลเดียวกับชิ้นงาน (selCm = null → ไม่ไฮไลต์ช่วงไหน) */
const ruler = (y, selCm) => {
  const x0 = CX - (6 * CM) / 2;
  let ticks = "";
  for (let mm = 0; mm <= 60; mm++) {
    const x = x0 + (mm / 10) * CM;
    const big = mm % 10 === 0;
    const mid = mm % 5 === 0;
    ticks += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + (big ? 26 : mid ? 18 : 10)}" stroke="${big ? INK : "#94a3b8"}" stroke-width="${big ? 3 : 1.5}"/>`;
    if (big) ticks += `<text x="${x}" y="${y + 54}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${mm / 10}</text>`;
  }
  return `
    ${selCm ? `<rect x="${x0}" y="${y - 14}" width="${selCm * CM}" height="14" rx="5" fill="${OK}" opacity="0.28"/>` : ""}
    <line x1="${x0}" y1="${y}" x2="${x0 + 6 * CM}" y2="${y}" stroke="${INK}" stroke-width="3"/>
    ${ticks}`;
};

// ── 1. ขนาด / 📐 กำหนดขนาดเอง ───────────────────────────────────────
// ไม่มีไม้บรรทัด/เลขกำกับเหมือน 5 ใบมาตรฐาน — ช่องกรอก "?" ตัวโตคือจุดที่อ่านออกตั้งแต่ย่อ 40px
{
  const bw = 400;
  const bh = 126;
  const bx = CX - bw / 2;
  const by = 148;
  const BASE_C = 648;                       // กิ๊บวางต่ำกว่าใบมาตรฐาน เพราะเอาที่ว่างด้านบนให้ช่องกรอก
  const solid = 3, dash = 2.4;
  const headD = Math.min(solid * CM * 0.6, 2.0 * CM);
  const topY = BASE_C - headD;              // ยอดชิ้นงาน — ลูกศรวัดอยู่เหนือขึ้นไป
  const armX = ((solid + dash) * CM) / 2;
  const svg = frame(`
    <text x="${CX}" y="88" font-family="${TH}" font-size="42" font-weight="800" text-anchor="middle" fill="${INK}">กำหนดขนาดเอง</text>
    <!-- ช่องกรอกด้านที่ยาวที่สุด -->
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="26" fill="#ffffff" stroke="${OK}" stroke-width="6"/>
    <text x="${CX - 62}" y="${by + 92}" font-family="${TH}" font-size="76" font-weight="800" text-anchor="middle" fill="${OK}">?</text>
    <line x1="${CX - 6}" y1="${by + 32}" x2="${CX - 6}" y2="${by + 98}" stroke="${OK}" stroke-width="5"/>
    <text x="${CX + 96}" y="${by + 88}" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${SUB}">ซม.</text>
    <text x="${CX}" y="${by + bh + 44}" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${SUB}">กรอกด้านที่ยาวที่สุดที่ต้องการ</text>
    <!-- ลูกศรวัด (ปลายขวาเป็นเส้นประ = ยาวเท่าไหร่ก็ได้) -->
    <line x1="${CX - armX}" y1="${topY - 34}" x2="${CX + armX}" y2="${topY - 34}" stroke="${OK}" stroke-width="4" stroke-dasharray="16 11"/>
    <path d="M ${CX - armX} ${topY - 34} l 26 -14 l 0 28 Z" fill="${OK}"/>
    <path d="M ${CX + armX} ${topY - 34} l -26 -14 l 0 28 Z" fill="${OK}"/>
    <g transform="translate(0 ${BASE_C - BASE})">
      ${metalClip()}
      ${acrylic(solid, dash, "cus")}
    </g>
    <text x="${CX}" y="${H - 52}" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">ถึง 6 ซม. ราคาปกติ · เกินคิดเพิ่ม ซม.ละ ฿10 · เกิน 11 ซม. แอดมินตีราคา</text>`);
  push("ขนาด", CUSTOM, "size-custom", await jpg(svg), "กรอกขนาดเอง · เกิน 6 ซม. คิดเพิ่ม ซม.ละ ฿10");
}

// ── 2. ขนาด / 📄 ขนาดอื่น / ตามไฟล์ ─────────────────────────────────
// จุดที่อ่านออกตอนย่อ: แผ่นไฟล์ลายมุมพับ + ป้ายฟ้า "กราฟฟิกวัดให้" (ใบอื่นไม่มีแผ่นกระดาษ)
{
  const fw = 236;
  const fh = 236;
  const fx = CX - fw / 2;
  const fy = 122;
  const fold = 58;
  const BASE_F = 700;
  const solid = 2.6, dash = 1.6;
  const svg = frame(`
    <text x="${CX}" y="80" font-family="${TH}" font-size="42" font-weight="800" text-anchor="middle" fill="${INK}">ขนาดตามไฟล์</text>
    <!-- ไฟล์ลายที่ลูกค้าส่งมา -->
    <g transform="rotate(-5 ${CX} ${fy + fh / 2})">
      <path d="M ${fx} ${fy + 18} q 0 -18 18 -18 L ${fx + fw - fold} ${fy} L ${fx + fw} ${fy + fold}
               L ${fx + fw} ${fy + fh - 18} q 0 18 -18 18 L ${fx + 18} ${fy + fh} q -18 0 -18 -18 Z"
        fill="#ffffff" stroke="#94a3b8" stroke-width="4"/>
      <path d="M ${fx + fw - fold} ${fy} L ${fx + fw - fold} ${fy + fold} L ${fx + fw} ${fy + fold}"
        fill="#e2e8f0" stroke="#94a3b8" stroke-width="4" stroke-linejoin="round"/>
      ${artHead(CX - 6, fy + 112, 60, "file")}
      <text x="${CX}" y="${fy + 220}" font-family="${TH}" font-size="28" font-weight="800" text-anchor="middle" fill="${SUB}">ไฟล์ลาย</text>
    </g>
    <!-- ป้าย + ลูกศรลงมาที่ชิ้นงาน -->
    <rect x="${CX - 172}" y="392" width="344" height="68" rx="34" fill="${OK}"/>
    <text x="${CX}" y="438" font-family="${TH}" font-size="34" font-weight="800" text-anchor="middle" fill="#ffffff">กราฟฟิกวัดให้</text>
    <path d="M ${CX} 470 l 0 20" stroke="${OK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${CX} 512 l -15 -26 l 30 0 Z" fill="${OK}"/>
    <g transform="translate(0 ${BASE_F - BASE})">
      ${metalClip()}
      ${acrylic(solid, dash, "byf")}
    </g>
    <text x="${CX}" y="${H - 52}" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">ไม่ต้องวัดเอง · แจ้งขนาดจริงตอนส่งแบบให้ตรวจ</text>`);
  push("ขนาด", BY_FILE, "size-by-file", await jpg(svg), "กราฟฟิกวัดจากไฟล์ลายให้");
}

// ── 3. ติดกิ๊บ / ด้านอื่นๆ (แนบภาพประกอบ) ───────────────────────────
// ใบซ้าย/ขวา = กิ๊บติดฝั่งเดียว + ป้าย "ซ้าย"/"ขวา" · ใบนี้ = กิ๊บอยู่ตำแหน่งอื่น + วงไข่ปลา "?" ที่ฝั่งมาตรฐาน
{
  const DUCK = await mascotDataUri("heart", 760);
  const DUCK_S = 620;
  const DUCK_X = (W - DUCK_S) / 2;
  const DUCK_Y = 208;
  const HEAD_CX = 505;  // กลางหัวเป็ดวัดจากภาพจริง (ดู hair-clip-option-art.mjs)
  const HEAD_CY = 302;
  const CLIP_LEN = 180;
  /** ชิ้นงานติดกิ๊บ 1 อัน (scale = ย่อลงสำหรับรูปในการ์ดที่แนบมา) */
  const wornClip = (cx, cy, deg, id, scale = 1) => {
    const len = CLIP_LEN;
    const h = len / 3;
    const r = h / 2;
    const sh = h * 0.58;
    return `<g transform="translate(${cx} ${cy}) rotate(${deg}) scale(${scale})">
      <rect x="${-len / 2 + 8}" y="${sh / 2 - 2}" width="${len - 26}" height="${h * 0.32}" rx="${h * 0.16}"
        fill="${GOLD}" stroke="${GOLD_DK}" stroke-width="2.5"/>
      <rect x="${-len / 2 + r * 0.7}" y="${-sh / 2}" width="${len - r * 0.7}" height="${sh}" rx="${sh * 0.32}"
        fill="#bfe6f4" stroke="#5aa9c4" stroke-width="3.5"/>
      ${artHead(-len / 2 + r, 0, r, id)}
    </g>`;
  };
  /** ฝั่งมาตรฐาน (ซ้าย/ขวา) วาดเป็นวงไข่ปลา + "?" = ตำแหน่งไหนก็ขอได้ */
  const spot = (cx, cy, rx) => `
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.6}" fill="#ffffff" opacity="0.8"
      stroke="${OK}" stroke-width="5" stroke-dasharray="16 12"/>
    <text x="${cx}" y="${cy + 17}" font-family="${TH}" font-size="48" font-weight="800" text-anchor="middle" fill="${OK}">?</text>`;
  const svg = frame(`
    <text x="${W / 2}" y="92" font-family="${TH}" font-size="44" font-weight="800" text-anchor="middle" fill="${INK}">ติดกิ๊บด้านอื่นๆ</text>
    <ellipse cx="${W / 2}" cy="${H - 118}" rx="248" ry="34" fill="#e2e8f0" opacity="0.75"/>
    <image href="${DUCK.uri}" x="${DUCK_X}" y="${DUCK_Y}" width="${DUCK_S}" height="${DUCK_S}" preserveAspectRatio="xMidYMid meet"/>
    ${spot(HEAD_CX - 128, HEAD_CY + 16, 70)}
    ${spot(HEAD_CX + 132, HEAD_CY + 16, 70)}
    ${wornClip(HEAD_CX - 14, HEAD_CY - 78, -16, "other")}
    <!-- ป้าย "อื่นๆ" ตำแหน่งเดียวกับป้าย ซ้าย/ขวา ของสองใบแรก -->
    <rect x="${W / 2 - 420}" y="170" width="208" height="80" rx="40" fill="${OK}"/>
    <text x="${W / 2 - 316}" y="227" font-family="${TH}" font-size="48" font-weight="800" text-anchor="middle" fill="#ffffff">อื่นๆ</text>
    <!-- การ์ดรูปที่ลูกค้าแนบมาบอกตำแหน่ง -->
    <g transform="rotate(7 742 700)">
      <rect x="642" y="596" width="200" height="208" rx="18" fill="#ffffff" stroke="#94a3b8" stroke-width="4"/>
      <rect x="662" y="616" width="160" height="120" rx="10" fill="#e0f4fb" stroke="#5aa9c4" stroke-width="3"/>
      ${wornClip(742, 676, -20, "shot", 0.52)}
      <text x="742" y="780" font-family="${TH}" font-size="27" font-weight="800" text-anchor="middle" fill="${SUB}">แนบภาพ</text>
    </g>
    <text x="${W / 2}" y="${H - 46}" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">อยากให้ติดตรงไหน แนบภาพประกอบมาได้เลย</text>`);
  push("ติดกิ๊บ", OTHER_SIDE, "side-other", await jpg(svg), "ตำแหน่งอื่นตามต้องการ · แนบภาพประกอบมาพร้อมไฟล์ลาย");
}

// ── ตรวจ "ย่อแล้วยังแยกออกไหม" — 80px (การ์ด) และ 40px (เมนูเลื่อน) ──
for (const px of [80, 40]) {
  const strip = `${OUT}/_thumbs-${px}-c.png`;
  writeFileSync(strip, await sharp({ create: { width: px * files.length, height: px, channels: 3, background: "#fff" } })
    .composite(await Promise.all(files.map(async (f, i) => ({ input: await sharp(f.path).resize(px, px).toBuffer(), left: i * px, top: 0 }))))
    .png().toBuffer());
  console.log("🔍", strip);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด + เขียน DB ──────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (...m) => { console.error("✗", ...m); process.exit(1); };

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images")
    .upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) die("อัปโหลดพัง", key, error.message);
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}
if (files.some((f) => typeof f.url !== "string" || !f.url.startsWith("https://"))) die("มีใบที่ยังไม่ได้ url");

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die(readErr.message);
const data = row.data;
for (const f of files) {
  const grp = (data.options ?? []).find((o) => o.label === f.group);
  if (!grp) die(`ไม่เจอกลุ่ม "${f.group}"`);
  const c = grp.choices?.find((c) => c.name === f.choice);
  if (!c) die(`ไม่เจอตัวเลือก "${f.choice}" — รัน scripts/hair-clip-custom-size.mjs ก่อน`);
  c.imageSrc = f.url;
  c.desc = f.desc;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr?.message);

// ── อ่านกลับเทียบ ───────────────────────────────────────────────────
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (backErr) die(backErr.message);
for (const f of files) {
  const c = back.data.options.find((o) => o.label === f.group)?.choices.find((c) => c.name === f.choice);
  if (c?.imageSrc !== f.url) die("imageSrc อ่านกลับไม่ตรง", f.group, f.choice, c?.imageSrc);
  if (c.desc !== f.desc) die("desc อ่านกลับไม่ตรง", f.group, f.choice, c?.desc);
}
// ของเดิมต้องไม่หลุดไปกับการเขียนรอบนี้
const size = back.data.options.find((o) => o.label === "ขนาด");
if (size?.sizeInput?.choice !== CUSTOM) die("sizeInput หลุด");
if (size.choices.some((c) => !c.imageSrc)) die("มีตัวเลือกขนาดที่ไม่มีภาพ");
if (back.data.options.find((o) => o.label === "ติดกิ๊บ")?.choices.some((c) => !c.imageSrc)) die("มีตัวเลือกติดกิ๊บที่ไม่มีภาพ");
if (!back.data.options.some((o) => o.label === "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)")) die("ช่องกรอกหาย");
console.log(`✓ ตั้งภาพครบ ${files.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
