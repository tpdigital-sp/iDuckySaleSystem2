#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่มตัวเลือกของ "กรอบรูป+จิ๊กซอว์ งาน UV" (id: uv)
 *
 *   node scripts/jigsaw-frame-uv-option-art.mjs            (วาดภาพลง .cache/uv/upload ดูก่อน)
 *   node scripts/jigsaw-frame-uv-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง imageSrc/desc + อ่านกลับเทียบ)
 *
 * เดิมทั้ง 2 กลุ่มไม่มีภาพเลย (ตัวเลือก / ขนาด — สองแกนของตารางราคา ห้ามแตะชื่อ):
 *   1. "ตัวเลือก" — แผ่นจิ๊กซอว์ (ไม่มีกรอบ) vs กรอบรูป + แผ่นจิ๊กซอว์ (กรอบไม้ + ขาตั้ง)
 *   2. "ขนาด" 4 ใบ — แผ่นต่อเสร็จพร้อมจำนวนชิ้นจริง + แถบเทียบขนาดจริงทั้ง 4 ทรงล่างการ์ด
 *
 * ตัวเลขจำนวนชิ้น/วิธีตั้ง-แขวน อ้างใบสเปคของร้าน (ไดรฟ์ 60_ตกแต่งและงานแสดง/กรอบรูปจิ๊กซอร์-กรอบอะคริลิค/
 * P-nจิ๊กซอว์-01.jpg): 15×20=70 ชิ้น ตั้งได้ · 29.7×21=128 ชิ้น ตั้งได้ · 38×26=300 ชิ้น แขวนอย่างเดียว ·
 * 52×38=500 ชิ้น แขวนอย่างเดียว · กรอบไม้สีอ่อนตามรูปงานจริงในแกลเลอรีสินค้า
 *
 * ⚠️ ปุ่ม/การ์ดตัวเลือกครอปกลางภาพ (900×900 → เห็นแค่ 300–600) — จุดต่างต้องอยู่กลาง
 *    "ตัวเลือก": ย่อแผ่นให้ขอบกรอบไม้ตกอยู่ในกรอบกลาง · "ขนาด": ความถี่รอยต่อจิ๊กซอว์ + ป้ายเลขกลางแผ่น
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const DUCK = await mascotDataUri("heart", 460);

const PRODUCT_ID = "uv";
const VER = "v2";
/** กลุ่ม "ตัวเลือก" ขยายชิ้นงาน 2 รอบ (v2 → v3, 4 ก.ย. 69) → ต้องขึ้นชื่อไฟล์ใหม่ ไม่งั้นแคชค้างของเก่า 30 วัน */
const OPT_VER = "v3";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/uv/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const WOOD = "#e9d3ac";
const WOOD_DARK = "#c9a870";
const WOOD_LIGHT = "#f7ecd8";

/** ขนาดจริง 4 แบบ — จำนวนชิ้น + ตารางตัด (คูณกันได้เท่าจำนวนชิ้นเป๊ะ) จากใบสเปคร้าน */
const SIZES = [
  { choice: "ขนาด 15*20cm", file: "size-15x20", w: 15, h: 20, pieces: 70, cols: 7, rows: 10, stand: true, note: "แนวตั้ง" },
  { choice: "ขนาด 29.7*21cm", file: "size-a4", w: 29.7, h: 21, pieces: 128, cols: 16, rows: 8, stand: true, note: "เท่ากระดาษ A4" },
  { choice: "ขนาด 38*26cm", file: "size-38x26", w: 38, h: 26, pieces: 300, cols: 20, rows: 15, stand: false, note: "แนวนอน" },
  { choice: "ขนาด 52*38cm", file: "size-52x38", w: 52, h: 38, pieces: 500, cols: 25, rows: 20, stand: false, note: "ใบใหญ่สุด" },
];

// ── โครงการ์ดร่วม (ทรงเดียวกับภาพตัวเลือกตัวอื่นทั้งร้าน) ─────────────
const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${WOOD_LIGHT}"/>
      <stop offset="0.5" stop-color="${WOOD}"/>
      <stop offset="1" stop-color="${WOOD_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean).map((t, i, a) =>
    `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
  ).join("");

const pill = (cx, y, text, on = true) => {
  const w = text.length * 13 + 54;
  return `
    <rect x="${cx - w / 2}" y="${y}" width="${w}" height="44" rx="22" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 30}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

