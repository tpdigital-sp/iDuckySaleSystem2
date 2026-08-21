#!/usr/bin/env node
/**
 * เตรียมภาพประกอบตัวเลือกของสินค้า "สแตนดี้ไม้กระดก" (acrylicseesaw)
 *
 *   node scripts/standee-seesaw-art.mjs [--out=<dir>]
 *
 * ได้ 3 ชุด แล้วให้ scripts/add-standee-seesaw.ts อัปขึ้น Supabase Storage:
 *   1. gallery-1..5        ภาพงานจริงจากเว็บตารางราคา (iduckyofficial-pricelists.com/acrylicseesaw)
 *   2. rock-11..20         ภาพประกอบ "ขนาดตัวโยก" — วาดเป็น SVG สเกลจริง เทียบกันได้ทั้งชุด
 *      mid-4..8            ขนาดตัวกลาง (จุดหมุน)
 *      base-5..10          ขนาดฐาน
 *   3. part-*-plain/special  ชิ้นไหนคือ "ตัวโยก / ตัวกลาง / ฐาน" และหน้าตาตอนเป็นอะคริลิคพิเศษ
 *   (สีอะคริลิคใช้ชุดกลางของทั้งระบบ — ดู scripts/acrylic-colors.mjs)
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
// ลายที่ "สกรีน" บนชิ้นงานในภาพประกอบ = มาสคอตเป็ด iDucky ของฝ่าย Content (น่ารักกว่าวาดเอง)
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 480);

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/seesaw/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });
const CACHE = ".cache/seesaw";
mkdirSync(CACHE, { recursive: true });

const WIX = "https://static.wixstatic.com/media";
const UA = "Mozilla/5.0 (compatible; iDuckyStockSync/1.0)";

async function grab(file, url) {
  const p = `${CACHE}/${file}`;
  if (existsSync(p)) return p;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  await new Promise((r) => setTimeout(r, 250));
  return p;
}

// ── 1. ภาพงานจริง (แกลเลอรี — 5 ใบเท่าเพดานของหน้าแก้ไขสินค้า) ─────────────
const GALLERY = [
  "959b83_33bff9fac74e434ca68146a56629f385~mv2.jpg",
  "959b83_e0dbf65ed0184612a7b5310e6c090631~mv2.jpg",
  "959b83_7bc6284176f84c9c9212cd74ce8047c5~mv2.jpg",
  "959b83_78428aa5b4d7428d8cb7ec6721ea1210~mv2.jpg",
  "959b83_c9bfd9e02ceb4430836388e475773d14~mv2.jpg",
];
for (const [i, id] of GALLERY.entries()) {
  const src = await grab(`src-g${i + 1}.jpg`, `${WIX}/${id}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  await sharp(src).resize(1100, 1100, { fit: "inside" }).jpeg({ quality: 86 }).toFile(`${OUT}/gallery-${i + 1}.jpg`);
}

// ── 2. ภาพประกอบ "ขนาด" + "ชิ้นส่วน" — วาดเป็น SVG ────────────────────────
const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GHOST = "#cbd5e1";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";
const DIM = "rgba(148,163,184,0.16)";
const DIM_EDGE = "#cbd5e1";
const HOT = "rgba(251,191,36,0.30)";
const HOT_EDGE = "#f59e0b";

/** ลายอะคริลิคพิเศษ (กลิตเตอร์ · โฮโลแกรม) — ไล่สีรุ้ง + เกล็ดประกาย */
const DEFS = `<defs>
  <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#a5f3fc"/><stop offset="25%" stop-color="#c4b5fd"/>
    <stop offset="50%" stop-color="#fbcfe8"/><stop offset="75%" stop-color="#fde68a"/>
    <stop offset="100%" stop-color="#a7f3d0"/>
  </linearGradient>
  <pattern id="glit" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="6" cy="7" r="2.2" fill="#ffffff" opacity="0.85"/>
    <circle cx="19" cy="17" r="1.6" fill="#ffffff" opacity="0.7"/>
    <circle cx="12" cy="22" r="1.2" fill="#ffffff" opacity="0.6"/>
  </pattern>
</defs>`;

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${DEFS}
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="110" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (t, second) => `
  <text x="${W / 2}" y="${H - (second ? 58 : 44)}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>
  ${second ? `<text x="${W / 2}" y="${H - 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${LINE}">${second}</text>` : ""}`;

