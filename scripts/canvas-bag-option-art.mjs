#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "กระเป๋าผ้าแคนวาส" (flex-print)
 *
 *   node scripts/canvas-bag-option-art.mjs            (วาดภาพลง .cache/canvas-bag/upload)
 *   node scripts/canvas-bag-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * ทำไมต้องวาดเอง: แกลเลอรีมีแต่ภาพถุงสำเร็จ 4 รูป ดูไม่ออกว่าซับลิเมชั่น/DTF/Flex ต่างกันตรงไหน
 * ไม่มีรูปเทียบขนาด 7 แบบ (ทรงแบน vs ทรงก้นกว้าง) และไม่มีรูป "ไม่เกิน A4 vs เต็มพื้นที่"
 * สไตล์การ์ดยึดตาม drawstring-bag-option-art.mjs
 *
 * ได้ 19 ไฟล์ (900x900 — แกลเลอรี/ปุ่มตัวเลือกครอปจัตุรัส):
 *   size-*        7 ขนาด — วาด "สเกลเดียวกันทุกใบ" + เงาใบใหญ่สุดไว้ข้างหลังให้เทียบได้จากรูปเดียว
 *   sys-*         3 ระบบพิมพ์ (ซับลิเมชั่น / DTF / Flex Print)
 *   flex-*        2 เนื้อ Flex (ด้าน / เงา)
 *   bag-*         3 สีกระเป๋า (ผ้าดิบ / ขาว / ดำ) — ใช้ซ้ำทั้งกลุ่มงานซับและกลุ่ม DTF/Flex
 *   side-*        2 พิมพ์กี่ด้าน — ใช้ซ้ำทั้ง 2 กลุ่ม (ชื่อกลุ่มซ้ำกัน คนละ showWhen)
 *   area-*        2 ขนาดลายพิมพ์ หน้า/หลัง (A4 เทียบพื้นที่เต็ม)
 *
 * ที่มาของตัวเลข: products.flex-print ใน DB (3 ก.ย. 69)
 *   ราคา/ใบ ช่วง 1-10 ใบ ตาม pricing.cells (ขนาด│พิมพ์ระบบ) · 2 ด้าน +20 (ซับ) / +25 (DTF·Flex)
 *   ลายใหญ่กว่า A4 +20 ต่อด้าน · สีที่เลือกได้ต่อขนาดมาจาก data.rules
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "flex-print";
const VER = "v1";
/** ภาพที่วาดใหม่ทีหลัง — ขึ้นรุ่นเฉพาะไฟล์นั้น ไม่ต้องอัปใหม่ทั้งชุด */
const VER_OF = { "sys-flex": "v2", "flex-matte": "v2", "flex-gloss": "v2" };
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/canvas-bag/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const GHOST = "#cbd5e1";

/** ผ้าแคนวาส 3 สีที่ร้านมี — front / ด้านข้าง(เข้มลง) / ปากถุงด้านใน(เข้มสุด) / เส้นขอบ */
const CLOTH = {
  natural: { fill: "#e9dcc0", side: "#dccaa6", inner: "#c3a97e", edge: "#b79f74", ink: INK, label: "สีผ้าดิบ" },
  white: { fill: "#fdfdfc", side: "#eef0f1", inner: "#d5dade", edge: "#c2c8cc", ink: INK, label: "สีขาว" },
  black: { fill: "#31363d", side: "#262a30", inner: "#13161a", edge: "#0d1013", ink: "#ffffff", label: "สีดำ" },
};

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

