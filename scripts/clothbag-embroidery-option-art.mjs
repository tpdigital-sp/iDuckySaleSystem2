#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "กระเป๋าผ้าแคนวาส งานปัก" (clothbag-4)
 *
 *   node scripts/clothbag-embroidery-option-art.mjs            (วาดภาพลง .cache/clothbag-4/upload)
 *   node scripts/clothbag-embroidery-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * ทำไมต้องวาดเอง: แกลเลอรี 4 รูปเป็นภาพซูมงานปักจริง ไม่มีรูปเทียบ "ขนาดกระเป๋า 7 แบบ"
 * (ลูกค้าอ่าน 27x22x8 กับ 46x37x12 แล้วนึกไม่ออกว่าต่างกันแค่ไหน) และไม่มีรูปเทียบขนาดลายปัก
 * สไตล์การ์ดยึดตาม pet-shirt-size-art.mjs / drawstring-bag-option-art.mjs
 *
 * ได้ 14 ไฟล์ (900x900 — แกลเลอรี/ปุ่มตัวเลือกครอปจัตุรัส):
 *   bag-*.jpg     7 ขนาดกระเป๋า — วาดด้วย "สเกลเดียวกันทุกใบ" (9 px ต่อ 1 ซม.) เทียบข้ามการ์ดได้จริง
 *                 + กรอบ A4 ประ ๆ ในใบ บอกว่าใส่ A4 ได้/ไม่ได้ (คำนวณจากตัวเลขขนาด ไม่ได้เดา)
 *   emb-*.jpg     5 ขนาดปัก — กรอบลายบนกระเป๋า 35x40 ใบเดียวกันทั้ง 5 ใบ ให้เห็นว่าลายโตขึ้นแค่ไหน
 *   color-*.jpg   2 สีผ้า — สีผ้าดิบ / สีดำ
 *
 * ที่มาของตัวเลข: products.clothbag-4 ใน DB (3 ก.ย. 69)
 *   ขนาดกระเป๋า 7 แบบ · ขนาดปัก 5 ช่วง extra 50/120/225/400/625 · terms คลาดเคลื่อน 2-5 ซม. · สีไหมเกิน 3 สี +10
 *   ตัวเลขทุกตัวบนภาพมาจากชื่อตัวเลือก/extra ใน DB ตรง ๆ — ไม่มีการแต่งตัวเลขเพิ่ม
 *   ทุกใบติดป้าย "ภาพจำลอง (MOCKUP)" เพราะเป็นภาพวาด ไม่ใช่รูปถ่ายสินค้าจริง
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "clothbag-4";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/clothbag-4/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#173a6b";
const SUB = "#64748b";
const SKY = "#2c81c4";
const YOLK = "#ffd447";

/** สเกลกลาง: 9 px ต่อ 1 ซม. — ใบใหญ่สุด 46x37 + ก้น 12 ยังอยู่ในกรอบพอดี */
const PX = 9;
/** ก้นกระเป๋าวาดเป็นมุมมอง 3/4 — ก้น 1 ซม. = เยื้องขวา 0.6 px·ซม. ขึ้นบน 0.35 */
const DEPTH_X = 0.6;
const DEPTH_Y = 0.35;
const BASE = 690; // เส้นก้นกระเป๋า — ทุกการ์ดใช้เส้นเดียวกัน เทียบความสูงด้วยตาได้

