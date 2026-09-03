#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่มตัวเลือกของ Clipboard Acrylic (clipboard-acrylic)
 *
 *   node scripts/clipboard-acrylic-option-art.mjs            (วาดภาพลง .cache/clipboard-acrylic/upload ดูก่อน)
 *   node scripts/clipboard-acrylic-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * กลุ่มที่ได้ภาพ (เดิมไม่มีภาพเลย):
 *   1. "ขนาด" (dropdown · แกนราคา) — การ์ดสเกลจริง A6/A5/A4 (1 ซม. = 15 px ทุกใบเทียบกันได้)
 *      เส้นประ = อีก 2 ขนาด + บัตร ATM เทียบขนาด · ตัวหนีบโลหะ 10 ซม. ตาม terms
 *   2. "ไดคัท" — สี่เหลี่ยม (ขอบตรงมุมโค้ง) vs ตามทรง (ขอบหยักตามลาย + เส้นประรอยตัด)
 *   3. "สกรีน" ของ A5 และ A4 (กลุ่มชื่อซ้ำ แยกด้วย showWhen) — 1 ด้าน / 2 ด้าน
 *      (กลุ่มสกรีนของ A6 มีภาพชุดกลาง acrylic-howto อยู่แล้ว ไม่แตะ)
 *   4. "ฝั่งลายสกรีนเวลาถือ" — คนถือ/คนตรงหน้า มองเห็นลายฝั่งไหน (มุมมองด้านข้าง)
 *   5. "สีอะคริลิค" → "อะคริลิคใส" ตัวเดียวที่ไม่มีรูป — ก๊อปภาพจริงจาก
 *      products/griptok-acrylic/acrylic-1.jpg มาเป็นไฟล์ของสินค้านี้ (แต่ละสินค้าถือไฟล์ตัวเอง)
 *
 * ⚠️ กลุ่ม "สกรีน" มี 3 กลุ่มชื่อซ้ำ — ห้าม find(label) เดี่ยว ๆ ต้องเช็ค showWhen ด้วย
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);
const PEACE = await mascotDataUri("peace", 420);

const PRODUCT_ID = "clipboard-acrylic";
/** v1 = รอบแรก (บอร์ดชิดซ้าย · ย่อ 62px แล้วแยกไม่ออก) → v2 จัดจุดต่างมากลางภาพ ลบ v1 ออกจาก storage แล้ว */
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/clipboard-acrylic/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const ACRYL = "#eaf5fd";
const ACRYL_EDGE = "#9cc3de";
const STAR = "#f4b73f";
const METAL = "#7b8694";
const METAL_HI = "#aeb8c4";

// ── โครงการ์ดร่วม ────────────────────────────────────────────────────
const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

const pill = (cx, y, text, on = true) => {
  const w = text.length * 14 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y}" width="${w}" height="44" rx="22" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 30}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

/** ลูกศรวัดขนาด (ชุดเดียวกับ clip-pouch-size-art) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const tick = (x, y) => `<line x1="${x - (vertical ? 7 : 0)}" y1="${y - (vertical ? 0 : 7)}" x2="${x + (vertical ? 7 : 0)}" y2="${y + (vertical ? 0 : 7)}" stroke="${SUB}" stroke-width="3"/>`;
  const lw = label.length * 11;
  const labelSvg = vertical
    ? `<g transform="rotate(-90 ${x1 - 14} ${(y1 + y2) / 2})">
        <rect x="${x1 - 14 - lw / 2}" y="${(y1 + y2) / 2 - 14}" width="${lw}" height="27" rx="6" fill="#ffffff" opacity="0.92"/>
        <text x="${x1 - 14}" y="${(y1 + y2) / 2 + 7}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>
      </g>`
    : `<rect x="${(x1 + x2) / 2 - lw / 2}" y="${y2 + 6}" width="${lw}" height="27" rx="6" fill="#ffffff" opacity="0.92"/>
      <text x="${(x1 + x2) / 2}" y="${y2 + 27}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    ${labelSvg}`;
};

/** ลายเป็ด สเกลตามกรอบ ไม่ล้น */
const artwork = (m, cx, cy, boxW, boxH) => {
  const r = m.ratio;
  let aw = boxH * r;
  let ah = boxH;
  if (aw > boxW) { aw = boxW; ah = boxW / r; }
  return `<image href="${m.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

/** ดาวห้าแฉก */
const starAt = (sx, sy, r) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(sx + rr * Math.cos(a)).toFixed(1)},${(sy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${pts}" fill="${STAR}" opacity="0.8"/>`;
};