/** ป้ายชี้ชิ้นส่วน — เส้นบาง ๆ + ข้อความ */
const callout = (x1, y1, x2, y2, text, anchor = "start") => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="#94a3b8"/>
  <text x="${x2 + (anchor === "end" ? -8 : 8)}" y="${y2 + 6}" font-family="${TH}" font-size="20" text-anchor="${anchor}" fill="${SUB}">${text}</text>`;

// ── ทรงถุงหิ้วผ้าแคนวาส ────────────────────────────────────────────
/**
 * geometry ของถุง: หน้ากว้าง w ซม. สูง h ซม. ก้นกว้าง d ซม. (d=0 คือทรงแบน)
 * วาดแบบ "หน้าตรงเอียงนิด" — เห็นปากถุงกับด้านข้างพอให้รู้ว่าก้นกว้างแค่ไหน
 */
const geom = (w, h, d, { scale, baseY, cx = W / 2 } = {}) => {
  const bw = w * scale, bh = h * scale, dx = d * scale * 0.55, dy = d * scale * 0.38;
  const x = cx - (bw + dx) / 2;
  return { bw, bh, dx, dy, x, right: x + bw, yb: baseY, yt: baseY - bh, w, h, d, scale };
};

/** หูหิ้ว — โค้งขึ้นจากขอบปากถุง (สายผ้าเดียวกัน) */
const strap = (g, sk, { back = false } = {}) => {
  const ox = back ? g.dx : 0, oy = back ? -g.dy : -6;
  const rise = Math.max(34, g.bh * 0.3);
  const x1 = g.x + g.bw * 0.24 + ox, x2 = g.x + g.bw * 0.76 + ox, y = g.yt + 6 + oy;
  return `<path d="M${x1} ${y} C ${x1} ${y - rise} ${x2} ${y - rise} ${x2} ${y}"
    fill="none" stroke="${back ? sk.side : sk.edge}" stroke-width="${Math.max(7, g.bw * 0.034)}" stroke-linecap="round"/>`;
};

const tote = (g, sk, { clipId = "", dashed = false } = {}) => {
  if (dashed)
    return `
      ${g.d > 0 ? `<polygon points="${g.x},${g.yt} ${g.x + g.dx},${g.yt - g.dy} ${g.right + g.dx},${g.yt - g.dy} ${g.right},${g.yt}" fill="none" stroke="${GHOST}" stroke-width="3" stroke-dasharray="11 9"/>
      <polygon points="${g.right},${g.yt} ${g.right + g.dx},${g.yt - g.dy} ${g.right + g.dx},${g.yb - g.dy} ${g.right},${g.yb}" fill="none" stroke="${GHOST}" stroke-width="3" stroke-dasharray="11 9"/>` : ""}
      <rect x="${g.x}" y="${g.yt}" width="${g.bw}" height="${g.bh}" rx="6" fill="none" stroke="${GHOST}" stroke-width="3" stroke-dasharray="11 9"/>`;
  const box =
    g.d > 0
      ? `<polygon points="${g.x},${g.yt} ${g.x + g.dx},${g.yt - g.dy} ${g.right + g.dx},${g.yt - g.dy} ${g.right},${g.yt}" fill="${sk.inner}" stroke="${sk.edge}" stroke-width="3"/>
         <polygon points="${g.right},${g.yt} ${g.right + g.dx},${g.yt - g.dy} ${g.right + g.dx},${g.yb - g.dy} ${g.right},${g.yb}" fill="${sk.side}" stroke="${sk.edge}" stroke-width="3"/>`
      : "";
  return `
    <ellipse cx="${g.x + (g.bw + g.dx) / 2}" cy="${g.yb + 7}" rx="${(g.bw + g.dx) * 0.54}" ry="9" fill="#0f172a" opacity="0.07"/>
    ${strap(g, sk, { back: true })}
    ${box}
    ${clipId ? `<clipPath id="${clipId}"><rect x="${g.x}" y="${g.yt}" width="${g.bw}" height="${g.bh}" rx="6"/></clipPath>` : ""}
    <rect x="${g.x}" y="${g.yt}" width="${g.bw}" height="${g.bh}" rx="6" fill="${sk.fill}" stroke="${sk.edge}" stroke-width="3.5"/>
    <line x1="${g.x + 3}" y1="${g.yt + Math.max(9, g.bh * 0.045)}" x2="${g.right - 3}" y2="${g.yt + Math.max(9, g.bh * 0.045)}" stroke="${sk.edge}" stroke-width="2" opacity="0.7"/>
    ${strap(g, sk)}`;
};

/** ลายที่พิมพ์ — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) */
const artwork = (cx, cy, box, { opacity = 1, flat = "" } = {}) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"${flat ? ` filter="url(#${flat})"` : ""}/>`;
};

/**
 * ลายตัวอย่างงาน Flex — ไวนิลสีเดียวไดคัทตามลายแล้วรีด
 * ⚠️ เคยใช้เงามาสคอตแบนตัน (v1) ลูกค้าดูไม่ออกว่าเป็นรูปอะไร — เปลี่ยนเป็นตัวอักษร+หัวใจ
 *    ซึ่งเป็นงานที่ Flex ทำได้ดีจริง (สีเรียบ ขอบคม) และอ่านออกทันทีแม้ย่อเป็นรูปเล็ก
 */
