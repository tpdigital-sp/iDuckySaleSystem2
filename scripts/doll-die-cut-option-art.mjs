#!/usr/bin/env node
/**
 * ตุ๊กตาไดคัท (DOLL DIE-CUT) — ภาพประกอบตัวเลือกทั้งหน้า (13 ใบ)
 *
 *   node scripts/doll-die-cut-option-art.mjs            (วาดภาพลง .cache/doll-die-cut/upload ดูก่อน)
 *   node scripts/doll-die-cut-option-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * เขียนลงสินค้าเดียว `doll-die-cut` (ยุบ 2 หน้าเป็นหน้าเดียวแล้ว 4 ก.ย. 69 — ดู scripts/doll-die-cut-merge.mjs):
 * 1. กลุ่ม "ขนาด" ชุดงานปัก 3 ใบ ("ขนาดไม่เกิน 15/25/35x…cm" · สเกล 14 px/ซม.)
 * 2. กลุ่ม "ขนาด" ชุดงานสกรีน 8 ใบ ("15x15cm"…"85x85cm" · สเกล 6.4 px/ซม.)
 * 3. กลุ่ม "พิมพ์ลาย" 2 ใบ (หน้า-หลัง เทียบกัน) + ขั้นเปลี่ยนชื่อ "1/2 ด้าน" → "สกรีน 1/2 ด้าน" (ทำไปแล้ว 3 ก.ย. เก็บไว้ให้รันซ้ำได้)
 *
 * ⚠️ "ขนาด" + "พิมพ์ลาย" เป็นแกนตารางราคา (driverLabels) — คีย์ cells เป็น "ขนาด│พิมพ์ลาย"
 *    เปลี่ยนชื่อตัวเลือกจึงต้องย้ายคีย์ทั้ง data.pricing.cells และ data.priceRates[].pricing.cells
 *    สคริปต์ย้ายด้วย "ตำแหน่งแกน" (index ใน driverLabels) ไม่ใช่ replace สตริงดิบ ๆ
 *    ดู [[iducky-price-driver-trap]] · ชื่อกลุ่ม "พิมพ์ลาย" ไม่แตะ (อยู่ใน driverLabels เหมือนกัน)
 *
 * ดีไซน์ (ตามกติกา [[iducky-option-thumb-crop]] — ปุ่มตัวเลือกครอปกลางภาพ 300–600):
 *  - ทุกใบในกลุ่มเดียวกันสเกลเดียวกัน (CM คงที่) เทียบขนาดข้ามตัวเลือกได้จริง
 *  - ขวดน้ำ 600 มล. ขนาดจริง (สูง 22 ซม.) จาง ๆ ตำแหน่งตายตัวฝั่งขวา = ไม้บรรทัดประจำการ์ด
 *  - ป้ายเลขขนาดตัวใหญ่ตกอยู่ในกรอบครอปกลางเสมอ (badgeY หนีบไว้ ≤ 545)
 *  - กรอบประ N×N = ความหมายจริงของ "ขนาดไม่เกิน" (ไดคัทตามทรง อยู่ในกรอบนี้)
 *  - ขอบไดคัทขาวรอบตัวตามชาร์ตร้าน "ขอบไดคัทตุ๊กตา.jpg" (15→1.5 · 25→2 · 35→3 · 45→4 ซม.)
 *
 * รันซ้ำได้: เขียนทับ imageSrc ตัวเดิม · เปลี่ยนชื่อซ้ำได้ (เจอชื่อใหม่แล้วข้าม)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const FRONT = await mascotDataUri("heart", 460);
const BACK = await mascotDataUri("peace", 460);

const VER = "v3"; // v1 ป้ายเลขทับตัวเป็ด · v2 เทียบขนาดด้วย "มือ" (ผู้ใช้ขอเปลี่ยน) · v3 = ขวดน้ำ 600 มล.
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/doll-die-cut/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const CY = 415; // จุดกึ่งกลางชิ้นงานทุกใบ (ครอปกลาง 300–600 ต้องเห็นตัวงาน)

/** ขอบไดคัทขาวรอบตัว (ซม.) — ชาร์ตร้าน "ขอบไดคัทตุ๊กตา.jpg": 8→1 · 15→1.5 · 25→2 · 35→3 · 45→4 */
const EDGE = { 15: 1.5, 25: 2, 35: 3, 45: 4, 55: 5, 65: 6, 75: 7, 85: 8 };

