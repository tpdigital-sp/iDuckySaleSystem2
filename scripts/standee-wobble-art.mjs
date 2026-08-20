#!/usr/bin/env node
/**
 * เตรียมภาพประกอบตัวเลือกของสินค้า "สแตนดี้โยกเยก" (standeewobbles)
 *
 *   node scripts/standee-wobble-art.mjs [--out=<dir>]
 *
 * ได้ 3 ชุด แล้วให้ scripts/add-standee-wobble.mjs อัปขึ้น Supabase Storage:
 *   1. gallery-1..9        ภาพงานจริงจากเว็บตารางราคา (iduckyofficial-pricelists.com/standeewobbles)
 *   2. size-10..15         ภาพประกอบ "ขนาด" — วาดเป็น SVG สเกลจริง เทียบกันได้ทั้งชุด
 *      part-figure/base    ชิ้นไหนคือ "ตัวกลาง" / "ฐานโยกเยก" (ใช้กับ Add on อะคริลิคพิเศษ)
 *   (สีอะคริลิคใช้ชุดกลางของทั้งระบบ — ดู scripts/acrylic-colors.mjs)
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/wobble/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });
const CACHE = ".cache/wobble";
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

// ── 1. ภาพงานจริง (แกลเลอรี) ───────────────────────────────────────────────
const GALLERY = [
  "959b83_012aa833c4814ee2bdfb6de000e29d9b~mv2.jpg",
  "959b83_0cf12dd55acb4c01a5268d3ed83f2221~mv2.jpg",
  "959b83_35e08ad35ae1429b8e05584ee8a63e64~mv2.jpg",
  "959b83_5929c7e32d294b149c01193c591098fd~mv2.jpg",
  "959b83_807f279d69be4536800997f6410d8ee6~mv2.jpg",
  "959b83_8e7949a41c4c4c05af4e7b83b2eeddf3~mv2.jpg",
  "959b83_9283b9fdc4bd44bea024d7ce9af17b92~mv2.jpg",
  "959b83_dd1fd31aeb6342da8bfc027b06757fac~mv2.jpg",
  "959b83_e35d92fc82f347b09e11dc9934261083~mv2.jpg",
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
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y1}" x2="${x + 12}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y2}" x2="${x + 12}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 22}" y="${(y1 + y2) / 2 + 10}" font-family="${TH}" font-size="30" font-weight="700" fill="${CYAN}">${label}</text>`;

/** ลายสกรีนจำลองบนตัวสแตนดี้ */
const artwork = (cx, cy, w, h) => {
  const r = Math.min(w, h);
  return `
  <g opacity="0.9">
    <circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="#fbbf24"/>
    <circle cx="${cx - r * 0.1}" cy="${cy - r * 0.05}" r="${r * 0.04}" fill="#0f172a"/>
    <circle cx="${cx + r * 0.1}" cy="${cy - r * 0.05}" r="${r * 0.04}" fill="#0f172a"/>
    <path d="M${cx - r * 0.11} ${cy + r * 0.08} q${r * 0.11} ${r * 0.09} ${r * 0.22} 0" stroke="#0f172a" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M${cx - w * 0.3} ${cy + h * 0.3} q${w * 0.3} ${h * 0.16} ${w * 0.6} 0" stroke="#f472b6" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>`;
};

/**
 * ฐานโยกเยก — ส่วนโค้งคว่ำ (rocker) ที่ทำให้สแตนดี้โยกไปมาได้
 * cx = กึ่งกลาง · topY = ขอบบนของฐาน · w = ความกว้าง · d = ความลึก (จุดต่ำสุด = topY + d)
 */
const rocker = (cx, topY, w, d, fill = GLASS, edge = GLASS_EDGE, dash = "") => `
  <path d="M${cx - w / 2} ${topY} Q${cx} ${topY + d * 2} ${cx + w / 2} ${topY}
           L${cx + w / 2} ${topY - d * 0.3} Q${cx} ${topY - d * 0.08} ${cx - w / 2} ${topY - d * 0.3} Z"
    fill="${fill}" stroke="${edge}" stroke-width="${dash ? 2 : 4}" stroke-linejoin="round" ${dash}/>`;

/** ลูกศรโค้งบอกว่า "โยกได้" ข้างซ้าย-ขวาของฐาน */
const wobbleArrows = (cx, y, r) => `
  <g stroke="${LINE}" stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M${cx - r} ${y} q-38 -18 -58 -52"/>
    <path d="M${cx - r - 58} ${y - 52} l24 6 m-24 -6 l6 24"/>
    <path d="M${cx + r} ${y} q38 -18 58 -52"/>
    <path d="M${cx + r + 58} ${y - 52} l-24 6 m24 -6 l-6 24"/>
  </g>`;

const PX_PER_CM = 27; // 15cm = 405px
const GROUND = 590;
const MAX_CM = 15;

/** สัดส่วนจากภาพงานจริง: ฐานโยกกว้างเกือบเต็มขนาด · ตัวกลางสูงราว 78% ของขนาดรวม */
function geom(cm) {
  const total = cm * PX_PER_CM;
  const baseD = total * 0.22;
  const baseW = total * 0.95;
  const baseTop = GROUND - baseD;
  const bodyTop = GROUND - total;
  const bodyH = baseTop + 10 - bodyTop;
  const bodyW = bodyH * 0.8;
  return { total, baseD, baseW, baseTop, bodyTop, bodyH, bodyW };
}

