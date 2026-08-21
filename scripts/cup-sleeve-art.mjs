#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "CUP SLEEVE" (ที่ครอบแก้ว / ปลอกแก้วกระดาษ)
 *
 *   node scripts/cup-sleeve-art.mjs [--out=<dir>]
 *
 * ที่มาของภาพแยกเป็น 2 ทาง:
 *
 * 1) ภาพฟิล์มเคลือบจากคลังตัวเลือกกลางของร้าน (products/preset-coating/*)
 *    ใช้ทำการ์ด "เคลือบเงา / เคลือบด้าน / เคลือบพิเศษ" — ผิวฟิล์มที่ลูกค้าเห็นเป็นของจริงจากงานร้าน
 *    (ตัวเลือกผิวฟิล์มรายตัวในกลุ่ม "เคลือบ" ลิงก์ไฟล์คลังตรง ๆ ผ่าน preset ไม่ต้องอัปซ้ำ)
 *
 * 2) วาดเอง — ความหนากระดาษ (250/300/400 แกรม) · ไม่เคลือบ ·
 *    การ์ด "1 เซ็ต = 6 ชิ้น" · การ์ด "ปรับขนาดได้ 3 ระดับ" · การ์ดสเปกขนาดงาน (ไดคัทจริง)
 *    รูปงานจริงของสินค้าตัวนี้ไม่มีป้ายบอกว่าใบไหนกระดาษกี่แกรม/เคลือบแบบไหน
 *    จึงไม่เอารูปงานจริงมาแปะเป็นภาพตัวเลือก (จะกลายเป็นบอกลูกค้าผิด) — ใช้ภาพวาดอธิบายแทน
 *
 * รูปงานจริงสำหรับ "แกลเลอรี" ไม่ได้ทำที่นี่ — cup-sleeve-apply.mjs ดึงจากหน้าเว็บให้เอง
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/cup-sleeve/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";
/** สีเนื้อกระดาษอาร์ตมัน (ใช้วาดตัวปลอกทุกใบให้เป็นวัสดุเดียวกันทั้งชุด) */
const CARD = "#fdfcf7";
const CARD_EDGE = "#d6d3cb";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

/** ไฟล์ในคลังฟิล์มเคลือบของร้าน (สินค้าตัวอื่นใช้ไฟล์ชุดนี้อยู่แล้ว) */
const COAT_BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/preset-coating";

/* ── ชิ้นส่วนที่ใช้วาดซ้ำ ─────────────────────────────────────────── */

const pt = (cx, cy, deg, rad) => [
  (cx + rad * Math.cos((deg * Math.PI) / 180)).toFixed(1),
  (cy + rad * Math.sin((deg * Math.PI) / 180)).toFixed(1),
];

/**
 * ตัวปลอกแบบ "แบน" (ก่อนสวม) — เป็นแถบโค้งเสี้ยววงแหวน เหมือนที่คลี่ออกมาจริง
 * a0/a1 = องศาเริ่ม-จบ (270 = ด้านบนของการ์ด) · R/r = รัศมีขอบนอก/ขอบใน
 */
function flatSleeve(cx, cy, R, r, { a0 = 205, a1 = 335, fill = CARD, art = true } = {}) {
  const [x1, y1] = pt(cx, cy, a0, R);
  const [x2, y2] = pt(cx, cy, a1, R);
  const [x3, y3] = pt(cx, cy, a1, r);
  const [x4, y4] = pt(cx, cy, a0, r);
  const band = `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 0 0 ${x4} ${y4} Z`;
  // ลายบนปลอก = แถบสีจาง ๆ ตามแนวโค้ง พอให้ดูออกว่าเป็นงานพิมพ์ ไม่ใช่กระดาษเปล่า
  const mid = (R + r) / 2;
  const deco = art
    ? `<path d="${(() => {
        const [ax, ay] = pt(cx, cy, a0 + 6, mid + (R - r) * 0.22);
        const [bx, by] = pt(cx, cy, a1 - 6, mid + (R - r) * 0.22);
        return `M ${ax} ${ay} A ${mid + (R - r) * 0.22} ${mid + (R - r) * 0.22} 0 0 1 ${bx} ${by}`;
      })()}" stroke="#bae6fd" stroke-width="${(R - r) * 0.3}" fill="none" stroke-linecap="round"/>
      <path d="${(() => {
        const [ax, ay] = pt(cx, cy, a0 + 14, mid - (R - r) * 0.24);
        const [bx, by] = pt(cx, cy, a1 - 14, mid - (R - r) * 0.24);
        return `M ${ax} ${ay} A ${mid - (R - r) * 0.24} ${mid - (R - r) * 0.24} 0 0 1 ${bx} ${by}`;
      })()}" stroke="#fde68a" stroke-width="${(R - r) * 0.16}" fill="none" stroke-linecap="round" opacity="0.85"/>`
    : "";
  return `<g><path d="${band}" fill="${fill}" stroke="${CARD_EDGE}" stroke-width="2.5"/>${deco}</g>`;
}

/**
 * แก้วน้ำ + ปลอกสวมอยู่ — hi = ความสูงปลอกจากฐานแก้ว (px)
 * ใช้ทั้งการ์ด "ปรับขนาดได้ 3 ระดับ" และการ์ดกระดาษ
 */
function cupWithSleeve(cx, top, h, { sleeveTop = 0.34, sleeveH = 0.34, sleeveFill = CARD, lid = true } = {}) {
  const topW = h * 0.62;
  const botW = h * 0.46;
  const bot = top + h;
  /** ความกว้างของแก้ว ณ ตำแหน่ง f (0 = ปากแก้ว · 1 = ก้นแก้ว) */
  const wAt = (f) => topW + (botW - topW) * f;
  const sy = top + h * sleeveTop;
  const sh = h * sleeveH;
  const wTopS = wAt(sleeveTop);
  const wBotS = wAt(sleeveTop + sleeveH);
  return `<g>
    <path d="M ${cx - topW / 2} ${top} L ${cx + topW / 2} ${top} L ${cx + botW / 2} ${bot} L ${cx - botW / 2} ${bot} Z"
      fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
    ${lid ? `<rect x="${cx - topW / 2 - 10}" y="${top - 26}" width="${topW + 20}" height="28" rx="10" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="3"/>` : ""}
    <path d="M ${cx - wTopS / 2 - 4} ${sy} L ${cx + wTopS / 2 + 4} ${sy} L ${cx + wBotS / 2 + 4} ${sy + sh} L ${cx - wBotS / 2 - 4} ${sy + sh} Z"
      fill="${sleeveFill}" stroke="${CARD_EDGE}" stroke-width="3"/>
    <path d="M ${cx - wTopS / 2} ${sy + sh * 0.3} L ${cx + wTopS / 2} ${sy + sh * 0.3}" stroke="#bae6fd" stroke-width="${sh * 0.26}" stroke-linecap="round"/>
    <path d="M ${cx - wBotS / 2 + 6} ${sy + sh * 0.72} L ${cx + wBotS / 2 - 6} ${sy + sh * 0.72}" stroke="#fde68a" stroke-width="${sh * 0.14}" stroke-linecap="round" opacity="0.85"/>
  </g>`;
}

/* ── 1. การ์ดชนิดกระดาษ (วาดเอง) ─────────────────────────────────── */

/** ความหนาที่วาด = แกรมจริงตามสเกล (250 แกรม ≈ 0.30 มม.) — เทียบกันได้จริงระหว่างการ์ด */
const PAPERS = [
  {
    key: "paper-250",
    gsm: "250",
    name: "กระดาษอาร์ตมัน 250 แกรม",
    tag: "มาตรฐานของร้าน — รวมในราคาแล้ว",
    note: ["ผิวเรียบ พิมพ์สีสด คมชัด", "โค้งเข้ารูปแก้วง่าย สวมสบายมือ"],
  },
  {
    key: "paper-300",
    gsm: "300",
    name: "กระดาษอาร์ตมัน 300 แกรม",
    tag: "หนาขึ้น อยู่ทรงกว่า",
    note: ["แข็งแรงกว่า 250 แกรม เล็กน้อย", "ราคาคิดตามงานจริง — แจ้งแอดมินตีราคา"],
  },
  {
    key: "paper-400",
    gsm: "400",
    name: "กระดาษอาร์ตมัน 400 แกรม",
    tag: "หนาที่สุด งานพรีเมียม",
    note: ["ทรงแข็ง จับแล้วรู้สึกหนาแน่น", "ราคาคิดตามงานจริง — แจ้งแอดมินตีราคา"],
  },
];

async function paperCards() {
  console.log("🖼  การ์ดชนิดกระดาษ (วาดเอง — ความหนาตามสเกลจริง)");
  for (const p of PAPERS) {
    const th = (Number(p.gsm) / 250) * 30; // ความหนาแท่งตัวอย่าง (px) — 250 แกรม = 30
    const base = 30;
    const barY = 330;
    const svg = frame(`
      ${title(p.name, p.tag)}
      ${cupWithSleeve(268, 210, 380)}
      ${flatSleeve(640, 726, 205, 140)}
      <text x="640" y="762" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ตัวปลอกก่อนสวม (แบบแบน)</text>
      <g>
        <text x="640" y="240" font-family="${TH}" font-size="76" font-weight="700" text-anchor="middle" fill="${CYAN}">${p.gsm}</text>
        <text x="640" y="282" font-family="${TH}" font-size="26" text-anchor="middle" fill="${INK}">แกรม</text>
        <rect x="500" y="${barY - th / 2}" width="280" height="${th}" rx="3" fill="#e0f2fe" stroke="${CYAN}" stroke-width="2.5"/>
        <text x="640" y="${barY + th / 2 + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${CYAN}">ความหนา ${p.gsm} แกรม</text>
        ${
          th > base
            ? `<rect x="500" y="${barY + 74 - base / 2}" width="280" height="${base}" rx="3" fill="none" stroke="${CARD_EDGE}" stroke-width="2" stroke-dasharray="7 6"/>
        <text x="640" y="${barY + 74 + base / 2 + 30}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เทียบกับ 250 แกรม (มาตรฐาน)</text>`
            : `<text x="640" y="${barY + th / 2 + 68}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ความหนาวาดตามสเกลจริง</text>`
        }
      </g>
      ${foot(p.note)}`);
    await saveSvg(p.key, svg);
  }
}

/* ── 2. การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน + การ์ด "ไม่เคลือบ") ── */

/** วางภาพฟิล์มจริงเป็นภาพหลักของการ์ด + หัวข้อ/คำอธิบาย */
async function coatCard(name, cardTitle, cardSub, films, notes) {
  const gap = 22;
  // เรียงภาพฟิล์มให้อยู่ในกรอบกว้าง 760 · สูงไม่เกิน 430 (เหลือที่ให้ป้ายชื่อ + บรรทัดท้ายการ์ด)
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
  const y0 = Math.round(190 + (520 - thh) / 2); // จัดภาพให้อยู่กลางช่องว่างระหว่างหัวข้อกับบรรทัดท้าย
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
      ${title("ไม่เคลือบ", "ผิวกระดาษอาร์ตมันตามธรรมชาติ")}
      ${flatSleeve(450, 700, 330, 210)}
      <text x="450" y="232" font-family="${TH}" font-size="27" text-anchor="middle" fill="${INK}">สีพิมพ์ตามไฟล์งาน ไม่มีฟิล์มทับหน้า</text>
      <text x="450" y="276" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ผิวสัมผัสเป็นเนื้อกระดาษ ไม่มันวาว</text>
      ${foot(["ราคานี้รวมในราคาปลอกแล้ว (ไม่บวกเพิ่ม)", "โดนน้ำ/ความชื้นแล้วเลอะได้ง่ายกว่าแบบเคลือบ"])}`)
  );
  await coatCard(
    "coat-gloss",
    "เคลือบเงา",
    "ฟิล์มผิวมันวาว — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss", label: "ผิวเงา" }],
    ["สีสดขึ้น เงาวาว กันน้ำ/รอยเปื้อนได้ดีกว่าไม่เคลือบ", "คิดเพิ่มต่อด้านที่เคลือบ"]
  );
  await coatCard(
    "coat-matte",
    "เคลือบด้าน",
    "ฟิล์มผิวด้านนวล — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss-matte", label: "ผิวด้าน" }],
    ["นวลตา ไม่สะท้อนแสง ลายนิ้วมือไม่ติด", "คิดเพิ่มต่อด้านที่เคลือบ"]
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
    ["เลือกผิวฟิล์มย่อยได้ในกลุ่ม “เคลือบ” หลังเลือกแบบนี้", "คิดเพิ่มต่อด้านที่เคลือบ"]
  );
}

