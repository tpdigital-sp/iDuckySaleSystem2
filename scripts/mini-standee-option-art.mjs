#!/usr/bin/env node
/**
 * MINI STANDEE (mini-standee · /products/MINI-STANDEE) — กลุ่มตัวเลือก + ภาพตัวอย่าง
 *
 *   node scripts/mini-standee-option-art.mjs            (วาดภาพลง .cache/mini-standee/upload ดูก่อน)
 *   node scripts/mini-standee-option-art.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69 สามข้อ:
 *   1. กลุ่ม "ขนาด" → display "cards" (การ์ดรูปใหญ่ + คำอธิบาย) พร้อม desc ต่อตัวเลือก
 *   2. ทุกกลุ่มตัวเลือกต้องมี "ภาพตัวอย่าง" — วาดเอง 900×900 ครบ 3 กลุ่ม (6 ใบ)
 *   3. กลุ่มจำนวนด้าน เปลี่ยนชื่อตัวเลือกเป็น "สกรีน 1 ด้าน" / "สกรีน 2 ด้าน"
 *
 * สเปคจริงมาจาก data.terms ของสินค้าเอง (ไม่ได้เดา):
 *   *ขนาด 1.5cm | ฐานทรงกลม 1cm      *ขนาด 2.5cm | ฐานทรงกลม 1.5cm
 *   *ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวแทยง)
 *   *ฐานจะมีรอยด่างของการตัดบริเวณรูเสียบ
 * ทรงของจริงจากรูปแกลเลอรี: ชิ้นงานไดคัทขอบขาว + ริมอะคริลิคใส เสียบร่องบนฐานกลมใสบาง ๆ
 *
 * ⚠️ กลุ่ม "ขนาด" เป็น **แกนตารางราคา** (pricing.driverLabels = ["ขนาด"] · cells คีย์ "1.5cm"/"2.5cm"
 *    ทั้งใน pricing และ priceRates[0].pricing) — สคริปต์นี้จึง **ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือกของกลุ่มนี้**
 *    เติมแค่ display/desc/imageSrc ([[iducky-price-driver-trap]]) และเช็คซ้ำตอนอ่านกลับว่าคีย์ราคายังครบ
 * ⚠️ กลุ่ม "พิมพ์กี่ด้าน" ไม่ใช่แกนราคา ไม่มี rules/showWhen อ้างชื่อ → เปลี่ยนชื่อตัวเลือกได้ตรง ๆ
 *    (extra 5 ของ 2 ด้าน ต้องอยู่ครบ — เช็คตอนอ่านกลับ)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: read-modify-write ทีละฟิลด์ · รับทั้งชื่อเก่า/ชื่อใหม่ตอนหาตัวเลือก · ไม่ย้ายลำดับกลุ่ม
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 460);

const PRODUCT_ID = "mini-standee";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mini-standee/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const G_SIZE = "ขนาด";
const G_BASE = "ฐาน";
const G_SIDES = "พิมพ์กี่ด้าน";
/** ชื่อเก่า → ชื่อใหม่ ของกลุ่มจำนวนด้าน (รันซ้ำ = เจอชื่อใหม่อยู่แล้วก็ผ่าน) */
const RENAME = { "1 ด้าน": "สกรีน 1 ด้าน", "2 ด้าน": "สกรีน 2 ด้าน" };

/** ขนาด + ฐาน ตาม terms ของสินค้า */
const SIZES = [
  { choice: "1.5cm", cm: 1.5, base: 1.0, file: "size-1-5cm" },
  { choice: "2.5cm", cm: 2.5, base: 1.5, file: "size-2-5cm" },
];

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
/** อะคริลิคใส — ริมชิ้นงานและฐาน */
const CLEAR = "#e9f3fb";
const CLEAR_EDGE = "#b8cbdd";

/** 1 ซม. = 165 px (การ์ดขนาดทั้ง 2 ใบสเกลเดียวกัน) */
const CM = 165;
const GROUND = 735; // ก้นฐาน

