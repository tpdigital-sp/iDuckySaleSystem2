#!/usr/bin/env node
/**
 * ภาพสินค้า "ถุงหอม (เม็ดหอม)" — scented bag
 *
 *   node scripts/scented-bag-art.mjs            # โหลดรูปงานจริง + วาดภาพตัวเลือก → .cache/scented-bag/upload
 *   node scripts/scented-bag-art.mjs --sheet    # ทำคอนแทคชีตไว้ตรวจก่อนอัป
 *
 * ได้ 2 ชุด:
 *   photo-1..8      รูปงานจริงจากหน้า pricelists (ท่อน scented bag) — ของร้านเอง โฮสต์บน wixstatic
 *   form-* / fab-*  ภาพประจำตัวเลือก วาดเอง (700x700)
 *
 * ทำไมต้องวาดภาพตัวเลือกเอง: ตารางราคาบนเว็บแยกราคาตาม "แบบถุง" 4 แบบ
 * แต่รูปงานจริงถ่ายรวมกันหลายใบในกองเดียว ดูไม่ออกว่าใบไหนคือ 10x10 ใบไหนคือ 11x13
 * ชุด form-* จึงวาดเทียบสเกลจริงทั้ง 4 แบบ (เส้นประ = 11x13 ซม. ใบใหญ่สุด) + วาดวิธีห้อยของแต่ละแบบ
 * (10x10 เชือกขาวเย็บติดถุง · 11x13 เจาะตาไก่ร้อยเชือก · 11x12.5 หูรูด) ตรงตามรูปงานจริง
 *
 * ⛔ เคยมีชุด fab-* (ภาพเทียบความเงาของผ้า 3 ชนิด) — ถอดออกแล้ว เพราะผู้ใช้ตรวจแล้วว่าภาพวาด
 * ไม่ตรงกับเนื้อผ้าจริง กลุ่ม "ชนิดผ้าถุง" บนหน้าสินค้าจึงเป็นปุ่มข้อความล้วน
 * จะกลับมามีภาพได้ก็ต่อเมื่อถ่ายรูปผ้าจริงทั้ง 3 ชนิดมาใช้
 */
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/scented-bag/upload").replace(/\/$/, "");
const SHEET = process.argv.includes("--sheet");
mkdirSync(OUT, { recursive: true });

/* ══ ส่วนที่ 1: รูปงานจริงจากหน้าเว็บตารางราคา ═══════════════════════ */

/** id บน wixstatic → คำอธิบาย (ดูภาพก่อนแล้วว่าเป็นอะไร) */
const PHOTOS = [
  ["6d9daf3ee8e741239af5e239ad65587c", "งานจริง — ถุงหอมลายเช็ค 2 ใบ (เห็นซองเม็ดหอมด้านใน)"],
  ["4990de7717b34678b2fc7ce96d5170e6", "ถุงผ้า 10x10 ซม. (เชือกขาว) เทียบกับ 11x13 ซม. (เจาะรูร้อยเชือก)"],
  ["175a7819cd404c1895ea304015afc25c", "ถุงหูรูด 11x12.5 ซม. — พิมพ์ลายเต็มใบ"],
  ["23aee682fe3f4527b50976835c8721dd", "พิมพ์ลายได้ทั้งใบ ทุกแบบ"],
  ["83498abed4e8481997afbf06f7c9a796", "ถุงหอม + ริบบิ้น JUST FOR YOU"],
  ["3aa4fcb860444958a3e47592beb54aae", "งานเทศกาล — ถุงหูรูดลาย Merry Christmas"],
  ["a82b5c2d86ea4b7f8c4dcee023a5c597", "จัดเซ็ตเป็นของชำร่วย/ของฝาก"],
  ["5bf872ef7e984f76a3042fd09d1fc27b", "ลายพิมพ์คมชัด งานซับลิเมชั่น"],
];

const PHOTO_W = 1400;

