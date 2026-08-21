#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "HAND FAN พัดพลาสติกใส ทรงกลม (UV)"
 *
 *   node scripts/hand-fan-uv-art.mjs [--out=<dir>]
 *
 * ที่มาของภาพแยกเป็น 2 ทาง:
 *
 * 1) รูปงานจริงจากหน้าเว็บตารางราคา (wixstatic) — เอามาครอปใส่การ์ดพร้อมป้ายบอกขนาด
 *    ใช้กับตัวเลือก "ขนาด" เพราะพัดสองขนาดหน้าตาต่างกันชัด ลูกค้าควรเห็นของจริง
 *    ⚠️ id รูปตรวจด้วยตาแล้วว่าอยู่ในบล็อก "พัดพลาสติกใส ทรงกลม (UV)" จริง (บล็อกอื่นเป็นพัดกระดาษ/พัดพับ)
 *
 * 2) วาดเอง — ผังเทียบขนาดตามสเกลจริง · สกรีน 1 ด้าน / 2 ด้าน · วิธีพิมพ์ของแต่ละขนาด · คละลาย
 *    เรื่องพวกนี้ไม่มีรูปงานจริงบนเว็บ วาดเองชัดกว่าเอารูปที่ไม่ตรงมาแปะ
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/hand-fan-uv/upload").replace(/\/$/, "");
const SRC = ".cache/hand-fan-uv/src";
mkdirSync(OUT, { recursive: true });
mkdirSync(SRC, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}${defs}</defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${812 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

const save = (name, buf) => {
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`   ${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
};
const saveSvg = async (name, svg) =>
  save(name, await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer());

/** โหลดรูปจากเว็บร้าน (เก็บไว้ใน .cache ครั้งเดียว รันซ้ำไม่ต้องโหลดใหม่) */
async function photo(id) {
  const file = `${SRC}/${id}.jpg`;
  if (existsSync(file)) return readFileSync(file);
  const url = `https://static.wixstatic.com/media/${id}~mv2.jpg/v1/fit/w_1400,h_1400/x.jpg`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลดรูป ${id} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

/* ── ขนาดพัด 2 แบบ (ตัวเลขจากหน้าเว็บตารางราคา — apply ทวนกับเว็บอีกที) ─────── */

/**
 * col   = ชื่อคอลัมน์ในตารางราคาบนเว็บ (ต้องตรงเป๊ะ ไม่งั้น apply หยุด)
 * name  = ชื่อตัวเลือกที่ลูกค้าเห็นบนหน้าสินค้า (ต่อขนาดให้เลือกง่าย)
 * dia   = เส้นผ่านศูนย์กลางวงพัด (มม.) · total = ความยาวรวมก้าน (มม.)
 * photo = รูปงานจริงของขนาดนี้บนหน้าเว็บ
 */
/** รูปงานจริงที่มีพัดทั้งสองขนาดวางคู่กัน (ใช้ในการ์ดเทียบขนาด + เป็นรูปแรกของแกลเลอรี) */
export const COMPARE_PHOTO = "959b83_fdab64c3cacd4b829a97e11640c0d40f";

export const SIZES = [
  {
    key: "small",
    col: "พัดอันเล็ก",
    name: "พัดอันเล็ก (วงกลม 5 ซม.)",
    dia: 50,
    total: 75,
    photo: "959b83_48a5561054c2485c940e788f39f4c2b3",
    method: "สกรีน UV ลงวัสดุโดยตรง",
    note: "ขนาดพกพา — ห้อยกระเป๋า/แจกงานอีเวนต์",
  },
  {
    key: "large",
    col: "พัดอันใหญ่",
    name: "พัดอันใหญ่ (วงกลม 16.4 ซม.)",
    dia: 164,
    total: 249,
    photo: "959b83_7a9d93cd0a104fed81959f839faf58fb",
    method: "ติดสติ๊กเกอร์ UV ลงวัสดุ",
    note: "ขนาดใช้งานจริง — พัดได้ลมดี เห็นลายเต็มตา",
  },
];

/* ── ตัวพัดที่วาดเอง (พลาสติกใส วงกลม + ก้าน) ────────────────────────── */

const DEFS = `
<linearGradient id="art" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#ffe9a8"/><stop offset="45%" stop-color="#ffd166"/><stop offset="100%" stop-color="#ffc233"/>
</linearGradient>
<linearGradient id="plastic" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="55%" stop-color="#e8f4f8" stop-opacity="0.75"/><stop offset="100%" stop-color="#d8ecf3" stop-opacity="0.9"/>
</linearGradient>
<pattern id="clear" width="26" height="26" patternUnits="userSpaceOnUse">
  <rect width="26" height="26" fill="#ffffff"/>
  <rect width="13" height="13" fill="#eef2f6"/><rect x="13" y="13" width="13" height="13" fill="#eef2f6"/>
</pattern>`;

/**
 * ลายตัวอย่างบนหน้าพัด (เป็ดน้อยของร้าน) — ลูกค้าส่งลายอะไรมาก็พิมพ์ตามนั้น
 * faded = ภาพที่มองทะลุจากอีกด้าน (พลาสติกใส เห็นลายกลับด้านจาง ๆ)
 */
function motif(cx, cy, r, { faded = false } = {}) {
  const o = faded ? 0.28 : 1;
  const s = r / 100;
  return `<g opacity="${o}" transform="translate(${cx} ${cy}) scale(${s.toFixed(3)})${faded ? " scale(-1 1)" : ""}">
    <path d="M -6 -74 Q 16 -86 30 -66 Q 12 -60 -2 -62 Z" fill="#3fae5a"/>
    <ellipse cx="0" cy="4" rx="62" ry="58" fill="url(#art)" stroke="#1f2937" stroke-width="5"/>
    <ellipse cx="-56" cy="34" rx="20" ry="15" fill="url(#art)" stroke="#1f2937" stroke-width="5"/>
    <path d="M -30 -10 L -6 -10 M 12 -10 L 36 -10" stroke="#1f2937" stroke-width="9" stroke-linecap="round"/>
    <path d="M -8 12 q 12 -12 22 0 q -11 12 -22 0 Z" fill="#f97316" stroke="#1f2937" stroke-width="4"/>
    <ellipse cx="-38" cy="16" rx="10" ry="6" fill="#fda4c3" opacity="0.85"/>
    <ellipse cx="34" cy="16" rx="10" ry="6" fill="#fda4c3" opacity="0.85"/>
  </g>`;
}

/**
 * พัด 1 อัน — วงพลาสติกใส + ก้านจับ (วาดตามสัดส่วนจริงของขนาดที่ส่งมา)
 * cx = กึ่งกลางแนวนอน · top = ขอบบนของวงพัด · dPx = เส้นผ่านศูนย์กลางเป็นพิกเซล
 * lenPx = ความยาวรวม (วง + ก้าน) เป็นพิกเซล
 */
function fan(cx, top, dPx, lenPx, { printed = true, faded = false, id = "f" } = {}) {
  const r = dPx / 2;
  const cy = top + r;
  const hw = Math.max(7, dPx * 0.14); // ความกว้างก้าน
  const hTop = cy + r - dPx * 0.08; // ก้านเสียบเข้าไปในวงเล็กน้อย
  const hBot = top + lenPx;
  return `<g>
    <clipPath id="clip-${id}"><circle cx="${cx}" cy="${cy}" r="${r - 1}"/></clipPath>
    <rect x="${cx - hw / 2}" y="${hTop}" width="${hw}" height="${hBot - hTop}" rx="${hw / 2}" fill="url(#plastic)" stroke="#9fb8c4" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#clear)"/>
    <g clip-path="url(#clip-${id})">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#plastic)"/>
      ${printed ? motif(cx, cy, r * 0.78, { faded }) : ""}
    </g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#8fb0bf" stroke-width="2.5"/>
    <path d="M ${cx - r * 0.62} ${cy - r * 0.52} a ${r * 0.85} ${r * 0.85} 0 0 1 ${r * 0.5} ${-r * 0.28}"
      stroke="#ffffff" stroke-width="${Math.max(2, r * 0.07)}" fill="none" opacity="0.8" stroke-linecap="round"/>
  </g>`;
}

/** เส้นบอกขนาดพร้อมหัวท้าย */
const dimH = (x1, x2, y, label) => `<g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x1} ${y} L ${x2} ${y}"/><path d="M ${x1} ${y - 9} L ${x1} ${y + 9} M ${x2} ${y - 9} L ${x2} ${y + 9}"/>
  </g>
  <text x="${(x1 + x2) / 2}" y="${y + 34}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${CYAN}">${esc(label)}</text>`;
/** เส้นบอกความยาวแนวตั้ง + ป้ายตะแคงข้างเส้น — ใช้เมื่อข้าง ๆ ไม่มีที่พอวางป้ายแนวนอน */
const dimVR = (y1, y2, x, label) => `<g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x} ${y1} L ${x} ${y2}"/><path d="M ${x - 9} ${y1} L ${x + 9} ${y1} M ${x - 9} ${y2} L ${x + 9} ${y2}"/>
  </g>
  <text transform="rotate(-90 ${x + 30} ${(y1 + y2) / 2})" x="${x + 30}" y="${(y1 + y2) / 2}" font-family="${TH}" font-size="24"
    font-weight="700" text-anchor="middle" fill="${CYAN}">${esc(label)}</text>`;
const dimV = (y1, y2, x, label, side = "left") => `<g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x} ${y1} L ${x} ${y2}"/><path d="M ${x - 9} ${y1} L ${x + 9} ${y1} M ${x - 9} ${y2} L ${x + 9} ${y2}"/>
  </g>
  <text x="${side === "left" ? x - 16 : x + 16}" y="${(y1 + y2) / 2 + 8}" font-family="${TH}" font-size="24" font-weight="700"
    text-anchor="${side === "left" ? "end" : "start"}" fill="${CYAN}">${esc(label)}</text>`;

/* ── 1. การ์ดขนาด (รูปงานจริง + ผังสเกลจริงมุมขวา) ─────────────────── */

/** รูปงานจริงวางเป็นบล็อกกลางการ์ด (ครอปเป็นสี่เหลี่ยมมุมมน) */
async function photoTile(id, w, h) {
  const img = await sharp(await photo(id)).resize({ width: w, height: h, fit: "cover", position: "attention" }).toBuffer();
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="22" fill="#fff"/></svg>`
  );
  return sharp(img).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

const cm = (mm) => (mm / 10).toFixed(mm % 10 ? 1 : 0);

async function sizeCards() {
  console.log("🖼  การ์ดขนาด 2 แบบ (รูปงานจริง + ผังสเกลจริง)");
  const MAX = Math.max(...SIZES.map((s) => s.total));
  for (const s of SIZES) {
    const pw = 430;
    const ph = 430;
    const px = 58;
    const py = 196;
    // ผังขวามือ: วาดพัดใบนี้ตามสเกลจริงเทียบกับใบใหญ่สุด (เห็นทันทีว่าเล็ก/ใหญ่แค่ไหน)
    const band = 380;
    const k = band / MAX;
    const dPx = s.dia * k;
    const lPx = s.total * k;
    const cx = 676;
    const top = py + 14 + (band - lPx) / 2;
    const svg = frame(`
      ${title(s.name, `วงกลม ${cm(s.dia)} ซม. · รวมก้าน ${cm(s.total)} ซม.`)}
      <rect x="${px - 6}" y="${py - 6}" width="${pw + 12}" height="${ph + 12}" rx="28" fill="#f1f5f9"/>
      <text x="${px + pw / 2}" y="${py + ph + 42}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">งานจริงของร้าน</text>
      ${fan(cx, top, dPx, lPx, { id: `size-${s.key}` })}
      ${dimH(cx - dPx / 2, cx + dPx / 2, top - 26, `${cm(s.dia)} ซม.`)}
      ${dimVR(top, top + lPx, cx + dPx / 2 + 26, `${cm(s.total)} ซม.`)}
      <text x="${cx}" y="${py + ph + 42}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ขนาดจริงตามสเกล</text>
      <text x="${W / 2}" y="${py + ph + 96}" font-family="${TH}" font-size="26" text-anchor="middle" fill="${INK}">${esc(s.note)}</text>
      ${foot([`วัสดุพลาสติกใส · ${s.method}`, "ลายบนภาพเป็นตัวอย่าง — พิมพ์ตามไฟล์ที่ลูกค้าส่งมา"])}`);
    const buf = await sharp(Buffer.from(svg))
      .composite([{ input: await photoTile(s.photo, pw, ph), left: px, top: py }])
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    save(`size-${s.key}`, buf);
  }

  // การ์ดเทียบขนาด — รูปงานจริงที่มีทั้งสองขนาดในภาพเดียว + ผังสเกลจริงด้านล่าง
  const pw = 700;
  const ph = 330;
  const px = Math.round((W - pw) / 2);
  const py = 168;
  const k = 240 / SIZES[1].total;
  const base = 800;
  const scaleRow = SIZES.map((s, i) => {
    const dPx = s.dia * k;
    const lPx = s.total * k;
    const cx = i === 0 ? 300 : 560;
    const top = base - lPx;
    return `${fan(cx, top, dPx, lPx, { id: `cmp-${s.key}` })}
      <text x="${cx}" y="${top - 18}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${INK}">${esc(s.col)}</text>
      <text x="${cx}" y="${base + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${CYAN}">${esc(`${cm(s.dia)} ซม.`)}</text>`;
  }).join("");
  const svg = frame(`
    ${title("2 ขนาดให้เลือก", "พัดอันเล็ก 5 ซม. · พัดอันใหญ่ 16.4 ซม.")}
    ${scaleRow}
    <text x="740" y="640" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">เทียบขนาดจริง</text>
    <text x="740" y="672" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ตามสเกล</text>`);
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: await photoTile(COMPARE_PHOTO, pw, ph), left: px, top: py }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save("size-compare", buf);
}

/* ── 2. การ์ดสกรีน 1 ด้าน / 2 ด้าน ───────────────────────────────── */

async function sideCards() {
  console.log("🖼  การ์ดสกรีน 1 ด้าน / 2 ด้าน");
  const d = 250;
  const l = 380;
  const top = 250;
  const view = (cx, label, sub) => `
    <text x="${cx}" y="${top - 40}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${INK}">${esc(label)}</text>
    <text x="${cx}" y="${top + l + 46}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>`;

  await saveSvg(
    "side-1",
    frame(`
      ${title("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้า — รวมอยู่ในราคาแล้ว")}
      ${fan(280, top, d, l, { id: "s1-front" })}
      ${view(280, "ด้านหน้า", "ลายคมชัด สีเต็ม")}
      ${fan(620, top, d, l, { id: "s1-back", faded: true })}
      ${view(620, "ด้านหลัง", "พลาสติกใส มองทะลุเห็นลายกลับด้านจาง ๆ")}
      ${foot(["ราคาในตารางคือแบบสกรีน 1 ด้าน", "ลายบนภาพเป็นตัวอย่าง — พิมพ์ตามไฟล์ที่ลูกค้าส่งมา"])}`)
  );

  await saveSvg(
    "side-2",
    frame(`
      ${title("สกรีน 2 ด้าน", "พิมพ์ลายทั้งหน้าและหลัง — คิดเพิ่มต่ออัน")}
      ${fan(280, top, d, l, { id: "s2-front" })}
      ${view(280, "ด้านหน้า", "ลายคมชัด สีเต็ม")}
      ${fan(620, top, d, l, { id: "s2-back" })}
      ${view(620, "ด้านหลัง", "พิมพ์ทับอีกชั้น ลายคมทั้งสองด้าน")}
      ${foot(["พัดอันเล็กกับอันใหญ่คิดค่าสกรีน 2 ด้านคนละเรท", "ส่งไฟล์ลายมาทั้งสองด้าน (คนละลายกันได้)"])}`)
  );
}

/* ── 3. การ์ดวิธีพิมพ์ของแต่ละขนาด ───────────────────────────────── */

async function methodCard() {
  console.log("🖼  การ์ดวิธีพิมพ์ UV ของแต่ละขนาด");
  const layer = (x, y, w, label, color, stroke) => `
    <rect x="${x}" y="${y}" width="${w}" height="26" rx="4" fill="${color}" stroke="${stroke}" stroke-width="2"/>
    <text x="${x + w + 24}" y="${y + 20}" font-family="${TH}" font-size="22" fill="${INK}">${esc(label)}</text>`;
  const svg = frame(`
    ${title("พิมพ์ด้วยระบบ UV Printing", "สีไม่ซีด ไม่หลุดลอก โดนน้ำได้ — วิธีลงลายต่างกันตามขนาด")}
    <text x="150" y="228" font-family="${TH}" font-size="27" font-weight="700" fill="${INK}">พัดอันเล็ก</text>
    <text x="150" y="264" font-family="${TH}" font-size="23" fill="${SUB}">สกรีน UV ลงบนเนื้อพลาสติกโดยตรง</text>
    ${layer(150, 290, 280, "หมึก UV (สกรีนลงวัสดุ)", "#bae6fd", "#0284c7")}
    ${layer(150, 316, 280, "เนื้อพัดพลาสติกใส", "#f1f5f9", "#94a3b8")}
    <text x="150" y="452" font-family="${TH}" font-size="27" font-weight="700" fill="${INK}">พัดอันใหญ่</text>
    <text x="150" y="488" font-family="${TH}" font-size="23" fill="${SUB}">พิมพ์ UV ลงสติ๊กเกอร์ แล้วติดลงเนื้อพัด</text>
    ${layer(150, 514, 280, "หมึก UV", "#bae6fd", "#0284c7")}
    ${layer(150, 540, 280, "สติ๊กเกอร์ใส", "#fde68a", "#d97706")}
    ${layer(150, 566, 280, "เนื้อพัดพลาสติกใส", "#f1f5f9", "#94a3b8")}
    <text x="${W / 2}" y="700" font-family="${TH}" font-size="24" text-anchor="middle" fill="${INK}">ทั้งสองแบบเป็นงาน UV — สีสดคมชัด ไม่ต้องเคลือบเพิ่ม</text>
    <text x="${W / 2}" y="740" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ตัวพัดเป็นพลาสติก ไม่แตกหักง่าย โดนน้ำได้</text>
    ${foot(["ภาพตัดขวางเพื่ออธิบายวิธีทำงาน ไม่ใช่สัดส่วนจริง", "สีระบบ RGB อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15%"])}`);
  await saveSvg("print-method", svg);
}

/* ── 4. การ์ดคละลาย ──────────────────────────────────────────────── */

async function mixCard(freeMixBelow = 10, minPerDesign = 5) {
  console.log("🖼  การ์ดคละลาย");
  const pw = 620;
  const ph = 400;
  const px = Math.round((W - pw) / 2);
  const py = 190;
  const svg = frame(`
    ${title("คละลายได้", `1-${freeMixBelow} อัน คละอิสระ · ${freeMixBelow + 1} อันขึ้นไป ลายละ ${minPerDesign} ชิ้นขึ้นไป`)}
    <rect x="${px - 6}" y="${py - 6}" width="${pw + 12}" height="${ph + 12}" rx="28" fill="#f1f5f9"/>
    <text x="${W / 2}" y="${py + ph + 62}" font-family="${TH}" font-size="26" text-anchor="middle" fill="${INK}">ไม่มีขั้นต่ำในการสั่งผลิต — สั่ง 1 อันก็ทำให้</text>
    <text x="${W / 2}" y="${py + ph + 102}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ราคาคิดตามจำนวนรวมทั้งออเดอร์ ตามช่วงในตารางราคา</text>
    ${foot(["แจ้งจำนวนของแต่ละลายในช่องหมายเหตุถึงร้าน", "ลายบนภาพเป็นงานจริงของร้าน"])}`);
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: await photoTile("959b83_782089af190b4d10943b8f03d502a04a", pw, ph), left: px, top: py }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save("mix-designs", buf);
}

/* ── รัน ─────────────────────────────────────────────────────────── */

/** hand-fan-uv-apply.mjs import ตาราง SIZES จากไฟล์นี้ — วาดภาพเฉพาะตอนสั่งรันไฟล์นี้ตรง ๆ */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(`📁 ${OUT}`);
  await sizeCards();
  await sideCards();
  await methodCard();
  await mixCard();
  console.log("\n✅ เสร็จ — ต่อด้วย: node scripts/hand-fan-uv-apply.mjs --write");
}
