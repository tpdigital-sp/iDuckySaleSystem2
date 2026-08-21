#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "ตะขอแขวนผนังอะคริลิค" (otheracrylicproducts3-5)
 *
 *   node scripts/wall-hook-art.mjs [--out=<dir>]
 *
 * ได้ 16 ไฟล์ ลง .cache/wall-hook/upload :
 *   hook-H01..H07.jpg   สีตะขอ 7 สี — ครอปจาก "ตารางสีตะขอ" ของจริงบนหน้า pricelists
 *                       (ไม่วาดเอง เพราะสีพลาสติกของจริงเทียบยาก ลูกค้าต้องเห็นสีจริง)
 *   size-2..size-10.jpg ขนาดชิ้นงาน 9 ขนาด — ทุกใบสเกลเดียวกัน มีกรอบเส้นประ 10 ซม. ไว้เทียบ
 *                       (ภาษาภาพชุดเดียวกับการ์ดขนาดของสแตนดี้ optart-size-*)
 *
 * ภาพ "สีอะคริลิค" (ใส / ขาวขุ่น C-02 / สีพิเศษ) ไม่ได้วาดที่นี่ — wall-hook-apply.mjs
 * ก๊อปจากสินค้าสแตนดี้ (standy) ที่ฝ่าย Content ทำไว้แล้ว จะได้หน้าตาชุดเดียวกันทั้งร้าน
 *
 * ที่มาของตัวเลข: iduckyofficial-pricelists.com/otheracrylicproducts3 ท่อน "ตะขอแขวนผนัง อะคริลิค"
 *   อะคริลิค หนา 3 mm · ขนาดไม่เกิน 6cm · ตั้งแต่ 7cm ขึ้นไป บวกเพิ่ม cm ละ 10 บาท
 *   อะคริลิคพิเศษ บวกเพิ่มตามขนาด · ตัวตะขอเอง 3 x 5.5 ซม. (ระบุไว้ในรูปตารางสี)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { iconDataUri } from "./iducky-assets.mjs";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/wall-hook/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

/** รูปตารางสีตะขอบนหน้า pricelists (ต้นฉบับ 800x800 — ครอปเอาทีละสี) */
const CHART = "https://static.wixstatic.com/media/959b83_4edf8633b08a43f99a9015bd7865cb0d~mv2.jpg";

const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const LINE = "#cbd5e1";

/** ไอคอนหัวใจ 3D ใช้แทน "ลายที่ลูกค้าสั่งพิมพ์" บนชิ้นอะคริลิค — โหลดตอนเริ่มวาด (ดู main) */
let HEART = "";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="126" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.map((l, i) => `<text x="${W / 2}" y="${812 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${l}</text>`).join("");

