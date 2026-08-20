#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของสินค้า Carabiner Acrylic (อะคริลิคไดคัทเป็นตัวตะขอในตัว + ก้านตะขอสแตนเลส)
 *
 *   node scripts/carabiner-art.mjs [--out=<dir>]      # วาดลง .cache/carabiner/upload
 *
 * ได้:
 *   clear-plain-v2            ประเภทอะคริลิค → อะคริลิคใส (อีก 2 ตัวใช้สวอตช์จริงจากชาร์ตสีกลาง)
 *   size-5..size-10           ขนาดชิ้นงาน 5-10 ซม. (สเกลจริง เทียบกันได้ทั้งชุด)
 *   part-small | part-large   อะไหล่ "ก้านตะขอ" 1.8 / 2.8 ซม.
 *   print-1 | print-2         สกรีน 1 ด้าน / 2 ด้าน
 *   hook-extra                เพิ่มก้านตะขอ (+15 บาท/ก้าน)
 *
 * ทรงชิ้นงานอ้างจากภาพงานจริงของหน้าสินค้า — ส่วนบนเป็นลายที่สกรีน ส่วนล่างไดคัทเป็นห่วงเจาะกลาง
 * แล้วมีก้านตะขอสแตนเลสหมุดติดที่ห่วง ดีดปิดเป็นตัวเกี่ยว (ไม่ใช่ห่วงคาราไบเนอร์โลหะแยกชิ้น)
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องขึ้นเลขรุ่นใหม่เสมอ
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
// ลายที่ "สกรีน" บนชิ้นงานในภาพประกอบ = มาสคอตเป็ด iDucky ของฝ่าย Content
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 560);

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/carabiner/upload").replace(
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
const METAL = "#cbd5e1";
const METAL_EDGE = "#94a3b8";

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
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 20}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="28" font-weight="700" fill="${CYAN}">${label}</text>`;

/** ลายที่สกรีน — วางกลางพื้นที่ลายโดยคงสัดส่วนภาพจริง */
const artwork = (cx, cy, box, opacity = 1) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/**
 * ก้านตะขอสแตนเลส — หมุดที่ห่วงด้านล่าง โก่งออกทางซ้าย ปลายงอเกี่ยวกับขอบห่วงด้านบน
 * (r = จุดหมุด · t = ปลายก้าน · bow = ระยะที่โก่งออก)
 */
function gateWire(rx, ry, tx, ty, bow, color = METAL_EDGE, dash = false) {
  const d = `M${rx} ${ry} C${rx - bow} ${ry - (ry - ty) * 0.35} ${tx - bow} ${ty + (ry - ty) * 0.45} ${tx} ${ty}`;
  return `
    <path d="${d}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"
      ${dash ? 'stroke-dasharray="10 9" opacity="0.55"' : ""}/>
    ${dash ? "" : `<path d="${d}" fill="none" stroke="#f1f5f9" stroke-width="3" stroke-linecap="round" opacity="0.85"/>`}
    ${dash ? "" : `<circle cx="${rx}" cy="${ry}" r="9" fill="${METAL}" stroke="${METAL_EDGE}" stroke-width="3"/>`}`;
}

/**
 * ชิ้นงาน 1 ชิ้น — h คือด้านที่ยาวที่สุด (ตามวิธีวัดขนาดของร้าน)
 * อะคริลิคเป็นแผ่นเดียวไดคัทรวด — ครึ่งบนเป็นลายที่สกรีน ครึ่งล่างเจาะเป็นช่องเกี่ยว
 * แล้วมีก้านตะขอสแตนเลสหมุดอยู่ริมซ้าย ดีดปิดช่องไว้ (ตามงานจริงในภาพสินค้า)
 */
function piece(cx, top, h, o = {}) {
  const {
    fill = GLASS,
    edge = GLASS_EDGE,
    gates = 1, // จำนวนก้านตะขอ (มาตรฐาน 1 ก้าน)
    gateSide = "left", // พลิกดูอีกด้าน ก้านจะสลับไปอยู่ฝั่งตรงข้าม
    gateColor = METAL_EDGE,
    ghost = false,
    blank = false, // ด้านหลังไม่มีลาย
  } = o;
  const w = h * 0.66;
  const left = cx - w / 2;
  const band = w * 0.2; // ความหนาของเนื้ออะคริลิครอบช่องเกี่ยว
  const holeTop = top + h * 0.54;
  const holeH = h * 0.46 - band;
  if (ghost)
    return `<rect x="${left}" y="${top}" width="${w}" height="${h}" rx="${w * 0.22}"
      fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="8 8"/>`;
  const flip = gateSide === "right" ? -1 : 1;
  const rivetX = flip > 0 ? left + band * 0.5 : left + w - band * 0.5;
  const rivetY = holeTop + holeH - band * 0.1;
  const tipY = holeTop + band * 0.2;
  return `
    <!-- แผ่นอะคริลิคไดคัทรวดชิ้นเดียว -->
    <rect x="${left}" y="${top}" width="${w}" height="${h}" rx="${w * 0.22}" fill="${fill}" stroke="${edge}" stroke-width="4"/>
    <path d="M${left + w * 0.16} ${top + h * 0.9} L${left + w * 0.84} ${top + h * 0.12}"
      stroke="#ffffff" stroke-width="${w * 0.12}" opacity="0.45" stroke-linecap="round"/>
    ${blank ? "" : artwork(cx, top + h * 0.29, Math.min(w * 0.8, h * 0.44))}
    ${blank ? `<text x="${cx}" y="${top + h * 0.31}" font-family="${TH}" font-size="${Math.max(15, w * 0.12)}" text-anchor="middle" fill="${LINE}">ไม่มีลาย</text>` : ""}
    <!-- ช่องเกี่ยวที่เจาะไว้ครึ่งล่าง -->
    <rect x="${left + band}" y="${holeTop}" width="${w - band * 2}" height="${holeH}" rx="${band * 0.7}"
      fill="#ffffff" stroke="${edge}" stroke-width="3"/>
    <!-- ก้านตะขอ (หมุดริมซ้าย โก่งออกนอกแผ่น ปลายกลับมาชนขอบบนของช่อง) -->
    ${gateWire(rivetX, rivetY, rivetX, tipY, flip * w * 0.34, gateColor)}
    ${gates > 1 ? gateWire(left + w - band * 0.5, rivetY, left + w - band * 0.5, tipY, -w * 0.34, gateColor) : ""}`;
}

// ── ประเภทอะคริลิค → อะคริลิคใส ─────────────────────────────────────────
const clearArt = frame(`
  ${title("อะคริลิคใส", "ชนิดมาตรฐาน หนา 3 มม. · เนื้อใสมองทะลุ")}
  ${piece(350, 168, 372)}
  ${foot([
    "อะคริลิคไดคัทเป็นตัวตะขอในตัว + ก้านตะขอสแตนเลส 1 ก้าน",
    "ราคาตามตารางคือชนิดนี้ (เท่ากับขาวขุ่น C-02)",
    "อยากได้กลิตเตอร์/โฮโลแกรม เลือก 'สีพิเศษ' ได้",
  ])}`);

// ── ขนาด 5-10 ซม. (สเกลจริง — เทียบกันได้ทั้งชุด) ─────────────────────────
const PX_PER_CM = 40; // 10 ซม. = 400px
const GROUND = 596; // ปลายล่างของชิ้นงานในภาพ
function sizeArt(cm) {
  const h = cm * PX_PER_CM;
  const top = GROUND - h;
  const ghostH = 10 * PX_PER_CM;
  return frame(`
    ${title(`ขนาด ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุดของอะคริลิค")}
    ${piece(330, GROUND - ghostH, ghostH, { ghost: true })}
    ${piece(330, top, h)}
    ${dimV(330 + (ghostH * 0.62) / 2 + 40, top, GROUND, `${cm} ซม.`)}
    ${foot(["เส้นประ = ขนาดใหญ่สุด 10 ซม. ไว้เทียบ", "ขนาดอื่นแจ้งในหมายเหตุถึงร้านได้"])}`);
}

