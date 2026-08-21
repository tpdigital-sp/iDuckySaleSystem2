#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "ปลอกหมอนอิง" (pillowcases-5)
 *
 *   node scripts/pillowcase-cushion-art.mjs [--out=<dir>]
 *
 * ทำไมต้องวาด: ตารางราคาบนเว็บ iduckyofficial-pricelists.com/pillowcases แยกราคาตาม "ขนาด" 7 แบบ
 * แต่รูปงานจริงในหน้านั้นเป็นปลอกหมอนลายลูกค้า ดูไม่ออกว่าแต่ละขนาดใหญ่เล็กต่างกันแค่ไหน
 * ชุดนี้จึงวาดเทียบสเกลจริงทั้ง 7 ขนาด (เส้นประ = 24x24 นิ้ว ขนาดใหญ่สุดในตาราง) ให้ลูกค้าเห็นทันที
 *
 * ได้ 2 ชุด (700x700 · สเกลเดียวกันทั้งชุด · 1 นิ้ว = 14.6 px):
 *   size-12 … size-24   ขนาดปลอก + ราคาช่วงปลีก/ช่วงส่ง ของขนาดนั้น
 *   insert-none/insert-18   "ปลอกอย่างเดียว" เทียบ "พร้อมไส้หมอนอิง 18x18 นิ้ว (+200)"
 *
 * ของจริงเป็นปลอกผ้าฮาร์มิสมีซิปด้านล่าง (ดูรูปงานจริงในแกลเลอรีสินค้า) จึงวาดซิปไว้ทุกภาพ
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 560);

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/pillowcase-cushion").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const GHOST = "#cbd5e1"; // เส้นประเทียบขนาด
const CLOTH = "#eef6fb"; // ผ้าฮาร์มิสสีอ่อน
const CLOTH_EDGE = "#a8c6da";

/** ขนาด (นิ้ว) → [ราคาช่วงปลีก 1-10 ใบ, ราคาช่วง 1000 ใบขึ้นไป] — ตรงกับตารางบนเว็บ */
const SIZES = {
  12: [220, 140],
  14: [245, 155],
  16: [255, 165],
  18: [265, 175],
  20: [285, 195],
  22: [295, 205],
  24: [315, 225],
};
const PX_PER_INCH = 14.6;
const BASE_Y = 520; // ขอบล่างของปลอก — ทุกขนาดวางชิดเส้นเดียวกัน เทียบกันได้ทันที

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="70" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="106" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 38 - (a.length - 1 - i) * 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** รูปทรงหมอน — สี่เหลี่ยมที่ขอบป่องออกและมุมแหลม เหมือนปลอกที่ใส่ใยแล้ว */
const pillowPath = (cx, bottom, w, h) => {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y1 = bottom;
  const y0 = bottom - h;
  const b = Math.max(6, w * 0.045); // ระยะป่องของขอบ
  return `M ${x0} ${y0} Q ${cx} ${y0 - b} ${x1} ${y0} Q ${x1 + b} ${(y0 + y1) / 2} ${x1} ${y1} Q ${cx} ${y1 + b} ${x0} ${y1} Q ${x0 - b} ${(y0 + y1) / 2} ${x0} ${y0} Z`;
};

/** ซิปตามขอบล่าง — ของจริงเปิด-ปิดด้านล่างของปลอก */
const zipper = (cx, bottom, w, open = false) => {
  const half = w * 0.36;
  const y = bottom - w * 0.055;
  const teeth = Math.max(8, Math.round(w / 11));
  const marks = Array.from({ length: teeth }, (_, i) => {
    const x = cx - half + ((half * 2) / (teeth - 1)) * i;
    return `<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="#94a3b8" stroke-width="2"/>`;
  }).join("");
  const slider = open
    ? `<rect x="${cx + half - 14}" y="${y - 9}" width="18" height="18" rx="5" fill="#ffffff" stroke="#94a3b8" stroke-width="2.5"/>`
    : `<rect x="${cx - half - 4}" y="${y - 9}" width="18" height="18" rx="5" fill="#ffffff" stroke="#94a3b8" stroke-width="2.5"/>`;
  return `<line x1="${cx - half}" y1="${y}" x2="${cx + half}" y2="${y}" stroke="#cbd5e1" stroke-width="6" stroke-linecap="round"/>${marks}${slider}`;
};