const save = async (name, svg) => {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`   ${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
};

/* ── 1. สีตะขอ — ครอปจากตารางสีของจริง ─────────────────────────────── */

/**
 * จุดกึ่งกลาง "หน้าปัด" ของตะขอแต่ละสีในรูปตาราง 800x800 (วัดจากรูปต้นฉบับ)
 * ครอบด้วยกรอบ 144x232 รอบจุดนี้ = ได้ตะขอเต็มตัวพอดี ไม่ติดตัวข้าง ๆ
 */
const CHART_AT = {
  H01: [144, 528],
  H02: [384, 600],
  H03: [398, 84],
  H04: [384, 360],
  H05: [672, 192],
  H06: [676, 512],
  H07: [144, 200],
};

/**
 * H04 อยู่กลางรูป มีเส้นบอกขนาดสีชมพู ("3 cm" แนวนอน / "5.5cm" แนวตั้ง) ขนาบอยู่
 * ขยับกรอบหนีไม่ได้ (จะเบียดตัวตะขอ) — ลบเส้นทิ้งก่อนครอปแทน
 * พื้นหลังรูปเป็นสีขาวอยู่แล้ว ทาขาวทับจึงมองไม่ออก · ทั้งสองกรอบอยู่นอกตัวตะขอ (หน้าปัด x 329-439, y 305-415)
 */
const CHART_ERASE = [
  { x: 294, y: 268, w: 34, h: 40 }, // ปลายแถบ "3 cm" ที่โผล่มุมซ้ายบนของกรอบ H04
  { x: 441, y: 268, w: 46, h: 262 }, // แถบ "5.5cm" แนวตั้งด้านขวาของ H04 (หน้าปัดสุดที่ x=439)
];

/** ชื่อสีภาษาไทย (อ่านจากรูปตาราง) — ใช้เป็นชื่อตัวเลือกด้วย ต้องตรงกับ wall-hook-apply.mjs */
export const HOOK_COLORS = {
  H01: "สีดำ",
  H02: "สีครีม",
  H03: "สีน้ำตาลเข้ม",
  H04: "สีชมพูนู้ด",
  H05: "สีเขียวอมเทา",
  H06: "สีเหลืองมัสตาร์ด",
  H07: "สีเขียวมิ้นท์",
};

async function hookCards() {
  const res = await fetch(CHART, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลดรูปตารางสีตะขอไม่ได้ — HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(raw).metadata();
  if (meta.width !== 800 || meta.height !== 800)
    throw new Error(`รูปตารางสีขนาด ${meta.width}x${meta.height} ไม่ใช่ 800x800 — จุดครอปจะเพี้ยน ตรวจก่อน`);
  const erase = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">${CHART_ERASE.map(
    (r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#ffffff"/>`
  ).join("")}</svg>`;
  const chart = await sharp(raw).composite([{ input: Buffer.from(erase) }]).jpeg({ quality: 96 }).toBuffer();

  const PH = 470; // ความสูงของรูปตะขอบนการ์ด
  const PW = Math.round((144 / 232) * PH);
  for (const [code, [cx, cy]] of Object.entries(CHART_AT)) {
    const crop = await sharp(chart)
      .extract({ left: cx - 72, top: cy - 72, width: 144, height: 232 })
      .resize(PW * 2, PH * 2, { kernel: "lanczos3" })
      .png()
      .toBuffer();
    const svg = frame(`
      ${title(`${code} · ${HOOK_COLORS[code]}`, "สีของ “ตัวตะขอ” ด้านหลัง (ลายพิมพ์อยู่บนอะคริลิคด้านหน้า)")}
      <image href="data:image/png;base64,${crop.toString("base64")}" x="${(W - PW) / 2}" y="200" width="${PW}" height="${PH}"/>
      ${foot(["ตะขอกว้าง 3 ซม. × สูง 5.5 ซม. · ติดผนังด้วยเทปกาวสองหน้า", "เลือกสีตะขอได้ทุกสี ราคาเท่ากัน"])}
    `);
    await save(`hook-${code}`, svg);
  }
}

/* ── 2. ขนาดชิ้นงาน 2-10 ซม. — วาดเอง (เว็บไม่มีรูปเทียบขนาด) ────────── */

/** ขนาดที่ให้เลือก (ซม.) — ตรงกับแกน "ขนาด" ของตารางราคา ใน wall-hook-apply.mjs */
export const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
/** ไม่เกิน 6 ซม. รวมในราคาแล้ว · 7 ซม. ขึ้นไป บวกเพิ่ม ซม.ละ 10 บาท (ตามเว็บตารางราคา) */
export const sizeExtra = (cm) => (cm <= 6 ? 0 : (cm - 6) * 10);

const PX_PER_CM = 33; // 10 ซม. = 330 px — กรอบเส้นประของทุกใบเท่ากัน เทียบขนาดกันได้ทันที
const BOX = SIZES.at(-1) * PX_PER_CM;
const BASE_Y = 512; // เส้นพื้นที่ชิ้นงานยืนอยู่ (ก้นชิ้นอะคริลิค) — ทุกใบตรงกัน

/** ชิ้นอะคริลิคตัดตามรูป (ทรงมนแบบไดคัต) กว้าง=สูง=cm ซม. ก้นอยู่ที่ BASE_Y */
const plate = (cm) => {
  const s = cm * PX_PER_CM;
  const x = 450 - s / 2;
  const y = BASE_Y - s;
  return `
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.22}" fill="#ecfeff" stroke="${CYAN}" stroke-width="3"/>
    <image href="${HEART}" x="${450 - s * 0.31}" y="${BASE_Y - s * 0.81}" width="${s * 0.62}" height="${s * 0.62}" preserveAspectRatio="xMidYMid meet"/>`;
};

/** ก้านตะขอที่โผล่ใต้ชิ้นงาน (ตัวตะขออยู่ด้านหลัง หน้าปัด 3 ซม. ถูกชิ้นอะคริลิคบัง) */
const stem = () => {
  const w = 13;
  const h = 2.2 * PX_PER_CM;
  return `
    <rect x="${450 - w / 2}" y="${BASE_Y - 6}" width="${w}" height="${h}" rx="${w / 2}" fill="#cbd5e1"/>
    <ellipse cx="450" cy="${BASE_Y + h - 12}" rx="${w / 2 + 3}" ry="11" fill="#cbd5e1"/>`;
};

/** เส้นบอกขนาดแนวตั้งด้านขวาของชิ้นงาน พร้อมป้าย */
const ruler = (cm) => {
  const s = cm * PX_PER_CM;
  const x = 450 + BOX / 2 + 40;
  return `
    <line x1="${x}" y1="${BASE_Y - s}" x2="${x}" y2="${BASE_Y}" stroke="${CYAN}" stroke-width="3"/>
    <line x1="${x - 12}" y1="${BASE_Y - s}" x2="${x + 12}" y2="${BASE_Y - s}" stroke="${CYAN}" stroke-width="3"/>
    <line x1="${x - 12}" y1="${BASE_Y}" x2="${x + 12}" y2="${BASE_Y}" stroke="${CYAN}" stroke-width="3"/>
    <text x="${x + 22}" y="${BASE_Y - s / 2 + 10}" font-family="${TH}" font-size="27" font-weight="700" fill="${CYAN}">${cm} ซม.</text>`;
};

async function sizeCards() {
  for (const cm of SIZES) {
    const extra = sizeExtra(cm);
    await save(
      `size-${cm}`,
      frame(`
        ${title(`ขนาด ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)")}
        <rect x="${450 - BOX / 2}" y="${BASE_Y - BOX}" width="${BOX}" height="${BOX}" rx="26"
              fill="none" stroke="${LINE}" stroke-width="2" stroke-dasharray="9 8"/>
        ${stem()}
        ${plate(cm)}
        ${ruler(cm)}
        <text x="${W / 2}" y="640" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${extra ? CYAN : "#16a34a"}">${
          extra ? `+${extra} บาท/ชิ้น (เกิน 6 ซม. คิด ซม.ละ 10)` : "รวมอยู่ในราคาตามตารางแล้ว"
        }</text>
        ${foot([
          "อะคริลิคใส หนา 3 มม. · ไดคัทตามลาย · พิมพ์ระบบ UV",
          "เส้นประ = ขนาดใหญ่สุด 10 ซม. (ไว้เทียบขนาด) · ก้านล่าง = ตัวตะขอด้านหลัง",
        ])}
      `)
    );
  }
}