async function photos() {
  let n = 0;
  for (const [id] of PHOTOS) {
    const res = await fetch(`https://static.wixstatic.com/media/959b83_${id}~mv2.jpg/v1/fit/w_2000,h_2000/x.jpg`);
    if (!res.ok) throw new Error(`โหลดรูป ${id} ไม่ได้ — HTTP ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length < 1024) throw new Error(`รูป ${id} เล็กผิดปกติ (${raw.length} ไบต์)`);
    const buf = await sharp(raw).resize({ width: PHOTO_W, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    writeFileSync(`${OUT}/photo-${++n}.jpg`, buf);
    console.log(`📷 photo-${n}.jpg  (${Math.round(buf.length / 1024)} KB)`);
  }
}

/* ══ ส่วนที่ 2: ภาพประจำตัวเลือก (วาดเอง) ═══════════════════════════ */

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const GHOST = "#cbd5e1";

const PX_PER_CM = 26;
const BASE_Y = 520; // ขอบล่างของถุง — ทุกแบบวางชิดเส้นเดียวกัน เทียบขนาดกันได้ทันที
const BIG = { w: 11, h: 13 }; // ใบใหญ่สุดในตาราง ใช้เป็นเส้นประเทียบขนาด

const frame = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="36" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="108" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 29}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

const shadow = (cx, bottom, w) =>
  `<ellipse cx="${cx}" cy="${bottom + 13}" rx="${w * 0.5}" ry="${Math.max(7, w * 0.06)}" fill="#0f172a" opacity="0.07"/>`;

/** เส้นบอกขนาดแนวนอน (ป้ายใต้เส้น) */
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 10}" x2="${x1}" y2="${y + 10}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 10}" x2="${x2}" y2="${y + 10}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 31}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวตั้ง (ป้ายขวาเส้น) */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 10}" y1="${y1}" x2="${x + 10}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 10}" y1="${y2}" x2="${x + 10}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 13}" y="${(y1 + y2) / 2 + 8}" font-family="${TH}" font-size="23" font-weight="700" fill="${CYAN}">${label}</text>`;

/** ดอกไม้ 6 กลีบ — ลายบนถุงของจริงเป็นลายเช็คสลับดอกไม้ */
const flower = (cx, cy, r, color) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `<circle cx="${(cx + Math.cos(a) * r * 0.62).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.62).toFixed(1)}" r="${(r * 0.46).toFixed(1)}" fill="${color}"/>`;
  }).join("") + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.34).toFixed(1)}" fill="#ffffff"/>`;

/** ลายพิมพ์บนถุง — ลายเช็คฟ้า/เหลืองสลับดอกไม้ ตามงานจริงในรูป */
const CLOTH_PATTERN = `
  <pattern id="cloth" width="96" height="96" patternUnits="userSpaceOnUse">
    <rect width="96" height="96" fill="#9fcdee"/>
    <rect x="0" y="0" width="48" height="48" fill="#fbdc86"/>
    <rect x="48" y="48" width="48" height="48" fill="#fbdc86"/>
    ${flower(24, 24, 15, "#f5891f")}
    ${flower(72, 24, 15, "#ffffff")}
    ${flower(24, 72, 15, "#ffffff")}
    ${flower(72, 72, 15, "#2f9e8a")}
  </pattern>`;

/** ผ้าซาตินเงา — ไล่แสงพาดขวางเหมือนแสงตกบนผ้ามัน */
const sheenDef = (id, stops) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.35">${stops}</linearGradient>`;

const SATIN_SHEEN = sheenDef(
  "sheen",
  `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.3"/>
   <stop offset="24%" stop-color="#ffffff" stop-opacity="0"/>
   <stop offset="46%" stop-color="#ffffff" stop-opacity="0.26"/>
   <stop offset="72%" stop-color="#0f172a" stop-opacity="0.07"/>
   <stop offset="100%" stop-color="#ffffff" stop-opacity="0.14"/>`
);