/** ลายพิมพ์บนแผ่น (ดาว+จุด กระจายสัมพัทธ์กับกรอบ) */
const boardPattern = (x, y, w, h) =>
  [
    [0.14, 0.14, 0.028], [0.86, 0.1, 0.034], [0.16, 0.86, 0.036], [0.85, 0.82, 0.028],
    [0.08, 0.5, 0.022], [0.92, 0.44, 0.022], [0.5, 0.06, 0.02], [0.55, 0.94, 0.022],
  ]
    .map(([fx, fy, fr]) => starAt(x + w * fx, y + h * fy, Math.max(7, Math.min(w, h) * fr)))
    .join("") +
  [[0.3, 0.1], [0.72, 0.9], [0.06, 0.72], [0.94, 0.66], [0.4, 0.92], [0.68, 0.08]]
    .map(([fx, fy]) => `<circle cx="${x + w * fx}" cy="${y + h * fy}" r="4.5" fill="#7cc4e8" opacity="0.8"/>`)
    .join("");

/** ตัวหนีบโลหะมุมมองด้านหน้า — แท่งฐาน + ก้านกดด้านบน + สกรู 2 ตัว */
const clip = (cx, boardTop, clipW, scale = 1) => {
  const bh = 18 * scale;   // ครึ่งบน-ล่างของแท่งฐานคร่อมขอบแผ่น
  const lever = clipW * 0.56;
  const lh = 13 * scale;
  const y = boardTop - bh / 2;
  return `
    <rect x="${cx - lever / 2}" y="${y - lh + 3}" width="${lever}" height="${lh + 4}" rx="${lh / 2}" fill="${METAL_HI}" stroke="${METAL}" stroke-width="1.5"/>
    <rect x="${cx - clipW / 2}" y="${y}" width="${clipW}" height="${bh}" rx="${bh / 2.6}" fill="${METAL}"/>
    <rect x="${cx - clipW / 2 + 5}" y="${y + 2.5}" width="${clipW - 10}" height="${bh * 0.34}" rx="${bh * 0.17}" fill="${METAL_HI}" opacity="0.85"/>
    <circle cx="${cx - clipW / 2 + 16 * scale}" cy="${y + bh / 2}" r="${4 * scale}" fill="#5b6572"/>
    <circle cx="${cx + clipW / 2 - 16 * scale}" cy="${y + bh / 2}" r="${4 * scale}" fill="#5b6572"/>`;
};

/** คลิปบอร์ดเต็มตัว (แผ่นพิมพ์ลาย + ตัวหนีบ) — ก้นแผ่นชนเส้น ground */
const clipboard = (cx, ground, wpx, hpx, clipWpx, uid, mascot = HEART, opts = {}) => {
  const x = cx - wpx / 2;
  const top = ground - hpx;
  const r = Math.min(14, wpx * 0.06);
  const blank = opts.blank ?? false;
  return `
    <clipPath id="${uid}"><rect x="${x}" y="${top}" width="${wpx}" height="${hpx}" rx="${r}"/></clipPath>
    <rect x="${x}" y="${top}" width="${wpx}" height="${hpx}" rx="${r}" fill="${blank ? "#f2f8fc" : ACRYL}" stroke="${ACRYL_EDGE}" stroke-width="3"/>
    ${blank ? `
      <line x1="${x + wpx * 0.18}" y1="${top + hpx * 0.3}" x2="${x + wpx * 0.62}" y2="${top + hpx * 0.74}" stroke="#ffffff" stroke-width="${wpx * 0.07}" opacity="0.75"/>
      <line x1="${x + wpx * 0.38}" y1="${top + hpx * 0.26}" x2="${x + wpx * 0.78}" y2="${top + hpx * 0.66}" stroke="#ffffff" stroke-width="${wpx * 0.03}" opacity="0.75"/>` : `
    <g clip-path="url(#${uid})">
      ${boardPattern(x, top, wpx, hpx)}
      ${artwork(mascot, cx, top + hpx * 0.58, wpx * 0.6, hpx * 0.5)}
    </g>`}
    ${clip(cx, top, clipWpx)}`;
};

