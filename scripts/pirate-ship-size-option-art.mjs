#!/usr/bin/env node
/**
 * Acrylic Pirate ship (acrylic-pirate-ship) — ผู้ใช้สั่ง 4 ก.ย. 69
 *
 *   node scripts/pirate-ship-size-option-art.mjs           (วาดภาพลง .cache/acrylic-pirate-ship/upload ดูก่อน)
 *   node scripts/pirate-ship-size-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค FERRIS WHEEL & PIRATE SHIP
 * (/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/สแตนดี้อะคริลิค/07-3-9_ชิงช้า&เรือ/P-nFerris-Pirate-01.jpg)
 * ฝั่งเรือโจรสลัด ชุดละ 390.- ·
 *   – สกรีน 2 ด้าน (ตัวกลาง) บวกเพิ่ม 30 บาท
 *   – ขนาดตัวกลาง 15 x 9 cm (ไดคัทตามทรงได้)
 *   – ขนาดเสาค้ำ (2 ชิ้น) 14.8 x 9.6 cm
 *   – ขนาดฐาน 9.5 x 5.5 cm
 * โครงจริงจากรูปในใบสเปค: ตัวกลางเป็นแผ่นโดมแขวนที่จุกหมุนด้านบน แกว่งไปมาได้ ·
 * เสาค้ำ 2 ชิ้นเป็นทรงสี่เหลี่ยมคางหมูซ้อนกันเป็นพีระมิด เสียบลงฐานแผ่นล่าง
 *
 * ทำ 4 อย่าง:
 * 1. เพิ่มกลุ่ม "ขนาด" เป็นกลุ่มแรก แบบการ์ด — ตัวเลือกเดียว "ตัวกลาง 15 × 9 ซม." ไม่บวกราคา
 *    พร้อมภาพวาดชุดประกอบ + ลูกศรวัดตัวกลาง และป้ายชี้เสาค้ำ/ฐาน
 * 2. ตัดขนาดออกจากชื่อกลุ่มเดิม "อะคริลิค แผ่นกลาง ขนาด 15x9 cm. (ไดคัทตามทรงได้)"
 *    → "อะคริลิค แผ่นกลาง (ไดคัทตามทรงได้)" (ขนาดย้ายไปอยู่กลุ่มขนาดแล้ว จะได้ไม่บอกซ้ำ 2 ที่)
 *    ⚠️ ปลอดภัยเพราะกลุ่มนี้ไม่ใช่แกนตารางราคา (driverLabels ว่าง) และไม่มี showWhen ชี้มา
 * 3. ภาพประจำตัวเลือก "สกรีน 2 ด้าน บวกเพิ่ม" — ตัวกลางหน้า/หลัง เทียบกัน
 * 4. ภาพประจำตัวเลือกกลุ่ม "เพิ่มอะคริลิคพิเศษ" 3 ใบ (แผ่นกลาง · เสาตั้ง 1 · เสาตั้ง 2)
 *    ชุดเดียวกันแต่ไฮไลต์คนละชิ้น — ลูกค้าจะได้รู้ว่าติ๊กแล้วเปลี่ยนชิ้นไหน
 *    ⚠️ ชื่อตัวเลือก "​เสาตั้ง 1" มีอักขระล่องหน U+200B นำหน้าใน DB → จับคู่ด้วยชื่อที่ normalize แล้ว
 *
 * รันซ้ำได้: เจอกลุ่ม/ตัวเลือกเดิม = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * ⚠️ data.savedAt ต้องเป็น ISO string (ไม่ใช่ Date.now() ตัวเลข)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "acrylic-pirate-ship";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/acrylic-pirate-ship/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "ตัวกลาง 15 × 9 ซม.";
const PLATE_GROUP_OLD = "อะคริลิค แผ่นกลาง ขนาด 15x9 cm. (ไดคัทตามทรงได้)";
const PLATE_GROUP = "อะคริลิค แผ่นกลาง (ไดคัทตามทรงได้)";
const SCREEN2 = "สกรีน 2 ด้าน บวกเพิ่ม";
const SPECIAL_GROUP = "เพิ่มอะคริลิคพิเศษ";
/** ชื่อชิ้นในกลุ่ม "เพิ่มอะคริลิคพิเศษ" (normalize แล้ว) → ไฟล์ภาพ */
const SPECIAL_PARTS = [
  { name: "แผ่นกลาง", mode: "plate" },
  { name: "เสาตั้ง 1", mode: "leg1" },
  { name: "เสาตั้ง 2", mode: "leg2" },
];
/** ตัด zero-width space / ช่องว่างหัวท้ายออกก่อนเทียบชื่อ (DB มี U+200B นำหน้า "เสาตั้ง 1") */
const norm = (s) => (s ?? "").replace(/[​-‍﻿]/g, "").trim();

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับสคริปต์ขนาดตัวอื่น) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 11 : (label.length * 11) / 2)}" y="${ly - 24}"
      width="${label.length * 11}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** เส้นช่วยวัด (extension line) — ประ บาง ๆ */
