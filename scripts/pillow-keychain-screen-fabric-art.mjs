#!/usr/bin/env node
/**
 * PILLOW KEYCHAIN (pillow-keychain) — ชื่อกลุ่มสกรีน + ภาพตัวอย่างประจำตัวเลือก
 *
 *   node scripts/pillow-keychain-screen-fabric-art.mjs           (วาดภาพลง .cache/pillow-keychain/upload ดูก่อน)
 *   node scripts/pillow-keychain-screen-fabric-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ทำ 2 อย่าง (เจ้าของร้านสั่ง 3 ก.ย. 69):
 *   1. กลุ่ม "พิมพ์" → "สกรีนกี่ด้าน" · ตัวเลือก "1 ด้าน" → "สกรีน 1 ด้าน" · "2 ด้าน" → "สกรีน 2 ด้าน"
 *      (extra +10 ของ 2 ด้านคงเดิม · กลุ่มนี้ไม่ใช่แกนราคา driverLabels ว่าง ไม่มี rules อ้างชื่อ)
 *   2. วาดภาพตัวอย่าง 900×900 ให้กลุ่มที่ยังไม่มีภาพเลย:
 *      สกรีนกี่ด้าน (2 ใบ) · ขนาดมากกว่า 8 ซม (1 ใบ)
 *      ⚠️ กลุ่ม "เนื้อผ้า" เคยวาดการ์ดไว้ 2 ใบ แต่ 4 ก.ย. 69 เจ้าของร้านส่ง "ใบสเปคผ้าจริง" มาให้ใช้แทน
 *         → ย้ายไปที่ scripts/pillow-keychain-fabric-photo.mjs · สคริปต์นี้ไม่แตะกลุ่มเนื้อผ้าอีกแล้ว
 *         (fabricArt()/plushArea() ยังเก็บไว้เผื่ออยากได้การ์ดวาดเองอีกครั้ง — ไม่ได้ถูกเรียกแล้ว)
 *      — กลุ่ม "รูปทรง" กับ "ลายพิมพ์" มีรูปงานจริงจากแกลเลอรีอยู่แล้ว ไม่แตะ
 *   3. ติดป้าย "นิยม" ให้ "เนื้อผ้า: ขนสั้น 200แกรม" (choice.popular — 4 ก.ย. 69)
 *
 * ที่มาของเนื้อหา: products.pillow-keychain ใน DB + รูปงานจริงในแกลเลอรี (หมอนจิ๋ว 8×8 ซม.
 * ยัดใย ห่วงผ้าขาว + โซ่ไข่ปลาเงิน · รูปช่อง 1 เทียบผ้าแคนวาส-ผ้าขนสั้นคู่กันไว้แล้ว)
 *
 * กติกาภาพย่อ: ปุ่ม/ดรอปดาวน์ครอป "กลางภาพ" 62×62 → สิ่งที่ทำให้ตัวเลือกต่างกัน
 * ต้องตกในกรอบ 300–600 (สกรีน = ป้ายเลขด้านกลางภาพ · เนื้อผ้า = วงซูมผิวผ้า)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * รันซ้ำได้: หาตัวเลือกได้ทั้งชื่อเก่า-ใหม่ · เขียนทับ imageSrc ตัวเดิม
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 460);
const PEACE = await mascotDataUri("peace", 460);

const PRODUCT_ID = "pillow-keychain";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

/** ชื่อกลุ่ม/ตัวเลือก — ฝั่งซ้ายคือของเดิมใน DB */
const SCREEN_GROUP_OLD = "พิมพ์";
const SCREEN_GROUP = "สกรีนกี่ด้าน";
const SCREEN_RENAME = { "1 ด้าน": "สกรีน 1 ด้าน", "2 ด้าน": "สกรีน 2 ด้าน" };
const FABRIC_GROUP = "เนื้อผ้า";
/** ⭐ ติดป้าย "นิยม" ท้ายชื่อตัวเลือก (choice.popular — ป้ายบอกทางเฉย ๆ ไม่มีผลกับราคา) */
const POPULAR = { [FABRIC_GROUP]: "ขนสั้น 200แกรม" };
const SIZE_GROUP = "ขนาดมากกว่า 8 ซม";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สุ่มแบบมีเมล็ด — รันกี่รอบภาพก็เหมือนเดิม (ไฟล์ไม่เปลี่ยนโดยไม่ได้ตั้งใจ) */
let seed = 20260903;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