// ═════════════════ 1) การ์ดขนาด A6/A5/A4 — สเกลจริง ═════════════════
/** ⚠️ ภาพย่อบนปุ่ม/ข้าง dropdown ถูกครอป "กลางภาพ" เป็นสี่เหลี่ยม 62×62 (object-fit: cover)
 *  ทุกการ์ดในไฟล์นี้จึงต้องวางจุดที่ทำให้ตัวเลือกต่างกัน ไว้ในกรอบกลาง 300–600 px
 *  (ของเดิมวางบอร์ดชิดซ้าย → ย่อแล้วเห็นแต่ตัวเป็ด ทุกตัวเลือกหน้าตาเหมือนกันหมด) */
const CM = 15; // 1 ซม. = 15 px ทุกใบ
const GROUND = 700;
const BOARD_CX = 450; // กลางภาพ — ป้ายขนาดบนบอร์ดจะตกอยู่ในกรอบครอป
const CARD_CX = 150;
const CLIP_CM = 10; // terms: อะไหล่ตัวหนีบ 10cm

const SIZES = [
  { choice: "ขนาด A6", wcm: 10.5, hcm: 14.8, file: "size-a6", use: "เมนู · ป้ายราคา · โน้ตสั้น" },
  { choice: "ขนาด A5", wcm: 14.8, hcm: 21, file: "size-a5", use: "สมุดออเดอร์ · เช็คลิสต์" },
  { choice: "ขนาด A4", wcm: 21, hcm: 29.7, file: "size-a4", use: "เอกสาร · ใบเซ็นชื่อ · แบบฟอร์ม" },
];

const ghost = (cx, ground, wcm, hcm, label, onTop = false) => `<rect x="${cx - (wcm * CM) / 2}" y="${ground - hcm * CM}" width="${wcm * CM}" height="${hcm * CM}" rx="12"
  fill="none" stroke="${onTop ? "#64809c" : "#cbd5e1"}" stroke-width="${onTop ? 2 : 2.5}" stroke-dasharray="8 7"${onTop ? ' opacity="0.4"' : ""}/>
  <rect x="${cx + (wcm * CM) / 2 - 58}" y="${ground - hcm * CM + 8}" width="50" height="30" rx="8" fill="#ffffff" opacity="0.9"/>
  <text x="${cx + (wcm * CM) / 2 - 33}" y="${ground - hcm * CM + 30}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${onTop ? "#64809c" : "#94a3b8"}">${label}</text>`;

const refCard = (cx, ground) => {
  const w = 8.6 * CM;
  const h = 5.4 * CM;
  const x = cx - w / 2;
  const y = ground - h;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#eef2f7" stroke="#b6c2d2" stroke-width="3"/>
    <rect x="${x + 16}" y="${y + 22}" width="32" height="25" rx="6" fill="#d3a84c" stroke="#b98f35" stroke-width="2"/>
    <line x1="${x + 16}" y1="${y + h - 24}" x2="${x + w - 42}" y2="${y + h - 24}" stroke="#b6c2d2" stroke-width="6" stroke-linecap="round"/>
    <line x1="${x + 16}" y1="${y + h - 11}" x2="${x + w - 76}" y2="${y + h - 11}" stroke="#cdd7e2" stroke-width="6" stroke-linecap="round"/>
    <text x="${cx}" y="${ground + 28}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">บัตร ATM 8.6 × 5.4 ซม.</text>`;
};

/** ป้ายขนาดตัวใหญ่กลางแผ่น — ตัวที่ทำให้ภาพย่อ 62px อ่านออกว่าใบไหน */
const sizeBadge = (cx, cy, sel) => {
  const w = 148;
  const h = 96;
  return `
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="18" fill="#ffffff" opacity="0.94" stroke="${OK}" stroke-width="3"/>
    <text x="${cx}" y="${cy + 8}" font-family="${TH}" font-size="58" font-weight="700" text-anchor="middle" fill="${INK}">${sel.choice.replace("ขนาด ", "")}</text>
    <text x="${cx}" y="${cy + 36}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${sel.wcm} × ${sel.hcm} ซม.</text>`;
};

