#!/usr/bin/env node
/**
 * เตรียมภาพของสินค้า "Rotating Stand" (สแตนดี้อะคริลิคหมุนได้)
 *
 *   node scripts/rotating-stand-art.mjs [--out=<dir>]
 *
 * ได้ 2 ชุด แล้วให้ scripts/add-rotating-stand.ts --upload อัปขึ้น Supabase Storage:
 *   1. gallery-1..8  ภาพงานจริงจากเว็บตารางราคา (iduckyofficial-pricelists.com/acrylicrotatingstand)
 *   2. ภาพประกอบตัวเลือก — วาดเองเป็น SVG แล้วเรนเดอร์ด้วย sharp ให้สไตล์เดียวกันทั้งชุด
 *      size-5..size-12    ขนาดตัวสแตนดี้ (เทียบสเกลจริง มีเส้นบอกขนาด + เงาตัว 12cm ไว้เทียบ)
 *      basesize-5..12     ขนาดฐาน (มองจากด้านบน เทียบกับฐานมาตรฐาน 5 ซม.)
 *      baseshape-round | square | diecut     ทรงฐาน
 *      basescreen-no | basescreen-yes        ฐานสกรีนลาย/ไม่สกรีน
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/rot/upload").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

/** ฐานอะคริลิค 5 มม. มองแบบเฉียง — คืนค่า path เป็นกลุ่ม <g> */
function baseSideView(cx, cy, rx, fill = "rgba(148,197,255,0.28)", edge = "#7dd3fc") {
  const ry = rx * 0.28;
  const th = 16; // ความหนา 5mm ตามสเกลภาพ
  return `
    <path d="M${cx - rx} ${cy} v${th} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${th} z" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${edge}" stroke-width="3"/>`;
}

/** แกนหมุน 13 มม. */
const pin = (cx, cy) => `
  <ellipse cx="${cx}" cy="${cy}" rx="26" ry="9" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${cy - 6}" rx="17" ry="7" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${cy - 10}" rx="9" ry="4" fill="#64748b"/>`;

/** เส้นบอกขนาดแนวตั้ง */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y1}" x2="${x + 12}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y2}" x2="${x + 12}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 22}" y="${(y1 + y2) / 2 + 10}" font-family="${TH}" font-size="30" font-weight="700" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวนอน */
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 44}" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** ลายสกรีนจำลองบนตัวสแตนดี้ (จุด + เส้นโค้ง) */
const artwork = (cx, cy, w, h) => `
  <g opacity="0.85">
    <circle cx="${cx}" cy="${cy - h * 0.1}" r="${Math.min(w, h) * 0.17}" fill="#fbbf24"/>
    <circle cx="${cx - Math.min(w, h) * 0.09}" cy="${cy - h * 0.14}" r="${Math.min(w, h) * 0.035}" fill="#0f172a"/>
    <circle cx="${cx + Math.min(w, h) * 0.09}" cy="${cy - h * 0.14}" r="${Math.min(w, h) * 0.035}" fill="#0f172a"/>
    <path d="M${cx - w * 0.22} ${cy + h * 0.2} q${w * 0.22} ${h * 0.14} ${w * 0.44} 0" stroke="#f472b6" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>`;

// ── 1. ขนาดตัวสแตนดี้ 5-12 ซม. (สเกลจริง เทียบกันได้ทั้งชุด) ──────────────
const PX_PER_CM = 33; // 12cm = 396px
const GROUND = 596; // ระดับผิวโต๊ะในภาพ

