#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "Card Broad Foam หนา 2 mm" (การ์ดบอร์ดโฟม)
 *
 *   node scripts/card-broad-foam-art.mjs [--out=<dir>]
 *
 * ที่มาของภาพแยกเป็น 3 ทาง:
 *
 * 1) ภาพฟิล์มเคลือบจากคลังของร้าน (products/preset-coating/*) — ผิวเงา/ด้าน/กลิตเตอร์/โฮโลแกรม
 *    เป็นผิวงานจริงของร้าน ใช้ทำการ์ด "เคลือบเงา / เคลือบด้าน / เคลือบพิเศษ"
 *
 * 2) ภาพฟอยล์จากงานจริงในหน้าเว็บตารางราคา (บล็อก Card Broad Foam) — การ์ดมังกรปั๊มฟอยล์ทอง
 *    ใช้ทำการ์ด "ปั๊มฟอยล์" คู่กับแผนภาพอธิบาย 1 เลเยอร์ / 2 เลเยอร์
 *
 * 3) วาดเอง — ขนาดทั้ง 7 แบบ (วาดตามสัดส่วนจริง + ผังวางบนแผ่น A3 ว่าได้กี่ใบ) ·
 *    ไม่เคลือบ · ไม่ปั๊มฟอยล์ · ความหนา 2 mm · กติกาคละลาย
 *
 * ⚠️ "ได้กี่ใบต่อแผ่น A3" ไม่ใช่ของประดับ — ค่าเคลือบ/ค่าฟอยล์บนหน้าเว็บคิด "ต่อ 1 แผ่น A3"
 *    เลขในไฟล์นี้จึงถูกใช้หารค่าเคลือบลงเป็นบาทต่อใบใน card-broad-foam-apply.mjs ด้วย
 *    (A7/A6/A5/A4 หน้าเว็บบอกไว้ตรง ๆ — สคริปต์ apply เอาไปทวนกับตารางนี้ ไม่ตรงเมื่อไหร่ = หยุด)
 *
 * รูปงานจริงสำหรับ "แกลเลอรี" ไม่ได้ทำที่นี่ — card-broad-foam-apply.mjs ดึงจากหน้าเว็บให้เอง
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/card-broad-foam/upload").replace(/\/$/, "");

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";
/** เนื้อการ์ดบอร์ด (หน้ากระดาษพิมพ์) และไส้โฟมสีขาวที่เห็นตรงสันตัด */
const CARD = "#eef2f7";
const CARD_EDGE = "#c7ced8";
const FOAM = "#ffffff";

/**
 * ขนาดทั้ง 7 แบบ — mm ตามจริง + ผังวางบนแผ่น A3 (แนวนอน 420×297 mm)
 * cols/rows = จำนวนใบที่วางได้ · perSheet = cols × rows = ตัวหารค่าเคลือบ/ค่าฟอยล์
 *
 * A7/A6/A5/A4 หน้าเว็บระบุจำนวนใบต่อแผ่นไว้เอง (16/8/4/2) — ตรงกับผังนี้พอดี
 * 10x10cm กับ 15x15cm หน้าเว็บไม่ได้ระบุ จึงคิดจากผังวางจริงบนแผ่น A3:
 *   10×10 → 4 คอลัมน์ (400mm) × 2 แถว (200mm) = 8 ใบ
 *   15×15 → 2 คอลัมน์ (300mm) × 1 แถว (150mm) = 2 ใบ
 */
export const SIZES = [
  { key: "size-10x10", name: "10x10cm", w: 100, h: 100, cols: 4, rows: 2, note: "การ์ดจัตุรัส 10×10 ซม." },
  { key: "size-15x15", name: "15x15cm", w: 150, h: 150, cols: 2, rows: 1, note: "การ์ดจัตุรัส 15×15 ซม." },
  { key: "size-a7", name: "A7", w: 105, h: 74, cols: 4, rows: 4, note: "10.5×7.4 ซม. — ขนาดโปสการ์ดเล็ก" },
  { key: "size-a6", name: "A6", w: 105, h: 148, cols: 4, rows: 2, note: "10.5×14.8 ซม. — ขนาดโปสการ์ด" },
  { key: "size-a5", name: "A5", w: 210, h: 148, cols: 2, rows: 2, note: "21×14.8 ซม. — ครึ่ง A4" },
  { key: "size-a4", name: "A4", w: 210, h: 297, cols: 2, rows: 1, note: "21×29.7 ซม. — ขนาดกระดาษ A4" },
  { key: "size-a3", name: "A3", w: 297, h: 420, cols: 1, rows: 1, note: "29.7×42 ซม. — เต็มแผ่น A3" },
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
 * การ์ดบอร์ดโฟม 1 ใบ มองเฉียง — เห็น "สัน" ที่เป็นไส้โฟมขาวหนา 2 mm
 * เป็นเอกลักษณ์ของสินค้าตัวนี้ (การ์ดกระดาษธรรมดาไม่มีสันขาว)
 */
function foamCard(x, y, w, h, { art = true, thick = 10, face = CARD } = {}) {
  return `<g>
    <rect x="${x + thick}" y="${y + thick}" width="${w}" height="${h}" rx="4" fill="#dbe2ea" opacity="0.55"/>
    <path d="M ${x + w} ${y} L ${x + w + thick} ${y + thick * 0.55} L ${x + w + thick} ${y + h + thick * 0.55} L ${x + w} ${y + h} Z" fill="${FOAM}" stroke="${CARD_EDGE}" stroke-width="1.6"/>
    <path d="M ${x} ${y + h} L ${x + thick} ${y + h + thick * 0.55} L ${x + w + thick} ${y + h + thick * 0.55} L ${x + w} ${y + h} Z" fill="#f4f6f9" stroke="${CARD_EDGE}" stroke-width="1.6"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${face}" stroke="${CARD_EDGE}" stroke-width="2"/>
    ${art ? cardArt(x, y, w, h) : ""}
  </g>`;
}

/** ลายพิมพ์จำลองบนหน้าการ์ด — พอให้ดูออกว่าเป็นงานพิมพ์ ไม่ใช่กระดาษเปล่า */
function cardArt(x, y, w, h) {
  const p = Math.min(w, h) * 0.12;
  const iw = w - p * 2;
  const ih = h - p * 2;
  return `<g opacity="0.9">
    <rect x="${x + p}" y="${y + p}" width="${iw}" height="${ih}" rx="2" fill="#bae6fd"/>
    <circle cx="${x + p + iw * 0.32}" cy="${y + p + ih * 0.33}" r="${Math.min(iw, ih) * 0.16}" fill="#fde68a"/>
    <path d="M ${x + p} ${y + p + ih} L ${x + p + iw * 0.42} ${y + p + ih * 0.45} L ${x + p + iw * 0.7} ${y + p + ih} Z" fill="#5eead4"/>
    <path d="M ${x + p + iw * 0.45} ${y + p + ih} L ${x + p + iw * 0.78} ${y + p + ih * 0.58} L ${x + p + iw} ${y + p + ih} Z" fill="#38bdf8"/>
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

/* ── 1. การ์ดขนาด 7 แบบ ──────────────────────────────────────────── */

/**
 * การ์ดหนึ่งใบ = ซ้ายเป็นชิ้นงานวาดตามสัดส่วนจริง (มีเส้นบอกขนาด)
 *                ขวาเป็นผังวางบนแผ่น A3 ว่าตัดได้กี่ใบ
 * ผังฝั่งขวาไม่ได้มีไว้สวย ๆ — ค่าเคลือบ/ค่าฟอยล์คิดต่อแผ่น A3 ลูกค้าจะได้เห็นว่าทำไมใบเล็กจ่ายค่าเคลือบน้อยกว่า
 */
async function sizeCards() {
  // สเกลเดียวกันทั้ง 7 ใบ เพื่อให้เทียบขนาดข้ามการ์ดได้ (A3 = ใบใหญ่สุด ต้องพอดีกรอบซ้าย)
  const BOXW = 360;
  const BOXH = 400;
  const big = SIZES.at(-1);
  const scale = Math.min(BOXW / big.w, BOXH / big.h);

  for (const s of SIZES) {
    const w = s.w * scale;
    const h = s.h * scale;
    const cx = 60 + (BOXW - w) / 2;
    const cy = 250 + (BOXH - h) / 2;

    // ผังแผ่น A3 ฝั่งขวา
    const sw = 286;
    const sh = (SHEET.h / SHEET.w) * sw;
    const sx = 534;
    const sy = 330;
    const cw = sw / s.cols;
    const ch = sh / s.rows;
    const tiles = [];
    for (let r = 0; r < s.rows; r++)
      for (let c = 0; c < s.cols; c++)
        tiles.push(
          `<rect x="${(sx + c * cw + 2).toFixed(1)}" y="${(sy + r * ch + 2).toFixed(1)}" width="${(cw - 4).toFixed(1)}" height="${(ch - 4).toFixed(1)}" rx="2" fill="#bae6fd" stroke="${CYAN}" stroke-width="1.5"/>`
        );

    await saveSvg(
      s.key,
      frame(`
      ${title(s.name, s.note)}
      <text x="240" y="205" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ขนาดชิ้นงานจริง</text>
      ${foamCard(cx, cy, w, h)}
      ${/* เส้นบอกความกว้างวางใต้ชิ้นงาน — ใบใหญ่สุด (A3) ชิดหัวกรอบ วางไว้ด้านบนแล้วทับคำว่า "ขนาดชิ้นงานจริง" */ ""}
      ${dim(cx, cy + h + 44, cx + w, cy + h + 44, `${cm(s.w)} ซม.`)}
      ${dim(cx + w + 40, cy, cx + w + 40, cy + h, `${cm(s.h)} ซม.`, { vertical: true })}
      <text x="677" y="205" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">วางบนแผ่น A3 ได้</text>
      <text x="677" y="270" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${CYAN}">${s.perSheet} ใบ</text>
      <rect x="${sx - 8}" y="${sy - 8}" width="${sw + 16}" height="${sh + 16}" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
      ${tiles.join("")}
      <text x="677" y="${sy + sh + 44}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">แผ่น A3 (29.7 × 42 ซม.)</text>
      ${foot([
        "หนา 2 mm ทุกขนาด — สันตัดเห็นไส้โฟมสีขาว",
        `ค่าเคลือบ/ค่าฟอยล์คิดต่อแผ่น A3 → หารลง ${s.perSheet} ใบ`,
      ])}`)
    );
  }

  /*
    การ์ดรวม: เรียงทั้ง 7 ขนาดข้างกันบนเส้นฐานเดียว สเกลเดียวกัน
    (เคยลองวางซ้อนจากมุมเดียวกัน แต่ 15x15cm กับ A6/A5 สูงพอ ๆ กัน ป้ายชื่อทับกันอ่านไม่ออก)
  */
  const ROW_W = 780;
  const ROW_H = 430;
  const gap = 14;
  const totalMm = SIZES.reduce((n, s) => n + s.w, 0);
  const sc = Math.min((ROW_W - gap * (SIZES.length - 1)) / totalMm, ROW_H / big.h);
  const baseY = 660;
  let px = (W - (SIZES.reduce((n, s) => n + s.w * sc, 0) + gap * (SIZES.length - 1))) / 2;
  const layers = SIZES.map((s, i) => {
    const w = s.w * sc;
    const h = s.h * sc;
    const x0 = px;
    px += w + gap;
    const tone = ["#ecfeff", "#cffafe", "#a5f3fc", "#67e8f9", "#22d3ee", "#0891b2", "#0e7490"][i] ?? "#e0f2fe";
    return `<rect x="${x0.toFixed(1)}" y="${(baseY - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${tone}" stroke="#0e7490" stroke-width="1.6"/>
      <text x="${(x0 + w / 2).toFixed(1)}" y="${baseY + 30}" font-family="${TH}" font-size="${s.name.length > 4 ? 17 : 21}" font-weight="700" text-anchor="middle" fill="#0f172a">${esc(s.name)}</text>`;
  });
  await saveSvg(
    "size-compare",
    frame(`
    ${title("ขนาดทั้ง 7 แบบ", "เรียงบนเส้นฐานเดียวกัน สเกลเดียวกัน")}
    ${layers.join("")}
    <line x1="60" y1="${baseY}" x2="840" y2="${baseY}" stroke="#cbd5e1" stroke-width="2"/>
    ${foot(["ราคาต่อชิ้นต่างกันตามขนาด (ดูตารางราคา)", "ทุกขนาดหนา 2 mm เท่ากัน"])}`)
  );
}

/* ── 2. การ์ดเคลือบ (ใช้ผิวฟิล์มจริงจากคลังร้าน) ──────────────────── */

/** วางแถบผิวฟิล์มจริงเรียงกัน + คำอธิบาย */
async function coatCard(name, head, sub, films, notes) {
  const gapY = 250;
  const boxW = films.length === 1 ? 520 : 245;
  const boxH = films.length === 1 ? 380 : 330;
  const gap = 26;
  const totalW = films.length * boxW + (films.length - 1) * gap;
  let x = (W - totalW) / 2;
  const parts = [];
  for (const f of films) {
    // contain ไม่ใช่ cover — รูปผิวฟิล์มในคลังมีตัวหนังสือกำกับอยู่ในภาพ ครอปแล้วโดนตัดคำ
    const img = await sharp(await get(`${COAT_BASE}/${f.file}.jpg`))
      .resize(Math.round(boxW), Math.round(boxH), { fit: "contain", background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    parts.push(`<image x="${x}" y="${gapY}" width="${boxW}" height="${boxH}" preserveAspectRatio="xMidYMid slice"
        href="data:image/jpeg;base64,${img.toString("base64")}" clip-path="inset(0 round 14px)"/>
      <rect x="${x}" y="${gapY}" width="${boxW}" height="${boxH}" rx="14" fill="none" stroke="#e2e8f0" stroke-width="2"/>
      <text x="${x + boxW / 2}" y="${gapY + boxH + 38}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${INK}">${esc(f.label)}</text>`);
    x += boxW + gap;
  }
  await saveSvg(name, frame(`${title(head, sub)}${parts.join("")}${foot(notes)}`));
}

async function coatCards() {
  await saveSvg(
    "coat-none",
    frame(`
    ${title("ไม่เคลือบ", "ผิวหน้ากระดาษของการ์ดบอร์ดตามธรรมชาติ")}
    ${foamCard(305, 280, 290, 380)}
    ${foot(["รวมในราคาการ์ดแล้ว ไม่บวกเพิ่ม", "ไม่มีฟิล์มกันรอย/กันน้ำทับหน้า"])}`)
  );
  await coatCard(
    "coat-gloss",
    "เคลือบเงา",
    "ฟิล์มผิวมันวาว — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss", label: "ผิวเงา" }],
    ["สีสดขึ้น เงาวาว กันน้ำ/รอยเปื้อนได้ดีกว่าไม่เคลือบ", "ค่าเคลือบคิดต่อแผ่น A3 (หารตามจำนวนใบที่ได้)"]
  );
  await coatCard(
    "coat-matte",
    "เคลือบด้าน",
    "ฟิล์มผิวด้านนวล — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss-matte", label: "ผิวด้าน" }],
    ["นวลตา ไม่สะท้อนแสง ลายนิ้วมือไม่ติด", "ค่าเคลือบคิดต่อแผ่น A3 (หารตามจำนวนใบที่ได้)"]
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
    ["เลือกผิวฟิล์มย่อยได้ในกลุ่ม “ผิวเคลือบพิเศษ” หลังเลือกแบบนี้", "ค่าเคลือบคิดต่อแผ่น A3 (หารตามจำนวนใบที่ได้)"]
  );
}

/* ── 3. การ์ดปั๊มฟอยล์ ───────────────────────────────────────────── */

/**
 * แผนภาพ "หน้าตัด" ของงานฟอยล์ — อธิบายว่า 1 เลเยอร์ กับ 2 เลเยอร์ ต่างกันตรงไหน
 * 1 เลเยอร์ = ฟอยล์ลงบนการ์ดเปล่า ไม่มีพิมพ์สีรองข้างใต้
 * 2 เลเยอร์ = พิมพ์สีก่อน แล้วปั๊มฟอยล์ทับลงบนงานพิมพ์อีกชั้น
 */
function foilStack(cx, y, { printed, foilFill }) {
  const w = 420;
  const x = cx - w / 2;
  const rows = [];
  let cy = y;
  rows.push(`<rect x="${x}" y="${cy}" width="${w}" height="46" rx="4" fill="${foilFill}" stroke="#94a3b8" stroke-width="2"/>
    <text x="${cx}" y="${cy + 32}" font-family="${TH}" font-size="24" font-weight="600" text-anchor="middle" fill="#1f2937">ชั้นฟอยล์</text>`);
  cy += 56;
  if (printed) {
    rows.push(`<rect x="${x}" y="${cy}" width="${w}" height="46" rx="4" fill="#bae6fd" stroke="#7dd3fc" stroke-width="2"/>
      <text x="${cx}" y="${cy + 32}" font-family="${TH}" font-size="24" text-anchor="middle" fill="#0f172a">งานพิมพ์สี</text>`);
    cy += 56;
  }
  rows.push(`<rect x="${x}" y="${cy}" width="${w}" height="70" rx="4" fill="${FOAM}" stroke="${CARD_EDGE}" stroke-width="2"/>
    <text x="${cx}" y="${cy + 44}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">การ์ดบอร์ดโฟม 2 mm</text>`);
  return rows.join("");
}

/** ไล่สีจำลองผิวฟอยล์ (ทอง = ฟอยล์สีปกติ · รุ้ง = โฮโลแกรม) */
const FOIL_GRAD = `
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#b78628"/><stop offset="0.35" stop-color="#fef3c7"/>
    <stop offset="0.6" stop-color="#d4af37"/><stop offset="1" stop-color="#8f6b1e"/>
  </linearGradient>
  <linearGradient id="holo" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#f0abfc"/><stop offset="0.25" stop-color="#93c5fd"/>
    <stop offset="0.5" stop-color="#6ee7b7"/><stop offset="0.75" stop-color="#fde68a"/><stop offset="1" stop-color="#fca5a5"/>
  </linearGradient>`;

/**
 * การ์ดชนิดการปั๊มฟอยล์ — โฮโลแกรมไม่มีการ์ดของตัวเองแล้ว
 * (ย้ายไปเป็น "สีโฮโลแกรม" ในกลุ่มสีฟอยล์ ใช้ภาพงานจริงชุดเดียวกับ Photo card Digital)
 */
async function foilCards() {
  await saveSvg(
    "foil-none",
    frame(`
    ${title("ไม่ปั๊มฟอยล์", "งานพิมพ์สีอย่างเดียว")}
    ${foamCard(305, 280, 290, 380)}
    ${foot(["รวมในราคาการ์ดแล้ว ไม่บวกเพิ่ม", "อยากได้ผิวมันวาว เลือกที่กลุ่ม “เคลือบ” แทนได้"])}`)
  );

  const cards = [
    ["foil-1layer", "ปั๊มฟอยล์ 1 เลเยอร์", "ฟอยล์ลงบนการ์ดเปล่า — ไม่มีพิมพ์สีรองข้างใต้", false, "url(#gold)", "เงิน · ทอง · โรสโกลด์ (เลือกสีได้)"],
    ["foil-2layer", "ปั๊มฟอยล์ 2 เลเยอร์", "พิมพ์สีก่อน แล้วปั๊มฟอยล์ทับบนงานพิมพ์", true, "url(#gold)", "เงิน · ทอง · โรสโกลด์ (เลือกสีได้)"],
  ];
  for (const [key, head, sub, printed, fill, note] of cards) {
    await saveSvg(
      key,
      frame(`<defs>${FOIL_GRAD}</defs>
      ${title(head, sub)}
      ${foilStack(450, printed ? 330 : 386, { printed, foilFill: fill })}
      ${printed ? `<text x="450" y="600" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">งานพิมพ์ 2 เลเยอร์ ตำแหน่งฟอยล์เลื่อนได้ 1-2 mm</text>` : ""}
      ${foot([note, "ค่าฟอยล์คิดต่อแผ่น A3 (หารตามจำนวนใบที่ได้)"])}`)
    );
  }
}

/* ── 4. การ์ดข้อมูลสำหรับแท็บ ────────────────────────────────────── */

async function infoCards() {
  // ความหนา 2 mm — วาดหน้าตัดให้เห็นไส้โฟมขาวคั่นกลางกระดาษ 2 หน้า
  const x = 150;
  const y = 300;
  const w = 400;
  const lx = x + w + 24; // ป้ายอยู่ในกรอบพอดี (ก่อนหน้านี้ยาวเลยขอบขวาจนโดนตัด)
  await saveSvg(
    "thick-2mm",
    frame(`
    ${title("ความหนา 2 mm", "หน้าตัดของการ์ดบอร์ดโฟม")}
    <rect x="${x}" y="${y}" width="${w}" height="22" fill="#cbd5e1" stroke="${CARD_EDGE}" stroke-width="2"/>
    <rect x="${x}" y="${y + 22}" width="${w}" height="120" fill="${FOAM}" stroke="${CARD_EDGE}" stroke-width="2"/>
    <rect x="${x}" y="${y + 142}" width="${w}" height="22" fill="#cbd5e1" stroke="${CARD_EDGE}" stroke-width="2"/>
    <line x1="${x + w}" y1="${y + 11}" x2="${lx - 8}" y2="${y + 11}" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="${x + w}" y1="${y + 82}" x2="${lx - 8}" y2="${y + 82}" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="${x + w}" y1="${y + 153}" x2="${lx - 8}" y2="${y + 153}" stroke="#cbd5e1" stroke-width="1.5"/>
    <text x="${lx}" y="${y + 18}" font-family="${TH}" font-size="20" fill="${SUB}">ผิวกระดาษ (พิมพ์ลาย)</text>
    <text x="${lx}" y="${y + 89}" font-family="${TH}" font-size="20" fill="${SUB}">ไส้โฟม</text>
    <text x="${lx}" y="${y + 160}" font-family="${TH}" font-size="20" fill="${SUB}">ผิวกระดาษ (ด้านหลัง)</text>
    ${dim(x - 40, y, x - 40, y + 164, "2 mm", { vertical: true })}
    <text x="450" y="580" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">แข็ง ตั้งได้ ไม่งอง่ายเหมือนกระดาษแผ่นเดียว</text>
    <text x="450" y="622" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">เหมาะกับการ์ดสะสม การ์ดอวยพร ป้ายตั้งโต๊ะ</text>
    ${foot(["สันตัดเห็นไส้โฟมสีขาวเป็นเอกลักษณ์", "ผิวสัมผัสเรียบเนียน พิมพ์สีคมชัด"])}`)
  );

  // กติกาคละลาย — 1-10 ชิ้นคละอิสระ · 11 ชิ้นขึ้นไป ลายละ 5 ชิ้นขึ้นไป
  const cardsRow = (cx, cy, n, colors) =>
    Array.from({ length: n }, (_, i) => {
      const w = 44;
      const gap = 10;
      const x0 = cx - (n * w + (n - 1) * gap) / 2 + i * (w + gap);
      return `<rect x="${x0}" y="${cy}" width="${w}" height="60" rx="4" fill="${colors[i % colors.length]}" stroke="#0e7490" stroke-width="1.6"/>`;
    }).join("");
  const many = ["#bae6fd", "#fde68a", "#5eead4", "#fca5a5", "#c4b5fd", "#fdba74"];
  await saveSvg(
    "mix-rule",
    frame(`
    ${title("คละลายได้แค่ไหน", "กติกาตามตารางราคาหน้าเว็บ")}
    <text x="450" y="212" font-family="${TH}" font-size="27" font-weight="600" text-anchor="middle" fill="${CYAN}">สั่ง 1-10 ชิ้น</text>
    ${cardsRow(450, 240, 6, many)}
    <text x="450" y="348" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">คละได้อิสระ — ทุกชิ้นเป็นคนละลายก็ได้</text>
    <line x1="150" y1="392" x2="750" y2="392" stroke="#e2e8f0" stroke-width="2"/>
    <text x="450" y="452" font-family="${TH}" font-size="27" font-weight="600" text-anchor="middle" fill="${CYAN}">สั่ง 11 ชิ้นขึ้นไป</text>
    ${cardsRow(450, 480, 5, ["#bae6fd"])}
    ${cardsRow(450, 556, 5, ["#fde68a"])}
    <text x="450" y="664" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">คละได้ แต่ลายละ 5 ชิ้นขึ้นไป (11 ชิ้น = คละได้ 2 ลาย)</text>
    ${foot(["คละเกินโควตาสั่งได้ แต่ราคาจะตกไปคิดตามจำนวนชิ้นต่อลาย", "ไม่มีขั้นต่ำในการสั่งผลิต"])}`)
  );
}

/* ── รัน ─────────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  console.log(`🎨 วาดภาพประกอบตัวเลือก Card Broad Foam → ${OUT}`);
  await sizeCards();
  await coatCards();
  await foilCards();
  await infoCards();
  console.log("✅ เสร็จ — ต่อด้วย node scripts/card-broad-foam-apply.mjs");
}
