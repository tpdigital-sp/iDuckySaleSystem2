#!/usr/bin/env node
/**
 * เตรียมภาพของสินค้า "สแตนดี้ + Frame Card"
 *
 *   node scripts/standee-frame-card-art.mjs [--out=<dir>]
 *
 * ได้ 2 ชุด แล้วให้ scripts/add-standee-frame-card.ts --upload อัปขึ้น Supabase Storage:
 *   1. ภาพงานจริง/แผ่นข้อมูลจากเว็บตารางราคา (iduckyofficial-pricelists.com/pricestandy)
 *      photo-card    งานจริง "สแตนดี้ + Frame Card ใส" (แปะกาวสำหรับใส่รูปที่ด้านหลัง)
 *      photo-addon   แผ่น "Standy สแตนดี้+ส่วนเสริม" — ช่อง Frame Card ใส บวกเพิ่ม 50 บาท
 *      photo-1/2     งานจริงสแตนดี้ตัวใหญ่ (ไว้ให้เห็นทรงงาน + ฐาน)
 *      color-chart   ตารางสีอะคริลิคของร้าน (ใช้ในแท็บ "ชนิดอะคริลิค")
 *   2. ภาพประกอบตัวเลือก — วาดเป็น SVG แล้วเรนเดอร์ด้วย sharp ให้สไตล์เดียวกันทั้งชุด
 *      hero                  ภาพอธิบายสินค้า (ด้านหน้าสกรีนลาย · ด้านหลังกรอบใส่การ์ด)
 *      size-15..size-20      ขนาดตัวสแตนดี้ (สเกลจริง มีเงาตัว 20 ซม. เทียบ + การ์ด 5.4×8.5 ซม. สเกลเดียวกัน)
 *      base-6/8/9/10/11/12   ขนาดฐาน (มองจากด้านบน เทียบฐาน 6-7 ซม.)
 *      basescreen-no|yes     ฐานสกรีนลาย / ไม่สกรีน
 *      screen-1|screen-2     งานสกรีน 1 ด้าน / 2 ด้าน
 *      card-slot             กรอบใส่การ์ด (ทางร้านมีแค่แนวตั้ง)
 *      layout-portrait|landscape  ตัวสแตนดี้แนวตั้ง / แนวนอน
 *      clear                 อะคริลิคใส (ตัวเลือกสีมาตรฐาน)
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ (ขยับ REV ที่สคริปต์ add-)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/framecard/upload").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";
const CARD_FILL = "rgba(226,232,240,0.75)";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map(
      (t, i) =>
        `<text x="${W / 2}" y="${H - 40 - (lines.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** เส้นบอกขนาดแนวตั้ง */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y1}" x2="${x + 12}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y2}" x2="${x + 12}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 18}" y="${(y1 + y2) / 2 + 10}" font-family="${TH}" font-size="29" font-weight="700" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวนอน */
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 42}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** ลายสกรีนจำลองบนตัวสแตนดี้ */
const artwork = (cx, cy, w, h) => {
  const u = Math.min(w, h);
  return `
  <g opacity="0.9">
    <circle cx="${cx}" cy="${cy - h * 0.06}" r="${u * 0.19}" fill="#fbbf24"/>
    <circle cx="${cx - u * 0.09}" cy="${cy - h * 0.09}" r="${u * 0.035}" fill="#0f172a"/>
    <circle cx="${cx + u * 0.09}" cy="${cy - h * 0.09}" r="${u * 0.035}" fill="#0f172a"/>
    <path d="M${cx - u * 0.075} ${cy + h * 0.01} q${u * 0.075} ${u * 0.07} ${u * 0.15} 0" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M${cx - w * 0.24} ${cy + h * 0.22} q${w * 0.24} ${h * 0.13} ${w * 0.48} 0" stroke="#f472b6" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>`;
};

