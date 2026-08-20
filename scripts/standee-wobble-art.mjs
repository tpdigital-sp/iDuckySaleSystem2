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
 *   3. color-*             สีอะคริลิค — ครอปจากชาร์ตหน้า /coloracrylic ของเว็บตารางราคา
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

// ── 3. สีอะคริลิค — ครอปจากชาร์ต /coloracrylic ────────────────────────────
const CHART = await grab("chart.jpg", `${WIX}/959b83_ece384645d784b25ab624c67f2cbd4d8~mv2.jpg`); // 2000×2162

/** [x1,y1,x2,y2] บนภาพชาร์ตต้นฉบับ */
const SWATCH = {
  // แผงซ้าย — ฝั่งหนึ่งผิวด้าน ฝั่งหนึ่งผิวเงา
  "color-c01": [170, 148, 316, 309],
  "color-w": [517, 148, 659, 309],
  "color-b": [108, 313, 271, 480],
  "color-r": [286, 313, 440, 480],
  "color-g": [455, 313, 608, 480],
  "color-bk": [621, 313, 780, 480],
  "color-p": [108, 484, 271, 652],
  "color-y": [286, 484, 440, 652],
  "color-or": [455, 484, 608, 652],
  "color-gr": [621, 484, 780, 652],
  "color-or02": [601, 656, 780, 773],
  // แผงขวา — ผิวเงาทั้ง 2 ด้าน
  "color-601": [872, 134, 1063, 307],
  "color-603": [1074, 134, 1262, 307],
  "color-605": [1273, 134, 1460, 307],
  "color-606": [1488, 134, 1681, 307],
  "color-610": [1696, 134, 1886, 307],
  "color-611": [872, 318, 1063, 481],
  "color-612": [1074, 318, 1262, 481],
  "color-619": [1273, 318, 1460, 481],
  "color-621": [1488, 318, 1681, 481],
  "color-622": [1696, 318, 1886, 481],
  "color-626": [872, 498, 1063, 660],
  "color-137": [1074, 498, 1262, 660],
  "color-235": [1311, 498, 1500, 660],
  "color-206": [1544, 498, 1746, 660],
  // กลิตเตอร์ / โฮโลแกรม / กระจก
  "color-glitter-silver": [738, 837, 1108, 1097],
  "color-glitter-gold": [1122, 837, 1550, 1097],
  "color-glitter-rainbow": [1567, 837, 1967, 1097],
  "color-c02": [92, 837, 708, 1417],
  "color-holo-01": [733, 1125, 1033, 1425],
  "color-holo-02": [1050, 1125, 1525, 1425],
  "color-mirror": [1550, 1125, 1967, 1425],
  "color-holo-star": [100, 1587, 550, 2050],
  "color-holo-rainbow": [580, 1587, 892, 2050],
  "color-holo-snow": [933, 1587, 1317, 2050],
  "color-holo-dot": [1350, 1587, 1900, 2050],
};

for (const [name, [x1, y1, x2, y2]] of Object.entries(SWATCH)) {
  await sharp(CHART)
    .extract({ left: x1, top: y1, width: x2 - x1, height: y2 - y1 })
    .resize(420, 420, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88 })
    .toFile(`${OUT}/${name}.jpg`);
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
 * cx,cy = จุดกึ่งกลางขอบบนของฐาน · w = ความกว้าง · d = ความลึกของส่วนโค้ง
 */
const rocker = (cx, cy, w, d, fill = GLASS, edge = GLASS_EDGE) => `
  <path d="M${cx - w / 2} ${cy} Q${cx} ${cy + d * 2.1} ${cx + w / 2} ${cy} L${cx + w / 2} ${cy - d * 0.34} Q${cx} ${cy - d * 0.1} ${cx - w / 2} ${cy - d * 0.34} Z"
    fill="${fill}" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>`;

/** พื้นโต๊ะ + ลูกศรโยกซ้าย-ขวา */
const wobbleHint = (cx, y, w) => `
  <line x1="${cx - w}" y1="${y}" x2="${cx + w}" y2="${y}" stroke="#e2e8f0" stroke-width="4"/>
  <path d="M${cx - w * 0.72} ${y - 34} q${w * 0.2} -26 ${w * 0.4} 0" stroke="${LINE}" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="7 7"/>
  <path d="M${cx + w * 0.32} ${y - 34} q${w * 0.2} -26 ${w * 0.4} 0" stroke="${LINE}" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="7 7"/>`;

const PX_PER_CM = 30; // 15cm = 450px
const GROUND = 600;
const MAX_CM = 15;

