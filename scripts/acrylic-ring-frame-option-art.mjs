#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่มตัวเลือกของ "Acrylic Ring Frame (สันห่วงอะคริลิคเฟรม)" — id `acrylic-ring-frame`
 * (/products/Acrylic-Ring-Frame)
 *
 *   node scripts/acrylic-ring-frame-option-art.mjs           (วาดลง .cache/acrylic-ring-frame/upload ดูก่อน)
 *   node scripts/acrylic-ring-frame-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตัวสินค้า (จากรูปงานจริง 4 ใบในแกลเลอรี): อะคริลิคใส 2 แผ่นประกบ ร้อย "ห่วงสันสมุด" พลาสติกใส
 * ที่ขอบซ้าย เปิดพลิกได้เหมือนสมุดเล่มจิ๋ว · หน้าปกพิมพ์ UV เต็มแผ่น เจาะช่องโชว์รูป · ห้อยโซ่ไข่ปลา
 *
 * กลุ่มที่วาดให้ (เดิมไม่มีภาพเลยสักใบ):
 *   1. "Add on" 3 ใบ (→ การ์ด)         ชิ้นกลาง · สกรีน 2 ด้าน · อะคริลิคพิเศษ
 *   2. "เพิ่มชิ้นกลาง (อะคริลิคหนา 1.5 มิล)" 2 ใบ   แยกตามช่วงขนาด (แผ่นกลางวาดตามสัดส่วนจริง)
 *   3. "สกรีน 2 ด้าน" 3 ใบ            ชิ้นไหนพิมพ์ทั้งสองหน้า (แผ่นที่เลือกเรืองเหลือง + ป้าย 2 ด้าน)
 *   4. "เพิ่มอะคริลิคพิเศษ" 2 ใบ       ชิ้นหน้า/ชิ้นหลังเปลี่ยนเป็นเนื้อกลิตเตอร์-โฮโลแกรม
 *   5. "รับตะขอไหม" 2 ใบ (→ การ์ด)     มีโซ่ไข่ปลาห้อย vs รูเปล่าไม่ใส่โซ่
 *   6. "ขนาดด้านยาวที่สุด" 1 ใบใช้ร่วมทุกตัวเลือก — อธิบายว่าวัด "ด้านยาวที่สุด" ไม่ใช่แนวทแยง (ตาม terms)
 *   7. "ตะขอโซ่ไข่ปลา" 24 ใบ — ไม่ต้องวาด ใช้ภาพคลังกลาง products/standee-keyring/hookcolor-C*.jpg
 *      (ชื่อตัวเลือกชุดเดียวกับ photo-fram-acrylic เป๊ะ ยืมได้ทั้งชุด)
 *
 * ⚠️ ตารางราคาสินค้านี้ `driverLabels: []` — ชื่อตัวเลือกไม่ใช่คีย์ราคา แต่เป็นเป้า `showWhen` ของกลุ่มลูก
 *    และเป็นชื่อที่ `custom.keepOptions` อ้างถึง → ห้ามเปลี่ยนชื่อกลุ่ม/ชื่อตัวเลือก เติมแค่ imageSrc/desc/display
 * ⚠️ กล่องรูปบนหน้าสินค้าเป็นจัตุรัส (การ์ด 80px · pill 28px · dropdown 44px) — ภาพ 900×900 จึงเห็นเต็มใบ
 *    ไม่โดนครอป แต่ "เล็ก" → ชิ้นงานต้องกินเต็มเฟรม ตัวหนังสือเท่าที่จำเป็น ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "acrylic-ring-frame";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

/** ภาพคลังกลาง (โซ่ไข่ปลา) — ชุดเดียวกับที่ standee-keyring/photo-fram-acrylic ใช้ */
const LIB = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/standee-keyring";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const HI = "#f59e0b"; // สีเน้น "ชิ้นที่กำลังพูดถึง"

// ── โครงการ์ดร่วมของภาพตัวเลือกทั้งร้าน ────────────────────────────────
const card = (title, subtitle, body, note = "", defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}${COMMON_DEFS}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  ${subtitle ? `<text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>` : ""}
  ${body}
  ${note ? `<text x="${W / 2}" y="${H - 44}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${note}</text>` : ""}
