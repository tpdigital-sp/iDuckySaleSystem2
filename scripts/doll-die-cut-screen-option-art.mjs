#!/usr/bin/env node
/**
 * DOLL DIE-CUT งานสกรีน (doll-die-cut-2 · /products/DOLL-DIE-CUT-งานสกรีน)
 * ภาพประกอบกลุ่มตัวเลือก 3 กลุ่ม + เปลี่ยนชื่อตัวเลือกกลุ่ม "พิมพ์ลาย"
 *
 *   node scripts/doll-die-cut-screen-option-art.mjs            (วาดภาพลง .cache/doll-die-cut-2/upload ดูก่อน)
 *   node scripts/doll-die-cut-screen-option-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * ทำ 3 อย่าง (ผู้ใช้สั่ง 3 ก.ย. 69):
 *   1. "ขนาด" 8 ใบ — กรอบขนาดจริง (เส้นประ) + ตุ๊กตาไดคัทในกรอบ + หุ่นคนนั่งเทียบขนาด
 *      ทุกใบสเกลเดียวกัน CM = 5.06 px/ซม. → เทียบข้ามตัวเลือกได้จริง
 *   2. "พิมพ์ลาย" เปลี่ยนชื่อ "1 ด้าน" → "สกรีน 1 ด้าน" · "2 ด้าน" → "สกรีน 2 ด้าน"
 *      ⚠️ กลุ่มนี้เป็น **แกนตารางราคา** (driverLabels ["ขนาด","พิมพ์ลาย"]) — คีย์ cells คือ
 *      "15x15cm│1 ด้าน" ต้องเปลี่ยนคีย์ตามชื่อใหม่ทั้ง data.pricing และ data.priceRates[*].pricing
 *      ไม่งั้นราคาหล่นไปที่ product.price เงียบ ๆ (ดูโน้ต iducky-price-driver-trap)
 *      + ภาพ 2 ใบ: ตุ๊กตาหน้า-หลัง เห็นว่าหลังพิมพ์ลายหรือเป็นผ้าเปล่า
 *   3. "เนื้อผ้า" 4 ใบ — ครอปสวอตช์ผ้าจริงจากใบสเปคร้าน (ทั้ง 4 ผืนพิมพ์ลายเดียวกัน เห็นเนื้อผ้าต่างกันชัด)
 *      /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/P-ใบชนิดเนื้อผ้า-New.jpg
 *      แคชครอปไว้ที่ .cache/doll-die-cut-2/src/ — ไดรฟ์ไม่ได้ต่อก็ยังเรนเดอร์ซ้ำได้
 *
 * ตุ๊กตาไดคัท = มาสคอตเป็ด + ขอบขาวไดคัทรอบตัว (ขยายจาก alpha ของ PNG จริง ไม่ได้วาดทรงเอง)
 * รันซ้ำได้: รับทั้งชื่อเก่า/ใหม่ · เขียนทับ imageSrc ตัวเดิม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { MASCOTS, assetPath } from "./iducky-assets.mjs";

const PRODUCT_ID = "doll-die-cut-2";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
const SRC = `.cache/${PRODUCT_ID}/src`;
mkdirSync(OUT, { recursive: true });
mkdirSync(SRC, { recursive: true });

const SIZE_GROUP = "ขนาด";
const PRINT_GROUP = "พิมพ์ลาย";
const FABRIC_GROUP = "เนื้อผ้า";
/** ชื่อเก่า → ชื่อใหม่ (รันซ้ำ = เจอชื่อใหม่อยู่แล้วก็ผ่าน) */
const RENAME = { "1 ด้าน": "สกรีน 1 ด้าน", "2 ด้าน": "สกรีน 2 ด้าน" };

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