function wobbleSize(cm) {
  const cx = 300;
  const g = geom(cm);
  const m = geom(MAX_CM);
  const ghost =
    cm < MAX_CM
      ? `${rocker(cx, m.baseTop, m.baseW, m.baseD, "none", "#cbd5e1", 'stroke-dasharray="8 8"')}
         <rect x="${cx - m.bodyW / 2}" y="${m.bodyTop}" width="${m.bodyW}" height="${m.bodyH}" rx="40"
           fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 8"/>`
      : "";
  return frame(`
    ${title(`ขนาด ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุด (ตัวกลาง + ฐานโยกเยก)")}
    ${ghost}
    <line x1="${cx - m.baseW / 2 - 30}" y1="${GROUND + 8}" x2="${cx + m.baseW / 2 + 30}" y2="${GROUND + 8}" stroke="#e2e8f0" stroke-width="4"/>
    ${wobbleArrows(cx, GROUND - g.baseD * 0.5, g.baseW / 2 + 8)}
    ${rocker(cx, g.baseTop, g.baseW, g.baseD)}
    <rect x="${cx - g.bodyW / 2}" y="${g.bodyTop}" width="${g.bodyW}" height="${g.bodyH}" rx="${Math.min(40, g.bodyH * 0.2)}"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(cx, g.bodyTop + g.bodyH * 0.38, g.bodyW, g.bodyH)}
    ${dimV(cx + m.baseW / 2 + 66, GROUND - g.total, GROUND, `${cm} ซม.`)}
    <text x="${W / 2}" y="${H - 58}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ตัวกลาง สกรีน 2 ด้าน · ฐานโยกเยก สกรีน 1 ด้าน · อะคริลิคหนา ~3 มม.</text>
    ${cm < MAX_CM ? `<text x="${W / 2}" y="${H - 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${LINE}">เส้นประ = ขนาดใหญ่สุด ${MAX_CM} ซม. (ไว้เทียบขนาด)</text>` : ""}`);
}

/** ภาพชี้ว่าชิ้นไหนคือ "ตัวกลาง" / "ฐานโยกเยก" */
function partShot(which) {
  const cx = 300;
  const g = geom(13);
  const on = which === "figure";
  const dim = "rgba(148,163,184,0.16)";
  const dimEdge = "#cbd5e1";
  const hotFill = "rgba(251,191,36,0.30)";
  const hotEdge = "#f59e0b";
  const tipY = on ? g.bodyTop + g.bodyH * 0.3 : g.baseTop + g.baseD * 0.75;
  const tipX = on ? cx + g.bodyW / 2 : cx + g.baseW / 2 - 30;
  return frame(`
    ${title(on ? "ตัวกลาง" : "ฐานโยกเยก", on ? "ตัวละคร/ลายด้านบน — สกรีน 2 ด้าน" : "ส่วนโค้งที่ทำให้โยกได้ — สกรีน 1 ด้าน")}
    <line x1="${cx - g.baseW / 2 - 30}" y1="${GROUND + 8}" x2="${cx + g.baseW / 2 + 30}" y2="${GROUND + 8}" stroke="#e2e8f0" stroke-width="4"/>
    ${rocker(cx, g.baseTop, g.baseW, g.baseD, on ? dim : hotFill, on ? dimEdge : hotEdge)}
    <rect x="${cx - g.bodyW / 2}" y="${g.bodyTop}" width="${g.bodyW}" height="${g.bodyH}" rx="40"
      fill="${on ? hotFill : dim}" stroke="${on ? hotEdge : dimEdge}" stroke-width="4"/>
    ${on ? artwork(cx, g.bodyTop + g.bodyH * 0.38, g.bodyW, g.bodyH) : ""}
    <path d="M${tipX} ${tipY} L${tipX + 92} ${tipY - 44}" stroke="${hotEdge}" stroke-width="3"/>
    <circle cx="${tipX}" cy="${tipY}" r="8" fill="${hotEdge}"/>
    <text x="${tipX + 100}" y="${tipY - 36}" font-family="${TH}" font-size="30" font-weight="700" fill="${hotEdge}">${on ? "ตัวกลาง" : "ฐานโยกเยก"}</text>
    <text x="${W / 2}" y="${H - 44}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">เลือก “อะคริลิคพิเศษ” เฉพาะชิ้นที่ต้องการได้ — คิดเพิ่มแยกชิ้น</text>`);
}

const svgs = {
  ...Object.fromEntries([10, 11, 12, 13, 14, 15].map((cm) => [`size-${cm}`, wobbleSize(cm)])),
  "part-figure": partShot("figure"),
  "part-base": partShot("base"),
};
for (const [name, svg] of Object.entries(svgs)) {
  await sharp(Buffer.from(svg)).png().resize(700, 700).jpeg({ quality: 90 }).toFile(`${OUT}/${name}.jpg`);
}

console.log(`✅ ${GALLERY.length} ภาพงานจริง · ${Object.keys(svgs).length} ภาพวาด → ${OUT}`);