</svg>`;

const COMMON_DEFS = `
  <linearGradient id="acr" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f2fbff"/><stop offset="1" stop-color="#d7ecf6"/>
  </linearGradient>
  <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#dbeef8"/><stop offset="1" stop-color="#a9cfe0"/>
  </linearGradient>
  <linearGradient id="print" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="#cfe9fb"/><stop offset="0.55" stop-color="#bfe0f7"/><stop offset="1" stop-color="#a9d8f2"/>
  </linearGradient>
  <linearGradient id="glit" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffe3f1"/><stop offset="0.3" stop-color="#e6dcff"/>
    <stop offset="0.62" stop-color="#d6f3ff"/><stop offset="1" stop-color="#fff2cc"/>
  </linearGradient>`;

/** ป้ายกำกับชิ้น — วางข้างแผ่นที่กำลังพูดถึง */
const tag = (cx, cy, text, on = false) => {
  const w = text.length * 13 + 42;
  return `
  <rect x="${cx - w / 2}" y="${cy - 22}" width="${w}" height="44" rx="22" fill="${on ? "#fff7ed" : "#f1f5f9"}" stroke="${on ? HI : "#cbd5e1"}" stroke-width="${on ? 3 : 2}"/>
  <text x="${cx}" y="${cy + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${on ? "#b45309" : SUB}">${text}</text>`;
};

/** ตราวงกลม "2 ด้าน" — ตัวเลขใหญ่ + คำว่าด้านอยู่ในวงเดียวกัน จะได้ไม่ทับขอบวง */
const badge2 = (cx, cy, r = 72) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff7ed" stroke="${HI}" stroke-width="6"/>
  <text x="${cx}" y="${cy + 6}" font-family="${TH}" font-size="${r * 0.82}" font-weight="800" text-anchor="middle" fill="#b45309">2</text>
  <text x="${cx}" y="${cy + r * 0.62}" font-family="${TH}" font-size="${r * 0.34}" font-weight="700" text-anchor="middle" fill="#b45309">ด้าน</text>`;

const star = (cx, cy, r, fill, op = 1) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.44 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" opacity="${op}"/>`;
};

/** สุ่มแบบมีเมล็ด — รันกี่ครั้งเกล็ดกลิตเตอร์ก็ตกที่เดิม */
const rnd = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ── ชิ้นงาน: แผ่นอะคริลิคหนึ่งแผ่น ─────────────────────────────────────
/**
 * แผ่นเดียวของสันห่วงเฟรม — วาดจาก "สัน" ที่ขอบซ้าย (x = ox) ยื่นไปทางขวา
 * base: "clear" อะคริลิคใส · "glitter" อะคริลิคพิเศษ (กลิตเตอร์/โฮโล) — เนื้อแผ่น
 * printed = มีลายพิมพ์ UV บนแผ่นนี้ (ลายวางทับเนื้อ จะได้เห็นว่าเนื้อพิเศษยังพิมพ์ลายได้)
 * hole = เจาะรูห้อยโซ่มุมบนขวา (เฉพาะแผ่นหน้า)
 */