function standeeSize(cm) {
  const h = cm * PX_PER_CM;
  const w = h * 0.86;
  const cx = 300;
  const baseTop = GROUND - 34;
  const bodyBottom = baseTop - 12;
  const bodyTop = bodyBottom - h;
  const ghostH = 12 * PX_PER_CM;
  return frame(`
    ${title(`ตัวสแตนดี้ ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุดของตัวสแตนดี้")}
    <!-- เงาเทียบขนาดใหญ่สุด 12 ซม. -->
    <rect x="${cx - (ghostH * 0.86) / 2}" y="${bodyBottom - ghostH}" width="${ghostH * 0.86}" height="${ghostH}" rx="40"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>
    <rect x="${cx - w / 2}" y="${bodyTop}" width="${w}" height="${h}" rx="${Math.min(38, h * 0.16)}"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(cx, bodyTop + h * 0.45, w, h)}
    <rect x="${cx - 13}" y="${bodyBottom - 14}" width="26" height="18" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
    ${pin(cx, baseTop - 2)}
    ${baseSideView(cx, baseTop + 10, 118)}
    ${dimV(cx + (ghostH * 0.86) / 2 + 34, bodyTop, bodyBottom, `${cm} ซม.`)}
    <text x="${W / 2}" y="${H - 68}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">อะคริลิคหนา 3 มม. · สกรีน 2 ด้าน · ราคารวมฐานแล้ว</text>
    ${cm < 12 ? `<text x="${W / 2}" y="${H - 36}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${LINE}">เส้นประ = ขนาดใหญ่สุด 12 ซม. (ไว้เทียบขนาด)</text>` : ""}`);
}

// ── 2. ขนาดฐาน (มองจากด้านบน) ────────────────────────────────────────────
const BASE_PX_PER_CM = 39; // 12cm = 468px

function baseSize(cm, label, note) {
  const r = (cm * BASE_PX_PER_CM) / 2;
  const std = (5 * BASE_PX_PER_CM) / 2;
  const cx = 350;
  const cy = 370;
  return frame(`
    ${title(label, note)}
    ${cm > 5 ? `<circle cx="${cx}" cy="${cy}" r="${std}" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="8 8"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    <rect x="${cx - 60}" y="${cy - 7}" width="120" height="14" rx="7" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="17" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="7" fill="#64748b"/>
    ${dimH(cy + r + 46, cx - r, cx + r, `${cm} ซม.`)}
    ${cm > 5 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">เส้นประ = ฐานมาตรฐาน 5 ซม. · ส่วนที่เกินคิดเพิ่มตาม ซม.</text>` : `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ขนาดมาตรฐาน ไม่คิดเพิ่ม · ร่องเสียบตัวสแตนดี้ + แกนหมุน 13 มม.</text>`}`);
}

// ── 3. ทรงฐาน ───────────────────────────────────────────────────────────
const slot = (cx, cy) => `
  <rect x="${cx - 62}" y="${cy - 7}" width="124" height="14" rx="7" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="17" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="7" fill="#64748b"/>`;

/** ฐานทรงดอกไม้ (ตัวอย่างงานไดคัทตามทรง) — เส้นรอบรูปเส้นเดียว ไม่มีเส้นซ้อนกลางดอก */
function flowerPath(cx, cy, r) {
  const petals = 5;
  const step = (Math.PI * 2) / petals;
  const inner = r * 0.56;
  const at = (rad, ang) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
  let d = "";
  for (let i = 0; i < petals; i++) {
    const a = i * step - Math.PI / 2;
    const [sx, sy] = at(inner, a - step / 2);
    const [ex, ey] = at(inner, a + step / 2);
    const [c1x, c1y] = at(r * 1.22, a - step * 0.3);
    const [c2x, c2y] = at(r * 1.22, a + step * 0.3);
    d += `${i === 0 ? `M${sx.toFixed(1)} ${sy.toFixed(1)}` : ""} C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }
  return `<path d="${d} Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4" stroke-linejoin="round"/>`;
}