function sizeArt(sel) {
  const w = sel.wcm * CM;
  const h = sel.hcm * CM;
  const left = BOARD_CX - w / 2;
  const clipW = Math.min(CLIP_CM * CM, w - 0.8 * CM);
  const others = SIZES.filter((s) => s.choice !== sel.choice);
  const bigger = (s) => s.wcm * s.hcm > sel.wcm * sel.hcm;
  const short = (s) => s.choice.replace("ขนาด ", "");
  const ghostsBehind = others.filter(bigger).map((s) => ghost(BOARD_CX, GROUND, s.wcm, s.hcm, short(s))).join("");
  const ghostsFront = others.filter((s) => !bigger(s)).map((s) => ghost(BOARD_CX, GROUND, s.wcm, s.hcm, short(s), true)).join("");
  return frame(`
    ${title(`${sel.choice} (${sel.wcm} × ${sel.hcm} ซม.)`, "ทุกภาพย่อด้วยสเกลเดียวกัน — เส้นประคือขนาดอีก 2 ขนาด")}
    ${pill(W / 2, 140, `เหมาะกับ ${sel.use}`)}
    ${ghostsBehind}
    ${clipboard(BOARD_CX, GROUND, w, h, clipW, `sb-${sel.file}`)}
    ${ghostsFront}
    ${sizeBadge(BOARD_CX, GROUND - h * 0.72, sel)}
    ${dim(left, GROUND + 26, left + w, GROUND + 26, `${sel.wcm} ซม.`)}
    ${dim(left - 30, GROUND - h, left - 30, GROUND, `${sel.hcm} ซม.`)}
    ${refCard(CARD_CX, GROUND)}
    ${foot(["ตัวหนีบโลหะกว้าง 10 ซม. มีอะไหล่เปลี่ยนได้ · ขนาดอ้างอิงกระดาษมาตรฐาน", `หนีบกระดาษ ${sel.choice.replace("ขนาด ", "")} ได้พอดี · พิมพ์ลายตามสั่งระบบ UV`])}`);
}

// ═════════════════ 2) การ์ดไดคัท — สี่เหลี่ยม / ตามทรง ═════════════════
/** แผ่นทั้งใบต้องอยู่ในกรอบครอปกลาง 300–600 → กว้าง ~250 สูง ~330 วางกลางภาพพอดี
 *  (ย่อ 62px แล้วยังเห็นว่าขอบตรงหรือขอบหยัก) */
const DC = { cx: 450, ground: 590, w: 210, h: 280 };

/** แผ่นอะคริลิคก่อนตัด — กรอบเทาจาง ไว้เทียบว่าแนวตัด (เส้นประฟ้า) วิ่งตรงไหน */
const rawSheet = (cx, ground, w, h, pad = 26) => `
  <rect x="${cx - w / 2 - pad}" y="${ground - h - pad}" width="${w + pad * 2}" height="${h + pad * 2}" rx="10" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6 6"/>
  <text x="${cx - w / 2 - pad + 8}" y="${ground - h - pad - 12}" font-family="${TH}" font-size="20" fill="#94a3b8">แผ่นอะคริลิคก่อนตัด</text>`;

