#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "ตะขอแขวนผนังอะคริลิค" (otheracrylicproducts3-5)
 *
 *   node scripts/wall-hook-art.mjs [--out=<dir>]
 *
 * ได้ 10 ไฟล์ ลง .cache/wall-hook/upload :
 *   hook-H01..H07.jpg   สีตะขอ 7 สี — ครอปจาก "ตารางสีตะขอ" ของจริงบนหน้า pricelists
 *                       (ไม่วาดเอง เพราะสีพลาสติกของจริงเทียบยาก ลูกค้าต้องเห็นสีจริง)
 *   size-extra.jpg      เกิน 6 ซม. — เซนละ +10 บาท (วาดเทียบ 6 ซม. กับ 9 ซม. สเกลเดียวกัน)
 *   acrylic-clear.jpg   อะคริลิคใส 3 มม. (มาตรฐาน)
 *   acrylic-special.jpg อะคริลิคพิเศษ (สี/กระจกเงา/กลิตเตอร์) — แอดมินตีราคาตามขนาด
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

/* ── 2. ขนาดชิ้นงาน — วาดเอง (เว็บไม่มีรูปเทียบขนาด) ────────────────── */

const PX_PER_CM = 46;

/** ชิ้นอะคริลิคตัดตามรูป (ทรงมนแบบไดคัต) กว้าง=สูง=cm ซม. */
const plate = (cx, cy, cm, { fill, stroke, dash = "", art = true }) => {
  const s = cm * PX_PER_CM;
  const r = s * 0.22;
  return `
    <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${r}"
          fill="${fill}" stroke="${stroke}" stroke-width="3" ${dash ? `stroke-dasharray="${dash}"` : ""}/>
    ${art ? `<image href="${HEART}" x="${cx - s * 0.31}" y="${cy - s * 0.31}" width="${s * 0.62}" height="${s * 0.62}" preserveAspectRatio="xMidYMid meet"/>` : ""}`;
};

