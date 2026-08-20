#!/usr/bin/env node
/**
 * เตรียมภาพของสินค้า "สแตนดี้ + พวงกุญแจ"
 *
 *   node scripts/standee-keyring-art.mjs [--out=<dir>]
 *
 * ได้ 3 ชุด แล้วให้ scripts/add-standee-keyring.ts --upload อัปขึ้น Supabase Storage:
 *
 *   1. ภาพงานจริงจากเว็บตารางราคา (iduckyofficial-pricelists.com)
 *      photo-keyring   ช่องอะไหล่ "สแตนดี้ + พวงกุญแจ" บนหน้า /pricestandy (งานจริง)
 *      photo-ex1/ex2   ตัวอย่างงานพวงกุญแจอะคริลิค (เห็นตะขอกับโซ่ของจริง)
 *      photo-1/2       ตัวอย่างงานสแตนดี้พร้อมฐาน
 *      color-chart     ชาร์ตสีอะคริลิคของร้าน
 *      hookchart-*     ชาร์ตตะขอรายตัวของร้าน (ใช้ในแท็บ "ตะขอ / อะไหล่")
 *
 *   2. ภาพตะขอรายแบบ 31 ตัว — ครอปจาก "ชาร์ตอะไหล่ ตะขอ พวงกุญแจ" ของร้านโดยตรง
 *      hook-Z1 … hook-BC   (ของจริง ไม่ใช่ภาพวาด — เห็นทั้งทรงและราคาบนป้าย)
 *      ⚠️ พิกัดครอปอ้างชาร์ตต้นฉบับขนาด 1675×2000 (ดู MASTER/HOOK_BOX) — ถ้าร้านเปลี่ยนชาร์ต ต้องวัดใหม่
 *
 *   3. ภาพวาด SVG (เรนเดอร์ด้วย sharp ให้สไตล์เดียวกันทั้งชุด)
 *      hero                  ภาพอธิบายสินค้า (ตัวสแตนดี้ + ฐาน + รูเจาะ + ตะขอ)
 *      hole-detail           รูเจาะสำหรับห้อยพวงกุญแจอยู่ตรงไหน ถอดจากฐานได้ยังไง
 *      size-3..size-20       ขนาดตัวสแตนดี้ (สเกลจริง แนวตั้ง+แนวนอนในภาพเดียว)
 *      base-3..base-20       ขนาดฐาน (มองจากด้านบน เทียบฐาน 3-5 ซม.)
 *      basescreen-no|yes     ฐานสกรีนลาย / ไม่สกรีน
 *      baseshape-*           ทรงฐาน (กลม / สี่เหลี่ยม / ไดคัทตามทรง)
 *      screen-1|screen-2     งานสกรีน 1 ด้าน / 2 ด้าน
 *      layout-portrait|landscape  ตัวสแตนดี้แนวตั้ง / แนวนอน
 *      clear                 อะคริลิคใส (ตัวเลือกสีมาตรฐาน)
 *      hookcolor-*           สีตะขอรายสี (~190 สี) — วาดทรงตะขอตามตระกูลแล้วลงสีจริง
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องขึ้น REV ใหม่ที่สคริปต์ add-
 */