/** รูปทรงถุงแบน — สี่เหลี่ยมขอบมน ขอบป่องนิดหน่อยเพราะข้างในมีเม็ดหอม */
const pouchPath = (cx, bottom, w, h) => {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y1 = bottom;
  const y0 = bottom - h;
  const b = Math.max(5, w * 0.035);
  return `M ${x0} ${y0} Q ${cx} ${y0 - b} ${x1} ${y0} Q ${x1 + b} ${(y0 + y1) / 2} ${x1} ${y1} Q ${cx} ${y1 + b} ${x0} ${y1} Q ${x0 - b} ${(y0 + y1) / 2} ${x0} ${y0} Z`;
};

/** รอยตะเข็บเย็บรอบใบ (เส้นประในขอบ) */
const seam = (cx, bottom, w, h) => {
  const i = Math.max(8, w * 0.05);
  return `<path d="${pouchPath(cx, bottom - i, w - i * 2, h - i * 2)}" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="7 6" opacity="0.75"/>`;
};

/** ตัวถุงผ้าพิมพ์ลาย (เงา + ลาย + ความเงาผ้า + ตะเข็บ) */
const pouch = (cx, bottom, w, h, { fill = "url(#cloth)", sheen = "url(#sheen)" } = {}) => `
  ${shadow(cx, bottom, w)}
  <path d="${pouchPath(cx, bottom, w, h)}" fill="${fill}" stroke="#9db8cc" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="${pouchPath(cx, bottom, w, h)}" fill="${sheen}" stroke="none"/>
  ${seam(cx, bottom, w, h)}`;

/** เชือกขาวแบน — วาดเส้นเทาก่อนแล้วทับด้วยขาว เพื่อให้เห็นบนพื้นขาว */
const cord = (d, outer = 13, inner = 8) => `
  <path d="${d}" fill="none" stroke="#b9c8d6" stroke-width="${outer}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="#ffffff" stroke-width="${inner}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** ซองเม็ดหอมด้านใน — พลาสติกขุ่น เห็นเม็ดหอมสีใสข้างใน */
const beadSachet = (cx, bottom, w, h, { ghost = false, label = "" } = {}) => {
  const x0 = cx - w / 2;
  const y0 = bottom - h;
  if (ghost)
    return `
      <path d="${pouchPath(cx, bottom, w, h)}" fill="#ffffff" opacity="0.55" stroke="#7c8fa3" stroke-width="2.5" stroke-dasharray="9 7"/>
      ${label ? `<text x="${cx}" y="${bottom - h / 2 + 7}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="middle" fill="#64748b">${label}</text>` : ""}`;

  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const beads = [];
  for (let i = 0; i < 78; i++) {
    const bx = x0 + 12 + rnd() * (w - 24);
    const by = y0 + h * 0.42 + rnd() * (h * 0.53 - 12);
    const r = 4 + rnd() * 2.8;
    beads.push(
      `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${r.toFixed(1)}" fill="#dff0fa" stroke="#a9c6db" stroke-width="1.2"/>
       <circle cx="${(bx - r * 0.32).toFixed(1)}" cy="${(by - r * 0.32).toFixed(1)}" r="${(r * 0.3).toFixed(1)}" fill="#ffffff"/>`
    );
  }
  const teeth = Math.floor((w - 16) / 9);
  return `
    ${shadow(cx, bottom, w)}
    <path d="${pouchPath(cx, bottom, w, h)}" fill="#f7fafc" stroke="#b8cad8" stroke-width="2.5" stroke-linejoin="round"/>
    ${beads.join("")}
    <path d="${pouchPath(cx, bottom, w, h)}" fill="url(#sachetSheen)"/>
    <rect x="${x0 + 8}" y="${y0 + 9}" width="${w - 16}" height="18" rx="3" fill="#e6edf4" stroke="#c3d2de" stroke-width="1.5"/>
    ${Array.from({ length: teeth }, (_, i) => `<line x1="${x0 + 12 + i * 9}" y1="${y0 + 11}" x2="${x0 + 16 + i * 9}" y2="${y0 + 25}" stroke="#c3d2de" stroke-width="2"/>`).join("")}
    <text x="${cx}" y="${bottom - h * 0.1}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="#5b6b7c">เม็ดหอม 30 กรัม</text>`;
};

