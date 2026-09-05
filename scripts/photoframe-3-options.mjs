#!/usr/bin/env node
/**
 * กรอบรูปจิ๊กซอร์ อะคริลิค (/products/กรอบรูปจิ๊กซอร์-อะคริลิค · id photoframe-3)
 * — สร้างตัวเลือกตามใบราคา https://www.iduckyofficial-pricelists.com/photoframe
 *   (ราคาฐาน 450/420/400/390 ลงไว้ใน pricing แล้ว — สคริปต์นี้เพิ่มเฉพาะ options + ภาพ)
 *
 *   node scripts/photoframe-3-options.mjs           (วาดภาพลง .cache/photoframe-3/upload ดูก่อน)
 *   node scripts/photoframe-3-options.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * จากใบราคา::
 *   • แผ่นประกบหน้า-หลัง หนา 1mm · แผ่นกลาง (จิ๊กซอว์) หนา 3mm · น๊อตหมุด 4 ตัว (ยาว 7×75mm ×2 · สั้น 7×20mm ×2)
 *   • เพิ่มสกรีน แผ่นหน้า-แผ่นหลัง บวกเพิ่มแผ่นละ 25 บาท
 *   • ไดคัทตามทรง บวกเพิ่ม 30 บาท
 *   • เพิ่มขนาด cm ละ 30 บาท (ฐาน 15 ซม. ตาม description ของสินค้า · เพดาน 25 ซม. ยืมจาก photoframe-2 รอร้านยืนยัน)
 *
 * กลุ่มที่เขียน::
 *   1. "ขนาด (ด้านยาวสุด)" display "cards" 15–25 ซม. — extra ต่อใบ = (ซม.-15)×30
 *   2. "Add on" display "multi" — สกรีนแผ่นหน้า +25 · สกรีนแผ่นหลัง +25 · ไดคัทตามทรง +30
 *
 * ภาพ 900×900 **การ์ดขนาดสเกลจริงเดียวกันทุกใบ (1 ซม. = 19 px)** สไตล์สตูดิโอครีมชุดเดียวกับ
 * photoframe-2 แต่ตัวชิ้นงานเป็นกรอบจิ๊กซอว์: แผ่นใสประกบ + แผ่นจิ๊กซอว์กลางพิมพ์ลาย + น๊อตหมุด 4 ตัว
 * (น๊อตล่าง 2 ตัวเป็นตัวยาว โผล่ใต้แผ่นเป็นขาตั้ง — ตามรูปงานจริงในแกลเลอรี)
 * ⚠️ การ์ด 11 ใบ = โหมดกระชับ (ไม่โชว์ desc · รูป 48px) จึงเบิร์นตัวเลขขนาด/ค่าเพิ่มไว้ในภาพ
 * ⚠️ ตัว ฿ ใน SVG เรนเดอร์ทับตัวหน้า — ในภาพเขียน "+NN บาท" แทน
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ขยับ VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "photoframe-3";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/photoframe-3/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด (ด้านยาวสุด)";
const ADDON_GROUP = "Add on";
const SECTION = "1. ของเสริม + ขนาด";
const BASE_CM = 15;      // ขนาดมาตรฐาน รวมในราคาแล้ว (description สินค้า: "ขนาดเริ่มต้นไม่เกิน 15 ซม.")
const MAX_CM = 25;       // เพดานยืมจาก photoframe-2 — รอร้านยืนยัน
const RATE_SIZE = 30;    // ฿/ซม. จากใบราคา "เพิ่มขนาด cm ละ 30 บาท"
const FEE_SCREEN = 25;   // ฿/แผ่น สกรีนแผ่นประกบหน้า/หลัง
const FEE_DIECUT = 30;   // ฿ ไดคัทตามทรง
const STEPS = Array.from({ length: MAX_CM - BASE_CM + 1 }, (_, i) => BASE_CM + i);

const FRONT_SCREEN = "สกรีนแผ่นประกบหน้า (หนา 1mm)";
const BACK_SCREEN = "สกรีนแผ่นประกบหลัง (หนา 1mm)";
const DIECUT = "ไดคัทตามทรง";

const MASCOT = await mascotDataUri("heart", 640);

const W = 900;
const H = 900;
const CM = 19;           // สเกลจริงการ์ดขนาด — ทุกใบเท่ากัน (25 ซม. = 475 px)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#3f3a35";
const SUB = "#9a9187";
const OK = "#0891b2";
const HL = "#f59e0b";

let uid = 0;
let defsExtra = "";

/** พื้นหลังสตูดิโอครีม + ฟิลเตอร์เงา — ชุดเดียวกับ photoframe-2-size-cards.mjs */
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
  </radialGradient>
  <linearGradient id="steelRod" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#8d99a6"/><stop offset="45%" stop-color="#f3f6f9"/><stop offset="100%" stop-color="#7e8b98"/>
  </linearGradient>`;

// ── รอยต่อจิ๊กซอว์ (ยืมจาก jigsaw-frame-uv-option-art.mjs) ──────────────
/** ขอบจิ๊กซอว์ 1 ด้าน — t = 0 ตรง, +1/-1 ปุ่มโป่งออกฝั่งซ้าย/ขวาของทิศเดิน */
const edge = (x0, y0, x1, y1, t) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (!t) return `L ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy * t;
  const ny = ux * t;
  const r = len * 0.22;
  const ax = x0 + ux * len * 0.4;
  const ay = y0 + uy * len * 0.4;
  const bx = x0 + ux * len * 0.6;
  const by = y0 + uy * len * 0.6;
  const c1x = ax + nx * r * 1.7 - ux * r * 0.5;
  const c1y = ay + ny * r * 1.7 - uy * r * 0.5;
  const c2x = bx + nx * r * 1.7 + ux * r * 0.5;
  const c2y = by + ny * r * 1.7 + uy * r * 0.5;
  return `L ${ax.toFixed(1)} ${ay.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

/** ปุ่มโป่งเข้า/ออกสลับกันแบบเดิมทุกครั้ง (ห้ามสุ่ม — รันซ้ำภาพต้องเหมือนเดิม) */
const knob = (i, j, axis) => (((i * 7 + j * 13 + axis * 5) % 3) % 2 === 0 ? 1 : -1);

/** รอยต่อจิ๊กซอว์ทั้งแผ่น cols × rows (ขอบนอกตรง) */
function seams(x, y, w, h, cols, rows) {
  const cw = w / cols;
  const ch = h / rows;
  const paths = [];
  for (let i = 1; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const yy = y + j * ch;
      paths.push(`M ${(x + i * cw).toFixed(1)} ${yy.toFixed(1)} ${edge(x + i * cw, yy, x + i * cw, yy + ch, knob(i, j, 0))}`);
    }
  }
  for (let j = 1; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const xx = x + i * cw;
      paths.push(`M ${xx.toFixed(1)} ${(y + j * ch).toFixed(1)} ${edge(xx, y + j * ch, xx + cw, y + j * ch, knob(i, j, 1))}`);
    }
  }
  const d = paths.join(" ");
  const sw = Math.max(1, Math.min(cw, ch) * 0.075);
  return `
    <g fill="none" stroke-linecap="round">
      <path d="${d}" stroke="#1f2937" stroke-width="${(sw * 2.1).toFixed(2)}" opacity="0.18"/>
      <path d="${d}" stroke="#ffffff" stroke-width="${sw.toFixed(2)}" opacity="0.9"/>
    </g>`;
}

/** ลายพิมพ์บนแผ่นใส (มุมพาสเทลสไตล์งานจริง — ใบไม้/วงกลม) วาดภายใน clip ที่ส่งมา */
const plateDeco = (x, top, s, clipId) => `
    <g clip-path="url(#${clipId})">
      <circle cx="${x + s * 0.06}" cy="${top + s * 0.08}" r="${s * 0.13}" fill="#a7e3d0" opacity="0.9"/>
      <circle cx="${x + s * 0.96}" cy="${top + s * 0.1}" r="${s * 0.11}" fill="#fbd0de" opacity="0.85"/>
      <circle cx="${x + s * 0.05}" cy="${top + s * 0.93}" r="${s * 0.12}" fill="#fde68a" opacity="0.9"/>
      <circle cx="${x + s * 0.95}" cy="${top + s * 0.94}" r="${s * 0.13}" fill="#93d6f0" opacity="0.85"/>
      <path d="M${x + s * 0.14} ${top + s * 0.88} q${s * 0.05} -${s * 0.1} ${s * 0.12} -${s * 0.06} q-${s * 0.02} ${s * 0.1} -${s * 0.12} ${s * 0.06} z" fill="#34b39a" opacity="0.9"/>
      <path d="M${x + s * 0.82} ${top + s * 0.07} q${s * 0.05} -${s * 0.08} ${s * 0.11} -${s * 0.04} q-${s * 0.03} ${s * 0.09} -${s * 0.11} ${s * 0.04} z" fill="#ef7ea8" opacity="0.9"/>
    </g>`;

/**
 * กรอบรูปจิ๊กซอว์อะคริลิค 1 ชิ้น มองด้านหน้า — แผ่นใสจัตุรัสมุมโค้ง แผ่นจิ๊กซอว์พิมพ์ลายตรงกลาง
 * น๊อตหมุดเงิน 4 มุม (คู่ล่างเป็นตัวยาว โผล่ใต้แผ่นเป็นขาตั้ง)
 * withFrontDeco = พิมพ์ลายบนแผ่นหน้าด้วย (ภาพ add-on สกรีนแผ่นหน้า)
 */
function frame(cx, bottom, size, { withFrontDeco = false } = {}) {
  const s = size;
  const x = cx - s / 2;
  const top = bottom - s;
  const r = s * 0.09;
  const depth = Math.max(7, s * 0.028);       // สันรวม 1+3+1 มม.
  const id = `f${uid++}`;

  // แผ่นจิ๊กซอว์กลาง (ยื่นเกือบเต็มแผ่นใส เว้นขอบ)
  const inset = s * 0.1;
  const jx = x + inset;
  const jy = top + inset;
  const js = s - inset * 2;

  // น๊อตหมุด 4 มุม — คู่ล่างตัวยาวโผล่ใต้แผ่นเป็นขา
  const nR = Math.max(7, s * 0.028);
  const nIn = s * 0.05;
  const legH = Math.max(14, s * 0.09);
  const legW = Math.max(7, s * 0.026);

  defsExtra += `
    <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${x}" y1="${top}" x2="${x + s}" y2="${bottom}">
      <stop offset="0%" stop-color="#e3f1fa"/><stop offset="100%" stop-color="#c3ddf0"/>
    </linearGradient>
    <clipPath id="${id}cp"><rect x="${x}" y="${top}" width="${s}" height="${s}" rx="${r}"/></clipPath>
    <clipPath id="${id}jc"><rect x="${jx}" y="${jy}" width="${js}" height="${js}" rx="${r * 0.5}"/></clipPath>`;

  return `<g>
    <!-- เงาตกกระทบพื้น -->
    <ellipse cx="${cx}" cy="${bottom + legH + 10}" rx="${s * 0.56}" ry="${s * 0.06 + 8}" fill="#8a7c6c" opacity="0.32" filter="url(#soft)"/>
    <!-- ขาน๊อตหมุดตัวยาว 2 ตัว (โผล่ใต้แผ่น) -->
    <rect x="${x + nIn - legW / 2 + nR}" y="${bottom - 4}" width="${legW}" height="${legH + 4}" rx="${legW / 2}" fill="url(#steelRod)"/>
    <rect x="${x + s - nIn - legW / 2 - nR}" y="${bottom - 4}" width="${legW}" height="${legH + 4}" rx="${legW / 2}" fill="url(#steelRod)"/>
    <!-- สันหนาของชุดแผ่น -->
    <rect x="${x}" y="${top + depth}" width="${s}" height="${s}" rx="${r}" fill="#8fb9d6"/>
    <!-- แผ่นใสประกบ -->
    <rect x="${x}" y="${top}" width="${s}" height="${s}" rx="${r}" fill="url(#${id}g)" opacity="0.85"/>
    <!-- แผ่นจิ๊กซอว์กลาง: พื้นพาสเทล + มาสคอต + รอยต่อ -->
    <g filter="url(#cardShadow)"><rect x="${jx}" y="${jy}" width="${js}" height="${js}" rx="${r * 0.5}" fill="#fdf6ec"/></g>
    <g clip-path="url(#${id}jc)">
      <rect x="${jx}" y="${jy}" width="${js}" height="${js}" fill="#cfeef7"/>
      <circle cx="${jx + js * 0.85}" cy="${jy + js * 0.18}" r="${js * 0.14}" fill="#fde68a"/>
      <image href="${MASCOT.uri}" x="${jx + js * 0.12}" y="${jy + js * 0.1}" width="${js * 0.76}" height="${js * 0.8}" preserveAspectRatio="xMidYMid meet"/>
      ${seams(jx, jy, js, js, 4, 4)}
    </g>
    ${withFrontDeco ? plateDeco(x, top, s, `${id}cp`) : ""}
    <!-- น๊อตหมุด 4 มุม -->
    <circle cx="${x + nIn + nR}" cy="${top + nIn + nR}" r="${nR}" fill="url(#steel)"/>
    <circle cx="${x + s - nIn - nR}" cy="${top + nIn + nR}" r="${nR}" fill="url(#steel)"/>
    <circle cx="${x + nIn + nR}" cy="${bottom - nIn - nR}" r="${nR * 1.12}" fill="url(#steel)"/>
    <circle cx="${x + s - nIn - nR}" cy="${bottom - nIn - nR}" r="${nR * 1.12}" fill="url(#steel)"/>
    <!-- ผิวเงาสะท้อนแสงทแยง -->
    <g clip-path="url(#${id}cp)" filter="url(#soft2)">
      <path d="M${x - s * 0.1} ${bottom - s * 0.1} L${x + s * 0.68} ${top - s * 0.08} l${s * 0.2} 0 L${x + s * 0.1} ${bottom + s * 0.06} Z" fill="#ffffff" opacity="0.28"/>
    </g>
  </g>`;
}

/** ลูกศรวัดขนาดแนวตั้งฝั่งซ้ายของแผ่น */
const dimV = (x, y1, y2, label) => `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x - 9}" y1="${y1}" x2="${x + 9}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x - 9}" y1="${y2}" x2="${x + 9}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
    <text x="${x - 14}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${SUB}">${label}</text>`;

/** ไม้บรรทัด 0–25 ซม. ตำแหน่งเดียวกันทุกใบ — ไฮไลต์ช่วง 0 ถึงขนาดของใบนี้ */
const ruler = (cm) => {
  const len = MAX_CM * CM;
  const x0 = (W - len) / 2;
  const y = 772;
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

const svgWrap = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${BG}${defsExtra}</defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${body}
</svg>`;