import { mkdirSync, existsSync, copyFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/keyring/upload").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const SRC = ".cache/keyring/src";
const FULL = ".cache/keyring/full";
const CLIP = ".cache/clip/upload";

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

const foot = (lines) =>
  lines
    .map(
      (t, i) =>
        `<text x="${W / 2}" y="${H - 40 - (lines.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y1}" x2="${x + 12}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y2}" x2="${x + 12}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 18}" y="${(y1 + y2) / 2 + 10}" font-family="${TH}" font-size="29" font-weight="700" fill="${CYAN}">${label}</text>`;

const dimVLeft = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x - 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${CYAN}">${label}</text>`;

const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 42}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** ลายสกรีนจำลองบนตัวสแตนดี้ */
const artwork = (cx, cy, w, h) => {
  const u = Math.min(w, h);
  return `
  <g opacity="0.9">
    <circle cx="${cx}" cy="${cy - h * 0.06}" r="${u * 0.19}" fill="#fbbf24"/>
    <circle cx="${cx - u * 0.09}" cy="${cy - h * 0.09}" r="${u * 0.035}" fill="#0f172a"/>
    <circle cx="${cx + u * 0.09}" cy="${cy - h * 0.09}" r="${u * 0.035}" fill="#0f172a"/>
    <path d="M${cx - u * 0.075} ${cy + h * 0.01} q${u * 0.075} ${u * 0.07} ${u * 0.15} 0" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M${cx - w * 0.24} ${cy + h * 0.22} q${w * 0.24} ${h * 0.13} ${w * 0.48} 0" stroke="#f472b6" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>`;
};

/** ฐานอะคริลิคมองแบบเฉียง */
const baseSideView = (cx, cy, rx, screened = false) => {
  const ry = rx * 0.26;
  const th = 15;
  const fill = screened ? "rgba(13,148,136,0.20)" : GLASS;
  const edge = screened ? "#0d9488" : GLASS_EDGE;
  return `
    <path d="M${cx - rx} ${cy} v${th} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${th} z" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <rect x="${cx - rx * 0.42}" y="${cy - 7}" width="${rx * 0.84}" height="13" rx="6" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`;
};

/**
 * รูเจาะ + ห่วง/ตะขอที่ขอบบนของตัวงาน
 * รูเจาะอยู่ "ในเนื้ออะคริลิค" (ไม่ล้ำพ้นขอบ) · ห่วงคล้องออกมานอกตัวงาน
 * r = รัศมีรู · ringR = รัศมีห่วง
 */
const hangHole = (cx, topY, r, ringR) => `
  <circle cx="${cx}" cy="${topY + r * 2.1}" r="${r}" fill="#ffffff" stroke="${LINE}" stroke-width="${Math.max(2, r * 0.34)}"/>
  <circle cx="${cx}" cy="${topY - ringR * 0.72}" r="${ringR}" fill="none" stroke="#a1a1aa" stroke-width="${Math.max(3, ringR * 0.28)}"/>
  <circle cx="${cx}" cy="${topY - ringR * 0.72}" r="${ringR}" fill="none" stroke="#e4e4e7" stroke-width="${Math.max(1, ringR * 0.1)}"/>`;

const png = async (name, svg) => {
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(`${OUT}/${name}.jpg`);
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. ภาพงานจริง / ชาร์ตของร้าน
// ═══════════════════════════════════════════════════════════════════════════

/** ชาร์ตอะไหล่ตะขอตัวใหญ่ของร้าน (ต้นฉบับ 1675×2000) */
const MASTER = `${FULL}/959b83_0674be7630284ffe8e65facbacca83fe.jpg`;

/** ชาร์ตตะขอรายตัว — ใช้ทั้งเป็นภาพในแท็บ และเป็นที่มาของสีในกลุ่มนั้น */
const HOOK_CHARTS = {
  c: "959b83_44f87a38028f452b8420727df4a3e101",
  g: "959b83_3c578955eee9427d97f9de5afbb06bf3",
  h: "959b83_56c9b01b46b04622aadfc3ec6576f452",
  i: "959b83_6ee27c2cf3f14041930616919d4c5e35",
  r: "959b83_3aa53d73bab442cfaae2795834c87e78",
  s: "959b83_69146f7acbbc47eb915b3ee7bbe79aff",
  t: "959b83_b81081e12de440878ce2b558f849b1c7",
  u: "959b83_081bb61efb924f99898680c0904137c3",
  w: "959b83_68b2c038023e4b60b0b3d3c75b5b28b9",
  aa: "959b83_9cecebf8dccf47c4bd6e27843258d9fb",
  ab: "959b83_45e83a0c7e71428fad8f4cf3f2d96b65",
  bb: "959b83_63b0a7510e1a4d48a475051b12d17d17",
  bc: "959b83_c2b08abe39e54c2989377f903d77d165",
};

/**
 * กล่องของตะขอแต่ละแบบบนชาร์ตใหญ่ [x, y, w, h] — วัดจากไฟล์ต้นฉบับ 1675×2000
 * (ครอปแล้วใส่พื้นขาวให้เป็นจัตุรัส เพื่อให้ทุกใบสูงเท่ากันในหน้าเลือกตัวเลือก)
 */
export const HOOK_BOX = {
  Z1: [119, 55, 88, 155],
  Z2: [205, 55, 90, 155],
  A: [290, 55, 150, 155],
  B: [448, 55, 138, 155],
  C: [588, 55, 200, 155],
  D: [790, 55, 198, 155],
  E: [990, 55, 124, 155],
  F: [1116, 55, 424, 155],
  G: [272, 220, 268, 296],
  H: [584, 220, 352, 268],
  I: [958, 214, 312, 254],
  J: [88, 522, 374, 150],
  K: [470, 522, 370, 150],
  L: [848, 522, 372, 150],
  M: [1228, 522, 372, 150],
  N: [123, 690, 394, 145],
  O: [528, 690, 366, 145],
  P: [955, 688, 116, 145],
  Q: [1075, 688, 118, 145],
  R: [1197, 688, 298, 145],
  S: [80, 850, 306, 296],
  T: [411, 850, 300, 296],
  U: [735, 850, 306, 296],
  V: [1046, 852, 334, 144],
  W: [82, 1157, 308, 302],
  X: [402, 1172, 227, 164],
  AA: [645, 1157, 309, 302],
  AB: [965, 1157, 308, 302],
  AC: [1285, 1157, 308, 302],
  BB: [927, 1469, 311, 341],
  BC: [1262, 1469, 316, 341],
};

async function photos() {
  const square = async (src, name, size = 900) => {
    if (!existsSync(src)) {
      console.warn(`   ⚠️  ข้าม ${name} — ไม่พบไฟล์ต้นฉบับ ${src}`);
      return;
    }
    await sharp(src)
      .resize(size, size, { fit: "contain", background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toFile(`${OUT}/${name}.jpg`);
  };

  // ช่องอะไหล่ "สแตนดี้ + พวงกุญแจ" — ตัดเอาเฉพาะภาพงานจริง ไม่เอาแถบหัวเรื่องด้านล่าง
  const acc = `${SRC}/acc-1e89377ebaef465fac73089e6190148b.jpg`;
  if (existsSync(acc)) {
    await sharp(acc)
      .extract({ left: 0, top: 0, width: 800, height: 640 })
      .resize(900, 900, { fit: "contain", background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toFile(`${OUT}/photo-keyring.jpg`);
  }
  await square(`${SRC}/ex-dfda2f044ab94bb69e263b97b801c8a7.jpg`, "photo-ex1");
  await square(`${SRC}/ex-ed49cabdbfd34944a20bbd7ecd457adf.jpg`, "photo-ex2");

  // ภาพงานสแตนดี้ + ชาร์ตสี ใช้ชุดเดียวกับสินค้าพี่น้อง (สแตนดี้ + คลิปหนีบ)
  for (const n of ["photo-1", "photo-2", "color-chart"]) {
    if (existsSync(`${CLIP}/${n}.jpg`)) copyFileSync(`${CLIP}/${n}.jpg`, `${OUT}/${n}.jpg`);
    else console.warn(`   ⚠️  ข้าม ${n} — ไม่พบ ${CLIP}/${n}.jpg (รัน scripts/standee-clip-art.mjs ก่อน)`);
  }

  // ชาร์ตอะไหล่ตะขอตัวใหญ่ + ชาร์ตรายตัว
  await square(MASTER, "hook-chart", 1400);
  for (const [key, id] of Object.entries(HOOK_CHARTS)) {
    await square(`${FULL}/${id}.jpg`, `hookchart-${key}`, 1200);
  }

  // ตะขอรายแบบ — ครอปจากชาร์ตใหญ่
  for (const [code, b] of Object.entries(HOOK_BOX)) {
    await sharp(MASTER)
      .extract({ left: b[0], top: b[1], width: b[2], height: b[3] })
      .resize(640, 640, { fit: "contain", background: "#ffffff" })
      .jpeg({ quality: 92 })
      .toFile(`${OUT}/hook-${code}.jpg`);
  }
  console.log(`🖼  ภาพงานจริง/ชาร์ต + ตะขอ ${Object.keys(HOOK_BOX).length} แบบ`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ภาพวาดตัวเลือกฝั่งสแตนดี้
// ═══════════════════════════════════════════════════════════════════════════

const SIZES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const PX_PER_CM = 13;
const GROUND = 500;
/** สัดส่วนด้านสั้นต่อด้านยาวของตัวงาน */
const RATIO = 0.72;

async function sizeArt() {
  for (const cm of SIZES) {
    const long = cm * PX_PER_CM;
    const short = long * RATIO;
    // แนวตั้ง (ซ้าย) — สูง = ขนาดที่สั่ง · แนวนอน (ขวา) — กว้าง = ขนาดที่สั่ง
    const pW = short;
    const pH = long;
    const lW = long;
    const lH = short;
    const pcx = 218;
    const lcx = 486;
    const pTop = GROUND - pH;
    const lTop = GROUND - lH;
    const holeR = Math.max(3.2, cm * 0.42);
    const ringR = Math.max(7, cm * 1.05);

    const body = `
      ${title(`ตัวสแตนดี้ ${cm} ซม.`, "ทำได้ทั้งแนวตั้งและแนวนอน ราคาเท่ากัน")}
      <line x1="52" y1="${GROUND}" x2="${W - 52}" y2="${GROUND}" stroke="#e2e8f0" stroke-width="3"/>

      <rect x="${pcx - pW / 2}" y="${pTop}" width="${pW}" height="${pH}" rx="${Math.min(14, pW * 0.16)}"
        fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
      ${artwork(pcx, pTop + pH * 0.52, pW, pH)}
      ${hangHole(pcx, pTop, holeR, ringR)}
      ${baseSideView(pcx, GROUND, Math.max(46, pW * 0.62))}
      ${dimVLeft(pcx - pW / 2 - 26, pTop, GROUND - 4, `${cm} ซม.`)}
      <text x="${pcx}" y="${GROUND + 48}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">แนวตั้ง</text>

      <rect x="${lcx - lW / 2}" y="${lTop}" width="${lW}" height="${lH}" rx="${Math.min(14, lH * 0.16)}"
        fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
      ${artwork(lcx, lTop + lH * 0.52, lW, lH)}
      ${hangHole(lcx, lTop, holeR, ringR)}
      ${baseSideView(lcx, GROUND, Math.max(46, lW * 0.5))}
      ${dimH(GROUND + 26, lcx - lW / 2, lcx + lW / 2, `${cm} ซม.`)}
      <text x="${lcx}" y="${GROUND + 102}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">แนวนอน</text>

      ${foot(["ขนาดที่สั่ง = ด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)", "รูเจาะห้อยพวงกุญแจอยู่ชิดขอบบน — ไม่ล้ำพ้นเนื้ออะคริลิค"])}`;
    await png(`size-${cm}`, frame(body));
  }
  console.log(`📐 ขนาดตัวสแตนดี้ ${SIZES.length} ใบ`);
}

/** ขนาดฐานที่เปิดให้เลือก (ตรงกับตาราง "ราคาฐาน สแตนดี้" ของร้าน) */
const BASE_KEYS = [3, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const BASE_CM = { 3: 4, 6: 6.5 };
const baseCm = (k) => BASE_CM[k] ?? k;
const baseName = (k) => (k === 3 ? "ฐาน 3-5 ซม." : k === 6 ? "ฐาน 6-7 ซม." : `ฐาน ${k} ซม.`);

async function baseArt() {
  const PPC = 15;
  for (const k of BASE_KEYS) {
    const r = (baseCm(k) * PPC) / 2;
    const refR = (4 * PPC) / 2;
    const cy = 360;
    const body = `
      ${title(baseName(k), "มองจากด้านบน · เทียบกับฐานเล็กสุด (3-5 ซม.)")}
      <circle cx="${W / 2}" cy="${cy}" r="${refR}" fill="none" stroke="${LINE}" stroke-width="2" stroke-dasharray="7 7"/>
      <circle cx="${W / 2}" cy="${cy}" r="${r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
      <rect x="${W / 2 - r * 0.5}" y="${cy - 8}" width="${r}" height="16" rx="8" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
      <text x="${W / 2}" y="${cy - 28}" font-family="${TH}" font-size="18" text-anchor="middle" fill="${SUB}">ร่องเสียบตัวงาน</text>
      ${dimH(cy + r + 46, W / 2 - r, W / 2 + r, `${baseCm(k)} ซม.`)}
      ${foot([
        "ตัวยิ่งสูง ยิ่งควรใช้ฐานใหญ่ขึ้นเพื่อให้ตั้งมั่นคง",
        "1-10 ชิ้น ราคาในตารางรวมค่าฐานมาแล้ว · 11 ชิ้นขึ้นไปคิดตามขนาดฐาน",
      ])}`;
    await png(`base-${k}`, frame(body));
  }
  console.log(`🧊 ขนาดฐาน ${BASE_KEYS.length} ใบ`);
}

async function optionArt() {
  const standee = (cx, topY, w, h, opts = {}) => `
    <rect x="${cx - w / 2}" y="${topY}" width="${w}" height="${h}" rx="16"
      fill="${opts.fill || GLASS}" stroke="${opts.edge || GLASS_EDGE}" stroke-width="3"/>
    ${opts.art === false ? "" : artwork(cx, topY + h * 0.5, w, h)}
    ${hangHole(cx, topY, 7, 18)}`;

  // ── ฐานสกรีน / ไม่สกรีน ────────────────────────────────────────────────
  for (const [name, screened, label, note] of [
    ["basescreen-no", false, "ไม่สกรีนฐาน", "ฐานอะคริลิคใส ปล่อยเปล่า"],
    ["basescreen-yes", true, "สกรีนลายฐาน", "พิมพ์ลาย/ข้อความลงบนฐานด้วย"],
  ]) {
    const body = `
      ${title(label, note)}
      ${standee(W / 2, 232, 150, 210)}
      ${baseSideView(W / 2, 470, 132, screened)}
      ${screened ? `<text x="${W / 2}" y="${476}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#0f766e">ลายบนฐาน</text>` : ""}
      ${foot(
        screened
          ? ["11 ชิ้นขึ้นไป คิดเพิ่มตามขนาดฐาน (20-90 บาท/ชิ้น)", "1-10 ชิ้น รวมอยู่ในราคาตารางแล้ว"]
          : ["11 ชิ้นขึ้นไป คิดเพิ่มตามขนาดฐาน (10-80 บาท/ชิ้น)", "1-10 ชิ้น รวมอยู่ในราคาตารางแล้ว"]
      )}`;
    await png(name, frame(body));
  }

  // ── ทรงฐาน ─────────────────────────────────────────────────────────────
  const shapeTop = (kind) => {
    const cx = W / 2;
    const cy = 350;
    if (kind === "round") return `<ellipse cx="${cx}" cy="${cy}" rx="150" ry="46" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>`;
    if (kind === "square")
      return `<rect x="${cx - 150}" y="${cy - 46}" width="300" height="92" rx="10" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>`;
    return `<path d="M${cx - 152} ${cy + 12} q22 -58 74 -40 q18 -50 78 -34 q56 -34 92 14 q46 -6 40 44 q-8 40 -60 40 h-172 q-58 0 -52 -44 z"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>`;
  };
  for (const [name, kind, label, note, fee] of [
    ["baseshape-round", "round", "ฐานทรงกลม", "ทรงมาตรฐาน", "ไม่บวกเพิ่ม"],
    ["baseshape-square", "square", "ฐานทรงสี่เหลี่ยม", "ทรงมาตรฐาน", "ไม่บวกเพิ่ม"],
    ["baseshape-special", "special", "ฐานทรงพิเศษ", "ไดคัทตามทรงที่ออกแบบ", "1-10 ชิ้น +10 · 11 ชิ้นขึ้นไป +5 บาท/ชิ้น"],
  ]) {
    const body = `
      ${title(label, note)}
      ${shapeTop(kind)}
      <rect x="${W / 2 - 78}" y="${342}" width="156" height="16" rx="8" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
      <text x="${W / 2}" y="${430}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">มองจากด้านบน</text>
      ${foot([fee])}`;
    await png(name, frame(body));
  }

  // ── งานสกรีน 1 / 2 ด้าน ────────────────────────────────────────────────
  for (const [name, two] of [
    ["screen-1", false],
    ["screen-2", true],
  ]) {
    const body = `
      ${title(two ? "สกรีน 2 ด้าน" : "สกรีน 1 ด้าน", two ? "มีลายทั้งด้านหน้าและด้านหลัง" : "มีลายเฉพาะด้านหน้า")}
      ${standee(214, 232, 150, 210)}
      <text x="214" y="${480}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
      ${
        two
          ? standee(486, 232, 150, 210)
          : `<rect x="${486 - 75}" y="232" width="150" height="210" rx="16" fill="rgba(148,163,184,0.12)" stroke="${LINE}" stroke-width="3" stroke-dasharray="9 8"/>
             ${hangHole(486, 232, 7, 18)}
             <text x="486" y="345" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ไม่มีลาย</text>`
      }
      <text x="486" y="${480}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${two ? INK : SUB}">ด้านหลัง</text>
      ${foot(
        two
          ? ["บวกเพิ่มตามขนาด — 3-5 ซม. +10 · 6-7 +15 · 8-10 +25", "11-13 +30 · 14-16 +35 · 17 ซม.ขึ้นไป +5 บาทต่อ ซม."]
          : ["ราคามาตรฐานตามตาราง ไม่บวกเพิ่ม"]
      )}`;
    await png(name, frame(body));
  }

  // ── แนววางงาน ──────────────────────────────────────────────────────────
  for (const [name, portrait] of [
    ["layout-portrait", true],
    ["layout-landscape", false],
  ]) {
    const w = portrait ? 156 : 260;
    const h = portrait ? 240 : 150;
    const top = 400 - h;
    const body = `
      ${title(portrait ? "แนวตั้ง" : "แนวนอน", "ขนาดที่สั่งคือด้านที่ยาวที่สุดของทั้งสองแนว")}
      ${standee(W / 2, top, w, h)}
      ${baseSideView(W / 2, 400 + 8, portrait ? 104 : 142)}
      ${foot(["ราคาเท่ากันทั้งสองแนว", "รูเจาะห้อยพวงกุญแจอยู่ชิดขอบบนเหมือนกัน"])}`;
    await png(name, frame(body));
  }

  // ── อะคริลิคใส ─────────────────────────────────────────────────────────
  await png(
    "clear",
    frame(`
      ${title("อะคริลิคใส / ขาวขุ่น C-02", "ชนิดมาตรฐาน หนาประมาณ 3 มม.")}
      <rect x="${W / 2 - 110}" y="200" width="220" height="240" rx="18" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
      ${artwork(W / 2, 320, 220, 240)}
      ${hangHole(W / 2, 200, 8, 20)}
      ${foot(["ราคาตามตารางคือชนิดนี้ ไม่บวกเพิ่ม", "อยากได้สี/กลิตเตอร์/โฮโลแกรม เลือกอะคริลิคพิเศษได้"])}`)
  );

  // ── hero ───────────────────────────────────────────────────────────────
  await png(
    "hero",
    frame(`
      ${title("สแตนดี้ + พวงกุญแจ", "ตั้งโชว์บนฐานก็ได้ ถอดห้อยเป็นพวงกุญแจก็ได้")}
      <rect x="150" y="205" width="180" height="250" rx="18" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
      ${artwork(240, 340, 180, 250)}
      ${hangHole(240, 205, 9, 22)}
      ${baseSideView(240, 480, 122)}
      <text x="240" y="546" font-family="${TH}" font-size="22" text-anchor="middle" fill="${INK}">ตั้งบนฐาน</text>

      <path d="M370 340 h56" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/>
      <path d="M414 328 l16 12 l-16 12" fill="none" stroke="${LINE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>

      <rect x="${470 - 90}" y="255" width="180" height="250" rx="18" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
      ${artwork(470, 390, 180, 250)}
      ${hangHole(470, 255, 9, 22)}
      <path d="M470 195 q-42 6 -42 34" fill="none" stroke="#a1a1aa" stroke-width="7" stroke-linecap="round"/>
      <text x="470" y="546" font-family="${TH}" font-size="22" text-anchor="middle" fill="${INK}">ห้อยเป็นพวงกุญแจ</text>

      ${foot(["สั่ง 1-10 ชิ้น ราคารวม ตัวสแตนดี้ + ฐาน + รูเจาะ + ตะขอ ครบแล้ว"])}`)
  );

  // ── รายละเอียดรูเจาะ ───────────────────────────────────────────────────
  await png(
    "hole-detail",
    frame(`
      ${title("รูเจาะสำหรับห้อยพวงกุญแจ", "เจาะที่ขอบบนของตัวงาน อยู่ในเนื้ออะคริลิค")}
      <rect x="${W / 2 - 120}" y="215" width="240" height="260" rx="18" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
      ${artwork(W / 2, 360, 240, 260)}
      ${hangHole(W / 2, 215, 12, 27)}
      <line x1="${W / 2 + 22}" y1="240" x2="${W / 2 + 150}" y2="212" stroke="${CYAN}" stroke-width="3"/>
      <text x="${W / 2 + 156}" y="208" font-family="${TH}" font-size="21" fill="${CYAN}">รูเจาะ</text>
      <line x1="${W / 2 - 22}" y1="196" x2="${W / 2 - 158}" y2="172" stroke="${CYAN}" stroke-width="3"/>
      <text x="${W / 2 - 164}" y="168" font-family="${TH}" font-size="21" text-anchor="end" fill="${CYAN}">ตะขอ/ห่วง</text>
      ${foot([
        "ขนาดที่สั่งไม่นับรวมรูตะขอ — อยากให้นับรวมแจ้งได้",
        "เลี่ยงวางตัวหนังสือ/รายละเอียดสำคัญตรงจุดเจาะรู",
      ])}`)
  );

  console.log("🎨 ภาพวาดตัวเลือกสแตนดี้ 12 ใบ");
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ภาพสีตะขอ — วาดทรงตะขอตามตระกูล แล้วลงสีจริง
// ═══════════════════════════════════════════════════════════════════════════

/** ชื่อสีของร้าน → โค้ดสีที่ใช้วาด */
const HEX = {
  สีขาว: "#f8fafc",
  สีใส: "#e6f0f6",
  สีครีม: "#f4e7c8",
  สีเบจ: "#ddc9a8",
  สีเทาอ่อน: "#c3c8ce",
  สีเทาเข้ม: "#6b7280",
  สีดำ: "#1f2328",
  สีน้ำตาล: "#7b4a2d",
  สีส้ม: "#f97316",
  สีส้มเข้ม: "#ea580c",
  สีพีช: "#f3a68a",
  สีเหลือง: "#facc15",
  สีเหลืองอ่อน: "#f5e6a3",
  สีเหลืองเข้ม: "#eab308",
  สีเขียว: "#22a34a",
  สีเขียวอ่อน: "#a7e07a",
  สีเขียวเข้ม: "#15803d",
  สีเขียวกรม: "#2f6b4f",
  สีเขียวมิ้นท์: "#7fdec4",
  สีมิ้นท์: "#7fdec4",
  สีเขียวเงา: "#3fbf86",
  สีฟ้า: "#38bdf8",
  สีฟ้าอ่อน: "#8ed8f6",
  "สีฟ้าอ่อน (มิ้นท์)": "#93e0dd",
  สีฟ้าเข้ม: "#0ea5e9",
  สีฟ้าเงา: "#3ab6e6",
  สีน้ำเงิน: "#2445c9",
  สีน้ำเงินเข้ม: "#1b2f8f",
  สีม่วง: "#8b5cf6",
  สีม่วงอ่อน: "#c4a8f5",
  สีม่วงเข้ม: "#6d3bd1",
  สีม่วงอ่อนเงา: "#b596ec",
  สีม่วงเข้มเงา: "#7b45cf",
  สีชมพู: "#f472b6",
  สีชมพูอ่อน: "#f9b7d2",
  สีชมพูเข้ม: "#e2418c",
  สีชมพูพีช: "#f0a3a3",
  สีชมพูบานเย็น: "#d81b7a",
  สีชมพูเงา: "#ef5fa5",
  สีแดง: "#dc2626",
  สีเงิน: "#c8ccd2",
  สีทอง: "#d9ae51",
  สีโรสโกลด์: "#dfa08c",
  สีรุ้ง: "#a78bfa",
};

/** สีที่ต้องวาดเป็นไล่เฉด (โลหะ/รุ้ง) */
const GRADIENT = {
  สีเงิน: ["#f1f5f9", "#c8ccd2", "#8f959e"],
  สีทอง: ["#f6e3a8", "#d9ae51", "#a8802f"],
  สีโรสโกลด์: ["#f7d6c8", "#dfa08c", "#b4705d"],
  สีรุ้ง: ["#f9a8d4", "#a5b4fc", "#6ee7b7"],
};

const colorKey = (name) => name.replace(/^[A-Z]{1,2}\d+\s*/, "").trim();

/**
 * ทรงตะขอของแต่ละกลุ่ม — วาดเป็นเส้น/รูปทึบขนาดพอดีกรอบ 700×700
 * (ไม่ได้ลอกแบบเป๊ะทุกมิลลิเมตร แต่แยกออกว่าเป็นตะขอคนละแบบ)
 */
const SHAPES = {
  /** ห่วงเปิดได้ (AB) */
  ring: (s) => `<circle cx="350" cy="352" r="118" fill="none" stroke="${s}" stroke-width="26" stroke-linecap="round"/>
    <circle cx="350" cy="470" r="13" fill="${s}"/>`,
  /** ห่วงดาว (T) */
  star: (s) => `<path d="M350 232 l40 82 l90 13 l-65 63 l15 89 l-80 -42 l-80 42 l15 -89 l-65 -63 l90 -13 z"
      fill="none" stroke="${s}" stroke-width="26" stroke-linejoin="round"/>
    <circle cx="392" cy="455" r="26" fill="none" stroke="${s}" stroke-width="14"/>`,
  /** โซ่ไข่ปลา (C) */
  ballchain: (s) => {
    let d = "";
    for (let i = 0; i < 13; i++) d += `<circle cx="${150 + i * 34}" cy="352" r="16" fill="${s}"/>`;
    return `${d}<rect x="132" y="336" width="26" height="32" rx="10" fill="${s}"/>`;
  },
  /** ตะขอสปริงโลหะ/พลาสติก (G, F/J/K/L/M/N/O ฯลฯ) */
  snaphook: (s) => `<path d="M350 226 a58 58 0 0 1 58 58 v92 a58 58 0 0 1 -116 0 v-92 a58 58 0 0 1 58 -58 z"
      fill="none" stroke="${s}" stroke-width="26" stroke-linecap="round"/>
    <rect x="330" y="392" width="40" height="34" rx="12" fill="${s}"/>
    <circle cx="350" cy="462" r="38" fill="none" stroke="${s}" stroke-width="22"/>`,
  /** ตะขอกดพลาสติก + ห่วง (H) */
  plasticsnap: (s) => `<path d="M350 200 a76 76 0 0 1 76 76 q0 62 -50 88 v26 a26 26 0 0 1 -52 0 v-26 q-50 -26 -50 -88 a76 76 0 0 1 76 -76 z"
      fill="none" stroke="${s}" stroke-width="26" stroke-linejoin="round"/>
    <circle cx="350" cy="470" r="52" fill="none" stroke="${s}" stroke-width="20"/>`,
  /** ตะขอคลิปพลาสติก + ห่วง (I) */
  cliptab: (s) => `<rect x="318" y="196" width="64" height="176" rx="26" fill="${s}"/>
    <circle cx="350" cy="452" r="66" fill="none" stroke="${s}" stroke-width="26"/>`,
  /** ตะขอหัวใจโปร่ง (R) / หัวใจ+โซ่+ห่วง (U) */
  heartclasp: (s) => `<path d="M350 300 q-40 -74 -96 -34 q-46 34 4 92 q36 42 92 84 q56 -42 92 -84 q50 -58 4 -92 q-56 -40 -96 34 z"
      fill="none" stroke="${s}" stroke-width="24" stroke-linejoin="round"/>
    <rect x="332" y="470" width="36" height="30" rx="12" fill="${s}"/>
    <circle cx="350" cy="538" r="34" fill="none" stroke="${s}" stroke-width="20"/>`,
  /** ห่วงลวดสลิง (S) */
  wireloop: (s) => `<circle cx="350" cy="336" r="132" fill="none" stroke="${s}" stroke-width="14"/>
    <rect x="326" y="452" width="48" height="46" rx="12" fill="${s}"/>`,
  /** ตะขอสปริงพลาสติกตัวใหญ่ (W) */
  lobster: (s) => `<path d="M350 202 q104 0 104 106 q0 78 -74 116 l0 44 a30 30 0 0 1 -60 0 l0 -44 q-74 -38 -74 -116 q0 -106 104 -106 z"
      fill="none" stroke="${s}" stroke-width="30" stroke-linejoin="round"/>
    <circle cx="350" cy="316" r="42" fill="#ffffff"/>`,
  /** ห่วง + ดอกไม้ + กระดิ่ง (AA) */
  flowerbell: (s) => {
    let petals = "";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      petals += `<circle cx="${384 + Math.cos(a) * 46}" cy="${452 + Math.sin(a) * 46}" r="34" fill="${s}"/>`;
    }
    return `<circle cx="330" cy="288" r="94" fill="none" stroke="${s}" stroke-width="22"/>
      ${petals}<circle cx="384" cy="452" r="20" fill="#fef3c7"/>
      <circle cx="272" cy="418" r="34" fill="${s}"/><circle cx="272" cy="428" r="7" fill="#334155"/>`;
  },
};

/**
 * กลุ่มสีตะขอ → ทรงที่จะวาด
 * (ตั้งชื่อกลุ่มให้ตรงกับ label ใน scripts/add-standee-keyring.ts)
 */
export const COLOR_GROUP_SHAPE = {
  AA: "flowerbell",
  AB: "ring",
  C: "ballchain",
  G: "snaphook",
  H: "plasticsnap",
  I: "cliptab",
  R: "heartclasp",
  DX: "snaphook",
  S: "wireloop",
  T: "star",
  U: "heartclasp",
  W: "lobster",
  METAL: "snaphook",
};

/** วาดชิปสีตะขอ 1 ใบ */
function hookColorSvg(shapeKey, code, colorName) {
  const key = colorKey(colorName);
  const grad = GRADIENT[key];
  const flat = HEX[key] || "#94a3b8";
  const stroke = grad ? `url(#g)` : flat;
  const defs = grad
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${grad[0]}"/><stop offset="50%" stop-color="${grad[1]}"/><stop offset="100%" stop-color="${grad[2]}"/>
      </linearGradient></defs>`
    : "";
  const chip = grad ? grad[1] : flat;
  const light = ["#f8fafc", "#e6f0f6", "#f5e6a3", "#f4e7c8"].includes(flat);
  return frame(`
    ${defs}
    ${title(code || key, code ? key : "")}
    <g transform="translate(0,26)">${(SHAPES[shapeKey] || SHAPES.ring)(stroke)}</g>
    <circle cx="${W - 96}" cy="${H - 96}" r="42" fill="${chip}" stroke="${light ? LINE : "#ffffff"}" stroke-width="4"/>
    <text x="${W / 2}" y="${H - 44}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ภาพจำลองทรงตะขอ · ดูของจริงในแท็บ “ตะขอ / อะไหล่”</text>`);
}

/** ชื่อไฟล์ของสีตะขอ 1 ตัว (โค้ดล้วน หรือ กลุ่ม-สี สำหรับกลุ่มที่ไม่มีโค้ด) */
export const hookColorFile = (groupKey, choiceName) => {
  const m = choiceName.match(/^([A-Z]{1,2}\d+)\s/);
  if (m) return `hookcolor-${m[1]}`;
  const slug = { สีเงิน: "silver", สีทอง: "gold", สีโรสโกลด์: "rose", สีรุ้ง: "rainbow" }[choiceName.trim()] || "x";
  return `hookcolor-${groupKey.toLowerCase()}-${slug}`;
};

async function hookColorArt(groups) {
  let n = 0;
  for (const g of groups) {
    for (const name of g.choices) {
      const code = (name.match(/^([A-Z]{1,2}\d+)\s/) || [])[1] || "";
      await png(hookColorFile(g.key, name), hookColorSvg(COLOR_GROUP_SHAPE[g.key], code, name));
      n++;
    }
  }
  console.log(`🎨 สีตะขอ ${n} ใบ`);
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * รายชื่อสีของแต่ละกลุ่ม — ตรงกับสินค้า "พวงกุญแจอะคริลิค" (keyring-copy-copy)
 * เก็บไว้ที่นี่ที่เดียว แล้ว add-standee-keyring.ts import ไปใช้สร้างตัวเลือก
 */
export const HOOK_COLOR_GROUPS = [
  {
    key: "AA",
    label: "สีตะขอ AA",
    hooks: ["AA ห่วง + ดอกไม้ + กระดิ่ง 3×5.2cm (หลายสี)"],
    extra: 15,
    choices: [
      "AA1 สีส้ม", "AA2 สีเหลือง", "AA3 สีเขียว", "AA4 สีฟ้า", "AA5 สีม่วง", "AA6 สีชมพู", "AA7 สีแดง",
    ],
  },
  {
    key: "AB",
    label: "สีตะขอ AB",
    hooks: ["AB ห่วงเปิดได้ 45mm (หลายสี)"],
    extra: 5,
    choices: [
      "AB1 สีขาว", "AB2 สีเทาอ่อน", "AB3 สีเทาเข้ม", "AB4 สีดำ", "AB5 สีน้ำตาล", "AB6 สีส้ม",
      "AB7 สีเหลืองเข้ม", "AB8 สีเหลืองอ่อน", "AB9 สีเขียวอ่อน", "AB10 สีเขียวเข้ม", "AB11 สีมิ้นท์",
      "AB12 สีฟ้า", "AB13 สีน้ำเงิน", "AB14 สีม่วงเข้ม", "AB15 สีม่วงอ่อน", "AB16 สีชมพูอ่อน",
      "AB17 สีพีช", "AB18 สีชมพูเข้ม", "AB19 สีแดง",
    ],
  },
  {
    key: "C",
    label: "สีตะขอ C (โซ่ไข่ปลา)",
    hooks: ["C โซ่ไข่ปลา (หลายสี)"],
    extra: 3,
    /** C29-C33 เป็นแบบเคลือบเงา ราคา 4 บาท (ตั้ง extraOverride ไว้) */
    extraOverride: { C29: 4, C30: 4, C31: 4, C32: 4, C33: 4 },
    choices: [
      "C1 สีดำ", "C2 สีเทาเข้ม", "C3 สีเทาอ่อน", "C4 สีขาว", "C5 สีน้ำตาล", "C6 สีส้มเข้ม", "C7 สีส้ม",
      "C9 สีเหลือง", "C10 สีเหลืองอ่อน", "C11 สีเขียวอ่อน", "C12 สีเขียวกรม", "C13 สีเขียว",
      "C15 สีเขียวมิ้นท์", "C16 สีฟ้าอ่อน", "C17 สีฟ้า", "C18 สีฟ้าเข้ม", "C20 สีน้ำเงินเข้ม",
      "C21 สีม่วงเข้ม", "C22 สีม่วงอ่อน", "C23 สีชมพูพีช", "C25 สีชมพู", "C26 สีชมพูบานเย็น", "C27 สีแดง",
      "C29 สีชมพูเงา", "C30 สีม่วงเข้มเงา", "C31 สีม่วงอ่อนเงา", "C32 สีเขียวเงา", "C33 สีฟ้าเงา",
    ],
  },
  {
    key: "G",
    label: "สีตะขอ G",
    hooks: ["G ตะขอสปริงพลาสติก (หลายสี)"],
    extra: 10,
    choices: [
      "G1 สีดำ", "G2 สีเทาอ่อน", "G3 สีขาว", "G4 สีน้ำตาล", "G5 สีส้ม", "G6 สีครีม", "G7 สีเหลือง",
      "G8 สีเขียวอ่อน", "G9 สีเขียวเข้ม", "G10 สีเขียวมิ้นท์", "G11 สีฟ้าอ่อน", "G12 สีฟ้าเข้ม",
      "G13 สีน้ำเงิน", "G14 สีม่วงเข้ม", "G15 สีม่วงอ่อน", "G16 สีชมพูพีช", "G17 สีชมพู",
      "G18 สีชมพูบานเย็น", "G19 สีแดง",
    ],
  },
  {
    key: "H",
    label: "สีตะขอ H",
    hooks: ["H ตะขอกดพลาสติก + ห่วง (หลายสี)"],
    extra: 7,
    choices: [
      "H1 สีดำ", "H2 สีเทาอ่อน", "H3 สีขาว", "H4 สีน้ำตาล", "H5 สีม่วง", "H6 สีแดง", "H7 สีชมพูอ่อน",
      "H8 สีชมพู", "H9 สีฟ้าอ่อน", "H10 สีฟ้า", "H11 สีน้ำเงิน", "H12 สีเขียวอ่อน", "H13 สีเขียว",
      "H14 สีส้ม", "H15 สีเหลือง",
    ],
  },
  {
    key: "I",
    label: "สีตะขอ I",
    hooks: ["I ตะขอคลิปพลาสติก + ห่วง (หลายสี)"],
    extra: 5,
    choices: [
      "I1 สีน้ำตาล", "I2 สีเบจ", "I3 สีขาว", "I4 สีม่วง", "I5 สีชมพู", "I6 สีฟ้า", "I7 สีน้ำเงิน",
      "I8 สีเขียว", "I9 สีเหลือง", "I10 สีส้ม", "I11 สีแดง", "I12 สีดำ", "I13 สีชมพูเข้ม",
      "I14 สีชมพูอ่อน", "I15 สีฟ้าอ่อน", "I16 สีน้ำเงิน", "I17 สีฟ้าอ่อน (มิ้นท์)", "I18 สีเขียวอ่อน",
      "I19 สีเหลือง", "I20 สีส้ม",
    ],
  },
  {
    key: "R",
    label: "สีตะขอ R (โลหะ)",
    hooks: ["R ตะขอหัวใจโปร่ง (เงิน/ทอง/โรสโกลด์)", "V ตะขอดาว (เงิน/ทอง/โรสโกลด์)"],
    extra: 8,
    choices: ["สีเงิน", "สีทอง", "สีโรสโกลด์"],
  },
  {
    key: "DX",
    label: "สีตะขอ · เงิน/ทอง (D/X)",
    hooks: ["X ห่วงหัวใจ (เงิน/ทอง)", "D ตะขอสปริง 23mm (เงิน/ทอง)"],
    /** ราคาอยู่ที่ตัวตะขอหลักแล้ว (D 8 · X 10) กลุ่มสีจึงไม่บวกซ้ำ */
    extra: 0,
    choices: ["สีเงิน", "สีทอง"],
  },
  {
    key: "S",
    label: "สีตะขอ S",
    hooks: ["S ห่วงลวดสลิง (หลายสี)"],
    extra: 8,
    choices: [
      "S1 สีขาว", "S2 สีเทาอ่อน", "S3 สีดำ", "S4 สีน้ำตาล", "S5 สีส้ม", "S6 สีแดง", "S7 สีชมพูบานเย็น",
      "S8 สีชมพู", "S9 สีชมพูพีช", "S10 สีครีม", "S11 สีม่วงเข้ม", "S12 สีม่วงอ่อน", "S13 สีฟ้าเข้ม",
      "S14 สีฟ้าอ่อน", "S15 สีน้ำเงิน", "S16 สีเขียวมิ้นท์", "S17 สีเขียวเข้ม", "S18 สีเขียวอ่อน",
      "S19 สีเหลือง",
    ],
  },
  {
    key: "T",
    label: "สีตะขอ T",
    hooks: ["T ห่วงดาว (หลายสี)"],
    extra: 8,
    choices: [
      "T1 สีดำ", "T2 สีเทาเข้ม", "T3 สีเทาอ่อน", "T4 สีขาว", "T5 สีน้ำตาล", "T6 สีส้ม", "T7 สีเหลือง",
      "T8 สีครีม", "T9 สีเขียวมิ้นท์", "T10 สีเขียวอ่อน", "T11 สีเขียวเข้ม", "T12 สีฟ้าอ่อน",
      "T13 สีฟ้าเข้ม", "T14 สีน้ำเงิน", "T15 สีม่วงเข้ม", "T16 สีม่วงอ่อน", "T17 สีชมพูพีช",
      "T18 สีชมพู", "T19 สีชมพูบานเย็น", "T20 สีแดง",
    ],
  },
  {
    key: "U",
    label: "สีตะขอ U",
    hooks: ["U ตะขอหัวใจ + โซ่ + ห่วง (หลายสี)"],
    extra: 12,
    choices: [
      "U1 สีดำ", "U2 สีเทาเข้ม", "U3 สีเทาอ่อน", "U4 สีขาว", "U5 สีน้ำตาล", "U6 สีส้ม", "U7 สีเหลือง",
      "U8 สีครีม", "U9 สีเขียวอ่อน", "U10 สีเขียวเข้ม", "U11 สีเขียวมิ้นท์", "U12 สีฟ้าอ่อน",
      "U13 สีฟ้าเข้ม", "U14 สีน้ำเงิน", "U15 สีม่วงเข้ม", "U16 สีม่วงอ่อน", "U17 สีชมพูพีช",
      "U18 สีชมพู", "U19 สีชมพูบานเย็น", "U20 สีแดง",
    ],
  },
  {
    key: "W",
    label: "สีตะขอ W",
    hooks: ["W ตะขอกดพลาสติก 3.5×2cm (หลายสี)"],
    extra: 8,
    choices: [
      "W1 สีใส", "W2 สีขาว", "W3 สีดำ", "W4 สีน้ำตาล", "W5 สีแดง", "W6 สีชมพู", "W7 สีชมพูเข้ม",
      "W8 สีเหลือง", "W9 สีเขียวมิ้นท์", "W10 สีฟ้า", "W11 สีม่วง", "W12 สีน้ำเงิน", "W13 สีส้ม",
    ],
  },
  {
    key: "METAL",
    label: "สีตะขอ · โลหะ (F/J/K/L/M/N/O)",
    hooks: [
      "F ตะขอสปริง 12×35mm (เงิน/ทอง/โรสโกลด์/รุ้ง)",
      "J ตะขอพระจันทร์ (เงิน/ทอง/โรสโกลด์/รุ้ง)",
      "K ตะขอแมว (เงิน/ทอง/โรสโกลด์/รุ้ง)",
      "L ตะขอดาว (เงิน/ทอง/โรสโกลด์/รุ้ง)",
      "M ตะขอหัวใจ (เงิน/ทอง/โรสโกลด์/รุ้ง)",
      "N ตะขอกระต่าย (เงิน/ทอง/โรสโกลด์/รุ้ง)",
      "O ตะขอซากุระ (เงิน/ทอง/โรสโกลด์/รุ้ง)",
    ],
    extra: 8,
    choices: ["สีเงิน", "สีทอง", "สีโรสโกลด์", "สีรุ้ง"],
  },
];

async function main() {
  await photos();
  await sizeArt();
  await baseArt();
  await optionArt();
  await hookColorArt(HOOK_COLOR_GROUPS);
  console.log(`\n✅ เตรียมภาพเสร็จ → ${OUT}`);
}

// import มาใช้ค่าคงที่เฉย ๆ ไม่ต้องเรนเดอร์ภาพใหม่
if (process.argv[1] && process.argv[1].endsWith("standee-keyring-art.mjs")) {
  main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
  });
}