/** กรอบการ์ด + หัวเรื่อง/หมายเหตุ (ชุดเดียวกับ folding-mirror-screen-option / lighter) */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ป้ายชื่อใต้ชิ้นงาน */
const tag = (cx, y, text, on = true) => {
  const w = text.length * 14 + 46;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

/** ทรงหมอนยัดใย — สี่เหลี่ยมมุมมน (มุมกลมใหญ่ตามที่เย็บกลับด้าน) ด้านป่องออกตามใยที่ยัด */
function pillowPath(cx, cy, s, bulge = 0.055) {
  const h = s / 2;
  const b = s * bulge;   // ด้านป่องออกเท่าไหร่
  const r = s * 0.22;    // รัศมีมุม
  const a = (x, y) => `A ${r} ${r} 0 0 1 ${x} ${y}`;
  return [
    `M ${cx - h} ${cy - h + r}`,
    a(cx - h + r, cy - h),
    `Q ${cx} ${cy - h - b} ${cx + h - r} ${cy - h}`,
    a(cx + h, cy - h + r),
    `Q ${cx + h + b} ${cy} ${cx + h} ${cy + h - r}`,
    a(cx + h - r, cy + h),
    `Q ${cx} ${cy + h + b} ${cx - h + r} ${cy + h}`,
    a(cx - h, cy + h - r),
    `Q ${cx - h - b} ${cy} ${cx - h} ${cy - h + r} Z`,
  ].join(" ");
}

/**
 * ขนผ้า — ขีดสั้นเรียวสุ่มทิศทางเล็กน้อย ซ้อนกันแน่นจนเห็นเป็นผิวฟู
 * (len ใหญ่ = ซูมเข้าใกล้) คุมคอนทราสต์ให้ต่ำ ไม่งั้นเห็นเป็นเศษกระดาษโรย
 */
const fibers = (x, y, w, h, len, n) => {
  let s = "";
  for (let i = 0; i < n; i++) {
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    const a = ((-80 + (rnd() - 0.5) * 90) * Math.PI) / 180; // เอนขึ้นเป็นส่วนใหญ่ เหมือนขนที่ถูกหวี
    const l = len * (0.5 + rnd() * 0.8);
    const c = ["#ffffff", "#f6f8fa", "#e9edf2", "#dfe5ec"][Math.floor(rnd() * 4)];
    s += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${(px + Math.cos(a) * l).toFixed(1)}" y2="${(py + Math.sin(a) * l).toFixed(1)}" stroke="${c}" stroke-width="${(len * 0.15).toFixed(2)}" stroke-linecap="round" opacity="0.55"/>`;
  }
  return s;
};

/** ผิวขนสั้นทั้งผืน — พื้นนวล + ขนซ้อน 2 ชั้น เบลอบาง ๆ ให้ดูนุ่ม */
const plushArea = (x, y, w, h, len, n, blurId) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fafbfc"/>
  <g filter="url(#${blurId})">
    ${fibers(x, y, w, h, len * 1.35, Math.round(n * 0.35))}
    ${fibers(x, y, w, h, len, n)}
  </g>`;

/**
 * ลายทอผ้าแคนวาส — ด้ายขวางสลับด้ายตั้ง (u = ขนาดตาทอ ยิ่งใหญ่ = ซูมเข้าใกล้)
 * strong = ใช้ในวงซูมเท่านั้น · บนตัวชิ้นงานคุมคอนทราสต์ต่ำ ไม่งั้นเห็นเป็นลายหมากรุก
 */
const weave = (id, u, strong = false) => {
  const base = strong ? "#f1eee7" : "#faf9f7";
  const hi = strong ? "#fdfcf8" : "#ffffff";
  const line = strong ? "#e6e1d6" : "#f2f0eb";
  return `
  <pattern id="${id}" width="${u}" height="${u}" patternUnits="userSpaceOnUse">
    <rect width="${u}" height="${u}" fill="${base}"/>
    <rect x="0" y="0" width="${u * 0.5}" height="${u * 0.5}" fill="${hi}"/>
    <rect x="${u * 0.5}" y="${u * 0.5}" width="${u * 0.5}" height="${u * 0.5}" fill="${hi}"/>
    <line x1="0" y1="${u * 0.5}" x2="${u}" y2="${u * 0.5}" stroke="${line}" stroke-width="${Math.max(0.6, u * 0.035)}"/>
    <line x1="${u * 0.5}" y1="0" x2="${u * 0.5}" y2="${u}" stroke="${line}" stroke-width="${Math.max(0.6, u * 0.035)}"/>
  </pattern>`;
};

/** ห่วงผ้าขาว + โซ่ไข่ปลาเงิน (วงโซ่คล้องห่วง) โผล่เหนือหมอน */
function hanger(cx, topY) {
  const rw = 28;
  const rh = 46;
  const ry = topY - rh + 10;      // ห่วงผ้าเสียบอยู่ใต้ขอบหมอนเล็กน้อย
  const R = 33;                    // รัศมีวงโซ่
  const cyR = ry - R + 8;          // ก้นวงโซ่จมในห่วงผ้า 8 px
  let beads = "";
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const bx = cx + Math.cos(a) * R;
    const by = cyR + Math.sin(a) * R;
    beads += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="6" fill="#dee3e9" stroke="#98a3af" stroke-width="1.5"/>
      <circle cx="${(bx - 1.7).toFixed(1)}" cy="${(by - 1.7).toFixed(1)}" r="1.9" fill="#ffffff" opacity="0.95"/>`;
  }
  return `
  ${beads}
  <rect x="${cx - rw / 2}" y="${ry}" width="${rw}" height="${rh}" rx="10" fill="#ffffff" stroke="#dde3ea" stroke-width="2.5"/>
  <line x1="${cx - rw / 2 + 5}" y1="${ry + rh - 11}" x2="${cx + rw / 2 - 5}" y2="${ry + rh - 11}" stroke="#e8edf2" stroke-width="2"/>`;
}