/**
 * 🔗 4 ก.ย. 69 ยุบเป็นสินค้าเดียวแล้ว (ดู scripts/doll-die-cut-merge.mjs) — ทั้ง 2 ชุดขนาดอยู่ใน
 * กลุ่ม "ขนาด" กลุ่มเดียวของ doll-die-cut โดยแยกกันด้วย "ชื่อตัวเลือก" (งานปักมีคำว่า "ไม่เกิน")
 * ชื่อไฟล์จึงต้องมีคำนำหน้าคนละแบบ ไม่งั้นทับกันในโฟลเดอร์เดียวกัน
 */
const PID = "doll-die-cut";
const PRODUCTS = {
  embroidery: {
    filePrefix: "emb-size",
    cm: 14, // px ต่อ ซม. — ใบใหญ่สุด 35 ซม. = 490 px ยังเหลือที่ให้ขวดน้ำเทียบขนาด
    sizes: [15, 25, 35],
    choiceOf: (n) => `ขนาดไม่เกิน ${n}x${n}cm`,
    title: (n) => `ขนาดไม่เกิน ${n} × ${n} ซม.`,
    subtitle: "ตุ๊กตาไดคัทตามทรงลาย · งานปักด้วยเส้นไหม",
    printed: false,
  },
  screen: {
    filePrefix: "size",
    cm: 6.4, // ใบใหญ่สุด 85 ซม. = 544 px
    sizes: [15, 25, 35, 45, 55, 65, 75, 85],
    choiceOf: (n) => `${n}x${n}cm`,
    title: (n) => `ขนาด ${n} × ${n} ซม.`,
    subtitle: "ตุ๊กตา/หมอนไดคัทตามทรงลาย · พิมพ์ซับลิเมชั่น",
    printed: true,
  },
};

/** กรอบการ์ด + หัวเรื่อง/หมายเหตุ (ทรงเดียวกับสคริปต์ภาพตัวเลือกตัวอื่นทั้งร้าน) */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ลูกศรวัดขนาด — เส้น + ขีดปลายสองข้าง + ป้ายตัวเลข */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 12 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 30;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  const bw = label.length * 12.5;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? bw : bw / 2)}" y="${ly - 24}" width="${bw}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/**
 * ทรงตุ๊กตาไดคัท (หัวแมวมีหู — ทรงเดียวกับตัวอย่างในใบสเปค P-nDoll-01)
 * พิกัดหน่วย -1..1 ทั้งสองแกน = พอดีกรอบ N×N → ไดคัท "ตามทรง" แต่ยังอยู่ในกรอบขนาดที่เลือก
 */
const dollPath = (cx, cy, s, attrs = "") => {
  const P = (ux, uy) => `${(cx + (ux * s) / 2).toFixed(1)} ${(cy + (uy * s) / 2).toFixed(1)}`;
  // หูซ้าย → หน้าผาก → หูขวา → แก้มขวา → คาง → แก้มซ้าย (ปลายหูอยู่ที่ y = -1 พอดีขอบกรอบ)
  return `<path d="M ${P(-0.95, -0.50)}
    C ${P(-0.95, -0.72)} ${P(-0.88, -0.93)} ${P(-0.74, -1.00)}
    C ${P(-0.60, -0.93)} ${P(-0.45, -0.80)} ${P(-0.34, -0.62)}
    C ${P(-0.16, -0.69)} ${P(0.16, -0.69)} ${P(0.34, -0.62)}
    C ${P(0.45, -0.80)} ${P(0.60, -0.93)} ${P(0.74, -1.00)}
    C ${P(0.88, -0.93)} ${P(0.95, -0.72)} ${P(0.95, -0.50)}
    C ${P(1.00, -0.20)} ${P(1.00, 0.24)} ${P(0.84, 0.56)}
    C ${P(0.64, 0.92)} ${P(0.34, 1.00)} ${P(0.00, 1.00)}
    C ${P(-0.34, 1.00)} ${P(-0.64, 0.92)} ${P(-0.84, 0.56)}
    C ${P(-1.00, 0.24)} ${P(-1.00, -0.20)} ${P(-0.95, -0.50)} Z" ${attrs}/>`;
};

