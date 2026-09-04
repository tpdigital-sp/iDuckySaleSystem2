#!/usr/bin/env node
/**
 * ผ้าห่ม (blanket-th · /products/ผ้าห่ม) — ภาพประกอบกลุ่มตัวเลือกครบ 4 กลุ่ม + แสดงเป็นการ์ด
 *
 *   node scripts/blanket-option-art.mjs            (วาดภาพลง .cache/blanket-th/upload ดูก่อน)
 *   node scripts/blanket-option-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * อ้างใบสเปคร้าน: 40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/18_ผ้าขนหนู.../P-nBlanket-01.jpg (5325×5000)
 *   • ตำแหน่งงาน 2 แบบ
 *       ไม่เน้นตำแหน่ง = ผ้าห่ม "สำเร็จรูป" เย็บขอบมาแล้ว → สกรีนแล้วลายคลาดจากแบบ 5–15 ซม. (3–7 นิ้ว)
 *       เน้นตำแหน่ง   = สกรีนก่อน แล้วตัดตามขนาด "เย็บเก็บขอบเอง" ด้านละ 1.5–2 ซม. → ลายตรงตำแหน่งกว่า
 *   • ขนาด: ไม่เน้น → 76x100 / 100x150 / 150x200 ซม. + 60x80 นิ้ว (152x203) · เน้น → 76x100 / 100x100 / 100x150 / 150x200
 *   • ผ้าสีขาว (White) ทุกขนาด ยกเว้น 60x80 นิ้ว เป็น "สีอมเหลือง (Off-White)"
 *   • ขนาดผ้าคลาดเคลื่อน: สำเร็จรูป ±2–5 นิ้ว · เย็บขอบเอง ±1–2 นิ้ว
 *
 * ⚠️ ทั้ง 3 กลุ่ม (ขนาด · ตำแหน่งงาน · พิมพ์กี่ด้าน) เป็น **แกนตารางราคา** — driverLabels ของ
 *    data.pricing และ data.priceRates[*].pricing · ห้ามเปลี่ยนชื่อกลุ่ม/ชื่อตัวเลือกเด็ดขาด
 *    สคริปต์นี้เติมแค่ imageSrc + desc + display "cards" ([[iducky-price-driver-trap]])
 * ⚠️ ปุ่ม/การ์ดครอป "กลางภาพ" (900×900 → พิกัด 300–600) — ของที่ทำให้ตัวเลือกต่างกันต้องอยู่กรอบนั้น
 *    ตรวจได้จากไฟล์ _thumb-*.jpg ที่สคริปต์ครอปไว้ให้ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "blanket-th";
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
const SRC = `.cache/${PRODUCT_ID}/src`;
mkdirSync(OUT, { recursive: true });
mkdirSync(SRC, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const WARN = "#e11d48";
const OK = "#0891b2";

const MASCOT = await mascotDataUri("heart", 420);

// ── สวอตช์ผ้าจริง ครอปจากใบสเปค (แคชไว้ ไดรฟ์ไม่ได้ต่อก็ยังเรนเดอร์ซ้ำได้) ──────────
const SHEET = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/18_ผ้าขนหนู ผ้าห่ม ฮู้ด พรมเช็ดเท้า ที่รองจาน หมอนผ้าห่ม/P-nBlanket-01.jpg";
/** ครอปวงกลมตัวอย่างเนื้อผ้าท้ายใบสเปค → data URI (ขาวถ่ายติดเงา จึงดึงสว่างขึ้นให้ตรงกับของจริง) */
async function fabricSwatch(name, box, tune) {
  const file = `${SRC}/${name}.jpg`;
  if (!existsSync(file)) {
    if (!existsSync(SHEET)) throw new Error(`ไม่มีแคช ${file} และไดรฟ์ไม่ได้ต่อ — ต่อไดรฟ์ iDuckyShop แล้วรันใหม่`);
    let img = sharp(SHEET).extract(box).resize(420);
    if (tune) img = img.modulate(tune);
    await img.jpeg({ quality: 94 }).toFile(file);
  }
  return `data:image/jpeg;base64,${readFileSync(file).toString("base64")}`;
}
const FAB_OFFWHITE = await fabricSwatch("fab-offwhite", { left: 1010, top: 4380, width: 220, height: 220 });
const FAB_WHITE = await fabricSwatch("fab-white", { left: 2161, top: 4365, width: 240, height: 240 }, { brightness: 1.45, saturation: 0.25 });

