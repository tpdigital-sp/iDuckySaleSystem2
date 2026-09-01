#!/usr/bin/env node
/**
 * ภาพจำลองตัวเลือกของ "สแตนดี้ หลายชิ้นใน 1 ฐาน" (id: new-mt1dwpc1-6773)
 *
 *   node scripts/standee-multi-piece-art.mjs             # วาดลง .cache/standee-multi-piece/upload
 *   node scripts/standee-multi-piece-art.mjs --upload    # อัปขึ้น Storage products/standee-multi-piece/
 *
 * งานนี้คือสแตนดี้อะคริลิคหลายชิ้น "ปักอยู่บนฐานเดียวกัน" (2-5 ชิ้น) ภาพจึงต้องเล่า 3 เรื่อง
 *
 *   set-2 … set-5    จำนวนชิ้นใน 1 ฐาน — เห็นเลยว่า 3 ชิ้นใน 1 ฐานหน้าตาเป็นยังไง
 *   set-more         เลือกเกิน 5 ชิ้น = ต้องคุยกับแอดมินก่อน
 *   main-3 … main-20 ขนาด "ชิ้นที่ 1 (ตัวหลัก)" — สเกลจริงเทียบกันได้ (20 ซม. = 320 px)
 *   sub-2 … sub-20   ขนาดชิ้นถัดไป — ชิ้นหลักเป็นเส้นประไว้เทียบ + บอกค่าชิ้นนั้น
 *   parts            ภาพอธิบายส่วนประกอบทั้งชุด (แกลเลอรี/แท็บ)
 *
 * สไตล์ภาพยึดชุดเดียวกับ standee-clear-stopper-art.mjs (กรอบขาว หัวเรื่อง เส้นบอกขนาด)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพแล้วให้ขยับ REV
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";

const UPLOAD = process.argv.includes("--upload");
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/standee-multi-piece/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

/** โฟลเดอร์บน Storage อ่านออกกว่า id ร่าง (new-mt1dwpc1-6773) — build script ประกอบ URL ชุดเดียวกันนี้ */
export const FOLDER = "standee-multi-piece";
export const PREFIX = "optart";
export const REV = "v1";

const MASCOT = await mascotDataUri("heart", 560);
const MASCOT2 = await mascotDataUri("peace", 480);

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
/** ชิ้นหลัก (ชิ้นที่ 1) = แกนราคา วาดเข้มสุด */
const MAIN = "rgba(56,189,248,0.22)";
const MAIN_EDGE = "#38bdf8";
/** ชิ้นถัดไป = คิดราคาตามขนาด วาดโทนอ่อนกว่าให้แยกออกว่าเป็นคนละชิ้น */
const SUBP = "rgba(226,232,240,0.62)";
const SUBP_EDGE = "#7dd3fc";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="70" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="108" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 38 - (a.length - 1 - i) * 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** เส้นบอกขนาดแนวตั้ง ป้ายอยู่ขวาเส้น */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" fill="${CYAN}">${label}</text>`;