function diecutRectArt() {
  const { cx, ground, w, h } = DC;
  const x = cx - w / 2;
  const top = ground - h;
  const r = Math.min(14, w * 0.06);
  return frame(`
    ${title("ไดคัท สี่เหลี่ยม", "ตัดขอบตรง มุมโค้งมน — ทรงมาตรฐานของคลิปบอร์ด")}
    ${rawSheet(cx, ground, w, h)}
    ${clipboard(cx, ground, w, h, w * 0.62, "dc-rect")}
    <rect x="${x}" y="${top}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${OK}" stroke-width="3.5" stroke-dasharray="11 8"/>
    ${pill(cx, ground + 48, "แนวตัดขอบตรงทั้ง 4 ด้าน")}
    ${foot(["ลายพิมพ์เต็มแผ่นได้ตามไฟล์งาน · มุมลบคมปลอดภัย"])}`);
}

/** แผ่นขอบหยักตามลาย — สี่เหลี่ยมมุมโค้ง + ส่วนโค้งนูน 3 จุด (ขวา/ล่าง/ซ้าย) */
function bumpPath(x1, y1, x2, y2, r) {
  const rb = { y: y1 + (y2 - y1) * 0.38, r: 36 };
  const bb = { x: x1 + (x2 - x1) * 0.55, r: 38 };
  const lb = { y: y1 + (y2 - y1) * 0.66, r: 32 };
  return [
    `M ${x1 + r} ${y1}`,
    `L ${x2 - r} ${y1}`, `Q ${x2} ${y1} ${x2} ${y1 + r}`,
    `L ${x2} ${rb.y - rb.r}`, `A ${rb.r} ${rb.r} 0 0 1 ${x2} ${rb.y + rb.r}`,
    `L ${x2} ${y2 - r}`, `Q ${x2} ${y2} ${x2 - r} ${y2}`,
    `L ${bb.x + bb.r} ${y2}`, `A ${bb.r} ${bb.r} 0 0 1 ${bb.x - bb.r} ${y2}`,
    `L ${x1 + r} ${y2}`, `Q ${x1} ${y2} ${x1} ${y2 - r}`,
    `L ${x1} ${lb.y + lb.r}`, `A ${lb.r} ${lb.r} 0 0 1 ${x1} ${lb.y - lb.r}`,
    `L ${x1} ${y1 + r}`, `Q ${x1} ${y1} ${x1 + r} ${y1}`,
    "Z",
  ].join(" ");
}

function diecutShapeArt() {
  const { cx, ground, w, h } = DC;
  const x1 = cx - w / 2;
  const top = ground - h;
  const d = bumpPath(x1, top, x1 + w, ground, 18);
  return frame(`
    ${title("ไดคัท ตามทรง", "ตัดขอบตามเส้นลายของคุณ — โค้งเว้าได้อิสระ")}
    ${rawSheet(cx, ground, w, h, 44)}
    <path d="${d}" fill="${ACRYL}" stroke="${ACRYL_EDGE}" stroke-width="3"/>
    <clipPath id="dc-shape"><path d="${d}"/></clipPath>
    <g clip-path="url(#dc-shape)">
      ${boardPattern(x1, top, w, h)}
      ${artwork(HEART, cx, top + h * 0.58, w * 0.6, h * 0.5)}
    </g>
    ${clip(cx, top, w * 0.62)}
    <path d="${d}" fill="none" stroke="${OK}" stroke-width="3.5" stroke-dasharray="11 8"/>
    ${pill(cx, ground + 66, "แนวตัดวิ่งตามขอบลาย")}
    ${foot(["แนบไฟล์ลายแล้วทีมงานเดินเส้นไดคัทให้ตามทรง"])}`);
}

// ═════════════════ 3) การ์ดสกรีน 1/2 ด้าน (กลุ่มของ A5 · A4) ═════════════════
const SC = { w: 190, h: 266, ground: 640, front: 235, back: 665 };

/** ป้ายกลางภาพ "1 / 2 ด้าน" — จุดที่ทำให้ภาพย่อ 62px แยกออกว่าเลือกอะไร */
const screenBadge = (cx, cy, two) => `
  <circle cx="${cx}" cy="${cy}" r="76" fill="#ffffff" stroke="${OK}" stroke-width="4"/>
  <text x="${cx}" y="${cy + 6}" font-family="${TH}" font-size="72" font-weight="700" text-anchor="middle" fill="${INK}">${two ? "2" : "1"}</text>
  <text x="${cx}" y="${cy + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${OK}">ด้าน</text>`;