// ── ตัวช่วยวาด ────────────────────────────────────────────────────────────────
/** สุ่มแบบมีเมล็ด — รันกี่ครั้งลายก็ตกที่เดิม (ไฟล์จะได้ไม่เปลี่ยนทุกครั้งที่รัน) */
const rnd = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข */
const dim = (x1, y1, x2, y2, label, side = "below", color = SUB) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) =>
    `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${color}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12 : (label.length * 12) / 2)}" y="${ly - 24}"
      width="${label.length * 12}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${color}">${label}</text>`;
};

/** ป้ายใหญ่คร่อมกลางภาพ — ตัวเดียวที่อ่านได้ตอนถูกครอปเหลือ 62×62 px */
const badge = (cx, cy, main, sub, bw = 264, fs = 46) => `
  <rect x="${cx - bw / 2}" y="${cy - 33}" width="${bw}" height="${sub ? 92 : 74}" rx="18" fill="#0f172a" opacity="0.10"/>
  <rect x="${cx - bw / 2}" y="${cy - 37}" width="${bw}" height="${sub ? 92 : 74}" rx="18" fill="#ffffff" opacity="0.97" stroke="#cbd5e1" stroke-width="2"/>
  <text x="${cx}" y="${cy + (sub ? 6 : 15)}" font-family="${TH}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${INK}">${main}</text>
  ${sub ? `<text x="${cx}" y="${cy + 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const star = (cx, cy, r, fill, rot = 0) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.44 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
};

/**
 * ลายพิมพ์ชุด "ราตรีสวัสดิ์" — เมฆ · ดาว · พระจันทร์เสี้ยว · เป็ดหลับ · ประกาย · หัวใจ
 * (ลายผ้าห่มจริงมักเป็นธีมนอน · ใช้ชุดสีจำกัดและวางเป็นรอบซ้ำ ให้ดูเป็นลายพิมพ์จริง
 *  ไม่ใช่ไอคอนสุ่มหลากสีแบบรุ่น v1 ที่ดูรก)
 */
const MOTIFS = [
  { k: "cloud", col: "#ffffff" },
  { k: "star", col: "#fde68a" },
  { k: "duck", col: "#fef08a" },
  { k: "moon", col: "#fef3c7" },
  { k: "spark", col: "#ffffff" },
  { k: "heart", col: "#fbcfe8" },
  { k: "star", col: "#ffffff" },
  { k: "cloud", col: "#e0f2fe" },
];