const flexPrint = (cx, cy, w, fill, { shadow = true } = {}) => {
  const s = w / 420; // เว้นขอบผ้าซ้าย-ขวาให้ลายไม่ชนตะเข็บ
  const shapes = (f) => `
    <path transform="translate(${cx},${cy - 88 * s}) scale(${s})"
      d="M0 44 C -50 6 -76 -18 -58 -48 C -44 -71 -13 -67 0 -42 C 13 -67 44 -71 58 -48 C 76 -18 50 6 0 44 Z" fill="${f}"/>
    <text x="${cx}" y="${cy + 74 * s}" font-family="${TH}" font-size="${94 * s}" font-weight="800" text-anchor="middle" fill="${f}">iDucky</text>
    <rect x="${cx - 108 * s}" y="${cy + 100 * s}" width="${216 * s}" height="${12 * s}" rx="${6 * s}" fill="${f}"/>`;
  // แผ่นไวนิลหนากว่าหมึก — เงาบาง ๆ ใต้ลายบอกว่า "วางอยู่บนผ้า" ไม่ได้ซึมลงไป
  return `${shadow ? `<g transform="translate(3,4)" opacity="0.13">${shapes("#0f172a")}</g>` : ""}${shapes(fill)}`;
};

const FLEX_INK = "#0e7490";

/** เส้นบอกขนาดแนวนอน/แนวตั้ง */
const dimH = (x1, x2, y, text) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#94a3b8" stroke-width="2"/>
  <line x1="${x1}" y1="${y - 7}" x2="${x1}" y2="${y + 7}" stroke="#94a3b8" stroke-width="2"/>
  <line x1="${x2}" y1="${y - 7}" x2="${x2}" y2="${y + 7}" stroke="#94a3b8" stroke-width="2"/>
  <text x="${(x1 + x2) / 2}" y="${y + 30}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${SUB}">${text}</text>`;

const dimV = (y1, y2, x, text) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <line x1="${x - 7}" y1="${y1}" x2="${x + 7}" y2="${y1}" stroke="#94a3b8" stroke-width="2"/>
  <line x1="${x - 7}" y1="${y2}" x2="${x + 7}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <text x="${x - 12}" y="${(y1 + y2) / 2 + 8}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="end" fill="${SUB}">${text}</text>`;

// ── การ์ด "ขนาด" 7 ใบ — สเกลเดียวกันหมด + เงาใบใหญ่สุดไว้เทียบ ─────
const SIZE_SCALE = 9.6;
const SIZE_BASE = 706;
/** ใบใหญ่สุดในกลุ่ม (46x37x12) ใช้เป็นเงาอ้างอิงหลังทุกใบ */
const BIGGEST = { w: 46, h: 37, d: 12 };

const SIZES = [
  { key: "size-35x40", name: "35x40 cm", w: 35, h: 40, d: 0, sub: 190, dtf: 220,
    tag: "ทรงแบน ไม่มีก้น", colors: "งานซับ: ผ้าดิบ · DTF/Flex: ผ้าดิบ, ดำ" },
  { key: "size-35x40-pocket", name: "35x40 cm (มีกระเป๋าใบน้อยด้านใน+ กระดุมแม่เหล็กปิดกระเป๋า)", w: 35, h: 40, d: 0, sub: 240, dtf: 270,
    tag: "ทรงแบน + กระเป๋าเล็กด้านใน + กระดุมแม่เหล็ก", pocket: true, colors: "งานซับ: ผ้าดิบ · DTF/Flex: ผ้าดิบ" },
  { key: "size-27x22x8", name: "27x22x8cm", w: 27, h: 22, d: 8, sub: 190, dtf: 220,
    tag: "ใบเล็กสุด ทรงก้นกว้าง", colors: "งานซับ: ผ้าดิบ · DTF/Flex: ผ้าดิบ" },
  { key: "size-40x30x10", name: "40x30x10cm", w: 40, h: 30, d: 10, sub: 200, dtf: 230,
    tag: "ทรงนอน ก้นกว้าง 10 ซม.", colors: "งานซับ: ผ้าดิบ · DTF/Flex: ผ้าดิบ, ดำ" },
  { key: "size-45x35x15", name: "45x35x15cm", w: 45, h: 35, d: 15, sub: 210, dtf: 240,
    tag: "ก้นกว้างสุด 15 ซม. — ใส่ของหนา", colors: "งานซับ: ผ้าดิบ · DTF/Flex: ผ้าดิบ, ดำ" },
  { key: "size-35x40x10", name: "35x40x10cm", w: 35, h: 40, d: 10, sub: 220, dtf: 250,
    tag: "ทรงตั้ง ก้นกว้าง 10 ซม.", colors: "งานซับ: ผ้าดิบ · DTF/Flex: ผ้าดิบ, ดำ" },
  { key: "size-46x37x12", name: "46x37x12cm", w: 46, h: 37, d: 12, sub: 290, dtf: 320,
    tag: "ใบใหญ่สุด ก้นกว้าง 12 ซม.", colors: "งานซับ: ขาว · DTF/Flex: ขาว, ดำ" },
];