/** ฐานอะคริลิคมองแบบเฉียง */
const baseSideView = (cx, cy, rx, screened = false) => {
  const ry = rx * 0.26;
  const th = 15;
  const fill = screened ? "rgba(13,148,136,0.20)" : GLASS;
  const edge = screened ? "#0d9488" : GLASS_EDGE;
  return `
    <path d="M${cx - rx} ${cy} v${th} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${th} z" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <rect x="${cx - rx * 0.42}" y="${cy - 7}" width="${rx * 0.84}" height="13" rx="6" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`;
};

/** กรอบใส่การ์ด (มองจากด้านหลัง) — แผ่นอะคริลิคใสแปะกาวเป็นช่องสอดการ์ด */
const cardFrame = (cx, top, w, h, label) => `
  <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="8" fill="${CARD_FILL}" stroke="#94a3b8" stroke-width="3"/>
  <rect x="${cx - w / 2 + 9}" y="${top + 9}" width="${w - 18}" height="${h - 18}" rx="5" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="7 6"/>
  <line x1="${cx - w / 2 + 4}" y1="${top + 6}" x2="${cx + w / 2 - 4}" y2="${top + 6}" stroke="#38bdf8" stroke-width="5" stroke-linecap="round"/>
  ${label ? `<text x="${cx}" y="${top + h / 2 + 8}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${label}</text>` : ""}`;

// ── 1. ขนาดตัวสแตนดี้ 15-20 ซม. (สเกลจริง เทียบกันได้ทั้งชุด) ───────────────
// ทำได้ทั้งแนวตั้งและแนวนอน (แบบงานจริงที่เป็นแผ่นกว้างวางการ์ดด้านหลัง)
// จึงวาดคู่กันในภาพเดียว สเกลเดียวกัน — ตัวเลข ซม. คือ "ด้านที่ยาวที่สุด" ทั้งสองแนว
const SIZES = [15, 16, 17, 18, 19, 20];
const PX_PER_CM = 13; // 20cm = 260px (ต้องวางสองแนวในภาพเดียว จึงย่อสเกลลง)
const GROUND = 520;
/** สัดส่วนด้านสั้นต่อด้านยาวของตัวงาน (ใช้วาดให้ดูเป็นแผ่นสแตนดี้) */
const RATIO = 0.72;
/** การ์ดมาตรฐาน (ID Card) 5.4 × 8.5 ซม. — วาดสเกลเดียวกับตัวสแตนดี้ */
const CARD_W_CM = 5.4;
const CARD_H_CM = 8.5;

/** เส้นบอกขนาดแนวตั้ง ป้ายอยู่ "ซ้าย" ของเส้น (ใช้เมื่อฝั่งขวามีรูปอื่นอยู่) */
const dimVLeft = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x - 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวนอน ป้ายอยู่ "เหนือ" เส้น */
const dimHUp = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y - 16}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** ตัวสแตนดี้ 1 ตัว (ลายด้านหน้า + กรอบการ์ดด้านหลังเป็นเส้นประ) พร้อมฐาน */
function body(cx, bottom, w, h, landscape, showCardLabel = true) {
  const cardW = CARD_W_CM * PX_PER_CM;
  const cardH = CARD_H_CM * PX_PER_CM;
  const top = bottom - h;
  // แนวตั้ง: ลายอยู่บน การ์ดอยู่ล่าง · แนวนอน: ลายอยู่ซ้าย การ์ดอยู่ขวา (แบบงานจริง)
  const artCx = landscape ? cx - w * 0.26 : cx;
  const artCy = landscape ? top + h * 0.44 : top + h * 0.2;
  const artW = landscape ? w * 0.4 : w * 0.82;
  const artH = landscape ? h * 0.62 : h * 0.45;
  const cardX = landscape ? cx + w * 0.22 - cardW / 2 : cx - cardW / 2;
  const cardY = landscape ? bottom - (h - cardH) / 2 - cardH : bottom - 20 - cardH;
  return `
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${Math.min(28, Math.min(w, h) * 0.14)}"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(artCx, artCy, artW, artH)}
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="6"
      fill="rgba(148,163,184,0.16)" stroke="#94a3b8" stroke-width="3" stroke-dasharray="9 7"/>
    ${
      showCardLabel
        ? `<text x="${cardX + cardW / 2}" y="${cardY + cardH / 2 + 6}" font-family="${TH}" font-size="16" text-anchor="middle" fill="${SUB}">กรอบการ์ด</text>`
        : ""
    }
    ${baseSideView(cx, bottom + 26, Math.max(64, w * 0.46))}`;
}