function patIcon(m, cx, cy, r, rot) {
  const col = m.col;
  const g = (inner, spin = 0) =>
    `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})${spin ? ` rotate(${spin.toFixed(0)})` : ""}">${inner}</g>`;
  if (m.k === "cloud")
    return g(`<g fill="${col}">
      <ellipse cx="${-r * 0.5}" cy="${r * 0.12}" rx="${r * 0.45}" ry="${r * 0.36}"/>
      <ellipse cx="${r * 0.46}" cy="${r * 0.14}" rx="${r * 0.4}" ry="${r * 0.32}"/>
      <ellipse cx="0" cy="${-r * 0.14}" rx="${r * 0.56}" ry="${r * 0.48}"/>
      <rect x="${-r * 0.92}" y="${r * 0.04}" width="${r * 1.84}" height="${r * 0.44}" rx="${r * 0.22}"/>
    </g>`);
  if (m.k === "moon")
    /* ⚠️ พระจันทร์เสี้ยวห้ามใช้ arc สองท่อน (A...A) — librsvg ที่ sharp ใช้เรนเดอร์ออกมาว่างเปล่า
       ใช้เส้นโค้ง Q สองเส้นประกบแทน (นอกโค้งกว้าง ในโค้งแคบ) */
    return g(`<path d="M 0 ${-r} Q ${r * 1.18} 0 0 ${r} Q ${r * 0.52} 0 0 ${-r} Z" fill="${col}"/>`, -20);
  if (m.k === "duck")
    return g(`<circle cx="0" cy="0" r="${r * 0.86}" fill="${col}"/>
      <path d="M ${-r * 0.5} ${-r * 0.6} q ${r * 0.28} ${-r * 0.36} ${r * 0.52} ${-r * 0.04}" fill="none" stroke="${col}" stroke-width="${r * 0.26}" stroke-linecap="round"/>
      <ellipse cx="${r * 0.66}" cy="${r * 0.14}" rx="${r * 0.44}" ry="${r * 0.23}" fill="#f9a03f"/>
      <path d="M ${-r * 0.32} ${-r * 0.1} q ${r * 0.16} ${r * 0.2} ${r * 0.32} 0" fill="none" stroke="#3f3f46" stroke-width="${r * 0.11}" stroke-linecap="round" opacity="0.8"/>`);
  if (m.k === "star") return star(cx, cy, r, col, (rot * Math.PI) / 180);
  if (m.k === "spark")
    return g(`<path d="M 0 ${-r} Q ${r * 0.18} ${-r * 0.18} ${r} 0 Q ${r * 0.18} ${r * 0.18} 0 ${r} Q ${-r * 0.18} ${r * 0.18} ${-r} 0 Q ${-r * 0.18} ${-r * 0.18} 0 ${-r} Z" fill="${col}"/>`, rot);
  return g(`<path d="M 0 ${r * 0.82} C ${-r * 1.3} ${-r * 0.1} ${-r * 0.58} ${-r} 0 ${-r * 0.38} C ${r * 0.58} ${-r} ${r * 1.3} ${-r * 0.1} 0 ${r * 0.82} Z" fill="${col}"/>`, rot * 0.5);
}

/**
 * ลายพิมพ์เต็มผืน — วางเป็นตารางสลับฟันปลา เลือกลายแบบวนรอบ (ไม่สุ่ม) จะได้เป็น "รอบซ้ำ"
 * เหมือนผ้าพิมพ์จริง · จิตเตอร์เล็กน้อยกันดูแข็ง · offX/offY = เลื่อนลายทั้งผืน
 */
function printPattern(x, y, w, h, seed, step = 62, offX = 0, offY = 0) {
  const r = rnd(seed);
  let s = "";
  for (let gy = -1; gy * step < h + step; gy++) {
    for (let gx = -1; gx * step < w + step; gx++) {
      const m = MOTIFS[(((gx * 3 + gy * 5) % MOTIFS.length) + MOTIFS.length) % MOTIFS.length];
      const cx = x + offX + gx * step + (gy % 2 ? step / 2 : 0) + (r() - 0.5) * 7;
      const cy = y + offY + gy * step + (r() - 0.5) * 7;
      const size = step * (m.k === "cloud" ? 0.3 : m.k === "spark" ? 0.24 : m.k === "duck" ? 0.27 : 0.25);
      s += patIcon(m, cx, cy, size, (r() - 0.5) * 26);
    }
  }
  return s;
}

/**
 * ผืนผ้าห่ม — สี่เหลี่ยมมุมมน + พื้นผ้า (ลายพิมพ์ หรือผ้าเปล่า) + ผิวขนสำลี (feTurbulence)
 * + รอยพับอ่อน ๆ + เงาใต้ผืน · id ต้องไม่ซ้ำกันในภาพเดียว (ส่ง key มาต่างกัน)
 */
function cloth(key, { x, y, w, h, seed, base = "#bfe0f7", printed = true, patStep = 62, offX = 0, offY = 0, hem = 0 }) {
  const rad = Math.min(w, h) * 0.05;
  return `
  <rect x="${x + 6}" y="${y + 10}" width="${w}" height="${h}" rx="${rad}" fill="#0f172a" opacity="0.10"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" fill="${base}"/>
  <g clip-path="url(#clip-${key})">
    ${printed ? printPattern(x, y, w, h, seed, patStep, offX, offY) : ""}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" filter="url(#fleece)" opacity="0.30"/>
    <path d="M ${x} ${y + h * 0.62} Q ${x + w * 0.35} ${y + h * 0.5} ${x + w} ${y + h * 0.68} L ${x + w} ${y + h * 0.74} Q ${x + w * 0.35} ${y + h * 0.58} ${x} ${y + h * 0.7} Z" fill="#ffffff" opacity="0.18"/>
    <path d="M ${x} ${y + h * 0.24} Q ${x + w * 0.45} ${y + h * 0.34} ${x + w} ${y + h * 0.2} L ${x + w} ${y + h * 0.26} Q ${x + w * 0.45} ${y + h * 0.4} ${x} ${y + h * 0.3} Z" fill="#0f172a" opacity="0.05"/>
    ${hem ? `<rect x="${x + hem}" y="${y + hem}" width="${w - hem * 2}" height="${h - hem * 2}" rx="${rad}" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="9 7" opacity="0.85"/>` : ""}
  </g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" fill="none" stroke="#94a3b8" stroke-width="2" opacity="0.55"/>`;
}

