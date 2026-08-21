#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "HAND FAN พัดกระดาษไดคัทตามทรง (Digital)"
 *
 *   node scripts/hand-fan-paper-art.mjs [--out=<dir>]
 *
 * ที่มาของภาพแยกเป็น 2 ทาง:
 *
 * 1) ภาพฟิล์มเคลือบจากคลังตัวเลือกกลางของร้าน (products/preset-coating/*)
 *    ใช้ทำการ์ด "เคลือบเงา / เคลือบพิเศษ" — ผิวฟิล์มที่ลูกค้าเห็นเป็นของจริงจากงานร้าน
 *    (ตัวเลือกผิวฟิล์มรายตัวในกลุ่ม "เคลือบ" ลิงก์ไฟล์คลังตรง ๆ ผ่าน preset ไม่ต้องอัปซ้ำ)
 *
 * 2) วาดเอง — ช่วงขนาด 3 แบบ (ทรงพัดตามสัดส่วนจริง + ผังวางบนแผ่น A3 ว่าได้กี่อัน) ·
 *    ไม่เคลือบ · พิมพ์ 2 ด้าน · กติกาคละลาย
 *    รูปงานจริงบนหน้าเว็บไม่มีป้ายบอกว่าอันไหนเคลือบแบบไหน/ขนาดเท่าไหร่
 *    จึงไม่เอามาแปะเป็นภาพตัวเลือก (จะกลายเป็นบอกลูกค้าผิด) — ใช้ภาพวาดอธิบายแทน
 *
 * ⚠️ "ได้กี่อันต่อแผ่น A3" ไม่ใช่ของประดับ — หน้าเว็บคิดค่าเคลือบ "ต่อแผ่น A3 ด้านละ"
 *    เลข perSheet ในไฟล์นี้ถูกใช้หารค่าเคลือบใน hand-fan-paper-apply.mjs ด้วย
 *    (หน้าเว็บบอกแค่ "ขนาดไม่เกิน 20x20cm" ไม่ได้ลงจำนวนต่อแผ่น — ผังนี้จึงคิดจากขนาดแผ่น A3 ตรง ๆ)
 *
 * รูปงานจริงสำหรับ "แกลเลอรี" ไม่ได้ทำที่นี่ — hand-fan-paper-apply.mjs ดึงจากหน้าเว็บให้เอง
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/hand-fan-paper/upload").replace(/\/$/, "");

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";
/** เนื้อกระดาษพัด (อาร์ตการ์ด 350 แกรม) และด้ามพลาสติกสีขาวที่เสียบท้ายพัด */
const CARD = "#fdfcf7";
const CARD_EDGE = "#d6d3cb";
const STICK = "#f1f5f9";
const STICK_EDGE = "#cbd5e1";

/** กระดาษพัดที่ร้านใช้ — ตรงกับบรรทัด "พัดกระดาษ 350แกรม" บนหน้าตารางราคา */
export const GSM = 350;

/**
 * ช่วงขนาดที่ให้ลูกค้าเลือก + ผังวางบนแผ่น A3 (แนวนอน 420 × 297 mm)
 *
 * ⚠️ หน้าเว็บบอกไว้แค่ "ขนาดไม่เกิน 20x20cm" — ไม่ได้ขายเป็นขนาดตายตัว (งานไดคัทตามทรงลูกค้า)
 *    ช่วงขนาดพวกนี้จึงมีไว้ "คิดค่าเคลือบต่อแผ่น A3" อย่างเดียว ไม่ได้เปลี่ยนราคาต่ออัน
 *    cols/rows คิดจากกรอบสี่เหลี่ยมที่ครอบทรงพัดพอดี วางบนแผ่น A3 ตรง ๆ (ไม่หมุน ไม่ซ้อนฟันปลา)
 */
export const SIZES = [
  { key: "size-20", name: "ไม่เกิน 20 × 20 ซม.", mm: 200, cols: 2, rows: 1, note: "ขนาดใหญ่สุดที่ร้านทำได้", popular: true },
  { key: "size-14", name: "ไม่เกิน 14 × 14 ซม.", mm: 140, cols: 3, rows: 2, note: "ขนาดกลาง — พอดีมือ" },
  { key: "size-10", name: "ไม่เกิน 10 × 10 ซม.", mm: 100, cols: 4, rows: 2, note: "ขนาดเล็ก — ของแถม/ของชำร่วย" },
];
for (const s of SIZES) s.perSheet = s.cols * s.rows;

/** ขนาดแผ่น A3 ที่ใช้เป็นฐานผัง (แนวนอน) */
export const SHEET = { w: 420, h: 297 };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cm = (mm) => String(Math.round(mm / 10 + Number.EPSILON) === mm / 10 ? mm / 10 : (mm / 10).toFixed(1));

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
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

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** ไฟล์ผิวฟิล์มในคลังของร้าน (สินค้าตัวอื่นใช้ไฟล์ชุดนี้อยู่แล้ว) */
const COAT_BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/preset-coating";

/* ── ชิ้นส่วนที่ใช้วาดซ้ำ ─────────────────────────────────────────── */

/**
 * ด้ามพัดพลาสติกสีขาว — ก้านตรง + หัวกลมที่สอดเข้าไปหลังแผ่นกระดาษ
 * (ตามงานจริงในรูปหน้าเว็บ: ด้ามขาวโผล่จากขอบล่างของทรงไดคัท)
 */
function handle(cx, topY, len) {
  const barW = Math.max(6, len * 0.13);
  return `<g>
    <rect x="${cx - barW / 2}" y="${topY}" width="${barW}" height="${len}" rx="${barW / 2}" fill="${STICK}" stroke="${STICK_EDGE}" stroke-width="2"/>
    <ellipse cx="${cx}" cy="${topY + 2}" rx="${barW * 1.75}" ry="${barW * 0.95}" fill="${STICK}" stroke="${STICK_EDGE}" stroke-width="2"/>
  </g>`;
}

/**
 * พัดกระดาษไดคัท 1 อัน — ทรงหัวสัตว์แบบที่ร้านทำจริง (มีติ่งหูสองข้าง)
 * ทรงไม่ใช่วงกลมเป๊ะ เพราะจุดขายของสินค้าตัวนี้คือ "ไดคัทตามทรงที่ลูกค้าออกแบบมา"
 * w/h = กรอบสี่เหลี่ยมที่ครอบทรงพอดี (ตัวเดียวกับที่ใช้วางผังบนแผ่น A3)
 *
 * stick = วาดด้ามพลาสติกด้วยไหม — การ์ดขนาดไม่วาด เพราะกรอบขนาดคือ "แผ่นกระดาษ"
 * ด้ามเป็นพลาสติกคนละชิ้น เสียบทีหลัง ไม่ได้กินเนื้อที่บนแผ่น A3
 */
function fan(x, y, w, h, { art = true, stick = false, face = CARD } = {}) {
  const cx = x + w / 2;
  const cy = y + h * 0.6; // หัวอยู่ค่อนล่าง เผื่อที่ให้ติ่งหูยื่นขึ้นไปชนขอบบนของกรอบ
  const rx = w / 2;
  const ry = h * 0.4;
  /** ติ่งหู = สามเหลี่ยมมนที่ฐานจมอยู่ในทรงกลม ปลายยื่นพ้นขอบบน */
  const ear = (dir) => {
    const bx1 = cx + dir * w * 0.1;
    const bx2 = cx + dir * w * 0.46;
    const apex = cx + dir * w * 0.3;
    return `<path d="M ${bx1} ${y + h * 0.34} Q ${apex - dir * w * 0.02} ${y + h * 0.02} ${bx2} ${y + h * 0.26}
      Q ${(bx1 + bx2) / 2} ${y + h * 0.42} ${bx1} ${y + h * 0.34} Z"
      fill="${face}" stroke="${CARD_EDGE}" stroke-width="2" stroke-linejoin="round"/>`;
  };
  return `<g>
    ${stick ? handle(cx, y + h * 0.84, h * 0.5) : ""}
    ${ear(-1)}${ear(1)}
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${face}" stroke="${CARD_EDGE}" stroke-width="2.5"/>
    ${art ? fanArt(cx, cy, rx, ry) : ""}
  </g>`;
}

/** ลายพิมพ์จำลองบนหน้าพัด — พอให้ดูออกว่าเป็นงานพิมพ์ ไม่ใช่กระดาษเปล่า */
function fanArt(cx, cy, rx, ry) {
  const r = Math.min(rx, ry);
  return `<g opacity="0.92">
    <circle cx="${cx}" cy="${cy}" r="${r * 0.74}" fill="#bae6fd"/>
    <circle cx="${cx - r * 0.28}" cy="${cy - r * 0.22}" r="${r * 0.2}" fill="#fde68a"/>
    <circle cx="${cx + r * 0.26}" cy="${cy - r * 0.22}" r="${r * 0.2}" fill="#fde68a"/>
    <path d="M ${cx - r * 0.3} ${cy + r * 0.24} Q ${cx} ${cy + r * 0.56} ${cx + r * 0.3} ${cy + r * 0.24}"
      stroke="#f97316" stroke-width="${Math.max(3, r * 0.11)}" fill="none" stroke-linecap="round"/>
  </g>`;
}

/** เส้นบอกขนาดพร้อมตัวเลข (แนวนอน/แนวตั้ง) */
function dim(x1, y1, x2, y2, label, { vertical = false } = {}) {
  const tick = 7;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `<g stroke="${CYAN}" stroke-width="2" fill="none">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
    ${vertical
      ? `<line x1="${x1 - tick}" y1="${y1}" x2="${x1 + tick}" y2="${y1}"/><line x1="${x2 - tick}" y1="${y2}" x2="${x2 + tick}" y2="${y2}"/>`
      : `<line x1="${x1}" y1="${y1 - tick}" x2="${x1}" y2="${y1 + tick}"/><line x1="${x2}" y1="${y2 - tick}" x2="${x2}" y2="${y2 + tick}"/>`}
  </g>
  <text x="${vertical ? mx + 16 : mx}" y="${vertical ? my + 8 : my - 14}" font-family="${TH}" font-size="24" font-weight="600"
        text-anchor="${vertical ? "start" : "middle"}" fill="${CYAN}">${esc(label)}</text>`;
}

/* ── 1. การ์ดช่วงขนาด ────────────────────────────────────────────── */

/**
 * การ์ดหนึ่งใบ = ซ้ายเป็นทรงพัดวาดตามสัดส่วนจริง (มีเส้นบอกขนาด)
 *                ขวาเป็นผังวางบนแผ่น A3 ว่าตัดได้กี่อัน
 * ผังฝั่งขวาไม่ได้มีไว้สวย ๆ — ค่าเคลือบคิดต่อแผ่น A3 ลูกค้าจะได้เห็นว่าทำไมพัดเล็กจ่ายค่าเคลือบน้อยกว่า
 */
async function sizeCards() {
  console.log("🖼  การ์ดช่วงขนาด (ทรงพัดตามสัดส่วนจริง + ผังแผ่น A3)");
  // สเกลเดียวกันทุกใบ เพื่อให้เทียบขนาดข้ามการ์ดได้ (20 ซม. = ใบใหญ่สุด ต้องพอดีกรอบซ้าย)
  const BOX = 340;
  const big = Math.max(...SIZES.map((s) => s.mm));
  const scale = BOX / big;

  for (const s of SIZES) {
    const w = s.mm * scale;
    const h = s.mm * scale;
    const cx = 66 + (BOX - w) / 2;
    const cy = 258 + (BOX - h) / 2;

    // ผังแผ่น A3 ฝั่งขวา — วางตาม "ขนาดจริง" ไม่ใช่หารกรอบให้เต็มแผ่น
    const sw = 286;
    const sh = (SHEET.h / SHEET.w) * sw;
    const sx = 534;
    const sy = 336;
    const px = sw / SHEET.w; // px ต่อ 1 มม. ของผังแผ่น
    if (s.cols * s.mm > SHEET.w + 0.5 || s.rows * s.mm > SHEET.h + 0.5)
      throw new Error(`ผัง "${s.name}" วาง ${s.cols}×${s.rows} อันบนแผ่น A3 ไม่ลง — ตรวจตาราง SIZES ก่อน`);
    const cell = s.mm * px;
    const tiles = [];
    for (let r = 0; r < s.rows; r++)
      for (let c = 0; c < s.cols; c++)
        tiles.push(fan(sx + c * cell + cell * 0.06, sy + r * cell + cell * 0.06, cell * 0.88, cell * 0.88, { stick: false }));

    /** เศษที่เหลือบนแผ่น — บอกไปเลยว่าเหลือเท่าไหร่ ลูกค้าจะได้เห็นว่าทำไมได้แค่จำนวนนี้ */
    const leftW = SHEET.w - s.cols * s.mm;
    const leftH = SHEET.h - s.rows * s.mm;
    const leftNote =
      leftW >= 10 || leftH >= 10
        ? `เหลือขอบ ${[leftW >= 10 ? `${cm(leftW)} ซม.` : null, leftH >= 10 ? `${cm(leftH)} ซม.` : null].filter(Boolean).join(" × ")} (ตัดไม่ได้อีกอัน)`
        : "วางได้พอดีทั้งแผ่น";

    await saveSvg(
      s.key,
      frame(`
      ${title(s.name, s.note)}
      <text x="236" y="212" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">กรอบขนาดชิ้นงานจริง</text>
      <rect x="${cx}" y="${cy}" width="${w}" height="${h}" rx="4" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 7"/>
      ${fan(cx, cy, w, h)}
      ${dim(cx, cy + h + 96, cx + w, cy + h + 96, `${cm(s.mm)} ซม.`)}
      ${dim(cx + w + 34, cy, cx + w + 34, cy + h, `${cm(s.mm)} ซม.`, { vertical: true })}
      <text x="677" y="212" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">วางบนแผ่น A3 ได้</text>
      <text x="677" y="284" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${CYAN}">${s.perSheet} อัน</text>
      <rect x="${sx - 8}" y="${sy - 8}" width="${sw + 16}" height="${sh + 16}" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
      ${tiles.join("")}
      <text x="677" y="${sy + sh + 42}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">แผ่น A3 (29.7 × 42 ซม.)</text>
      <text x="677" y="${sy + sh + 70}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">${esc(leftNote)}</text>
      ${foot([
        "ไดคัทตามทรงที่ลูกค้าออกแบบมา — ทรงในภาพเป็นตัวอย่าง",
        `ค่าเคลือบคิดต่อแผ่น A3 → ช่วงนี้หารลง ${s.perSheet} อัน`,
      ])}`)
    );
  }

  /* การ์ดรวม: ทั้ง 3 ช่วงเรียงข้างกันบนเส้นฐานเดียว สเกลเดียวกัน */
  const gap = 26;
  const sc = Math.min((760 - gap * (SIZES.length - 1)) / SIZES.reduce((n, s) => n + s.mm, 0), 340 / big);
  const baseY = 640;
  let px = (W - (SIZES.reduce((n, s) => n + s.mm * sc, 0) + gap * (SIZES.length - 1))) / 2;
  const row = SIZES.map((s) => {
    const side = s.mm * sc;
    const x0 = px;
    px += side + gap;
    return `${fan(x0, baseY - side, side, side, { stick: false })}
      <text x="${x0 + side / 2}" y="${baseY + 44}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">${cm(s.mm)} ซม.</text>
      <text x="${x0 + side / 2}" y="${baseY + 78}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${CYAN}">${s.perSheet} อัน/แผ่น A3</text>`;
  }).join("");
  await saveSvg(
    "size-compare",
    frame(`
    ${title("ช่วงขนาดพัด", "เทียบขนาดจริง — สเกลเดียวกันทั้ง 3 ช่วง")}
    ${row}
    <text x="450" y="200" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">ร้านรับไดคัทตามทรง ขนาดไม่เกิน 20 × 20 ซม.</text>
    ${foot(["ราคาต่ออันเท่ากันทุกช่วงขนาด — ช่วงขนาดใช้คิดค่าเคลือบต่อแผ่น A3", "ทรงในภาพเป็นตัวอย่าง ลูกค้าออกแบบทรงมาเองได้"])}`)
  );
}

/* ── 2. การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน + การ์ด "ไม่เคลือบ") ── */

/** วางภาพฟิล์มจริงเป็นภาพหลักของการ์ด + หัวข้อ/คำอธิบาย */
async function coatCard(name, cardTitle, cardSub, films, notes) {
  const gap = 22;
  const tw = Math.min(Math.floor((760 - gap * (films.length - 1)) / films.length), 600);
  const thh = Math.min(Math.round(tw * 0.72), 430);
  const tiles = [];
  for (const f of films) {
    // contain ไม่ใช่ cover — ภาพฟิล์มของร้านมีป้ายชื่อผิวอยู่มุมขวาล่าง ครอปแล้วป้ายขาด
    tiles.push(
      await sharp(await get(`${COAT_BASE}/${f.file}.jpg`))
        .resize({ width: tw, height: thh, fit: "contain", background: "#ffffff" })
        .toBuffer()
    );
  }
  const x0 = Math.round((W - (tw * films.length + gap * (films.length - 1))) / 2);
  const y0 = Math.round(190 + (520 - thh) / 2);
  const labels = films
    .map(
      (f, i) =>
        `<text x="${x0 + i * (tw + gap) + tw / 2}" y="${y0 + thh + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${esc(f.label)}</text>`
    )
    .join("");
  const svg = frame(`${title(cardTitle, cardSub)}${labels}${foot(notes)}`);
  const buf = await sharp(Buffer.from(svg))
    .composite(tiles.map((input, i) => ({ input, left: x0 + i * (tw + gap), top: y0 })))
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(name, buf);
}

async function coatCards() {
  console.log("🖼  การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน)");
  await saveSvg(
    "coat-none",
    frame(`
      ${title("ไม่เคลือบ", `ผิวกระดาษอาร์ตการ์ด ${GSM} แกรมตามธรรมชาติ`)}
      ${fan(300, 230, 300, 300, { stick: true })}
      <text x="450" y="700" font-family="${TH}" font-size="27" text-anchor="middle" fill="${INK}">สีพิมพ์ตามไฟล์งาน ไม่มีฟิล์มทับหน้า</text>
      <text x="450" y="744" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ผิวสัมผัสเป็นเนื้อกระดาษ ไม่มันวาว</text>
      ${foot(["เป็นแบบมาตรฐานของสินค้าตัวนี้ — รวมในราคาแล้ว (ไม่บวกเพิ่ม)", "โดนน้ำ/เหงื่อแล้วเลอะได้ง่ายกว่าแบบเคลือบ"])}`)
  );
  await coatCard(
    "coat-gloss",
    "เคลือบเงา",
    "ฟิล์มผิวมันวาว — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss", label: "ผิวเงา" }],
    ["สีสดขึ้น เงาวาว ทนเหงื่อ/รอยเปื้อนได้ดีกว่าไม่เคลือบ", "คิดเพิ่มต่อแผ่น A3 ต่อด้านที่เคลือบ"]
  );
  await coatCard(
    "coat-special",
    "เคลือบพิเศษ",
    "กลิตเตอร์ · ทราย · โฮโลแกรม (เลือกผิวย่อยได้อีก 10 แบบ)",
    [
      { file: "glitter", label: "กลิตเตอร์" },
      { file: "rainbow", label: "โฮโลแกรม-รุ้ง" },
      { file: "sand", label: "ทราย" },
    ],
    ["เลือกผิวฟิล์มย่อยได้ในกลุ่ม “เคลือบ” หลังเลือกแบบนี้", "คิดเพิ่มต่อแผ่น A3 ต่อด้านที่เคลือบ"]
  );
}