const CLOTH = { face: "#efe0c0", side: "#e3d1a9", top: "#d8c396", edge: "#c1a875" };
const BLACK = { face: "#2f2f34", side: "#26262b", top: "#1c1c20", edge: "#111114" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2faff"/><stop offset="1" stop-color="#fffbf2"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="852" cy="862" r="104" fill="#e2f3fe" opacity="0.75"/>
  <circle cx="52" cy="866" r="82" fill="#a9e5d2" opacity="0.3"/>
  ${body}
  <rect x="638" y="24" width="238" height="32" rx="16" fill="${YOLK}"/>
  <text x="757" y="46" text-anchor="middle" font-family="${TH}" font-size="17" font-weight="700" fill="${INK}">ภาพจำลอง (MOCKUP)</text>
</svg>`;

const title = (t, sub) => `
  <text x="46" y="94" font-family="${TH}" font-size="44" font-weight="700" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="46" y="134" font-family="${TH}" font-size="24" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 46 - (a.length - 1 - i) * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(t)}</text>`
    )
    .join("");

/** ป้ายชี้ชิ้นส่วน — เส้นบาง ๆ + ข้อความ */
const callout = (x1, y1, x2, y2, text, anchor = "start") => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="#94a3b8"/>
  <text x="${x2 + (anchor === "end" ? -10 : 10)}" y="${y2 + 7}" font-family="${TH}" font-size="21" text-anchor="${anchor}" fill="${SUB}">${esc(text)}</text>`;

/** ลูกศรวัดขนาด (แนวนอน/แนวตั้ง) พร้อมป้ายตัวเลข */
const dimH = (x1, x2, y, label, above = false) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${SKY}" stroke-width="3"/>
  <path d="M${x1 + 13} ${y - 8} L${x1} ${y} L${x1 + 13} ${y + 8} Z" fill="${SKY}"/>
  <path d="M${x2 - 13} ${y - 8} L${x2} ${y} L${x2 - 13} ${y + 8} Z" fill="${SKY}"/>
  <text x="${(x1 + x2) / 2}" y="${y + (above ? -18 : 36)}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${esc(label)}</text>`;

const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SKY}" stroke-width="3"/>
  <path d="M${x - 8} ${y1 + 13} L${x} ${y1} L${x + 8} ${y1 + 13} Z" fill="${SKY}"/>
  <path d="M${x - 8} ${y2 - 13} L${x} ${y2} L${x + 8} ${y2 - 13} Z" fill="${SKY}"/>
  <text x="${x - 14}" y="${(y1 + y2) / 2 + 8}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${INK}">${esc(label)}</text>`;

/** ลายปัก — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) */
const artwork = (cx, cy, box, opacity = 1) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/**
 * ทรงกระเป๋าผ้าแคนวาส มุมมอง 3/4: หน้ากระเป๋า + ก้น (ถ้ามี) + หูหิ้วคู่หน้า/หลัง
 * คืน geometry ให้วางลาย/ป้ายต่อได้
 */
const bagGeom = (wCm, hCm, gCm) => {
  const w = wCm * PX;
  const h = hCm * PX;
  const dx = gCm * PX * DEPTH_X;
  const dy = gCm * PX * DEPTH_Y;
  const x = W / 2 - (w + dx) / 2;
  return { x, w, h, dx, dy, top: BASE - h, bottom: BASE, cx: x + w / 2 };
};

const straps = (g, color, width, shiftX = 0, shiftY = 0) => {
  const arc = (a, b) => {
    const x1 = g.x + g.w * a + shiftX;
    const x2 = g.x + g.w * b + shiftX;
    const y = g.top + shiftY;
    return `<path d="M${x1} ${y} C ${x1} ${y - 104}, ${x2} ${y - 104}, ${x2} ${y}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  };
  return arc(0.2, 0.4) + arc(0.6, 0.8);
};