function sizeArt(cm) {
  const long = cm * PX_PER_CM;
  const short = long * RATIO;
  const bottom = GROUND;
  // ซ้าย = แนวตั้ง (สูง = ขนาดที่สั่ง) · ขวา = แนวนอน (กว้าง = ขนาดที่สั่ง)
  const cxP = 225;
  const cxL = 500;
  const ghost = 20 * PX_PER_CM;
  return frame(`
    ${title(`ตัวสแตนดี้ ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)")}
    <text x="${cxP}" y="172" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">แนวตั้ง</text>
    <text x="${cxL}" y="172" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">แนวนอน</text>
    ${
      cm < 20
        ? `<rect x="${cxP - (ghost * RATIO) / 2}" y="${bottom - ghost}" width="${ghost * RATIO}" height="${ghost}" rx="28"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>`
        : ""
    }
    ${body(cxP, bottom, short, long, false)}
    ${dimVLeft(cxP - short / 2 - 20, bottom - long, bottom, `${cm} ซม.`)}
    ${body(cxL, bottom, long, short, true)}
    ${dimHUp(bottom - short - 30, cxL - long / 2, cxL + long / 2, `${cm} ซม.`)}
    ${foot([
      `กรอบใส่การ์ดที่ด้านหลัง (แนวตั้ง) รองรับการ์ด ${CARD_W_CM} × ${CARD_H_CM} ซม.`,
      cm < 20
        ? "เส้นประ = ขนาดใหญ่สุด 20 ซม. · ราคาเท่ากันทั้งแนวตั้ง/แนวนอน"
        : "ขนาดใหญ่สุดที่สั่งได้ · ราคาเท่ากันทั้งแนวตั้ง/แนวนอน",
    ])}`);
}

/** ภาพตัวเลือก "แนววางงาน" — แนวตั้ง / แนวนอน (แบบแผ่นกว้างวางการ์ดด้านหลัง) */
function layoutArt(landscape) {
  const long = 18 * PX_PER_CM * 1.5;
  const short = long * RATIO;
  const bottom = 500;
  const w = landscape ? long : short;
  const h = landscape ? short : long;
  return frame(`
    ${title(landscape ? "แนวนอน" : "แนวตั้ง", landscape ? "ตัวงานเป็นแผ่นกว้าง วางการ์ดด้านหลัง" : "ตัวงานเป็นแผ่นสูง วางการ์ดด้านหลัง")}
    ${body(350, bottom, w, h, landscape)}
    ${foot([
      "ราคาเท่ากันทั้งสองแนว — ขนาดที่สั่งคือด้านที่ยาวที่สุด",
      landscape ? "เหมาะกับลายแนวนอน ตัวละครคู่ หรือวางการ์ดข้างลาย" : "เหมาะกับลายตัวละครเดี่ยว ตั้งได้สูงเด่น",
    ])}`);
}

// ── 2. ภาพอธิบายสินค้า (ด้านหน้า / ด้านหลัง) ──────────────────────────────
const hero = (() => {
  const h = 300;
  const w = h * 0.72;
  const cardW = 78;
  const cardH = 123;
  const lx = 208;
  const rx = 492;
  const top = 210;
  const bottom = top + h;
  return frame(`
    ${title("สแตนดี้ + Frame Card", "สกรีนลายด้านหน้า · ด้านหลังมีกรอบใส่การ์ด")}
    <text x="${lx}" y="180" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหน้า</text>
    <rect x="${lx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(lx, top + h * 0.42, w, h)}
    ${baseSideView(lx, bottom + 22, 92)}
    <text x="${rx}" y="180" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหลัง</text>
    <rect x="${rx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${cardFrame(rx, top + 92, cardW, cardH, "ใส่การ์ด")}
    <path d="M${rx + cardW / 2 + 18} ${top + 92 + 8} h34" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
    <text x="${rx + cardW / 2 + 24}" y="${top + 92 - 8}" font-family="${TH}" font-size="19" fill="${SUB}">ช่องสอด</text>
    ${baseSideView(rx, bottom + 22, 92)}
    ${foot([
      "กรอบการ์ด = อะคริลิคใสแปะกาวที่ด้านหลัง (+50 บาท/ชิ้น รวมในราคาแล้ว)",
      "ทำขนาดตั้งแต่ 15 ซม. ขึ้นไป — ใส่การ์ด 5.4 × 8.5 ซม. ได้พอดี",
    ])}`);
})();

// ── 3. ขนาดฐาน (มองจากด้านบน) ────────────────────────────────────────────
const BASES = [
  { key: 6, label: "ฐาน 6-7 ซม.", cm: 7, note: "ฐานเล็กสุดที่แนะนำสำหรับตัว 15 ซม. ขึ้นไป" },
  { key: 8, label: "ฐาน 8 ซม.", cm: 8, note: "ตั้งได้มั่นคงขึ้น" },
  { key: 9, label: "ฐาน 9 ซม.", cm: 9, note: "ตั้งได้มั่นคงขึ้น" },
  { key: 10, label: "ฐาน 10 ซม.", cm: 10, note: "เหมาะกับตัวสแตนดี้ 18 ซม. ขึ้นไป" },
  { key: 11, label: "ฐาน 11 ซม.", cm: 11, note: "เหมาะกับตัวสแตนดี้ 18 ซม. ขึ้นไป" },
  { key: 12, label: "ฐาน 12 ซม.", cm: 12, note: "ฐานใหญ่สุดที่สั่งผ่านหน้าเว็บได้" },
];
const BASE_PX_PER_CM = 28; // 12cm = 336px

function baseArt(b) {
  const r = (b.cm * BASE_PX_PER_CM) / 2;
  const std = (7 * BASE_PX_PER_CM) / 2;
  const cx = 350;
  const cy = 350;
  return frame(`
    ${title(b.label, b.note)}
    ${b.cm > 7 ? `<circle cx="${cx}" cy="${cy}" r="${std}" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="8 8"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    <rect x="${cx - r * 0.52}" y="${cy - 8}" width="${r * 1.04}" height="16" rx="8" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
    ${dimH(cy + r + 40, cx - r, cx + r, `${b.cm} ซม.`)}
    ${foot([
      b.cm > 7 ? "เส้นประ = ฐาน 6-7 ซม. (ขนาดเล็กสุด) ไว้เทียบ" : "ร่องกลางฐานไว้เสียบตัวสแตนดี้",
      "1-10 ชิ้น ราคารวมฐานแล้ว · 11 ชิ้นขึ้นไป คิดเพิ่มตามขนาด",
    ])}`);
}