function sheet({ ox, oy, w, h, base = "clear", printed = false, dim = false, glow = false, halo = glow, twoSide = false, hole = false, seed = 7 }) {
  const x = ox;
  const y = oy - h / 2;
  const r = Math.min(26, w * 0.09);
  const op = dim ? 0.62 : 1;

  /* เนื้อแผ่น */
  /* อะคริลิคใสวาดโปร่งจริง ๆ — แผ่นที่ซ้อนอยู่หลังยังมองทะลุเห็นได้ (สำคัญตอนดึงแผ่นใสออกมาหน้าสุด) */
  let face = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#acr)" opacity="0.72"/>`;
  if (base === "glitter") {
    const g = rnd(seed);
    let bits = "";
    for (let i = 0; i < 240; i++) {
      bits += `<circle cx="${(x + g() * w).toFixed(1)}" cy="${(y + g() * h).toFixed(1)}" r="${(1.6 + g() * 3.4).toFixed(1)}" fill="${["#ffffff", "#fde68a", "#f9a8d4", "#a5b4fc", "#99f6e4"][Math.floor(g() * 5)]}" opacity="${(0.5 + g() * 0.5).toFixed(2)}"/>`;
    }
    face = `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#glit)"/>
      <clipPath id="gl${seed}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
      <g clip-path="url(#gl${seed})">${bits}</g>`;
  }

  if (printed) {
    /* ลายพิมพ์ UV — แถบบน + ดาว 3 ดวง + ช่องโชว์รูปทรงโค้ง + แถบเขียวล่าง (ตามรูปงานจริง) */
    const wx = x + w * 0.2;
    const wy = y + h * 0.26;
    const ww = w * 0.6;
    const wh = h * 0.5;
    face += `
      <g opacity="${base === "glitter" ? 0.9 : 1}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#print)" opacity="${base === "glitter" ? 0.55 : 1}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h * 0.17}" rx="${r}" fill="#ffffff" opacity="0.75"/>
      <rect x="${x}" y="${y + h * 0.86}" width="${w}" height="${h * 0.14}" rx="${r}" fill="#7fd8d0" opacity="0.85"/>
      ${star(x + w * 0.34, y + h * 0.085, w * 0.05, "#fbbf24")}
      ${star(x + w * 0.5, y + h * 0.085, w * 0.05, "#fbbf24")}
      ${star(x + w * 0.66, y + h * 0.085, w * 0.05, "#fbbf24")}
      <path d="M ${wx} ${wy + wh} L ${wx} ${wy + wh * 0.42} Q ${wx + ww / 2} ${wy - wh * 0.16} ${wx + ww} ${wy + wh * 0.42} L ${wx + ww} ${wy + wh} Z"
        fill="#ffffff" stroke="#2f5f9e" stroke-width="${w * 0.014}"/>
      <clipPath id="win${seed}"><path d="M ${wx} ${wy + wh} L ${wx} ${wy + wh * 0.42} Q ${wx + ww / 2} ${wy - wh * 0.16} ${wx + ww} ${wy + wh * 0.42} L ${wx + ww} ${wy + wh} Z"/></clipPath>
      <g clip-path="url(#win${seed})">
        <rect x="${wx}" y="${wy - wh * 0.2}" width="${ww}" height="${wh * 1.3}" fill="#eef7fd"/>
        <image href="${MASCOT.uri}" x="${wx + ww * 0.06}" y="${wy + wh * 0.02}" width="${ww * 0.88}" height="${wh * 0.96}" preserveAspectRatio="xMidYMid meet"/>
      </g>
      </g>`;
  }

  /* ขอบแผ่น + แสงสะท้อนอะคริลิค */
  const edge = `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none"
      stroke="${glow ? HI : "#8fb8cc"}" stroke-width="${glow ? 7 : 3}"/>
    <path d="M ${x + w * 0.06} ${y + h} L ${x + w * 0.42} ${y} L ${x + w * 0.58} ${y} L ${x + w * 0.22} ${y + h} Z" fill="#ffffff" opacity="0.16"/>`;

  /* พิมพ์สองหน้า = มีเงาแผ่นหลังโผล่หลังแผ่นนี้ + ป้ายกลม "2 ด้าน" */
  const back = twoSide
    ? `<rect x="${x + 16}" y="${y + 16}" width="${w}" height="${h}" rx="${r}" fill="url(#print)" opacity="0.5" stroke="#8fb8cc" stroke-width="2"/>`
    : "";

  const hl = halo
    ? `<rect x="${x - 13}" y="${y - 13}" width="${w + 26}" height="${h + 26}" rx="${r + 13}" fill="none" stroke="${HI}" stroke-width="4" stroke-dasharray="14 10" opacity="0.85"/>`
    : "";

  const punch = hole
    ? `<circle cx="${x + w * 0.9}" cy="${y + h * 0.055}" r="${w * 0.038}" fill="#ffffff" stroke="#7ba3b8" stroke-width="2.5"/>`
    : "";

  return `<g opacity="${op}">${back}${face}${edge}${punch}${hl}</g>`;
}

/** ห่วงสันสมุดพลาสติกใส 5 ห่วง เกาะขอบซ้ายของเล่ม (วาดทับแผ่นทุกใบ) */
function rings(ox, oy, h, n = 5, s = 1) {
  const rw = 62 * s;
  const rh = 30 * s;
  let out = "";
  for (let i = 0; i < n; i++) {
    const cy = oy - h / 2 + (h / (n + 1)) * (i + 1);
    out += `
      <rect x="${ox - rw * 0.42}" y="${cy - rh / 2}" width="${rw}" height="${rh}" rx="${rh / 2}" fill="url(#ring)" stroke="#8fb8cc" stroke-width="2.2"/>
      <rect x="${ox - rw * 0.42 + rw * 0.24}" y="${cy - rh * 0.24}" width="${rw * 0.5}" height="${rh * 0.48}" rx="${rh * 0.24}" fill="#eef8fd" stroke="#a9cfe0" stroke-width="1.6"/>
      <rect x="${ox - rw * 0.34}" y="${cy - rh * 0.34}" width="${rw * 0.2}" height="${rh * 0.24}" rx="${rh * 0.12}" fill="#ffffff" opacity="0.9"/>`;
  }
  return out;
}