/* ── 3. การ์ดอธิบายงานพิมพ์ (วาดเอง) ─────────────────────────────── */

/** พิมพ์ 2 ด้าน — ด้านหน้า/ด้านหลังเป็นคนละลายได้ (ตามงานจริงในรูปหน้าเว็บ) */
async function printCard() {
  console.log("🖼  การ์ดพิมพ์ 2 ด้าน (วาดเอง)");
  const back = "#fed7aa";
  await saveSvg(
    "print-2side",
    frame(`
    ${title("พิมพ์ 2 ด้าน", `กระดาษอาร์ตการ์ด ${GSM} แกรม — รวมในราคาแล้ว`)}
    ${fan(112, 230, 300, 300, { stick: true })}
    ${fan(488, 230, 300, 300, { art: false, stick: true, face: back })}
    <text x="638" y="428" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="#c2410c">meow!</text>
    <text x="262" y="700" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
    <text x="638" y="700" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหลัง</text>
    <text x="450" y="752" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">สองด้านเป็นคนละลายกันได้ ไม่คิดเพิ่ม</text>
    ${foot([
      "มาตรฐานของสินค้าตัวนี้คือพิมพ์ 2 ด้าน ไม่เคลือบลามิเนต",
      "งานพิมพ์ด้านหลังคลาดเคลื่อนได้ 3-5 มม. อย่าวางลายชิดขอบ",
    ])}`)
  );
}