// ── 4. ฐานสกรีนลาย / ไม่สกรีน ────────────────────────────────────────────
const dotsDef = `
  <defs>
    <pattern id="dots" width="46" height="46" patternUnits="userSpaceOnUse">
      <circle cx="12" cy="12" r="8" fill="#fbbf24"/>
      <circle cx="34" cy="34" r="8" fill="#f472b6"/>
    </pattern>
  </defs>`;
const slot = (cx, cy) => `
  <rect x="${cx - 96}" y="${cy - 8}" width="192" height="16" rx="8" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`;

const baseScreenNo = frame(`
  ${title("ไม่สกรีนฐาน", "ฐานอะคริลิคใส เห็นทะลุ ไม่มีลาย")}
  <circle cx="350" cy="378" r="180" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  ${slot(350, 378)}
  ${foot(["1-10 ชิ้น รวมฐานในราคาแล้ว · 11 ชิ้นขึ้นไปคิดเพิ่ม:", "6-7 ซม. +15 · 8 +20 · 9 +25 · 10 +30 · 11 +35 · 12 +40 บาท"])}`);

const baseScreenYes = frame(`
  ${dotsDef}
  ${title("สกรีนลายฐาน", "พิมพ์ลายลงบนฐาน คิดเพิ่มตามขนาดฐาน")}
  <circle cx="350" cy="378" r="180" fill="url(#dots)" opacity="0.55"/>
  <circle cx="350" cy="378" r="180" fill="rgba(13,148,136,0.18)" stroke="#0d9488" stroke-width="4"/>
  ${slot(350, 378)}
  ${foot(["1-10 ชิ้น รวมฐานในราคาแล้ว · 11 ชิ้นขึ้นไปคิดเพิ่ม:", "6-7 ซม. +25 · 8 +30 · 9 +35 · 10 +40 · 11 +45 · 12 +50 บาท"])}`);