/** โซ่ไข่ปลา — เม็ดกลมเรียงตามเส้นโค้ง (จุดเริ่ม = รูบนแผ่น) */
function chain(x0, y0, pts, color = "#cfd8dd", edge = "#9aa8ae") {
  const bead = (x, y, r) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${color}" stroke="${edge}" stroke-width="1.6"/>
     <circle cx="${(x - r * 0.28).toFixed(1)}" cy="${(y - r * 0.3).toFixed(1)}" r="${r * 0.3}" fill="#ffffff" opacity="0.85"/>`;
  let out = "";
  let px = x0;
  let py = y0;
  for (const [dx, dy] of pts) {
    px += dx;
    py += dy;
    out += bead(px, py, 11);
  }
  return out;
}

// ── ท่ากล้องร่วม: เล่มกางพัด 3 แผ่น (หน้า/กลาง/หลัง) ────────────────────
const SX = 262; // สันห่วง (แกนหมุน)
const SY = 492;
const SW = 356; // กว้างแผ่น
const SH = 396; // สูงแผ่น
const FAN = [-15, 0, 15]; // องศาแผ่นหน้า/กลาง/หลัง
const PULL = 82; // แผ่นที่กำลังพูดถึงถูก "ดึงออกจากสัน" มาทางขวา จะได้ไม่โดนแผ่นอื่นบัง

/**
 * เล่ม 3 แผ่นกางพัดจากสัน — ระบุว่าจะเน้นแผ่นไหน (0 หน้า · 1 กลาง · 2 หลัง)
 * kinds: "print" ปกพิมพ์ลาย · "clear" ใสเปล่า · "glitter" เนื้อพิเศษ (+ลายพิมพ์)
 * แผ่นที่เน้นวาดทีหลังสุดและเลื่อนออกจากสัน — ไม่งั้นแผ่นหน้าบังแผ่นกลาง/หลังจนดูไม่ออก
 */
function book({ focus = -1, kinds = ["print", "clear", "clear"], twoSide = -1, labels = true, midScale = 1, withChain = false, dimOthers = true, midStack = 1 }) {
  const one = (i, pulled, ang = FAN[i], pull = PULL, halo) => {
    const scale = i === 1 ? midScale : 1;
    return `<g transform="rotate(${ang} ${SX} ${SY})${pulled ? ` translate(${pull} 0)` : ""}">${sheet({
      ox: SX,
      oy: SY,
      w: SW * scale,
      h: SH * scale,
      base: kinds[i] === "glitter" ? "glitter" : "clear",
      printed: kinds[i] === "glitter" || kinds[i] === "print",
      dim: dimOthers && focus >= 0 && focus !== i,
      glow: focus === i,
      halo: halo ?? focus === i,
      twoSide: twoSide === i,
      hole: i === 0,
      seed: 11 + i * 7,
    })}</g>`;
  };
  let out = `<ellipse cx="${SX + SW * 0.55}" cy="${SY + SH * 0.66}" rx="${SW * 0.62}" ry="32" fill="#0f172a" opacity="0.08"/>`;
  for (const i of [2, 1, 0]) if (i !== focus) out += one(i, false); // แผ่นหลัง → แผ่นหน้า
  out += rings(SX, SY, SH);
  /* แผ่นที่เน้น อยู่บนสุดและเลื่อนพ้นสัน · midStack > 1 = โชว์แผ่นกลางหลายแผ่นซ้อน (ใส่ได้ถึง 5) */
  if (focus === 1 && midStack > 1) {
    for (let k = 0; k < midStack; k++) out += one(1, true, -9 + (18 / (midStack - 1)) * k, PULL + k * 26, k === midStack - 1);
  } else if (focus >= 0) out += one(focus, true);
  if (withChain) {
    /* โซ่ห้อยจากรูมุมบนขวาของแผ่นหน้า (หมุนตามแผ่นหน้า −15°) */
    const a = (FAN[0] * Math.PI) / 180;
    const hx = SX + SW * 0.9;
    const hy = SY - SH / 2 + SH * 0.055;
    const cx = SX + (hx - SX) * Math.cos(a) - (hy - SY) * Math.sin(a);
    const cy = SY + (hx - SX) * Math.sin(a) + (hy - SY) * Math.cos(a);
    out += chain(cx, cy, [
      [16, -18], [20, -16], [22, -10], [22, -2], [20, 8], [16, 16], [8, 22], [-2, 24], [-12, 22], [-20, 16], [-24, 8], [-24, -2],
    ]);
  }
  if (labels) {
    const lab = ["ชิ้นหน้า", "ชิ้นกลาง", "ชิ้นหลัง"];
    const at = [
      [790, SY - 208],
      [790, SY],
      [790, SY + 208],
    ];
    for (let i = 0; i < 3; i++) out += tag(at[i][0], at[i][1], lab[i], focus === i);
  }
  return out;
}

// ── ภาพทั้งหมด ────────────────────────────────────────────────────────
const ART = [];
const push = (file, svg) => ART.push({ file, svg });

/* 1) Add on — 3 ใบ (โชว์เป็นการ์ด 80px ชิ้นงานต้องกินเต็มเฟรม) */
push(
  `addon-middle-${VER}.jpg`,
  card(
    "เพิ่มชิ้นกลาง",
    "แทรกแผ่นอะคริลิคเพิ่มระหว่างปกหน้า-ปกหลัง (ใส่ได้สูงสุด 5 แผ่น)",
    book({ focus: 1, kinds: ["print", "clear", "clear"], dimOthers: false, midStack: 3 }),
    "พลิกดูได้หลายหน้าเหมือนสมุดเล่มจิ๋ว"
  )
);
push(
  `addon-2side-${VER}.jpg`,
  card(
    "สกรีน 2 ด้าน",
    "แผ่นที่เลือกพิมพ์ลายทั้งหน้าและหลัง พลิกอีกด้านก็ยังมีลาย",
    book({ focus: 0, kinds: ["print", "clear", "clear"], twoSide: 0, labels: false }) + badge2(796, SY + 232),
    "ไม่เลือก = พิมพ์ด้านเดียว มองทะลุเห็นลายกลับด้าน"
  )
);
push(
  `addon-special-${VER}.jpg`,
  card(
    "อะคริลิคพิเศษ",
    "เปลี่ยนเนื้อแผ่นจากใสเป็นกลิตเตอร์ / โฮโลแกรม / สี — เลือกได้ 44 เฉด",
    book({ focus: 0, kinds: ["glitter", "clear", "clear"], labels: false }),
    "*แผ่นกลางใช้อะคริลิคพิเศษไม่ได้"
  )
);

/* 2) เพิ่มชิ้นกลาง — 2 ช่วงขนาด (แผ่นกลางวาดตามสัดส่วนจริงของช่วง) */
for (const m of [
  { file: `mid-5-55-${VER}.jpg`, title: "แผ่นกลาง 5 – 5.5 ซม.", badge: "5–5.5", scale: 0.86 },
  { file: `mid-56-65-${VER}.jpg`, title: "แผ่นกลาง 5.6 – 6.5 ซม.", badge: "5.6–6.5", scale: 1 },
]) {
  push(
    m.file,
    card(
      m.title,
      "แผ่นแทรกกลางเล่ม — เลือกช่วงเดียวกับขนาดชิ้นงานที่สั่ง",
      book({ focus: 1, kinds: ["print", "clear", "clear"], midScale: m.scale, labels: false }) +
        tag(150, SY + 250, `${m.badge} ซม.`, true),
      "อะคริลิคใส หนา 1.5 มิล · ใส่ได้สูงสุด 5 แผ่น"
    )
  );
}

/* 3) สกรีน 2 ด้าน — เลือกได้ว่าแผ่นไหนพิมพ์สองหน้า */
for (const s of [
  { file: `2side-front-${VER}.jpg`, focus: 0, name: "ชิ้นหน้า" },
  { file: `2side-back-${VER}.jpg`, focus: 2, name: "ชิ้นหลัง" },
  { file: `2side-middle-${VER}.jpg`, focus: 1, name: "ชิ้นกลาง" },
]) {
  const kinds = ["print", "clear", "clear"];
  kinds[s.focus] = "print";
  push(
    s.file,
    card(
      `สกรีน 2 ด้าน — ${s.name}`,
      "แผ่นที่เลือกพิมพ์ลายทั้งด้านหน้าและด้านหลัง",
      book({ focus: s.focus, kinds, twoSide: s.focus }) + badge2(120, SY + 246),
      "ติ๊กได้หลายชิ้น · ชิ้นกลางคิดตามจำนวนแผ่นที่ใส่"
    )
  );
}

/* 4) เพิ่มอะคริลิคพิเศษ — ชิ้นหน้า/ชิ้นหลัง */
for (const s of [
  { file: `special-front-${VER}.jpg`, focus: 0, name: "ชิ้นหน้า" },
  { file: `special-back-${VER}.jpg`, focus: 2, name: "ชิ้นหลัง" },
]) {
  const kinds = ["print", "clear", "clear"];
  kinds[s.focus] = "glitter";
  push(
    s.file,
    card(
      `อะคริลิคพิเศษ — ${s.name}`,
      "เปลี่ยนเนื้อแผ่นนี้เป็นกลิตเตอร์ / โฮโลแกรม / สี",
      book({ focus: s.focus, kinds }),
      "*แผ่นกลางใช้อะคริลิคพิเศษไม่ได้"
    )
  );
}

/* 5) รับตะขอไหม — โซ่ห้อย vs รูเปล่า */
push(
  `hook-yes-${VER}.jpg`,
  card(
    "รับตะขอ",
    "แถมโซ่ไข่ปลาสีเงินฟรี ร้อยรูมุมบน ห้อยกระเป๋า/กุญแจได้เลย",
    book({ kinds: ["print", "clear", "clear"], labels: false, withChain: true }),
    "เปลี่ยนเป็นโซ่สีอื่นได้ 23 สี (+฿3)"
  )
);
push(
  `hook-no-${VER}.jpg`,
  card(
    "ไม่รับตะขอ",
    "ได้เฉพาะตัวเฟรม เจาะรูไว้ให้ ใส่โซ่/ห่วงเองทีหลังได้",
    book({ kinds: ["print", "clear", "clear"], labels: false }) +
      (() => {
        const a = (FAN[0] * Math.PI) / 180;
        const hx = SX + SW * 0.9;
        const hy = SY - SH / 2 + SH * 0.055;
        const cx = SX + (hx - SX) * Math.cos(a) - (hy - SY) * Math.sin(a);
        const cy = SY + (hx - SX) * Math.sin(a) + (hy - SY) * Math.cos(a);
        return `
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="54" fill="none" stroke="${SUB}" stroke-width="5" stroke-dasharray="12 10"/>
          <text x="${(cx + 96).toFixed(1)}" y="${(cy - 62).toFixed(1)}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${SUB}">รูเปล่า</text>`;
      })(),
    "ไม่มีโซ่มาให้"
  )
);

/* 6) ขนาดด้านยาวที่สุด — ภาพเดียวใช้ร่วมทุกตัวเลือก (อธิบายวิธีวัดตาม terms) */
push(
  `size-rule-${VER}.jpg`,
  (() => {
    /* ทรงไดคัทบ้าน (แบบรูปงานจริง) — ด้านยาวที่สุดคือความสูงรวมหลังคา */
    const bx = 250;
    const by = 250;
    const bw = 400;
    const bh = 470;
    const roof = 150;
    const shape = `M ${bx} ${by + roof} L ${bx + bw / 2} ${by} L ${bx + bw} ${by + roof} L ${bx + bw} ${by + bh} L ${bx} ${by + bh} Z`;
    return card(
      "วัดจาก “ด้านที่ยาวที่สุด”",
      "ขนาดที่เลือก = ด้านยาวที่สุดของชิ้นงาน (ไม่วัดแนวทแยง)",
      `
      <path d="${shape}" fill="url(#print)" stroke="#8fb8cc" stroke-width="4"/>
      <path d="M ${bx + bw * 0.18} ${by + roof + 60} h ${bw * 0.64} v ${bh * 0.5} h ${-bw * 0.64} Z" fill="#ffffff" opacity="0.9" stroke="#2f5f9e" stroke-width="4"/>
      <image href="${MASCOT.uri}" x="${bx + bw * 0.24}" y="${by + roof + 74}" width="${bw * 0.52}" height="${bh * 0.44}" preserveAspectRatio="xMidYMid meet"/>
      ${rings(bx, by + roof + bh * 0.42, bh * 0.62, 4, 0.8)}

      <!-- ลูกศรด้านยาวที่สุด (แนวตั้ง) -->
      <line x1="${bx + bw + 70}" y1="${by}" x2="${bx + bw + 70}" y2="${by + bh}" stroke="${OK}" stroke-width="5"/>
      <line x1="${bx + bw + 50}" y1="${by}" x2="${bx + bw + 90}" y2="${by}" stroke="${OK}" stroke-width="5"/>
      <line x1="${bx + bw + 50}" y1="${by + bh}" x2="${bx + bw + 90}" y2="${by + bh}" stroke="${OK}" stroke-width="5"/>
      <rect x="${bx + bw + 20}" y="${by + bh / 2 - 34}" width="146" height="68" rx="18" fill="#ecfeff" stroke="${OK}" stroke-width="3"/>
      <text x="${bx + bw + 93}" y="${by + bh / 2 + 14}" font-family="${TH}" font-size="34" font-weight="800" text-anchor="middle" fill="${OK}">ยาวสุด</text>

      <!-- แนวทแยงที่ไม่ใช้วัด -->
      <line x1="${bx + 24}" y1="${by + bh - 24}" x2="${bx + bw - 24}" y2="${by + roof + 24}" stroke="#ef4444" stroke-width="5" stroke-dasharray="16 12"/>
      <circle cx="${bx + bw * 0.9}" cy="${by + roof + bh * 0.12}" r="46" fill="#fee2e2" stroke="#ef4444" stroke-width="5"/>
      <path d="M ${bx + bw * 0.9 - 20} ${by + roof + bh * 0.12 - 20} l 40 40 M ${bx + bw * 0.9 + 20} ${by + roof + bh * 0.12 - 20} l -40 40" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/>`,
      "แนะนำไม่เกิน 10 ซม. · สกรีนชิดขอบงานไม่ได้"
    );
  })()
);

// ── เรนเดอร์ ──────────────────────────────────────────────────────────
const built = [];
for (const a of ART) {
  const buf = await sharp(Buffer.from(a.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${a.file}`, buf);
  /* ตรวจว่าที่ 80px (การ์ด) ยังดูออกว่าเป็นอะไร */
  await sharp(buf).resize(80, 80).resize(320, 320, { kernel: "nearest" }).toFile(`${OUT}/_thumb-${a.file}`);
  built.push({ ...a, buf });
  console.log(`🖼  ${OUT}/${a.file}  ${Math.round(buf.length / 1024)} KB  (+ _thumb ย่อ 80px)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)");
  process.exit(0);
}

// ── อัปโหลด + เขียน options ───────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const a of built) {
  const key = `products/${PRODUCT_ID}/${a.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, a.buf, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.error("อัปโหลดพัง", key, error);
    process.exit(1);
  }
  url[a.file] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", url[a.file]);
}