// ── ตุ๊กตาไดคัท: มาสคอต + ขอบขาวเย็บรอบตัว ────────────────────────────
/**
 * ขอบไดคัทได้จากการ "พอง" alpha ของ PNG มาสคอตจริง (blur→threshold)
 * blank = ด้านหลังที่ไม่พิมพ์ลาย: ทรงเดียวกันแต่ในเนื้อเป็นผ้าสีพื้น
 */
async function dieCut(mascot, { width = 460, blank = false } = {}) {
  const art = await sharp(assetPath(MASCOTS[mascot] ?? mascot)).trim({ threshold: 1 }).resize({ width }).png().toBuffer();
  const m = await sharp(art).metadata();
  const pad = 80;
  const cw = m.width + pad * 2;
  const ch = m.height + pad * 2;
  const canvas = () => sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

  const padded = await canvas().composite([{ input: art, left: pad, top: pad }]).png().toBuffer();
  // ⚠️ alpha ของมาสคอตมีขอบฟุ้ง — ต้อง threshold ให้เป็นทรงคมก่อน ไม่งั้นขอบไดคัทที่ "พอง" ออกมาแทบไม่ขยับ
  const hard = await sharp(await sharp(padded).extractChannel("alpha").toBuffer()).threshold(140).toBuffer();
  const S = width * 0.03;                                        // รัศมีพองของขอบไดคัท
  const dil = await sharp(hard).blur(S).threshold(60).toBuffer();   // ขอบขาว
  const dil2 = await sharp(hard).blur(S).threshold(22).toBuffer();  // เส้นขอบนอก + เงา
  const fill = (hex, mask) => sharp({ create: { width: cw, height: ch, channels: 3, background: hex } }).joinChannel(mask).png().toBuffer();
  const shadow = await sharp(await fill("#0f172a", dil2)).blur(14).toBuffer();

  const buf = await canvas().composite([
    { input: shadow, left: 5, top: 14, opacity: 0.28 },
    { input: await fill("#c7d2de", dil2) },                       // เส้นขอบนอกจาง ๆ ให้เห็นทรงบนพื้นขาว
    { input: await fill("#ffffff", dil) },                        // ขอบไดคัทขาว (เย็บรอบตัว)
    { input: blank ? await fill("#f3f1ec", hard) : padded },      // เนื้อใน: ลายสกรีน หรือผ้าสีพื้น
  ]).png({ compressionLevel: 9, quality: 80, palette: true }).toBuffer();
  return { uri: `data:image/png;base64,${buf.toString("base64")}`, ratio: cw / ch };
}

const FRONT = await dieCut("heart");
const BACK_PRINT = await dieCut("peace");
const BACK_BLANK = await dieCut("heart", { blank: true });