const badge = (y, text, good = false) => good
  ? `<rect x="${W / 2 - 112}" y="${y}" width="224" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2"/>
     <text x="${W / 2}" y="${y + 31}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`
  : `<rect x="${W / 2 - 138}" y="${y}" width="276" height="46" rx="23" fill="#fffbeb" stroke="${HL}" stroke-width="2"/>
     <text x="${W / 2}" y="${y + 31}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="#b45309">${text}</text>`;

// ── ภาพการ์ดขนาด ─────────────────────────────────────────────────────
function sizeArt(cm) {
  defsExtra = "";
  uid = 0;
  const add = (cm - BASE_CM) * RATE_SIZE;
  const size = cm * CM;
  const cx = W / 2;
  const bottom = 706;
  const sub = add === 0 ? "ขนาดมาตรฐาน — รวมในราคาแล้ว" : `ใหญ่ขึ้นจากมาตรฐาน ${cm - BASE_CM} ซม.`;
  const body = `
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="52" font-weight="700" text-anchor="middle" fill="${INK}">${cm} ซม.</text>
  <text x="${W / 2}" y="134" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>
  ${badge(156, add === 0 ? "ไม่บวกเพิ่ม" : `+${add} บาท / อัน`, add === 0)}
  ${frame(cx, bottom, size)}
  ${dimV(cx - size / 2 - 34, bottom - size, bottom, `${cm} ซม.`)}
  ${ruler(cm)}
  <text x="${W / 2}" y="${H - 42}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">วัดจากด้านยาวสุดของชิ้นงาน · ลายในภาพเป็นตัวอย่าง</text>`;
  return svgWrap(body);
}