/* ── 3. การ์ดอธิบายการขาย (วาดเอง) ───────────────────────────────── */

/** 1 เซ็ต = 6 ชิ้น — ราคาในตารางคิดต่อเซ็ต */
async function setCard() {
  console.log("🖼  การ์ด 1 เซ็ต = 6 ชิ้น (วาดเอง)");
  const bands = Array.from({ length: 6 }, (_, i) => {
    const cx = 218 + (i % 3) * 232;
    const cy = i < 3 ? 420 : 640;
    return flatSleeve(cx, cy, 152, 100);
  }).join("");
  const svg = frame(`
    ${title("1 เซ็ต = 6 ชิ้น", "ราคาในตารางคิดเป็น “ต่อเซ็ต”")}
    ${bands}
    <text x="450" y="196" font-family="${TH}" font-size="26" text-anchor="middle" fill="${INK}">1 แบบ | 1 ขนาด : 1 เซ็ต</text>
    ${foot(["สั่ง 2 เซ็ต = 12 ชิ้น คละได้ 2 ลาย (ลายละ 6 ชิ้น)", "อยากได้หลายลาย เพิ่มจำนวนเซ็ตตามจำนวนลาย"])}`);
  await saveSvg("set-of-6", svg);
}

/** ปรับขนาดได้ 3 ระดับ — ล็อกได้ 3 ตำแหน่งตามขนาดแก้ว */
async function sizeCard() {
  console.log("🖼  การ์ดปรับขนาดได้ 3 ระดับ (วาดเอง)");
  const cups = [
    { cx: 210, h: 300, label: "แก้วเล็ก", sub: "รัดแน่นสุด" },
    { cx: 450, h: 350, label: "แก้วกลาง", sub: "ระดับกลาง" },
    { cx: 700, h: 400, label: "แก้วใหญ่", sub: "ขยายสุด" },
  ];
  const svg = frame(`
    ${title("ปรับขนาดได้ 3 ระดับ", "ปลอกใบเดียว ใช้ได้กับแก้วหลายขนาด")}
    ${cups.map((c) => cupWithSleeve(c.cx, 620 - c.h, c.h, { lid: false })).join("")}
    ${cups
      .map(
        (c) => `<text x="${c.cx}" y="672" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${esc(c.label)}</text>
      <text x="${c.cx}" y="710" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(c.sub)}</text>`
      )
      .join("")}
    ${foot(["ตัวปลอกมีรอยล็อก 3 ตำแหน่ง เลื่อนปรับความกว้างได้เอง", "ภาพวาดเพื่ออธิบายการใช้งาน ไม่ใช่สัดส่วนแก้วจริง"])}`);
  await saveSvg("size-3-levels", svg);
}

