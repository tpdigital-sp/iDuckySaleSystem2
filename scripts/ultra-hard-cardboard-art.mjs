#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "Ultra-Hard CardBoard หนา 2 mm" (ultra-hard-cardboard-2-mm)
 *
 *   node scripts/ultra-hard-cardboard-art.mjs [--out=<dir>]
 *
 * โจทย์ของสินค้าตัวนี้: ทุกตัวเลือกต้องมีภาพว่า "หน้าตาเป็นแบบไหน"
 * ที่มาของภาพแยกเป็น 3 ทาง:
 *
 * 1) ภาพผิวฟิล์มจริงจากคลังตัวเลือกกลางของร้าน (products/preset-coating/*)
 *    ใช้ทำการ์ด "เคลือบเงา / เคลือบด้าน / เคลือบพิเศษ" — ผิวที่ลูกค้าเห็นเป็นงานจริงของร้าน
 *
 * 2) ยืมภาพสำเร็จรูปของร้านที่อธิบายเรื่องเดียวกันอยู่แล้ว (ไม่ทำซ้ำ ไม่วาดใหม่ให้เพี้ยน)
 *    foil-1layer / foil-2layer  ← products/photocard-digital/foil-{1,2}layer-info.jpg
 *      ⚠️ 1 Layer = กระดาษเปล่า → เคลือบฟิล์ม → พิมพ์ดำ → เคลือบฟอยล์ (ลายเป็นฟอยล์ล้วน ไม่มีพิมพ์สี)
 *         ห้ามสลับกับภาพงานพิมพ์สี+ฟอยล์ (นั่นคือ 2 Layer)
 *    foil-เงิน/ทอง/โรสโกลด์/โฮโลแกรม ← รูปงานจริงใบเดียวกัน 4 สีฟอยล์ (photocard-digital/foil-*.jpg)
 *      เอามาวางบนการ์ดพร้อมแถบสีโลหะ + ป้ายราคา เพื่อให้ขนาดเท่ากับการ์ดใบอื่น
 *    a3-chart ← products/paper-foil/a3-chart.jpg (อินโฟกราฟิก "ขนาด+จำนวนที่ได้ใน 1 A3" ของร้านเอง)
 *      ตัวเลขในภาพ (A4=2 · A5=4 · A6=8 · A7=16) ตรงกับที่หน้าเว็บตารางราคาบอกไว้
 *
 * 3) วาดเอง — ขนาด A7-A3 (วาดตามสเกลจริงจากขนาดกระดาษมาตรฐาน ISO 216) ·
 *    การ์ดเทียบขนาด · ความหนา 2 มม. · ไม่เคลือบ · ไม่เคลือบฟอยล์ · ปั๊มฟอยล์
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/ultra-hard-cardboard/upload").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";
/** เนื้อการ์ดบอร์ด (ผิวเรียบเนียน สีขาวนวล) + สีสันกลางแผ่นที่ใช้แทน "ลายที่พิมพ์" */
const BOARD = "#ffffff";
const BOARD_EDGE = "#cbd5e1";
/** ไส้กลางของแผ่น 2 มม. ที่เห็นตรงรอยตัด */
const CORE = "#e2e8f0";

const BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
const COAT_BASE = `${BASE}/preset-coating`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="134" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${808 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
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

/* ── ชิ้นส่วนที่ใช้วาดซ้ำ ────────────────────────────────────────── */

/**
 * แผ่นการ์ดบอร์ดหนา 2 มม. มองเฉียงเล็กน้อย — เห็นสันข้าง (ไส้กลาง) ด้วย
 * (x,y) = มุมซ้ายบนของหน้าแผ่น · w,h = ขนาดหน้าแผ่นเป็นพิกเซล
 * สัน 12px ไม่ใช่สเกลจริงของ 2 มม. — วาดขยายให้เห็นว่า "มีความหนา" การ์ดจะเขียนกำกับไว้เสมอ
 */
const board = (x, y, w, h, opt = {}) => {
  const e = opt.edge ?? 12;
  const fill = opt.fill ?? BOARD;
  const art = opt.art ?? "";
  return `
  <g>
    <path d="M ${x + w} ${y} l ${e} ${-e} l 0 ${h} l ${-e} ${e} Z" fill="${CORE}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>
    <path d="M ${x} ${y} l ${e} ${-e} l ${w} 0 l ${-e} ${e} Z" fill="#eef2f6" stroke="${BOARD_EDGE}" stroke-width="1.5"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${BOARD_EDGE}" stroke-width="1.5"/>
    ${art}
  </g>`;
};

/** ลายพิมพ์จำลองบนหน้าแผ่น (แถบสีของร้าน) — ให้เห็นว่าเป็นงานพิมพ์เต็มหน้า ไม่ใช่กระดาษเปล่า */
const artwork = (x, y, w, h) => {
  const pad = Math.max(6, Math.round(Math.min(w, h) * 0.08));
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  return `
    <clipPath id="clip-${x}-${y}"><rect x="${x + pad}" y="${y + pad}" width="${iw}" height="${ih}" rx="${Math.round(pad / 2)}"/></clipPath>
    <g clip-path="url(#clip-${x}-${y})">
      <rect x="${x + pad}" y="${y + pad}" width="${iw}" height="${ih}" fill="#e0f2fe"/>
      <rect x="${x + pad}" y="${y + pad}" width="${iw}" height="${Math.round(ih * 0.42)}" fill="#0ea5e9"/>
      <circle cx="${x + pad + iw * 0.72}" cy="${y + pad + ih * 0.3}" r="${Math.round(Math.min(iw, ih) * 0.13)}" fill="#fde68a"/>
      <path d="M ${x + pad} ${y + pad + ih * 0.72} q ${iw * 0.25} ${-ih * 0.18} ${iw * 0.5} 0 q ${iw * 0.25} ${ih * 0.18} ${iw * 0.5} 0 L ${x + pad + iw} ${y + pad + ih} L ${x + pad} ${y + pad + ih} Z" fill="#84cc16"/>
    </g>`;
};

/** เส้นบอกขนาดพร้อมตัวเลข (แนวนอน) */
const dimH = (x1, x2, y, text) => `
  <g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x1} ${y} L ${x2} ${y}"/>
    <path d="M ${x1} ${y - 9} L ${x1} ${y + 9} M ${x2} ${y - 9} L ${x2} ${y + 9}"/>
  </g>
  <text x="${(x1 + x2) / 2}" y="${y + 36}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">${esc(text)}</text>`;

/** เส้นบอกขนาดพร้อมตัวเลข (แนวตั้ง — ตัวเลขอยู่ขวาเส้น) */
const dimV = (y1, y2, x, text) => `
  <g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x} ${y1} L ${x} ${y2}"/>
    <path d="M ${x - 9} ${y1} L ${x + 9} ${y1} M ${x - 9} ${y2} L ${x + 9} ${y2}"/>
  </g>
  <text x="${x + 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="start" fill="${CYAN}">${esc(text)}</text>`;

/* ── 1. การ์ดขนาด A7-A3 (วาดตามสเกลจริง) ────────────────────────── */

/**
 * ขนาดกระดาษมาตรฐาน ISO 216 (มม.) · perA3 = ได้กี่ใบต่อ 1 แผ่น A3
 * ตัวเลข perA3 ตรงกับที่หน้าเว็บตารางราคาระบุไว้ในบล็อกนี้ (A4=2 · A5=4 · A6=8 · A7=16)
 * ⚠️ apply.mjs ทวนค่านี้กับหน้าเว็บทุกครั้ง ไม่ตรงเมื่อไหร่ = หยุด
 */
export const SIZES = [
  { key: "size-a7", name: "A7", mm: [74, 105], perA3: 16, use: "การ์ดเล็ก · การ์ดสะสม · ป้ายราคา" },
  { key: "size-a6", name: "A6", mm: [105, 148], perA3: 8, use: "โปสการ์ด · การ์ดอวยพร · เมนูตั้งโต๊ะ" },
  { key: "size-a5", name: "A5", mm: [148, 210], perA3: 4, use: "ใบปลิว · เมนู · ป้ายแสดงสินค้า" },
  { key: "size-a4", name: "A4", mm: [210, 297], perA3: 2, use: "ป้ายตั้งโชว์ · แผ่นรองงาน" },
  { key: "size-a3", name: "A3", mm: [297, 420], perA3: 1, use: "ป้ายใหญ่ · แบ็คดรอปเล็ก · บอร์ดจัดแสดง" },
];

/**
 * px ต่อ 1 มม. ตอนวาดการ์ดเดี่ยว — A3 (297 x 420 มม.) พอดีกรอบอ้างอิงกลางการ์ด
 * ขนาด ISO ทุกใบสัดส่วนเท่ากันหมด (1:√2) วาดใบเดียวโดด ๆ จึงแยกไม่ออกว่าใบไหนใหญ่กว่า
 * การ์ดนี้จึงวาง "กรอบแผ่น A3" เป็นเส้นประไว้เสมอ แล้ววางแผ่นจริงชิดมุมซ้ายล่าง — เทียบได้ทันที
 */
const PX = 1.02;
/** มุมซ้ายล่างที่ทุกแผ่นใช้ร่วมกัน (จุดอ้างอิงของกรอบ A3) */
const A3W = Math.round(297 * PX);
const A3H = Math.round(420 * PX);
const BX = Math.round((W - A3W) / 2);
const BY = 620;

async function sizeCards() {
  console.log("🖼  การ์ดขนาด (วาดตามสเกลจริง เทียบกับแผ่น A3)");
  for (const s of SIZES) {
    const w = Math.round(s.mm[0] * PX);
    const h = Math.round(s.mm[1] * PX);
    const y = BY - h;
    const full = s.perA3 === 1;
    const perA3 = full ? "เต็มแผ่น A3 — 1 แผ่นได้ 1 ใบ" : `ได้ ${s.perA3} ใบ ต่อ 1 แผ่น A3`;
    await saveSvg(
      s.key,
      frame(`
      ${title(`ขนาด ${s.name}`, `${s.mm[0]} x ${s.mm[1]} มม. (${(s.mm[0] / 10).toFixed(1)} x ${(s.mm[1] / 10).toFixed(1)} ซม.)`)}
      ${
        full
          ? ""
          : `<rect x="${BX}" y="${BY - A3H}" width="${A3W}" height="${A3H}" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 7"/>
             <text x="${BX + A3W - 10}" y="${BY - A3H + 30}" font-family="${TH}" font-size="22" text-anchor="end" fill="#94a3b8">กรอบแผ่น A3</text>`
      }
      ${board(BX, y, w, h, { art: artwork(BX, y, w, h) })}
      ${dimH(BX, BX + w, BY + 30, `${s.mm[0]} มม.`)}
      <g stroke="${CYAN}" stroke-width="2.5" fill="none">
        <path d="M ${BX - 34} ${y} L ${BX - 34} ${BY}"/>
        <path d="M ${BX - 43} ${y} L ${BX - 25} ${y} M ${BX - 43} ${BY} L ${BX - 25} ${BY}"/>
      </g>
      <text x="${BX - 50}" y="${(y + BY) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${CYAN}">${esc(`${s.mm[1]} มม.`)}</text>
      <text x="${W / 2}" y="726" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${INK}">${esc(perA3)}</text>
      <text x="${W / 2}" y="766" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(`เหมาะกับ ${s.use}`)}</text>
      ${foot(["ทุกขนาดหนา 2 มม. เท่ากัน — ราคาต่างกันตามตารางของร้าน", "ภาพวาดตามสเกลจริงของขนาดกระดาษ (ลายบนแผ่นเป็นลายจำลอง)"])}`)
    );
  }
}

/** การ์ดเทียบขนาดทั้ง 5 (ใช้ในแท็บ) — วางมุมซ้ายล่างชิดกัน เห็นสัดส่วนจริงทันที */
async function sizeChart() {
  console.log("🖼  การ์ดเทียบขนาด 5 ขนาด (วาดตามสเกลจริง)");
  const K = 1.0;
  const bx = 95;
  const by = 748; // เส้นฐาน (มุมซ้ายล่างของทุกแผ่น)
  const tint = ["#0891b2", "#0ea5e9", "#38bdf8", "#7dd3fc", "#e0f2fe"];
  const back = [...SIZES].reverse(); // วาด A3 ก่อน แล้วซ้อนใบเล็กทับ
  const shapes = back
    .map((s, i) => {
      const w = Math.round(s.mm[0] * K);
      const h = Math.round(s.mm[1] * K);
      return `<rect x="${bx}" y="${by - h}" width="${w}" height="${h}" fill="${tint[i]}" fill-opacity="0.55" stroke="${INK}" stroke-width="2"/>`;
    })
    .join("");
  const labels = back
    .map((s, i) => {
      const w = Math.round(s.mm[0] * K);
      const h = Math.round(s.mm[1] * K);
      // ป้ายชื่อวางมุมขวาบนของแต่ละแผ่น (ใบเล็กซ้อนอยู่ในใบใหญ่ ป้ายจึงไม่ทับกัน)
      return `<text x="${bx + w - 10}" y="${by - h + 32}" font-family="${TH}" font-size="${i < 2 ? 32 : 26}" font-weight="700" text-anchor="end" fill="${INK}">${esc(s.name)}</text>`;
    })
    .join("");
  const legend = SIZES.map(
    (s, i) =>
      `<text x="${bx + Math.round(297 * K) + 40}" y="${430 + i * 46}" font-family="${TH}" font-size="25" text-anchor="start" fill="${SUB}">${esc(
        `${s.name}  ${s.mm[0]} x ${s.mm[1]} มม.${s.perA3 > 1 ? `  (${s.perA3} ใบ/A3)` : "  (เต็มแผ่น)"}`
      )}</text>`
  ).join("");
  await saveSvg(
    "size-chart",
    frame(`
    ${title("5 ขนาดให้เลือก", "เทียบขนาดจริง A7 · A6 · A5 · A4 · A3")}
    ${shapes}${labels}${legend}
    <text x="${bx + Math.round(297 * K) + 40}" y="384" font-family="${TH}" font-size="26" font-weight="700" text-anchor="start" fill="${INK}">ขนาดจริง (มม.)</text>
    ${foot(["ทุกขนาดหนา 2 มม. เท่ากัน", "ราคาต่อชิ้นต่างกันตามขนาด — ดูตารางราคาในหน้าสินค้า"])}`)
  );
}

/* ── 2. การ์ดความหนา 2 มม. + ผิวเรียบเนียน ──────────────────────── */

async function thicknessCard() {
  console.log("🖼  การ์ดความหนา 2 มม. (วาดเอง)");
  const rows = [
    { label: "Ultra-Hard CardBoard", sub: "หนา 2 มม.", th: 62, fill: "#ffffff", strong: true },
    { label: "กระดาษอาร์ตการ์ด 300 แกรม", sub: "หนาประมาณ 0.3 มม.", th: 10, fill: "#f8fafc", strong: false },
  ];
  let y = 244;
  const bars = rows
    .map((r) => {
      const top = y;
      y += r.th + 148;
      return `
      <rect x="180" y="${top}" width="540" height="${r.th}" rx="3" fill="${r.fill}" stroke="${r.strong ? CYAN : BOARD_EDGE}" stroke-width="${r.strong ? 3 : 2}"/>
      <text x="450" y="${top - 22}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${INK}">${esc(r.label)}</text>
      <text x="450" y="${top + r.th + 46}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${r.strong ? CYAN : SUB}">${esc(r.sub)}</text>`;
    })
    .join("");
  await saveSvg(
    "thickness-2mm",
    frame(`
    ${title("ความหนา 2 มม.", "แข็งกว่ากระดาษการ์ดทั่วไป ตั้งได้ ไม่งอ")}
    ${bars}
    <text x="450" y="624" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">มองจากด้านข้าง (สันแผ่น)</text>
    <path d="M 210 668 L 690 668" stroke="#e2e8f0" stroke-width="2"/>
    <text x="450" y="716" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">หนากว่ากระดาษการ์ด 300 แกรม ประมาณ 6-7 เท่า</text>
    <text x="450" y="758" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">ผิวสัมผัสเรียบเนียน — พิมพ์แล้วสีคมชัด</text>
    ${foot(["ภาพเปรียบเทียบวาดขยายให้เห็นความต่างของความหนา", "ความหนาจริง 2 มม. เท่ากันทุกขนาด (A7 ถึง A3)"])}`)
  );
}

/* ── 3. การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน + การ์ด "ไม่เคลือบ") ── */

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
  save(
    name,
    await sharp(Buffer.from(svg))
      .composite(tiles.map((input, i) => ({ input, left: x0 + i * (tw + gap), top: y0 })))
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer()
  );
}

async function coatCards(coatFee, specialFee) {
  console.log("🖼  การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน)");
  await saveSvg(
    "coat-none",
    frame(`
      ${title("ไม่เคลือบ", "ผิวการ์ดบอร์ดตามธรรมชาติ")}
      ${board(300, 260, 300, 400, { art: artwork(300, 260, 300, 400) })}
      <text x="450" y="708" font-family="${TH}" font-size="27" text-anchor="middle" fill="${INK}">สีพิมพ์ตามไฟล์งาน ไม่มีฟิล์มทับหน้า</text>
      <text x="450" y="750" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ผิวเรียบเนียนแบบเนื้อกระดาษ ไม่มันวาว</text>
      ${foot(["ราคานี้รวมในราคาชิ้นงานแล้ว (ไม่บวกเพิ่ม)", "โดนน้ำ/ความชื้นแล้วเลอะได้ง่ายกว่าแบบเคลือบ"])}`)
  );
  await coatCard(
    "coat-gloss",
    "เคลือบเงา",
    "ฟิล์มผิวมันวาว — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss", label: "ผิวเงา" }],
    [`บวกเพิ่ม ${coatFee} บาท`, "สีสดขึ้น เงาวาว กันน้ำ/รอยเปื้อนได้ดีกว่าไม่เคลือบ"]
  );
  await coatCard(
    "coat-matte",
    "เคลือบด้าน",
    "ฟิล์มผิวด้านนวล — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss-matte", label: "ผิวด้าน" }],
    [`บวกเพิ่ม ${coatFee} บาท`, "นวลตา ไม่สะท้อนแสง ลายนิ้วมือไม่ติด"]
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
    [`บวกเพิ่ม ${specialFee} บาท`, "เลือกผิวฟิล์มย่อยได้ในกลุ่ม “เคลือบ” หลังเลือกแบบนี้"]
  );
}