// ── อะไหล่ "ก้านตะขอ" 1.8 / 2.8 ซม. ─────────────────────────────────────
const GATE_PX_PER_CM = 74;

/**
 * ก้านตะขอแบบขยาย วางตั้ง — หูหมุดด้านล่าง · ก้านโก่งเล็กน้อย · ปลายงอเป็นตะขอ
 * len = ความยาวจริงในภาพ (px)
 */
function gatePart(x, bottom, len, color, dash = false) {
  const d =
    `M${x} ${bottom - 14} C${x - 20} ${bottom - len * 0.45} ${x - 20} ${bottom - len * 0.72} ${x - 2} ${bottom - len + 18} ` +
    `C${x + 12} ${bottom - len + 4} ${x + 26} ${bottom - len + 10} ${x + 26} ${bottom - len + 26}`;
  return `
    <path d="${d}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"
      ${dash ? 'stroke-dasharray="10 9" opacity="0.6"' : ""}/>
    ${dash ? "" : `<path d="${d}" fill="none" stroke="#f1f5f9" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`}
    <circle cx="${x}" cy="${bottom}" r="14" fill="none" stroke="${color}" stroke-width="8"
      ${dash ? 'stroke-dasharray="7 7" opacity="0.6"' : ""}/>`;
}

function gateArt(cm, other) {
  const base = 540; // ระดับหูหมุดของก้านที่โชว์ขยาย
  return frame(`
    ${title(`ก้านตะขอ ${cm} ซม.`, cm < 2 ? "ก้านสั้น — งานชิ้นเล็ก เกี่ยวห่วง/ซิป" : "ก้านยาว — เกี่ยวสายกระเป๋าหนา ๆ ได้ถนัดกว่า")}
    ${piece(215, 178, 340, { gateColor: CYAN })}
    <text x="215" y="576" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ก้านหมุดที่ริมแผ่น ดีดปิดช่องเกี่ยวไว้</text>
    <!-- ก้านแบบขยาย: ขนาดที่เลือก (ทึบ) เทียบกับอีกขนาด (เส้นประ) -->
    ${gatePart(555, base, other * GATE_PX_PER_CM, LINE, true)}
    ${gatePart(440, base, cm * GATE_PX_PER_CM, CYAN)}
    ${dimV(490, base - cm * GATE_PX_PER_CM, base, `${cm} ซม.`)}
    <text x="440" y="${base + 44}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${CYAN}">ขนาดนี้</text>
    <text x="555" y="${base + 44}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${LINE}">${other} ซม.</text>
    ${foot(["ก้านสแตนเลส เลือกได้ 2 ขนาด · มาตรฐานให้ 1 ก้าน/ชิ้น", "ไม่สกรีนลายตรงจุดหมุดก้าน เพราะงานสกรีนจะหลุดเวลาใช้งาน"])}`);
}