function sizeArt(s) {
  const opt = { scale: SIZE_SCALE, baseY: SIZE_BASE };
  const gh = geom(BIGGEST.w, BIGGEST.h, BIGGEST.d, opt);
  const g = geom(s.w, s.h, s.d, opt);
  const sk = CLOTH.natural;
  const big = s.w === BIGGEST.w && s.h === BIGGEST.h;
  const dims = `${s.w} × ${s.h}${s.d ? ` × ${s.d}` : ""} ซม.`;

  // กระเป๋าใบน้อยด้านใน + กระดุมแม่เหล็ก — วาดเป็นเส้นประ (อยู่ข้างใน มองจากนอกไม่เห็น)
  const pocket = s.pocket
    ? `<rect x="${g.x + g.bw * 0.2}" y="${g.yt + g.bh * 0.3}" width="${g.bw * 0.6}" height="${g.bh * 0.34}" rx="8"
         fill="none" stroke="${sk.edge}" stroke-width="2.5" stroke-dasharray="9 7"/>
       <text x="${g.x + g.bw * 0.5}" y="${g.yt + g.bh * 0.51}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">กระเป๋าใบน้อย</text>
       <circle cx="${g.x + g.bw * 0.5}" cy="${g.yt + 4}" r="11" fill="#94a3b8"/>
       <circle cx="${g.x + g.bw * 0.5}" cy="${g.yt + 4}" r="5" fill="#f8fafc"/>
       ${callout(g.x + g.bw * 0.5, g.yt + 4, W - 66, 224, "กระดุมแม่เหล็กปิดปากถุง", "end")}`
    : "";

  const body = `
    ${title(dims, s.tag)}
    ${big ? "" : `${tote(gh, sk, { dashed: true })}
      <text x="60" y="186" font-family="${TH}" font-size="19" fill="#94a3b8">เส้นประ = ใบใหญ่สุด 46 × 37 × 12 ซม.</text>`}
    ${tote(g, sk)}
    ${pocket}
    ${dimH(g.x, g.right, SIZE_BASE + 38, `${s.w} ซม.`)}
    ${dimV(g.yt, g.yb, g.x - 26, `${s.h} ซม.`)}
    ${s.d ? callout(g.right + g.dx / 2, g.yt - g.dy / 2, W - 66, 300, `ก้นกว้าง ${s.d} ซม.`, "end") : ""}
    ${foot([
      `ซับลิเมชั่น ฿${s.sub} · DTF/Flex ฿${s.dtf} ต่อใบ (1-10 ใบ) — ยิ่งสั่งมากยิ่งถูกลง`,
      s.colors,
    ])}`;
  return frame(body);
}

// ── การ์ด "พิมพ์ระบบ" 3 ใบ ─────────────────────────────────────────
const ONE = { scale: 10.4, baseY: 726 };