/** แผนที่ กลุ่ม → { ชื่อตัวเลือก: {imageSrc, desc} } + ทรงแสดงผลที่ต้องการ */
const PLAN = {
  "Add on": {
    display: "cards",
    choices: {
      "ชิ้นกลาง": { img: url[`addon-middle-${VER}.jpg`], desc: "แทรกแผ่นอะคริลิคใสเพิ่มกลางเล่ม พลิกดูได้หลายหน้า (สูงสุด 5 แผ่น)" },
      "สกรีน 2 ด้าน": { img: url[`addon-2side-${VER}.jpg`], desc: "พิมพ์ลายทั้งด้านหน้าและด้านหลังของแผ่นที่เลือก" },
      "อะคริลิคพิเศษ": { img: url[`addon-special-${VER}.jpg`], desc: "เปลี่ยนเนื้อแผ่นเป็นกลิตเตอร์ / โฮโลแกรม / สี (แผ่นกลางใช้ไม่ได้)" },
    },
  },
  "เพิ่มชิ้นกลาง (อะคริลิคหนา 1.5 มิล)": {
    choices: {
      "ขนาด 5-5.5 cm": { img: url[`mid-5-55-${VER}.jpg`] },
      "ขนาด 5.6-6.5 cm": { img: url[`mid-56-65-${VER}.jpg`] },
    },
  },
  "สกรีน 2 ด้าน": {
    choices: {
      "ชิ้นหน้า": { img: url[`2side-front-${VER}.jpg`] },
      "ชิ้นหลัง": { img: url[`2side-back-${VER}.jpg`] },
      "ชิ้นกลาง": { img: url[`2side-middle-${VER}.jpg`] },
    },
  },
  "เพิ่มอะคริลิคพิเศษ": {
    choices: {
      "ชิ้นหน้า": { img: url[`special-front-${VER}.jpg`] },
      "ชิ้นหลัง": { img: url[`special-back-${VER}.jpg`] },
    },
  },
  "รับตะขอไหม": {
    display: "cards",
    choices: {
      "รับตะขอ": { img: url[`hook-yes-${VER}.jpg`], desc: "แถมโซ่ไข่ปลาสีเงินฟรี · เปลี่ยนเป็นสีอื่นได้ 23 สี (+฿3)" },
      "ไม่รับตะขอ": { img: url[`hook-no-${VER}.jpg`], desc: "ได้เฉพาะตัวเฟรม เจาะรูไว้ให้ ใส่โซ่เองทีหลังได้" },
    },
  },
};

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) {
  console.error(readErr);
  process.exit(1);
}
const data = row.data;
const options = data.options ?? [];