// ── 5. งานสกรีน 1 ด้าน / 2 ด้าน ──────────────────────────────────────────
function screenArt(sides) {
  const h = 300;
  const w = h * 0.72;
  const lx = 208;
  const rx = 492;
  const top = 216;
  const two = sides === 2;
  return frame(`
    ${title(`สกรีน ${sides} ด้าน`, two ? "พิมพ์ลายทั้งด้านหน้าและด้านหลัง" : "พิมพ์ลายด้านหน้าด้านเดียว")}
    <text x="${lx}" y="186" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหน้า</text>
    <rect x="${lx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(lx, top + h * 0.3, w * 0.85, h * 0.55)}
    <text x="${rx}" y="186" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหลัง</text>
    <rect x="${rx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${
      two
        ? artwork(rx, top + h * 0.3, w * 0.85, h * 0.55)
        : `<text x="${rx}" y="${top + h * 0.5}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${LINE}">ใสไม่มีลาย</text>`
    }
    ${cardFrame(rx, top + h - 132, 72, 114, "")}
    ${foot([
      two
        ? "บวกเพิ่มตามขนาด · 15-16 ซม. +35 · 17 ซม. +40 · 18 ซม. +45"
        : "ราคามาตรฐานตามตาราง (กรอบการ์ดรวมแล้ว)",
      two ? "19 ซม. +50 · 20 ซม. +55 บาท/ชิ้น (รวมให้ในตารางแล้ว)" : "กรอบใส่การ์ดอยู่ที่ด้านหลังทุกแบบ",
    ])}`);
}

// ── 6. กรอบการ์ด (ทางร้านมีแค่ "แนวตั้ง" แบบเดียว) ────────────────────────
const cardSlotArt = (() => {
  const h = 320;
  const w = h * 0.78;
  const cx = 350;
  const top = 200;
  return frame(`
    ${title("กรอบการ์ดแนวตั้ง", "มองจากด้านหลังของตัวสแตนดี้")}
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="32" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${cardFrame(cx, top + (h - 145) / 2, 92, 145, "5.4 × 8.5 ซม.")}
    ${foot(["ทางร้านทำกรอบการ์ดเป็นแนวตั้งแบบเดียว", "ใช้ได้ทั้งตัวสแตนดี้แนวตั้งและแนวนอน"])}`);
})();

// ── 7. อะคริลิคใส (ตัวเลือกสีมาตรฐาน) ────────────────────────────────────
const clearArt = frame(`
  ${title("อะคริลิคใส", "ราคาตามตาราง (ใส / ขาวขุ่น C-02)")}
  <rect x="212" y="196" width="276" height="300" rx="26" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  <path d="M232 470 L468 220" stroke="#ffffff" stroke-width="26" opacity="0.55"/>
  <path d="M262 486 L488 246" stroke="#ffffff" stroke-width="12" opacity="0.4"/>
  ${artwork(350, 330, 276, 300)}
  ${foot(["อะคริลิคหนาประมาณ 3 มม. พิมพ์ระบบ UV", "อยากได้สี/กลิตเตอร์/โฮโลแกรม เลือกช่องถัดไป (คิดเพิ่มตามขนาด)"])}`);