// ── ภาพ Add on: ผังแผ่น 3 ชั้น ไฮไลต์แผ่นที่สกรีน ──────────────────────
/**
 * ผังแยกชั้น: แผ่นหน้า (บนซ้าย) → แผ่นจิ๊กซอว์กลาง → แผ่นหลัง (ล่างขวา) เรียงทแยง
 * highlight = "front" | "back" — แผ่นใสที่ถูกสกรีนได้กรอบส้ม + ลายพิมพ์
 */
function screenAddonArt(highlight) {
  defsExtra = "";
  uid = 0;
  const s = 300;
  const r = s * 0.09;
  const midX = W / 2 - s / 2;
  const midY = 386;
  const off = 118;
  const plates = {
    front: { x: midX - off, y: midY - off, label: "แผ่นประกบหน้า · ใส หนา 1 มม." },
    mid: { x: midX, y: midY, label: "แผ่นจิ๊กซอว์กลาง · หนา 3 มม. (พิมพ์ลายอยู่แล้ว)" },
    back: { x: midX + off, y: midY + off, label: "แผ่นประกบหลัง · ใส หนา 1 มม." },
  };
  const hi = plates[highlight];

  const clearPlate = (p, hiOn) => {
    const id = `p${uid++}`;
    defsExtra += `<clipPath id="${id}cp"><rect x="${p.x}" y="${p.y}" width="${s}" height="${s}" rx="${r}"/></clipPath>`;
    return `
      <g filter="url(#cardShadow)">
        <rect x="${p.x}" y="${p.y}" width="${s}" height="${s}" rx="${r}" fill="#dcecf8" opacity="0.72"/>
      </g>
      <rect x="${p.x}" y="${p.y}" width="${s}" height="${s}" rx="${r}" fill="none" stroke="#9dbdd6" stroke-width="2.5"/>
      ${hiOn ? plateDeco(p.x, p.y, s, `${id}cp`) : ""}
      ${hiOn ? `<rect x="${p.x - 7}" y="${p.y - 7}" width="${s + 14}" height="${s + 14}" rx="${r + 7}" fill="none" stroke="${HL}" stroke-width="6"/>` : ""}`;
  };

  const jigsawPlate = (p) => {
    const id = `p${uid++}`;
    defsExtra += `<clipPath id="${id}cp"><rect x="${p.x}" y="${p.y}" width="${s}" height="${s}" rx="${r * 0.6}"/></clipPath>`;
    return `
      <g filter="url(#cardShadow)"><rect x="${p.x}" y="${p.y}" width="${s}" height="${s}" rx="${r * 0.6}" fill="#fdf6ec"/></g>
      <g clip-path="url(#${id}cp)">
        <rect x="${p.x}" y="${p.y}" width="${s}" height="${s}" fill="#cfeef7"/>
        <circle cx="${p.x + s * 0.85}" cy="${p.y + s * 0.18}" r="${s * 0.14}" fill="#fde68a"/>
        <image href="${MASCOT.uri}" x="${p.x + s * 0.12}" y="${p.y + s * 0.1}" width="${s * 0.76}" height="${s * 0.8}" preserveAspectRatio="xMidYMid meet"/>
        ${seams(p.x, p.y, s, s, 4, 4)}
      </g>`;
  };

  // ลำดับวาด: หลังสุดก่อน (back อยู่ล่างขวา วาดก่อน → front ทับบนสุด)
  const order = [
    clearPlate(plates.back, highlight === "back"),
    jigsawPlate(plates.mid),
    clearPlate(plates.front, highlight === "front"),
  ];

  const title = highlight === "front" ? "สกรีนแผ่นประกบหน้า" : "สกรีนแผ่นประกบหลัง";
  const calloutY = highlight === "front" ? plates.front.y - 22 : plates.back.y + s + 42;
  const body = `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ปกติแผ่นประกบเป็นอะคริลิคใส — เพิ่มพิมพ์ลายบนแผ่นนี้ได้</text>
  ${badge(148, `+${FEE_SCREEN} บาท / อัน`)}
  ${order.join("\n")}
  <text x="${W / 2}" y="${calloutY}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#b45309">✦ พิมพ์ลายเพิ่มบนแผ่นนี้</text>
  <text x="${W / 2}" y="${H - 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">โครงสร้าง 3 ชั้น: ใส 1 มม. + จิ๊กซอว์ 3 มม. + ใส 1 มม. · น๊อตหมุด 4 ตัว · ลายเป็นตัวอย่าง</text>`;
  return svgWrap(body);
}