/* ── 4. การ์ดเคลือบฟอยล์ (ยืมภาพอธิบายของร้าน) + สีฟอยล์ ─────────── */

/** ภาพอธิบาย 1 Layer / 2 Layer ของร้าน — ใช้ไฟล์เดิม ไม่วาดใหม่ (กันอธิบายขั้นตอนผิด) */
const FOIL_INFO = {
  "foil-1layer": `${BASE}/photocard-digital/foil-1layer-info.jpg`,
  "foil-2layer": `${BASE}/photocard-digital/foil-2layer-info.jpg`,
};

/** รูปงานจริงใบเดียวกัน 4 สีฟอยล์ + แถบไล่สีโลหะประกอบชื่อสี */
const FOIL_COLORS = [
  { key: "foil-silver", name: "สีเงิน", src: `${BASE}/photocard-digital/foil-silver.jpg`, ramp: ["#f8fafc", "#cbd5e1", "#94a3b8", "#e2e8f0"] },
  { key: "foil-gold", name: "สีทอง", src: `${BASE}/photocard-digital/foil-gold.jpg`, ramp: ["#fff7d6", "#e9c46a", "#c8901f", "#f4e0a1"] },
  { key: "foil-rosegold", name: "สีโรสโกลด์", src: `${BASE}/photocard-digital/foil-rosegold.jpg`, ramp: ["#ffe9e3", "#e8b4a4", "#c67d6a", "#f6d5cb"] },
  {
    key: "foil-hologram",
    name: "สีโฮโลแกรม",
    src: `${BASE}/photocard-digital/foil-hologram.jpg`,
    ramp: ["#bfeaff", "#c9b6ff", "#ffc9e8", "#c6ffe4"],
  },
];