/** กติกาคละลาย — 1-10 อันคละอิสระ · 11 อันขึ้นไป ลายละ 5 อันขึ้นไป */
async function mixCard() {
  console.log("🖼  การ์ดกติกาคละลาย (วาดเอง)");
  const fansRow = (cxc, cy, n, faces) => {
    const side = 92;
    const gap = 14;
    const x0 = cxc - (n * side + (n - 1) * gap) / 2;
    return Array.from({ length: n }, (_, i) =>
      fan(x0 + i * (side + gap), cy, side, side, { art: false, stick: false, face: faces[i % faces.length] })
    ).join("");
  };
  const many = ["#bae6fd", "#fde68a", "#5eead4", "#fca5a5", "#c4b5fd", "#fdba74"];
  await saveSvg(
    "mix-rule",
    frame(`
    ${title("คละลายได้แค่ไหน", "กติกาตามตารางราคาหน้าเว็บ")}
    <text x="450" y="208" font-family="${TH}" font-size="27" font-weight="600" text-anchor="middle" fill="${CYAN}">สั่ง 1-10 อัน</text>
    ${fansRow(450, 232, 6, many)}
    <text x="450" y="368" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">คละได้อิสระ — ทุกอันเป็นคนละลายก็ได้</text>
    <line x1="150" y1="408" x2="750" y2="408" stroke="#e2e8f0" stroke-width="2"/>
    <text x="450" y="464" font-family="${TH}" font-size="27" font-weight="600" text-anchor="middle" fill="${CYAN}">สั่ง 11 อันขึ้นไป</text>
    ${fansRow(450, 488, 5, ["#bae6fd"])}
    ${fansRow(450, 600, 5, ["#fde68a"])}
    <text x="450" y="736" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">คละได้ แต่ลายละ 5 อันขึ้นไป (11 อัน = คละได้ 2 ลาย)</text>
    ${foot(["ไม่มีขั้นต่ำในการสั่งผลิต"])}`)
  );
}

/* ── รัน ─────────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  console.log(`📁 ${OUT}`);
  await sizeCards();
  await coatCards();
  await printCard();
  await mixCard();
  console.log("\n✅ เสร็จ — ต่อด้วย: node scripts/hand-fan-paper-apply.mjs --write");
}