const clipDef = (key, x, y, w, h) =>
  `<clipPath id="clip-${key}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.05}"/></clipPath>`;

/** โครงการ์ด: พื้น + กรอบขาว + หัวเรื่อง + คำโปรย + หมายเหตุท้ายภาพ */
const frame = (title, sub, foot, body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="fleece" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="4" seed="5"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    ${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>
  ${body}
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${foot}</text>
</svg>`;

// ── 1) กลุ่ม "ตำแหน่งงาน" ────────────────────────────────────────────────────
const POS_GROUP = "ตำแหน่งงาน";
const POS = [
  {
    name: "ไม่เน้นตำแหน่ง",
    file: `pos-free-${VER}.jpg`,
    title: "ไม่เน้นตำแหน่งงาน (ผ้าห่มสำเร็จรูป)",
    sub: "เย็บขอบมาแล้วจากโรงงาน แล้วค่อยสกรีนลายลงบนผืน",
    foot: "เหมาะกับลายกระจายเต็มผืน · ขนาดผืนคลาดเคลื่อน ± 2–5 นิ้ว",
    desc: "ผ้าห่มเย็บสำเร็จรูปแล้วค่อยสกรีน · ลายอาจคลาดจากแบบ 5–15 ซม. (3–7 นิ้ว) เหมาะกับลายกระจายเต็มผืน",
  },
  {
    name: "เน้นตำแหน่ง",
    file: `pos-fixed-${VER}.jpg`,
    title: "เน้นตำแหน่งงาน (เย็บเก็บขอบเอง)",
    sub: "สกรีนลายก่อน แล้วตัดตามขนาด เย็บเก็บขอบเองด้านละ 1.5–2 ซม.",
    foot: "เหมาะกับลายที่ต้องอยู่ตรงตำแหน่ง เช่น โลโก้/ตัวละครกลางผืน · ขนาดผืนคลาดเคลื่อน ± 1–2 นิ้ว",
    desc: "สกรีนก่อนแล้วตัด+เย็บเก็บขอบเองด้านละ 1.5–2 ซม. · ลายตรงตำแหน่งกว่าแบบสำเร็จรูป เหมาะกับโลโก้/ตัวละครกลางผืน",
  },
];

function posArt(kind) {
  const w = 320;
  const h = 420;
  const x = (W - w) / 2;
  const y = 268;
  const cx = W / 2;

  if (kind === "free") {
    /* ลายกระจาย + เลื่อนลายให้เห็นว่าไม่ล็อกตำแหน่ง + กรอบแบบที่ส่ง (เส้นประ) เยื้องจากผืนจริง */
    const dxs = 34;
    const dys = 26;
    return {
      defs: clipDef("m", x, y, w, h),
      body: `
      ${cloth("m", { x, y, w, h, seed: 11, offX: -26, offY: -18 })}
      <rect x="${x - dxs}" y="${y - dys}" width="${w}" height="${h}" rx="16" fill="none" stroke="${WARN}" stroke-width="3" stroke-dasharray="12 9"/>
      <text x="${x - dxs}" y="${y - dys - 14}" font-family="${TH}" font-size="22" font-weight="700" fill="${WARN}">แบบที่ส่ง (template)</text>
      <line x1="${x - dxs}" y1="${y - dys}" x2="${x}" y2="${y}" stroke="${WARN}" stroke-width="3"/>
      <circle cx="${x - dxs}" cy="${y - dys}" r="5" fill="${WARN}"/>
      <circle cx="${x}" cy="${y}" r="5" fill="${WARN}"/>
      <line x1="${x - dxs}" y1="${y + h + 30}" x2="${x}" y2="${y + h + 30}" stroke="${WARN}" stroke-width="2.5"/>
      <line x1="${x - dxs}" y1="${y + h + 22}" x2="${x - dxs}" y2="${y + h + 38}" stroke="${WARN}" stroke-width="3"/>
      <line x1="${x}" y1="${y + h + 22}" x2="${x}" y2="${y + h + 38}" stroke="${WARN}" stroke-width="3"/>
      <text x="${x - dxs / 2}" y="${y + h + 66}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${WARN}">5–15 ซม.</text>
      ${badge(cx, 556, "ลายคลาดได้", "5–15 ซม. (3–7 นิ้ว)", 300, 38)}`,
    };
  }
  /* ลายเดียวกลางผืน + เส้นเย็บเก็บขอบ + เส้นกลางบอกว่าล็อกตำแหน่ง */
  const mh = 190;
  const mw = mh * MASCOT.ratio;
  return {
    defs: clipDef("m", x, y, w, h),
    body: `
    ${cloth("m", { x, y, w, h, seed: 21, base: "#cfe8f9", printed: false, hem: 15 })}
    <g clip-path="url(#clip-m)">
      ${printPattern(x, y, w, h, 33, 96, 10, 10).replace(/opacity="[^"]*"/g, "")}
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#cfe8f9" opacity="0.55"/>
      <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${y + h / 2 - mh / 2 - 10}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
      <line x1="${cx}" y1="${y + 8}" x2="${cx}" y2="${y + h - 8}" stroke="${OK}" stroke-width="1.8" stroke-dasharray="7 7" opacity="0.75"/>
      <line x1="${x + 8}" y1="${y + h / 2 - 10}" x2="${x + w - 8}" y2="${y + h / 2 - 10}" stroke="${OK}" stroke-width="1.8" stroke-dasharray="7 7" opacity="0.75"/>
      <rect x="${x + 15}" y="${y + 15}" width="${w - 30}" height="${h - 30}" rx="14" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="10 8"/>
    </g>
    <text x="${x + w + 12}" y="${y + 26}" font-family="${TH}" font-size="21" font-weight="700" fill="${OK}">เย็บเก็บขอบ</text>
    <text x="${x + w + 12}" y="${y + 52}" font-family="${TH}" font-size="21" font-weight="700" fill="${OK}">1.5–2 ซม.</text>
    <line x1="${x + w - 15}" y1="${y + 40}" x2="${x + w + 6}" y2="${y + 30}" stroke="${OK}" stroke-width="2"/>
    ${badge(cx, 556, "ลายตรงตำแหน่ง", "คลาดน้อยกว่าแบบสำเร็จรูป", 320, 38)}`,
  };
}

// ── 2) กลุ่ม "ขนาด" ──────────────────────────────────────────────────────────
const SIZE_GROUP = "ขนาด";
const CM = 2.7; // สเกลร่วมทุกใบ — เทียบขนาดข้ามตัวเลือกได้จริง
const SIZES = [
  {
    name: "76x100cm", file: `size-76x100-${VER}.jpg`, w: 76, h: 100,
    badge: "76×100", badgeSub: "ซม.",
    title: "ขนาด 76 × 100 ซม.", sub: "ผืนเล็ก พกง่าย ใช้ในรถ / ออฟฟิศ / เด็กเล็ก",
    desc: "ผืนเล็ก 76 × 100 ซม. พกง่าย ใช้ในรถหรือออฟฟิศ · ผ้าสีขาว",
  },
  {
    name: "100x100cm", file: `size-100x100-${VER}.jpg`, w: 100, h: 100,
    badge: "100×100", badgeSub: "ซม.",
    title: "ขนาด 100 × 100 ซม.", sub: "ทรงจัตุรัส 1 × 1 เมตร (มีเฉพาะแบบเน้นตำแหน่งงาน)",
    desc: "จัตุรัส 1 × 1 เมตร · มีเฉพาะแบบเน้นตำแหน่งงาน · ผ้าสีขาว",
  },
  {
    name: "100x150cm", file: `size-100x150-${VER}.jpg`, w: 100, h: 150,
    badge: "100×150", badgeSub: "ซม.",
    title: "ขนาด 100 × 150 ซม.", sub: "ผืนกลาง ห่มคนเดียวกำลังดี ขายดีที่สุด",
    desc: "ผืนกลาง 100 × 150 ซม. ห่มคนเดียวกำลังดี · ผ้าสีขาว",
  },
  {
    name: "150x200cm", file: `size-150x200-${VER}.jpg`, w: 150, h: 200,
    badge: "150×200", badgeSub: "ซม.",
    title: "ขนาด 150 × 200 ซม.", sub: "ผืนใหญ่ ห่มเต็มตัว / คลุมเตียงได้",
    desc: "ผืนใหญ่ 150 × 200 ซม. ห่มเต็มตัวหรือคลุมเตียง · ผ้าสีขาว",
  },
  {
    name: "60x80นิ้ว", file: `size-60x80in-${VER}.jpg`, w: 152, h: 203, offWhite: true,
    badge: "60×80", badgeSub: "นิ้ว (152 × 203 ซม.)",
    title: "ขนาด 60 × 80 นิ้ว (152 × 203 ซม.)", sub: "ผืนใหญ่สุด · เนื้อผ้าสีอมเหลือง (Off-White)",
    desc: "ผืนใหญ่สุด 152 × 203 ซม. เนื้อผ้าสีอมเหลือง (Off-White) · มีเฉพาะแบบไม่เน้นตำแหน่งงาน",
  },
];

function sizeArt(s) {
  const w = s.w * CM;
  const h = s.h * CM;
  const cy = 480;
  const x = (W - w) / 2;
  const y = cy - h / 2;
  const cx = W / 2;
  const gw = 150 * CM;
  const gh = 200 * CM;
  const ghost = s.w === 150 || s.offWhite ? "" : `
    <rect x="${cx - gw / 2}" y="${cy - gh / 2}" width="${gw}" height="${gh}" rx="18" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="10 8"/>
    <text x="${cx - gw / 2}" y="${cy - gh / 2 - 10}" font-family="${TH}" font-size="19" fill="#94a3b8">เทียบผืนใหญ่สุด 150 × 200 ซม.</text>`;
  const bw = Math.max(190, Math.min(w * 0.94, 320));
  const fs = Math.max(28, Math.min(bw / 6.4, 46));
  return {
    defs: clipDef("m", x, y, w, h),
    body: `
    ${ghost}
    ${cloth("m", { x, y, w, h, seed: Math.round(s.w * 7 + s.h), base: s.offWhite ? "#f2e6cf" : "#bfe0f7", patStep: 58 })}
    ${dim(x, y + h + 30, x + w, y + h + 30, `${s.w} ซม.`)}
    ${dim(x - 34, y, x - 34, y + h, `${s.h} ซม.`)}
    ${badge(cx, 556, s.badge, s.badgeSub, bw, fs)}`,
  };
}

// ── 3) กลุ่ม "พิมพ์กี่ด้าน" ──────────────────────────────────────────────────
const SIDE_GROUP = "พิมพ์กี่ด้าน";
const SIDES = [
  {
    name: "1 ด้าน", file: `side-1-${VER}.jpg`, both: false,
    title: "พิมพ์ลาย 1 ด้าน", sub: "ด้านหน้าพิมพ์ลาย · ด้านหลังเป็นผ้าเปล่าสีพื้น",
    foot: "ราคาพื้นฐานในตารางคือแบบพิมพ์ 1 ด้าน",
    desc: "พิมพ์ลายเฉพาะด้านหน้า ด้านหลังเป็นผ้าเปล่าสีพื้น (ราคาพื้นฐาน)",
  },
  {
    name: "2 ด้าน", file: `side-2-${VER}.jpg`, both: true,
    title: "พิมพ์ลาย 2 ด้าน", sub: "พิมพ์ทั้งหน้าและหลัง จะใช้ลายเดียวกันหรือคนละลายก็ได้",
    foot: "พิมพ์ 2 ด้าน บวกเพิ่มตามขนาดผืน (ดูตารางราคา)",
    desc: "พิมพ์ลายทั้งสองด้าน ใช้ลายเดียวกันหรือคนละลายก็ได้ · บวกเพิ่มตามขนาดผืน",
  },
];

function sideArt(s) {
  const w = 250;
  const h = 420;
  const y = 246;
  const xf = 190;
  const xb = 460;
  return {
    defs: clipDef("f", xf, y, w, h) + clipDef("b", xb, y, w, h),
    body: `
    <text x="${xf + w / 2}" y="${y - 18}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
    <text x="${xb + w / 2}" y="${y - 18}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${s.both ? INK : SUB}">ด้านหลัง</text>
    ${cloth("f", { x: xf, y, w, h, seed: 41, patStep: 56 })}
    ${s.both
      ? cloth("b", { x: xb, y, w, h, seed: 47, patStep: 56, offX: 22, offY: 14 })
      : cloth("b", { x: xb, y, w, h, seed: 47, base: "#f4f5f7", printed: false })}
    ${s.both ? "" : `<text x="${xb + w / 2}" y="${y + h - 24}" font-family="${TH}" font-size="22" text-anchor="middle" fill="#94a3b8">ผ้าเปล่าสีพื้น</text>`}
    ${badge(W / 2, 560, s.name, s.both ? "หน้า + หลัง" : "เฉพาะด้านหน้า", 250, 46)}`,
  };
}

// ── 4) กลุ่ม "สีผ้าห่ม" ──────────────────────────────────────────────────────
const COLOR_GROUP = "สีผ้าห่ม";
const COLORS = [
  {
    name: "สีอมเหลือง (Off-White)", file: `color-offwhite-${VER}.jpg`,
    title: "เนื้อผ้าสีอมเหลือง (Off-White)", sub: "ผ้าห่มขนาด 60 × 80 นิ้ว เป็นผ้าสีอมเหลือง ไม่ใช่สีขาว",
    foot: "ภาพถ่ายเนื้อผ้าจริงจากใบสเปคร้าน · ขนาดอื่นเป็นผ้าสีขาว (White)",
    desc: "ผ้าห่ม 60 × 80 นิ้ว ใช้เนื้อผ้าสีอมเหลือง (Off-White) ไม่ใช่สีขาว · ขนาดอื่นเป็นผ้าสีขาว",
  },
];

function colorArt() {
  const cx = W / 2;
  const big = 300;
  return {
    defs: `<clipPath id="clip-big"><rect x="${cx - big / 2}" y="${300}" width="${big}" height="${big}" rx="26"/></clipPath>
      <clipPath id="clip-sw1"><circle cx="330" cy="716" r="52"/></clipPath>
      <clipPath id="clip-sw2"><circle cx="570" cy="716" r="52"/></clipPath>`,
    body: `
    <rect x="${cx - big / 2 - 10}" y="290" width="${big + 20}" height="${big + 20}" rx="32" fill="#fdf6e7" stroke="#f0d9a8" stroke-width="2"/>
    <image href="${FAB_OFFWHITE}" x="${cx - big / 2}" y="300" width="${big}" height="${big}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-big)"/>
    ${badge(cx, 556, "Off-White", "สีอมเหลือง", 260, 42)}
    <text x="${cx}" y="642" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${INK}">เทียบกับผ้าสีขาวของขนาดอื่น</text>
    <image href="${FAB_WHITE}" x="278" y="664" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-sw1)"/>
    <circle cx="330" cy="716" r="52" fill="none" stroke="#cbd5e1" stroke-width="3"/>
    <text x="330" y="800" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">สีขาว (White)</text>
    <text x="330" y="826" font-family="${TH}" font-size="19" text-anchor="middle" fill="#94a3b8">ทุกขนาดที่เป็นเซนติเมตร</text>
    <image href="${FAB_OFFWHITE}" x="518" y="664" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-sw2)"/>
    <circle cx="570" cy="716" r="52" fill="none" stroke="#eab308" stroke-width="3"/>
    <text x="570" y="800" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${INK}">Off-White</text>
    <text x="570" y="826" font-family="${TH}" font-size="19" text-anchor="middle" fill="#94a3b8">60 × 80 นิ้ว</text>`,
  };
}

// ── เรนเดอร์ทั้งหมด ──────────────────────────────────────────────────────────
const jobs = [
  ...POS.map((p) => ({ ...p, group: POS_GROUP, art: () => posArt(p.name === "ไม่เน้นตำแหน่ง" ? "free" : "fixed") })),
  ...SIZES.map((s) => ({
    ...s, group: SIZE_GROUP, art: () => sizeArt(s),
    foot: "ขนาดผ้าแต่ละผืนคลาดเคลื่อนได้ · สำเร็จรูป ± 2–5 นิ้ว · เย็บขอบเอง ± 1–2 นิ้ว",
  })),
  ...SIDES.map((s) => ({ ...s, group: SIDE_GROUP, art: () => sideArt(s) })),
  ...COLORS.map((c) => ({ ...c, group: COLOR_GROUP, art: () => colorArt() })),
];

const built = [];
for (const j of jobs) {
  const { defs, body } = j.art();
  const svg = frame(j.title, j.sub, j.foot, body, defs);
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, buf);
  /* ครอปกลาง 300–600 = สิ่งที่เห็นจริงบนปุ่ม/หัวการ์ด — ตรวจว่ายังแยกตัวเลือกออก */
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${j.file}`);
  built.push({ ...j, buf });
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(buf.length / 1024)} KB — ${j.group} / ${j.name}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  b.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", b.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