/**
 * กรอบ "โซนวางลาย" ที่ปลอดภัยของทรงหัวแมว (พิกัดหน่วยของทรงชั้นใน)
 * — ต่ำกว่าร่องหูและสูงกว่าช่วงคางสอบ วางลายในกรอบนี้แล้ว "ไม่มีทางโดนขอบทรงตัด"
 * (ผู้ใช้ตีกลับรุ่น v1: เป็ดโดนตัดหัว/ตัดขา — v2 เลยเลิกใช้ clip-path แล้วคุมกรอบแทน)
 */
const SAFE_TOP = 0.26;  // × inner จากกึ่งกลางขึ้นบน
const SAFE_BOT = 0.36;  // × inner จากกึ่งกลางลงล่าง
const SAFE_W = 0.70;    // × inner
/** กรอบที่ปุ่มตัวเลือกครอปเห็น (62×62 = กลางภาพ 300–600) — ลายต้องอยู่ในนี้ทั้งตัว */
const CROP_TOP = 312;
const CROP_BOT = 588;
const CROP_W = 276;

/**
 * ตุ๊กตาไดคัทหนึ่งตัว — ขอบผ้าขาว (ไดคัท) + เนื้อลายด้านใน + เส้นเย็บรอบ
 * px = ความกว้างกรอบ N×N เป็นพิกเซล · n = ขนาดจริงเป็น ซม. (ใช้คิดสัดส่วนขอบไดคัท)
 * mode: "print" ลายพิมพ์เต็ม · "stitch" งานปัก · "blank" ด้านหลังผ้าเปล่า
 * artBottom = เพดานล่างของลาย (ใช้กันไม่ให้ป้ายเลขขนาดทับตัวเป็ด)
 */
function doll(cx, cy, px, n, id, mode, artBottom = CROP_BOT) {
  const edge = EDGE[n] ?? Math.max(1.5, n / 10 - 0.5);
  const inner = px * Math.max(0.42, (n - 2 * edge) / n); // ขอบไดคัทกินเข้ามารอบตัว
  const art = mode === "blank" ? null : (id.endsWith("back") ? BACK : FRONT);
  const fill = mode === "print" ? `url(#ink-${id})` : mode === "stitch" ? "#fdf2f8" : "#f8fafc";

  // โซนวางลาย = โซนปลอดภัยของทรง ∩ กรอบครอปกลาง ∩ เหนือป้ายเลขขนาด
  const top = Math.max(cy - inner * SAFE_TOP, CROP_TOP);
  const bot = Math.min(cy + inner * SAFE_BOT, CROP_BOT, artBottom);
  let aH = Math.max(0, bot - top);
  let aW = art ? aH * art.ratio : 0;
  const maxW = Math.min(inner * SAFE_W, CROP_W);
  if (aW > maxW) { aW = maxW; aH = aW / art.ratio; }

  return `
  <defs>
    <radialGradient id="plush-${id}" cx="0.34" cy="0.26" r="0.95">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#fbfbfc"/>
      <stop offset="1" stop-color="#e7eaef"/>
    </radialGradient>
    <linearGradient id="ink-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="0.5" stop-color="#0e7490"/>
      <stop offset="1" stop-color="#155e75"/>
    </linearGradient>
  </defs>
  <g opacity="0.16">${dollPath(cx + px * 0.012, cy + px * 0.026, px, `fill="#0f172a"`)}</g>
  ${dollPath(cx, cy, px, `fill="url(#plush-${id})" stroke="#d3d8e0" stroke-width="${Math.max(2, px * 0.006)}"`)}
  ${dollPath(cx, cy, inner, `fill="${fill}"`)}
  ${mode === "stitch" ? dollPath(cx, cy, inner, `fill="none" stroke="#fbcfe8" stroke-width="${Math.max(1.6, px * 0.006)}"`) : ""}
  ${art && aH > 8 ? `<image href="${art.uri}" x="${cx - aW / 2}" y="${top + (bot - top - aH) / 2}"
      width="${aW}" height="${aH}" preserveAspectRatio="xMidYMid meet"/>` : ""}
  <!-- เส้นเย็บรอบขอบไดคัท -->
  ${dollPath(cx, cy, px * 0.945, `fill="none" stroke="#94a3b8" stroke-width="${Math.max(1.6, px * 0.005)}" stroke-dasharray="${px * 0.026} ${px * 0.02}" opacity="0.8"`)}`;
}