/** วาดตัวกระเป๋า — noStraps ไว้ให้การ์ดขนาดแทรกกรอบ A4 ก่อนแล้วค่อยวาดหูทับ (กรอบ A4 จะได้ไม่พาดหู) */
const bagShape = (g, c, { clipId = "", noStraps = false } = {}) => {
  const r = 10;
  const back = g.dx > 0 ? straps(g, c.top, 12, g.dx, -g.dy) : "";
  const body = g.dx > 0
    ? `<polygon points="${g.x},${g.top} ${g.x + g.dx},${g.top - g.dy} ${g.x + g.w + g.dx},${g.top - g.dy} ${g.x + g.w},${g.top}" fill="${c.top}" stroke="${c.edge}" stroke-width="3"/>
       <polygon points="${g.x + g.w},${g.top} ${g.x + g.w + g.dx},${g.top - g.dy} ${g.x + g.w + g.dx},${g.bottom - g.dy} ${g.x + g.w},${g.bottom}" fill="${c.side}" stroke="${c.edge}" stroke-width="3"/>`
    : "";
  return `
    ${clipId ? `<clipPath id="${clipId}"><rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" rx="${r}"/></clipPath>` : ""}
    ${back}
    ${body}
    <rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" rx="${r}" fill="${c.face}" stroke="${c.edge}" stroke-width="3.5"/>
    <line x1="${g.x + 8}" y1="${g.top + 14}" x2="${g.x + g.w - 8}" y2="${g.top + 14}" stroke="${c.edge}" stroke-width="2" opacity="0.55"/>
    ${noStraps ? "" : straps(g, c.edge, 13)}`;
};

// ── ภาพ "ขนาดกระเป๋า" ────────────────────────────────────────────────
const A4_W = 21;
const A4_H = 29.7;

function sizeArt(s) {
  const g = bagGeom(s.w, s.h, s.g);
  const fitsA4 = s.w >= A4_W && s.h >= A4_H;
  const a4x = g.x + (g.w - A4_W * PX) / 2;
  const a4b = g.bottom - 14;
  const a4y = a4b - A4_H * PX;
  const label = s.g ? `${s.w} × ${s.h} × ${s.g} ซม.` : `${s.w} × ${s.h} ซม.`;

  const body = `
    ${title(label, s.g ? `กว้าง × สูง × ก้น — ทรงมีก้น ตั้งทรงได้` : `กว้าง × สูง — ทรงแบน ไม่มีก้น`)}
    ${bagShape(g, CLOTH, { noStraps: true })}
    <!-- กรอบ A4 เทียบขนาด (21 × 29.7 ซม.) -->
    <rect x="${a4x}" y="${a4y}" width="${A4_W * PX}" height="${A4_H * PX}" rx="4"
      fill="#ffffff" fill-opacity="0.5" stroke="${fitsA4 ? SKY : "#ef7c4a"}" stroke-width="3" stroke-dasharray="10 8"/>
    <text x="${a4x + (A4_W * PX) / 2}" y="${Math.max(a4y + 26, g.top + 34)}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${fitsA4 ? SKY : "#d9622f"}">กระดาษ A4</text>
    ${straps(g, CLOTH.edge, 13)}
    ${s.pocket ? pocketMarks(g) : ""}
    ${s.g ? callout(g.x + g.w + g.dx * 0.5, g.bottom - g.dy - g.h * 0.3, 866, g.bottom - g.h * 0.55, `ก้นกว้าง ${s.g} ซม.`, "end") : ""}
    ${dimH(g.x, g.x + g.w, g.bottom + 44, `กว้าง ${s.w} ซม.`)}
    ${dimV(g.x - 42, g.top, g.bottom, `สูง ${s.h} ซม.`)}
    <rect x="46" y="160" width="${fitsA4 ? 250 : 286}" height="42" rx="21" fill="${fitsA4 ? "#e7f7ee" : "#fdeee4"}" stroke="${fitsA4 ? "#7cc7a2" : "#f0b48c"}" stroke-width="2"/>
    <text x="70" y="189" font-family="${TH}" font-size="21" font-weight="700" fill="${fitsA4 ? "#1c7a4c" : "#c25a25"}">${fitsA4 ? "✓ ใส่กระดาษ A4 ได้" : "✕ ใส่ A4 ไม่ได้ (เตี้ยกว่า A4)"}</text>
    ${foot([
      s.note || "ทุกใบวาดด้วยสเกลเดียวกัน — เทียบขนาดข้ามแบบได้เลย",
      "ขนาดจริงคลาดเคลื่อนได้ 2-5 ซม. ตามงานตัดเย็บ",
    ])}`;
  return frame(body);
}

/** ป้ายชี้ของแบบที่มีช่องในและกระดุมแม่เหล็ก */
const pocketMarks = (g) => {
  const pw = g.w * 0.52;
  const ph = g.h * 0.26;
  const px = g.cx - pw / 2;
  const py = g.top + g.h * 0.62;
  const mx = g.cx;
  const my = g.top + 30;
  return `
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="8" fill="#ffffff" fill-opacity="0.55" stroke="${CLOTH.edge}" stroke-width="3" stroke-dasharray="9 7"/>
    <text x="${g.cx}" y="${py + ph / 2 + 7}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#8a7546">ช่องใบน้อย</text>
    <circle cx="${mx}" cy="${my}" r="13" fill="#c9c2b4" stroke="#8a8377" stroke-width="3"/>
    <circle cx="${mx}" cy="${my}" r="5" fill="#8a8377"/>
    ${callout(mx + 14, my, 828, 250, "กระดุมแม่เหล็กปิดปากกระเป๋า", "end")}
    ${callout(px + pw, py + ph / 2, 828, 560, "กระเป๋าใบน้อยด้านใน", "end")}`;
};

// ── ภาพ "ขนาดปัก" — กระเป๋า 35x40 ใบเดียวกันทั้ง 5 ใบ ────────────────
/** วงแว่นขยายมุมล่างขวา — ลาย 5-10 ซม. บนกระเป๋าเล็กจนดูไม่ออกว่าลายเป็นอะไร */
const zoomInset = (e, cy) => {
  const cxz = 726;
  const cyz = 604;
  const r = 104;
  return `
    <line x1="${W / 2 + (e.cm * PX) / 2}" y1="${cy + (e.cm * PX) / 2}" x2="${cxz - r * 0.78}" y2="${cyz - r * 0.78}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 6"/>
    <circle cx="${cxz}" cy="${cyz}" r="${r}" fill="#ffffff" stroke="${SKY}" stroke-width="3"/>
    ${artwork(cxz, cyz, r * 1.5)}
    <text x="${cxz}" y="${cyz + r + 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ขยายให้ดูลาย</text>`;
};