/**
 * หมอนจิ๋วหนึ่งใบ
 *   fabric  "canvas" (ผ้าแคนวาสทอเรียบ) | "plush" (ผ้าขนสั้น ขอบฟู)
 *   print   มาสคอตที่ใช้แทนลายลูกค้า (null = ผ้าเปล่าไม่พิมพ์)
 *   printK  ความกว้างลายเทียบขนาดหมอน (0.62 = มีขอบผ้าขาวรอบลาย)
 */
function pillow({ cx, cy, size, id, fabric = "canvas", print = null, printK = 0.66, chain = true }) {
  const d = pillowPath(cx, cy, size);
  const half = size / 2;
  const u = size * 0.052; // ตาทอบนชิ้นงานจริง
  let art = "";
  if (print) {
    let aw = size * printK;
    let ah = aw / print.ratio;
    const maxH = size * printK;
    if (ah > maxH) { ah = maxH; aw = ah * print.ratio; }
    art = `<image href="${print.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
      preserveAspectRatio="xMidYMid meet" clip-path="url(#pil-${id})" opacity="${fabric === "plush" ? 0.93 : 1}"
      ${fabric === "plush" ? `filter="url(#soft-${id})"` : ""}/>`;
  }
  return `
  <defs>
    <clipPath id="pil-${id}"><path d="${d}"/></clipPath>
    ${fabric === "canvas" ? weave(`wv-${id}`, u) : ""}
    <filter id="soft-${id}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${size * 0.006}"/></filter>
    <filter id="blur-${id}" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="${size * 0.004}"/></filter>
    <filter id="fuzz-${id}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="${size * 0.018}"/></filter>
    <radialGradient id="vol-${id}" cx="0.38" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="0.72" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#c9d2dc" stop-opacity="0.35"/>
    </radialGradient>
  </defs>
  ${chain ? hanger(cx, cy - half + size * 0.05) : ""}
  <ellipse cx="${cx}" cy="${cy + half + size * 0.1}" rx="${half * 0.86}" ry="${size * 0.055}" fill="#0f172a" opacity="0.07"/>
  ${fabric === "plush" ? `<path d="${d}" fill="none" stroke="#eef1f5" stroke-width="${size * 0.075}" filter="url(#fuzz-${id})"/>` : ""}
  <path d="${d}" fill="${fabric === "canvas" ? `url(#wv-${id})` : "#fafbfc"}" stroke="#dfe5ec" stroke-width="2.5"/>
  ${fabric === "plush" ? `<g clip-path="url(#pil-${id})" filter="url(#blur-${id})">${fibers(cx - half - 20, cy - half - 20, size + 40, size + 40, size * 0.055, 1500)}</g>` : ""}
  ${art}
  <path d="${d}" fill="url(#vol-${id})"/>
  <path d="${d}" fill="none" stroke="#d8dfe7" stroke-width="2.5"/>`;
}

// ── กลุ่ม "สกรีนกี่ด้าน" ─────────────────────────────────────────────
/** หมอน 2 ใบ = ด้านหน้า/ด้านหลังของชิ้นเดียวกัน + ป้ายเลขด้านกลางภาพ (โซนที่ภาพย่อครอปเห็น) */
function screenArt(sides) {
  const one = sides === 1;
  const size = 268;
  const cy = 452;
  const lx = 240;
  const rx = 660;
  const body = `
  ${pillow({ cx: lx, cy, size, id: "sf", fabric: "canvas", print: HEART })}
  ${pillow({ cx: rx, cy, size, id: "sb", fabric: "canvas", print: one ? null : PEACE })}
  ${one ? `<text x="${rx}" y="${cy + 12}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#aeb8c3">ไม่พิมพ์ลาย</text>` : ""}
  <circle cx="${W / 2}" cy="${cy - 6}" r="78" fill="#ffffff" stroke="${OK}" stroke-width="4"/>
  <text x="${W / 2}" y="${cy - 8}" font-family="${TH}" font-size="62" font-weight="700" text-anchor="middle" fill="${OK}">${sides}</text>
  <text x="${W / 2}" y="${cy + 34}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${OK}">ด้าน</text>
  ${tag(lx, cy + size / 2 + 74, "ด้านหน้า — มีลาย")}
  ${tag(rx, cy + size / 2 + 74, one ? "ด้านหลัง — ผ้าเปล่า" : "ด้านหลัง — มีลาย", !one)}`;
  return one
    ? card("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้า — ด้านหลังเป็นผ้าเปล่า", body,
      "ราคามาตรฐาน ไม่มีค่าเพิ่ม", "งานพิมพ์ซับลิเมชั่น สีซึมเข้าเนื้อผ้า ไม่ลอกไม่แตก")
    : card("สกรีน 2 ด้าน", "พิมพ์ลายทั้งด้านหน้าและด้านหลัง", body,
      "+฿10 ต่อชิ้น · หน้า-หลังคนละลายได้", "งานพิมพ์ซับลิเมชั่น สีซึมเข้าเนื้อผ้า ไม่ลอกไม่แตก");
}

// ── กลุ่ม "เนื้อผ้า" ─────────────────────────────────────────────────
/** หมอนซ้าย + วงซูมผิวผ้าขวา (วงซูมคร่อมกลางภาพ = ภาพย่อเห็นความต่างของผิวผ้า) */
function fabricArt(kind) {
  const plush = kind === "plush";
  const size = 262;
  const cy = 452;
  const cx = 236;
  const zx = 596;
  const zy = 452;
  const R = 178;
  const zoom = `
  <defs>
    <clipPath id="zc"><circle cx="${zx}" cy="${zy}" r="${R - 6}"/></clipPath>
    <filter id="zblur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.4"/></filter>
    ${plush ? "" : weave("wv-zoom", 56, true)}
  </defs>
  <circle cx="${zx}" cy="${zy}" r="${R}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="4"/>
  <g clip-path="url(#zc)">
    ${plush
      ? plushArea(zx - R, zy - R, R * 2, R * 2, 26, 2600, "zblur")
      : `<rect x="${zx - R}" y="${zy - R}" width="${R * 2}" height="${R * 2}" fill="url(#wv-zoom)"/>`}
  </g>
  <text x="${zx}" y="${zy + R + 44}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">${plush ? "ผิวขนสั้น นุ่มฟู" : "ผิวทอเป็นตาราง เรียบแน่น"}</text>
  <text x="${zx}" y="${zy - R - 22}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ซูมผิวผ้า</text>`;
  const body = `
  ${pillow({ cx, cy, size, id: kind, fabric: plush ? "plush" : "canvas", print: HEART })}
  ${zoom}
  ${tag(cx, cy + size / 2 + 74, plush ? "ขนสั้น 200 แกรม" : "แคนวาส 8 oz")}`;
  return plush
    ? card("ผ้าขนสั้น 200 แกรม", "ผิวขนนุ่มสั้น จับแล้วนุ่มฟู ขอบชิ้นงานดูอิ่ม", body,
      "สีพิมพ์นุ่มตาลงเล็กน้อยตามขนผ้า — เหมาะกับลายการ์ตูน/คาแรกเตอร์",
      "ราคาเท่ากับผ้าแคนวาส ไม่มีค่าเพิ่ม")
    : card("ผ้าแคนวาส (8 oz)", "ผิวเรียบ เนื้อแน่นอยู่ทรง เห็นรายละเอียดลายคมกว่า", body,
      "เหมาะกับลายเส้นเล็ก ตัวหนังสือ หรือลายที่มีรายละเอียดเยอะ",
      "ราคาเท่ากับผ้าขนสั้น ไม่มีค่าเพิ่ม");
}

// ── กลุ่ม "ขนาดมากกว่า 8 ซม" ─────────────────────────────────────────
/** หมอนมาตรฐาน 8 ซม. + กรอบเส้นประขนาดที่ขยาย พร้อมป้ายราคาเซนละ */
function sizeArt() {
  const CM = 30;               // 1 ซม. = 30 px
  const base = 8 * CM;         // 240
  const big = 12 * CM;         // 360 — ตัวอย่าง "เพิ่ม 4 ซม."
  const cx = W / 2;
  const cy = 408;
  const dimH = (y, x1, x2, label, color) => `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="2.5"/>
    <line x1="${x1}" y1="${y - 9}" x2="${x1}" y2="${y + 9}" stroke="${color}" stroke-width="3"/>
    <line x1="${x2}" y1="${y - 9}" x2="${x2}" y2="${y + 9}" stroke="${color}" stroke-width="3"/>
    <rect x="${(x1 + x2) / 2 - (label.length * 12 + 30) / 2}" y="${y - 19}" width="${label.length * 12 + 30}" height="38" rx="10" fill="#ffffff"/>
    <text x="${(x1 + x2) / 2}" y="${y + 9}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${color}">${label}</text>`;
  const body = `
  <path d="${pillowPath(cx, cy, big)}" fill="none" stroke="${OK}" stroke-width="3.5" stroke-dasharray="12 10" opacity="0.85"/>
  ${pillow({ cx, cy, size: base, id: "sz", fabric: "canvas", print: HEART, chain: true })}
  ${dimH(cy + big / 2 + 44, cx - base / 2, cx + base / 2, "8 ซม. (มาตรฐาน)", SUB)}
  ${dimH(cy + big / 2 + 100, cx - big / 2, cx + big / 2, "12 ซม. = เพิ่ม 4 ซม.", OK)}
  <rect x="${cx - 170}" y="${cy + big / 2 + 134}" width="340" height="56" rx="28" fill="#ecfeff" stroke="${OK}" stroke-width="3"/>
  <text x="${cx}" y="${cy + big / 2 + 172}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${OK}">เพิ่มเซนติเมตรละ 10 บาท</text>`;
  return card("เพิ่มขนาดจาก 8 ซม.", "มาตรฐาน 8 × 8 ซม. — ใหญ่กว่านั้นคิดเซนติเมตรละ ฿10", body,
    "ใส่จำนวนเซนติเมตรที่เพิ่ม เช่น อยากได้ 12 ซม. ใส่ 4 (+฿40 ต่อชิ้น)",
    "เพิ่มได้สูงสุด 20 ซม. · ขนาดจริงคลาดเคลื่อน ±1-2 ซม. ตามการยัดใย");
}

// ── วาดทั้งหมดลงแคช ──────────────────────────────────────────────────
const JOBS = [
  { file: `screen-1side-${VER}.jpg`, svg: screenArt(1), group: SCREEN_GROUP, choice: "สกรีน 1 ด้าน" },
  { file: `screen-2side-${VER}.jpg`, svg: screenArt(2), group: SCREEN_GROUP, choice: "สกรีน 2 ด้าน" },
  { file: `size-extra-cm-${VER}.jpg`, svg: sizeArt(), group: SIZE_GROUP, choice: "เซนละ" },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  // ครอปกลางภาพ 300–600 เก็บไว้ดูด้วย — ปุ่มตัวเลือกเห็นแค่กรอบนี้
  await sharp(j.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).resize(124, 124)
    .jpeg({ quality: 88 }).toFile(`${OUT}/thumb-${j.file}`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
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

// อ่าน DB สดก่อนเขียนเสมอ (อาจมีคนแก้สินค้าตัวเดียวกันอยู่)
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

// 1. เปลี่ยนชื่อกลุ่ม + ตัวเลือกสกรีน (idempotent — รันซ้ำเจอชื่อใหม่อยู่แล้วก็ผ่าน)
const sg = (data.options ?? []).find((o) => o.label === SCREEN_GROUP || o.label === SCREEN_GROUP_OLD);
if (!sg) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP_OLD}"/"${SCREEN_GROUP}"`); process.exit(1); }
sg.label = SCREEN_GROUP;
for (const c of sg.choices ?? []) if (SCREEN_RENAME[c.name]) c.name = SCREEN_RENAME[c.name];

// 2. เติม imageSrc (extra/desc เดิมอยู่ครบ)
for (const j of JOBS) {
  const g = (data.options ?? []).find((o) => o.label === j.group);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${j.group}"`); process.exit(1); }
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.group}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

// 3. ป้าย "นิยม" (เจ้าของร้านสั่ง 4 ก.ย. 69 — ผ้าขนสั้นเป็นตัวที่ลูกค้าสั่งมากที่สุด)
for (const [label, choice] of Object.entries(POPULAR)) {
  const g = (data.options ?? []).find((o) => o.label === label);
  const c = g?.choices?.find((c) => c.name === choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${label}: ${choice}" สำหรับป้ายนิยม`); process.exit(1); }
  c.popular = true;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of JOBS) {
  const c = back.data.options.find((o) => o.label === j.group)?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.group, j.choice, c); process.exit(1); }
}
const bsg = back.data.options.find((o) => o.label === SCREEN_GROUP);
if (!bsg) { console.error("ชื่อกลุ่มสกรีนไม่เปลี่ยน!"); process.exit(1); }
const stale = bsg.choices.find((c) => SCREEN_RENAME[c.name]);
if (stale) { console.error("ยังมีชื่อเก่าค้าง!", stale); process.exit(1); }
const two = bsg.choices.find((c) => c.name === "สกรีน 2 ด้าน");
if (two?.extra !== 10) { console.error("extra สกรีน 2 ด้าน หาย!", two); process.exit(1); }
for (const [label, choice] of Object.entries(POPULAR)) {
  const c = back.data.options.find((o) => o.label === label)?.choices?.find((c) => c.name === choice);
  if (c?.popular !== true) { console.error("ป้ายนิยมไม่ลง!", label, choice, c); process.exit(1); }
}
const qty = back.data.options.find((o) => o.label === SIZE_GROUP)?.choices?.find((c) => c.name === "เซนละ");
if (qty?.extra !== 10 || qty?.qtyMax !== 20) { console.error("ตัวเลือกเซนละเพี้ยน!", qty); process.exit(1); }
console.log(`✓ เปลี่ยนชื่อกลุ่ม/ตัวเลือกสกรีน + ภาพ ${JOBS.length} ใบ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
