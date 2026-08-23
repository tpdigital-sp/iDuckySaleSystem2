#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ 3D Acrylic — "ตัวเลือกไหนหน้าตาเป็นแบบไหน"
 *
 *   node scripts/3d-acrylic-art.mjs [--out=<dir>]
 *
 * ได้ 14 ไฟล์ ลง .cache/3d-acrylic/upload
 *
 * ── การ์ดขนาด (10 ใบ · แยกกลุ่มละ 5 ขนาด) ────────────────────────────────
 *   p1-size-2 … p1-size-6   กลุ่ม "ขนาดชิ้นที่ 1" (ชิ้นฐาน ชิ้นใหญ่สุด เป็นตัวคิดราคา)
 *   p2-size-2 … p2-size-6   กลุ่ม "ขนาดชิ้นที่ 2" (ชิ้นที่ติดกาวประกบอยู่ด้านบน)
 *
 *   แต่ละใบเป็น "ภาพจำลอง" ที่อธิบายตัวงานตรง ๆ ว่า 1 ชุด = อะคริลิค 2 ชิ้นประกบกัน:
 *     • มองจากด้านหน้า   ชิ้นฐาน ① + ชิ้นที่ติดด้านบน ② วาดตามสเกลจริงของขนาดที่เลือก
 *                        มีเงาโครง 6 cm (ใหญ่สุด) จาง ๆ ไว้เทียบ · ชิ้นที่กำลังเลือกเป็นสีฟ้า
 *     • มองจากด้านข้าง   ตัดขวางให้เห็นว่าอะคริลิคหนา 3 มม. 2 แผ่น ติดกาวเฉพาะจุด
 *                        ชิ้นที่ 2 จึง "ยกลอย" ขึ้นมาเป็นมิติ 3D
 *     • แถบล่าง          รูปงานจริงของร้าน เทียบขนาด 2-6 cm บนพื้นเดียวกัน (ของจริง ไม่ใช่ภาพวาด)
 *   ราคาบนการ์ดดึงสดจากเว็บตารางราคา (3d-acrylic-prices.mjs) — ตัวเลขไม่มีวันหลุดจากหน้าเว็บจริง
 *
 * ── การ์ดกลุ่ม "เพิ่มจำนวนชิ้น" (1 ใบ) ────────────────────────────────────
 *   extra-ask   ชิ้นที่ 3 ขึ้นไป — วางเรียง ชิ้นที่ 1 + ชิ้นที่ 2 + ชิ้นที่เพิ่ม ให้เห็นว่า "เพิ่มจากอะไร"
 *       พร้อมตารางราคา "โดยประมาณ" ต่อชิ้นตามขนาด (ซม.ละ 15 งานสกรีน · 10 งานไม่สกรีน)
 *       ราคาจริงแอดมินคิดให้ตอนยืนยันออเดอร์ — หน้าเว็บจึงมีแค่ช่องติ๊กแจ้งความต้องการ
 *
 * ── การ์ดชนิดอะคริลิค (3 ใบ) ─────────────────────────────────────────────
 *   acrylic-clear    อะคริลิคใส          ← รูปงานจริงของสินค้านี้ (แกลเลอรีใบที่ 5 "อะคริลิคใสล้วน")
 *   acrylic-c02      อะคริลิคขาวขุ่น C-02 ← สวอตช์จากชาร์ตสีทางการของร้าน (acrylic-colors/c02)
 *   acrylic-special  อะคริลิคพิเศษ        ← รูปงานจริงใบที่ 1 (ฐานโฮโลแกรม) + สวอตช์จริงอีก 4 ลาย
 *
 * งานสกรีน 6 แบบมีภาพจากชุด acrylic-howto อยู่แล้ว จึงไม่แตะ
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ (การ์ดขนาดชุดนี้ขึ้นต้น p1-/p2- จึงเริ่ม v1 ใหม่)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { fetch3dAcrylicPrices, fetchKeyringRate1 } from "./3d-acrylic-prices.mjs";
// ลายที่ "สกรีน" บนชิ้นงานในภาพจำลอง = มาสคอตเป็ด iDucky ของฝ่าย Content
import { mascotDataUri } from "./iducky-assets.mjs";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/3d-acrylic/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_V = "v1"; // การ์ดขนาดชุดใหม่ (ชื่อไฟล์ขึ้นต้น p1-/p2- จึงเริ่มนับ v1 ใหม่)
const TYPE_V = "v1";
const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#cbd5e1";
const CYAN = "#0891b2";
const GLUE = "#f59e0b";
const PAPER = "#f8fafc";
const EDGE = "#e2e8f0";