/**
 * ขวดน้ำดื่ม 600 มล. ขนาดจริง (สูงรวมฝา 22 · ตัวขวดกว้าง 6.5 ซม.) จาง ๆ — ไม้บรรทัดประจำการ์ด
 * (ผู้ใช้เปลี่ยนจาก "มือ 18 ซม." 4 ก.ย. 69 — ขวดน้ำเป็นของใกล้ตัวที่ทุกคนนึกภาพออกตรงกัน
 *  และแคบกว่ามือ เหลือที่ว่างข้างตุ๊กตาใบใหญ่สุดมากขึ้น)
 */
function bottle(cx, cy, CM) {
  const w = 6.5 * CM; // ตัวขวด
  const capW = 3.0 * CM;
  const neckW = 2.6 * CM;
  const top = cy - (22 * CM) / 2;
  const y = (cmFromTop) => top + cmFromTop * CM; // วัดจากยอดฝาลงมาเป็น ซม.
  const r = 0.55 * CM; // มุมฐานขวด
  const outline = `M ${cx - capW / 2} ${y(1.6)}
    L ${cx - capW / 2} ${y(0.45)} Q ${cx - capW / 2} ${top} ${cx - capW / 2 + 0.45 * CM} ${top}
    L ${cx + capW / 2 - 0.45 * CM} ${top} Q ${cx + capW / 2} ${top} ${cx + capW / 2} ${y(0.45)}
    L ${cx + capW / 2} ${y(1.6)}
    L ${cx + neckW / 2} ${y(1.6)}
    L ${cx + neckW / 2} ${y(3.7)}
    C ${cx + neckW / 2} ${y(4.9)} ${cx + w / 2} ${y(4.6)} ${cx + w / 2} ${y(6.2)}
    L ${cx + w / 2} ${y(22) - r} Q ${cx + w / 2} ${y(22)} ${cx + w / 2 - r} ${y(22)}
    L ${cx - w / 2 + r} ${y(22)} Q ${cx - w / 2} ${y(22)} ${cx - w / 2} ${y(22) - r}
    L ${cx - w / 2} ${y(6.2)}
    C ${cx - w / 2} ${y(4.6)} ${cx - neckW / 2} ${y(4.9)} ${cx - neckW / 2} ${y(3.7)}
    L ${cx - neckW / 2} ${y(1.6)} Z`;
  /** เส้นแนวนอนพาดขวด — width = ความกว้างของช่วงนั้น (คอขวดแคบกว่าตัวขวด) */
  const hline = (cmY, width = w, inset = 0) =>
    `<line x1="${cx - width / 2 + inset}" y1="${y(cmY)}" x2="${cx + width / 2 - inset}" y2="${y(cmY)}"/>`;
  return `<g opacity="0.55">
    <path d="${outline}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2" stroke-linejoin="round"/>
    <!-- ฉลากรอบขวด + ร่องจับ (เส้นบาง ๆ พอให้อ่านออกว่าเป็นขวดน้ำ ไม่แย่งสายตาจากตัวงาน) -->
    <rect x="${cx - w / 2}" y="${y(9.4)}" width="${w}" height="${6.4 * CM}" fill="#94a3b8" opacity="0.28"/>
    <g stroke="#94a3b8" stroke-width="${Math.max(1.2, CM * 0.11)}" fill="none" opacity="0.8">
      ${hline(2.15, neckW)}
      ${hline(9.4)}${hline(15.8)}
      ${hline(18.6, w, 0.45 * CM)}${hline(19.7, w, 0.45 * CM)}
    </g>
  </g>
  <text x="${cx}" y="${top - 16}" font-family="${TH}" font-size="20" font-weight="600" text-anchor="middle" fill="${SUB}">ขวดน้ำ 22 ซม.</text>`;
}

/**
 * ป้ายเลขขนาด — ต้องตกในกรอบครอปกลาง 300–600 ทั้งใบ ไม่งั้นย่อแล้วทุกตัวเลือกหน้าตาเหมือนกัน
 * เลขตัวใหญ่ + "ซม." ตัวเล็ก เพื่อให้ป้ายแคบพอ (≤ 276 px) ไม่ล้นกรอบครอปด้านข้าง
 */