for (const [label, plan] of Object.entries(PLAN)) {
  const g = options.find((o) => o.label === label);
  if (!g) {
    console.error(`ไม่เจอกลุ่ม "${label}"`);
    process.exit(1);
  }
  if (plan.display) g.display = plan.display;
  const names = (g.choices ?? []).map((c) => c.name);
  for (const n of Object.keys(plan.choices)) {
    if (!names.includes(n)) {
      console.error(`กลุ่ม "${label}" ไม่มีตัวเลือก "${n}" (ชื่ออาจถูกแก้)`, names);
      process.exit(1);
    }
  }
  g.choices = g.choices.map((c) => {
    const p = plan.choices[c.name];
    return p ? { ...c, imageSrc: p.img, ...(p.desc ? { desc: p.desc } : {}) } : c;
  });
}

/* กลุ่มขนาด — ภาพวิธีวัดใบเดียวกันทุกตัวเลือก (แกลเลอรีจึงเพิ่มแค่รูปเดียว) */
const sizeG = options.find((o) => o.label === "ขนาดด้านยาวที่สุด");
if (!sizeG) {
  console.error('ไม่เจอกลุ่ม "ขนาดด้านยาวที่สุด"');
  process.exit(1);
}
sizeG.choices = sizeG.choices.map((c) => ({ ...c, imageSrc: url[`size-rule-${VER}.jpg`] }));