/** ลายที่สกรีนบนชิ้นงาน — มาสคอตเป็ดของฝ่าย Content */
const artwork = (m, cx, cy, w, h, opacity = 1) => {
  const box = Math.min(w, h * 0.98);
  const aw = m.ratio >= 1 ? box : box * m.ratio;
  const ah = m.ratio >= 1 ? box / m.ratio : box;
  return `<image href="${m.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/** ฐานอะคริลิคมองแบบเฉียง (ชุดเดียวกับ standy-option-art) — ฐานเดียวรับได้หลายชิ้น */
const baseSideView = (cx, cy, rx) => {
  const ry = Math.min(34, Math.max(8, rx * 0.24));
  const th = 14;
  return `
    <path d="M${cx - rx} ${cy} v${th} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${th} z" fill="${MAIN}" stroke="${MAIN_EDGE}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${MAIN}" stroke="${MAIN_EDGE}" stroke-width="3"/>`;
};

/** ร่องเสียบบนปากฐาน — 1 ร่องต่อ 1 ชิ้น ให้เห็นว่าหลายชิ้นปักฐานเดียวกันจริง */
const slot = (cx, cy, w) =>
  `<rect x="${cx - w / 2}" y="${cy - 6}" width="${w}" height="12" rx="6" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`;

/** ป้ายเลขชิ้น วางมุมบนซ้ายของชิ้นงาน */
const badge = (cx, cy, n, on = true) => `
  <circle cx="${cx}" cy="${cy}" r="17" fill="${on ? CYAN : "#e2e8f0"}"/>
  <text x="${cx}" y="${cy + 7}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${on ? "#ffffff" : SUB}">${n}</text>`;

const legend = (items) =>
  items
    .map((it, i) => {
      const y = 146 + i * 30;
      return `<rect x="54" y="${y - 15}" width="22" height="22" rx="7" fill="${it.fill}" stroke="${it.stroke}" stroke-width="3"/>
      <text x="86" y="${y + 3}" font-family="${TH}" font-size="19" fill="${SUB}">${it.text}</text>`;
    })
    .join("");

const LEG_MAIN = { fill: MAIN, stroke: MAIN_EDGE, text: "ชิ้นที่ 1 (ตัวหลัก) — ราคาตามตารางขนาด" };
const LEG_SUB = { fill: SUBP, stroke: SUBP_EDGE, text: "ชิ้นถัดไป — คิดเพิ่มตามขนาดของชิ้นนั้น" };

/* ── สเกลกลาง ─────────────────────────────────────────────────────────── */
const MAIN_SIZES = Array.from({ length: 18 }, (_, i) => i + 3); // ชิ้นที่ 1 : 3-20 ซม.
const SUB_SIZES = Array.from({ length: 19 }, (_, i) => i + 2); // ชิ้นถัดไป : 2-20 ซม.
const PX_PER_CM = 14; // 20 ซม. = 280 px (ชุด main/sub ใช้สเกลเดียวกัน เทียบขนาดข้ามภาพได้)
const GROUND = 500; // ระดับปากฐาน (ขอบล่างของชิ้นงาน)
const RATIO = 0.74; // กว้าง : สูง ของตัวอย่างชิ้นงาน
const CX = 350;

const plate = (cx, bottom, long) => {
  const h = long;
  const w = long * RATIO;
  return { x: cx - w / 2, y: bottom - h, w, h, cx, cy: bottom - h / 2, r: Math.min(26, h * 0.15) };
};

/** วาดชิ้นงาน 1 ชิ้น (ตัวหลัก/ชิ้นถัดไป) พร้อมลายและป้ายเลข */
const piece = (p, { main = false, n = null, ghost = false, mascot = MASCOT } = {}) => {
  if (ghost)
    return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>`;
  return `
    <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}"
      fill="${main ? MAIN : SUBP}" stroke="${main ? MAIN_EDGE : SUBP_EDGE}" stroke-width="${main ? 4 : 3}"/>
    ${artwork(mascot, p.cx, p.y + p.h * 0.44, p.w * 0.78, p.h * 0.62, main ? 1 : 0.88)}
    ${n == null ? "" : badge(p.x + 4, p.y + 4, n, main)}`;
};

/* ── ชุดที่ 1: จำนวนชิ้นใน 1 ฐาน ─────────────────────────────────────── */
/** ความสูงตัวอย่างของแต่ละชิ้น (ซม.) — ชิ้นที่ 1 สูงสุดเสมอ ชิ้นถัดไปคละขนาดให้เห็นว่าเลือกแยกได้ */
const DEMO_CM = [10, 6, 8, 5, 7];

/** สเกลของภาพ "จำนวนชิ้น" — ยิ่งชิ้นเยอะยิ่งย่อ ให้ทั้งชุดกว้างพอดีกรอบเสมอ */
const setScale = (cms, gap, targetW = 440, maxPx = 26) => {
  const sum = cms.reduce((a, b) => a + b, 0);
  return Math.min(maxPx, (targetW - gap * (cms.length - 1)) / (sum * RATIO));
};

function setArt(n) {
  const cms = DEMO_CM.slice(0, n);
  const gap = n <= 3 ? -16 : -26; // ซ้อนกันนิดหน่อยให้ดูเป็นชุดเดียว
  const PX = setScale(cms, gap);
  const widths = cms.map((c) => c * PX * RATIO);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (n - 1);
  let x = CX - total / 2;
  const laid = cms.map((c, i) => {
    const p = plate(x + widths[i] / 2, GROUND, c * PX);
    x += widths[i] + gap;
    return p;
  });
  /** วาดชิ้นเตี้ยก่อน ชิ้นสูงทับทีหลัง — ชิ้นหลักจะได้เด่นและไม่ถูกบัง */
  const order = laid.map((p, i) => ({ p, i })).sort((a, b) => a.p.h - b.p.h);
  const rx = Math.min(300, Math.max(140, total / 2 + 46));
  return frame(`
    ${title(`${n} ชิ้นใน 1 ฐาน`, "เลือกขนาด · เนื้ออะคริลิค · งานสกรีน แยกทีละชิ้นได้")}
    ${legend([LEG_MAIN, LEG_SUB])}
    ${baseSideView(CX, GROUND + 20, rx)}
    ${laid.map((p) => slot(p.cx, GROUND + 18, Math.min(p.w * 0.8, 96))).join("")}
    ${order.map(({ p, i }) => piece(p, { main: i === 0, n: i + 1, mascot: i % 2 ? MASCOT2 : MASCOT })).join("")}
    ${baseSideView(CX, GROUND + 20, rx).replace(/<ellipse[\s\S]*$/, "")}
    ${foot([
      `1 ชุด = ${n} ชิ้น ปักอยู่บนฐานอะคริลิคเดียวกัน · คิดค่าฐานครั้งเดียว`,
      "ชิ้นที่ 1 คิดตามตารางราคา · ชิ้นถัดไปคิดเพิ่มตามขนาดของชิ้นนั้น",
      "สั่งกี่ชุดก็ได้ — ราคาต่อชุดถูกลงตามจำนวนชุดที่สั่ง",
    ])}`);
}

function setMoreArt() {
  const cms = [10, 6, 8, 5, 7, 6, 4];
  const gap = -30;
  const PX = setScale(cms, gap, 460, 22);
  const widths = cms.map((c) => c * PX * RATIO);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (cms.length - 1);
  let x = CX - total / 2;
  const laid = cms.map((c, i) => {
    const p = plate(x + widths[i] / 2, GROUND, c * PX);
    x += widths[i] + gap;
    return p;
  });
  const order = laid.map((p, i) => ({ p, i })).sort((a, b) => a.p.h - b.p.h);
  const rx = Math.min(300, Math.max(140, total / 2 + 40));
  return frame(`
    ${title("มากกว่า 5 ชิ้นใน 1 ฐาน", "งานแบบนี้ต้องคุยกับแอดมินก่อนสั่ง")}
    ${baseSideView(CX, GROUND + 20, rx)}
    ${laid.map((p) => slot(p.cx, GROUND + 18, Math.min(p.w * 0.8, 80))).join("")}
    ${order.map(({ p, i }) => piece(p, { main: i === 0, n: i + 1, mascot: i % 2 ? MASCOT2 : MASCOT })).join("")}
    <g>
      <rect x="${CX - 154}" y="150" width="308" height="76" rx="24" fill="#ecfeff" stroke="${CYAN}" stroke-width="3"/>
      <text x="${CX}" y="182" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${CYAN}">เกิน 5 ชิ้น = สอบถามแอดมิน</text>
      <text x="${CX}" y="212" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ต้องดูแบบและขนาดฐานก่อนตีราคา</text>
    </g>
    ${foot([
      "ชิ้นเยอะขึ้น ฐานต้องกว้างขึ้นและร่องเสียบต้องคำนวณใหม่",
      "ทักไลน์ร้านพร้อมไฟล์ลาย ทางร้านจะตีราคาให้ก่อนสั่ง",
    ])}`);
}

/* ── ชุดที่ 2: ขนาดชิ้นที่ 1 (ตัวหลัก) ───────────────────────────────── */
function mainArt(cm) {
  const ghost = 20 * PX_PER_CM;
  const m = plate(0, GROUND, cm * PX_PER_CM);
  /** ชิ้นที่ 2 ตัวอย่าง ยืนเคียงข้าง ให้เห็นว่าอยู่ฐานเดียวกัน */
  const sLong = Math.max(3 * PX_PER_CM, Math.min(5 * PX_PER_CM, m.h * 0.6));
  const s = plate(m.x + m.w + sLong * RATIO * 0.36, GROUND, sLong);
  /** กรอบเส้นประ 20 ซม. นับเป็นความกว้างของชุดด้วย ภาพจะได้ไม่เอียงไปข้างเดียวตอนชิ้นเล็ก */
  const left = Math.min(m.x, m.cx - (ghost * RATIO) / 2);
  const right = Math.max(s.x + s.w, m.cx + (ghost * RATIO) / 2);
  const rx = Math.max(120, (right - left) / 2 + 40);
  const bcx = (left + right) / 2;
  const dx = CX - bcx;
  return frame(`
    ${title(`ชิ้นที่ 1 — ${cm} ซม.`, "ตัวหลัก · วัดจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง ไม่นับฐาน)")}
    ${legend([LEG_MAIN, LEG_SUB])}
    <g transform="translate(${dx} 0)">
      ${
        cm < 20
          ? `<rect x="${m.cx - (ghost * RATIO) / 2}" y="${GROUND - ghost}" width="${ghost * RATIO}" height="${ghost}" rx="26"
        fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>`
          : ""
      }
      ${baseSideView(bcx, GROUND + 20, rx)}
      ${slot(m.cx, GROUND + 18, Math.min(m.w * 0.8, 96))}
      ${slot(s.cx, GROUND + 18, Math.min(s.w * 0.8, 70))}
      ${piece(s, { n: 2, mascot: MASCOT2 })}
      ${piece(m, { main: true, n: 1 })}
      ${dimV(right + 26, m.y, GROUND, `${cm} ซม.`)}
    </g>
    ${foot([
      "อะคริลิคหนา 3 มม. · พิมพ์ระบบ UV · ไดคัทตามลาย",
      "ราคาชิ้นที่ 1 คิดตามตารางราคา (รวมฐานแล้ว)",
      cm < 20 ? "เส้นประ = ขนาดใหญ่สุด 20 ซม. (ไว้เทียบขนาด)" : "ขนาดใหญ่สุดของเรทที่ 1",
    ])}`);
}

/* ── ชุดที่ 3: ขนาดชิ้นถัดไป ─────────────────────────────────────────── */
/** ค่าชิ้นถัดไปตามหลักของร้าน: 2 ซม. = 20 บาท แล้วเพิ่มเซนละ 10 บาท */
const subFee = (cm) => 20 + (cm - 2) * 10;

function subArt(cm) {
  const PX = PX_PER_CM; // สเกลเดียวกับภาพชุด "ชิ้นที่ 1" — เทียบขนาดข้ามภาพได้
  const mainCm = 12; // ชิ้นหลักอ้างอิงไว้เทียบสัดส่วน
  const m = plate(0, GROUND, mainCm * PX);
  const s = plate(m.x + m.w + (cm * PX * RATIO) / 2 - 10, GROUND, cm * PX);
  const left = m.x;
  const right = Math.max(m.x + m.w, s.x + s.w);
  const rx = Math.max(120, (right - left) / 2 + 40);
  const bcx = (left + right) / 2;
  const dx = CX - bcx;
  return frame(`
    ${title(`ชิ้นถัดไป — ${cm} ซม.`, "ชิ้นที่ 2-5 เลือกขนาดแยกจากตัวหลักได้")}
    ${legend([LEG_SUB, { ...LEG_MAIN, text: "เส้นประ = ชิ้นที่ 1 ขนาด 12 ซม. (ไว้เทียบขนาด)" }])}
    <g transform="translate(${dx} 0)">
      ${baseSideView(bcx, GROUND + 20, rx)}
      ${slot(m.cx, GROUND + 18, Math.min(m.w * 0.8, 96))}
      ${slot(s.cx, GROUND + 18, Math.min(s.w * 0.8, 80))}
      ${piece(m, { ghost: true })}
      <rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" fill="${SUBP}" stroke="${CYAN}" stroke-width="5"/>
      ${artwork(MASCOT2, s.cx, s.y + s.h * 0.44, s.w * 0.78, s.h * 0.62, 0.95)}
      ${badge(s.x + 4, s.y + 4, "2+", false)}
      ${dimV(right + 26, s.y, GROUND, `${cm} ซม.`)}
    </g>
    ${foot([
      `ชิ้นขนาดนี้คิดเพิ่มชิ้นละ ${subFee(cm)} บาท (2 ซม. = 20 บาท เพิ่มเซนละ 10 บาท)`,
      "สั่งจำนวนมาก ระบบเทียบกับตารางราคาแล้วคิดราคาที่ถูกกว่าให้",
      "งานสกรีน 2 ด้าน/3 เลเยอร์ ของชิ้นนี้ คิดเพิ่มตามขนาดชิ้นนี้เอง",
    ])}`);
}

/* ── ชุดที่ 4: ภาพอธิบายส่วนประกอบ ───────────────────────────────────── */
function partsArt() {
  const cms = [11, 6, 8];
  const gap = -18;
  const PX = setScale(cms, gap, 330, 24);
  const widths = cms.map((c) => c * PX * RATIO);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (cms.length - 1);
  let x = 250 - total / 2;
  const laid = cms.map((c, i) => {
    const p = plate(x + widths[i] / 2, GROUND, c * PX);
    x += widths[i] + gap;
    return p;
  });
  const order = laid.map((p, i) => ({ p, i })).sort((a, b) => a.p.h - b.p.h);
  const label = (x, y, text) => `<text x="${x}" y="${y}" font-family="${TH}" font-size="21" fill="${SUB}">${text}</text>`;
  const lead = (x1, y1, x2, y2) =>
    `<path d="M${x1} ${y1} H${x2}" stroke="${CYAN}" stroke-width="3" stroke-linecap="round"/>
     <circle cx="${x1}" cy="${y1}" r="5" fill="${CYAN}"/>`;
  return frame(`
    ${title("ส่วนประกอบของงาน", "สแตนดี้หลายชิ้น ปักอยู่บนฐานอะคริลิคเดียวกัน")}
    ${baseSideView(250, GROUND + 20, total / 2 + 44)}
    ${laid.map((p) => slot(p.cx, GROUND + 18, Math.min(p.w * 0.8, 90))).join("")}
    ${order.map(({ p, i }) => piece(p, { main: i === 0, n: i + 1, mascot: i % 2 ? MASCOT2 : MASCOT })).join("")}
    ${lead(laid[0].cx, laid[0].y + 30, 468, laid[0].y + 30)}${label(476, laid[0].y + 36, "ชิ้นที่ 1 (ตัวหลัก)")}
    ${lead(laid[1].cx, laid[1].y + 26, 468, laid[1].y + 26)}${label(476, laid[1].y + 32, "ชิ้นที่ 2")}
    ${lead(laid[2].cx, laid[2].y + 22, 468, laid[2].y + 22)}${label(476, laid[2].y + 28, "ชิ้นที่ 3")}
    ${lead(250 + total / 2, GROUND + 30, 468, GROUND + 30)}${label(476, GROUND + 36, "ฐานเดียวกัน")}
    ${foot([
      "เลือกได้ 2-5 ชิ้นใน 1 ฐาน · แต่ละชิ้นเลือกขนาด/เนื้อ/งานสกรีนแยกกัน",
      "ค่าฐานคิดครั้งเดียวต่อชุด ไม่ได้คิดรายชิ้น",
    ])}`);
}

/* ── เขียนไฟล์ ───────────────────────────────────────────────────────── */
const render = async (name, svg) => {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
};

for (let n = 2; n <= 5; n++) await render(`set-${n}`, setArt(n));
await render("set-more", setMoreArt());
for (const cm of MAIN_SIZES) await render(`main-${cm}`, mainArt(cm));
for (const cm of SUB_SIZES) await render(`sub-${cm}`, subArt(cm));
await render("parts", partsArt());
console.log(`🎨 วาดแล้ว ${4 + 1 + MAIN_SIZES.length + SUB_SIZES.length + 1} ภาพ → ${OUT}`);

if (UPLOAD) {
  const env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const files = readdirSync(OUT).filter((f) => f.endsWith(".jpg"));
  let done = 0;
  for (const f of files) {
    const buf = await readFile(`${OUT}/${f}`);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${FOLDER}/${PREFIX}-${f.replace(/\.jpg$/, "")}-${REV}.jpg`, buf, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) throw new Error(`${f}: ${error.message}`);
    done++;
    if (done % 10 === 0 || done === files.length) console.log(`⬆️  ${done}/${files.length}`);
  }
}