/** เส้นบอกขนาดแนวนอนพร้อมป้าย */
const ruler = (x1, x2, y, label, color = CYAN) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${color}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${color}" stroke-width="3"/>
  <rect x="${(x1 + x2) / 2 - 62}" y="${y - 19}" width="124" height="38" rx="19" fill="#ffffff"/>
  <text x="${(x1 + x2) / 2}" y="${y + 9}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${color}">${label}</text>`;

/**
 * ── เพิ่มขนาด: เกิน 6 ซม. คิดเซนละ 10 บาท ──
 * วาดใบเดียวจบ (6 ซม. เส้นประ ซ้อนใน 9 ซม. เส้นทึบ สเกลเดียวกัน) — ขนาดมาตรฐานไม่มีการ์ดของตัวเอง
 * เพราะ "ไม่ติ๊ก = ไม่เกิน 6 ซม." อยู่แล้ว และแกลเลอรีมีที่ให้แค่ 5 รูป (MAX_PHOTOS หลังบ้าน)
 */
async function sizeCards() {
  const s6 = 6 * PX_PER_CM;
  const s9 = 9 * PX_PER_CM;
  await save(
    "size-extra",
    frame(`
      ${title("เพิ่มขนาด — เซนละ +10 บาท", "ตั้งแต่ 7 ซม. ขึ้นไป คิดเพิ่มเซนติเมตรละ 10 บาท/ชิ้น")}
      ${plate(450, 440, 9, { fill: "#ecfeff", stroke: CYAN, art: false })}
      ${plate(450, 440, 6, { fill: "#ffffff", stroke: LINE, dash: "10 8" })}
      ${ruler(450 - s6 / 2, 450 + s6 / 2, 440 - s6 / 2 - 34, "6 ซม.", SUB)}
      ${ruler(450 - s9 / 2, 450 + s9 / 2, 440 + s9 / 2 + 46, "9 ซม.")}
      <text x="${W / 2}" y="744" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${CYAN}">9 ซม. = เพิ่มมา 3 ซม. → +30 บาท/ชิ้น</text>
      ${foot(["ติ๊ก “เซนละ” แล้วกดจำนวนเซนติเมตรที่เกินจาก 6 ซม.", "เช่น งาน 8 ซม. = เกิน 2 ซม. → กดจำนวน 2"])}
    `)
  );
}

/* ── 3. ชนิดอะคริลิค ────────────────────────────────────────────────── */

async function acrylicCards() {
  // ลายตารางหมากรุกอ่อน ๆ ไว้หลังแผ่นใส — ให้เห็นว่า "ใส" มองทะลุได้
  const checker = `
    <defs><pattern id="ck" width="36" height="36" patternUnits="userSpaceOnUse">
      <rect width="36" height="36" fill="#f1f5f9"/>
      <rect width="18" height="18" fill="#e2e8f0"/>
      <rect x="18" y="18" width="18" height="18" fill="#e2e8f0"/>
    </pattern></defs>`;
  await save(
    "acrylic-clear",
    frame(`
      ${checker}
      ${title("อะคริลิคใส หนา 3 มม.", "แบบมาตรฐาน — ราคาตามตารางเลย")}
      <rect x="255" y="230" width="390" height="390" rx="26" fill="url(#ck)"/>
      ${plate(450, 425, 6.5, { fill: "rgba(224,242,254,0.55)", stroke: "#7dd3fc" })}
      <text x="${W / 2}" y="700" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">พิมพ์ลาย UV ลงบนแผ่นใส · ตัดตามรูป</text>
      ${foot(["พื้นหลังโปร่ง มองทะลุได้ตรงส่วนที่ไม่มีลาย", "ต้องการพื้นขาวทึบ แจ้งในหมายเหตุได้"])}
    `)
  );

  const swatch = (x, y, fill, stroke, label) => `
    <rect x="${x - 82}" y="${y - 82}" width="164" height="164" rx="34" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text x="${x}" y="${y + 122}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${label}</text>`;
  await save(
    "acrylic-special",
    frame(`
      <defs>
        <linearGradient id="mirror" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f8fafc"/><stop offset="45%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#94a3b8"/>
        </linearGradient>
        <linearGradient id="glit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fde68a"/><stop offset="50%" stop-color="#f9a8d4"/><stop offset="100%" stop-color="#a5b4fc"/>
        </linearGradient>
      </defs>
      ${title("อะคริลิคพิเศษ", "สี / กระจกเงา / กลิตเตอร์ — คิดเพิ่มตามขนาด")}
      ${swatch(255, 330, "url(#mirror)", "#94a3b8", "กระจกเงา")}
      ${swatch(450, 330, "url(#glit)", "#e9d5ff", "กลิตเตอร์")}
      ${swatch(645, 330, "#fecdd3", "#fb7185", "อะคริลิคสี")}
      ${swatch(352, 560, "#dbeafe", "#93c5fd", "ใสขุ่น")}
      ${swatch(548, 560, "#fef9c3", "#fde047", "พาสเทล")}
      <text x="${W / 2}" y="742" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">เลือกแบบนี้ = แอดมินตีราคาให้ตามขนาดงาน</text>
      ${foot(["กดสั่งไว้ก่อนได้ ราคาจะขึ้นหลังแอดมินใส่ให้", "แจ้งสี/เนื้อที่ต้องการในช่องหมายเหตุถึงร้าน"])}
    `)
  );
}

async function main() {
  console.log(`🎨 วาดภาพตัวเลือก "ตะขอแขวนผนังอะคริลิค" → ${OUT}`);
  HEART = await iconDataUri("heart", 300);
  await hookCards();
  await sizeCards();
  await acrylicCards();
  console.log("✅ ครบ 10 ภาพ — ต่อด้วย node scripts/wall-hook-apply.mjs --write");
}

// รันตรง ๆ เท่านั้นถึงวาด — wall-hook-apply.mjs import ไฟล์นี้เอา HOOK_COLORS ไปใช้ ไม่ควรวาดใหม่ทุกครั้ง
if (process.argv[1] && process.argv[1].endsWith("wall-hook-art.mjs")) {
  main().catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  });
}