const tag = (cx, y, text, on = true) => pill(cx, y, text, on);

function screenArt(two) {
  const { w, h, ground, front, back } = SC;
  return frame(`
    ${title(two ? "สกรีน 2 ด้าน" : "สกรีน 1 ด้าน", two ? "พิมพ์ลายทั้งสองหน้า — หน้า-หลังคนละลายได้" : "พิมพ์ลายหน้าเดียว ด้านหลังเป็นอะคริลิคเรียบ")}
    ${clipboard(front, ground, w, h, w * 0.66, "scr-f" + (two ? 2 : 1), HEART)}
    ${clipboard(back, ground, w, h, w * 0.66, "scr-b" + (two ? 2 : 1), PEACE, { blank: !two })}
    ${screenBadge((front + back) / 2, ground - h / 2, two)}
    ${tag(front, ground + 40, "ด้านหน้า — มีลาย")}
    ${tag(back, ground + 40, two ? "ด้านหลัง — ลายที่สอง" : "ด้านหลัง — ไม่พิมพ์", two)}
    ${foot(two ? ["ส่งไฟล์ลาย 2 ไฟล์ (หน้า/หลัง) หรือใช้ลายเดียวกันทั้งสองด้านก็ได้"] : ["อยากได้ลายทั้งสองหน้า เลือก “สกรีน 2 ด้าน” ได้เลย"])}`);
}

// ═════════════════ 4) ฝั่งลายสกรีนเวลาถือ — มุมมองด้านข้าง ═════════════════
const HP = { boardX: 450, ground: 640, top: 250, holder: 150, viewer: 750 };

/** คนแบบแบน มุมมองด้านข้าง หันเข้าหาบอร์ดเสมอ */
const person = (cx, ground, facing, color, label, sees) => {
  const headR = 40;
  const headY = 330;
  return `
    <circle cx="${cx}" cy="${headY}" r="${headR}" fill="${color}"/>
    <circle cx="${cx + facing * headR * 0.55}" cy="${headY - 8}" r="5" fill="#ffffff"/>
    <path d="M ${cx - 46} ${ground} L ${cx - 46} ${headY + headR + 96} Q ${cx} ${headY + headR + 6} ${cx + 46} ${headY + headR + 96} L ${cx + 46} ${ground} Z" fill="${color}"/>
    <line x1="${cx + facing * 30}" y1="${headY + headR + 60}" x2="${cx + facing * 92}" y2="${headY + headR + 110}" stroke="${color}" stroke-width="26" stroke-linecap="round"/>
    <text x="${cx}" y="${ground + 42}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>
    ${pill(cx, 200, sees ? "เห็นลาย ✓" : "ไม่เห็นลาย", sees)}`;
};

/** แผ่นคลิปบอร์ดมุมมองด้านข้าง (สันบาง) + ตัวหนีบ */
const boardSide = (x, top, ground) => `
  <rect x="${x - 8}" y="${top}" width="16" height="${ground - top}" rx="8" fill="${ACRYL}" stroke="${ACRYL_EDGE}" stroke-width="3"/>
  <rect x="${x - 15}" y="${top - 14}" width="30" height="46" rx="10" fill="${METAL}"/>
  <rect x="${x - 10}" y="${top - 10}" width="20" height="16" rx="7" fill="${METAL_HI}"/>`;