/* ── 4. การ์ดขนาด (จากไฟล์ไดคัทจริงในคลังเทมเพลตของร้าน) ─────────── */

/**
 * ขนาดเดียวที่ร้านขายจริง — ตามใบสเปกของร้าน "1 เซ็ต ได้ 6 ชิ้น ขนาด 27.7x7.6 cm"
 * ⚠️ ในคลังเทมเพลตมีไฟล์ไดคัทหมวด cup sleeve อีก 2 ไฟล์ (35.2x7.8 · 42x9.3)
 *    ร้านยืนยันแล้วว่า "ขายขนาดเดียว" — สองไฟล์นั้นไม่ได้เอามาทำเป็นตัวเลือกให้ลูกค้า
 * skin = ภาพพรีวิวไดคัทของไฟล์นั้น (ทรงจริงพร้อมลิ้นล็อกและช่องเสียบ 3 ระดับ)
 */
export const SIZE = {
  key: "size-spec",
  name: "27.7 × 7.6 ซม.",
  cm: [27.7, 7.6],
  bleedCm: 0.5, // เผื่อตัดตกด้านละ 0.5 ซม. ตามใบสเปกของร้าน
  tpl: "tpl-658smodrd",
  skin: "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/design-templates/preview/03e14879-Cup-250g-27.7x7.6--F-01.png",
};