function sysArt(kind) {
  const sk = CLOTH.natural;
  const g = geom(35, 40, 10, ONE);
  const clip = "sysclip";
  const cy = g.yt + g.bh * 0.55;

  const inner =
    kind === "sub"
      ? // ซับลิเมชั่น: หมึกซึมเป็นเนื้อเดียวกับผ้า — ลายจางเต็มใบชนขอบได้
        (() => {
          const dots = [];
          for (let r = 0; r < 6; r++)
            for (let c = 0; c < 5; c++) {
              const px = g.x + g.bw * ((c + (r % 2 ? 0.5 : 0)) / 4.5);
              const py = g.yt + g.bh * ((r + 0.4) / 6);
              dots.push(
                r % 2 === c % 2
                  ? `<circle cx="${px}" cy="${py}" r="12" fill="#7dd3fc" opacity="0.5"/>`
                  : `<path d="M${px} ${py + 9} c -11 -10 -18 -18 -9 -25 c 6 -5 9 -1 9 2 c 0 -3 3 -7 9 -2 c 9 7 2 15 -9 25 z" fill="#f9a8d4" opacity="0.55"/>`
              );
            }
          return `<g clip-path="url(#${clip})">
            <rect x="${g.x}" y="${g.yt}" width="${g.bw}" height="${g.bh}" fill="#eaf6fd" opacity="0.75"/>
            ${dots.join("")}
            ${artwork(g.x + g.bw / 2, cy, g.bw * 0.56, { opacity: 0.9 })}
          </g>`;
        })()
      : kind === "dtf"
        ? // DTF: แผ่นฟิล์มไดคัทรอบลาย วางบนผิวผ้า — ขอบขาวคม + เงาบาง ๆ ให้ดู "นูนบนผ้า"
          (() => {
            const fw = g.bw * 0.62, fh = g.bw * 0.68;
            return `<g clip-path="url(#${clip})">
              <rect x="${g.x + g.bw / 2 - fw / 2 + 7}" y="${cy - fh / 2 + 9}" width="${fw}" height="${fh}" rx="26" fill="#000" opacity="0.08"/>
              <rect x="${g.x + g.bw / 2 - fw / 2}" y="${cy - fh / 2}" width="${fw}" height="${fh}" rx="26" fill="#ffffff" stroke="#e2e8f0" stroke-width="3"/>
              ${artwork(g.x + g.bw / 2, cy, g.bw * 0.55)}
            </g>`;
          })()
        : // Flex: ไวนิลสีเดียวไดคัทตามลายแล้วรีดติด — ไม่มีไล่เฉด ไม่มีขอบฟิล์มใส
          `<g clip-path="url(#${clip})">
            ${flexPrint(g.x + g.bw / 2, cy, g.bw, FLEX_INK)}
          </g>`;

  const head = {
    sub: ["งานซับลิเมชั่น", "หมึกซึมลงเนื้อผ้าด้วยความร้อน — พิมพ์เต็มใบชนขอบได้"],
    dtf: ["งาน DTF / DFT", "พิมพ์ลงฟิล์มแล้วรีดติดผิวผ้า — สีสด ขอบลายคมชัด"],
    flex: ["Flex Print", "ไวนิลสีเดียวไดคัทตามลายแล้วรีดติด — สีเรียบ ขอบคม"],
  }[kind];

  const tip = {
    sub: callout(g.x + g.bw * 0.86, g.yt + g.bh * 0.16, W - 60, 208, "ลายซึมเป็นเนื้อเดียวกับผ้า", "end"),
    dtf: callout(g.x + g.bw * 0.5 + g.bw * 0.3, cy - g.bw * 0.28, W - 60, 208, "ฟิล์มไดคัทตามลาย", "end"),
    flex: callout(g.x + g.bw * 0.78, cy + g.bw * 0.2, W - 60, 208, "ขอบตัดคมทุกเส้น สีเรียบสีเดียว", "end"),
  }[kind];

  const body = `
    ${title(...head)}
    ${tote(g, sk, { clipId: clip })}
    ${inner}
    ${tip}
    ${foot(
      kind === "sub"
        ? ["เริ่มต้น ฿190/ใบ (35×40 ซม. · 1-10 ใบ) — ถูกสุดในสามระบบ", "พิมพ์ได้เฉพาะผ้าสีอ่อน (ผ้าดิบ/ขาว) · สัมผัสเรียบ ลายไม่หนาตัว"]
        : kind === "dtf"
          ? ["เริ่มต้น ฿220/ใบ (35×40 ซม. · 1-10 ใบ)", "ได้ทุกสีผ้ารวมสีดำ · ลายไล่เฉด/ภาพถ่ายก็พิมพ์ได้"]
          : ["เริ่มต้น ฿220/ใบ (35×40 ซม. · 1-10 ใบ) · เลือกเนื้อ Flex ด้าน หรือ Flex เงา ต่อได้", "เหมาะกับตัวอักษร/โลโก้สีเรียบ — ลายไล่เฉดหรือภาพถ่ายให้ใช้ DTF แทน"]
    )}`;
  return frame(body);
}

