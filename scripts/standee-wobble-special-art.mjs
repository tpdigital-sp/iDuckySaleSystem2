#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือก "Add on อะคริลิคพิเศษ" ของสินค้าสแตนดี้โยกเยก
 *
 *   node scripts/standee-wobble-special-art.mjs [--out=<dir>]
 *
 * สแตนดี้โยกเยก 1 ชุด = 3 ชิ้น: ตัวกลาง 1 + ฐานโยกเยก 2 ข้าง (ซ้าย/ขวา ประกบกัน)
 * ลูกค้าเลือกได้ว่าจะเปลี่ยนชิ้นไหนเป็นอะคริลิคพิเศษ จึงต้องมีภาพบอกว่าแต่ละแบบคือชิ้นไหน
 *
 * ใช้สไตล์เดียวกับ scripts/standee-wobble-art.mjs (กรอบขาว หัวเรื่อง ชิ้นที่เลือก = สีเหลืองไฮไลต์)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ — CDN/Next แคชของเก่าไว้ ชุดนี้จึงลงท้าย -v2
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/wobble/special").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 700, H = 700;
const TH = "'Thonburi','Sukhumvit Set',sans-serif";
const INK = "#0f172a", SUB = "#64748b", LINE = "#94a3b8";
const GLASS = "rgba(56,189,248,0.20)", GLASS_EDGE = "#38bdf8";
const HOT = "rgba(251,191,36,0.30)", HOT_EDGE = "#f59e0b";
const DIM = "rgba(148,163,184,0.16)", DIM_EDGE = "#cbd5e1";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const artwork = (cx, cy, w, h) => {
  const r = Math.min(w, h);
  return `<g opacity="0.9">
    <circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="#fbbf24"/>
    <circle cx="${cx - r * 0.1}" cy="${cy - r * 0.05}" r="${r * 0.04}" fill="#0f172a"/>
    <circle cx="${cx + r * 0.1}" cy="${cy - r * 0.05}" r="${r * 0.04}" fill="#0f172a"/>
    <path d="M${cx - r * 0.11} ${cy + r * 0.08} q${r * 0.11} ${r * 0.09} ${r * 0.22} 0" stroke="#0f172a" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>`;
};

const rocker = (cx, topY, w, d, fill, edge) => `
  <path d="M${cx - w / 2} ${topY} Q${cx} ${topY + d * 2} ${cx + w / 2} ${topY}
           L${cx + w / 2} ${topY - d * 0.3} Q${cx} ${topY - d * 0.08} ${cx - w / 2} ${topY - d * 0.3} Z"
    fill="${fill}" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>`;

const PX_PER_CM = 26, GROUND = 528;
function geom(cm) {
  const total = cm * PX_PER_CM;
  const baseD = total * 0.22, baseW = total * 0.95;
  const baseTop = GROUND - baseD, bodyTop = GROUND - total;
  const bodyH = baseTop + 10 - bodyTop, bodyW = bodyH * 0.8;
  return { total, baseD, baseW, baseTop, bodyTop, bodyH, bodyW };
}

/** ป้ายชี้ชิ้นที่เลือก — ชี้ขึ้นขวา */
const tag = (x, y, text) => `
  <path d="M${x} ${y} L${x + 84} ${y - 40}" stroke="${HOT_EDGE}" stroke-width="3"/>
  <circle cx="${x}" cy="${y}" r="8" fill="${HOT_EDGE}"/>
  <text x="${x + 92}" y="${y - 32}" font-family="${TH}" font-size="26" font-weight="700"
    text-anchor="start" fill="${HOT_EDGE}">${text}</text>`;

/** ป้ายของฐาน — ชี้ลงมาไว้ใต้ฐาน กันข้อความตกขอบภาพ */
const tagBelow = (x, y, text) => `
  <path d="M${x} ${y} L${x - 30} ${y + 56}" stroke="${HOT_EDGE}" stroke-width="3"/>
  <circle cx="${x}" cy="${y}" r="8" fill="${HOT_EDGE}"/>
  <text x="${x - 38}" y="${y + 70}" font-family="${TH}" font-size="26" font-weight="700"
    text-anchor="middle" fill="${HOT_EDGE}">${text}</text>`;