// ── ภาพ Add on: ไดคัทตามทรง ─────────────────────────────────────────
function diecutArt() {
  defsExtra = "";
  uid = 0;
  const cx = W / 2;
  const cy = 470;
  const R = 235;
  // ทรงไดคัท: บล็อบมนตามลาย (เส้นโค้งคงที่ ไม่สุ่ม)
  const blob = `M ${cx - R} ${cy}
    C ${cx - R} ${cy - R * 0.62} ${cx - R * 0.6} ${cy - R} ${cx} ${cy - R}
    C ${cx + R * 0.34} ${cy - R} ${cx + R * 0.52} ${cy - R * 0.86} ${cx + R * 0.72} ${cy - R * 0.62}
    C ${cx + R * 0.95} ${cy - R * 0.35} ${cx + R} ${cy - R * 0.1} ${cx + R} ${cy + R * 0.08}
    C ${cx + R} ${cy + R * 0.62} ${cx + R * 0.55} ${cy + R * 0.95} ${cx} ${cy + R * 0.95}
    C ${cx - R * 0.62} ${cy + R * 0.95} ${cx - R} ${cy + R * 0.55} ${cx - R} ${cy} Z`;
  const id = `d${uid++}`;
  defsExtra += `<clipPath id="${id}cp"><path d="${blob}"/></clipPath>
    <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${cx - R}" y1="${cy - R}" x2="${cx + R}" y2="${cy + R}">
      <stop offset="0%" stop-color="#e3f1fa"/><stop offset="100%" stop-color="#c3ddf0"/>
    </linearGradient>`;
  const jx = cx - R * 0.72;
  const jy = cy - R * 0.72;
  const js = R * 1.44;
  const body = `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">ไดคัทตามทรง</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ตัดขอบกรอบตามทรงลายของคุณ — ไม่ใช่สี่เหลี่ยมมาตรฐาน</text>
  ${badge(148, `+${FEE_DIECUT} บาท / อัน`)}
  <!-- ทรงสี่เหลี่ยมมาตรฐาน (เส้นประ = ส่วนที่ถูกตัดออก) -->
  <rect x="${cx - R - 26}" y="${cy - R - 26}" width="${(R + 26) * 2}" height="${(R + 26) * 2}" rx="40" fill="none" stroke="#c9c0b4" stroke-width="3" stroke-dasharray="14 12"/>
  <text x="${cx - R - 18}" y="${cy + R + 54}" font-family="${TH}" font-size="22" text-anchor="start" fill="#b3a793">ทรงมาตรฐาน (ถูกตัดออก)</text>
  <!-- ชิ้นงานไดคัท -->
  <ellipse cx="${cx}" cy="${cy + R * 1.06}" rx="${R * 1.02}" ry="26" fill="#8a7c6c" opacity="0.3" filter="url(#soft)"/>
  <g filter="url(#cardShadow)"><path d="${blob}" fill="url(#${id}g)"/></g>
  <g clip-path="url(#${id}cp)">
    <rect x="${jx}" y="${jy}" width="${js}" height="${js}" fill="#cfeef7"/>
    <circle cx="${cx + R * 0.55}" cy="${cy - R * 0.5}" r="${R * 0.22}" fill="#fde68a"/>
    <image href="${MASCOT.uri}" x="${jx + js * 0.13}" y="${jy + js * 0.12}" width="${js * 0.74}" height="${js * 0.78}" preserveAspectRatio="xMidYMid meet"/>
    ${seams(jx, jy, js, js, 4, 4)}
    <path d="M${cx - R} ${cy + R * 0.5} L${cx + R * 0.7} ${cy - R} l${R * 0.24} 0 L${cx - R * 0.7} ${cy + R * 0.75} Z" fill="#ffffff" opacity="0.25"/>
  </g>
  <path d="${blob}" fill="none" stroke="${HL}" stroke-width="6"/>
  <!-- น๊อตหมุด -->
  <circle cx="${cx - R * 0.62}" cy="${cy - R * 0.55}" r="12" fill="url(#steel)"/>
  <circle cx="${cx + R * 0.6}" cy="${cy - R * 0.52}" r="12" fill="url(#steel)"/>
  <circle cx="${cx - R * 0.6}" cy="${cy + R * 0.58}" r="13" fill="url(#steel)"/>
  <circle cx="${cx + R * 0.58}" cy="${cy + R * 0.6}" r="13" fill="url(#steel)"/>
  <text x="${W / 2}" y="${H - 44}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เส้นส้ม = แนวตัดตามทรงลาย · ลายในภาพเป็นตัวอย่าง</text>`;
  return svgWrap(body);
}

