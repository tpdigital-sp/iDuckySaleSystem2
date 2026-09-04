#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่มตัวเลือกของ "Frame Card (การ์ดใส)" — id `frame-card`
 * (/products/Frame-Card-การ์ดใส)
 *
 *   node scripts/frame-card-option-art.mjs            (วาดภาพลง .cache/frame-card/upload ดูก่อน)
 *   node scripts/frame-card-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง imageSrc/desc + อ่านกลับเทียบ)
 *
 * 2 กลุ่มที่ยังไม่มีภาพเลย (ทั้งคู่เป็น **แกนตารางราคา** driverLabels ["สกรีนกี่ด้าน","ตะขอโซ่ไข่ปลา"]
 * — ห้ามแก้ชื่อกลุ่ม/ชื่อตัวเลือก เพราะเป็นคีย์ของ pricing.cells "สกรีน 1 ด้าน│ตะขอ Z2 โซ่ไข่ปลาสีเงิน"):
 *   1. "สกรีนกี่ด้าน" 2 ใบ — การ์ดหน้า-หลังคู่กัน + วงเลข 1/2 กลางภาพ
 *      1 ด้าน = ด้านหลังไม่พิมพ์ มองทะลุเห็นลายด้านหน้ากลับด้าน · 2 ด้าน = ด้านหลังพิมพ์อีกลาย
 *   2. "ตะขอโซ่ไข่ปลา" 3 ใบ — การ์ดเจาะรูมุมบนซ้าย + โซ่ไข่ปลาร้อยรู
 *      Z2 เงิน (ฟรี) · แบบสี (+3 บาท/ชิ้น เลือกเฉดในกลุ่ม "สีตะขอ" 23 สี) · ไม่รับตะขอ (รูเปล่า)
 *
 * ขนาด/ทรงการ์ดอ้าง **ใบ Layout Design ของร้านเอง** (แท็บ "ตัวอย่างการวางแบบ" ของสินค้านี้ —
 * products/frame-card/429f4c76-…jpg): 65 × 105 มม. · รูห้อยโซ่มุมบน · ตรงกลางเว้นใสให้เห็นบัตร/รูปด้านใน
 * ทรงรู + โซ่เงินอ้างรูปงานจริงในแกลเลอรี (a0ee4cfc / b835b254 — รูกลมมุมบนซ้าย โซ่ไข่ปลาเงิน)
 * "แบบสี" = **โซ่ทั้งเส้นเป็นสีนั้น** (ไม่ใช่โซ่เงิน+ตะขอสี) ตามชาร์ต "ตะขอ C" ของร้าน
 * (959b83_44f87a38 — โซ่ไข่ปลา C1-C33 ระบุ "+3บาท/ชิ้น" ตรงกับส่วนต่างในตารางราคาเป๊ะทุกช่วง)
 *
 * ⚠️ ปุ่ม/การ์ดตัวเลือกครอปกลางภาพ (900×900 เห็นแค่ 300–600) — จุดต่างต้องตกในกรอบกลาง
 *    "สกรีนกี่ด้าน": วงเลข 1/2 กลางภาพ · "ตะขอโซ่ไข่ปลา": โซ่ + มุมรูของการ์ดอยู่กลางภาพ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "frame-card";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SCREEN_GROUP = "สกรีนกี่ด้าน";
const HOOK_GROUP = "ตะขอโซ่ไข่ปลา";
const COLOR_GROUP = "สีตะขอ";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ขนาดจริงจากใบ Layout Design ของร้าน (มม.) */
const CARD_MM_W = 65;
const CARD_MM_H = 105;