function embArt(e) {
  const g = bagGeom(35, 40, 0);
  const side = e.cm * PX;
  const cy = g.top + g.h * 0.44;
  const fx = g.cx - side / 2;
  const fy = cy - side / 2;
  const body = `
    ${title(`ขนาดปัก ไม่เกิน ${e.cm} ซม.`, `คิดเพิ่ม +฿${e.extra} ต่อใบ`)}
    ${bagShape(g, CLOTH)}
    ${artwork(g.cx, cy, side * 0.92)}
    <rect x="${fx}" y="${fy}" width="${side}" height="${side}" rx="4" fill="none" stroke="${SKY}" stroke-width="3" stroke-dasharray="9 7"/>
    ${dimH(fx, fx + side, fy - 22, `${e.cm} ซม.`, true)}
    ${callout(fx + side, cy, 806, cy - 132, "ลายต้องอยู่ในกรอบนี้", "end")}
    ${e.cm <= 10 ? zoomInset(e, cy) : ""}
    ${dimH(g.x, g.x + g.w, g.bottom + 44, "กระเป๋า 35 ซม.")}
    ${foot([
      "เทียบบนกระเป๋า 35 × 40 ซม. เท่ากันทั้ง 5 ใบ — เห็นชัดว่าลายโตขึ้นแค่ไหน",
      "ปักสีไหมไม่เกิน 3 สี · เกินคิดเพิ่มสีละ ฿10 ต่อแบบ",
    ])}`;
  return frame(body);
}