const SACHET_SHEEN = `<linearGradient id="sachetSheen" x1="0" y1="0" x2="1" y2="0.4">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
  <stop offset="30%" stop-color="#ffffff" stop-opacity="0.12"/>
  <stop offset="62%" stop-color="#ffffff" stop-opacity="0.4"/>
  <stop offset="100%" stop-color="#93a7b8" stop-opacity="0.18"/>
</linearGradient>`;

/** เชือกขาวเย็บติดขอบบนถุง (หูห้อยสั้น) — แบบของถุง 10x10 */
const sewnLoop = (cx, top) => `
  ${cord(`M ${cx - 15} ${top + 6} C ${cx - 25} ${top - 58} ${cx + 25} ${top - 58} ${cx + 15} ${top + 6}`, 15, 9)}
  <line x1="${cx - 24}" y1="${top + 11}" x2="${cx - 7}" y2="${top + 11}" stroke="#7c8fa3" stroke-width="2.5" stroke-dasharray="5 4"/>
  <line x1="${cx + 7}" y1="${top + 11}" x2="${cx + 24}" y2="${top + 11}" stroke="#7c8fa3" stroke-width="2.5" stroke-dasharray="5 4"/>`;

/** ตาไก่เจาะรู + เชือกขาวร้อยเป็นห่วง — แบบของถุง 11x13 */
const eyeletCord = (cx, top) => `
  ${cord(`M ${cx} ${top + 27} C ${cx - 36} ${top + 2} ${cx - 33} ${top - 56} ${cx} ${top - 56} C ${cx + 33} ${top - 56} ${cx + 36} ${top + 2} ${cx} ${top + 27}`, 14, 8)}
  <circle cx="${cx}" cy="${top + 27}" r="13" fill="#ffffff" stroke="#8fa3b4" stroke-width="3.5"/>
  <circle cx="${cx}" cy="${top + 27}" r="6" fill="#eef3f7" stroke="#c3d2de" stroke-width="1.5"/>`;

/**
 * ถุงหูรูดทั้งใบ — วาดแยกจาก pouch() เพราะทรงไม่เหมือนถุงแบน
 * อ้างจากรูปงานจริง: ตัวถุงกว้างเต็ม แล้วสอบเข้าที่คอ · เหนือคอเป็นผ้าจีบฟูขึ้นมาเป็นจุก
 * เชือกเป็นสายผ้าแบนสีขาว ออกสองข้างที่คอแล้วห้อยยาวลงมาเลยก้นถุง
 */
const drawstringBag = (cx, bottom, w, h) => {
  const yB = bottom;
  const yT = bottom - h;
  const crownH = h * 0.17;
  const yC = yT + crownH; // แนวรูดเชือก
  const yS = yC + h * 0.15; // ไหล่ถุง — ต่ำกว่านี้กว้างเต็มใบ
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const neck = w * 0.44;
  const nx0 = cx - neck / 2;
  const nx1 = cx + neck / 2;
  const b = w * 0.035;

  const body = `M ${x0} ${yB} Q ${cx} ${yB + b} ${x1} ${yB}
                L ${x1} ${yS}
                C ${x1} ${yC + 10} ${nx1 + 12} ${yC + 6} ${nx1} ${yC}
                L ${nx0} ${yC}
                C ${nx0 - 12} ${yC + 6} ${x0} ${yC + 10} ${x0} ${yS} Z`;

  /** ผ้าจีบเหนือแนวรูด — วงรีซ้อนกันเป็นจุกฟู */
  const crown = Array.from({ length: 5 }, (_, i) => {
    const ex = nx0 + (neck / 4) * i;
    const ry = crownH * (i % 2 ? 0.62 : 0.78);
    const ey = yC - ry * 0.5;
    return `<ellipse cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" rx="${(neck * 0.24).toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#cloth)" stroke="#9db8cc" stroke-width="1.5"/>
            <ellipse cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" rx="${(neck * 0.24).toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#sheen)"/>`;
  }).join("");

  /** รอยจีบผ้าที่รูดแล้วสาดลงมาในตัวถุง */
  const folds = Array.from({ length: 5 }, (_, i) => {
    const t = (i - 2) / 2; // -1 … 1
    return `<path d="M ${(cx + t * neck * 0.42).toFixed(1)} ${yC + 4} C ${(cx + t * neck * 0.6).toFixed(1)} ${yC + h * 0.12} ${(cx + t * w * 0.34).toFixed(1)} ${yS} ${(cx + t * w * 0.4).toFixed(1)} ${(yS + h * 0.16).toFixed(1)}"
             fill="none" stroke="#0f172a" stroke-width="2" opacity="0.13"/>`;
  }).join("");

  return `
    ${shadow(cx, yB, w)}
    ${cord(`M ${nx0 + 10} ${yC + 2} C ${x0 - 18} ${yC + 6} ${x0 - 30} ${yC + h * 0.45} ${x0 - 16} ${yB + 30}`, 17, 11)}
    ${cord(`M ${nx1 - 10} ${yC + 2} C ${x1 + 18} ${yC + 6} ${x1 + 30} ${yC + h * 0.45} ${x1 + 16} ${yB + 30}`, 17, 11)}
    ${crown}
    <path d="${body}" fill="url(#cloth)" stroke="#9db8cc" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${body}" fill="url(#sheen)"/>
    ${folds}
    ${cord(`M ${nx0 - 10} ${yC} Q ${cx} ${yC + 14} ${nx1 + 10} ${yC}`, 15, 10)}`;
};