const ext = (x1, y1, x2, y2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#cbd5e1" stroke-width="1.6" stroke-dasharray="5 5"/>`;

/** ดาวเล็ก 5 แฉก (ลายสกรีนบนตัวกลาง เลียนแบบงานจริงในใบสเปค) */
const star = (x, y, s, fill = "#fde047") => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? s * 0.44 : s;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="#eab308" stroke-width="1.2"/>`;
};

const defs = `
  <linearGradient id="plateFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cfe7fa"/>
    <stop offset="1" stop-color="#eaf6ff"/>
  </linearGradient>
  <linearGradient id="legFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bfdcf7"/>
    <stop offset="1" stop-color="#3b82f6"/>
  </linearGradient>
  <linearGradient id="baseFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2f5fd0"/>
    <stop offset="1" stop-color="#1e3a8a"/>
  </linearGradient>
  <linearGradient id="capFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e6f7fb"/>
    <stop offset="1" stop-color="#bfe6ef"/>
  </linearGradient>
  <linearGradient id="offFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e8edf3"/>
    <stop offset="1" stop-color="#cbd5e1"/>
  </linearGradient>`;

// ── ชุดประกอบ (front view) ────────────────────────────────────────────
const CM = 34; // px ต่อ 1 ซม.
const CX = 442;
const PW = 15 * CM; // ตัวกลางกว้าง 15 ซม.
const PH = 9 * CM; // ตัวกลางสูง 9 ซม.
const P_TOP = 262; // ยอดโดม = จุดหมุน
const P_BOT = P_TOP + PH; // 568
const BASE_TOP = 704;
const BASE_H = 26;
const BASE_HW = (9.5 * CM) / 2; // ฐานกว้าง 9.5 ซม.
const LEG_HW = (9.6 * CM) / 2; // เสาค้ำกว้าง 9.6 ซม. ที่โคน
const LEG_TOP = 286;
const LEG_TOP_HW = 62;
const BACK_DX = 36; // เสาชิ้นหลังเยื้องไปทางขวา-ขึ้นบนนิดหนึ่ง ให้เห็นว่าซ้อนกันอยู่ 2 ชิ้น
const BACK_DY = -18;

const platePath = `M ${CX - PW / 2} ${P_BOT} A ${PW / 2} ${PH} 0 0 1 ${CX + PW / 2} ${P_BOT} Z`;
const legPath = (dx = 0, dy = 0) =>
  `M ${CX - LEG_HW + dx} ${BASE_TOP + dy} L ${CX + LEG_HW + dx} ${BASE_TOP + dy} L ${CX + LEG_TOP_HW + dx} ${LEG_TOP + dy} L ${CX - LEG_TOP_HW + dx} ${LEG_TOP + dy} Z`;

/**
 * ภาพชุดประกอบ — highlight = null | "plate" | "leg1" | "leg2"
 * null   = ภาพกลุ่ม "ขนาด" (มีลูกศรวัด + ป้ายชี้ชิ้นส่วน)
 * อื่น ๆ = ภาพกลุ่ม "เพิ่มอะคริลิคพิเศษ" (ชิ้นที่เลือกเป็นสี ที่เหลือจาง ๆ)
 */
function setArt(highlight = null) {
  const dimOther = highlight !== null;
  const on = (part) => !dimOther || highlight === part;
  const fillOf = (part, url) => (on(part) ? url : "url(#offFill)");
  const opOf = (part, o) => (on(part) ? o : 0.34);
  const ringOf = (part) =>
    highlight === part
      ? ` stroke="#f59e0b" stroke-width="6"`
      : ` stroke="${on(part) ? "#7fb4dd" : "#cbd5e1"}" stroke-width="2.5"`;

  const r = MASCOT.ratio;
  let mh = PH * 0.66;
  let mw = mh * r;
  if (mw > PW * 0.34) { mw = PW * 0.34; mh = mw / r; }
  const mx = CX - mw / 2;
  const my = P_BOT - PH * 0.52 - mh / 2;

  /**
   * ตัวกลาง — ชิ้นที่ "ไม่ได้ไฮไลต์" วาดเป็นเงาเทาเปล่า ๆ ไม่ต้องมีลาย
   * (เอาลายออกด้วย ไม่งั้นเป็ดสีอ่อนยังเด่นกว่าชิ้นที่ไฮไลต์)
   */
  const plateEl = (idSuffix) => `
    <path d="${platePath}" fill="${fillOf("plate", "url(#plateFill)")}" opacity="${opOf("plate", 0.95)}"${ringOf("plate")}/>
    ${on("plate") ? `
    <clipPath id="plateClip${idSuffix}"><path d="${platePath}"/></clipPath>
    <g clip-path="url(#plateClip${idSuffix})">
      ${star(CX - PW * 0.36, P_BOT - 54, 22)}
      ${star(CX - PW * 0.29, P_BOT - 96, 12)}
      ${star(CX + PW * 0.27, P_TOP + 86, 16)}
      ${star(CX + PW * 0.33, P_BOT - 76, 20)}
      <path d="M ${CX + PW * 0.4} ${P_BOT - 96} a 44 44 0 1 0 34 62 34 34 0 1 1 -34 -62 Z" fill="#fde047" stroke="#eab308" stroke-width="1.5"/>
      <ellipse cx="${CX - PW * 0.33}" cy="${P_BOT - 4}" rx="80" ry="22" fill="#ffffff" opacity="0.8"/>
      <image href="${MASCOT.uri}" x="${mx}" y="${my}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <path d="M ${CX - PW * 0.33} ${P_BOT - PH * 0.72} A ${PW * 0.36} ${PH * 0.5} 0 0 1 ${CX + PW * 0.1} ${P_TOP + 26}"
      fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.55"/>` : ""}`;

  const legEl = (part) => `
    <path d="${part === "leg2" ? legPath(BACK_DX, BACK_DY) : legPath()}"
      fill="${fillOf(part, "url(#legFill)")}"
      opacity="${highlight === part ? 0.72 : opOf(part, part === "leg2" ? 0.3 : 0.44)}"${ringOf(part)}/>`;

  /** ชิ้นที่ไฮไลต์วาดซ้ำเป็นชั้นบนสุด — ไม่งั้นชิ้นหลัง (เสาตั้ง 2) โดนชิ้นหน้าทับจนดูไม่ออก */
  const topEl = highlight === "plate" ? plateEl("-top") : highlight ? legEl(highlight) : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="${dimOther ? 40 : 42}" font-weight="700" text-anchor="middle" fill="${INK}">${
    highlight === null ? "ตัวกลาง 15 × 9 ซม. (ขนาดเดียว)"
      : highlight === "plate" ? "อะคริลิคพิเศษ: แผ่นกลาง"
      : highlight === "leg1" ? "อะคริลิคพิเศษ: เสาตั้ง 1"
      : "อะคริลิคพิเศษ: เสาตั้ง 2"
  }</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${
    highlight === null ? "ไดคัทตามทรงได้ · ครบชุด เสาค้ำ 2 ชิ้น + ฐานตั้ง"
      : highlight === "plate" ? "เปลี่ยนตัวกลาง 15 × 9 ซม. เป็นอะคริลิคสีพิเศษ +20 บาท"
      : highlight === "leg1" ? "เสาค้ำชิ้นหน้า 14.8 × 9.6 ซม. เป็นอะคริลิคสีพิเศษ +20 บาท"
      : "เสาค้ำชิ้นหลัง 14.8 × 9.6 ซม. เป็นอะคริลิคสีพิเศษ +20 บาท"
  }</text>

  <!-- เงาบนโต๊ะ -->
  <ellipse cx="${CX}" cy="${BASE_TOP + BASE_H + 12}" rx="${BASE_HW + 40}" ry="16" fill="#0f172a" opacity="0.08"/>

  <!-- ตัวกลาง (แขวนอยู่หลังเสา มองทะลุเสาใสได้ เหมือนงานจริง) -->
  ${plateEl("")}

  <!-- เสาค้ำ 2 ชิ้น (ใส มองเห็นตัวกลางทะลุ) -->
  ${legEl("leg2")}
  ${legEl("leg1")}

  <!-- ฐานตั้ง 9.5 × 5.5 ซม. -->
  <polygon points="${CX - BASE_HW + 12},${BASE_TOP} ${CX + BASE_HW - 12},${BASE_TOP} ${CX + BASE_HW},${BASE_TOP + 10} ${CX - BASE_HW},${BASE_TOP + 10}"
    fill="#5b8ae6" opacity="${dimOther ? 0.34 : 1}"/>
  <rect x="${CX - BASE_HW}" y="${BASE_TOP + 8}" width="${BASE_HW * 2}" height="${BASE_H}" rx="6"
    fill="url(#baseFill)" opacity="${dimOther ? 0.34 : 1}"/>
  <line x1="${CX - LEG_HW + 10}" y1="${BASE_TOP + 4}" x2="${CX + LEG_HW + BACK_DX - 8}" y2="${BASE_TOP + 4}"
    stroke="#1e3a8a" stroke-width="3" opacity="${dimOther ? 0.25 : 0.55}"/>

  <!-- จุกหมุนด้านบน (ตัวกลางแกว่งรอบจุดนี้) -->
  <circle cx="${CX}" cy="${P_TOP + 16}" r="36" fill="url(#capFill)" stroke="#9fd3e0" stroke-width="2.5" opacity="${dimOther ? 0.5 : 0.92}"/>
  <circle cx="${CX}" cy="${P_TOP + 16}" r="11" fill="#f1fafd" stroke="#8ec6d6" stroke-width="2" opacity="${dimOther ? 0.5 : 1}"/>

  <!-- ชิ้นที่เลือก วาดทับบนสุด -->
  ${topEl}

  ${highlight === null ? `
  <!-- ลูกศรวัดตัวกลาง 15 × 9 ซม. -->
  ${ext(CX - PW / 2, P_BOT, CX - PW / 2, 186)}
  ${ext(CX + PW / 2, P_BOT, CX + PW / 2, 186)}
  ${dim(CX - PW / 2, 196, CX + PW / 2, 196, "15 ซม.", "above")}
  ${ext(CX + PW / 2 - 4, P_BOT, 782, P_BOT)}
  ${ext(CX + 30, P_TOP, 782, P_TOP)}
  ${dim(770, P_TOP, 770, P_BOT, "9 ซม.")}

  <!-- ป้ายชี้ชิ้นส่วนที่เหลือ -->
  <line x1="${CX - LEG_HW + 26}" y1="628" x2="238" y2="600" stroke="${SUB}" stroke-width="2" stroke-dasharray="5 4"/>
  <circle cx="${CX - LEG_HW + 26}" cy="628" r="4" fill="${SUB}"/>
  <text x="42" y="586" font-family="${TH}" font-size="23" font-weight="700" fill="${INK}">เสาค้ำ 2 ชิ้น</text>
  <text x="42" y="616" font-family="${TH}" font-size="23" fill="${SUB}">14.8 × 9.6 ซม.</text>

  <line x1="${CX + BASE_HW}" y1="${BASE_TOP + 20}" x2="${CX + BASE_HW + 44}" y2="${BASE_TOP + 20}" stroke="${SUB}" stroke-width="2" stroke-dasharray="5 4"/>
  <circle cx="${CX + BASE_HW}" cy="${BASE_TOP + 20}" r="4" fill="${SUB}"/>
  <text x="${CX + BASE_HW + 54}" y="${BASE_TOP + 14}" font-family="${TH}" font-size="23" font-weight="700" fill="${INK}">ฐานตั้ง</text>
  <text x="${CX + BASE_HW + 54}" y="${BASE_TOP + 44}" font-family="${TH}" font-size="23" fill="${SUB}">9.5 × 5.5 ซม.</text>` : ""}

  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${
    highlight === null
      ? "แกว่งไปมาได้จากจุดหมุนด้านบน · พิมพ์ลายตามสั่งด้วยระบบ UV"
      : "ติ๊กได้หลายชิ้น — เลือกเฉดสีจากเมนู “สีอะคริลิค” ที่โผล่ขึ้นมาด้านล่าง"
  }</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${
    highlight === null
      ? "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวแทยง)"
      : "ฐานตั้งไม่มีตัวเลือกเปลี่ยนเป็นอะคริลิคสีพิเศษ"
  }</text>
</svg>`;
}

/**
 * ภาพ "สกรีน 2 ด้าน บวกเพิ่ม" — ตัวกลางใบเดียวกัน มองจากหน้าและหลัง
 * (ตามใบสเปค: สกรีน 2 ด้าน คิดเฉพาะตัวกลาง บวกเพิ่ม 30 บาท)
 */
function screenArt() {
  const cm = 25;
  const pw = 15 * cm; // 375
  const ph = 9 * cm; // 225
  const bot = 478;
  const top = bot - ph;
  const r = MASCOT.ratio;
  let mh = ph * 0.62;
  let mw = mh * r;
  if (mw > pw * 0.34) { mw = pw * 0.34; mh = mw / r; }

  const plate = (cx, flip, tag, sub) => {
    const path = `M ${cx - pw / 2} ${bot} A ${pw / 2} ${ph} 0 0 1 ${cx + pw / 2} ${bot} Z`;
    const id = flip ? "back" : "front";
    return `
      <ellipse cx="${cx}" cy="${bot + 16}" rx="${pw * 0.46}" ry="13" fill="#0f172a" opacity="0.08"/>
      <path d="${path}" fill="url(#plateFill)" stroke="#7fb4dd" stroke-width="2.5"/>
      <clipPath id="c-${id}"><path d="${path}"/></clipPath>
      <g clip-path="url(#c-${id})" ${flip ? `transform="translate(${cx} 0) scale(-1 1) translate(${-cx} 0)"` : ""}>
        ${star(cx - pw * 0.34, bot - 32, 16)}
        ${star(cx + pw * 0.3, top + 62, 12)}
        <path d="M ${cx + pw * 0.38} ${bot - 66} a 30 30 0 1 0 23 42 23 23 0 1 1 -23 -42 Z" fill="#fde047" stroke="#eab308" stroke-width="1.2"/>
        <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${bot - ph * 0.52 - mh / 2}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
      </g>
      <circle cx="${cx}" cy="${top + 12}" r="24" fill="url(#capFill)" stroke="#9fd3e0" stroke-width="2"/>
      <text x="${cx}" y="${bot + 62}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">${tag}</text>
      <text x="${cx}" y="${bot + 94}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${sub}</text>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">สกรีน 2 ด้าน (ตัวกลาง) +30 บาท</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">พิมพ์ลายทั้งด้านหน้าและด้านหลังของตัวกลาง — เห็นลายจากทั้งสองฝั่ง</text>

  ${plate(228, false, "ด้านหน้า", "ลายหลัก")}
  ${plate(672, true, "ด้านหลัง", "ลายฝั่งตรงข้าม")}

  <text x="${W / 2}" y="${bot + 62}" font-family="${TH}" font-size="34" font-weight="700" text-anchor="middle" fill="#f59e0b">+</text>

  <!-- หน้าตัดแผ่นอะคริลิค — เห็นว่าหมึกอยู่ทั้งสองผิว -->
  <text x="${W / 2}" y="${bot + 158}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${INK}">หน้าตัดตัวกลาง (มองจากขอบแผ่น)</text>
  <rect x="240" y="${bot + 186}" width="420" height="26" rx="5" fill="#dbeefc" stroke="#7fb4dd" stroke-width="2"/>
  <rect x="240" y="${bot + 178}" width="420" height="8" rx="3" fill="#f59e0b"/>
  <rect x="240" y="${bot + 212}" width="420" height="8" rx="3" fill="#f59e0b"/>
  <text x="228" y="${bot + 186}" font-family="${TH}" font-size="20" text-anchor="end" fill="${SUB}">ลายหน้า</text>
  <text x="672" y="${bot + 226}" font-family="${TH}" font-size="20" fill="${SUB}">ลายหลัง</text>

  <text x="${W / 2}" y="${H - 104}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ไม่ติ๊ก = สกรีน 1 ด้าน (ลายเดียว) ราคาปกติ · คิดเฉพาะตัวกลาง ไม่รวมเสาค้ำ/ฐาน</text>
  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">งานสกรีนอะคริลิคปกติสกรีนใต้ — ต้องการสกรีนบนแจ้งได้ในหมายเหตุ</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ตัวกลางแขวนแกว่งได้ ลายด้านหลังจะเห็นตอนเรือแกว่งกลับ</text>
</svg>`;
}

// ── วาดภาพ ────────────────────────────────────────────────────────────
const jpeg = (svg) => sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

const files = {};
files[`size-set-${VER}.jpg`] = await jpeg(setArt(null));
files[`screen-2side-${VER}.jpg`] = await jpeg(screenArt());
for (const p of SPECIAL_PARTS) files[`special-${p.mode}-${VER}.jpg`] = await jpeg(setArt(p.mode));

for (const [f, buf] of Object.entries(files)) {
  writeFileSync(`${OUT}/${f}`, buf);
  console.log(`🖼  ${OUT}/${f}  ${Math.round(buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ──────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urlOf = {};
for (const [f, buf] of Object.entries(files)) {
  const key = `products/${PRODUCT_ID}/${f}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urlOf[f] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urlOf[f]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// 1) กลุ่ม "ขนาด" การ์ด — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกเป็นกลุ่มแรก
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  choices: [{
    name: SIZE_CHOICE,
    desc: "ไดคัทตามทรงได้ · เสาค้ำ 2 ชิ้น 14.8 × 9.6 ซม. · ฐาน 9.5 × 5.5 ซม.",
    imageSrc: urlOf[`size-set-${VER}.jpg`],
  }],
};
const atSize = options.findIndex((o) => norm(o.label) === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.splice(0, 0, sizeGroup);

// 2) ชื่อกลุ่มแผ่นกลาง — ตัดขนาดออก (ขนาดอยู่กลุ่มใหม่แล้ว) + ภาพ "สกรีน 2 ด้าน"
const plateOpt = options.find((o) => o.label === PLATE_GROUP_OLD || o.label === PLATE_GROUP);
if (!plateOpt) { console.error(`ไม่เจอกลุ่ม "${PLATE_GROUP_OLD}"`); process.exit(1); }
plateOpt.label = PLATE_GROUP;
const screenChoice = plateOpt.choices.find((c) => norm(c.name) === SCREEN2);
if (!screenChoice) { console.error(`ไม่เจอตัวเลือก "${SCREEN2}"`); process.exit(1); }
screenChoice.imageSrc = urlOf[`screen-2side-${VER}.jpg`];

// 3) "เพิ่มอะคริลิคพิเศษ" — ภาพชุดประกอบไฮไลต์ชิ้นที่จะเปลี่ยนเป็นสีพิเศษ (ไม่แตะชื่อ/ราคา)
const specialOpt = options.find((o) => norm(o.label) === SPECIAL_GROUP);
if (!specialOpt) { console.error(`ไม่เจอกลุ่ม "${SPECIAL_GROUP}"`); process.exit(1); }
for (const ch of specialOpt.choices) {
  const part = SPECIAL_PARTS.find((p) => p.name === norm(ch.name));
  if (!part) { console.error(`ชิ้นแปลกหน้าในกลุ่ม "${SPECIAL_GROUP}":`, JSON.stringify(ch.name)); process.exit(1); }
  ch.imageSrc = urlOf[`special-${part.mode}-${VER}.jpg`];
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const b = back.data.options;
const bSize = b.find((o) => o.label === SIZE_GROUP);
const bPlate = b.find((o) => o.label === PLATE_GROUP);
const bSpecial = b.find((o) => norm(o.label) === SPECIAL_GROUP);
const bad =
  b[0]?.label !== SIZE_GROUP ||
  bSize?.display !== "cards" || bSize?.choices?.[0]?.name !== SIZE_CHOICE ||
  bSize?.choices?.[0]?.imageSrc !== urlOf[`size-set-${VER}.jpg`] ||
  !bPlate || bPlate.choices?.find((c) => norm(c.name) === SCREEN2)?.imageSrc !== urlOf[`screen-2side-${VER}.jpg`] ||
  b.some((o) => o.label === PLATE_GROUP_OLD) ||
  bSpecial?.choices?.some((c) => {
    const part = SPECIAL_PARTS.find((p) => p.name === norm(c.name));
    return !part || c.imageSrc !== urlOf[`special-${part.mode}-${VER}.jpg`];
  });
if (bad) { console.error("อ่านกลับไม่ตรง!", JSON.stringify(b.map((o) => ({ label: o.label, display: o.display, choices: o.choices.map((c) => [c.name, c.imageSrc]) })), null, 1)); process.exit(1); }
console.log("✓ ขนาด(การ์ด) + สกรีน 2 ด้าน + อะคริลิคพิเศษ 3 ชิ้น อ่านกลับตรง · savedAt =", back.data.savedAt);