/** สัดส่วนจากภาพงานจริง: ตัวกลางสูงราว 62% ของขนาดรวม · ฐานกว้างเต็มขนาด */
function wobbleSize(cm) {
  const total = cm * PX_PER_CM;
  const cx = 300;
  const baseW = total * 0.98;
  const baseD = total * 0.2;
  const baseTop = GROUND - baseD * 0.9;
  const bodyH = total * 0.66;
  const bodyW = bodyH * 0.82;
  const bodyBottom = baseTop + 6;
  const bodyTop = bodyBottom - bodyH;
  const ghost = MAX_CM * PX_PER_CM;
  return frame(`
    ${title(`ขนาด ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุด (ตัวกลาง + ฐานโยกเยก)")}
    <!-- เงาเทียบขนาดใหญ่สุด 15 ซม. -->
    <rect x="${cx - ghost / 2}" y="${GROUND - ghost}" width="${ghost}" height="${ghost}" rx="34"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>
    ${wobbleHint(cx, GROUND + 16, ghost / 2 + 14)}
    ${rocker(cx, baseTop, baseW, baseD)}
    <rect x="${cx - bodyW / 2}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" rx="${Math.min(40, bodyH * 0.2)}"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(cx, bodyTop + bodyH * 0.42, bodyW, bodyH)}
    ${dimV(cx + ghost / 2 + 30, GROUND - total, GROUND, `${cm} ซม.`)}
    <text x="${W / 2}" y="${H - 62}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ตัวกลาง สกรีน 2 ด้าน · ฐานโยกเยก สกรีน 1 ด้าน · อะคริลิคหนา ~3 มม.</text>
    ${cm < MAX_CM ? `<text x="${W / 2}" y="${H - 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${LINE}">เส้นประ = ขนาดใหญ่สุด ${MAX_CM} ซม. (ไว้เทียบขนาด)</text>` : ""}`);
}

/** ภาพชี้ว่าชิ้นไหนคือ "ตัวกลาง" / "ฐานโยกเยก" */
function partShot(which) {
  const cx = 330;
  const total = 12 * PX_PER_CM;
  const baseW = total * 0.98;
  const baseD = total * 0.2;
  const baseTop = GROUND - baseD * 0.9;
  const bodyH = total * 0.66;
  const bodyW = bodyH * 0.82;
  const bodyBottom = baseTop + 6;
  const bodyTop = bodyBottom - bodyH;
  const on = which === "figure";
  const dim = "rgba(148,163,184,0.18)";
  const dimEdge = "#cbd5e1";
  const hotFill = "rgba(251,191,36,0.30)";
  const hotEdge = "#f59e0b";
  return frame(`
    ${title(on ? "ตัวกลาง" : "ฐานโยกเยก", on ? "ตัวละคร/ลายด้านบน — สกรีน 2 ด้าน" : "ส่วนโค้งที่ทำให้โยกได้ — สกรีน 1 ด้าน")}
    ${wobbleHint(cx, GROUND + 16, baseW / 2 + 26)}
    ${rocker(cx, baseTop, baseW, baseD, on ? dim : hotFill, on ? dimEdge : hotEdge)}
    <rect x="${cx - bodyW / 2}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" rx="40"
      fill="${on ? hotFill : dim}" stroke="${on ? hotEdge : dimEdge}" stroke-width="4"/>
    ${on ? artwork(cx, bodyTop + bodyH * 0.42, bodyW, bodyH) : ""}
    <!-- ป้ายชี้ชิ้นที่พูดถึง -->
    <line x1="${on ? cx + bodyW / 2 + 8 : cx + baseW / 2 + 8}" y1="${on ? bodyTop + bodyH * 0.4 : baseTop + baseD * 0.7}"
      x2="600" y2="${on ? 250 : 470}" stroke="${hotEdge}" stroke-width="3"/>
    <circle cx="600" cy="${on ? 250 : 470}" r="9" fill="${hotEdge}"/>
    <text x="${W / 2}" y="${H - 52}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">
      เลือก “อะคริลิคพิเศษ” เฉพาะชิ้นที่ต้องการได้ — คิดเพิ่มแยกชิ้น</text>`);
}

const svgs = {
  ...Object.fromEntries([10, 11, 12, 13, 14, 15].map((cm) => [`size-${cm}`, wobbleSize(cm)])),
  "part-figure": partShot("figure"),
  "part-base": partShot("base"),
};
for (const [name, svg] of Object.entries(svgs)) {
  await sharp(Buffer.from(svg)).png().resize(700, 700).jpeg({ quality: 90 }).toFile(`${OUT}/${name}.jpg`);
}

console.log(`✅ ${GALLERY.length} ภาพงานจริง · ${Object.keys(SWATCH).length} สีอะคริลิค · ${Object.keys(svgs).length} ภาพวาด → ${OUT}`);