// ── การ์ด "เนื้อ" Flex ด้าน / Flex เงา ─────────────────────────────
function flexArt(gloss) {
  const sk = CLOTH.natural;
  const g = geom(35, 40, 0, { scale: 10.4, baseY: 706 });
  const clip = "flexclip";
  const cy = g.yt + g.bh * 0.54;
  // เงาวาว: แถบขาวเฉียง "มาสก์ด้วยตัวลาย" — ที่มันวาวคือแผ่นไวนิล ไม่ใช่เนื้อผ้า
  const sheen = gloss
    ? `<g mask="url(#flexmask)">
         <path d="M${g.x + g.bw * 0.1} ${g.yb} L${g.x + g.bw * 0.36} ${g.yt} L${g.x + g.bw * 0.56} ${g.yt} L${g.x + g.bw * 0.3} ${g.yb} Z" fill="#ffffff" opacity="0.62"/>
         <path d="M${g.x + g.bw * 0.62} ${g.yb} L${g.x + g.bw * 0.88} ${g.yt} L${g.x + g.bw * 0.97} ${g.yt} L${g.x + g.bw * 0.71} ${g.yb} Z" fill="#ffffff" opacity="0.42"/>
       </g>`
    : "";
  const body = `
    <defs>
      <mask id="flexmask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
        <rect width="${W}" height="${H}" fill="#000000"/>
        ${flexPrint(g.x + g.bw / 2, cy, g.bw, "#ffffff", { shadow: false })}
      </mask>
    </defs>
    ${title(gloss ? "Flex เงา" : "Flex ด้าน", gloss ? "ผิวไวนิลมันวาว สะท้อนแสง สีดูจัดขึ้น" : "ผิวไวนิลด้าน ไม่สะท้อนแสง ดูเรียบเนียนไปกับผ้า")}
    ${tote(g, sk, { clipId: clip })}
    <g clip-path="url(#${clip})">${flexPrint(g.x + g.bw / 2, cy, g.bw, FLEX_INK)}</g>
    ${sheen}
    ${callout(g.x + g.bw * 0.74, cy - g.bw * 0.2, W - 60, 214, gloss ? "แสงสะท้อนเป็นแถบบนตัวลาย" : "ไม่มีแสงสะท้อนบนตัวลาย", "end")}
    ${foot([
      "ราคาเท่ากันทั้งสองเนื้อ — เลือกตามงานที่ต้องการ",
      gloss ? "เหมาะกับลายสีสด ๆ อยากให้เด่นสะดุดตา" : "เหมาะกับลายโทนมินิมอล อยากให้กลืนไปกับเนื้อผ้า",
    ])}`;
  return frame(body);
}

// ── การ์ด "สีกระเป๋า" 3 ใบ ─────────────────────────────────────────
function colorArt(tone) {
  const sk = CLOTH[tone];
  const g = geom(35, 40, 10, { scale: 10.4, baseY: 706 });
  const clip = "colclip";
  const cy = g.yt + g.bh * 0.54;
  const head = {
    natural: ["สีผ้าดิบ", "ผ้าแคนวาสสีธรรมชาติ โทนครีมอมน้ำตาล"],
    white: ["สีขาว", "ผ้าแคนวาสฟอกขาว — ลายสีสดที่สุดในสามสี"],
    black: ["สีดำ", "ผ้าแคนวาสสีดำ — ลายสว่างตัดกับพื้นชัด"],
  }[tone];
  const body = `
    ${title(...head)}
    ${tote(g, sk, { clipId: clip })}
    <g clip-path="url(#${clip})">${artwork(g.x + g.bw / 2, cy, g.bw * 0.58)}</g>
    ${foot(
      tone === "natural"
        ? ["มีเกือบทุกขนาด — ทั้งงานซับลิเมชั่นและ DTF/Flex", "สีจริงของผ้าดิบอาจต่างกันเล็กน้อยในแต่ละล็อตผ้า"]
        : tone === "white"
          ? ["มีเฉพาะขนาด 46×37×12 ซม.", "งานซับลิเมชั่นและ DTF/Flex พิมพ์ได้ทั้งคู่"]
          : ["มีเฉพาะงาน DTF/DFT และ Flex Print", "ซับลิเมชั่นพิมพ์บนผ้าสีเข้มไม่ได้ (หมึกไม่ขึ้นสี)"]
    )}`;
  return frame(body);
}