// ── สกรีน 1 ด้าน / 2 ด้าน ────────────────────────────────────────────────
function printArt(sides) {
  const two = sides === 2;
  return frame(`
    ${title(`สกรีน ${sides} ด้าน`, two ? "เห็นลายทั้งหน้าและหลัง" : "ลายด้านหน้า · ด้านหลังเป็นเนื้ออะคริลิคเปล่า")}
    ${piece(205, 178, 300)}
    <text x="205" y="524" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
    <text x="350" y="360" font-family="${TH}" font-size="34" text-anchor="middle" fill="${LINE}">↔</text>
    ${piece(495, 178, 300, { blank: !two, gateSide: "right" })}
    <text x="495" y="524" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle"
      fill="${two ? INK : LINE}">ด้านหลัง</text>
    ${foot([
      two ? "สั่งไฟล์ลายหลังมาด้วย ถ้าไม่ส่งจะใช้ลายเดียวกับด้านหน้า" : "อยากได้ลายหลังด้วย เลือก 'สกรีน 2 ด้าน'",
      "ไม่สกรีนตรงจุดหมุดก้านตะขอ เพราะงานสกรีนจะหลุดเวลาใช้งาน",
    ])}`);
}

// ── เพิ่มก้านตะขอ ────────────────────────────────────────────────────────
const hookExtraArt = frame(`
  ${title("เพิ่มก้านตะขอ", "มาตรฐาน 1 ก้าน — เพิ่มได้ ก้านละ 15 บาท")}
  ${piece(350, 168, 350, { gates: 2, gateColor: CYAN })}
  <text x="350" y="576" font-family="${TH}" font-size="23" text-anchor="middle" fill="${CYAN}">เกี่ยวได้ 2 จุด — ทั้งซ้ายและขวา</text>
  ${foot(["ระบุจำนวนก้านที่ต้องการในหน้าสั่งซื้อ (คิดเพิ่มก้านละ 15 บาท/ชิ้น)", "ตำแหน่งหมุดก้านทางร้านจัดให้ตามรูปทรงของลาย"])}`);

// ── เขียนไฟล์ ────────────────────────────────────────────────────────────
async function render(name, svg) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

await render("clear-plain-v2", clearArt);
for (let cm = 5; cm <= 10; cm++) await render(`size-${cm}-v1`, sizeArt(cm));
await render("part-small-v1", gateArt(1.8, 2.8));
await render("part-large-v1", gateArt(2.8, 1.8));
await render("print-1-v1", printArt(1));
await render("print-2-v1", printArt(2));
await render("hook-extra-v1", hookExtraArt);
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