async function foilCards(foil1, foil2, holoFee) {
  console.log("🖼  การ์ดเคลือบฟอยล์ (ยืมภาพอธิบายของร้าน) + สีฟอยล์ (รูปงานจริง)");

  await saveSvg(
    "foil-none",
    frame(`
      ${title("ไม่เคลือบฟอยล์", "งานพิมพ์สีปกติ ไม่มีลายฟอยล์เงา")}
      ${board(300, 260, 300, 400, { art: artwork(300, 260, 300, 400) })}
      <text x="450" y="708" font-family="${TH}" font-size="27" text-anchor="middle" fill="${INK}">พิมพ์ระบบ Digital สีตามไฟล์งาน</text>
      <text x="450" y="750" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ไม่มีค่าบวกเพิ่มจากราคาในตาราง</text>
      ${foot(["อยากได้ลายเงาแบบโลหะ เลือกเคลือบฟอยล์ 1 หรือ 2 เลเยอร์", "เคลือบฟอยล์ทำได้เฉพาะงานกระดาษ (การ์ดบอร์ดทำได้)"])}`)
  );

  // ภาพอธิบายเลเยอร์ — ของร้านเป็นจัตุรัส 800px อยู่แล้ว ขยายเป็น 900 ให้เท่าการ์ดใบอื่น
  for (const [key, src] of Object.entries(FOIL_INFO)) {
    save(
      key,
      await sharp(await get(src))
        .resize({ width: W, height: H, fit: "contain", background: "#ffffff" })
        .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
        .toBuffer()
    );
  }

  for (const c of FOIL_COLORS) {
    const BOX_H = 430;
    const img = await sharp(await get(c.src)).resize({ height: BOX_H, fit: "inside" }).toBuffer();
    const meta = await sharp(img).metadata();
    const left = Math.round((W - meta.width) / 2);
    const top = 218;
    const stops = c.ramp
      .map((col, i) => `<stop offset="${Math.round((i / (c.ramp.length - 1)) * 100)}%" stop-color="${col}"/>`)
      .join("");
    const fee = c.key === "foil-hologram" ? `บวกเพิ่มอีก ${holoFee} บาท จากค่าเคลือบฟอยล์` : "ไม่มีค่าสีเพิ่ม (คิดแค่ค่าเคลือบฟอยล์)";
    const svg = frame(`
      <defs><linearGradient id="ramp" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
      ${title(`ฟอยล์${c.name.replace(/^สี/, "")}`, "ตัวอย่างงานจริงของร้าน — ลายเดียวกัน 4 สีฟอยล์")}
      <rect x="230" y="690" width="440" height="42" rx="21" fill="url(#ramp)" stroke="${BOARD_EDGE}" stroke-width="1.5"/>
      <text x="450" y="768" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${esc(c.name)}</text>
      ${foot([fee, `ค่าเคลือบฟอยล์ 1 เลเยอร์ ${foil1} บาท · 2 เลเยอร์ ${foil2} บาท`])}`);
    save(
      c.key,
      await sharp(Buffer.from(svg))
        .composite([{ input: img, left, top }])
        .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
        .toBuffer()
    );
  }
}