const write = async (name, svg) => {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🖼  ${name}.jpg  (${Math.round(buf.length / 1024)} KB)`);
  return buf.length;
};

/**
 * แบบสินค้า 4 แบบ — ราคาต่อชิ้น [ช่วง 1-10, ช่วง 50 ขึ้นไป] ตรงตามตารางบนเว็บ
 * (เฉพาะเม็ดหอม 90/70 · +ถุงผ้า 10x10 = 90+100 / 70+85 ฯลฯ)
 */
const FORMS = [
  {
    file: "form-beads",
    title: "เฉพาะเม็ดหอม (ไม่มีถุงผ้า)",
    sub: "เม็ดหอมสีใส 30 กรัม บรรจุซองในตัว",
    cm: null,
    price: [90, 70],
    note: "ร้านผสมน้ำหอมกลิ่น Penthouse มากับเม็ดหอมให้เลย",
  },
  {
    file: "form-bag10",
    title: "+ ถุงผ้า 10x10 ซม.",
    sub: "เชือกขาวเย็บติดกับถุง ห้อยได้เลย",
    cm: { w: 10, h: 10 },
    price: [190, 155],
    top: sewnLoop,
    note: "ทรงจัตุรัส ใบเล็กสุด — ของชำร่วยงานแต่ง/งานบวช",
  },
  {
    file: "form-bag1113",
    title: "+ ถุงผ้า 11x13 ซม.",
    sub: "เจาะรูตาไก่ ร้อยเชือกสีขาว",
    cm: { w: 11, h: 13 },
    price: [200, 165],
    top: eyeletCord,
    note: "ทรงสูง ใบใหญ่สุด — พิมพ์ลายได้เต็มพื้นที่",
  },
  {
    file: "form-drawstring",
    title: "+ ถุงหูรูด 11x12.5 ซม.",
    sub: "ปากถุงรูดเชือกสองข้าง เปิด-ปิดได้",
    cm: { w: 11, h: 12.5 },
    price: [210, 160],
    drawstring: true,
    note: "เปิดปากถุงได้ ใช้เม็ดหอมหมดแล้วใส่ของอย่างอื่นต่อได้",
  },
];

async function forms() {
  const ghostW = BIG.w * PX_PER_CM;
  const ghostH = BIG.h * PX_PER_CM;

  for (const f of FORMS) {
    const cx = W / 2 - 26; // เผื่อที่ให้ป้ายเส้นบอกขนาดแนวตั้งทางขวา
    let art;
    let dims;

    if (!f.cm) {
      // ซองเม็ดหอมล้วน — ซองจริงประมาณ 8x9 ซม.
      const w = 8 * PX_PER_CM;
      const h = 9 * PX_PER_CM;
      art = beadSachet(cx, BASE_Y, w, h);
      dims = `${dimH(BASE_Y + 40, cx - w / 2, cx + w / 2, "ประมาณ 8 ซม.")}
              ${dimV(cx + w / 2 + 24, BASE_Y - h, BASE_Y, "≈ 9 ซม.")}`;
    } else {
      const w = f.cm.w * PX_PER_CM;
      const h = f.cm.h * PX_PER_CM;
      const top = BASE_Y - h;
      art = `
        ${f.drawstring ? drawstringBag(cx, BASE_Y, w, h) : pouch(cx, BASE_Y, w, h)}
        ${beadSachet(cx, BASE_Y - h * 0.1, w * 0.62, h * (f.drawstring ? 0.4 : 0.54), { ghost: true, label: "ซองเม็ดหอม 30 ก." })}
        ${f.drawstring ? "" : f.top(cx, top)}`;
      dims = `${dimH(BASE_Y + 40, cx - w / 2, cx + w / 2, `${f.cm.w} ซม.`)}
              ${dimV(cx + w / 2 + 30, top, BASE_Y, `${f.cm.h} ซม.`)}`;
    }

    const isBig = f.cm && f.cm.w === BIG.w && f.cm.h === BIG.h;
    const ghost = isBig
      ? ""
      : `<path d="${pouchPath(cx, BASE_Y, ghostW, ghostH)}" fill="none" stroke="${GHOST}" stroke-width="2.5" stroke-dasharray="9 8" stroke-linejoin="round"/>
         <text x="${cx - ghostW / 2}" y="${BASE_Y - ghostH - 12}" font-family="${TH}" font-size="17" fill="#94a3b8">เส้นประ = ถุง 11x13 ซม. (ใบใหญ่สุด) ไว้เทียบขนาด</text>`;

    const svg = frame(
      `${CLOTH_PATTERN}${SATIN_SHEEN}${SACHET_SHEEN}`,
      `${title(f.title, f.sub)}
       ${ghost}
       ${art}
       ${dims}
       ${foot([f.note, `1-10 ชิ้น ชิ้นละ ฿${f.price[0]} · 50 ชิ้นขึ้นไป ชิ้นละ ฿${f.price[1]}`])}`
    );
    await write(f.file, svg);
  }
}

/* ── คอนแทคชีตไว้ตรวจก่อนอัป ─────────────────────────────────────── */
async function sheet() {
  const files = readdirSync(OUT).filter((f) => f.endsWith(".jpg") && f !== "_sheet.jpg").sort();
  const S = 320;
  const PAD = 30;
  const COLS = 5;
  const ROWS = Math.ceil(files.length / COLS);
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const x = (i % COLS) * S;
    const y = Math.floor(i / COLS) * (S + PAD) + PAD;
    comps.push({ input: await sharp(`${OUT}/${files[i]}`).resize(S, S, { fit: "contain", background: "#fff" }).toBuffer(), left: x, top: y });
    comps.push({
      input: Buffer.from(
        `<svg width="${S}" height="${PAD}"><rect width="${S}" height="${PAD}" fill="#fff"/><text x="8" y="21" font-size="17" font-family="sans-serif" fill="#0f172a">${files[i]}</text></svg>`
      ),
      left: x,
      top: y - PAD,
    });
  }
  await sharp({ create: { width: COLS * S, height: ROWS * (S + PAD) + PAD, channels: 3, background: "#ffffff" } })
    .composite(comps)
    .jpeg({ quality: 84 })
    .toFile(`${OUT}/_sheet.jpg`);
  console.log(`\n📋 คอนแทคชีต → ${OUT}/_sheet.jpg (${files.length} ภาพ)`);
}

await photos();
await forms();
if (SHEET) await sheet();
console.log(`\n✅ ภาพพร้อมที่ ${OUT}/`);
console.log("   ขั้นต่อไป: npx tsx scripts/add-scented-bag.ts --upload --images=" + OUT);