/** แถบลายบนหน้าแผ่นฝั่งซ้าย/ขวา + ป้ายลายชี้เข้าหาแถบ (ข้อความอยู่ในกรอบ กันชนแขนคน) */
const artSide = (boardX, side, mascot) => {
  const stripX = boardX + side * 11;
  const panelCx = boardX + side * 138;
  const panelCy = 392;
  return `
    <line x1="${stripX + side * 3}" y1="${HP.top + 36}" x2="${stripX + side * 3}" y2="${HP.ground - 10}" stroke="${OK}" stroke-width="14" stroke-linecap="round"/>
    <rect x="${panelCx - 74}" y="${panelCy - 88}" width="148" height="176" rx="18" fill="#ffffff" stroke="${OK}" stroke-width="3"/>
    <g>${artwork(mascot, panelCx, panelCy - 16, 108, 108)}</g>
    <text x="${panelCx}" y="${panelCy + 70}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${OK}">ฝั่งที่มีลาย</text>
    <path d="M ${panelCx + side * 78} ${panelCy} L ${stripX - side * 16} ${panelCy}" fill="none" stroke="${OK}" stroke-width="3" stroke-dasharray="7 6"/>
    <path d="M ${stripX - side * 16} ${panelCy} l ${-side * 14} -9 m ${side * 14} 9 l ${-side * 14} 9" fill="none" stroke="${OK}" stroke-width="3" stroke-linecap="round"/>`;
};

function holdArt(mode) {
  // mode: "in" (หันเข้าหาตัว) · "out" (หันออกจากตัว) · "both"
  const holderSees = mode !== "out";
  const viewerSees = mode !== "in";
  const sub = {
    in: "คนถือเห็นลายเวลาใช้งาน — เหมาะใช้เอง จดงานเอง",
    out: "คนตรงหน้าเห็นลาย — เหมาะทำป้าย เมนู โชว์ลูกค้า",
    both: "สกรีน 2 ด้าน — เห็นลายทั้งสองฝั่ง",
  }[mode];
  return frame(`
    ${title({ in: "ลายหันเข้าหาตัว", out: "ลายหันออกจากตัว", both: "มีลายสองด้าน" }[mode], sub)}
    <line x1="120" y1="${HP.ground}" x2="${W - 120}" y2="${HP.ground}" stroke="#e2e8f0" stroke-width="3"/>
    ${person(HP.holder, HP.ground, 1, "#0e7490", "คนถือ", holderSees)}
    ${person(HP.viewer, HP.ground, -1, "#94a3b8", "คนตรงหน้า", viewerSees)}
    ${boardSide(HP.boardX, HP.top, HP.ground)}
    ${mode !== "out" ? artSide(HP.boardX, -1, HEART, "as-in") : ""}
    ${mode !== "in" ? artSide(HP.boardX, 1, mode === "both" ? PEACE : HEART, "as-out") : ""}
    ${foot(["ภาพมุมมองด้านข้าง — แจ้งฝั่งลายไว้ ทีมงานจะวางไฟล์ให้ถูกด้านตอนผลิต"])}`);
}

// ── รายการภาพทั้งหมด + จุดที่เอาไปเสียบ ─────────────────────────────
/** หา option group แบบกันชื่อซ้ำ — เทียบ label + showWhen (ถ้าระบุ) */
const findGroup = (options, label, whenChoice) =>
  (options ?? []).find(
    (o) =>
      o.label === label &&
      (whenChoice === undefined
        ? !o.showWhen
        : o.showWhen?.label === "ขนาด" && (o.showWhen?.choices || []).includes(whenChoice))
  );

