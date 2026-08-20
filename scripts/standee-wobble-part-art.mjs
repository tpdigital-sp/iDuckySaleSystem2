#!/usr/bin/env node
/**
 * ภาพประกอบ "ชนิดอะคริลิคของแต่ละชิ้น" ของสินค้าสแตนดี้โยกเยก
 *
 *   node scripts/standee-wobble-part-art.mjs [--out=<dir>]
 *
 * 1 ชุด = 3 ชิ้น: ตัวกลาง 1 + ฐานโยกเยก 2 (ซ้าย/ขวา ประกบกัน)
 * ลูกค้าเลือกชนิดอะคริลิคแยกทีละชิ้น จึงต้องมีภาพบอกว่า "ชิ้นไหน" และ "ใส/พิเศษ"
 *   part-figure-*  ตัวกลาง · part-baseL-*  ฐานซ้าย · part-baseR-*  ฐานขวา
 *   *-plain = อะคริลิคใส (ฟ้าอ่อน) · *-special = อะคริลิคพิเศษ (ไฮไลต์เหลือง)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ — CDN/Next แคชของเก่า ชุดนี้ลงท้าย -v3
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";
// ลายที่ "สกรีน" บนชิ้นงานในภาพประกอบ = มาสคอตเป็ด iDucky ของฝ่าย Content (น่ารักกว่าวาดเอง)
import { mascotDataUri } from "./iducky-assets.mjs";

let MASCOT = null;
/** โหลดมาสคอตครั้งเดียวตอนเริ่มเรนเดอร์ (ไม่ใช้ top-level await — สคริปต์อื่น import ไฟล์นี้ได้) */
const loadMascot = async () => (MASCOT ??= await mascotDataUri("heart", 560));
// สคริปต์นี้รันตรง ๆ อย่างเดียว (ไม่มีไฟล์ไหน import) — โหลดมาสคอตก่อนสร้าง SVG ได้เลย
await loadMascot();


const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/wobble/parts").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 700, H = 700;
const TH = "'Thonburi','Sukhumvit Set',sans-serif";
const INK = "#0f172a", SUB = "#64748b", LINE = "#94a3b8";
const GLASS = "rgba(56,189,248,0.20)", GLASS_EDGE = "#38bdf8";
const HOT = "rgba(251,191,36,0.32)", HOT_EDGE = "#f59e0b";
const DIM = "rgba(148,163,184,0.14)", DIM_EDGE = "#cbd5e1";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="74" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="114" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

/**
 * ลายที่สกรีนบนชิ้นงาน — ใช้มาสคอตเป็ด iDucky (ไฟล์จริงจากฝ่าย Content)
 * รับรัศมีกรอบ (r) แล้ววางภาพให้พอดีกรอบสี่เหลี่ยมจัตุรัสรอบจุดนั้น
 */
const artwork = (cx, cy, r) => {
  const box = r * 0.98;
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet"/>`;
};

const rocker = (cx, topY, w, d, fill, edge) => `
  <path d="M${cx - w / 2} ${topY} Q${cx} ${topY + d * 2} ${cx + w / 2} ${topY}
           L${cx + w / 2} ${topY - d * 0.3} Q${cx} ${topY - d * 0.08} ${cx - w / 2} ${topY - d * 0.3} Z"
    fill="${fill}" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>`;

const PX_PER_CM = 26, GROUND = 524;
function geom(cm) {
  const total = cm * PX_PER_CM;
  const baseD = total * 0.22, baseW = total * 0.95;
  const baseTop = GROUND - baseD, bodyTop = GROUND - total;
  const bodyH = baseTop + 10 - bodyTop, bodyW = bodyH * 0.8;
  return { total, baseD, baseW, baseTop, bodyTop, bodyH, bodyW };
}

/** ป้ายชี้ชิ้นที่กำลังพูดถึง */
const tag = (x, y, text, dx, dy, anchor) => `
  <path d="M${x} ${y} L${x + dx} ${y + dy}" stroke="${HOT_EDGE}" stroke-width="3"/>
  <circle cx="${x}" cy="${y}" r="8" fill="${HOT_EDGE}"/>
  <text x="${x + dx + (anchor === "end" ? -8 : 8)}" y="${y + dy + (dy < 0 ? -4 : 22)}"
    font-family="${TH}" font-size="27" font-weight="700" text-anchor="${anchor}" fill="${HOT_EDGE}">${text}</text>`;