// ── โครงการ์ดร่วม (ทรงเดียวกับภาพตัวเลือกตัวอื่นทั้งร้าน) ─────────────
const card = (title, subtitle, body, note1 = "", note2 = "", defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ป้ายกำกับเล็ก (ทรงเดียวกับ doll-die-cut / jigsaw) */
const tag = (cx, y, text, on = false) => {
  const w = text.length * 12.5 + 40;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="38" rx="19" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2"/>
  <text x="${cx}" y="${y + 26}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

const pill = (cx, y, text, on = true) => {
  const w = text.length * 13 + 54;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="44" rx="22" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 30}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

// ── ลายสกรีนบนขอบการ์ด (สติกเกอร์เครื่องเขียนแบบรูปงานจริง) ───────────
const star = (cx, cy, r, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.44 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="#ffffff" stroke-width="${r * 0.18}" stroke-linejoin="round"/>`;
};

const heart = (cx, cy, r, fill) =>
  `<path d="M ${cx} ${cy + r * 0.82} C ${cx - r * 1.5} ${cy - r * 0.15} ${cx - r * 0.62} ${cy - r * 1.1} ${cx} ${cy - r * 0.3}
      C ${cx + r * 0.62} ${cy - r * 1.1} ${cx + r * 1.5} ${cy - r * 0.15} ${cx} ${cy + r * 0.82} Z"
      fill="${fill}" stroke="#ffffff" stroke-width="${r * 0.2}" stroke-linejoin="round"/>`;

const pencil = (cx, cy, len, rot, fill) => `<g transform="translate(${cx} ${cy}) rotate(${rot})">
  <rect x="${-len / 2}" y="${-len * 0.13}" width="${len * 0.78}" height="${len * 0.26}" rx="${len * 0.1}" fill="${fill}" stroke="#ffffff" stroke-width="${len * 0.05}"/>
  <path d="M ${len * 0.28} ${-len * 0.13} L ${len * 0.5} 0 L ${len * 0.28} ${len * 0.13} Z" fill="#f7c9a3" stroke="#ffffff" stroke-width="${len * 0.05}" stroke-linejoin="round"/>
</g>`;

const books = (cx, cy, s, a, b) => `<g>
  <rect x="${cx - s}" y="${cy}" width="${s * 2}" height="${s * 0.5}" rx="${s * 0.12}" fill="${a}" stroke="#ffffff" stroke-width="${s * 0.12}"/>
  <rect x="${cx - s * 0.82}" y="${cy - s * 0.5}" width="${s * 1.64}" height="${s * 0.5}" rx="${s * 0.12}" fill="${b}" stroke="#ffffff" stroke-width="${s * 0.12}"/>
</g>`;

const sparkle = (cx, cy, r, fill) =>
  `<path d="M ${cx} ${cy - r} Q ${cx + r * 0.16} ${cy - r * 0.16} ${cx + r} ${cy} Q ${cx + r * 0.16} ${cy + r * 0.16} ${cx} ${cy + r}
      Q ${cx - r * 0.16} ${cy + r * 0.16} ${cx - r} ${cy} Q ${cx - r * 0.16} ${cy - r * 0.16} ${cx} ${cy - r} Z" fill="${fill}"/>`;

/** โทนลายสกรีน 2 ชุด (หน้า = ชมพู · หลังของ "2 ด้าน" = ฟ้า) */
const THEME_PINK = { band: "#fbd3e2", bandEdge: "#f6b7ce", a: "#f4899f", b: "#f9c74f", c: "#8ecae6", d: "#f7a1c4" };
const THEME_BLUE = { band: "#cfe9f7", bandEdge: "#a9d6ee", a: "#7ec8e3", b: "#f9c74f", c: "#f4899f", d: "#9bb8e8" };

/**
 * ตำแหน่งสติกเกอร์บนขอบลาย — พิกัดเป็นสัดส่วนของการ์ด (u,v ∈ 0..1)
 * วางเฉพาะบน "แถบขอบ" ให้ตรงกลางเว้นใสตามใบ Layout Design ของร้าน
 */
const STICKERS = [
  ["star", 0.17, 0.062], ["books", 0.36, 0.068], ["pencil", 0.58, 0.06], ["heart", 0.78, 0.065], ["sparkle", 0.9, 0.11],
  ["heart", 0.088, 0.2], ["pencil2", 0.085, 0.34], ["sparkle", 0.1, 0.47], ["star", 0.085, 0.58], ["heart", 0.09, 0.72],
  ["star", 0.915, 0.2], ["sparkle", 0.9, 0.31], ["pencil2", 0.915, 0.44], ["heart", 0.912, 0.6], ["star", 0.905, 0.73],
  ["books", 0.2, 0.925], ["heart", 0.4, 0.935], ["pencil", 0.6, 0.932], ["star", 0.8, 0.93], ["sparkle", 0.12, 0.87],
];

function stickers(x, y, w, h, t, k = 1) {
  const P = (u, v) => [x + u * w, y + v * h];
  const s = w * 0.062 * k;
  return STICKERS.map(([kind, u, v], i) => {
    const [cx, cy] = P(u, v);
    const col = [t.a, t.b, t.c, t.d][i % 4];
    if (kind === "star") return star(cx, cy, s, t.b);
    if (kind === "heart") return heart(cx, cy, s * 0.92, col);
    if (kind === "pencil") return pencil(cx, cy, s * 2.6, -8, col);
    if (kind === "pencil2") return pencil(cx, cy, s * 2.6, 74, col);
    if (kind === "books") return books(cx, cy, s * 0.95, t.c, t.a);
    return sparkle(cx, cy, s * 0.72, t.d);
  }).join("");
}

/**
 * การ์ดใส 1 ใบ (สัดส่วนจริง 65 × 105 มม.)
 *   theme  โทนลายสกรีน · faint = ด้านหลังที่ไม่ได้พิมพ์ (มองทะลุเห็นลายหน้าจาง ๆ กลับด้าน)
 *   hole   เจาะรูมุมบนซ้าย
 */
function acrylicCard(id, x, y, w, h, { theme = THEME_PINK, faint = false, hole = false } = {}) {
  const r = w * 0.085;
  const inset = w * 0.15;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const ir = r * 0.75;
  const holeC = [x + w * 0.135, y + h * 0.052];
  const holeR = w * 0.052;
  /** วงแหวนลาย = สี่เหลี่ยมนอก - สี่เหลี่ยมใน (evenodd) → ตรงกลางโปร่งเห็นบัตรด้านใน */
  const ring = `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r}
      A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r}
      A ${r} ${r} 0 0 1 ${x + r} ${y} Z
    M ${x + inset + ir} ${y + inset} H ${x + inset + iw - ir} A ${ir} ${ir} 0 0 1 ${x + inset + iw} ${y + inset + ir}
      V ${y + inset + ih - ir} A ${ir} ${ir} 0 0 1 ${x + inset + iw - ir} ${y + inset + ih} H ${x + inset + ir}
      A ${ir} ${ir} 0 0 1 ${x + inset} ${y + inset + ih - ir} V ${y + inset + ir} A ${ir} ${ir} 0 0 1 ${x + inset + ir} ${y + inset} Z`;
  const art = `
    <path d="${ring}" fill-rule="evenodd" fill="${theme.band}"/>
    ${stickers(x, y, w, h, theme)}`;
  return `<g>
    <rect x="${x + 5}" y="${y + 9}" width="${w}" height="${h}" rx="${r}" fill="#0f172a" opacity="0.07"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#acrylic)"/>
    <g opacity="${faint ? 0.24 : 1}" ${faint ? `transform="translate(${(2 * x + w).toFixed(1)} 0) scale(-1 1)"` : ""}>${art}</g>
    <rect x="${x + inset}" y="${y + inset}" width="${iw}" height="${ih}" rx="${ir}" fill="none" stroke="#dbeafe" stroke-width="2" stroke-dasharray="9 8"/>
    <path d="M ${x + w * 0.16} ${y + h} L ${x + w * 0.6} ${y} L ${x + w * 0.78} ${y} L ${x + w * 0.34} ${y + h} Z" fill="#ffffff" opacity="0.3" clip-path="url(#clip-${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#a9c9db" stroke-width="2.5"/>
    ${hole ? `<circle cx="${holeC[0]}" cy="${holeC[1]}" r="${holeR}" fill="#f8fafc" stroke="#a9c9db" stroke-width="2.5"/>` : ""}
    <clipPath id="clip-${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  </g>`;
}

const ACRYLIC_DEFS = `
  <linearGradient id="acrylic" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#f2fbff"/><stop offset="0.55" stop-color="#e9f6fc"/><stop offset="1" stop-color="#dcedf6"/>
  </linearGradient>`;

// ── กลุ่ม "สกรีนกี่ด้าน" ──────────────────────────────────────────────
/** สเกลของกลุ่มนี้ — สูง 340 px (65 × 105 มม. สัดส่วนจริง) */
const S_H = 340;
const S_W = (S_H * CARD_MM_W) / CARD_MM_H;

function screenArt(sides) {
  const one = sides === 1;
  const cy = 420;
  const lx = 226;
  const rx = 674;
  const top = cy - S_H / 2;
  const body = `
  ${acrylicCard("f", lx - S_W / 2, top, S_W, S_H, { theme: THEME_PINK })}
  ${acrylicCard("b", rx - S_W / 2, top, S_W, S_H, one ? { theme: THEME_PINK, faint: true } : { theme: THEME_BLUE })}
  ${one ? `<text x="${rx}" y="${cy + 10}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#9fb0bf">ไม่พิมพ์</text>` : ""}
  ${tag(lx, 634, "ด้านหน้า — พิมพ์ลาย", true)}
  ${tag(rx, 634, one ? "ด้านหลัง — ใส ไม่มีลาย" : "ด้านหลัง — พิมพ์ลาย", !one)}
  <g>
    <circle cx="${W / 2}" cy="${cy - 14}" r="84" fill="#ffffff" stroke="${OK}" stroke-width="4"/>
    <text x="${W / 2}" y="${cy + 6}" font-family="${TH}" font-size="88" font-weight="800" text-anchor="middle" fill="${OK}">${sides}</text>
    <text x="${W / 2}" y="${cy + 48}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${SUB}">ด้าน</text>
  </g>`;
  return one
    ? card("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้าด้านเดียว", body,
      "ด้านหลังเป็นอะคริลิคใสไม่มีหมึก — มองทะลุเห็นลายด้านหน้ากลับด้าน",
      "การ์ดใส 6.5 × 10.5 ซม. · ตรงกลางเว้นใสไว้สอดรูป/บัตรได้ตามแบบ", ACRYLIC_DEFS)
    : card("สกรีน 2 ด้าน", "พิมพ์ลายทั้งด้านหน้าและด้านหลัง", body,
      "หน้า-หลังใช้คนละลายได้ · ด้านหลังทึบขึ้น มองทะลุน้อยลง",
      "การ์ดใส 6.5 × 10.5 ซม. · ตรงกลางเว้นใสไว้สอดรูป/บัตรได้ตามแบบ", ACRYLIC_DEFS);
}

// ── กลุ่ม "ตะขอโซ่ไข่ปลา" ─────────────────────────────────────────────
/** สเกลของกลุ่มนี้ — สูง 372 px */
const K_H = 372;
const K_W = (K_H * CARD_MM_W) / CARD_MM_H;
const K_X = 400;
const K_Y = 358;
const HOLE = [K_X + K_W * 0.135, K_Y + K_H * 0.052];

/** จุดบนเส้นเบซิเยร์ระยะเท่า ๆ กัน (เม็ดโซ่ต้องห่างเท่ากันตลอดเส้น) */
function beadsOn(p0, p1, p2, p3, step) {
  const at = (t) => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  const out = [];
  let prev = at(0);
  let acc = 0;
  out.push(prev);
  for (let i = 1; i <= 1200; i++) {
    const p = at(i / 1200);
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    if (acc >= step) { out.push(p); acc = 0; }
    prev = p;
  }
  return out;
}

/** โซ่ไข่ปลา — เม็ดกลมเรียง + ก้านเชื่อมสั้น ๆ ระหว่างเม็ด */
function ballChain(beads, id, r = 10.5) {
  const links = [];
  for (let i = 1; i < beads.length; i++) {
    const [ax, ay] = beads[i - 1];
    const [bx, by] = beads[i];
    links.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="url(#${id}-bar)" stroke-width="${r * 0.5}" stroke-linecap="round"/>`);
  }
  const balls = beads.map(([cx, cy]) => `
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="url(#${id}-ball)"/>
    <circle cx="${(cx - r * 0.3).toFixed(1)}" cy="${(cy - r * 0.34).toFixed(1)}" r="${r * 0.27}" fill="#ffffff" opacity="0.75"/>`).join("");
  return links.join("") + balls;
}

/** หัวล็อกโซ่ (ปลอกโลหะทรงแคปซูล) วางที่จุดบรรจบของสองสาย */
const clasp = (cx, cy, rot, id, len = 62, wdt = 26) => `<g transform="translate(${cx} ${cy}) rotate(${rot})">
  <rect x="${-len / 2}" y="${-wdt / 2}" width="${len}" height="${wdt}" rx="${wdt / 2}" fill="url(#${id}-ball)" stroke="#ffffff" stroke-width="2" stroke-opacity="0.5"/>
  <line x1="${-len * 0.1}" y1="${-wdt * 0.34}" x2="${-len * 0.1}" y2="${wdt * 0.34}" stroke="#ffffff" stroke-width="2" stroke-opacity="0.55"/>
</g>`;

const chainDefs = (id, c) => `
  <radialGradient id="${id}-ball" cx="0.34" cy="0.3" r="0.78">
    <stop offset="0" stop-color="${c.light}"/><stop offset="0.55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.dark}"/>
  </radialGradient>
  <linearGradient id="${id}-bar" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.dark}"/>
  </linearGradient>`;

const SILVER = { light: "#ffffff", mid: "#cbd5e1", dark: "#8194a8" };
const PINK = { light: "#ffe3ee", mid: "#f472a4", dark: "#bd4c7c" };

/** เฉดตัวอย่างจากชาร์ต "ตะขอ C" ของร้าน (มีให้เลือกจริง 23 สีในกลุ่ม "สีตะขอ") */
const SWATCHES = ["#e0343a", "#f0863c", "#f6d43a", "#7cc242", "#3fb59a", "#4aa8e8", "#3f57b5", "#8b6ee0", "#f06fa8", "#111827"];

function hookArt(kind) {
  const id = kind === "color" ? "cch" : "sch";
  const cChain = kind === "color" ? PINK : SILVER;
  const clip = [252, 236];
  const strandA = beadsOn(HOLE, [352, 398], [256, 330], clip, 22);
  const strandB = beadsOn(HOLE, [424, 300], [332, 236], clip, 22);
  const chain = kind === "none" ? "" : `
    ${ballChain(strandA, id)}
    ${ballChain(strandB, id)}
    ${clasp(clip[0] + 16, clip[1] + 6, 34, id)}`;

  const swatchRow = kind === "color" ? SWATCHES.map((c, i) => `
    <circle cx="${478 + i * 26}" cy="302" r="11.5" fill="${c}" stroke="#ffffff" stroke-width="2"/>`).join("") + `
    <text x="${478 + 4.5 * 26}" y="342" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${SUB}">มีให้เลือก 23 สี</text>` : "";

  const noneMark = kind === "none" ? `
    <circle cx="352" cy="330" r="68" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="4"/>
    <line x1="313" y1="291" x2="391" y2="369" stroke="#94a3b8" stroke-width="9" stroke-linecap="round"/>
    <line x1="391" y1="291" x2="313" y2="369" stroke="#94a3b8" stroke-width="9" stroke-linecap="round"/>` : "";

  const head = { z2: ["ตะขอ Z2 โซ่ไข่ปลาสีเงิน", "โซ่ไข่ปลาสีเงิน ร้อยผ่านรูมุมบนของการ์ด"],
    color: ["โซ่ไข่ปลาแบบสี", "โซ่ทั้งเส้นเป็นสีที่เลือก — เลือกเฉดในกลุ่ม “สีตะขอ”"],
    none: ["ไม่รับตะขอ", "การ์ดเจาะรูอย่างเดียว ไม่ใส่โซ่/ตะขอ"] }[kind];

  const statusPill = { z2: ["ฟรี ไม่บวกเพิ่ม", true], color: ["+3 บาท / ชิ้น", true], none: ["ไม่มีอะไหล่", false] }[kind];

  const body = `
  ${acrylicCard("k", K_X, K_Y, K_W, K_H, { theme: THEME_PINK, hole: true })}
  ${chain}
  <circle cx="${HOLE[0]}" cy="${HOLE[1]}" r="${K_W * 0.052}" fill="none" stroke="#8ba9bd" stroke-width="3"/>
  ${noneMark}
  ${swatchRow}
  ${pill(626, 246, statusPill[0], statusPill[1])}
  ${tag(K_X + K_W / 2, 756, "เจาะรูมุมบนไว้ร้อยโซ่")}`;

  const notes = {
    z2: ["โซ่ไข่ปลาสีเงิน (รหัส Z2) — ห้อยกระเป๋า/เป้ หรือเปลี่ยนเป็นพวงกุญแจได้", "เลือกได้เฉพาะการ์ดแบบ “เจาะรู”"],
    color: ["โซ่ไข่ปลา 23 เฉด — เลือกสีในกลุ่ม “สีตะขอ” ที่จะโผล่ขึ้นมาให้เลือกต่อ", "สีจริงอาจเข้ม-อ่อนต่างจากชาร์ตราว 5% ตามล็อตของโรงงาน"],
    none: ["ได้เฉพาะตัวการ์ดที่เจาะรูไว้ ไม่แถมโซ่/ตะขอ", "เอาไปร้อยสายคล้องคอ/ห่วงเองได้ตามใจ"],
  }[kind];

  return card(head[0], head[1], body, notes[0], notes[1], ACRYLIC_DEFS + chainDefs("sch", SILVER) + chainDefs("cch", PINK));
}

// ── รายการภาพ + จุดที่เอาไปเสียบ ─────────────────────────────────────
const JOBS = [
  {
    file: `screen-1side-${VER}.jpg`,
    svg: () => screenArt(1),
    set: [{ group: SCREEN_GROUP, choice: "สกรีน 1 ด้าน", desc: "พิมพ์ลายด้านหน้าด้านเดียว · ด้านหลังใสไม่มีลาย" }],
  },
  {
    file: `screen-2side-${VER}.jpg`,
    svg: () => screenArt(2),
    set: [{ group: SCREEN_GROUP, choice: "สกรีน 2 ด้าน", desc: "พิมพ์ลายทั้งสองด้าน หน้า-หลังคนละลายได้" }],
  },
  {
    file: `hook-z2-silver-${VER}.jpg`,
    svg: () => hookArt("z2"),
    set: [{ group: HOOK_GROUP, choice: "ตะขอ Z2 โซ่ไข่ปลาสีเงิน", desc: "โซ่ไข่ปลาสีเงิน (Z2) ร้อยรูมุมบน ห้อยกระเป๋า/ทำพวงกุญแจได้ — ไม่บวกเพิ่ม" }],
  },
  {
    file: `hook-color-${VER}.jpg`,
    svg: () => hookArt("color"),
    set: [{ group: HOOK_GROUP, choice: "โซ่ไข่ปลาสีเงินแบบสี", desc: "โซ่ไข่ปลาแบบสี ทั้งเส้นเป็นสีที่เลือก — เลือกเฉดได้ 23 สีด้านล่าง" }],
  },
  {
    file: `hook-none-${VER}.jpg`,
    svg: () => hookArt("none"),
    set: [{ group: HOOK_GROUP, choice: "❌ ไม่รับตะขอ", desc: "รับเฉพาะการ์ดเจาะรู ไม่ใส่โซ่/ตะขอ" }],
  },
];

for (const j of JOBS) {
  const buf = await sharp(Buffer.from(j.svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, buf);
  j.local = `${OUT}/${j.file}`;
  /* ครอปกลาง 300–600 ไว้ตรวจว่าย่อเป็นปุ่ม 62×62 แล้วยังแยกออก */
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${j.file}`);
  console.log(`🖼  ${j.file}  ${Math.round(buf.length / 1024)} KB (+ _thumb ครอปกลาง)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log(`\n(ยังไม่เขียน DB — เปิดดูที่ ${OUT} แล้วรันด้วย --write เมื่อภาพผ่านตา)`); process.exit(0); }

// ── อัปโหลด storage + ตั้ง imageSrc/desc + อ่านกลับเทียบ ──────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PUB = (key) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

/* 🔒 ตรวจก่อนเขียน: กลุ่มทั้งสองยังเป็นแกนตารางราคาเดิม + ส่วนต่าง "แบบสี" = +3 ทุกช่วง
   (ตัวเลขนี้โชว์อยู่บนภาพ — ถ้าตารางเปลี่ยนแล้วภาพจะโกหกลูกค้า จึงหยุดทันที) */
const matrices = [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)].filter(Boolean);
for (const m of matrices) {
  const dl = (m.driverLabels ?? []).join("│");
  if (dl !== `${SCREEN_GROUP}│${HOOK_GROUP}`) { console.error("แกนตารางราคาเปลี่ยนไปแล้ว:", dl); process.exit(1); }
  for (const side of ["สกรีน 1 ด้าน", "สกรีน 2 ด้าน"]) {
    const base = m.cells[`${side}│ตะขอ Z2 โซ่ไข่ปลาสีเงิน`];
    const col = m.cells[`${side}│โซ่ไข่ปลาสีเงินแบบสี`];
    const none = m.cells[`${side}│❌ ไม่รับตะขอ`];
    if (!base || !col || !none) { console.error("หาช่องราคาไม่ครบ", side); process.exit(1); }
    base.forEach((v, i) => {
      if (Math.abs(col[i] - v - 3) > 0.001) { console.error(`ส่วนต่างโซ่แบบสีไม่ใช่ +3 (${side} ช่วงที่ ${i + 1}: ${v} → ${col[i]})`); process.exit(1); }
      if (Math.abs(none[i] - v) > 0.001) { console.error(`Z2 ไม่เท่ากับ "ไม่รับตะขอ" (${side} ช่วงที่ ${i + 1})`); process.exit(1); }
    });
  }
}
const nColors = (data.options ?? []).find((o) => o.label === COLOR_GROUP)?.choices?.length ?? 0;
if (nColors !== 23) { console.error(`กลุ่ม "${COLOR_GROUP}" มี ${nColors} สี — ภาพเขียนไว้ 23 สี`); process.exit(1); }

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(j.local), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  j.url = PUB(key);
  console.log("อัปโหลดแล้ว", j.url);
}

const want = [];
const apply = (group, choiceName, url, desc) => {
  const gs = (data.options ?? []).filter((o) => o.label === group);
  if (gs.length !== 1) { console.error(`กลุ่ม "${group}" เจอ ${gs.length} กลุ่ม — ต้องมีกลุ่มเดียว`); process.exit(1); }
  const g = gs[0];
  const c = (g.choices || []).find((c) => c.name === choiceName);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${choiceName}" ในกลุ่ม "${group}"`); process.exit(1); }
  c.imageSrc = url;
  if (desc) c.desc = desc;
  g.display = "cards";
  want.push({ group, choiceName, url, desc });
};
for (const j of JOBS) for (const t of j.set) apply(t.group, t.choice, j.url, t.desc);

data.savedAt = new Date().toISOString(); // ⏱ กันแคชรูป (?v=savedAt)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const w of want) {
  const g = back.data.options.find((o) => o.label === w.group);
  const c = g?.choices?.find((c) => c.name === w.choiceName);
  if (c?.imageSrc !== w.url || c?.desc !== w.desc || g?.display !== "cards") {
    console.error("อ่านกลับไม่ตรง!", w.group, w.choiceName, c?.imageSrc, c?.desc, g?.display); process.exit(1);
  }
}
console.log(`✓ ตั้ง imageSrc + desc ครบ ${want.length} ตัวเลือก (2 กลุ่มเป็นการ์ด) อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