/* กลุ่มโซ่ไข่ปลา — ยืมภาพคลังกลางชุดเดียวกับ photo-fram-acrylic / standee-keyring */
const hookG = options.find((o) => o.label === "ตะขอโซ่ไข่ปลา");
if (!hookG) {
  console.error('ไม่เจอกลุ่ม "ตะขอโซ่ไข่ปลา"');
  process.exit(1);
}
hookG.choices = hookG.choices.map((c) => {
  if (c.name === "ตะขอ Z2 โซ่ไข่ปลาสีเงิน") return { ...c, imageSrc: `${LIB}/hook-Z2-v6.jpg` };
  const code = (c.name.match(/^C\d+/) || [])[0];
  if (!code) {
    console.error("ตัวเลือกโซ่ที่ยังไม่มีภาพในคลัง:", c.name);
    process.exit(1);
  }
  return { ...c, imageSrc: `${LIB}/hookcolor-${code}-v6.jpg` };
});

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) {
  console.error("update พัง/0 แถว", updErr);
  process.exit(1);
}

// ── อ่านกลับมาเทียบ (อย่าเชื่อว่าไม่ error = สำเร็จ) ────────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bo = back.data.options ?? [];
let n = 0;
for (const [label, plan] of Object.entries(PLAN)) {
  const g = bo.find((o) => o.label === label);
  if (plan.display && g?.display !== plan.display) {
    console.error("display ไม่ตรง", label, g?.display);
    process.exit(1);
  }
  for (const [name, p] of Object.entries(plan.choices)) {
    const c = g?.choices?.find((x) => x.name === name);
    if (c?.imageSrc !== p.img || (p.desc && c?.desc !== p.desc)) {
      console.error("อ่านกลับตัวเลือกไม่ตรง!", label, name, c);
      process.exit(1);
    }
    n++;
  }
}
const bs = bo.find((o) => o.label === "ขนาดด้านยาวที่สุด");
if (bs.choices.some((c) => c.imageSrc !== url[`size-rule-${VER}.jpg`])) {
  console.error("กลุ่มขนาดยังมีตัวที่ภาพไม่ตรง");
  process.exit(1);
}
const bh = bo.find((o) => o.label === "ตะขอโซ่ไข่ปลา");
if (bh.choices.some((c) => !c.imageSrc?.startsWith(LIB))) {
  console.error("กลุ่มโซ่ยังมีตัวที่ไม่มีภาพคลัง");
  process.exit(1);
}
/* กันเผลอ: กลุ่ม/ตัวเลือกที่เป็นเป้า showWhen และ custom.keepOptions ต้องอยู่ครบเหมือนเดิม */
for (const o of bo) {
  if (!o.showWhen) continue;
  const parent = bo.find((x) => x.label === o.showWhen.label);
  if (!parent) {
    console.error("showWhen ชี้กลุ่มที่หายไป!", o.label, o.showWhen);
    process.exit(1);
  }
  for (const nm of o.showWhen.choices ?? []) {
    if (!parent.choices.some((c) => c.name === nm)) {
      console.error("showWhen ชี้ตัวเลือกที่หายไป!", o.label, nm);
      process.exit(1);
    }
  }
}
for (const k of back.data.custom?.keepOptions ?? []) {
  if (!bo.some((o) => o.label === k)) {
    console.error("custom.keepOptions ชี้กลุ่มที่หายไป!", k);
    process.exit(1);
  }
}
console.log(
  `✓ ภาพวาดใหม่ ${built.length} ใบ · ตั้งให้ ${n} ตัวเลือก + กลุ่มขนาด ${bs.choices.length} ตัว + โซ่ ${bh.choices.length} สี (คลังกลาง) · savedAt =`,
  back.data.savedAt
);