/**
 * @param part  "figure" | "baseL" | "baseR"   ชิ้นที่กำลังพูดถึง
 * @param mode  "plain" | "special"            ใส หรือ อะคริลิคพิเศษ
 */
function shot(part, mode) {
  const cx = 320, g = geom(13);
  const hot = mode === "special";
  const on = { fill: hot ? HOT : GLASS, edge: hot ? HOT_EDGE : GLASS_EDGE };
  const off = { fill: DIM, edge: DIM_EDGE };
  const fig = part === "figure" ? on : off;
  const bL = part === "baseL" ? on : off;
  const bR = part === "baseR" ? on : off;

  const names = { figure: "ตัวกลาง", baseL: "ฐานโยกเยก (ซ้าย)", baseR: "ฐานโยกเยก (ขวา)" };
  const subs = {
    figure: "ตัวละคร/ลายด้านบน — สกรีน 2 ด้าน",
    baseL: "ส่วนโค้งชิ้นซ้าย — สกรีน 1 ด้าน",
    baseR: "ส่วนโค้งชิ้นขวา — สกรีน 1 ด้าน",
  };
  const modeText = hot
    ? "อะคริลิคพิเศษ (สี · กลิตเตอร์ · โฮโลแกรม) — คิดเพิ่มตามขนาด"
    : "อะคริลิคใส / ขาวขุ่น C-02 — ไม่บวกเพิ่ม";

  // ฐานซ้ายวาดเหลื่อมไปทางซ้าย ฐานขวาเหลื่อมไปทางขวา ให้เห็นว่าเป็นคนละชิ้น
  const pointer =
    part === "figure"
      ? tag(cx + g.bodyW / 2, g.bodyTop + g.bodyH * 0.3, names.figure, 78, -44, "start")
      : part === "baseL"
        ? tag(cx - 26 - g.baseW / 2 + 34, g.baseTop - 4, "ชิ้นซ้าย", -70, 74, "middle")
        : tag(cx + 26 + g.baseW / 2 - 34, g.baseTop + 12, "ชิ้นขวา", 70, 62, "middle");

  return frame(`
    ${title(names[part], subs[part])}
    <line x1="${cx - g.baseW / 2 - 74}" y1="${GROUND + 8}" x2="${cx + g.baseW / 2 + 74}" y2="${GROUND + 8}" stroke="#e2e8f0" stroke-width="4"/>
    ${rocker(cx - 26, g.baseTop - 10, g.baseW, g.baseD, bL.fill, bL.edge)}
    ${rocker(cx + 26, g.baseTop + 6, g.baseW, g.baseD, bR.fill, bR.edge)}
    <rect x="${cx - g.bodyW / 2}" y="${g.bodyTop}" width="${g.bodyW}" height="${g.bodyH}" rx="40"
      fill="${fig.fill}" stroke="${fig.edge}" stroke-width="4"/>
    ${artwork(cx, g.bodyTop + g.bodyH * 0.38, Math.min(g.bodyW, g.bodyH))}
    ${pointer}
    <text x="${W / 2}" y="${H - 52}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${hot ? HOT_EDGE : SUB}">${modeText}</text>
    <text x="${W / 2}" y="${H - 24}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${LINE}">1 ชุด = ตัวกลาง 1 ชิ้น + ฐานโยกเยก 2 ชิ้น (ซ้าย/ขวา)</text>`);
}

const svgs = {};
for (const part of ["figure", "baseL", "baseR"]) {
  for (const mode of ["plain", "special"]) svgs[`part-${part}-${mode}-v3`] = shot(part, mode);
}
for (const [name, svg] of Object.entries(svgs)) {
  await sharp(Buffer.from(svg)).png().resize(700, 700).jpeg({ quality: 90 }).toFile(`${OUT}/${name}.jpg`);
}
console.log(`✅ ${Object.keys(svgs).length} ภาพ → ${OUT}`);