const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  ${subtitle ? `<text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>` : ""}
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - (note2 ? 72 : 44)}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ป้ายชื่อใต้ชิ้นงาน */
const tag = (cx, y, text, on = true) => {
  const w = text.length * 14 + 44;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

/** ลูกศรวัดแนวตั้ง — ป้ายหมุน 90° แนบเส้น (dx<0 = ป้ายอยู่ซ้ายของเส้น) */
const dimV = (x, y1, y2, label, dx = 28) => {
  const lw = label.length * 13 + 10;
  const lx = x + dx;
  const my = (y1 + y2) / 2;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x - 9}" y1="${y1}" x2="${x + 9}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x - 9}" y1="${y2}" x2="${x + 9}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
    <g transform="rotate(-90 ${lx} ${my})">
      <rect x="${lx - lw / 2}" y="${my - 16}" width="${lw}" height="32" rx="8" fill="#ffffff" opacity="0.93"/>
      <text x="${lx}" y="${my + 9}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>
    </g>`;
};

/** ลูกศรวัดแนวนอน — ป้ายอยู่ใต้เส้น */
const dimH = (x1, x2, y, label) => `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x1}" y1="${y - 9}" x2="${x1}" y2="${y + 9}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x2}" y1="${y - 9}" x2="${x2}" y2="${y + 9}" stroke="${SUB}" stroke-width="3"/>
    <text x="${(x1 + x2) / 2}" y="${y + 34}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;

/**
 * ฐานกลมอะคริลิคใส มองเฉียงเล็กน้อย — จานกลมบาง มีร่องเสียบกลางจาน
 * dCm = เส้นผ่านศูนย์กลางจริง (ซม.) · คืน { svg, topCy, rx, ry }
 */
function baseDisc(cx, groundY, dCm, scale, printed = false, id = "b") {
  const rx = (dCm * scale) / 2;
  const ry = rx * 0.30;              // มุมมองเฉียง ~17°
  const t = 0.3 * scale;             // ฐานหนา 3 มม.
  const topCy = groundY - ry - t;
  const slotW = rx * 0.92;
  const top = printed
    ? `<ellipse cx="${cx}" cy="${topCy}" rx="${rx}" ry="${ry}" fill="url(#pr-${id})" stroke="${CLEAR_EDGE}" stroke-width="3"/>`
    : `<ellipse cx="${cx}" cy="${topCy}" rx="${rx}" ry="${ry}" fill="#f4fafe" stroke="${CLEAR_EDGE}" stroke-width="3"/>`;
  return {
    topCy,
    rx,
    ry,
    svg: `
    <defs>
      <linearGradient id="pr-${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fde68a"/>
        <stop offset="0.5" stop-color="#fca5a5"/>
        <stop offset="1" stop-color="#a5b4fc"/>
      </linearGradient>
    </defs>
    <!-- ผนังข้างของจาน -->
    <path d="M ${cx - rx} ${topCy} L ${cx - rx} ${topCy + t}
             A ${rx} ${ry} 0 0 0 ${cx + rx} ${topCy + t}
             L ${cx + rx} ${topCy} Z"
      fill="${printed ? "#f3d9c6" : CLEAR}" stroke="${CLEAR_EDGE}" stroke-width="3"/>
    ${top}
    <!-- ร่องเสียบกลางจาน (ของจริงมีรอยด่างจากการตัด) -->
    <rect x="${cx - slotW / 2}" y="${topCy - ry * 0.16}" width="${slotW}" height="${Math.max(5, ry * 0.34)}" rx="${Math.max(2.5, ry * 0.17)}"
      fill="#cfe0ee" stroke="#9fb6c9" stroke-width="2"/>
    <!-- ไฮไลต์ผิวอะคริลิค -->
    <path d="M ${cx - rx * 0.62} ${topCy - ry * 0.34} A ${rx * 0.66} ${ry * 0.62} 0 0 1 ${cx + rx * 0.2} ${topCy - ry * 0.62}"
      fill="none" stroke="#ffffff" stroke-width="${Math.max(3, ry * 0.22)}" stroke-linecap="round" opacity="0.85"/>`,
  };
}

/** สัดส่วนชิ้นงาน: กว้าง = สูง × อัตราส่วนของลาย (ไดคัทตามลาย ไม่ใช่กรอบสี่เหลี่ยม) */
const pieceW = (h, m) => h * 0.92 * m.ratio;

/**
 * ชิ้นงานไดคัท (ตัวสแตนดี้) — **ไดคัทตามลายจริง** ไม่ใช่กรอบทรงมน:
 * ดัน alpha ของลายออกด้วย feMorphology 2 ชั้น = ขอบขาวไดคัท + ริมอะคริลิคใสรอบนอก
 * (ทรงเดียวกับรูปงานจริงในแกลเลอรี) + เดือยเสียบใต้ชิ้นงานสำหรับหย่อนลงร่องฐาน
 *   h = ความสูงจริงของชิ้นงาน (= ด้านที่ยาวที่สุด) · bottomY = ก้นชิ้นงานที่จมในร่อง
 *   blank = true → ชิ้นเปล่าไม่พิมพ์ลาย (ด้านหลังของ "สกรีน 1 ด้าน")
 */