/**
 * ชุดสแตนดี้โยกเยก — ฐานวาด 2 ชั้นให้เห็นว่าเป็น 2 ชิ้นประกบ (ซ้าย/ขวา)
 * parts = ชิ้นที่ไฮไลต์: "figure" | "base" | "all" | "none"
 */
function shot(parts, titleText, subText, note) {
  const cx = 300, g = geom(13);
  const figOn = parts === "figure" || parts === "all";
  const baseOn = parts === "base" || parts === "all";
  const fFill = figOn ? HOT : parts === "none" ? GLASS : DIM;
  const fEdge = figOn ? HOT_EDGE : parts === "none" ? GLASS_EDGE : DIM_EDGE;
  const bFill = baseOn ? HOT : parts === "none" ? GLASS : DIM;
  const bEdge = baseOn ? HOT_EDGE : parts === "none" ? GLASS_EDGE : DIM_EDGE;
  return frame(`
    ${title(titleText, subText)}
    <line x1="${cx - g.baseW / 2 - 46}" y1="${GROUND + 8}" x2="${cx + g.baseW / 2 + 46}" y2="${GROUND + 8}" stroke="#e2e8f0" stroke-width="4"/>
    <g opacity="0.55">${rocker(cx - 16, g.baseTop - 12, g.baseW, g.baseD, bFill, bEdge)}</g>
    ${rocker(cx + 16, g.baseTop, g.baseW, g.baseD, bFill, bEdge)}
    <rect x="${cx - g.bodyW / 2}" y="${g.bodyTop}" width="${g.bodyW}" height="${g.bodyH}" rx="40"
      fill="${fFill}" stroke="${fEdge}" stroke-width="4"/>
    ${artwork(cx, g.bodyTop + g.bodyH * 0.38, g.bodyW, g.bodyH)}
    ${figOn ? tag(cx + g.bodyW / 2, g.bodyTop + g.bodyH * 0.3, "ตัวกลาง") : ""}
    ${baseOn ? tagBelow(cx - g.baseW / 2 + 46, g.baseTop + g.baseD * 0.5, "ฐานโยกเยก ×2") : ""}
    <text x="${W / 2}" y="${H - 46}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${note}</text>
    <text x="${W / 2}" y="${H - 20}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${LINE}">1 ชุด = ตัวกลาง 1 ชิ้น + ฐานโยกเยก 2 ชิ้น (ซ้าย/ขวา)</text>`);
}

const svgs = {
  "special-none-v2": shot("none", "อะคริลิคใส / ขาวขุ่น C-02", "แบบมาตรฐาน — ไม่บวกเพิ่ม",
    "ราคาตามตารางปกติ"),
  "special-figure-v2": shot("figure", "อะคริลิคพิเศษ — เฉพาะตัวกลาง", "ตัวละคร/ลายด้านบน 1 ชิ้น",
    "คิดเพิ่ม 1 ชิ้น · ฐานโยกเยกยังเป็นอะคริลิคใส"),
  "special-base-v2": shot("base", "อะคริลิคพิเศษ — เฉพาะฐานโยกเยก", "ฐานซ้าย + ฐานขวา รวม 2 ชิ้น",
    "คิดเพิ่ม 2 ชิ้น · ตัวกลางยังเป็นอะคริลิคใส"),
  "special-all-v2": shot("all", "อะคริลิคพิเศษ — ทั้งชุด", "ตัวกลาง + ฐานซ้าย + ฐานขวา รวม 3 ชิ้น",
    "คิดเพิ่ม 3 ชิ้น"),
};
for (const [name, svg] of Object.entries(svgs)) {
  await sharp(Buffer.from(svg)).png().resize(700, 700).jpeg({ quality: 90 }).toFile(`${OUT}/${name}.jpg`);
}
console.log(`✅ ${Object.keys(svgs).length} ภาพ → ${OUT}`);