/* ── 5. การ์ดปั๊มฟอยล์ (วาดเอง) ──────────────────────────────────── */

async function stampCards(stampFee) {
  console.log("🖼  การ์ดปั๊มฟอยล์ (วาดเอง)");
  await saveSvg(
    "stamp-none",
    frame(`
      ${title("ไม่ปั๊มฟอยล์", "ผิวหน้าเรียบ ไม่มีรอยปั๊มจม")}
      ${board(300, 250, 300, 400, { art: artwork(300, 250, 300, 400) })}
      <text x="450" y="700" font-family="${TH}" font-size="27" text-anchor="middle" fill="${INK}">งานพิมพ์อย่างเดียว ไม่มีขั้นตอนปั๊ม</text>
      <text x="450" y="742" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ไม่มีค่าบวกเพิ่มจากราคาในตาราง</text>
      ${foot(["ปั๊มฟอยล์เป็นงาน Add On แยกจากการเคลือบฟอยล์", "ปั๊มได้ทั้งบนงานพิมพ์และบนแผ่นเปล่า"])}`)
  );

  // รอยปั๊มจม: ลายฟอยล์ทองที่มีเงาขอบ (highlight ด้านบน + เงาด้านล่าง) ให้ดูเป็นรอยกดลงในเนื้อแผ่น
  const emblem = `
    <defs>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff3c4"/><stop offset="45%" stop-color="#e0b23c"/>
        <stop offset="70%" stop-color="#b8860b"/><stop offset="100%" stop-color="#f6dd93"/>
      </linearGradient>
    </defs>
    <g>
      <circle cx="450" cy="410" r="98" fill="none" stroke="#cbd5e1" stroke-width="9"/>
      <circle cx="450" cy="410" r="98" fill="none" stroke="url(#gold)" stroke-width="6"/>
      <path d="M 398 372 h 104 M 398 410 h 104 M 398 448 h 68" stroke="url(#gold)" stroke-width="11" stroke-linecap="round" fill="none"/>
      <path d="M 398 372 h 104 M 398 410 h 104 M 398 448 h 68" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round" fill="none" transform="translate(0,-3)"/>
    </g>`;
  await saveSvg(
    "stamp-foil",
    frame(`
      ${title("ปั๊มฟอยล์", `งาน Add On — บวกเพิ่ม ${stampFee} บาท`)}
      ${board(295, 240, 310, 420, { fill: "#fbfbf9" })}
      ${emblem}
      <text x="450" y="706" font-family="${TH}" font-size="27" text-anchor="middle" fill="${INK}">ปั๊มความร้อนให้ฟอยล์ติดเป็นรอยจมลงในเนื้อแผ่น</text>
      <text x="450" y="748" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ผิวสัมผัสเป็นโลหะเงา จับแล้วรู้สึกเป็นร่อง</text>
      ${foot(["ภาพวาดจำลองลักษณะงาน — ลายปั๊มทำตามไฟล์ของลูกค้า", "แจ้งตำแหน่ง/ขนาดลายที่จะปั๊มกับแอดมินก่อนผลิต"])}`)
  );
}