// ── ชิ้นส่วนจิ๊กซอว์ ──────────────────────────────────────────────────
/**
 * ขอบจิ๊กซอว์ 1 ด้าน จาก (x0,y0) ไป (x1,y1) — t = 0 ตรง, +1/-1 ปุ่มโป่งออกฝั่งซ้าย/ขวาของทิศเดิน
 * ใช้ได้ทั้งรอยต่อบนแผ่น (เส้นเปิด) และขอบชิ้นที่หลุดออกมา (เส้นปิด)
 */
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

/** ปุ่มโป่งเข้า/ออกสลับกันแบบเดิมทุกครั้ง (ไม่ใช้สุ่ม — รันซ้ำแล้วภาพต้องเหมือนเดิม) */
const knob = (i, j, axis) => (((i * 7 + j * 13 + axis * 5) % 3) % 2 === 0 ? 1 : -1);

/** รอยต่อจิ๊กซอว์ทั้งแผ่น cols × rows (ขอบนอกตรง เหมือนจิ๊กซอว์จริง) */
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

/** ชิ้นจิ๊กซอว์เดี่ยว ๆ ที่หลุดออกมา — ปุ่มออก 2 ด้าน เว้า 2 ด้าน */
const loosePiece = (cx, cy, s, rot, fill) => {
  const x0 = cx - s / 2;
  const y0 = cy - s / 2;
  const d = `M ${x0} ${y0} ${edge(x0, y0, x0 + s, y0, 1)} ${edge(x0 + s, y0, x0 + s, y0 + s, -1)} ${edge(x0 + s, y0 + s, x0, y0 + s, 1)} ${edge(x0, y0 + s, x0, y0, -1)} Z`;
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <path d="${d}" fill="#0f172a" opacity="0.13" transform="translate(2.5,4)"/>
    <path d="${d}" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
  </g>`;
};

// ── ลายที่พิมพ์บนแผ่น (ลายเดียวกันทุกใบ ต่างกันแค่ขนาด/จำนวนชิ้น) ─────
function scene(id, x, y, w, h) {
  const r = DUCK.ratio;
  let dh = h * 0.52;
  let dw = dh * r;
  if (dw > w * 0.5) { dw = w * 0.5; dh = dw / r; }
  const P = (fx, fy) => `${(x + w * fx).toFixed(1)} ${(y + h * fy).toFixed(1)}`;
  return `
  <defs>
    <linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffb877"/>
      <stop offset="0.45" stop-color="#ffe0c2"/>
      <stop offset="1" stop-color="#8fd3f4"/>
    </linearGradient>
    <clipPath id="clip${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
  </defs>
  <g clip-path="url(#clip${id})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sky${id})"/>
    <circle cx="${x + w * 0.2}" cy="${y + h * 0.22}" r="${h * 0.11}" fill="#ffb703" opacity="0.95"/>
    ${[[0.66, 0.16, 0.055, "#ff6b8b"], [0.8, 0.28, 0.04, "#3fa9e0"], [0.88, 0.13, 0.03, "#ffd166"]]
      .map(([fx, fy, fr, c]) => `<circle cx="${x + w * fx}" cy="${y + h * fy}" r="${h * fr}" fill="${c}" opacity="0.85"/>`).join("")}
    <path d="M ${P(-0.05, 0.78)} Q ${P(0.24, 0.5)} ${P(0.52, 0.76)} T ${P(1.05, 0.72)} L ${P(1.05, 1.05)} L ${P(-0.05, 1.05)} Z" fill="#5ccfbe"/>
    <path d="M ${P(-0.05, 0.9)} Q ${P(0.35, 0.68)} ${P(0.72, 0.9)} T ${P(1.05, 0.86)} L ${P(1.05, 1.05)} L ${P(-0.05, 1.05)} Z" fill="#12897c"/>
    <image href="${DUCK.uri}" x="${x + w / 2 - dw / 2}" y="${y + h * 0.94 - dh}" width="${dw}" height="${dh}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}

/** แผ่นจิ๊กซอว์ต่อเสร็จ = ลายพิมพ์ + รอยต่อ + ขอบแผ่น */
const sheet = (id, x, y, w, h, cols, rows) => `
  ${scene(id, x, y, w, h)}
  ${seams(x, y, w, h, cols, rows)}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#cbd5e1" stroke-width="2"/>`;

/** กรอบไม้สีอ่อน (ตามงานจริง) ล้อมแผ่น — b = ความหนาขอบ (เกรเดียนต์ไม้ประกาศไว้ในโครงการ์ดแล้ว) */
const woodFrame = (x, y, w, h, b) => `
  <rect x="${x - b + 6}" y="${y - b + 10}" width="${w + b * 2}" height="${h + b * 2}" rx="8" fill="#0f172a" opacity="0.12"/>
  <rect x="${x - b}" y="${y - b}" width="${w + b * 2}" height="${h + b * 2}" rx="8" fill="url(#wood)" stroke="${WOOD_DARK}" stroke-width="2"/>
  <g stroke="${WOOD_DARK}" stroke-width="1.6" opacity="0.55">
    <line x1="${x - b}" y1="${y - b}" x2="${x}" y2="${y}"/>
    <line x1="${x + w + b}" y1="${y - b}" x2="${x + w}" y2="${y}"/>
    <line x1="${x - b}" y1="${y + h + b}" x2="${x}" y2="${y + h}"/>
    <line x1="${x + w + b}" y1="${y + h + b}" x2="${x + w}" y2="${y + h}"/>
  </g>
  <rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" fill="none" stroke="#b99659" stroke-width="2" opacity="0.7"/>`;

/** แสงสะท้อนกระจกหน้ากรอบ */
const glass = (x, y, w, h, id = "gl") => `
  <clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
  <g clip-path="url(#${id})">
    <polygon points="${x},${y + h * 0.75} ${x + w * 0.42},${y} ${x + w * 0.66},${y} ${x + w * 0.14},${y + h}" fill="#ffffff" opacity="0.16"/>
  </g>`;

/**
 * ขาตั้งหลังกรอบ (กรอบตั้งโต๊ะ) — วาดก่อนตัวกรอบ ให้โผล่พ้นขอบขวา-ล่างออกมาเหมือนงานจริง
 * (x,y,w,h,b = พิกัดแผ่นกับความหนาขอบไม้ชุดเดียวกับ woodFrame)
 */
const easel = (x, y, w, h, b) => {
  const rx = x + w + b;
  const by = y + h + b;
  return `
  <path d="M ${rx - 26} ${y + h * 0.55} L ${rx + 44} ${by + 10} L ${rx + 8} ${by + 10} Z" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="2" opacity="0.95"/>
  <line x1="${rx + 12}" y1="${by + 10}" x2="${rx + 46}" y2="${by + 10}" stroke="${WOOD_DARK}" stroke-width="3" stroke-linecap="round"/>`;
};

/** แถบเทียบ "ได้อะไรบ้าง" 2 แบบใต้การ์ด (ตัวที่เลือกอยู่ขอบฟ้า) — ทรงเดียวกับแถบเทียบขนาด */
function optionStrip(framedOn) {
  const cardW = 262;
  const cardH = 138;
  const top = 672;
  const box = (bx, on, label, inner) => `
    <rect x="${bx}" y="${top}" width="${cardW}" height="${cardH}" rx="16"
      fill="${on ? "#ecfeff" : "#f8fafc"}" stroke="${on ? OK : "#e2e8f0"}" stroke-width="${on ? 3 : 2}"/>
    ${inner}
    <text x="${bx + cardW / 2}" y="${top + cardH - 13}" font-family="${TH}" font-size="20" font-weight="${on ? 700 : 400}"
      text-anchor="middle" fill="${on ? OK : SUB}">${label}</text>`;
  const lx = W / 2 - cardW - 15;
  const rx = W / 2 + 15;
  const mw = 132;
  const mh = 80;
  const my = top + 15;
  return `
    ${box(lx, !framedOn, "แผ่นอย่างเดียว", sheet("mini1", lx + cardW / 2 - mw / 2, my, mw, mh, 8, 6))}
    ${box(rx, framedOn, "กรอบ + แผ่น",
      woodFrame(rx + cardW / 2 - (mw - 30) / 2, my + 8, mw - 30, mh - 22, 15) +
      sheet("mini2", rx + cardW / 2 - (mw - 30) / 2, my + 8, mw - 30, mh - 22, 8, 6))}`;
}

// ── กลุ่ม "ตัวเลือก" — มีกรอบ / ไม่มีกรอบ ────────────────────────────
/**
 * แผ่นเท่ากันทั้งสองใบ ต่างกันแค่ "มีขอบไม้ล้อมหรือไม่"
 * v3 (4 ก.ย. 69) ขยายเต็มที่: ภาพตัวเลือกเป็นจัตุรัส 900×900 ลงกล่องจัตุรัสบนหน้าเว็บ →
 * object-cover **ไม่ครอปอะไรเลย เห็นเต็มใบ** (กติกาครอปกลางใช้กับภาพถ่าย 4:3 เท่านั้น)
 * ชิ้นงานจึงกินพื้นที่ให้มากที่สุด ตัวหนังสือเหลือเท่าที่จำเป็น — แถบเทียบ 2 แบบตัดออก
 * (การ์ดสองใบมันเทียบกันอยู่แล้วในหน้าเว็บ)
 */
const BW = 470;
const BH = 336;
const BB = 38;
const BX = W / 2 - BW / 2;
const BY = 430 - BH / 2;

const plateArt = () =>
  frame(`
  ${title("แผ่นจิ๊กซอว์", "ได้เฉพาะแผ่นต่อ — ไม่มีกรอบรูป")}
  <!-- เส้นประ = ตำแหน่งกรอบที่ "ไม่ได้มาด้วย" กับตัวเลือกนี้ -->
  <g stroke="#cbd5e1" stroke-width="3" stroke-dasharray="11 9" fill="none">
    <rect x="${BX - BB}" y="${BY - BB}" width="${BW + BB * 2}" height="${BH + BB * 2}" rx="12"/>
  </g>
  <text x="${W / 2}" y="${BY - BB - 18}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">เส้นประ = ไม่มีกรอบไม้มาให้</text>
  ${sheet("p1", BX, BY, BW, BH, 12, 9)}
  ${loosePiece(BX + BW + 56, BY + BH - 26, 58, -12, "#5ccfbe")}
  ${loosePiece(BX - 60, BY + 44, 54, 14, "#ffb703")}
  ${loosePiece(BX + BW + 46, BY + 14, 50, 26, "#ff6b8b")}
  ${pill(W / 2, 668, "แผ่นจิ๊กซอว์ + ซองใส่ ไม่มีกรอบ")}
  ${foot(["พิมพ์ลายระบบ UV ตามไฟล์ของคุณ ตัดเป็นชิ้นต่อเล่นได้จริง", "อยากได้กรอบไม้ด้วย → เลือก “กรอบรูป + แผ่นจิ๊กซอว์”"])}`);

const framedArt = () =>
  frame(`
  ${title("กรอบรูป + แผ่นจิ๊กซอว์", "ได้กรอบไม้สีอ่อน ใส่แผ่นมาให้พร้อมโชว์")}
  ${easel(BX, BY, BW, BH, BB)}
  ${woodFrame(BX, BY, BW, BH, BB)}
  ${sheet("p2", BX, BY, BW, BH, 12, 9)}
  ${glass(BX, BY, BW, BH)}
  ${pill(W / 2, 668, "กรอบไม้ + แผ่นจิ๊กซอว์ ครบชุด")}
  ${foot(["กรอบไม้สีอ่อน + กระจกหน้า + ขาตั้งหลังกรอบ", "15×20 กับ 29.7×21 ตั้งโต๊ะได้ · 38×26 กับ 52×38 แขวนผนังอย่างเดียว"])}`);

// ── กลุ่ม "ขนาด" — 4 ใบ ──────────────────────────────────────────────
/** แถบเทียบขนาดจริงทั้ง 4 ทรง เรียงฐานเดียวกัน (ตัวที่เลือกอยู่ทึบสีฟ้า) */
function scaleStrip(current) {
  const PX = 2.7;
  const gap = 30;
  const baseY = 798;
  const total = SIZES.reduce((s, z) => s + z.w * PX, 0) + gap * (SIZES.length - 1);
  let x = W / 2 - total / 2;
  const out = [];
  for (const z of SIZES) {
    const w = z.w * PX;
    const h = z.h * PX;
    const on = z.choice === current.choice;
    out.push(`
      <rect x="${x.toFixed(1)}" y="${(baseY - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3"
        fill="${on ? "#cffafe" : "#f8fafc"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="${on ? 3 : 2}" ${on ? "" : 'stroke-dasharray="7 6"'}/>
      <text x="${(x + w / 2).toFixed(1)}" y="${baseY + 25}" font-family="${TH}" font-size="19" font-weight="${on ? 700 : 400}"
        text-anchor="middle" fill="${on ? OK : SUB}">${z.w}×${z.h}</text>`);
    x += w + gap;
  }
  return out.join("");
}

function sizeArt(z) {
  const MAXW = 548;
  const MAXH = 404;
  let w = MAXW;
  let h = (w * z.h) / z.w;
  if (h > MAXH) { h = MAXH; w = (h * z.w) / z.h; }
  const CY = 380;
  const x = W / 2 - w / 2;
  const y = CY - h / 2;
  const lw = 318;
  return frame(`
  ${title(`ขนาด ${z.w} × ${z.h} ซม.`, `จิ๊กซอว์ ${z.pieces} ชิ้น · ${z.note}`)}
  ${woodFrame(x, y, w, h, 22)}
  ${sheet(z.file, x, y, w, h, z.cols, z.rows)}
  ${glass(x, y, w, h)}

  <!-- ป้ายเลขกลางแผ่น — ปุ่ม/การ์ดครอปเห็นแค่ตรงกลาง ต้องอ่านออกตรงนี้ -->
  <rect x="${W / 2 - lw / 2}" y="${CY - 60}" width="${lw}" height="122" rx="20" fill="#ffffff" opacity="0.94" stroke="${OK}" stroke-width="3.5"/>
  <text x="${W / 2}" y="${CY - 8}" font-family="${TH}" font-size="60" font-weight="700" text-anchor="middle" fill="${INK}">${z.w}×${z.h}</text>
  <text x="${W / 2}" y="${CY + 42}" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${OK}">${z.pieces} ชิ้น</text>

  ${pill(W / 2, 636, z.stand ? "แบบมีกรอบ: ตั้งโต๊ะได้" : "แบบมีกรอบ: แขวนผนังอย่างเดียว")}
  ${scaleStrip(z)}
  ${foot([`รอยตัด ${z.cols} × ${z.rows} ชิ้น · สี่เหลี่ยมด้านบนคือขนาดจริงทั้ง 4 แบบ สเกลเดียวกัน`])}`);
}

// ── รายการภาพ + จุดที่เอาไปเสียบ ─────────────────────────────────────
const JOBS = [
  {
    file: `option-plate-${OPT_VER}.jpg`,
    svg: plateArt,
    set: [{ group: "ตัวเลือก", choice: "แผ่นจิ๊กซอว์", desc: "เฉพาะแผ่นจิ๊กซอว์ ไม่มีกรอบรูป" }],
  },
  {
    file: `option-framed-${OPT_VER}.jpg`,
    svg: framedArt,
    set: [{ group: "ตัวเลือก", choice: "กรอบรูป + แผ่นจิ๊กซอว์", desc: "กรอบไม้สีอ่อน + แผ่นจิ๊กซอว์ ครบชุดพร้อมโชว์" }],
  },
  ...SIZES.map((z) => ({
    file: `${z.file}-${VER}.jpg`,
    svg: () => sizeArt(z),
    set: [{
      group: "ขนาด",
      choice: z.choice,
      desc: `${z.w} × ${z.h} ซม. · จิ๊กซอว์ ${z.pieces} ชิ้น · ${z.stand ? "กรอบตั้งโต๊ะได้" : "กรอบแขวนผนังอย่างเดียว"}`,
    }],
  })),
];

for (const j of JOBS) {
  const buf = await sharp(Buffer.from(j.svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, buf);
  j.local = `${OUT}/${j.file}`;
  /* ครอปกลาง 300–600 ไว้ตรวจว่าย่อเป็นปุ่มแล้วยังแยกออก */
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${j.file}`);
  console.log(`🖼  ${j.file}  ${Math.round(buf.length / 1024)} KB (+ _thumb ครอปกลาง)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log(`\n(ยังไม่เขียน DB — เปิดดูที่ ${OUT} แล้วรันด้วย --write เมื่อภาพผ่านตา)`); process.exit(0); }

// ── อัปโหลด storage + ตั้ง imageSrc/desc + display cards + อ่านกลับเทียบ ─
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

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

const want = [];
const apply = (group, choiceName, url, desc) => {
  const gs = (data.options ?? []).filter((o) => o.label === group);
  if (gs.length !== 1) { console.error(`กลุ่ม "${group}" เจอ ${gs.length} กลุ่ม — ต้องมีกลุ่มเดียว`); process.exit(1); }
  const g = gs[0];
  const c = (g.choices || []).find((c) => c.name === choiceName);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${choiceName}" ในกลุ่ม "${group}"`); process.exit(1); }
  c.imageSrc = url;
  if (desc) c.desc = desc;
  g.display = "cards"; // การ์ดรูปใหญ่ + คำอธิบาย (ทรงเดียวกับสินค้าตัวอื่นทั้งร้าน)
  want.push({ group, choiceName, url });
};
for (const j of JOBS) for (const t of j.set) apply(t.group, t.choice, j.url, t.desc);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const wnt of want) {
  const g = back.data.options.find((o) => o.label === wnt.group);
  const got = g?.choices?.find((c) => c.name === wnt.choiceName)?.imageSrc;
  if (got !== wnt.url || g?.display !== "cards") { console.error("อ่านกลับไม่ตรง!", wnt.group, wnt.choiceName, got, g?.display); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc + desc ครบ ${want.length} ตัวเลือก (2 กลุ่มเป็นการ์ด) อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