function figure(cx, bottomY, h, mascot, id = "f", blank = false, flip = false) {
  const m = mascot ?? HEART;                 // ชิ้นเปล่าใช้ซิลูเอตเดียวกัน จะได้เป็นชิ้นเดียวกันคนละด้าน
  const rimW = Math.max(5, h * 0.030);       // ขอบขาวไดคัท ~1 มม.
  const rimC = rimW * 1.8;                   // ริมอะคริลิคใสรอบนอก
  const artH = h * 0.92;
  const artW = artH * m.ratio;
  const y = bottomY - h + rimC;
  const tabW = artW * 0.30;
  const tabH = h * 0.09;
  return `
    <defs><filter id="cut-${id}" x="-30%" y="-30%" width="160%" height="160%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="${(rimC + 2.5).toFixed(1)}" result="de"/>
      <feFlood flood-color="${CLEAR_EDGE}"/><feComposite in2="de" operator="in" result="edge"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="${rimC.toFixed(1)}" result="dc"/>
      <feFlood flood-color="#eaf5fd"/><feComposite in2="dc" operator="in" result="clear"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="${rimW.toFixed(1)}" result="dw"/>
      <feFlood flood-color="#ffffff"/><feComposite in2="dw" operator="in" result="white"/>
      <feMerge><feMergeNode in="edge"/><feMergeNode in="clear"/><feMergeNode in="white"/>${blank ? "" : `<feMergeNode in="SourceGraphic"/>`}</feMerge>
    </filter></defs>
    <!-- เดือยอะคริลิคใสที่หย่อนลงร่องฐาน (วาดก่อนตัวชิ้นงาน = โผล่แค่ท่อนล่าง) -->
    <rect x="${cx - tabW / 2}" y="${bottomY - tabH}" width="${tabW}" height="${tabH}" rx="3"
      fill="#eaf5fd" stroke="${CLEAR_EDGE}" stroke-width="2.5"/>
    <g filter="url(#cut-${id})">
      <g${flip ? ` transform="translate(${cx * 2} 0) scale(-1 1)"` : ""}><image href="${m.uri}" x="${cx - artW / 2}" y="${y}" width="${artW}" height="${artH}" preserveAspectRatio="xMidYMid meet"/></g>
    </g>
    ${blank ? `<text x="${cx}" y="${bottomY - h * 0.46}" font-family="${TH}" font-size="${Math.max(16, h * 0.082)}" font-weight="700" text-anchor="middle" fill="#c6cfd9">ไม่พิมพ์ลาย</text>` : ""}`;
}

/** ไม้บรรทัดแนวตั้ง 0-3 ซม. สเกลเดียวกับชิ้นงาน + ไฮไลต์ช่วง 0→ขนาดที่เลือก */
const rulerV = (x, groundY, selCm) => {
  let ticks = "";
  for (let mm = 0; mm <= 30; mm += 1) {
    const y = groundY - (mm / 10) * CM;
    const big = mm % 10 === 0;
    const mid = mm % 5 === 0;
    ticks += `<line x1="${x}" y1="${y}" x2="${x + (big ? 26 : mid ? 18 : 10)}" y2="${y}" stroke="${big ? INK : "#94a3b8"}" stroke-width="${big ? 3 : 1.5}"/>`;
    if (big) ticks += `<text x="${x - 12}" y="${y + 8}" font-family="${TH}" font-size="21" text-anchor="end" fill="${SUB}">${mm / 10}</text>`;
  }
  const selY = groundY - selCm * CM;
  return `
    <rect x="${x}" y="${selY}" width="13" height="${selCm * CM}" rx="5" fill="${OK}" opacity="0.22"/>
    <line x1="${x}" y1="${groundY}" x2="${x}" y2="${groundY - 3 * CM}" stroke="${INK}" stroke-width="3"/>
    ${ticks}
    <line x1="${x - 16}" y1="${selY}" x2="${x + 46}" y2="${selY}" stroke="${OK}" stroke-width="3.5"/>
    <circle cx="${x + 46}" cy="${selY}" r="7" fill="${OK}"/>
    <text x="${x + 4}" y="${groundY - 3 * CM - 22}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ซม.</text>`;
};