/** ภาพไดคัทจากคลังเทมเพลต → ตัดขอบขาวออก แล้วย่อตามความกว้างที่ขอ */
async function dieline(url, width) {
  return sharp(await get(url))
    .flatten({ background: "#ffffff" })
    .trim({ threshold: 12 })
    .resize({ width, fit: "inside", background: "#ffffff" })
    .toBuffer();
}

/** การ์ดสเปกขนาด — ไดคัทจริง + ขนาดกางแบน + ระยะเผื่อตัดตก */
async function sizeCard2() {
  console.log("🖼  การ์ดขนาดงาน (ภาพไดคัทจริงจากคลังเทมเพลตของร้าน)");
  const w = 720;
  const img = await dieline(SIZE.skin, w);
  const meta = await sharp(img).metadata();
  const left = Math.round((W - w) / 2);
  const top = Math.round(370 - meta.height / 2);
  const svg = frame(`
    ${title(`ขนาดงาน ${SIZE.name}`, "ขนาดเดียว — วัดตอนกางแบน (ก่อนสวม)")}
    <g stroke="${CYAN}" stroke-width="2.5" fill="none">
      <path d="M ${left} ${top + meta.height + 34} L ${left + w} ${top + meta.height + 34}"/>
      <path d="M ${left} ${top + meta.height + 24} L ${left} ${top + meta.height + 44} M ${left + w} ${top + meta.height + 24} L ${left + w} ${top + meta.height + 44}"/>
      <path d="M ${left - 34} ${top} L ${left - 34} ${top + meta.height}"/>
      <path d="M ${left - 44} ${top} L ${left - 24} ${top} M ${left - 44} ${top + meta.height} L ${left - 24} ${top + meta.height}"/>
    </g>
    <text x="450" y="${top + meta.height + 80}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">กว้าง ${SIZE.cm[0]} ซม. · สูง ${SIZE.cm[1]} ซม.</text>
    <text x="450" y="${top + meta.height + 126}" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">วางลายเผื่อตัดตกด้านละ ${SIZE.bleedCm} ซม.</text>
    ${foot(["ปลายปลอกมีลิ้นล็อก + ช่องเสียบ 3 ระดับ ปรับความกว้างได้ตามขนาดแก้ว", "โหลดไฟล์เทมเพลตไดคัทไปวางลายได้ที่หน้าสินค้า"])}`);
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: img, left, top }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(SIZE.key, buf);
}

/* ── รัน ─────────────────────────────────────────────────────────── */

console.log(`📁 ${OUT}`);
await paperCards();
await coatCards();
await setCard();
await sizeCard();
await sizeCard2();
console.log("\n✅ เสร็จ — ต่อด้วย: node scripts/cup-sleeve-apply.mjs --write");