/* ── 3. ภาพ 2 ใบที่คลังสีอะคริลิคกลางไม่มี ────────────────────────────
 * คลัง products/acrylic-colors/ เป็นรูปถ่ายเนื้ออะคริลิคจริง ครอปจากชาร์ตของร้าน
 * แต่ไม่มีช่อง "ใส" (โปร่งใส ถ่ายเป็นช่องสีไม่ได้) และไม่มีช่องรวมที่แทน "สีพิเศษ"
 * สองใบนี้จึงทำเอง — ขนาด 640 เท่าไฟล์ในคลัง จะได้วางเรียงกันแล้วดูเป็นชุดเดียวกัน
 */
const SW = 640;
const CHIP = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/acrylic-colors";
/** 4 สีที่หยิบมาทำภาพรวม "สีพิเศษ" — เลือกให้เห็นครบทั้งโฮโลแกรม กลิตเตอร์ กระจก และสีทึบ */
const SPECIAL_MIX = ["holo-rainbow-v2", "glitter-gold-v2", "mirror-v2", "p-v2"];

const saveRaw = async (name, buf) => {
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`   ${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
};

/** "อะคริลิคใส" — แผ่นโปร่งวางบนตารางหมากรุก ให้เห็นว่ามองทะลุได้ + ป้ายวงรีแบบเดียวกับชาร์ต */
async function sheetClear() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SW}" viewBox="0 0 ${SW} ${SW}">
    <defs>
      <pattern id="ck" width="64" height="64" patternUnits="userSpaceOnUse">
        <rect width="64" height="64" fill="#f8fafc"/>
        <rect width="32" height="32" fill="#e8edf3"/><rect x="32" y="32" width="32" height="32" fill="#e8edf3"/>
      </pattern>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.62"/>
        <stop offset="42%" stop-color="#e0f2fe" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="${SW}" height="${SW}" fill="url(#ck)"/>
    <!-- แผ่นอะคริลิควางเฉียง แบบเดียวกับรูปถ่ายในชาร์ต (เห็นสันหนา 3 มม.) -->
    <path d="M96 118 L556 78 L556 470 L96 512 Z" fill="url(#glass)" stroke="#bae6fd" stroke-width="4"/>
    <path d="M96 512 L556 470 L556 500 L96 542 Z" fill="#e0f2fe" stroke="#bae6fd" stroke-width="3"/>
    <path d="M150 140 L300 128 L190 470 L120 476 Z" fill="#ffffff" opacity="0.5"/>
    <ellipse cx="${SW / 2}" cy="300" rx="118" ry="56" fill="#ffffff"/>
    <text x="${SW / 2}" y="318" font-family="${TH}" font-size="52" font-weight="700" text-anchor="middle" fill="${INK}">ใส</text>
    <text x="${SW / 2}" y="590" font-family="${TH}" font-size="36" font-weight="700" text-anchor="middle" fill="${INK}">อะคริลิคใส</text>
  </svg>`;
  await saveRaw("sheet-clear", await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer());
}