// ── การ์ด "พิมพ์กี่ด้าน" — วางด้านหน้า/ด้านหลังคู่กัน ───────────────
function sideArt(sides) {
  const two = sides === 2;
  const sk = CLOTH.natural;
  const opt = { scale: 9.5, baseY: 664 };
  const left = geom(26, 36, 0, { ...opt, cx: W / 2 - 145 });
  const right = geom(26, 36, 0, { ...opt, cx: W / 2 + 145 });

  const panel = (g, label, printed, clipId) => `
    ${tote(g, sk, { clipId })}
    ${printed ? `<g clip-path="url(#${clipId})">${artwork(g.x + g.bw / 2, g.yt + g.bh * 0.54, g.bw * 0.6)}</g>` : ""}
    ${!printed ? `<text x="${g.x + g.bw / 2}" y="${g.yt + g.bh * 0.56}" font-family="${TH}" font-size="22" text-anchor="middle" fill="#94a3b8">ผ้าพื้น ไม่พิมพ์ลาย</text>` : ""}
    <text x="${g.x + g.bw / 2}" y="${g.yb + 48}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;

  const body = `
    ${title(two ? "พิมพ์ 2 ด้าน" : "พิมพ์ 1 ด้าน", two ? "มีลายทั้งด้านหน้าและด้านหลัง" : "มีลายด้านหน้า · ด้านหลังเป็นผ้าพื้น")}
    ${panel(left, "ด้านหน้า", true, "sideL")}
    ${panel(right, "ด้านหลัง", two, "sideR")}
    ${foot(
      two
        ? ["คิดเพิ่ม +฿20/ใบ (ซับลิเมชั่น) · +฿25/ใบ (DTF/Flex)", "เลือกขนาดลายของด้านหลังเพิ่มได้ในกลุ่ม “ขนาดลายพิมพ์”"]
        : ["ราคาปกติตามตารางราคา ไม่มีค่าเพิ่ม", "ด้านหลังเป็นเนื้อผ้าพื้นตามสีกระเป๋าที่เลือก"]
    )}`;
  return frame(body);
}

// ── การ์ด "ขนาดลายพิมพ์" — A4 เทียบพื้นที่เต็ม ─────────────────────
function areaArt(back) {
  const sk = CLOTH.natural;
  const scale = 10.4;
  const g = geom(35, 40, 0, { scale, baseY: 716 });
  // พื้นที่พิมพ์เต็ม = เว้นตะเข็บรอบใบ · A4 = 21 x 29.7 ซม. ที่สเกลเดียวกัน
  const fx = g.x + g.bw * 0.08, fy = g.yt + g.bh * 0.1, fw = g.bw * 0.84, fh = g.bh * 0.8;
  const aw = 21 * scale, ah = 29.7 * scale;
  const ax = g.x + (g.bw - aw) / 2, ay = fy + (fh - ah) / 2;
  const body = `
    ${title(back ? "(หลัง) ใหญ่กว่า A4" : "(หน้า) ใหญ่กว่า A4", "พิมพ์เต็มพื้นที่ที่พิมพ์ได้ — ใหญ่กว่ากรอบ A4")}
    <text x="${W / 2}" y="176" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${back ? "#0891b2" : "#b45309"}">${back ? "ด้านหลังของกระเป๋า" : "ด้านหน้าของกระเป๋า"}</text>
    ${tote(g, sk)}
    <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="10" fill="#fbbf24" opacity="0.3" stroke="#f59e0b" stroke-width="3"/>
    <rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="4" fill="#ffffff" opacity="0.75" stroke="#64748b" stroke-width="3" stroke-dasharray="10 8"/>
    <text x="${ax + aw / 2}" y="${ay + ah / 2 + 10}" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${SUB}">A4</text>
    <text x="${ax + aw / 2}" y="${ay + ah / 2 + 40}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">21 × 29.7 ซม.</text>
    ${callout(fx + fw - 6, fy + 12, W - 58, 232, "เต็มพื้นที่ที่พิมพ์ได้", "end")}
    ${foot([
      "คิดเพิ่ม +฿20 ต่อใบ ต่อด้าน",
      back ? "ติ๊กช่องนี้ได้เมื่อเลือก “พิมพ์ 2 ด้าน” · ไม่ติ๊ก = ลายไม่เกิน A4" : "ไม่ติ๊ก = ลายไม่เกิน A4 (ไม่มีค่าเพิ่ม)",
    ])}`;
  return frame(body);
}

// ── รายการภาพ + ตัวเลือกปลายทาง ────────────────────────────────────
const ART = {
  ...Object.fromEntries(
    SIZES.map((s) => [s.key, { svg: sizeArt(s), targets: [["ขนาด", s.name]], note: `ขนาด ${s.w}×${s.h}${s.d ? `×${s.d}` : ""}` }])
  ),
  "sys-sub": { svg: sysArt("sub"), targets: [["พิมพ์ระบบ", "ซับลิเมชั่น"]], note: "ระบบพิมพ์ — ซับลิเมชั่น" },
  "sys-dtf": { svg: sysArt("dtf"), targets: [["พิมพ์ระบบ", "DTF / DFT"]], note: "ระบบพิมพ์ — DTF/DFT" },
  "sys-flex": { svg: sysArt("flex"), targets: [["พิมพ์ระบบ", "Flex Print"]], note: "ระบบพิมพ์ — Flex Print" },
  "flex-matte": { svg: flexArt(false), targets: [["เนื้อ", "Flex ด้าน"]], note: "เนื้อ — Flex ด้าน" },
  "flex-gloss": { svg: flexArt(true), targets: [["เนื้อ", "Flex เงา"]], note: "เนื้อ — Flex เงา" },
  "bag-natural": { svg: colorArt("natural"), targets: [["สีกระเป๋างานซับ", "สีผ้าดิบ"], ["สีกระเป๋างาน DTF / Flex", "สีผ้าดิบ"]], note: "สีผ้าดิบ" },
  "bag-white": { svg: colorArt("white"), targets: [["สีกระเป๋างานซับ", "สีขาว"], ["สีกระเป๋างาน DTF / Flex", "สีขาว"]], note: "สีขาว" },
  "bag-black": { svg: colorArt("black"), targets: [["สีกระเป๋างาน DTF / Flex", "สีดำ"]], note: "สีดำ" },
  "side-1": { svg: sideArt(1), targets: [["พิมพ์กี่ด้าน", "1 ด้าน"]], note: "1 ด้าน (ใช้ทั้ง 2 กลุ่ม)" },
  "side-2": { svg: sideArt(2), targets: [["พิมพ์กี่ด้าน", "2 ด้าน"]], note: "2 ด้าน (ใช้ทั้ง 2 กลุ่ม)" },
  "area-front": { svg: areaArt(false), targets: [["ขนาดลายพิมพ์", "(หน้า) ใหญ่กว่า A4 (เต็มพื้นที่ที่สามารถพิมพ์ได้)"]], note: "ลายหน้าใหญ่กว่า A4" },
  "area-back": { svg: areaArt(true), targets: [["ขนาดลายพิมพ์", "(หลัง) ใหญ่กว่า A4 (เต็มพื้นที่ที่สามารถพิมพ์ได้)"]], note: "ลายหลังใหญ่กว่า A4" },
};

const files = [];
for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${name}-${VER_OF[name] ?? VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log(`\n(${files.length} ภาพ · ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)`); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc (แบบ drawstring-bag-option-art.mjs) ──
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
let hits = 0;
for (const f of files) {
  for (const [group, choice] of f.targets) {
    // ⚠️ "พิมพ์กี่ด้าน" มี 2 กลุ่มชื่อเดียวกัน (คนละ showWhen) — ต้องวนทุกกลุ่มที่ชื่อตรง ไม่ใช่ find ตัวแรก
    const grps = (data.options ?? []).filter((o) => o.label === group);
    if (!grps.length) { console.error(`ไม่เจอกลุ่ม "${group}"`); process.exit(1); }
    let set = 0;
    for (const grp of grps) {
      const c = grp.choices?.find((c) => c.name === choice);
      if (c) { c.imageSrc = f.url; set++; hits++; }
    }
    if (!set) { console.error(`ไม่เจอตัวเลือก "${choice}" ในกลุ่ม "${group}"`); process.exit(1); }
  }
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
let checked = 0;
for (const f of files) {
  for (const [group, choice] of f.targets) {
    for (const grp of back.data.options.filter((o) => o.label === group)) {
      const c = grp.choices?.find((c) => c.name === choice);
      if (!c) continue;
      if (c.imageSrc !== f.url) { console.error("อ่านกลับไม่ตรง!", group, choice, c.imageSrc); process.exit(1); }
      checked++;
    }
  }
}
if (checked !== hits) { console.error(`อ่านกลับได้ ${checked} จุด แต่เขียนไป ${hits} จุด`); process.exit(1); }
console.log(`✓ ตั้ง imageSrc ครบ ${checked} จุด (${files.length} ภาพ) อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
