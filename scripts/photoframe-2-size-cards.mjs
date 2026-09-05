#!/usr/bin/env node
/**
 * กรอบรูปอะคริลิคขาตั้ง (/products/กรอบรูปอะคริลิคขาตั้ง · id photoframe-2)
 * — เพิ่มกลุ่ม "ขนาด (ด้านยาวสุด)" เป็นการ์ด 11 ใบ 15–25 ซม. + วาดภาพประกอบทุกใบ
 *
 *   node scripts/photoframe-2-size-cards.mjs           (วาดภาพลง .cache/photoframe-2/upload ดูก่อน)
 *   node scripts/photoframe-2-size-cards.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: กลุ่ม "เริ่มที่ 15 cm เพิ่มขนาด" เป็นสเต็ปเปอร์ 2 ตัว
 *   "แผ่นหน้า เซนละ" (+10 · qtyMax 10) กับ "แผ่นประกบด้านหลัง เซนละ" (+5 · qtyMax 10)
 * ของใหม่:
 *   1. กลุ่ม "ขนาด (ด้านยาวสุด)" display "cards" 15/16/…/25 ซม. — extra ต่อใบ = (ซม.-15)×10
 *      เลขเดียวกับสเต็ปเปอร์แผ่นหน้าเดิมเป๊ะ แต่ลูกค้าเห็นเป็นขนาดจริง ไม่ต้องบวกเลขเอง
 *   2. ค่าแผ่นประกบด้านหลังใหญ่ขึ้น ซม.ละ 5 ย้ายไปเป็น sizeFee บนตัวเลือก
 *      "แผ่นประกบด้านหลัง (หนา 1mm)(ไม่สกรีน)" ใน "Add on" — อ่านขนาดจากกลุ่มการ์ดเอง
 *      (num() ตัดเหลือตัวเลข "18 ซม." → 18) คิดเฉพาะตอนติ๊กแผ่นประกบ ตามขนาดที่เลือกจริง
 *   3. กลุ่มสเต็ปเปอร์เดิมถูกตัดทิ้ง — เก็บไว้จะบวกค่าขยายขนาดซ้ำสองที่
 *
 * ภาพ 900×900 สิบเอ็ดใบ **สเกลจริงเดียวกันทุกใบ (1 ซม. = 19 px)** สไตล์เรนเดอร์สตูดิโอ
 * ที่ผู้ใช้เคาะไว้กับ photo-fram-acrylic (พื้นครีม · แผ่นหนามีสัน · เงาพื้น · ผิวเงาทแยง)
 * = กรอบใสมุมโค้งพิมพ์ลายขอบ + การ์ดรูปยึดน๊อตหมุด + ขาตั้งโผล่ข้างหลัง + ไม้บรรทัด 0–25 ซม.
 * ⚠️ การ์ด 11 ใบ = โหมดกระชับ (ไม่โชว์ desc · รูป 48px) จึงเบิร์นตัวเลขขนาด/ค่าเพิ่มไว้ในภาพ
 * ⚠️ ตัว ฿ ใน SVG เรนเดอร์ทับตัวหน้า — ในภาพเขียน "+NN บาท" แทน
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ขยับ VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "photoframe-2";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/photoframe-2/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด (ด้านยาวสุด)";
const OLD_GROUP = "เริ่มที่ 15 cm เพิ่มขนาด";   // กลุ่มสเต็ปเปอร์เดิมที่กลุ่มใหม่มาแทน
const ADDON_GROUP = "Add on";
const BACK_PLATE = "แผ่นประกบด้านหลัง (หนา 1mm)(ไม่สกรีน)";
const SECTION = "1. ของเสริม + ขนาด";
const BASE_CM = 15;      // ขนาดมาตรฐาน รวมในราคาแล้ว
const MAX_CM = 25;       // สเต็ปเปอร์เดิม qtyMax 10 → 15+10
const RATE_FRONT = 10;   // ฿/ซม. แผ่นหน้า
const RATE_BACK = 5;     // ฿/ซม. แผ่นประกบด้านหลัง (คิดผ่าน sizeFee)
const STEPS = Array.from({ length: MAX_CM - BASE_CM + 1 }, (_, i) => BASE_CM + i);

const MASCOT = await mascotDataUri("heart", 640);

const W = 900;
const H = 900;
const CM = 19;           // สเกลจริง — ทุกใบเท่ากัน (25 ซม. = 475 px)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#3f3a35";
const SUB = "#9a9187";
const OK = "#0891b2";
const HL = "#f59e0b";

let uid = 0;
let defsExtra = "";

/** พื้นหลังสตูดิโอครีม + ฟิลเตอร์เงา — ชุดเดียวกับ photo-frame-acrylic-art.mjs */
const BG = `
  <radialGradient id="bg" cx="50%" cy="40%" r="75%">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="62%" stop-color="#f7f4ef"/>
    <stop offset="100%" stop-color="#ebe5dc"/>
  </radialGradient>
  <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="soft2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#2a2018" flood-opacity="0.26"/>
  </filter>
  <radialGradient id="steel" cx="34%" cy="30%" r="78%">
    <stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#d7dee5"/><stop offset="100%" stop-color="#8d99a6"/>
  </radialGradient>`;