for (const label of [POS_GROUP, SIZE_GROUP, SIDE_GROUP, COLOR_GROUP]) {
  const at = options.findIndex((o) => o.label === label);
  if (at < 0) { console.error(`ไม่เจอกลุ่ม "${label}"`); process.exit(1); }
  const group = options[at];
  const mine = built.filter((b) => b.group === label);
  group.display = "cards";
  group.choices = group.choices.map((c) => {
    const b = mine.find((x) => x.name === c.name);
    if (!b) { console.error(`กลุ่ม "${label}" มีตัวเลือกที่สคริปต์ไม่ได้วาด:`, c.name); process.exit(1); }
    return { ...c, imageSrc: b.url, desc: b.desc };
  });
  if (group.choices.length !== mine.length) { console.error(`จำนวนตัวเลือกกลุ่ม "${label}" ไม่ตรงกับภาพที่วาด`, group.choices.map((c) => c.name)); process.exit(1); }
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const label of [POS_GROUP, SIZE_GROUP, SIDE_GROUP, COLOR_GROUP]) {
  const g = back.data.options.find((o) => o.label === label);
  if (g?.display !== "cards") { console.error("อ่านกลับ display ไม่เป็น cards", label, g?.display); process.exit(1); }
  for (const b of built.filter((x) => x.group === label)) {
    const c = g.choices.find((x) => x.name === b.name);
    if (c?.imageSrc !== b.url || c?.desc !== b.desc) { console.error("อ่านกลับตัวเลือกไม่ตรง!", label, b.name, c); process.exit(1); }
  }
}
/* กันเผลอ: คีย์ตารางราคาต้องยังครบเหมือนเดิม (ชื่อกลุ่ม/ชื่อตัวเลือกคือแกนราคา) */
const cellKeys = Object.keys(back.data.pricing?.cells ?? {});
if (cellKeys.length !== 16) { console.error("จำนวนคีย์ตารางราคาเปลี่ยน!", cellKeys.length); process.exit(1); }
for (const p of [back.data.pricing, ...(back.data.priceRates ?? []).map((r) => r.pricing)]) {
  for (const k of cellKeys) if (!p?.cells?.[k]) { console.error("คีย์ราคาหาย!", k); process.exit(1); }
  const [sz, pos, side] = ["ขนาด", "ตำแหน่งงาน", "พิมพ์กี่ด้าน"];
  if (JSON.stringify(p?.driverLabels) !== JSON.stringify([sz, pos, side])) { console.error("driverLabels เพี้ยน!", p?.driverLabels); process.exit(1); }
}
console.log(`✓ 4 กลุ่มเป็นการ์ด + ภาพ ${built.length} ใบ · คีย์ตารางราคา ${cellKeys.length} ช่องครบ · savedAt =`, back.data.savedAt);