const JOBS = [
  ...SIZES.map((s) => ({
    file: `${s.file}-${VER}.jpg`,
    svg: () => sizeArt(s),
    set: [{ group: "ขนาด", choice: s.choice, desc: `${s.wcm} × ${s.hcm} ซม.` }],
  })),
  {
    file: `diecut-rect-${VER}.jpg`,
    svg: diecutRectArt,
    set: [{ group: "ไดคัท", choice: "สี่เหลี่ยม", desc: "ตัดขอบตรง มุมโค้งมน — ทรงมาตรฐาน" }],
  },
  {
    file: `diecut-shape-${VER}.jpg`,
    svg: diecutShapeArt,
    set: [{ group: "ไดคัท", choice: "ตามทรง", desc: "ตัดขอบตามเส้นลายของคุณ" }],
  },
  {
    file: `screen-1side-${VER}.jpg`,
    svg: () => screenArt(false),
    set: [
      { group: "สกรีน", when: "ขนาด A5", choice: "1 ด้าน" },
      { group: "สกรีน", when: "ขนาด A4", choice: "1 ด้าน" },
    ],
  },
  {
    file: `screen-2side-${VER}.jpg`,
    svg: () => screenArt(true),
    set: [
      { group: "สกรีน", when: "ขนาด A5", choice: "2 ด้าน" },
      { group: "สกรีน", when: "ขนาด A4", choice: "2 ด้าน" },
    ],
  },
  {
    file: `hold-in-${VER}.jpg`,
    svg: () => holdArt("in"),
    set: [{ group: "ฝั่งลายสกรีนเวลาถือ", choice: "หันเข้าหาตัว", desc: "คนถือเห็นลายเวลาใช้งาน" }],
  },
  {
    file: `hold-out-${VER}.jpg`,
    svg: () => holdArt("out"),
    set: [{ group: "ฝั่งลายสกรีนเวลาถือ", choice: "หันออกจากตัว", desc: "คนตรงหน้าเห็นลาย เหมาะโชว์ลูกค้า" }],
  },
  {
    file: `hold-both-${VER}.jpg`,
    svg: () => holdArt("both"),
    set: [{ group: "ฝั่งลายสกรีนเวลาถือ", choice: "มีลายสองด้าน", desc: "ใช้คู่กับสกรีน 2 ด้าน เห็นลายทั้งสองฝั่ง" }],
  },
];

// ── วาด + เซฟไฟล์ ────────────────────────────────────────────────────
for (const j of JOBS) {
  const buf = await sharp(Buffer.from(j.svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, buf);
  j.local = `${OUT}/${j.file}`;
  console.log(`🖼  ${j.file}  ${Math.round(buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log(`\n(ยังไม่เขียน DB — เปิดดูที่ ${OUT} แล้วรันด้วย --write เมื่อภาพผ่านตา)`); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ ───────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PUB = (key) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(j.local), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  j.url = PUB(key);
  console.log("อัปโหลดแล้ว", j.url);
}

// อะคริลิคใส — ก๊อปภาพจริงจาก griptok-acrylic มาเป็นไฟล์ของสินค้านี้
const CLEAR_FILE = `acrylic-clear-${VER}.jpg`;
const { data: clearBlob, error: dlErr } = await sb.storage.from("product-images").download("products/griptok-acrylic/acrylic-1.jpg");
if (dlErr) { console.error("โหลด acrylic-1.jpg ไม่ได้", dlErr); process.exit(1); }
const clearKey = `products/${PRODUCT_ID}/${CLEAR_FILE}`;
{
  const { error } = await sb.storage.from("product-images").upload(clearKey, Buffer.from(await clearBlob.arrayBuffer()), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", clearKey, error); process.exit(1); }
}
const CLEAR_URL = PUB(clearKey);
console.log("อัปโหลดแล้ว", CLEAR_URL);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

const want = []; // ไว้อ่านกลับเทียบ
const apply = (group, when, choiceName, url, desc) => {
  const g = findGroup(data.options, group, when);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${group}"${when ? ` (showWhen ${when})` : ""}`); process.exit(1); }
  const c = (g.choices || []).find((c) => c.name === choiceName);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${choiceName}" ในกลุ่ม "${group}"`); process.exit(1); }
  c.imageSrc = url;
  if (desc && !c.desc) c.desc = desc;
  want.push({ group, when, choiceName, url });
};
for (const j of JOBS) for (const t of j.set) apply(t.group, t.when, t.choice, j.url, t.desc);
apply("สีอะคริลิค", undefined, "อะคริลิคใส", CLEAR_URL);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const wnt of want) {
  const got = findGroup(back.data.options, wnt.group, wnt.when)?.choices?.find((c) => c.name === wnt.choiceName)?.imageSrc;
  if (got !== wnt.url) { console.error("อ่านกลับไม่ตรง!", wnt.group, wnt.choiceName, got); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc ครบ ${want.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