/** "สีพิเศษ" — ภาพรวม 4 ช่องจากคลังสีกลาง (รูปเนื้ออะคริลิคจริง ไม่ใช่ภาพวาด) */
async function sheetSpecial() {
  const half = SW / 2;
  const tiles = [];
  for (const [i, f] of SPECIAL_MIX.entries()) {
    const res = await fetch(`${CHIP}/${f}.jpg`);
    if (!res.ok) throw new Error(`โหลดสวอตช์ ${f} จากคลังสีกลางไม่ได้ — HTTP ${res.status}`);
    tiles.push({
      input: await sharp(Buffer.from(await res.arrayBuffer())).resize(half, half).toBuffer(),
      left: (i % 2) * half,
      top: Math.floor(i / 2) * half,
    });
  }
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SW}">
    <ellipse cx="${SW / 2}" cy="${SW / 2}" rx="150" ry="58" fill="#ffffff" opacity="0.94"/>
    <text x="${SW / 2}" y="${SW / 2 + 17}" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">สีพิเศษ</text>
  </svg>`;
  const buf = await sharp({ create: { width: SW, height: SW, channels: 3, background: "#ffffff" } })
    .composite([...tiles, { input: Buffer.from(label) }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await saveRaw("sheet-special", buf);
}

async function main() {
  console.log(`🎨 วาดภาพตัวเลือก "ตะขอแขวนผนังอะคริลิค" → ${OUT}`);
  HEART = await iconDataUri("heart", 300);
  await hookCards();
  await sizeCards();
  await sheetClear();
  await sheetSpecial();
  console.log(`✅ ครบ ${7 + SIZES.length + 2} ภาพ — ต่อด้วย node scripts/wall-hook-apply.mjs --write`);
}

// รันตรง ๆ เท่านั้นถึงวาด — wall-hook-apply.mjs import ไฟล์นี้เอา HOOK_COLORS ไปใช้ ไม่ควรวาดใหม่ทุกครั้ง
if (process.argv[1] && process.argv[1].endsWith("wall-hook-art.mjs")) {
  main().catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  });
}