// ── ภาพ "สีกระเป๋า" ──────────────────────────────────────────────────
function colorArt(c) {
  const g = bagGeom(35, 40, 0);
  const body = `
    ${title(c.title, c.sub)}
    ${bagShape(g, c.palette)}
    ${artwork(g.cx, g.top + g.h * 0.44, g.w * 0.46)}
    ${dimH(g.x, g.x + g.w, g.bottom + 44, "ตัวอย่างใบ 35 × 40 ซม.")}
    ${foot(["สีบนจอกับสีผ้าจริงอาจต่างกันเล็กน้อย", "ปักสีไหมไม่เกิน 3 สี · เกินคิดเพิ่มสีละ ฿10 ต่อแบบ"])}`;
  return frame(body);
}

// ── รายการภาพ: จับคู่กับ choice.name ใน DB ตรงตัว ───────────────────
const SIZES = [
  { file: "bag-35x40", name: "35x40cm", w: 35, h: 40, g: 0 },
  {
    file: "bag-35x40-pocket",
    name: "35x40cm (มีกระเป๋าใบน้อยด้านใน+ กระดุมแม่เหล็กปิดกระเป๋า)",
    w: 35, h: 40, g: 0, pocket: true,
    note: "ทรงเดียวกับ 35 × 40 ซม. แต่มีช่องใบน้อยด้านใน + กระดุมแม่เหล็ก",
  },
  { file: "bag-27x22x8", name: "27x22x8cm", w: 27, h: 22, g: 8 },
  { file: "bag-40x30x10", name: "40x30x10cm", w: 40, h: 30, g: 10 },
  { file: "bag-45x35x10", name: "45x35x10cm", w: 45, h: 35, g: 10 },
  { file: "bag-35x40x10", name: "35x40x10cm", w: 35, h: 40, g: 10 },
  { file: "bag-46x37x12", name: "46x37x12cm", w: 46, h: 37, g: 12 },
];

const EMB = [
  { file: "emb-05", name: "ไม่เกิน 5 ซม.", cm: 5, extra: 50 },
  { file: "emb-10", name: "ไม่เกิน 10 ซม.", cm: 10, extra: 120 },
  { file: "emb-15", name: "ไม่เกิน 15 ซม.", cm: 15, extra: 225 },
  { file: "emb-20", name: "ไม่เกิน 20 ซม.", cm: 20, extra: 400 },
  { file: "emb-25", name: "ไม่เกิน 25 ซม.", cm: 25, extra: 625 },
];

const COLORS = [
  { file: "color-natural", name: "สีผ้าดิบ", title: "สีผ้าดิบ", sub: "ผ้าแคนวาสเนื้อผ้าดิบ สีธรรมชาติ", palette: CLOTH },
  { file: "color-black", name: "สีดำ", title: "สีดำ", sub: "ผ้าแคนวาสสีดำ", palette: BLACK },
];

const ART = [
  ...SIZES.map((s) => ({ file: s.file, group: "ขนาดกระเป๋า", choice: s.name, svg: sizeArt(s), note: `ขนาด ${s.w}×${s.h}${s.g ? `×${s.g}` : ""}` })),
  ...EMB.map((e) => ({ file: e.file, group: "ขนาดปัก", choice: e.name, svg: embArt(e), note: `ปักไม่เกิน ${e.cm} ซม. (+฿${e.extra})` })),
  ...COLORS.map((c) => ({ file: c.file, group: "สีกระเป๋า", choice: c.name, svg: colorArt(c), note: c.title })),
];

const files = [];
for (const art of ART) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${art.file}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)");
  process.exit(0);
}

// ── อัปโหลด storage + ตั้ง choice.imageSrc ───────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
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
for (const f of files) {
  const grp = (data.options ?? []).find((o) => o.label === f.group);
  const c = grp?.choices?.find((c) => c.name === f.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`); process.exit(1); }
  c.imageSrc = f.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const f of files) {
  const got = back.data.options.find((o) => o.label === f.group)?.choices?.find((c) => c.name === f.choice)?.imageSrc;
  if (got !== f.url) { console.error("อ่านกลับไม่ตรง!", f.choice, got); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc ครบ ${files.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