const BADGE_H = 78;
const bigBadge = (y, n) => {
  const num = `${n}×${n}`;
  const bw = Math.min(num.length * 30 + 76, CROP_W);
  return `
  <rect x="${W / 2 - bw / 2}" y="${y - BADGE_H / 2}" width="${bw}" height="${BADGE_H}" rx="22" fill="#ffffff" opacity="0.95" stroke="#a5f3fc" stroke-width="3"/>
  <text x="${W / 2}" y="${y + 12}" font-family="${TH}" font-size="46" font-weight="800" text-anchor="middle" fill="${OK}">${num}<tspan font-size="22" font-weight="700" fill="${SUB}" dx="8">ซม.</tspan></text>`;
};

// ── การ์ดขนาดหนึ่งใบ ─────────────────────────────────────────────────
function sizeArt(p, n) {
  const px = n * p.cm;
  const half = px / 2;
  // ชิ้นงานอยู่กลางภาพเสมอ (x = 450) — ปุ่มตัวเลือกครอปกลาง ถ้าเลื่อนออกข้างลายจะโดนตัด
  // ขวดน้ำเทียบขนาดอยู่ตำแหน่งตายตัวฝั่งขวา (พ้นใบใหญ่สุดของชุดนั้น) = ไม้บรรทัดประจำการ์ด
  const refW = 6.5 * p.cm;
  // เว้น 44 px จากขอบกรอบใบใหญ่สุด — พอให้ป้าย "ขวดน้ำ 22 ซม." (กว้างกว่าตัวขวด) ไม่ทับเส้นประกรอบ
  const refX = W / 2 + (p.sizes.at(-1) * p.cm) / 2 + 44 + refW / 2;
  const badgeY = Math.min(CY + half + 56, 548);
  const dimX = Math.max(W / 2 - half - 30, 112);
  const body = `
  <rect x="${W / 2 - half}" y="${CY - half}" width="${px}" height="${px}" rx="10"
    fill="none" stroke="#a5f3fc" stroke-width="2.5" stroke-dasharray="12 9"/>
  ${doll(W / 2, CY, px, n, `s${p.id}${n}`, p.printed ? "print" : "stitch", badgeY - BADGE_H / 2 - 14)}
  ${bottle(refX, CY, p.cm)}
  ${dim(dimX, CY - half, dimX, CY + half, `${n} ซม.`)}
  ${bigBadge(badgeY, n)}`;
  const edge = EDGE[n];
  return card(p.title(n), p.subtitle, body,
    `ทุกภาพสเกลเดียวกัน เทียบขนาดข้ามตัวเลือกได้จริง · ขอบไดคัทขาวรอบตัว ~${edge} ซม.`,
    "ไดคัทตามทรงลาย · ใยยัดสังเคราะห์เกรด AA · ขนาดจริงคลาดเคลื่อนได้ ± 5-10 ซม.");
}