/** ลายที่สกรีนบนปลอก — มาสคอตเป็ดของฝ่าย Content */
const artwork = (cx, cy, boxW, boxH, opacity = 1) => {
  const w = Math.min(boxW, boxH * MASCOT.ratio);
  const h = w / MASCOT.ratio;
  return `<image href="${MASCOT.uri}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" opacity="${opacity}"/>`;
};

const shadow = (cx, bottom, w) =>
  `<ellipse cx="${cx}" cy="${bottom + 12}" rx="${w * 0.48}" ry="${Math.max(7, w * 0.05)}" fill="#0f172a" opacity="0.07"/>`;

/** ปลอกหมอนเต็มใบ (เงา + ตัวปลอก + ลาย + ซิป) */
const pillow = (cx, bottom, w, h, { open = false, art = true, fill = CLOTH } = {}) => `
  ${shadow(cx, bottom, w)}
  <path d="${pillowPath(cx, bottom, w, h)}" fill="${fill}" stroke="${CLOTH_EDGE}" stroke-width="3" stroke-linejoin="round"/>
  ${art ? artwork(cx, bottom - h / 2 - h * 0.04, w * 0.56, h * 0.62) : ""}
  ${zipper(cx, bottom, w, open)}`;

/** เส้นบอกขนาดแนวนอน ป้ายอยู่ใต้เส้น */
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 32}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวตั้ง ป้ายอยู่ขวาเส้น */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 14}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="24" font-weight="700" fill="${CYAN}">${label}</text>`;

const write = async (name, svg) => {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  return buf.length;
};

/* ── ชุดที่ 1: ขนาดปลอก ─────────────────────────────────────────── */
let total = 0;
for (const [inchStr, [retail, bulk]] of Object.entries(SIZES)) {
  const inch = Number(inchStr);
  const side = inch * PX_PER_INCH;
  const cx = W / 2 - 24; // เผื่อที่ให้ป้ายเส้นบอกขนาดแนวตั้งทางขวา
  const maxSide = 24 * PX_PER_INCH;

  const ghost =
    inch === 24
      ? ""
      : `<path d="${pillowPath(cx, BASE_Y, maxSide, maxSide)}" fill="none" stroke="${GHOST}" stroke-width="2.5" stroke-dasharray="9 8" stroke-linejoin="round"/>`;

  const svg = frame(`
    ${title(`ปลอกหมอนอิง ${inch}x${inch} นิ้ว`, inch === 24 ? "ขนาดใหญ่สุดในตาราง" : "เส้นประ = 24x24 นิ้ว (ใหญ่สุด) ไว้เทียบขนาด")}
    ${ghost}
    ${pillow(cx, BASE_Y, side, side)}
    ${dimH(BASE_Y + 40, cx - side / 2, cx + side / 2, `${inch} นิ้ว`)}
    ${dimV(cx + side / 2 + 26, BASE_Y - side, BASE_Y, `${inch} นิ้ว`)}
    ${foot([`เนื้อผ้าฮาร์มิส · มีซิปด้านล่าง · ไม่รวมไส้หมอน`, `1-10 ใบ ใบละ ฿${retail} · 1000 ใบขึ้นไป ใบละ ฿${bulk}`])}
  `);
  total += await write(`size-${inch}`, svg);
}

/* ── ชุดที่ 2: ไส้หมอน ──────────────────────────────────────────── */
const COVER_CX = 214;
const INSERT_CX = 486;
const PAIR_BASE = 470;
const PAIR_SIDE = 200;

/** ไส้หมอนอิง — ใยสังเคราะห์ ไม่มีลาย วาดเป็นสีขาวนวลให้แยกออกจากปลอก */
const insertShape = (cx, bottom, side, { muted = false } = {}) => `
  ${muted ? "" : shadow(cx, bottom, side)}
  <path d="${pillowPath(cx, bottom, side, side)}" fill="${muted ? "#f1f5f9" : "#ffffff"}" stroke="${muted ? GHOST : "#cbd5e1"}" stroke-width="3" stroke-dasharray="${muted ? "9 8" : "0"}" stroke-linejoin="round"/>
  ${muted ? "" : `<path d="M ${cx - side * 0.22} ${bottom - side * 0.62} q ${side * 0.22} ${side * 0.12} ${side * 0.44} 0" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>
  <path d="M ${cx - side * 0.26} ${bottom - side * 0.4} q ${side * 0.26} ${side * 0.13} ${side * 0.52} 0" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>`}`;

const badge = (cx, cy, mark, tone) => `
  <circle cx="${cx}" cy="${cy}" r="27" fill="${tone}" opacity="0.12"/>
  <circle cx="${cx}" cy="${cy}" r="27" fill="none" stroke="${tone}" stroke-width="3"/>
  <text x="${cx}" y="${cy + 12}" font-family="${TH}" font-size="32" font-weight="700" text-anchor="middle" fill="${tone}">${mark}</text>`;

const caption = (cx, y, main, sub, tone) => `
  <text x="${cx}" y="${y}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${tone}">${main}</text>
  <text x="${cx}" y="${y + 30}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">${sub}</text>`;

const insertSvg = (withInsert) =>
  frame(`
    ${title(
      withInsert ? "พร้อมไส้หมอนอิง 18x18 นิ้ว" : "ปลอกอย่างเดียว (ไม่มีไส้หมอน)",
      withInsert ? "บวกเพิ่มใบละ 200 บาท — ได้ปลอก + ไส้หมอนใยสังเคราะห์" : "ราคาตามตาราง — ลูกค้าใส่ไส้หมอนเองภายหลัง"
    )}
    ${pillow(COVER_CX, PAIR_BASE, PAIR_SIDE, PAIR_SIDE, { open: !withInsert })}
    <text x="${(COVER_CX + INSERT_CX) / 2}" y="${PAIR_BASE - PAIR_SIDE / 2 + 14}" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${withInsert ? CYAN : GHOST}">+</text>
    ${insertShape(INSERT_CX, PAIR_BASE, PAIR_SIDE, { muted: !withInsert })}
    ${badge(COVER_CX + PAIR_SIDE / 2 + 6, PAIR_BASE - PAIR_SIDE + 6, "✓", CYAN)}
    ${badge(INSERT_CX + PAIR_SIDE / 2 + 6, PAIR_BASE - PAIR_SIDE + 6, withInsert ? "✓" : "✕", withInsert ? CYAN : "#94a3b8")}
    ${caption(COVER_CX, PAIR_BASE + 62, "ปลอกพิมพ์ลาย", "ผ้าฮาร์มิส มีซิปด้านล่าง", INK)}
    ${caption(INSERT_CX, PAIR_BASE + 62, withInsert ? "ไส้หมอน 18x18 นิ้ว" : "ไส้หมอน (ไม่รวม)", withInsert ? "ใยสังเคราะห์ ยัดเต็มใบ" : "สั่งเพิ่มได้ ใบละ +200", withInsert ? INK : SUB)}
    ${foot([withInsert ? "เลือกได้เฉพาะขนาด 18x18 นิ้ว (ขนาดไส้หมอนที่ร้านมี)" : "ทุกขนาดตั้งแต่ 12x12 ถึง 24x24 นิ้ว"])}
  `);

total += await write("insert-none", insertSvg(false));
total += await write("insert-18", insertSvg(true));

console.log(`🖼  วาดเสร็จ ${Object.keys(SIZES).length + 2} ภาพ → ${OUT}/ (รวม ${(total / 1024).toFixed(0)} KB)`);
console.log(`   size-12 … size-24 · insert-none · insert-18`);
console.log(`   ขั้นต่อไป: node scripts/pillowcase-cushion-apply.mjs      (ดูก่อน)`);