// ── การ์ดกลุ่ม "ขนาด" — ชิ้นงาน+ฐานสเกลจริง · ไม้บรรทัดซ้าย · เลขตัวใหญ่ขวา ───
function sizeArt(s) {
  const cx = 380;
  const disc = baseDisc(cx, GROUND, s.base, CM, false, `s${s.file}`);
  const figBottom = disc.topCy + disc.ry * 0.10;   // ก้นชิ้นงานจมในร่อง
  const h = s.cm * CM;
  const top = figBottom - h;
  const w = pieceW(h, HEART);
  const body = `
    ${rulerV(96, GROUND, s.cm)}
    ${disc.svg}
    ${figure(cx, figBottom, h, HEART, `s${s.file}`)}
    ${dimV(cx - w / 2 - 34, top, figBottom, `${s.cm} ซม.`, -30)}
    ${dimH(cx - disc.rx, cx + disc.rx, GROUND + 30, `ฐาน ${s.base} ซม.`)}
    <text x="700" y="392" font-family="${TH}" font-size="168" font-weight="800" text-anchor="middle" fill="${OK}">${s.cm}</text>
    <text x="700" y="452" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${SUB}">ซม.</text>
    <text x="700" y="516" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ตัวสแตนดี้ด้านยาวสุด</text>
    <text x="700" y="556" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ฐานกลม ${s.base} ซม.</text>`;
  return card(`ขนาด ${s.cm} ซม.`, "วัดจากด้านที่ยาวที่สุดของตัวสแตนดี้", body,
    "ทั้ง 2 ขนาดวาดสเกลเดียวกัน · อะคริลิคใส พิมพ์ UV");
}

// ── กลุ่ม "ฐาน" — จานกลมใส vs จานสกรีนลาย (โคลสอัพที่ตัวฐาน) ──────────
function baseArt(printed) {
  const S = 260;                    // 1 ซม. = 260 px (โคลสอัพ — ฐานคือพระเอก)
  const groundY = 690;
  const cx = W / 2;
  const disc = baseDisc(cx, groundY, 1.5, S, printed, printed ? "bp" : "bc");
  const figBottom = disc.topCy + disc.ry * 0.10;
  const body = `
    ${disc.svg}
    ${figure(cx, figBottom, 1.45 * S, HEART, printed ? "bp" : "bc")}
    ${tag(cx, groundY + 58, printed ? "ฐานสกรีนลาย" : "ฐานใส ไม่สกรีน", printed)}`;
  return printed
    ? card("ฐาน — สกรีนลาย", "พิมพ์ลาย/สีลงบนหน้าฐานกลม", body,
      "เลือกลายเองได้ · เพิ่ม ฿5 ต่อชิ้น")
    : card("ฐาน — ใสไม่สกรีน", "ฐานกลมอะคริลิคใสล้วน", body,
      "ฐานใสโปร่ง เห็นพื้นโต๊ะทะลุ · ราคามาตรฐาน");
}

// ── กลุ่ม "พิมพ์กี่ด้าน" — ด้านหน้า/ด้านหลังของชิ้นเดียวกัน ────────────
function sidesArt(sides) {
  const one = sides === 1;
  const S = 175;                    // 1 ซม. = 175 px
  const groundY = 660;
  const lx = W / 2 - 218;
  const rx = W / 2 + 218;
  const dl = baseDisc(lx, groundY, 1.5, S, false, "d1");
  const dr = baseDisc(rx, groundY, 1.5, S, false, "d2");
  const h = 2.5 * S * 0.92;
  const body = `
    ${dl.svg}${figure(lx, dl.topCy + dl.ry * 0.1, h, HEART, "f1")}
    ${dr.svg}${figure(rx, dr.topCy + dr.ry * 0.1, h, HEART, "f2", one, true)}
    ${tag(lx, groundY + 56, "ด้านหน้า — มีลาย")}
    ${tag(rx, groundY + 56, one ? "ด้านหลัง — ไม่พิมพ์" : "ด้านหลัง — มีลาย", !one)}
    <circle cx="${W / 2}" cy="360" r="60" fill="${one ? "#f1f5f9" : "#ecfeff"}" stroke="${one ? "#cbd5e1" : OK}" stroke-width="4"/>
    <text x="${W / 2}" y="382" font-family="${TH}" font-size="62" font-weight="800" text-anchor="middle" fill="${one ? SUB : OK}">${sides}</text>`;
  return one
    ? card("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้าด้านเดียว", body,
      "ด้านหลังเป็นอะคริลิคใสเปล่า มองทะลุเห็นลายหน้าแบบกลับข้าง")
    : card("สกรีน 2 ด้าน", "พิมพ์ทั้งด้านหน้าและด้านหลัง", body,
      "ชิ้นเดียวกัน ทรงไดคัทเดียวกัน — ลายหน้า/หลังคนละลายได้ · เพิ่ม ฿5 ต่อชิ้น");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = [
  ...SIZES.map((s) => ({ group: G_SIZE, choice: s.choice, file: `${s.file}-${VER}.jpg`, svg: sizeArt(s) })),
  { group: G_BASE, choice: "ฐานใสไม่สรีน", file: `base-clear-${VER}.jpg`, svg: baseArt(false) },
  { group: G_BASE, choice: "สกรีนลาย", file: `base-printed-${VER}.jpg`, svg: baseArt(true) },
  { group: G_SIDES, choice: "สกรีน 1 ด้าน", file: `screen-1side-${VER}.jpg`, svg: sidesArt(1) },
  // v2: ด้านหลังเคยวาดเป็นมาสคอตคนละตัว = คนละทรงไดคัท ซึ่งผิด — ของจริงเป็นชิ้นเดียวพลิกดูอีกด้าน
  { group: G_SIDES, choice: "สกรีน 2 ด้าน", file: `screen-2side-v2.jpg`, svg: sidesArt(2) },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  // ตรวจว่า "อ่านออกตอนย่อ" จริง — การ์ดเรนเดอร์รูปที่ 80px ([[iducky-option-thumb-crop]])
  await sharp(j.buf).resize(80, 80).png().toFile(`${OUT}/thumb-${j.file.replace(/\.jpg$/, ".png")}`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage ──────────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${PRODUCT_ID}/`);

// ── เขียน options (อ่าน DB สดก่อนเสมอ) ───────────────────────────────
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const gOf = (label) => {
  const g = (data.options ?? []).find((o) => o.label === label);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${label}"`); process.exit(1); }
  return g;
};

