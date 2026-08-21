#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "เสื้อยี่ห้อ AWESOME.BKK" (new-mt2eng6u-7593)
 *
 *   node scripts/awesome-bkk-art.mjs [--out=<dir>]
 *
 * ได้ 22 ไฟล์ ลง .cache/awesome-bkk/upload — ที่มาแยกเป็น 3 ทาง:
 *
 * 1) ครอปจาก "รูปงานจริง" ในบล็อก เสื้อยี่ห้อ AWESOME.BKK ของหน้า pricelists
 *    rate-dtf / rate-flex / rate-emb   ตัวอย่างงานของแต่ละระบบพิมพ์ (เรทราคา)
 *    color-white / color-black          สีเสื้อ — ถ่ายจากเสื้อจริงของร้าน
 *    emb-10cm / emb-15cm / emb-20cm     ขนาดงานปัก เล็ก/กลาง/ใหญ่
 *
 * 2) ครอปจากอินโฟกราฟิกของร้านเอง (ภาพรวมของหน้า ไม่ได้อยู่เฉพาะบล็อกนี้)
 *    front-5in/a5/a4a3 · back-5in/a5/a4a3  จากภาพ "screen size (ขนาดการสกรีน)" — ครอบการ์ดใหม่ + ติดป้ายบอกด้าน
 *    flex-gloss / flex-matte               ครึ่งซ้าย/ขวาของภาพ "Flex ผิวเงา | ผิวด้าน"
 *    compare-print                          ภาพเทียบ DTF / Flex / SUB / งานปัก (ใช้ในแท็บ)
 *    ⚠️ ครอปจากต้นฉบับเอง ไม่ยืมไฟล์ที่ตัดไว้ให้เสื้อ OVER SIZE — ของเดิมป้าย "ขนาด 5 นิ้ว" โดนตัดขาดครึ่ง
 *
 * 3) วาดเอง — ของที่บล็อกนี้ไม่มีภาพให้
 *    front-none / back-none   "ไม่สกรีนด้านนี้" (เสื้อเปล่า)
 *    size-s/m/l/xl            การ์ดไซซ์รายตัว · size-chart การ์ดตารางไซซ์รวม
 *    ตัวเลขไซซ์มาจากบล็อกเดียวกัน: S 40|26.5|9 · M 44|27.5|10 · L 48|29.5|10.5 · XL 52|30.5|11 (นิ้ว)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/awesome-bkk/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="130" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${810 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

/** ป้ายบอกด้าน (ชิปมุมบนซ้าย) — ให้ดูออกทันทีว่าการ์ดใบนี้พูดถึงด้านหน้าหรือด้านหลัง */
const sideChip = (side) => {
  const w = 190;
  return `<g>
    <rect x="46" y="150" width="${w}" height="52" rx="26" fill="${side === "หน้า" ? "#0891b2" : "#334155"}"/>
    <text x="${46 + w / 2}" y="185" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#ffffff">ด้าน${side}</text>
  </g>`;
};

const save = async (name, buf) => {
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

/* ── 1. รูปงานจริงจากบล็อก AWESOME.BKK ───────────────────────────── */

/** wix id → รูปต้นฉบับขนาดพอดีใช้ (ขอ fit ไม่ให้ Wix ครอปทิ้งเอง) */
const wix = (id) => `https://static.wixstatic.com/media/${id}/v1/fit/w_2000,h_2000/x.jpg`;

/**
 * crop = [left, top, width, height] เป็นสัดส่วน 0-1 ของภาพต้นฉบับ
 * ใช้ตัดเฉพาะจุดที่ตัวเลือกนั้นพูดถึง รูปย่อบนปุ่มเลือกจะได้อ่านออก
 */
const PHOTO_ART = {
  "rate-dtf": { id: "959b83_c00cae77def3400cb637010f8f4bb388~mv2.jpg", note: "DTF — ลายกลางอกบนเสื้อขาว" },
  "rate-flex": { id: "959b83_47e799212b934097aed1d5dcf65f32c8~mv2.jpg", note: "FLEX — ฟิล์มสีทึบบนเสื้อดำ" },
  "rate-emb": { id: "959b83_4fb399281dac4605984889d77f432ac3~mv2.jpg", note: "งานปัก — ลาย Wave บนเสื้อขาว" },
  "color-white": { id: "959b83_bb8bd2b35ac644aaac92e1ae2323b9b2~mv2.jpg", crop: [0.02, 0.05, 0.45, 0.9], note: "เสื้อสีขาว (เนื้อผ้าจริง)" },
  "color-black": { id: "959b83_42aa42f1181c4ae49958018621c69a19~mv2.jpg", crop: [0.0, 0.08, 0.45, 0.85], note: "เสื้อสีดำ (เนื้อผ้าจริง)" },
  "emb-10cm": { id: "959b83_42aa42f1181c4ae49958018621c69a19~mv2.jpg", crop: [0.45, 0.3, 0.5, 0.6], note: "ปักเล็ก ~10 ซม. อกซ้ายเสื้อดำ" },
  "emb-15cm": { id: "959b83_0fe895de64e34f93ad4fd2b858637ee3~mv2.jpg", crop: [0.15, 0.08, 0.75, 0.85], note: "ปักกลาง ~15 ซม. บนเสื้อดำ" },
  "emb-20cm": { id: "959b83_34b061ca25c542cf820e932198e33cd4~mv2.jpg", crop: [0.42, 0.05, 0.56, 0.9], note: "ปักใหญ่ ~20 ซม. ลาย Wave บนเสื้อขาว" },
};

async function photoArt() {
  console.log("🖼  ครอปรูปงานจริงจากบล็อก AWESOME.BKK");
  for (const [name, a] of Object.entries(PHOTO_ART)) {
    let img = sharp(await get(wix(a.id)));
    if (a.crop) {
      const meta = await img.metadata();
      const [l, t, w, h] = a.crop;
      img = img.extract({
        left: Math.round(meta.width * l),
        top: Math.round(meta.height * t),
        width: Math.round(meta.width * w),
        height: Math.round(meta.height * h),
      });
    }
    await save(name, await img.resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer());
  }
}

/* ── 2. การ์ดขนาดสกรีน (อินโฟกราฟิกของร้าน + ป้ายบอกด้าน) ────────── */

/** อินโฟกราฟิก "screen size (ขนาดการสกรีน)" ของร้าน — เสื้อ 4 ตัวเรียง 2x2 (1815 x 2000) */
const SCREEN_SHEET = "959b83_d0346f725fec4e65b1fee44dce18eeea~mv2.jpg";

/** crop = [left, top, width, height] สัดส่วน 0-1 — ตัดทีละตัวให้ได้ทั้งเสื้อและป้ายบอกขนาด */
const SCREEN = [
  ["5in", "ไม่เกิน 5 นิ้ว", [0.024, 0.142, 0.497, 0.412], "ลายเล็ก อกซ้าย หรือกลางอก (ป้ายเล็ก 2 นิ้วก็อยู่ในช่วงนี้)"],
  ["a5", "ไม่เกิน A5", [0.53, 0.142, 0.45, 0.412], "ลายขนาดกลาง กลางอก"],
  ["a4a3", "ไม่เกิน A4 / A3", [0.024, 0.55, 0.965, 0.425], "ลายใหญ่เต็มหน้าอก — A4 แนวนอน หรือ A3 แนวตั้ง"],
];

async function screenCards() {
  console.log("🖼  การ์ดขนาดสกรีน — ครอปจากอินโฟกราฟิกของร้าน + ป้ายบอกด้าน");
  const sheet = await get(wix(SCREEN_SHEET));
  const sheetMeta = await sharp(sheet).metadata();
  for (const [key, label, crop, note] of SCREEN) {
    const [l, t, w, h] = crop;
    const src = await sharp(sheet)
      .extract({
        left: Math.round(sheetMeta.width * l),
        top: Math.round(sheetMeta.height * t),
        width: Math.round(sheetMeta.width * w),
        height: Math.round(sheetMeta.height * h),
      })
      .toBuffer();
    // วางภาพลงกลางการ์ด (พื้นที่ 800 x 560 ใต้หัวข้อ) — ไม่ยืด ไม่ครอป
    const fitted = await sharp(src)
      .resize({ width: 800, height: 560, fit: "inside", withoutEnlargement: false })
      .toBuffer();
    const meta = await sharp(fitted).metadata();
    for (const side of ["หน้า", "หลัง"]) {
      const svg = frame(`${title(`ขนาดสกรีน ${label}`, `สกรีนด้าน${side}`)}${sideChip(side)}${foot([note])}`);
      const buf = await sharp(Buffer.from(svg))
        .composite([{ input: fitted, left: Math.round((W - meta.width) / 2), top: 230 }])
        .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
        .toBuffer();
      await save(`${side === "หน้า" ? "front" : "back"}-${key}`, buf);
    }
  }
}

/* ── 3. ของที่วาดเอง ──────────────────────────────────────────────── */

/**
 * เสื้อยืดวาดแบน 1 ตัว — ใช้กับการ์ด "ไม่สกรีน" และการ์ดไซซ์
 * back = true → คอตื้นและมีแถบคอด้านหลัง (ให้ดูออกว่าเป็นด้านหลัง)
 */
function tee(x, y, w, h, { back = false, fill = "#111827", stroke = "#0f172a" } = {}) {
  const p = (fx, fy) => `${x + w * fx} ${y + h * fy}`;
  const body = `
    M ${p(0.32, 0.03)}
    L ${p(0, 0.13)}
    L ${p(0.055, 0.34)}
    L ${p(0.2, 0.29)}
    L ${p(0.2, 1)}
    L ${p(0.8, 1)}
    L ${p(0.8, 0.29)}
    L ${p(0.945, 0.34)}
    L ${p(1, 0.13)}
    L ${p(0.68, 0.03)}
    Q ${p(0.5, back ? 0.11 : 0.16)} ${p(0.32, 0.03)} Z`;
  // เส้นคอเสื้อ — ด้านหลังเป็นแถบคอตื้น ๆ · ด้านหน้าเป็นเส้นขอบคอกลม
  const collar = `<path d="M ${p(0.34, 0.055)} Q ${p(0.5, back ? 0.13 : 0.18)} ${p(0.66, 0.055)}"
       fill="none" stroke="#ffffff" stroke-width="3" stroke-opacity="0.5"/>`;
  return `<g>
    <path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <path d="${body}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.45" stroke-dasharray="9 9"/>
    ${collar}
  </g>`;
}

/** การ์ด "ไม่สกรีนด้านนี้" — เสื้อเปล่า ไม่มีลาย */
async function noneCards() {
  console.log("🖼  การ์ด ไม่สกรีน (วาดเอง)");
  for (const side of ["หน้า", "หลัง"]) {
    const svg = frame(`
      ${title("ไม่สกรีน", `ด้าน${side}เป็นเสื้อเปล่า ไม่มีลาย`)}
      ${sideChip(side)}
      ${tee(285, 235, 330, 470, { back: side === "หลัง" })}
      ${foot(["เลือกได้ด้านเดียว — อีกด้านต้องมีลาย", "อยากได้ลายทั้งสองด้าน เลือกขนาดสกรีนทั้งหน้าและหลัง"])}`);
    await saveSvg(`${side === "หน้า" ? "front" : "back"}-none`, svg);
  }
}

/** ตารางไซซ์ของบล็อกนี้ (นิ้ว) — รอบอก | ความยาว | ความยาวแขน */
export const SIZES = [
  { name: "S", chest: 40, length: 26.5, sleeve: 9 },
  { name: "M", chest: 44, length: 27.5, sleeve: 10 },
  { name: "L", chest: 48, length: 29.5, sleeve: 10.5 },
  { name: "XL", chest: 52, length: 30.5, sleeve: 11 },
];

/** การ์ดไซซ์รายตัว — เสื้อ + เส้นบอกขนาดจริงของไซซ์นั้น */
async function sizeCards() {
  console.log("🖼  การ์ดไซซ์ S/M/L/XL (วาดเอง)");
  for (const s of SIZES) {
    // กว้างของรูปเสื้อผันตามรอบอกจริง เพื่อให้เทียบกันได้ระหว่างการ์ด (S แคบสุด · XL กว้างสุด)
    const w = 250 + (s.chest - 40) * 8;
    const h = 300 + (s.length - 26.5) * 16;
    const x = W / 2 - w / 2;
    const y = 250;
    const svg = frame(`
      ${title(`ไซซ์ ${s.name}`, `รอบอก ${s.chest} · ความยาว ${s.length} · แขน ${s.sleeve} นิ้ว`)}
      ${tee(x, y, w, h)}
      <g stroke="${CYAN}" stroke-width="2.5" fill="none">
        <path d="M ${x} ${y + h + 34} L ${x + w} ${y + h + 34}"/>
        <path d="M ${x} ${y + h + 24} L ${x} ${y + h + 44} M ${x + w} ${y + h + 24} L ${x + w} ${y + h + 44}"/>
        <path d="M ${x + w + 44} ${y} L ${x + w + 44} ${y + h}"/>
        <path d="M ${x + w + 34} ${y} L ${x + w + 54} ${y} M ${x + w + 34} ${y + h} L ${x + w + 54} ${y + h}"/>
      </g>
      <text x="${W / 2}" y="${y + h + 78}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">รอบอก ${s.chest} นิ้ว</text>
      <text x="${x + w + 70}" y="${y + h / 2}" font-family="${TH}" font-size="26" font-weight="700" fill="${CYAN}">ยาว</text>
      <text x="${x + w + 70}" y="${y + h / 2 + 32}" font-family="${TH}" font-size="26" font-weight="700" fill="${CYAN}">${s.length}"</text>
      ${foot(["ขนาดวัดจากตารางไซซ์ของร้าน (หน่วยเป็นนิ้ว)", "แต่ละไซซ์อาจคลาดเคลื่อน + – ไม่เกินครึ่งนิ้ว"])}`);
    await saveSvg(`size-${s.name.toLowerCase()}`, svg);
  }
}

/** การ์ดตารางไซซ์รวม — ใช้ในแท็บ "ตารางไซซ์" (ภาษาภาพเดียวกับของเสื้อ OVER SIZE) */
async function sizeChart() {
  console.log("🖼  การ์ดตารางไซซ์รวม (วาดเอง)");
  const cols = ["Size\nขนาด", "Chest\nรอบอก", "Length\nความยาว", "Sleeve\nความยาวแขน"];
  const cw = [180, 230, 230, 260];
  const x0 = 60;
  const y0 = 190;
  const rowH = 76;
  let head = "";
  let cx = x0;
  cols.forEach((c, i) => {
    const [en, th] = c.split("\n");
    head += `<rect x="${cx}" y="${y0}" width="${cw[i]}" height="${rowH}" fill="#64748b" stroke="#ffffff" stroke-width="2"/>
      <text x="${cx + cw[i] / 2}" y="${y0 + 32}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="#ffffff">${en}</text>
      <text x="${cx + cw[i] / 2}" y="${y0 + 60}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#e2e8f0">${th}</text>`;
    cx += cw[i];
  });
  let body = "";
  SIZES.forEach((s, r) => {
    const y = y0 + rowH + r * rowH;
    let bx = x0;
    [s.name, s.chest, s.length, s.sleeve].forEach((v, i) => {
      body += `<rect x="${bx}" y="${y}" width="${cw[i]}" height="${rowH}" fill="${r % 2 ? "#f1f5f9" : "#ffffff"}" stroke="#cbd5e1" stroke-width="1.5"/>
        <text x="${bx + cw[i] / 2}" y="${y + 50}" font-family="${TH}" font-size="30" font-weight="${i === 0 ? 700 : 400}" text-anchor="middle" fill="${INK}">${v}</text>`;
      bx += cw[i];
    });
  });
  const svg = frame(`
    <text x="60" y="98" font-family="${TH}" font-size="40" font-weight="700" fill="${INK}">ตารางไซซ์ · AWESOME.BKK</text>
    <text x="60" y="140" font-family="${TH}" font-size="24" fill="${SUB}">หน่วยเป็นนิ้ว · มี 4 ไซซ์ S M L XL</text>
    ${head}${body}
    <text x="60" y="${y0 + rowH * 5 + 60}" font-family="${TH}" font-size="22" fill="${SUB}">** แต่ละไซซ์อาจมีความคลาดเคลื่อน + – ไม่เกินครึ่งนิ้ว **</text>
    <text x="60" y="${y0 + rowH * 5 + 96}" font-family="${TH}" font-size="22" fill="${SUB}">เสื้อยืดคอกลม แขนสั้น · สีขาว | สีดำ</text>`);
  await saveSvg("size-chart", svg);
}

/**
 * ภาพเทียบของร้านอีก 2 ใบ (รูปถ่ายงานจริง ไม่ได้วาด)
 *   flex-gloss / flex-matte  ครึ่งซ้าย/ครึ่งขวาของภาพ "Flex ผิวเงา | ผิวด้าน"
 *   compare-print            ภาพเทียบ DTF / Flex Print / SUB / งานปัก (ใช้ในแท็บ)
 */
const FLEX_SHEET = "959b83_f935e93407c64a42b8b7f8661e1f0db4~mv2.jpg";
const COMPARE_SHEET = "959b83_23d5c7d965db4fa6ab8155fb481aa70c~mv2.jpg";

async function shopSheets() {
  console.log("🖼  ผิวงาน FLEX + ภาพเทียบระบบพิมพ์ — ครอปจากภาพของร้าน");
  const flex = await get(wix(FLEX_SHEET));
  const meta = await sharp(flex).metadata();
  for (const [name, left] of [
    ["flex-gloss", 0],
    ["flex-matte", Math.round(meta.width / 2)],
  ]) {
    const buf = await sharp(flex)
      .extract({ left, top: 0, width: Math.round(meta.width / 2), height: meta.height })
      .resize({ width: 1400, withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    await save(name, buf);
  }
  await save(
    "compare-print",
    await sharp(await get(wix(COMPARE_SHEET))).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
  );
}

async function main() {
  await photoArt();
  await screenCards();
  await noneCards();
  await sizeCards();
  await sizeChart();
  await shopSheets();
  console.log(`\n✅ เสร็จ — ไฟล์อยู่ที่ ${OUT}`);
}

if (process.argv[1] && process.argv[1].endsWith("awesome-bkk-art.mjs")) await main();