/** เส้นบอกขนาดแนวนอน (ลูกศรหัวท้าย + ป้ายตัวเลขใต้เส้น) */
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 32}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวตั้ง — ป้ายวางซ้ายเส้นเสมอ กันตัวหนังสือล้นขอบภาพ */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y1}" x2="${x + 12}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y2}" x2="${x + 12}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x - 20}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="end" fill="${CYAN}">${label}</text>`;

/**
 * ลายที่สกรีนบนชิ้นงาน — มาสคอตเป็ด iDucky วางให้พอดีกรอบ (w × h) โดยคงสัดส่วน
 */
const artwork = (cx, cy, w, h, opacity = 1) => {
  const box = Math.min(w, h * 0.98);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

// ── สเกลและผังชิ้นงาน ─────────────────────────────────────────────────────
const PX_PER_CM = 26; // 20 ซม. = 520 px (กว้างสุดที่ยังเหลือขอบให้เส้นบอกขนาด)
const GROUND = 520;
const CX = 340;
/** ขนาดมาตรฐานที่รวมอยู่ในราคา 350 บาท/เซต (ตามการ์ดสเปกของร้าน) */
const STD = { rock: 11, mid: 4, base: 5 };
/** ขนาดใหญ่สุดที่เปิดให้เลือกในหน้าสินค้า (ใช้วาดเส้นประเทียบขนาด) */
const MAX = { rock: 20, mid: 8, base: 10 };

/** พิกัดของทั้งเซต ณ ขนาดที่กำหนด (หน่วย ซม. ทั้งสามชิ้น) */
function geom({ rock = STD.rock, mid = STD.mid, base = STD.base } = {}) {
  const baseW = base * PX_PER_CM;
  const baseH = 18;
  const baseTop = GROUND - baseH;
  const midH = mid * PX_PER_CM;
  const midW = midH * 0.82;
  const midTop = baseTop - midH;
  const rockW = rock * PX_PER_CM;
  const rockBar = 15;
  // ตัวการ์ตูนสองตัวติดปลายคาน — สูงราว 1 ใน 3 ของความยาวคาน (อ้างจากภาพงานจริง)
  const figH = rockW * 0.34;
  const figW = figH * 0.78;
  return { baseW, baseH, baseTop, midH, midW, midTop, rockW, rockBar, figH, figW };
}

/** ฐานใส — แผ่นรองแบน ๆ ที่ทั้งเซตตั้งอยู่ */
const basePlate = (g, fill = GLASS, edge = GLASS_EDGE, dash = "") => `
  <rect x="${CX - g.baseW / 2}" y="${g.baseTop}" width="${g.baseW}" height="${g.baseH}" rx="7"
    fill="${fill}" stroke="${edge}" stroke-width="${dash ? 2 : 4}" ${dash}/>`;

/** ตัวกลาง (จุดหมุน) — ทรงโค้งครึ่งวงกลมด้านบน มีรูเจาะตรงกลางสำหรับหมุด */
const pivot = (g, fill = GLASS, edge = GLASS_EDGE, dash = "", hole = true) => {
  const r = g.midW / 2;
  const cy = g.midTop + r;
  return `
  <path d="M${CX - r} ${g.baseTop} L${CX - r} ${cy} A${r} ${r} 0 0 1 ${CX + r} ${cy} L${CX + r} ${g.baseTop} Z"
    fill="${fill}" stroke="${edge}" stroke-width="${dash ? 2 : 4}" stroke-linejoin="round" ${dash}/>
  ${hole ? `<circle cx="${CX}" cy="${cy}" r="${Math.max(7, r * 0.26)}" fill="#ffffff" stroke="${edge}" stroke-width="3"/>` : ""}`;
};

/** ตัวโยก — คานไม้กระดก + ตัวการ์ตูนสองฝั่ง (ชิ้นเดียวกัน สกรีน 2 ด้าน) เอียงตามแกนหมุน */
const rocker = (g, { fill = GLASS, edge = GLASS_EDGE, dash = "", art = true, tilt = -9 } = {}) => {
  const r = g.midW / 2;
  const cy = g.midTop + r; // แกนหมุน
  const half = g.rockW / 2;
  const barTop = -g.rockBar / 2;
  const sw = dash ? 2 : 4;
  const fig = (sx) => `
    <rect x="${sx > 0 ? half - g.figW : -half}" y="${barTop - g.figH}" width="${g.figW}" height="${g.figH}" rx="${g.figH * 0.22}"
      fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>
    ${art ? artwork(sx > 0 ? half - g.figW / 2 : -half + g.figW / 2, barTop - g.figH / 2, g.figW, g.figH) : ""}`;
  return `
  <g transform="translate(${CX} ${cy}) rotate(${tilt})">
    <rect x="${-half}" y="${barTop}" width="${g.rockW}" height="${g.rockBar}" rx="6"
      fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>
    ${fig(-1)}${fig(1)}
  </g>`;
};

const groundLine = (w) =>
  `<line x1="${CX - w / 2}" y1="${GROUND + 8}" x2="${CX + w / 2}" y2="${GROUND + 8}" stroke="#e2e8f0" stroke-width="4"/>`;

/** ทั้งเซตแบบปกติ (ใช้เป็นพื้นหลังของภาพขนาด/ภาพชิ้นส่วน) */
const wholeSet = (g, style = {}) => `
  ${rocker(g, style.rocker)}
  ${pivot(g, ...(style.pivot ?? []))}
  ${basePlate(g, ...(style.base ?? []))}`;

// ── 2.1 ภาพ "ขนาด" ทีละชิ้น ───────────────────────────────────────────────
/** เส้นประของขนาดใหญ่สุด — ไว้เทียบว่าที่เลือกอยู่เล็ก/ใหญ่แค่ไหน */
const ghostOf = (part, cm) => {
  if (cm >= MAX[part]) return "";
  const g = geom({ [part]: MAX[part] });
  const d = 'stroke-dasharray="8 8"';
  if (part === "rock") return rocker(g, { fill: "none", edge: GHOST, dash: d, art: false });
  if (part === "mid") return pivot(g, "none", GHOST, d, false);
  return basePlate(g, "none", GHOST, d);
};

const SIZE_META = {
  rock: {
    label: (cm) => `ตัวโยก ${cm} ซม.`,
    sub: "คานไม้กระดก + ตัวการ์ตูน 2 ฝั่ง (ชิ้นเดียวกัน) — สกรีน 2 ด้าน",
    footer: "ขนาดมาตรฐาน 11 ซม. รวมในราคาแล้ว · เกินจากนี้บวกเพิ่ม ซม. ละ 10 บาท",
  },
  mid: {
    label: (cm) => `ตัวกลาง ${cm} ซม.`,
    sub: "จุดหมุน 2 ชิ้นประกบ + เจาะรูใส่หมุด",
    footer: "ขนาดมาตรฐาน 3-4 ซม. รวมในราคาแล้ว · เกินจากนี้บวกเพิ่ม ซม. ละ 10 บาท",
  },
  base: {
    label: (cm) => `ฐาน ${cm} ซม.`,
    sub: "ฐานใส — แผ่นรองให้ทั้งเซตตั้งได้",
    footer: "ขนาดมาตรฐาน 4-5 ซม. รวมในราคาแล้ว · เกินจากนี้บวกเพิ่ม ซม. ละ 10 บาท",
  },
};

function sizeShot(part, cm) {
  const g = geom({ [part]: cm });
  const wide = geom({ rock: MAX.rock, base: MAX.base });
  const meta = SIZE_META[part];
  const std = part === "rock" ? "11 ซม." : part === "mid" ? "3-4 ซม." : "4-5 ซม.";
  const isStd = part === "rock" ? cm === STD.rock : cm <= STD[part];
  // เส้นบอกขนาด: ตัวโยก/ฐาน วัดแนวนอน · ตัวกลางวัดแนวตั้ง
  const dim =
    part === "mid"
      ? dimV(W - 74, g.midTop, g.baseTop, `${cm} ซม.`)
      : dimH(GROUND + 58, CX - (part === "rock" ? g.rockW : g.baseW) / 2, CX + (part === "rock" ? g.rockW : g.baseW) / 2, `${cm} ซม.`);
  return frame(`
    ${title(meta.label(cm), meta.sub)}
    ${groundLine(wide.rockW + 60)}
    ${ghostOf(part, cm)}
    ${wholeSet(g)}
    ${dim}
    ${foot(
      isStd ? `ขนาดมาตรฐาน ${std} — รวมอยู่ในราคาเซตแล้ว` : `เกินมาตรฐาน ${std} — บวกเพิ่ม ซม. ละ 10 บาท`,
      cm < MAX[part] ? `เส้นประ = ขนาดใหญ่สุด ${MAX[part]} ซม. (ไว้เทียบขนาด)` : ""
    )}`);
}

// ── 2.2 ภาพ "ชิ้นส่วน" — ใส vs อะคริลิคพิเศษ ──────────────────────────────
const PART_META = {
  rock: { name: "ตัวโยก", sub: "คานไม้กระดก + ตัวการ์ตูน 2 ฝั่ง — สกรีน 2 ด้าน" },
  mid: { name: "ตัวกลาง", sub: "จุดหมุน 2 ชิ้นประกบ + เจาะรูใส่หมุด" },
  base: { name: "ฐาน", sub: "ฐานใส — แผ่นรองให้ทั้งเซตตั้งได้" },
};

/** ภาพชิ้นส่วนใช้เป็นภาพย่อบนปุ่มตัวเลือกด้วย — ซูมเข้าให้ชิ้นงานเต็มกรอบ จะได้ดูออกตอนย่อเล็ก */
const PART_ZOOM = 1.55;
const ZOOM_CY = 430;
const zoomed = (body) =>
  `<g transform="translate(${CX} ${ZOOM_CY}) scale(${PART_ZOOM}) translate(${-CX} ${-ZOOM_CY})">${body}</g>`;
/** แปลงพิกัดในภาพที่ยังไม่ซูม → พิกัดจริงบนภาพที่ซูมแล้ว (ใช้วางหัวลูกศรชี้) */
const zoomPt = (x, y) => [CX + (x - CX) * PART_ZOOM, ZOOM_CY + (y - ZOOM_CY) * PART_ZOOM];

function partShot(part, special) {
  const g = geom();
  // ชิ้นที่กำลังพูดถึงเน้นสี — แบบใสใช้ฟ้าเข้ม (ยังอ่านว่า "อะคริลิคใส") · แบบพิเศษใช้ไล่สีรุ้ง
  const fill = special ? "url(#holo)" : "rgba(56,189,248,0.42)";
  const edge = special ? "#a855f7" : "#0284c7";
  const on = (p) => (p === part ? [fill, edge] : [DIM, DIM_EDGE]);
  const glitter = (path) => (special ? path : "");
  const meta = PART_META[part];
  const r = g.midW / 2;
  const cy = g.midTop + r;
  // จุดชี้ + ป้ายชื่อชิ้นส่วน (ตัวกลางชี้ลงล่าง กันป้ายทับตัวการ์ตูนบนคาน)
  const [raw, arm] =
    part === "rock"
      ? [[CX + g.rockW / 2 - 26, cy - g.rockW / 2 + 40], [58, -40]]
      : part === "mid"
        ? [[CX + r, cy + g.midH * 0.22], [58, 40]]
        : [[CX + g.baseW / 2, g.baseTop + g.baseH / 2], [58, -34]];
  const tip = zoomPt(raw[0], raw[1]);
  return frame(`
    ${title(`${meta.name}${special ? " · อะคริลิคพิเศษ" : " · อะคริลิคใส"}`, meta.sub)}
    ${zoomed(`
      ${rocker(g, { fill: on("rock")[0], edge: on("rock")[1], art: part !== "rock" || !special })}
      ${glitter(part === "rock" ? rocker(g, { fill: "url(#glit)", edge: "none", art: false }) : "")}
      ${pivot(g, ...on("mid"))}
      ${glitter(part === "mid" ? pivot(g, "url(#glit)", "none", "", false) : "")}
      ${basePlate(g, ...on("base"))}
      ${glitter(part === "base" ? basePlate(g, "url(#glit)", "none") : "")}`)}
    <circle cx="${tip[0]}" cy="${tip[1]}" r="8" fill="${edge}"/>
    <path d="M${tip[0]} ${tip[1]} L${tip[0] + arm[0]} ${tip[1] + arm[1]}" stroke="${edge}" stroke-width="3"/>
    <text x="${tip[0] + arm[0] + 8}" y="${tip[1] + arm[1] + 8}" font-family="${TH}" font-size="27" font-weight="700" fill="${edge}">${meta.name}</text>
    ${foot(
      special
        ? "อะคริลิคพิเศษหนาประมาณ 2.5-3 มม. — เลือกเปลี่ยนเฉพาะชิ้นที่ต้องการได้"
        : "อะคริลิคใส หนา 3 มม. (มาตรฐานที่รวมอยู่ในราคาเซต)"
    )}`);
}

// ── 3. เรนเดอร์ ───────────────────────────────────────────────────────────
const ROCK_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const MID_SIZES = [4, 5, 6, 7, 8];
const BASE_SIZES = [5, 6, 7, 8, 9, 10];

const svgs = {
  ...Object.fromEntries(ROCK_SIZES.map((cm) => [`rock-${cm}`, sizeShot("rock", cm)])),
  ...Object.fromEntries(MID_SIZES.map((cm) => [`mid-${cm}`, sizeShot("mid", cm)])),
  ...Object.fromEntries(BASE_SIZES.map((cm) => [`base-${cm}`, sizeShot("base", cm)])),
  ...Object.fromEntries(
    ["rock", "mid", "base"].flatMap((p) => [
      [`part-${p}-plain`, partShot(p, false)],
      [`part-${p}-special`, partShot(p, true)],
    ])
  ),
};
for (const [name, svg] of Object.entries(svgs)) {
  await sharp(Buffer.from(svg)).png().resize(700, 700).jpeg({ quality: 90 }).toFile(`${OUT}/${name}.jpg`);
}

console.log(`✅ ${GALLERY.length} ภาพงานจริง · ${Object.keys(svgs).length} ภาพวาด → ${OUT}`);