// ── การ์ด "สกรีน 1 / 2 ด้าน" ─────────────────────────────────────────
function sideArt(two) {
  const px = 290;
  const backMode = two ? "print" : "blank";
  const body = `
  ${doll(240, 420, px, 35, "sideFront", "print")}
  ${doll(660, 420, px, 35, two ? "sideBack" : "sideBlank", backMode)}
  <text x="240" y="${420 + px / 2 + 62}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
  <text x="240" y="${420 + px / 2 + 96}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลาย</text>
  <text x="660" y="${420 + px / 2 + 62}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหลัง</text>
  <text x="660" y="${420 + px / 2 + 96}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${two ? OK : SUB}">${two ? "พิมพ์ลาย" : "ผ้าเปล่า ไม่มีลาย"}</text>
  <circle cx="${W / 2}" cy="430" r="88" fill="#ffffff" opacity="0.96" stroke="${OK}" stroke-width="4"/>
  <text x="${W / 2}" y="422" font-family="${TH}" font-size="72" font-weight="800" text-anchor="middle" fill="${OK}">${two ? "2" : "1"}</text>
  <text x="${W / 2}" y="466" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${OK}">ด้าน</text>`;
  return card(
    two ? "สกรีน 2 ด้าน" : "สกรีน 1 ด้าน",
    two ? "พิมพ์ลายทั้งด้านหน้าและด้านหลัง" : "พิมพ์ลายด้านหน้า ด้านหลังเป็นผ้าเปล่า",
    body,
    two ? "บวกเพิ่มตามขนาด: 15-25 ซม. +20 บาท · 35-55 ซม. +50 บาท · 65-85 ซม. +80 บาท" : "ราคามาตรฐานตามตารางขนาด",
    "ลายหน้า-หลังใช้คนละลายได้ · แจ้งไฟล์ทั้งสองด้านตอนสั่ง");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
/** งานหนึ่ง = ภาพหนึ่งใบ ผูกกับ (สินค้า, กลุ่ม, ชื่อตัวเลือกปลายทาง) */
const SIDE_GROUP = "พิมพ์ลาย";
const SIZE_GROUP = "ขนาด";
const RENAME = { "1 ด้าน": "สกรีน 1 ด้าน", "2 ด้าน": "สกรีน 2 ด้าน" };

const JOBS = [
  ...["embroidery", "screen"].flatMap((k) =>
    PRODUCTS[k].sizes.map((n) => ({
      pid: PID, group: SIZE_GROUP, choice: PRODUCTS[k].choiceOf(n),
      file: `${PRODUCTS[k].filePrefix}-${n}-${VER}.jpg`, svg: sizeArt(PRODUCTS[k], n),
    }))
  ),
  { pid: PID, group: SIDE_GROUP, choice: RENAME["1 ด้าน"], file: `screen-1side-${VER}.jpg`, svg: sideArt(false) },
  { pid: PID, group: SIDE_GROUP, choice: RENAME["2 ด้าน"], file: `screen-2side-${VER}.jpg`, svg: sideArt(true) },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  mkdirSync(`${OUT}/${j.pid}`, { recursive: true });
  writeFileSync(`${OUT}/${j.pid}/${j.file}`, j.buf);
  // ครอปกลาง 300–600 ไว้ตรวจว่า "ตัวที่ทำให้ต่างกัน" ยังอยู่ในกรอบปุ่มตัวเลือก 62×62
  await sharp(j.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).jpeg({ quality: 88 })
    .toFile(`${OUT}/${j.pid}/thumb-${j.file}`);
  console.log(`🖼  ${j.pid}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
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
  const key = `products/${j.pid}/${j.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์`);

/** ย้ายคีย์ cells ตาม "ตำแหน่งแกน" — คีย์คือชื่อตัวเลือกของแต่ละแกนต่อกันด้วย │ */
function renameAxis(pricing, axisLabel, map) {
  if (!pricing?.cells) return 0;
  const axis = (pricing.driverLabels ?? []).indexOf(axisLabel);
  if (axis < 0) throw new Error(`ตาราง (${pricing.unit}) ไม่มีแกน "${axisLabel}" — driverLabels = ${JSON.stringify(pricing.driverLabels)}`);
  let moved = 0;
  const next = {};
  for (const [key, val] of Object.entries(pricing.cells)) {
    const parts = key.split("│");
    if (parts.length !== (pricing.driverLabels ?? []).length) throw new Error(`คีย์ "${key}" ไม่ตรงจำนวนแกน`);
    if (map[parts[axis]]) { parts[axis] = map[parts[axis]]; moved++; }
    const nk = parts.join("│");
    if (next[nk]) throw new Error(`คีย์ชนกันหลังเปลี่ยนชื่อ: ${nk}`);
    next[nk] = val;
  }
  pricing.cells = next;
  return moved;
}

// ── เขียน DB ทีละสินค้า ──────────────────────────────────────────────
for (const pid of [...new Set(JOBS.map((j) => j.pid))]) {
  const mine = JOBS.filter((j) => j.pid === pid);
  const { data: row, error } = await sb.from("products").select("data").eq("id", pid).single();
  if (error) { console.error(pid, error); process.exit(1); }
  const data = row.data;
  const data0 = JSON.parse(JSON.stringify(data)); // ของเดิมไว้เทียบตอนอ่านกลับ
  // เขียนตรงไม่ผ่าน API = ไม่มี product_revisions — ดัมป์ของเดิมกันเหนียวก่อนเสมอ
  writeFileSync(`${OUT}/../before-${pid}-${Date.now()}.json`, JSON.stringify(data, null, 1));

  // 1) เปลี่ยนชื่อตัวเลือกแกน "พิมพ์ลาย" (เฉพาะงานสกรีน) — ตัวเลือก + ทุกตารางราคา
  {
    const g = (data.options ?? []).find((o) => o.label === SIDE_GROUP);
    if (!g) { console.error(`${pid}: ไม่เจอกลุ่ม "${SIDE_GROUP}"`); process.exit(1); }
    for (const c of g.choices ?? []) if (RENAME[c.name]) c.name = RENAME[c.name];
    // เรทงานปักไม่มีแกน "พิมพ์ลาย" ในตาราง — ข้ามไป (ไม่ใช่ความผิดพลาด)
    const tables = [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)]
      .filter((t) => t?.cells && (t.driverLabels ?? []).includes(SIDE_GROUP));
    const moved = tables.map((t) => renameAxis(t, SIDE_GROUP, RENAME));
    const total = moved.reduce((a, b) => a + b, 0);
    console.log(total
      ? `${pid}: เปลี่ยนชื่อ "1/2 ด้าน" → "สกรีน 1/2 ด้าน" · ย้ายคีย์ ${moved.join("+")} ช่อง จาก ${tables.length} ตาราง`
      : `${pid}: ชื่อเป็น "สกรีน 1/2 ด้าน" อยู่แล้ว — ไม่มีคีย์ต้องย้าย (รันซ้ำ/แก้จากหลังบ้านมาก่อน)`);
  }

  // 2) เติม imageSrc — ชื่อตัวเลือกที่เหลือเป็นคีย์แกนราคา ห้ามแตะ
  for (const j of mine) {
    const g = (data.options ?? []).find((o) => o.label === j.group);
    if (!g) { console.error(`${pid}: ไม่เจอกลุ่ม "${j.group}"`); process.exit(1); }
    const c = (g.choices ?? []).find((c) => c.name === j.choice);
    if (!c) { console.error(`${pid}: ไม่เจอตัวเลือก "${j.group}: ${j.choice}"`); process.exit(1); }
    c.imageSrc = j.url;
  }

  data.savedAt = new Date().toISOString(); // ต้องเป็น ISO string — ตัวตัดแคชรูป ?v=savedAt
  const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", pid).select("id");
  if (updErr || !upd?.length) { console.error(`${pid}: update พัง/0 แถว`, updErr); process.exit(1); }

  // ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──
  const { data: back } = await sb.from("products").select("data").eq("id", pid).single();
  const b = back.data;
  for (const j of mine) {
    const got = b.options.find((o) => o.label === j.group)?.choices?.find((c) => c.name === j.choice)?.imageSrc;
    if (got !== j.url) { console.error("อ่านกลับไม่ตรง!", pid, j.choice, got); process.exit(1); }
  }
  /**
   * ทุกคีย์ราคาต้องประกอบจาก "ชื่อตัวเลือกที่มีอยู่จริง" และจำนวนช่องต้องเท่าเดิมเป๊ะ
   * ⚠️ กางคอมบิเนชันจากตัวเลือกทั้งกลุ่มไม่ได้แล้ว — หน้ารวมมีกลุ่ม "ขนาด" กลุ่มเดียว 11 ตัวเลือก
   *    แต่ละเรทขายคนละชุด (งานสกรีน 8 · งานปัก 3) ตารางจึงมีเฉพาะชุดของตัวเอง = ถูกต้องแล้ว
   */
  const tablesBefore = [data0.pricing, ...(data0.priceRates ?? []).map((r) => r.pricing)].filter((t) => t?.cells);
  const tablesAfter = [b.pricing, ...(b.priceRates ?? []).map((r) => r.pricing)].filter((t) => t?.cells);
  if (tablesAfter.length !== tablesBefore.length) { console.error(`${pid}: จำนวนตารางราคาเปลี่ยน`); process.exit(1); }
  tablesAfter.forEach((table, ti) => {
    const keys = Object.keys(table.cells);
    if (keys.length !== Object.keys(tablesBefore[ti].cells).length) {
      console.error(`${pid}: จำนวนช่องราคาในตารางที่ ${ti + 1} เปลี่ยน — มีคีย์ค้างชื่อเก่า`);
      process.exit(1);
    }
    for (const key of keys) {
      const parts = key.split("│");
      (table.driverLabels ?? []).forEach((lab, i) => {
        const names = (b.options.find((o) => o.label === lab)?.choices ?? []).map((c) => c.name);
        if (!names.includes(parts[i])) { console.error(`${pid}: คีย์ราคา "${key}" อ้างตัวเลือก "${parts[i]}" ที่ไม่มีในกลุ่ม "${lab}"`); process.exit(1); }
      });
    }
  });
  console.log(`✓ ${pid}: imageSrc ${mine.length} ภาพ อ่านกลับตรง · ตารางราคาครบทุกช่อง · savedAt = ${b.savedAt}`);
}