const STORAGE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
/** รูปเทียบขนาดจริง — ไล่จากไดรฟ์ร้าน (คมกว่า) ลงมาที่ชุดใน AdminBuddy */
const SIZE_PHOTOS = [
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/size-compare.jpg",
  `${process.env.HOME}/Desktop/AdminBuddy/academy-assets/acrylic/size-compare.jpg`,
];
const SIZE_PHOTO = SIZE_PHOTOS.find((f) => existsSync(f));
if (!SIZE_PHOTO) throw new Error(`ไม่เจอรูปเทียบขนาด — หาที่:\n  ${SIZE_PHOTOS.join("\n  ")}`);

const MASCOT = await mascotDataUri("heart", 560);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── โครงการ์ด ────────────────────────────────────────────────────────────
const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="${EDGE}" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="132" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

/** บรรทัดท้ายการ์ด — เรียงลงมาจาก y ที่กำหนด */
const foot = (lines, y0) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${y0 + i * 36}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

const uri = (buf, mime = "image/jpeg") => `data:${mime};base64,${buf.toString("base64")}`;

async function grab(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
/** ครอปจัตุรัสจากรูป (พิกัดของไฟล์ต้นฉบับ) แล้วย่อให้พอดีช่องที่จะวาง */
const square = async (buf, left, top, size, out) =>
  sharp(buf).extract({ left, top, width: size, height: size }).resize(out, out).jpeg({ quality: 92 }).toBuffer();

// ══ การ์ดขนาด ════════════════════════════════════════════════════════════
/**
 * กรอบชิ้นงานแต่ละขนาดบนรูปเทียบขนาด (พิกัดจริงของ size-compare.jpg 1600×814)
 * วัดมาจากตัวรูปเอง (สแกนหาพิกเซลที่มีสี) — ชิ้นงานวางชิดพื้นเดียวกัน สเกลจึงเทียบกันได้ตรง ๆ
 */
const PIECE_BOX = {
  "2cm": [70, 111, 503],
  "3cm": [147, 212, 480],
  "4cm": [236, 326, 455],
  "5cm": [360, 472, 429],
  "6cm": [505, 642, 400],
};
/** แถบที่ครอปมาใช้ = ตัวชิ้นงาน 2-6 cm + ป้าย cm (ตัดห่วงพวงกุญแจส่วนบนทิ้ง ให้แถบเตี้ยลง) */
const STRIP = { x: 42, y: 380, w: 616, h: 232 };
const STRIP_W = 520;
const STRIP_H = Math.round((STRIP_W * STRIP.h) / STRIP.w);
const STRIP_X = (W - STRIP_W) / 2;
const STRIP_Y = 596;
const kStrip = STRIP_W / STRIP.w;
const onStrip = (x, y) => [STRIP_X + (x - STRIP.x) * kStrip, STRIP_Y + (y - STRIP.y) * kStrip];

/** ── ภาพจำลอง: แผงซ้าย "มองจากด้านหน้า" ── */
const PA = { x: 46, y: 142, w: 414, h: 396 };
const CXA = PA.x + PA.w / 2;
const GROUND = 452; // ขอบล่างของชิ้นฐานในภาพจำลอง
const PX_PER_CM = 38; // 6 cm = 228 px — ใหญ่สุดยังอยู่ในแผง

/**
 * ทรงชิ้นฐาน: แผ่นก้นแบนหัวโค้ง (เลียนงานจริงแบบ "ฉากหลัง") — วาดเป็นจัตุรัส w = h
 * จงใจให้สูงเท่ากว้าง ชิ้นที่ 2 ที่ขนาดเท่ากันจะได้ไม่ล้นออกนอกชิ้นฐานในภาพจำลอง
 */
const dome = (cx, ground, w, h) => {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const flat = h * 0.55;
  return `M${x0} ${ground} L${x0} ${ground - flat} A${w / 2} ${h - flat} 0 0 1 ${x1} ${ground - flat} L${x1} ${ground} Z`;
};

/** หมุดเลข ① ② */
const pin = (cx, cy, n, on) => `
  <circle cx="${cx}" cy="${cy}" r="15" fill="#ffffff" opacity="0.95"/>
  <circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="${on ? CYAN : "#94a3b8"}" stroke-width="3"/>
  <text x="${cx}" y="${cy + 7}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="middle" fill="${on ? CYAN : "#64748b"}">${n}</text>`;

/**
 * ชิ้นงานไดคัท (ชิ้นที่ 2) — ขยายเงาของลายออกไปเป็น "ขอบใสรอบลาย" ตามงานไดคัทจริง
 * แล้วเติมเนื้ออะคริลิค ทับด้วยตัวลายอีกที · มีเงาตกกระทบเพราะชิ้นนี้ยกลอยอยู่บนชิ้นฐาน
 */
function diecut(cx, bottom, longest, on, o = {}) {
  const { id = "cut", blank = false } = o; // blank = ชิ้นที่ยังไม่สกรีน เห็นแต่เนื้ออะคริลิคที่ไดคัทไว้
  const ch = longest; // มาสคอตสูงกว่ากว้าง (ratio < 1) ด้านยาวสุดจึงเป็นความสูง
  const cw = ch * MASCOT.ratio;
  const top = bottom - ch;
  const rim = ch * 0.035;
  const body = on ? "#cffafe" : "#eef2f7";
  const ring = on ? "#22d3ee" : "#cbd5e1";
  const img = `<image href="${MASCOT.uri}" x="${cx - cw / 2}" y="${top}" width="${cw}" height="${ch}" preserveAspectRatio="xMidYMid meet"/>`;
  return {
    cw,
    ch,
    top,
    svg: `
    <defs>
      <filter id="${id}" x="-30%" y="-25%" width="160%" height="150%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="${(rim * 1.35).toFixed(1)}" result="d1"/>
        <feFlood flood-color="${ring}" result="c1"/>
        <feComposite in="c1" in2="d1" operator="in" result="ringLayer"/>
        <feMorphology in="SourceAlpha" operator="dilate" radius="${rim.toFixed(1)}" result="d2"/>
        <feFlood flood-color="${body}" result="c2"/>
        <feComposite in="c2" in2="d2" operator="in" result="bodyLayer"/>
        <feMerge><feMergeNode in="ringLayer"/><feMergeNode in="bodyLayer"/></feMerge>
      </filter>
      <filter id="lift-${id}" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.26"/>
      </filter>
    </defs>
    <g filter="url(#lift-${id})"><g filter="url(#${id})">${img}</g></g>
    ${blank
      ? `<text x="${cx}" y="${top + ch * 0.56}" font-family="${TH}" font-size="${Math.max(14, ch * 0.11)}" text-anchor="middle" fill="#94a3b8">ไม่มีลาย</text>`
      : img}`,
  };
}

/** แผงซ้าย: มองจากด้านหน้า */
function frontView(baseCm, topCm, hi) {
  const bw = baseCm * PX_PER_CM;
  const bh = bw; // สูงเท่ากว้าง — ด้านที่ยาวที่สุดคือ baseCm ทั้งสองแกน
  const on1 = hi === 1;
  const ghost =
    baseCm < 6
      ? `<path d="${dome(CXA, GROUND, 6 * PX_PER_CM, 6 * PX_PER_CM)}" fill="none" stroke="${LINE}" stroke-width="2" stroke-dasharray="9 7"/>
         <text x="${CXA + 3 * PX_PER_CM + 8}" y="${GROUND - 2}" font-family="${TH}" font-size="17" fill="${LINE}">6 cm</text>`
      : "";
  const pcx = CXA + bw * 0.1;
  // ชิ้นฐานยิ่งใหญ่กว่าชิ้นบนมาก ยิ่งยกชิ้นบนขึ้นให้เห็นว่าลอยอยู่ — ขนาดเท่ากันก็วางชิดขอบล่างพอดี
  const piece = diecut(pcx, GROUND - (baseCm - topCm) * PX_PER_CM * 0.18, topCm * PX_PER_CM, hi === 2);
  return `
    <rect x="${PA.x}" y="${PA.y}" width="${PA.w}" height="${PA.h}" rx="22" fill="${PAPER}" stroke="${EDGE}" stroke-width="2"/>
    <text x="${CXA}" y="${PA.y + 34}" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="${SUB}">มองจากด้านหน้า</text>
    ${ghost}
    <path d="${dome(CXA, GROUND, bw, bh)}" fill="${on1 ? "rgba(103,232,249,0.5)" : "rgba(148,163,184,0.28)"}" stroke="${on1 ? "#22d3ee" : "#94a3b8"}" stroke-width="3"/>
    ${piece.svg}
    ${pin(CXA - bw * 0.34, GROUND - bh * 0.4, "1", on1)}
    ${pin(pcx + piece.cw / 2 + 6, piece.top + piece.ch * 0.28, "2", hi === 2)}
    <text x="${CXA}" y="${PA.y + PA.h - 48}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${INK}">① ชิ้นฐาน ${on1 ? `<tspan fill="${CYAN}" font-weight="700">${baseCm} cm</tspan>` : "(เลือกแยก)"}</text>
    <text x="${CXA}" y="${PA.y + PA.h - 18}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${INK}">② ชิ้นที่ติดด้านบน ${hi === 2 ? `<tspan fill="${CYAN}" font-weight="700">${topCm} cm</tspan>` : "(เลือกแยก)"}</text>`;
}

/** แผงขวา: มองจากด้านข้าง (ตัดขวาง) — ให้เห็นว่าชิ้นที่ 2 ติดกาวอยู่บนชิ้นที่ 1 */
function sideView(hi) {
  const PB = { x: 478, y: 142, w: 376, h: 396 };
  const cx = PB.x + PB.w / 2;
  const T = 18; // อะคริลิคหนา 3 มม. ในภาพจำลอง
  const bY = 372;
  const tY = bY - T - 18; // เว้นช่องกาวไว้ 18 px
  const bX = [cx - 150, cx + 150];
  const tX = [cx - 64, cx + 64];
  const slab = (x0, x1, y, on) =>
    `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${T}" rx="5" fill="${on ? "rgba(103,232,249,0.55)" : "rgba(148,163,184,0.3)"}" stroke="${on ? "#22d3ee" : "#94a3b8"}" stroke-width="2.5"/>`;
  const dots = [-44, 0, 44].map((d) => `<circle cx="${cx + d}" cy="${bY - 9}" r="6" fill="${GLUE}"/>`).join("");
  return `
    <rect x="${PB.x}" y="${PB.y}" width="${PB.w}" height="${PB.h}" rx="22" fill="${PAPER}" stroke="${EDGE}" stroke-width="2"/>
    <defs><marker id="arw" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
      <path d="M0 0 L9 4.5 L0 9 Z" fill="${SUB}"/></marker></defs>
    <text x="${cx}" y="${PB.y + 34}" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="${SUB}">มองจากด้านข้าง (ตัดขวาง)</text>
    <text x="${cx}" y="${PB.y + 92}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${INK}">ชิ้นที่ 2 ติดกาวอยู่บนชิ้นที่ 1</text>
    <text x="${cx}" y="${PB.y + 120}" font-family="${TH}" font-size="18" text-anchor="middle" fill="${SUB}">จึงยกลอยขึ้นมา เห็นเป็นมิติ 3D</text>
    <path d="M${cx} ${PB.y + 140} L${cx} ${tY - 12}" stroke="${SUB}" stroke-width="2" marker-end="url(#arw)"/>
    ${slab(tX[0], tX[1], tY, hi === 2)}
    ${dots}
    ${slab(bX[0], bX[1], bY, hi === 1)}
    ${pin(bX[0] - 22, bY + T / 2, "1", hi === 1)}
    ${pin(tX[0] - 22, tY + T / 2, "2", hi === 2)}
    <text x="${cx}" y="${bY + 76}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${INK}">อะคริลิคหนา 3 มม. ต่อชิ้น</text>
    <text x="${cx}" y="${bY + 106}" font-family="${TH}" font-size="18" text-anchor="middle" fill="${SUB}"><tspan fill="${GLUE}" font-weight="700">●</tspan> จุดสีส้ม = จุดที่ติดกาว</text>`;
}

/**
 * @param {1|2} piece   1 = การ์ดของกลุ่ม "ขนาดชิ้นที่ 1" · 2 = กลุ่ม "ขนาดชิ้นที่ 2"
 * @param {string} size "4cm"
 */
async function sizeArt(piece, size, prices) {
  const strip = await sharp(SIZE_PHOTO)
    .extract({ left: STRIP.x, top: STRIP.y, width: STRIP.w, height: STRIP.h })
    .resize(STRIP_W * 3) // อัดความละเอียดไว้ 3 เท่า กันเบลอตอนย่อเป็น JPEG
    .jpeg({ quality: 94 })
    .toBuffer();

  const [x0, x1, top] = PIECE_BOX[size];
  const [wx, wy] = onStrip(x0 - 12, top - 12);
  const [wx2, wy2] = onStrip(x1 + 12, 606); // ล่างสุดเผื่อถึงป้าย "N cm" ใต้ชิ้นงาน
  const [ww, wh] = [wx2 - wx, wy2 - wy];

  const cm = Number(size.replace("cm", ""));
  // ชิ้นที่ไม่ได้เลือกวาดเป็นตัวประกอบ: ของการ์ดชิ้นที่ 1 ให้ชิ้นบนเล็กกว่า · ของการ์ดชิ้นที่ 2 ให้ชิ้นฐาน 6 cm
  const baseCm = piece === 1 ? cm : 6;
  const topCm = piece === 1 ? Math.max(1.2, +(cm * 0.58).toFixed(1)) : cm;
  const [first] = prices.base[size];

  const sub =
    piece === 1
      ? `ชิ้นฐาน ชิ้นใหญ่สุด เป็นตัวคิดราคา · ราคาชุดละ ${first}.- (${prices.tiers[0]})`
      : "ชิ้นที่ติดกาวประกบอยู่บนชิ้นที่ 1 · รวมในราคาชุดแล้ว ไม่บวกเพิ่ม";
  const last =
    piece === 1
      ? `${prices.tiers[0]} · สกรีน 1 ด้าน/ชิ้น · อะคริลิคใส — 1 ชุด = อะคริลิค 2 ชิ้น`
      : "เลือกได้ไม่เกินขนาดชิ้นที่ 1 — เท่ากันก็ได้";

  return frame(`
    <text x="${W / 2}" y="76" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดชิ้นที่ ${piece} — ${cm} cm</text>
    <text x="${W / 2}" y="118" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>

    ${frontView(baseCm, topCm, piece)}
    ${sideView(piece)}

    <!-- แถบรูปงานจริง เทียบขนาด 2-6 cm -->
    <defs>
      <clipPath id="strip"><rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" rx="18"/></clipPath>
      <!-- หรี่ทั้งแถบ เว้นช่องขนาดที่เลือกไว้สว่าง -->
      <mask id="dim">
        <rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" fill="#ffffff"/>
        <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="12" fill="#000000"/>
      </mask>
    </defs>
    <g clip-path="url(#strip)">
      <image href="${uri(strip)}" x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" preserveAspectRatio="xMidYMid slice"/>
      <rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" fill="#ffffff" opacity="0.66" mask="url(#dim)"/>
    </g>
    <rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" rx="18" fill="none" stroke="${EDGE}" stroke-width="2"/>
    <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="12" fill="none" stroke="${CYAN}" stroke-width="4"/>
    <text x="${W / 2}" y="${STRIP_Y + STRIP_H + 30}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">รูปงานจริงของร้าน — เทียบขนาด 2-6 cm บนพื้นเดียวกัน</text>
    <text x="${W / 2}" y="${STRIP_Y + STRIP_H + 66}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${esc(last)}</text>`);
}

/**
 * การ์ดกลุ่ม "เพิ่มจำนวนชิ้น" — 1 ชุดมี 2 ชิ้นอยู่แล้ว ชิ้นที่ 3 ขึ้นไปให้แอดมินคิดราคา
 * ตารางราคาบนการ์ดเป็น "ราคาโดยประมาณ" ไว้ให้ลูกค้ากะงบก่อนทัก (ตัวเลขตามโปสเตอร์ของร้าน)
 */
function extraPieceArt(prices, rate1Tier, rate1) {
  const PER_CM = { งานสกรีน: 15, งานไม่สกรีน: 10 };
  const TS = 210; // ความสูงชิ้นงานในแถวตัวอย่าง
  const BASE_Y = 400; // ขอบล่างของชิ้นงานทั้งแถว
  const cxs = [216, 450, 684];
  const plus = (x) => `<text x="${x}" y="330" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${LINE}">+</text>`;
  const cap = (x, l1, l2, on) => `
    <text x="${x}" y="452" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="${on ? CYAN : INK}">${esc(l1)}</text>
    <text x="${x}" y="480" font-family="${TH}" font-size="18" text-anchor="middle" fill="${SUB}">${esc(l2)}</text>`;

  // ── ตารางราคาโดยประมาณ: คอลัมน์ซ้าย = แบบงาน · ที่เหลือ = ขนาด ──
  const TW = 764;
  const TX = (W - TW) / 2;
  const TY = 520;
  const TH_BOX = 136;
  const LABEL_W = 186;
  const CW = (TW - LABEL_W) / prices.sizes.length;
  const rows = Object.entries(PER_CM);
  const head = prices.sizes
    .map((sz, i) => {
      const x = TX + LABEL_W + i * CW + CW / 2;
      return `
      ${i ? `<line x1="${TX + LABEL_W + i * CW}" y1="${TY + 6}" x2="${TX + LABEL_W + i * CW}" y2="${TY + TH_BOX - 6}" stroke="${EDGE}" stroke-width="2"/>` : ""}
      <text x="${x}" y="${TY + 32}" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="${SUB}">${sz}</text>`;
    })
    .join("");
  const body = rows
    .map(([kind, perCm], ri) => {
      const y = TY + 78 + ri * 40;
      const cells = prices.sizes
        .map((sz, i) => {
          const cm = Number(sz.replace("cm", ""));
          return `<text x="${TX + LABEL_W + i * CW + CW / 2}" y="${y}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${CYAN}">${cm * perCm}.-</text>`;
        })
        .join("");
      return `<text x="${TX + 18}" y="${y}" font-family="${TH}" font-size="19" fill="${INK}">${esc(kind)} <tspan fill="${SUB}" font-size="17">ซม.ละ ${perCm}</tspan></text>${cells}`;
    })
    .join("");

  return frame(`
    ${title("เพิ่มจำนวนชิ้น", "1 ชุดได้อะคริลิค 2 ชิ้น — อยากได้มากกว่านั้น แอดมินคิดราคาให้")}
    <path d="${dome(cxs[0], BASE_Y, TS, TS)}" fill="rgba(148,163,184,0.28)" stroke="#94a3b8" stroke-width="3"/>
    ${diecut(cxs[1], BASE_Y, TS, false, { id: "p2" }).svg}
    ${diecut(cxs[2], BASE_Y, TS, true, { id: "p3" }).svg}
    ${plus(333)}${plus(567)}
    ${cap(cxs[0], "ชิ้นที่ 1", "รวมในราคาชุดแล้ว", false)}
    ${cap(cxs[1], "ชิ้นที่ 2", "รวมในราคาชุดแล้ว", false)}
    ${cap(cxs[2], "ชิ้นที่ 3 ขึ้นไป", "แอดมินคิดราคาให้", true)}
    <rect x="${TX}" y="${TY}" width="${TW}" height="${TH_BOX}" rx="18" fill="${PAPER}" stroke="${EDGE}" stroke-width="2"/>
    <line x1="${TX + LABEL_W}" y1="${TY + 6}" x2="${TX + LABEL_W}" y2="${TY + TH_BOX - 6}" stroke="${EDGE}" stroke-width="2"/>
    ${head}${body}
    ${foot(
      [
        "ราคาโดยประมาณต่อ 1 ชิ้นที่เพิ่ม (คิดแบบอะคริลิคใส) — 11 ชุดขึ้นไปคิดเรทส่ง",
        "ติ๊กในหน้าสั่งซื้อ แล้วบอกจำนวน/ขนาดในช่อง “หมายเหตุถึงร้าน” หรือทักไลน์ร้าน",
      ],
      TY + TH_BOX + 46
    )}`);
}

// ══ การ์ดชนิดอะคริลิค ════════════════════════════════════════════════════
/** การ์ดรูปเดี่ยว — รูปจัตุรัสใหญ่กลางการ์ด */
const heroCard = (t, sub, img, size, lines) => {
  const x = (W - size) / 2;
  const y = 172;
  return frame(`
    ${title(t, sub)}
    <defs><clipPath id="hero"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="26"/></clipPath></defs>
    <image href="${img}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#hero)" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="26" fill="none" stroke="${EDGE}" stroke-width="2"/>
    ${foot(lines, y + size + 52)}`);
};

async function clearArt() {
  // แกลเลอรีใบที่ 5 = "งานอะคริลิคใสล้วน" (576×1024) — ครอปจัตุรัสตรงตัวงาน
  const buf = await grab(`${STORAGE}/3d-acrylic/05.jpg`);
  return heroCard(
    "อะคริลิคใส",
    "เนื้อใสมองทะลุ หนา 3 มม. — ชนิดมาตรฐาน",
    uri(await square(buf, 0, 330, 576, 1120)),
    560,
    ["สีของงานมาจากหมึกที่พิมพ์ ส่วนที่ไม่มีลายจะใส มองทะลุได้", "ราคาตามตาราง — ไม่บวกเพิ่ม"]
  );
}

async function c02Art() {
  const buf = await grab(`${STORAGE}/acrylic-colors/c02-v2.jpg`);
  return heroCard(
    "อะคริลิคขาวขุ่น C-02",
    "เนื้อขาวทึบ ผิวเงา 2 ด้าน",
    uri(buf),
    560,
    ["ลายเด่นกว่าอะคริลิคใส เพราะมีพื้นขาวหนุนหลัง (มองไม่ทะลุ)", "ราคาเท่าอะคริลิคใส — ไม่บวกเพิ่ม"]
  );
}

async function specialArt(prices) {
  const hero = uri(await square(await grab(`${STORAGE}/3d-acrylic/01.jpg`), 200, 225, 615, 880));
  const swatches = await Promise.all(
    [
      ["holo-rainbow-v2", "hologram-รุ้ง"],
      ["holo-01-v2", "hologram-01"],
      ["glitter-gold-v2", "กลิตเตอร์-ทอง"],
      ["mirror-v2", "อะคริลิคกระจก"],
    ].map(async ([file, name]) => [uri(await grab(`${STORAGE}/acrylic-colors/${file}.jpg`)), name])
  );

  const S = 120;
  const GAP = 24;
  const rowW = swatches.length * S + (swatches.length - 1) * GAP;
  const sx = (W - rowW) / 2;
  const sy = 622;
  const heroSize = 400;
  const hx = (W - heroSize) / 2;

  const retail = prices.special.retail["2cm"];
  const lowWholesale = Math.min(...prices.sizes.map((s) => prices.special.wholesale[s]));
  const highWholesale = Math.max(...prices.sizes.map((s) => prices.special.wholesale[s]));

  return frame(`
    ${title("อะคริลิคพิเศษ", "สี / โฮโลแกรม / กลิตเตอร์ — หนาประมาณ 2.5-3 มม.")}
    <defs><clipPath id="hero"><rect x="${hx}" y="160" width="${heroSize}" height="${heroSize}" rx="26"/></clipPath></defs>
    <image href="${hero}" x="${hx}" y="160" width="${heroSize}" height="${heroSize}" clip-path="url(#hero)" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${hx}" y="160" width="${heroSize}" height="${heroSize}" rx="26" fill="none" stroke="${EDGE}" stroke-width="2"/>
    <text x="${W / 2}" y="${160 + heroSize + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">งานจริง — ฐานอะคริลิคโฮโลแกรม ประกบตัวการ์ตูนอีกชิ้น</text>
    ${swatches
      .map(
        ([img, name], i) => `
      <defs><clipPath id="sw${i}"><rect x="${sx + i * (S + GAP)}" y="${sy}" width="${S}" height="${S}" rx="18"/></clipPath></defs>
      <image href="${img}" x="${sx + i * (S + GAP)}" y="${sy}" width="${S}" height="${S}" clip-path="url(#sw${i})" preserveAspectRatio="xMidYMid slice"/>
      <rect x="${sx + i * (S + GAP)}" y="${sy}" width="${S}" height="${S}" rx="18" fill="none" stroke="${EDGE}" stroke-width="2"/>
      <text x="${sx + i * (S + GAP) + S / 2}" y="${sy + S + 28}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">${esc(name)}</text>`
      )
      .join("")}
    ${foot(
      [
        `บวกเพิ่มชิ้นละ ${retail}.- (${prices.tiers[0]}) = ชุดละ ${retail * 2}.- · เรทส่งชิ้นละ ${lowWholesale}-${highWholesale}.-`,
        "ยังมีสี/ลายอื่นอีกหลายสิบแบบ — เลือกได้ในช่อง “หมายเหตุถึงร้าน”",
      ],
      812
    )}`);
}

// ── เขียนไฟล์ ────────────────────────────────────────────────────────────
const save = async (name, svg) => {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
};

const prices = await fetch3dAcrylicPrices();
console.log(`📥 ราคาบนการ์ดดึงสดจากเว็บตารางราคา — ${prices.sizes.map((s) => `${s} ${prices.base[s][0]}.-`).join(" · ")}`);
console.log(`📷 รูปเทียบขนาด: ${SIZE_PHOTO}\n`);

for (const piece of [1, 2]) {
  for (const size of prices.sizes) await save(`p${piece}-size-${size.replace("cm", "")}-${SIZE_V}`, await sizeArt(piece, size, prices));
}
const rate1 = await fetchKeyringRate1();
await save(`extra-ask-${TYPE_V}`, extraPieceArt(prices, "11-29 ชิ้น", rate1));
await save(`acrylic-clear-${TYPE_V}`, await clearArt());
await save(`acrylic-c02-${TYPE_V}`, await c02Art());
await save(`acrylic-special-${TYPE_V}`, await specialArt(prices));

console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