/* ── 6. อินโฟกราฟิกจำนวนต่อแผ่น A3 (ภาพของร้านเอง) ──────────────── */

async function a3Chart() {
  console.log("🖼  อินโฟกราฟิกจำนวนต่อแผ่น A3 (ภาพของร้านเอง — paper-foil/a3-chart.jpg)");
  save(
    "a3-chart",
    await sharp(await get(`${BASE}/paper-foil/a3-chart.jpg`))
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer()
  );
}

/* ── รัน ─────────────────────────────────────────────────────────── */

/** ค่าบวกเพิ่มที่เขียนลงการ์ด — apply.mjs อ่านค่าจริงจากเว็บแล้วทวนกับชุดนี้ ไม่ตรง = หยุด */
export const FEES = { coat: 10, special: 40, foil1: 40, foil2: 60, holo: 10, stamp: 60 };

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`📁 ${OUT}`);
  await sizeCards();
  await sizeChart();
  await thicknessCard();
  await coatCards(FEES.coat, FEES.special);
  await foilCards(FEES.foil1, FEES.foil2, FEES.holo);
  await stampCards(FEES.stamp);
  await a3Chart();
  console.log("\n✅ เสร็จ — ต่อด้วย: node scripts/ultra-hard-cardboard-apply.mjs --write");
}