/**
 * กรอบรูปอะคริลิคขาตั้ง 1 ชิ้น มองด้านหน้า — แผ่นจัตุรัสมุมโค้งใส พิมพ์ลายขอบ
 * การ์ดรูปตรงกลางยึดน๊อตหมุด 2 ตัว + ขาตั้งอะคริลิคโผล่ด้านหลังฝั่งขวา
 * size = ด้านยาวสุด (px) · bottom = พิกัดขอบล่างของแผ่น
 */
function frame(cx, bottom, size) {
  const s = size;                 // แผ่นจัตุรัส (ของจริงหน้ากรอบสี่เหลี่ยมจัตุรัสมุมโค้ง)
  const x = cx - s / 2;
  const top = bottom - s;
  const r = s * 0.09;
  const depth = Math.max(6, s * 0.022);   // สันหนา ~3 มม.
  const id = `f${uid++}`;

  // การ์ดรูปตรงกลาง (ขอบขาวแบบโพลารอยด์)
  const cw = s * 0.56;
  const ch = cw * 1.06;
  const cxi = cx - cw / 2;
  const cyi = top + s * 0.16;

  // ขาตั้ง: แผ่นขาอะคริลิคเอียง — ต้องโผล่พ้นขอบขวาของกรอบให้เห็นชัด (จุดเด่นของสินค้า)
  // ⚠️ rotate ค่าบวกของ SVG = ปลายล่างกวาดไปทางซ้าย (ซ่อนหลังแผ่นพอดี) — ต้องใช้ค่าลบ
  const legW = s * 0.13;
  const legLen = s * 0.74;
  const legTilt = -26;
  const legX = x + s * 0.84;
  const legY = bottom - s * 0.72;

  defsExtra += `
    <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${x}" y1="${top}" x2="${x + s}" y2="${bottom}">
      <stop offset="0%" stop-color="#e3f1fa"/><stop offset="100%" stop-color="#c3ddf0"/>
    </linearGradient>
    <clipPath id="${id}cp"><rect x="${x}" y="${top}" width="${s}" height="${s}" rx="${r}"/></clipPath>`;

  // ลายพิมพ์ขอบ (มุมพาสเทลสไตล์งานจริง) — วาดในคลิปของแผ่น
  const deco = `
    <g clip-path="url(#${id}cp)">
      <circle cx="${x + s * 0.06}" cy="${top + s * 0.08}" r="${s * 0.16}" fill="#f9a8c5" opacity="0.85"/>
      <circle cx="${x + s * 0.97}" cy="${top + s * 0.12}" r="${s * 0.13}" fill="#fbc9db" opacity="0.8"/>
      <circle cx="${x + s * 0.05}" cy="${bottom - s * 0.1}" r="${s * 0.14}" fill="#fdd9e5" opacity="0.85"/>
      <circle cx="${x + s * 0.94}" cy="${bottom - s * 0.07}" r="${s * 0.15}" fill="#f792b8" opacity="0.85"/>
      <path d="M${x + s * 0.13} ${bottom - s * 0.16} q${s * 0.03} -${s * 0.05} ${s * 0.06} 0 q${s * 0.03} ${s * 0.05} -${s * 0.03} ${s * 0.08} q-${s * 0.06} -${s * 0.03} -${s * 0.03} -${s * 0.08} z" fill="#ef5d8f"/>
      <circle cx="${x + s * 0.88}" cy="${top + s * 0.05}" r="${s * 0.035}" fill="#fde68a"/>
    </g>`;

  return `<g>
    <!-- เงาตกกระทบพื้น -->
    <ellipse cx="${cx + 6}" cy="${bottom + depth + 12}" rx="${s * 0.56}" ry="${s * 0.06 + 8}" fill="#8a7c6c" opacity="0.32" filter="url(#soft)"/>
    <!-- ขาตั้งด้านหลัง (เห็นส่วนที่พ้นตัวแผ่นฝั่งขวา) -->
    <g transform="rotate(${legTilt} ${legX} ${legY})">
      <rect x="${legX}" y="${legY}" width="${legW}" height="${legLen}" rx="${legW * 0.3}" fill="#a5c3d8"/>
      <rect x="${legX + legW * 0.18}" y="${legY + 4}" width="${legW * 0.28}" height="${legLen * 0.9}" rx="${legW * 0.14}" fill="#ffffff" opacity="0.55"/>
    </g>
    <!-- สันหนาของแผ่น -->
    <rect x="${x}" y="${top + depth}" width="${s}" height="${s}" rx="${r}" fill="#8fb9d6"/>
    <!-- ตัวเนื้อใส -->
    <rect x="${x}" y="${top}" width="${s}" height="${s}" rx="${r}" fill="url(#${id}g)" opacity="0.85"/>
    ${deco}
    <!-- การ์ดรูปที่สอดไว้ -->
    <rect x="${cxi}" y="${cyi}" width="${cw}" height="${ch}" rx="${s * 0.02}" fill="#ffffff" filter="url(#cardShadow)"/>
    <image href="${MASCOT.uri}" x="${cxi + cw * 0.1}" y="${cyi + ch * 0.06}" width="${cw * 0.8}" height="${ch * 0.68}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${cxi + cw * 0.08}" y="${cyi + ch * 0.8}" width="${cw * 0.5}" height="${ch * 0.06}" rx="${ch * 0.03}" fill="#e2e8f0"/>
    <!-- น๊อตหมุดยึดการ์ด 2 ตัว -->
    <circle cx="${cxi + cw * 0.1}" cy="${cyi + ch + s * 0.06}" r="${Math.max(6, s * 0.026)}" fill="url(#steel)"/>
    <circle cx="${cxi + cw * 0.9}" cy="${cyi + ch + s * 0.06}" r="${Math.max(6, s * 0.026)}" fill="url(#steel)"/>
    <!-- ผิวเงาสะท้อนแสงทแยง -->
    <g clip-path="url(#${id}cp)" filter="url(#soft2)">
      <path d="M${x - s * 0.1} ${bottom - s * 0.1} L${x + s * 0.68} ${top - s * 0.08} l${s * 0.2} 0 L${x + s * 0.1} ${bottom + s * 0.06} Z" fill="#ffffff" opacity="0.28"/>
    </g>
  </g>`;
}

