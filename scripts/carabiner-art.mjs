#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของสินค้า Carabiner Acrylic (อะคริลิคไดคัทเป็นตัวตะขอในตัว + ก้านตะขอสแตนเลส)
 *
 *   node scripts/carabiner-art.mjs [--out=<dir>]      # วาดลง .cache/carabiner/upload
 *
 * ได้:
 *   clear-plain-v3            ประเภทอะคริลิค → อะคริลิคใส (อีก 2 ตัวใช้สวอตช์จริงจากชาร์ตสีกลาง)
 *   size-5..size-10           ขนาดชิ้นงาน 5-10 ซม. (สเกลจริง เทียบกันได้ทั้งชุด)
 *   part-small | part-large   อะไหล่ "ก้านตะขอ" 1.8 / 2.8 ซม.
 *   print-1 | print-2         สกรีน 1 ด้าน / 2 ด้าน
 *   hook-extra                เพิ่มก้านตะขอ (+15 บาท/ก้าน)
 *
 * ทรงชิ้นงานอ้างจากภาพงานจริงของหน้าสินค้า — อะคริลิคไดคัทตามลาย เหลือขอบใสรอบ ๆ
 * แล้วมีก้านตะขอสแตนเลสหมุดที่ริมแผ่น ดีดขึ้นเป็นตัวเกี่ยว (ไม่ใช่ห่วงคาราไบเนอร์โลหะแยกชิ้น)
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
 * ก้านตะขอสแตนเลสบนชิ้นงาน — หมุดที่ริมแผ่นด้านล่าง โก่งออกนิดหน่อย ปลายงอเป็นตะขอชี้ขึ้น
 * (rx,ry = จุดหมุด · tx,ty = ปลายก้าน · bow = ระยะที่โก่งออก · ติดลบ = โก่งไปทางขวา)
 */
function gateWire(rx, ry, tx, ty, bow, color = METAL_EDGE) {
  const d =
    `M${rx} ${ry} C${rx - bow} ${ry - (ry - ty) * 0.4} ${tx - bow} ${ty + (ry - ty) * 0.45} ${tx} ${ty} ` +
    `C${tx + bow * 0.9} ${ty - 26} ${tx + bow * 2.2} ${ty - 6} ${tx + bow * 1.5} ${ty + 24}`;
  return `
    <path d="${d}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#f1f5f9" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    <circle cx="${rx}" cy="${ry}" r="10" fill="${METAL}" stroke="${METAL_EDGE}" stroke-width="3"/>`;
}

/** ตัวนับไว้ตั้งชื่อ filter ไม่ให้ชนกัน (รัศมีไดคัทต่างกันตามขนาดชิ้นงาน) */
let cutId = 0;

/**
 * ชิ้นงาน 1 ชิ้น — h คือด้านที่ยาวที่สุด (ตามวิธีวัดขนาดของร้าน)
 *
 * งานจริงคือ "ไดคัทตามลาย" — อะคริลิคถูกตัดตามรูปลายโดยเหลือขอบใสไว้รอบ ๆ
 * แล้วมีก้านตะขอสแตนเลสหมุดที่ริมแผ่น ดีดเป็นตัวเกี่ยว (ดูภาพงานจริงในแกลเลอรีสินค้า)
 * ขอบใสรอบลายวาดด้วย feMorphology (ขยายเงาของลายออกไปแล้วเติมสีอะคริลิค)
 */
function piece(cx, top, h, o = {}) {
  const {
    fill = "#dbf2fe", // เนื้ออะคริลิคใสในภาพวาด
    edge = GLASS_EDGE,
    gates = 1, // จำนวนก้านตะขอ (มาตรฐาน 1 ก้าน)
    gateSide = "left", // พลิกดูอีกด้าน ก้านจะสลับไปอยู่ฝั่งตรงข้าม
    gateColor = METAL_EDGE,
    ghost = false, // เงาจาง ๆ ไว้เทียบขนาด
    blank = false, // ด้านที่ไม่มีลาย — เห็นแต่เนื้ออะคริลิคที่ไดคัทไว้
  } = o;
  const id = `cut${++cutId}`;
  const w = h * MASCOT.ratio;
  const rim = h * 0.032; // ขอบใสรอบลาย (ไดคัทเผื่อไว้ประมาณ 2-3 มม.)
  const img = `<image href="${MASCOT.uri}" x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
  const body = ghost ? "#eef2f7" : fill;
  const ring = ghost ? "#e2e8f0" : edge;
  const flip = gateSide === "right" ? -1 : 1;
  // ก้านพาดอยู่บนแผ่น ชิดริมซ้าย (ตามภาพงานจริง) — หมุดล่าง ปลายตะขอชี้ขึ้นด้านบน
  const rivetX = cx - flip * w * 0.3;
  const rivetY = top + h * 0.78;
  const tipX = cx - flip * w * 0.36;
  const tipY = top + h * 0.24;
  return `
    <defs>
      <filter id="${id}" x="-25%" y="-20%" width="150%" height="140%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="${(rim * 1.3).toFixed(1)}" result="d1"/>
        <feFlood flood-color="${ring}" result="c1"/>
        <feComposite in="c1" in2="d1" operator="in" result="ringLayer"/>
        <feMorphology in="SourceAlpha" operator="dilate" radius="${rim.toFixed(1)}" result="d2"/>
        <feFlood flood-color="${body}" result="c2"/>
        <feComposite in="c2" in2="d2" operator="in" result="bodyLayer"/>
        <feMerge><feMergeNode in="ringLayer"/><feMergeNode in="bodyLayer"/></feMerge>
      </filter>
    </defs>
    <g filter="url(#${id})">${img}</g>
    ${ghost || blank ? "" : img}
    ${blank ? `<text x="${cx}" y="${top + h * 0.55}" font-family="${TH}" font-size="${Math.max(15, h * 0.09)}" text-anchor="middle" fill="${LINE}">ไม่มีลาย</text>` : ""}
    ${ghost ? "" : gateWire(rivetX, rivetY, tipX, tipY, flip * w * 0.12, gateColor)}
    ${!ghost && gates > 1 ? gateWire(cx + w * 0.3, rivetY, cx + w * 0.36, tipY, -w * 0.12, gateColor) : ""}`;
}

// ── ประเภทอะคริลิค → อะคริลิคใส ─────────────────────────────────────────
const clearArt = frame(`
  ${title("อะคริลิคใส", "ชนิดมาตรฐาน หนา 3 มม. · เนื้อใสมองทะลุ")}
  ${piece(350, 168, 372)}
  ${foot([
    "ไดคัทตามลาย เหลือขอบใสรอบลาย + ก้านตะขอสแตนเลส 1 ก้าน",
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
    ${foot(["เงาจาง = ขนาดใหญ่สุด 10 ซม. ไว้เทียบ", "ขนาดอื่นแจ้งในหมายเหตุถึงร้านได้"])}`);
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
    <text x="215" y="576" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ก้านสแตนเลสหมุดที่ริมแผ่นอะคริลิค</text>
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

await render("clear-plain-v3", clearArt);
for (let cm = 5; cm <= 10; cm++) await render(`size-${cm}-v2`, sizeArt(cm));
await render("part-small-v2", gateArt(1.8, 2.8));
await render("part-large-v2", gateArt(2.8, 1.8));
await render("print-1-v2", printArt(1));
await render("print-2-v2", printArt(2));
await render("hook-extra-v2", hookExtraArt);
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