// ── เรนเดอร์ทุกใบ ────────────────────────────────────────────────────
const SIZE_FILES = STEPS.map((cm) => ({
  cm,
  choice: cm === BASE_CM ? `${cm} ซม. (มาตรฐาน)` : `${cm} ซม.`,
  file: `size-${cm}cm-${VER}.jpg`,
}));
const ADDON_FILES = [
  { name: FRONT_SCREEN, file: `addon-screen-front-${VER}.jpg`, svg: () => screenAddonArt("front") },
  { name: BACK_SCREEN, file: `addon-screen-back-${VER}.jpg`, svg: () => screenAddonArt("back") },
  { name: DIECUT, file: `addon-diecut-${VER}.jpg`, svg: () => diecutArt() },
];

// ⚠️ defsExtra สะสมข้ามใบ — แต่ละ art() ล้างเองต้นฟังก์ชัน จึงต้องเรนเดอร์ทีละใบตามลำดับ
const bufs = {};
for (const f of SIZE_FILES) {
  const buf = await sharp(Buffer.from(sizeArt(f.cm))).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
  bufs[f.file] = buf;
  writeFileSync(`${OUT}/${f.file}`, buf);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(buf.length / 1024)} KB`);
}
for (const f of ADDON_FILES) {
  const buf = await sharp(Buffer.from(f.svg())).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
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
for (const f of [...SIZE_FILES.map((f) => ({ key: f.choice, file: f.file })), ...ADDON_FILES.map((f) => ({ key: f.name, file: f.file }))]) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, bufs[f.file], { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urls[f.key] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.key]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  section: SECTION,
  note: `ขนาดมาตรฐาน ${BASE_CM} ซม. รวมในราคาแล้ว — เพิ่มขนาดได้ ซม.ละ ฿${RATE_SIZE} (ใหญ่สุด ${MAX_CM} ซม.)`,
  choices: SIZE_FILES.map((f) => ({
    name: f.choice,
    ...(f.cm === BASE_CM ? { popular: true } : { extra: (f.cm - BASE_CM) * RATE_SIZE }),
    desc: f.cm === BASE_CM
      ? "ขนาดเริ่มต้นของร้าน รวมในราคาแล้ว"
      : `ใหญ่ขึ้นจากมาตรฐาน ${f.cm - BASE_CM} ซม. · +฿${(f.cm - BASE_CM) * RATE_SIZE} ต่ออัน`,
    imageSrc: urls[f.choice],
  })),
};

const addonGroup = {
  label: ADDON_GROUP,
  display: "multi",
  section: SECTION,
  note: `ราคาปกติพิมพ์ลายบนแผ่นจิ๊กซอว์กลาง (หนา 3 มม.) ให้แล้ว — แผ่นประกบหน้า/หลังเป็นอะคริลิคใส เพิ่มสกรีนได้แผ่นละ ฿${FEE_SCREEN}`,
  choices: [
    { name: FRONT_SCREEN, extra: FEE_SCREEN, desc: "พิมพ์ลายเพิ่มบนแผ่นใสด้านหน้า", imageSrc: urls[FRONT_SCREEN] },
    { name: BACK_SCREEN, extra: FEE_SCREEN, desc: "พิมพ์ลายเพิ่มบนแผ่นใสด้านหลัง", imageSrc: urls[BACK_SCREEN] },
    { name: DIECUT, extra: FEE_DIECUT, desc: "ตัดขอบกรอบตามทรงลายของคุณ", imageSrc: urls[DIECUT] },
  ],
};

// รันซ้ำได้: ตัดกลุ่มชื่อเดียวกันทิ้งก่อน แล้ววางขนาดก่อน Add on
const cleaned = options.filter((o) => o.label !== SIZE_GROUP && o.label !== ADDON_GROUP);
data.options = [sizeGroup, addonGroup, ...cleaned];
data.savedAt = new Date().toISOString();   // ⚠️ ต้องเป็น ISO string เท่านั้น (ด่านกัน 409 ของหน้าแก้ไข)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — เช็ครูปร่างของค่าจริง ไม่ใช่แค่เท่ากับตัวแปรฝั่งเรา
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === SIZE_GROUP);
const ga = got.find((o) => o.label === ADDON_GROUP);
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [got.filter((o) => o.label === ADDON_GROUP).length === 1, "กลุ่ม Add on ซ้ำ/หาย"],
  [g?.display === "cards", "กลุ่มขนาดไม่ได้เป็นการ์ด"],
  [g?.choices?.length === STEPS.length, "จำนวนการ์ดขนาดไม่ครบ"],
  [SIZE_FILES.every((f, i) => g?.choices?.[i]?.name === f.choice), "ชื่อการ์ดไม่ตรง"],
  [SIZE_FILES.every((f, i) => {
    const v = g?.choices?.[i]?.imageSrc;
    return typeof v === "string" && v.startsWith("https://") && v === urls[f.choice];
  }), "ภาพการ์ดไม่ตรง/ไม่ใช่ URL"],
  [SIZE_FILES.every((f, i) => (g?.choices?.[i]?.extra ?? 0) === (f.cm - BASE_CM) * RATE_SIZE), "ค่าเพิ่มต่อการ์ดไม่ตรง"],
  [ga?.display === "multi", "Add on ไม่ใช่ multi"],
  [ga?.choices?.length === 3, "Add on ไม่ครบ 3 ตัวเลือก"],
  [(ga?.choices ?? []).every((c) => typeof c.imageSrc === "string" && c.imageSrc.startsWith("https://")), "ภาพ Add on ไม่ครบ"],
  [(ga?.choices?.find((c) => c.name === FRONT_SCREEN)?.extra) === FEE_SCREEN, "extra สกรีนหน้าเพี้ยน"],
  [(ga?.choices?.find((c) => c.name === BACK_SCREEN)?.extra) === FEE_SCREEN, "extra สกรีนหลังเพี้ยน"],
  [(ga?.choices?.find((c) => c.name === DIECUT)?.extra) === FEE_DIECUT, "extra ไดคัทเพี้ยน"],
  [got.findIndex((o) => o.label === SIZE_GROUP) < got.findIndex((o) => o.label === ADDON_GROUP), "กลุ่มขนาดไม่ได้อยู่บน Add on"],
  [typeof back.data.savedAt === "string" && back.data.savedAt.includes("T"), "savedAt ไม่ใช่ ISO string"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nค่าเพิ่มต่ออันของแต่ละการ์ดขนาด:");
for (const f of SIZE_FILES) console.log(`  ${String(f.cm).padStart(2)} ซม.  →  +฿${(f.cm - BASE_CM) * RATE_SIZE}`);
console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" การ์ด ${STEPS.length} ใบ + กลุ่ม "${ADDON_GROUP}" 3 ตัวเลือก + ภาพครบ · savedAt =`, back.data.savedAt);