/** ลูกศรวัดขนาดแนวตั้ง "ฝั่งซ้าย" ของแผ่น (ฝั่งขวามีขาตั้งโผล่ เดี๋ยวทับกัน) */
const dimV = (x, y1, y2, label) => `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x - 9}" y1="${y1}" x2="${x + 9}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x - 9}" y1="${y2}" x2="${x + 9}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
    <text x="${x - 14}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${SUB}">${label}</text>`;

/** ไม้บรรทัด 0–25 ซม. ตำแหน่งเดียวกันทุกใบ — ไฮไลต์ช่วง 0 ถึงขนาดของใบนี้ */
const ruler = (cm) => {
  const len = MAX_CM * CM;
  const x0 = (W - len) / 2;
  const y = 762;
  const h = 44;
  let ticks = "";
  for (let i = 0; i <= MAX_CM; i += 5) {
    const x = x0 + i * CM;
    ticks += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 16}" stroke="#94a3b8" stroke-width="2"/>
      <text x="${x}" y="${y + h - 5}" font-family="${TH}" font-size="18" text-anchor="middle" fill="#94a3b8">${i}</text>`;
  }
  for (let i = 1; i <= MAX_CM; i++) {
    if (i % 5 === 0) continue;
    ticks += `<line x1="${x0 + i * CM}" y1="${y}" x2="${x0 + i * CM}" y2="${y + 9}" stroke="#cbd5e1" stroke-width="1.6"/>`;
  }
  return `
    <rect x="${x0}" y="${y}" width="${len}" height="${h}" rx="8" fill="#ffffff" stroke="#d9d2c7" stroke-width="2"/>
    <rect x="${x0}" y="${y}" width="${cm * CM}" height="${h}" rx="8" fill="${HL}" opacity="0.16"/>
    <line x1="${x0 + cm * CM}" y1="${y - 8}" x2="${x0 + cm * CM}" y2="${y + h + 8}" stroke="${HL}" stroke-width="3"/>
    ${ticks}
    <text x="${x0 + len + 12}" y="${y + 29}" font-family="${TH}" font-size="20" fill="#94a3b8">ซม.</text>`;
};

function art(cm) {
  defsExtra = "";
  uid = 0;
  const add = (cm - BASE_CM) * RATE_FRONT;
  const size = cm * CM;
  const cx = W / 2 + 16;   // ขยับขวานิด — ฝั่งซ้ายเว้นที่ให้ลูกศรวัด ฝั่งขวาให้ขาตั้งโผล่
  const bottom = 700;
  const sub = add === 0 ? "ขนาดมาตรฐาน — รวมในราคาแล้ว" : `ใหญ่ขึ้นจากมาตรฐาน ${cm - BASE_CM} ซม.`;
  const body = `
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="52" font-weight="700" text-anchor="middle" fill="${INK}">${cm} ซม.</text>
  <text x="${W / 2}" y="134" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>
  ${add === 0
    ? `<rect x="${W / 2 - 112}" y="156" width="224" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2"/>
       <text x="${W / 2}" y="187" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${OK}">ไม่บวกเพิ่ม</text>`
    : `<rect x="${W / 2 - 128}" y="156" width="256" height="46" rx="23" fill="#fffbeb" stroke="${HL}" stroke-width="2"/>
       <text x="${W / 2}" y="187" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="#b45309">+${add} บาท / อัน</text>`}
  ${frame(cx, bottom, size)}
  ${dimV(cx - size / 2 - 34, bottom - size, bottom, `${cm} ซม.`)}
  ${ruler(cm)}
  <text x="${W / 2}" y="${H - 42}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">วัดจากด้านยาวสุดของชิ้นงาน · ลายในภาพเป็นตัวอย่าง</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${BG}${defsExtra}</defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${body}
</svg>`;
}

const FILES = STEPS.map((cm) => ({
  cm,
  choice: cm === BASE_CM ? `${cm} ซม. (มาตรฐาน)` : `${cm} ซม.`,
  file: `size-${cm}cm-${VER}.jpg`,
}));

// ⚠️ defsExtra สะสมข้ามใบ — art() ล้างเองต้นฟังก์ชัน แต่ต้องเรียกทีละใบตามลำดับ
const bufs = {};
for (const f of FILES) {
  const buf = await sharp(Buffer.from(art(f.cm))).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
  bufs[f.file] = buf;
  writeFileSync(`${OUT}/${f.file}`, buf);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urls = {};
for (const f of FILES) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, bufs[f.file], { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urls[f.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.choice]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  section: SECTION,
  note: `ขนาดมาตรฐาน ${BASE_CM} ซม. รวมในราคาแล้ว — แผ่นหน้าใหญ่ขึ้น ซม.ละ ฿${RATE_FRONT} (ใหญ่สุด ${MAX_CM} ซม.) · เลือกแผ่นประกบด้านหลังด้วย คิดเพิ่ม ซม.ละ ฿${RATE_BACK} ตามขนาดที่เลือก`,
  choices: FILES.map((f) => ({
    name: f.choice,
    ...(f.cm === BASE_CM ? { popular: true } : { extra: (f.cm - BASE_CM) * RATE_FRONT }),
    desc: f.cm === BASE_CM
      ? "ขนาดเริ่มต้นของร้าน รวมในราคาแล้ว"
      : `ใหญ่ขึ้นจากมาตรฐาน ${f.cm - BASE_CM} ซม. · +฿${(f.cm - BASE_CM) * RATE_FRONT} ต่ออัน`,
    imageSrc: urls[f.choice],
  })),
};

// sizeFee แผ่นประกบด้านหลัง: ขั้นละ ซม. ตามขนาดที่เลือกในกลุ่มการ์ด (15 ซม. = ฟรี)
const backPlateSizeFee = {
  widthLabel: SIZE_GROUP,
  heightLabel: SIZE_GROUP,
  tiers: STEPS.map((cm) => ({ upTo: cm, fee: (cm - BASE_CM) * RATE_BACK })),
};

// รันซ้ำได้: ตัดกลุ่มเดิม + กลุ่มใหม่ทิ้งก่อน แล้ววางกลุ่มใหม่ไว้หน้ากลุ่ม "Add on" (บนสุด)
const cleaned = options.filter((o) => o.label !== SIZE_GROUP && o.label !== OLD_GROUP);
const at = cleaned.findIndex((o) => o.label === ADDON_GROUP);
if (at < 0) { console.error(`ไม่เจอกลุ่ม "${ADDON_GROUP}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
const addon = cleaned[at];
const bp = (addon.choices ?? []).find((c) => c.name === BACK_PLATE);
if (!bp) { console.error(`ไม่เจอตัวเลือก "${BACK_PLATE}" ในกลุ่ม Add on — หยุดก่อน`); process.exit(1); }
bp.sizeFee = backPlateSizeFee;
cleaned.splice(at, 0, sizeGroup);

data.options = cleaned;
data.savedAt = new Date().toISOString();   // ⚠️ ต้องเป็น ISO string เท่านั้น (ด่านกัน 409 ของหน้าแก้ไข)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — เช็ครูปร่างของค่าจริง ไม่ใช่แค่เท่ากับตัวแปรฝั่งเรา
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === SIZE_GROUP);
const ga = got.find((o) => o.label === ADDON_GROUP);
const gbp = (ga?.choices ?? []).find((c) => c.name === BACK_PLATE);
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [!got.some((o) => o.label === OLD_GROUP), "กลุ่มสเต็ปเปอร์เดิมยังอยู่ (คิดค่าขยายขนาดซ้ำ)"],
  [g?.display === "cards", "ไม่ได้เป็นการ์ด"],
  [g?.choices?.length === STEPS.length, "จำนวนการ์ดไม่ครบ"],
  [FILES.every((f, i) => g?.choices?.[i]?.name === f.choice), "ชื่อการ์ดไม่ตรง"],
  [FILES.every((f, i) => {
    const v = g?.choices?.[i]?.imageSrc;
    return typeof v === "string" && v.startsWith("https://") && v === urls[f.choice];
  }), "ภาพการ์ดไม่ตรง/ไม่ใช่ URL"],
  [FILES.every((f, i) => (g?.choices?.[i]?.extra ?? 0) === (f.cm - BASE_CM) * RATE_FRONT), "ค่าเพิ่มต่อการ์ดไม่ตรง"],
  [gbp?.sizeFee?.widthLabel === SIZE_GROUP && gbp?.sizeFee?.tiers?.length === STEPS.length, "sizeFee แผ่นประกบไม่ลง"],
  [(gbp?.sizeFee?.tiers ?? []).every((t, i) => t.upTo === STEPS[i] && t.fee === (STEPS[i] - BASE_CM) * RATE_BACK), "ขั้น sizeFee ไม่ตรง"],
  [gbp?.extra === 60, "extra แผ่นประกบ (60) เพี้ยน"],
  [got.findIndex((o) => o.label === SIZE_GROUP) < got.findIndex((o) => o.label === ADDON_GROUP), "กลุ่มขนาดไม่ได้อยู่บนสุด"],
  [typeof back.data.savedAt === "string" && back.data.savedAt.includes("T"), "savedAt ไม่ใช่ ISO string"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nค่าเพิ่มต่ออันของแต่ละการ์ด (แผ่นหน้า / +แผ่นประกบ):");
for (const f of FILES) console.log(`  ${String(f.cm).padStart(2)} ซม.  →  +฿${(f.cm - BASE_CM) * RATE_FRONT}  /  +฿${(f.cm - BASE_CM) * RATE_BACK}`);
console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" การ์ด ${STEPS.length} ใบ + ภาพครบ · ตัดกลุ่ม "${OLD_GROUP}" ออก · sizeFee แผ่นประกบลงแล้ว · savedAt =`, back.data.savedAt);