const shapes = {
  "baseshape-round": {
    t: "ฐานทรงกลม",
    s: "ทรงมาตรฐาน ไม่คิดเพิ่ม",
    draw: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="175" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>`,
  },
  "baseshape-square": {
    t: "ฐานทรงสี่เหลี่ยม",
    s: "ทรงมาตรฐาน ไม่คิดเพิ่ม",
    draw: (cx, cy) =>
      `<rect x="${cx - 160}" y="${cy - 160}" width="320" height="320" rx="24" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>`,
  },
  "baseshape-diecut": {
    t: "ฐานไดคัทตามทรง",
    s: "ตัดตามรูปทรงที่ออกแบบ · คิดเพิ่ม 10 บาท/ชิ้น",
    draw: (cx, cy) => flowerPath(cx, cy, 190),
  },
};

// ── 4. ฐานสกรีนลาย / ไม่สกรีน ────────────────────────────────────────────
const basePattern = `
  <defs>
    <pattern id="dots" width="46" height="46" patternUnits="userSpaceOnUse">
      <circle cx="12" cy="12" r="8" fill="#fbbf24"/>
      <circle cx="34" cy="34" r="8" fill="#f472b6"/>
    </pattern>
  </defs>`;

const screenNo = frame(`
  ${title("ไม่สกรีนฐาน", "ฐานอะคริลิคใส เห็นทะลุ ไม่มีลาย")}
  <circle cx="350" cy="380" r="185" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  ${slot(350, 380)}
  <text x="${W / 2}" y="${H - 42}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ราคาในตารางรวมฐานใสแบบนี้ไว้แล้ว</text>`);

const screenYes = frame(`
  ${basePattern}
  ${title("สกรีนลายฐาน", "พิมพ์ลายลงบนฐาน คิดเพิ่มตามขนาดฐาน")}
  <circle cx="350" cy="380" r="185" fill="url(#dots)" opacity="0.55"/>
  <circle cx="350" cy="380" r="185" fill="rgba(13,148,136,0.18)" stroke="#0d9488" stroke-width="4"/>
  ${slot(350, 380)}
  <text x="${W / 2}" y="${H - 66}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ฐาน 5-6 ซม. +10 · 7-8 ซม. +15 บาท</text>
  <text x="${W / 2}" y="${H - 34}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ฐาน 9-10 ซม. +20 · 11-12 ซม. +25 บาท</text>`);

// ── เขียนไฟล์ ────────────────────────────────────────────────────────────
async function render(name, svg) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

// ภาพงานจริงจากหน้าเว็บตารางราคา (id ของ static.wixstatic.com)
const PHOTOS = {
  "gallery-1": "959b83_0c09ee90c89e47b698724d13f3791191~mv2",
  "gallery-2": "959b83_42e0a713ce11475489eaffe764d91cc3~mv2",
  "gallery-3": "959b83_c5a9a92c327045659cf0c9fac24a6877~mv2",
  "gallery-4": "959b83_cf39814c1cb34f61bf6d22e3190c1553~mv2",
  "gallery-5": "959b83_09b88f311fb74e3caa797fdf6e5f735f~mv2",
  "gallery-6": "959b83_30c3f7908505422e8fae6ee06e6c9dd9~mv2",
  "gallery-7": "959b83_8c77eb79d999464d9475a541b48e7166~mv2",
  "gallery-8": "959b83_a17d3622917140e39c1061158a86706f~mv2",
  "color-chart": "959b83_ece384645d784b25ab624c67f2cbd4d8~mv2",
};

async function photos() {
  for (const [name, id] of Object.entries(PHOTOS)) {
    const url = `https://static.wixstatic.com/media/${id}.jpg/v1/fill/w_1200,h_1200,al_c,q_90/file.jpg`;
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await sharp(buf).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    writeFileSync(`${OUT}/${name}.jpg`, out);
    console.log(`📷 ${name}.jpg (${Math.round(out.length / 1024)} KB)`);
  }
}

await photos();
for (let cm = 5; cm <= 12; cm++) await render(`size-${cm}`, standeeSize(cm));
await render("basesize-5", baseSize(5, "ฐาน 3-5 ซม.", "ขนาดฐานมาตรฐาน (รวมในราคาแล้ว)"));
for (let cm = 6; cm <= 12; cm++) await render(`basesize-${cm}`, baseSize(cm, `ฐาน ${cm} ซม.`, "ใหญ่กว่ามาตรฐาน คิดเพิ่มตาม ซม."));
for (const [name, s] of Object.entries(shapes)) await render(name, frame(`${title(s.t, s.s)}${s.draw(350, 380)}${slot(350, 380)}`));
await render("basescreen-no", screenNo);
await render("basescreen-yes", screenYes);
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