// 1. กลุ่มจำนวนด้าน — เปลี่ยนชื่อตัวเลือกก่อน (idempotent)
for (const c of gOf(G_SIDES).choices ?? []) if (RENAME[c.name]) c.name = RENAME[c.name];

// 2. กลุ่มขนาด — เป็นการ์ด + คำอธิบายใต้ชื่อ (ชื่อกลุ่ม/ตัวเลือกห้ามแตะ = แกนราคา)
const gs = gOf(G_SIZE);
gs.display = "cards";
for (const s of SIZES) {
  const c = gs.choices?.find((c) => c.name === s.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${G_SIZE}: ${s.choice}"`); process.exit(1); }
  c.desc = `ตัวสแตนดี้ด้านยาวสุด ${s.cm} ซม. · ฐานกลม ${s.base} ซม.`;
}

// 3. ติดภาพให้ทุกตัวเลือกทั้ง 3 กลุ่ม
for (const j of JOBS) {
  const c = gOf(j.group).choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.group}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bOf = (label) => back.data.options.find((o) => o.label === label);
for (const j of JOBS) {
  const c = bOf(j.group)?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.group, j.choice, c); process.exit(1); }
}
const bs = bOf(G_SIZE);
if (bs.display !== "cards") { console.error("display cards ไม่ติด!", bs.display); process.exit(1); }
for (const s of SIZES) if (!bs.choices.find((c) => c.name === s.choice)?.desc) { console.error("desc หาย!", s.choice); process.exit(1); }
// แกนราคา: คีย์คอลัมน์ต้องยังตรงกับชื่อตัวเลือกของกลุ่ม "ขนาด" ทั้ง pricing และทุกเรท
const keySets = [back.data.pricing, ...(back.data.priceRates ?? []).map((r) => r.pricing)].filter(Boolean);
for (const p of keySets) {
  for (const s of SIZES) if (!(s.choice in (p.cells ?? {}))) { console.error("คีย์ราคาหาย!", s.choice, Object.keys(p.cells ?? {})); process.exit(1); }
  if (String(p.driverLabels) !== G_SIZE) { console.error("driverLabels เพี้ยน!", p.driverLabels); process.exit(1); }
}
const bsd = bOf(G_SIDES);
if (bsd.choices.find((c) => RENAME[c.name])) { console.error("ยังมีชื่อเก่าค้าง!", bsd.choices); process.exit(1); }
if (bsd.choices.find((c) => c.name === "สกรีน 2 ด้าน")?.extra !== 5) { console.error("extra สกรีน 2 ด้าน หาย!", bsd.choices); process.exit(1); }
if (bOf(G_BASE).choices.find((c) => c.name === "สกรีนลาย")?.extra !== 5) { console.error("extra ฐานสกรีนลาย หาย!"); process.exit(1); }
console.log(`✓ การ์ดขนาด + desc + ภาพ ${JOBS.length} ใบ + เปลี่ยนชื่อสกรีน 1/2 ด้าน — อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