// ── เขียนไฟล์ ────────────────────────────────────────────────────────────
async function render(name, svg) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

/** ภาพจากเว็บตารางราคา (id ของ static.wixstatic.com) + วิธีครอป */
const PHOTOS = {
  // งานจริง "สแตนดี้ + Frame Card ใส" — ตัดแถบข้อความด้านล่างของภาพโปรโมทออก
  "photo-card": { id: "959b83_0e86ae3f424b4f65b81b8a72a2aece7a~mv2", crop: (w, h) => ({ left: 0, top: 0, width: w, height: Math.round(h * 0.8) }) },
  // แผ่น "Standy สแตนดี้+ส่วนเสริม" — เอาครึ่งล่างที่มีช่อง Frame Card ใส บวกเพิ่ม 50 บาท
  "photo-addon": {
    id: "959b83_e15a0e03158f45df911859db6f6dcd4d~mv2",
    crop: (w, h) => ({ left: 0, top: Math.round(h * 0.5), width: w, height: Math.round(h * 0.5) }),
  },
  "photo-1": { id: "959b83_a85460c7247c4b06b76f9a1342f1f801~mv2" },
  "photo-2": { id: "959b83_a676cebfeb7740988332073cb37decb9~mv2" },
  "color-chart": { id: "959b83_ece384645d784b25ab624c67f2cbd4d8~mv2" },
};

async function photos() {
  for (const [name, spec] of Object.entries(PHOTOS)) {
    const res = await fetch(`https://static.wixstatic.com/media/${spec.id}.jpg`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    let img = sharp(Buffer.from(await res.arrayBuffer()));
    if (spec.crop) {
      const meta = await img.metadata();
      img = img.extract(spec.crop(meta.width, meta.height));
    }
    const buf = await img
      .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    writeFileSync(`${OUT}/${name}.jpg`, buf);
    console.log(`📷 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
}

/**
 * คลิปงานจริงจากแกลเลอรีหน้าเว็บตารางราคา (pro-gallery comp-lrukodwt2)
 * ลิงก์ที่ผู้ใช้ส่งมา: /pricestandy?pgid=lrukodwt2-40977f5f-f466-4c58-98e1-81730333f297
 * ไฟล์ต้นทาง VID_462730801_060052_065.mp4 (แนวตั้ง 720×1280 · ~8 วินาที)
 */
const VIDEO = {
  mp4: "https://video.wixstatic.com/video/959b83_fb50afcffef04f81a89ec460cd848aef/720p/mp4/file.mp4",
  poster: "https://static.wixstatic.com/media/959b83_fb50afcffef04f81a89ec460cd848aeff002.jpg",
};

async function clip() {
  const res = await fetch(VIDEO.mp4, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`clip: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`${OUT}/clip-card.mp4`, buf);
  console.log(`🎬 clip-card.mp4 (${Math.round(buf.length / 1024)} KB)`);

  const pres = await fetch(VIDEO.poster, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!pres.ok) throw new Error(`clip-poster: HTTP ${pres.status}`);
  const pbuf = await sharp(Buffer.from(await pres.arrayBuffer()))
    .resize(720, 1280, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  writeFileSync(`${OUT}/clip-card-poster.jpg`, pbuf);
  console.log(`📷 clip-card-poster.jpg (${Math.round(pbuf.length / 1024)} KB)`);
}

await photos();
await clip();
await render("hero", hero);
for (const cm of SIZES) await render(`size-${cm}`, sizeArt(cm));
for (const b of BASES) await render(`base-${b.key}`, baseArt(b));
await render("basescreen-no", baseScreenNo);
await render("basescreen-yes", baseScreenYes);
await render("screen-1", screenArt(1));
await render("screen-2", screenArt(2));
await render("card-slot", cardSlotArt);
await render("clear", clearArt);
await render("layout-portrait", layoutArt(false));
await render("layout-landscape", layoutArt(true));
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