/** วางตุ๊กตาให้พอดีกรอบ w×h (px) โดยรักษาสัดส่วน */
const doll = (d, cx, cy, boxW, boxH, opacity = 1) => {
  let w = boxW;
  let h = w / d.ratio;
  if (h > boxH) { h = boxH; w = h * d.ratio; }
  return `<image href="${d.uri}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/** กรอบการ์ด + หัวเรื่อง/หมายเหตุ (ชุดเดียวกับสคริปต์ภาพตัวเลือกตัวอื่นของร้าน) */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ลูกศรวัดขนาด (ทรงเดียวกับ mousepad-size-art) */
const dim = (x1, y1, x2, y2, label, t = 0.5) => {
  const vertical = x1 === x2;
  const lx = vertical ? Math.min(x1, W - 70) : (x1 + x2) / 2;
  const ly = vertical ? y1 + (y2 - y1) * t + 8 : y2 + 30;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}" width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** ป้ายกำกับเล็ก */
const tag = (cx, y, text, on = false) => {
  const w = text.length * 12.5 + 40;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="38" rx="19" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2"/>
  <text x="${cx}" y="${y + 26}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

// ── กลุ่ม "ขนาด" ─────────────────────────────────────────────────────
/** สเกลรวมทุกใบ — 85 ซม. (ใบใหญ่สุด) = 430 px */
const CM = 5.06;
const GROUND = 700;      // เส้นพื้นที่ชิ้นงาน/หุ่นคนวางอยู่
const PILLOW_X = 330;    // จุดกึ่งกลางแนวนอนของกรอบขนาด
const PERSON_X = 700;    // หุ่นคนนั่ง (เทียบขนาด) อยู่หลังชิ้นงาน

const SIZES = [
  { name: "15x15cm", cm: 15, use: "ตัวเล็ก พกพา/ของชำร่วย" },
  { name: "25x25cm", cm: 25, use: "ขนาดกำลังดี ตั้งโชว์บนโต๊ะ" },
  { name: "35x35cm", cm: 35, use: "หมอนตุ๊กตาตัวเล็ก กอดถนัดมือ" },
  { name: "45x45cm", cm: 45, use: "เท่าหมอนอิงมาตรฐาน วางโซฟา" },
  { name: "55x55cm", cm: 55, use: "ตัวใหญ่ กอดเต็มอ้อมแขน" },
  { name: "65x65cm", cm: 65, use: "ตัวใหญ่พิเศษ ใช้เป็นหมอนกอด" },
  { name: "75x75cm", cm: 75, use: "ไซซ์จัมโบ้ เท่าหมอนหนุน" },
  { name: "85x85cm", cm: 85, use: "ใหญ่ที่สุด ตัวเท่าเด็กเล็ก" },
];

/** หุ่นคนนั่งขัดสมาธิ สูงจากพื้นถึงหัว ~96 ซม. — เงาเทาอ่อน ไว้เทียบขนาดอย่างเดียว */
function person(cx, ground) {
  const u = (cm) => cm * CM;
  const y = (cm) => ground - u(cm);
  return `<g fill="#e3e9f0">
    <rect x="${cx - u(31)}" y="${y(24)}" width="${u(62)}" height="${u(24)}" rx="${u(12)}"/>
    <rect x="${cx - u(30)}" y="${y(66)}" width="${u(11)}" height="${u(42)}" rx="${u(5.5)}"/>
    <rect x="${cx + u(19)}" y="${y(66)}" width="${u(11)}" height="${u(42)}" rx="${u(5.5)}"/>
    <rect x="${cx - u(19)}" y="${y(70)}" width="${u(38)}" height="${u(48)}" rx="${u(14)}"/>
    <circle cx="${cx}" cy="${y(84)}" r="${u(12)}"/>
  </g>`;
}

function sizeArt(s) {
  const side = s.cm * CM;
  const x0 = PILLOW_X - side / 2;
  const y0 = GROUND - side;
  const big = `${s.cm}×${s.cm}`;
  const bw = 336;   // กว้างคงที่ ให้เลข+หน่วยอยู่ในกรอบครอป 300-600 ของภาพย่อทั้งใบ
  const bigY = 450;   // กลางกรอบครอปของภาพย่อ (62×62 เห็นแค่กลางภาพ) — เลขต้องอยู่ตรงนี้
  const body = `
  ${person(PERSON_X, GROUND)}
  ${tag(PERSON_X, GROUND + 14, "คนนั่ง สูง 1 ม.")}
  <line x1="60" y1="${GROUND}" x2="${W - 60}" y2="${GROUND}" stroke="#e2e8f0" stroke-width="3"/>
  <rect x="${x0}" y="${y0}" width="${side}" height="${side}" rx="10" fill="#f8fbfd" stroke="#a5f3fc" stroke-width="2.5" stroke-dasharray="10 8"/>
  ${doll(FRONT, PILLOW_X, y0 + side / 2, side * 0.94, side * 0.94)}
  ${dim(x0, GROUND + 44, x0 + side, GROUND + 44, `${s.cm} ซม.`)}
  ${dim(x0 + side + 36, y0, x0 + side + 36, GROUND, `${s.cm} ซม.`, 0.8)}
  <g>
    <rect x="${W / 2 - bw / 2}" y="${bigY - 62}" width="${bw}" height="96" rx="24" fill="#ffffff" opacity="0.93" stroke="#a5f3fc" stroke-width="2.5"/>
    <text x="${W / 2 - 32}" y="${bigY + 6}" font-family="${TH}" font-size="74" font-weight="800" text-anchor="middle" fill="${OK}">${big}</text>
    <text x="${W / 2 + 120}" y="${bigY + 4}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${SUB}">ซม.</text>
  </g>`;
  return card(`ขนาด ${s.cm} × ${s.cm} ซม.`, s.use, body,
    "ทรงไดคัทตามลาย — วัดจากกรอบกว้าง × สูงของลาย",
    "ทุกภาพสเกลเดียวกัน เทียบขนาดข้ามตัวเลือกได้จริง");
}

// ── กลุ่ม "พิมพ์ลาย" (สกรีน 1 / 2 ด้าน) ───────────────────────────────
function printArt(sides) {
  const one = sides === 1;
  const cy = 430;
  const box = 300;
  const lx = 232;
  const rx = 668;
  const body = `
  ${doll(FRONT, lx, cy, box, box)}
  ${doll(one ? BACK_BLANK : BACK_PRINT, rx, cy, box, box)}
  ${one ? `<text x="${rx}" y="${cy + 12}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="#b6bfca">ไม่พิมพ์ลาย</text>` : ""}
  ${tag(lx, 618, "ด้านหน้า — พิมพ์ลาย", true)}
  ${tag(rx, 618, one ? "ด้านหลัง — ผ้าสีพื้น" : "ด้านหลัง — พิมพ์ลาย", !one)}
  <g>
    <circle cx="${W / 2}" cy="${cy - 12}" r="82" fill="#ffffff" stroke="${OK}" stroke-width="4"/>
    <text x="${W / 2}" y="${cy + 6}" font-family="${TH}" font-size="86" font-weight="800" text-anchor="middle" fill="${OK}">${sides}</text>
    <text x="${W / 2}" y="${cy + 48}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${SUB}">ด้าน</text>
  </g>`;
  return one
    ? card("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้าด้านเดียว", body,
      "ด้านหลังเป็นผ้าสีพื้น ไม่มีลาย", "เย็บขอบไดคัทรอบตัว ยัดใยทั้งใบ")
    : card("สกรีน 2 ด้าน", "พิมพ์ลายทั้งด้านหน้าและด้านหลัง", body,
      "หน้า-หลังใช้คนละลายได้", "เย็บขอบไดคัทรอบตัว ยัดใยทั้งใบ");
}

// ── กลุ่ม "เนื้อผ้า" — ครอปสวอตช์ผ้าจริงจากใบสเปคร้าน ────────────────
const SHEET = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/P-ใบชนิดเนื้อผ้า-New.jpg";
/** พิกัดช่องในใบสเปค (อ้างอิงภาพย่อกว้าง 854 px) — [คอลัมน์ 0-3, แถว 0-4] */
const SHEET_COLX = [[37, 215], [240, 420], [443, 622], [646, 825]];
const SHEET_ROWY = [[143, 283], [395, 535], [645, 787], [895, 1037], [1142, 1282]];

const FABRICS = [
  {
    name: "ผ้าขนสั้น", file: "shortplush", col: 3, row: 1, en: "Short Plush",
    lines: ["เนื้อผ้านุ่มละมุนผิว ยืดหยุ่นเล็กน้อย ให้ความรู้สึกอบอุ่น", "ขนสั้นเรียงตัวแน่น ไม่หลุดร่วงง่าย ทนทาน สีไม่ซีดจางง่าย"],
  },
  {
    name: "ฮาร์มิต", file: "harmit", col: 0, row: 4, en: "Harmit",
    lines: ["เนื้อผ้าละเอียด ผิวสัมผัสเรียบเนียน ยับยาก และรีดขึ้นคมได้ง่าย", "สีไม่ซีดง่าย ทนต่อการซัก ไม่เป็นขนง่าย"],
  },
  {
    name: "ผ้าไมโครพีช", file: "micropeach", col: 3, row: 2, en: "Micro Peach",
    lines: ["เนื้อผ้าละมุน ไม่ระคายเคืองผิว ผ้าหนานุ่ม มีสปริง ไม่ยับง่าย", "ไม่เป็นขน พิมพ์ลายได้คมชัด สีติดทนนาน"],
  },
  {
    name: "แคนวาส หนา 8 ออนซ์", file: "canvas8", col: 2, row: 3, en: "Canvas 8 Oz.",
    lines: ["เนื้อผ้าหนาปานกลาง ทนต่อการใช้งาน อยู่ทรงพอประมาณ", "พับเก็บง่าย น้ำหนักเบา พกพาสะดวก"],
  },
];

/** ครอปสวอตช์จากใบสเปค (แคชไว้ — ไดรฟ์ไม่ได้ต่อก็ใช้ของเดิม) */
async function fabricSwatch(f) {
  const cached = `${SRC}/fabric-${f.file}-${VER}.jpg`;
  if (!existsSync(cached)) {
    if (!existsSync(SHEET)) throw new Error(`ไม่มีแคช ${cached} และไดรฟ์ไม่ได้ต่อ — ต่อไดรฟ์ iDuckyShop แล้วรันใหม่`);
    const meta = await sharp(SHEET).metadata();
    const K = meta.width / 854;
    const [x1, x2] = SHEET_COLX[f.col];
    const [y1, y2] = SHEET_ROWY[f.row];
    const inset = 6; // หนีขอบมนของกรอบรูปในใบสเปค
    await sharp(SHEET)
      .extract({
        left: Math.round((x1 + inset) * K), top: Math.round((y1 + inset) * K),
        width: Math.round((x2 - x1 - inset * 2) * K), height: Math.round((y2 - y1 - inset * 2) * K),
      })
      .resize({ width: 900 }).jpeg({ quality: 92 }).toFile(cached);
    console.log(`✂️  ครอปสวอตช์ผ้า ${f.name} → ${cached}`);
  }
  const buf = readFileSync(cached);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function fabricArt(f, uri) {
  const px = 100, py = 176, pw = W - 200, ph = 400;
  const pillW = f.name.length * 30 + 120;
  const body = `
  <defs><clipPath id="ph"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="22"/></clipPath></defs>
  <rect x="${px + 6}" y="${py + 10}" width="${pw}" height="${ph}" rx="22" fill="#0f172a" opacity="0.1"/>
  <image href="${uri}" x="${px}" y="${py}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/>
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="22" fill="none" stroke="#e2e8f0" stroke-width="3"/>
  <g>
    <rect x="${W / 2 - pillW / 2}" y="${py + ph - 86}" width="${pillW}" height="96" rx="26" fill="#ffffff" opacity="0.95" stroke="${OK}" stroke-width="3"/>
    <text x="${W / 2}" y="${py + ph - 22}" font-family="${TH}" font-size="52" font-weight="800" text-anchor="middle" fill="${OK}">${f.name}</text>
  </g>
  <text x="${W / 2}" y="${py + ph + 108}" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">${f.lines[0]}</text>
  <text x="${W / 2}" y="${py + ph + 150}" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">${f.lines[1]}</text>`;
  return card(`เนื้อผ้า: ${f.name}`, `${f.en} — ผ้าจริงจากใบเทียบเนื้อผ้าของร้าน`, body,
    "ทั้ง 4 เนื้อผ้าพิมพ์ลายเดียวกัน ถ่ายเทียบกันในใบเดียว");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = [
  ...SIZES.map((s) => ({ group: SIZE_GROUP, choice: s.name, file: `size-${s.cm}-${VER}.jpg`, svg: sizeArt(s) })),
  { group: PRINT_GROUP, choice: "สกรีน 1 ด้าน", file: `print-1side-${VER}.jpg`, svg: printArt(1) },
  { group: PRINT_GROUP, choice: "สกรีน 2 ด้าน", file: `print-2side-${VER}.jpg`, svg: printArt(2) },
];
for (const f of FABRICS) {
  JOBS.push({ group: FABRIC_GROUP, choice: f.name, file: `fabric-${f.file}-${VER}.jpg`, svg: fabricArt(f, await fabricSwatch(f)) });
}

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน DB ───────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${PRODUCT_ID}/`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

// 1. เปลี่ยนชื่อตัวเลือกกลุ่ม "พิมพ์ลาย"
const pg = (data.options ?? []).find((o) => o.label === PRINT_GROUP);
if (!pg) { console.error(`ไม่เจอกลุ่ม "${PRINT_GROUP}"`); process.exit(1); }
for (const c of pg.choices ?? []) if (RENAME[c.name]) c.name = RENAME[c.name];

// 2. ย้ายคีย์ตารางราคาตามชื่อใหม่ (แกนที่ 2 ของ cells — "15x15cm│1 ด้าน")
const remapCells = (pricing, where) => {
  if (!pricing?.cells) return;
  const idx = (pricing.driverLabels ?? []).indexOf(PRINT_GROUP);
  if (idx < 0) { console.error(`${where}: driverLabels ไม่มี "${PRINT_GROUP}"`, pricing.driverLabels); process.exit(1); }
  const next = {};
  for (const [k, v] of Object.entries(pricing.cells)) {
    const parts = k.split("│");
    if (RENAME[parts[idx]]) parts[idx] = RENAME[parts[idx]];
    next[parts.join("│")] = v;
  }
  if (Object.keys(next).length !== Object.keys(pricing.cells).length) { console.error(`${where}: คีย์ cells ชนกันตอนเปลี่ยนชื่อ`); process.exit(1); }
  pricing.cells = next;
};
remapCells(data.pricing, "data.pricing");
(data.priceRates ?? []).forEach((r, i) => remapCells(r.pricing, `priceRates[${i}]`));

// 3. เติม imageSrc ทั้ง 3 กลุ่ม
for (const j of JOBS) {
  const g = (data.options ?? []).find((o) => o.label === j.group);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${j.group}"`); process.exit(1); }
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.group}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of JOBS) {
  const c = back.data.options.find((o) => o.label === j.group)?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.group, j.choice, c); process.exit(1); }
}
const stale = back.data.options.find((o) => o.label === PRINT_GROUP).choices.find((c) => RENAME[c.name]);
if (stale) { console.error("ยังมีชื่อเก่าค้าง!", stale); process.exit(1); }
// ทุกคู่ (ขนาด × พิมพ์ลาย) ต้องมีช่องราคาครบ ทั้ง pricing และทุกเรท
const pricings = [["data.pricing", back.data.pricing], ...(back.data.priceRates ?? []).map((r, i) => [`priceRates[${i}]`, r.pricing])];
for (const [where, p] of pricings) {
  for (const s of SIZES) {
    for (const side of Object.values(RENAME)) {
      const key = `${s.name}│${side}`;
      if (!Array.isArray(p.cells?.[key])) { console.error(`${where}: cell หาย → ${key}`); process.exit(1); }
    }
  }
  if (Object.keys(p.cells).length !== SIZES.length * 2) { console.error(`${where}: จำนวน cells เพี้ยน`, Object.keys(p.cells).length); process.exit(1); }
}
console.log(`✓ ภาพ ${JOBS.length} ใบ + เปลี่ยนชื่อ "สกรีน 1/2 ด้าน" + คีย์ราคา ${SIZES.length * 2} ช่อง × ${pricings.length} ตาราง ครบ · savedAt =`, back.data.savedAt);
