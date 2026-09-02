#!/usr/bin/env node
/**
 * ภาพจำลองตัวเลือกของสินค้า "Photo Fram Acrylic" (กรอบใส่รูปอะคริลิค)
 *
 *   node scripts/photo-frame-acrylic-art.mjs [--out=<dir>]
 *
 * ตัวสินค้าคือแผ่นอะคริลิคไดคัทเป็น "กรอบ" ขอบหยัก เจาะช่องตรงกลาง แล้วสอดรูป/โฟโต้การ์ดเข้าทางด้านบน
 * (ดูงานจริงในแกลเลอรีของสินค้า)
 *
 * 🎨 สไตล์ที่ผู้ใช้เคาะ (1 ก.ย. 69 — เสนอ 2 แบบแล้วเลือกแบบนี้): เรนเดอร์เหมือนภาพถ่ายสินค้า
 *    แผ่นอะคริลิคมีความหนา (เห็นสันข้าง) · เงาตกกระทบพื้น · ผิวเงาสะท้อนแสงทแยง ·
 *    เอียง 2-3 องศาให้ดูมีชีวิต · พื้นหลังไล่เฉดครีมแบบฉากสตูดิโอ
 *    (แบบที่ไม่เอา = ไดอะแกรมเส้นแบนพื้นเทาฟ้า — อ่านง่ายตอนย่อแต่ดูเป็น "ภาพอธิบาย" ไม่ใช่ภาพสินค้า)
 *
 * ⚠️ ห้ามใส่หัวข้อ/คำอธิบายลงในรูป (ผู้ใช้ทัก 1 ก.ย. 69) — การ์ดตัวเลือกหน้าร้านย่อรูปเหลือ 48px
 *    (`h-12 w-12` ใน ProductDetail) ตัวหนังสือในรูปเลยอ่านไม่ออก แถมซ้ำกับชื่อ+desc ที่การ์ดพิมพ์ให้อยู่แล้ว
 *    รูปต้องมีแต่ "ตัวงาน" วางเต็มกรอบ · ป้ายตัวเลขเก็บไว้เฉพาะภาพที่ขาดแล้วดูไม่รู้เรื่อง (ขนาด/ฐาน)
 *    แล้วเขียนตัวใหญ่ ๆ เพราะกดที่การ์ดแล้วแกลเลอรีจะเด้งรูปเต็มให้ดู
 *
 * ได้ 12 ภาพ ให้ scripts/photo-frame-acrylic-build.mts --write อัปขึ้น Supabase Storage:
 *   type-keyring | type-standee    กลุ่ม "แบบ"
 *   mat-clear    | mat-special     กลุ่ม "ประเภทเนื้ออะคริลิค" (= แกนราคาของตาราง 2 คอลัมน์)
 *   size-add                       กลุ่มเพิ่มขนาดเกิน 6 ซม. (ซม. ละ 15 บาท)
 *   screen-1side | screen-2side    กลุ่ม "สกรีนกี่ด้าน"
 *   base-3 … base-8               กลุ่ม "ขนาดฐาน" (เฉพาะแบบสแตนดี้ · สเกลจริงเทียบกันได้)
 *   base-plain   | base-printed    กลุ่ม "ฐาน" (ใส / สกรีนลาย)
 *
 * เทคนิค: วาดเงารูปทรง (silhouette) ครั้งเดียวไว้ใน <defs> แล้วเรียกซ้ำด้วย <use> 3 ชั้น
 *   ชั้นล่าง = เงาบนพื้น (เบลอ) · ชั้นกลาง = สันหนาของแผ่น (เลื่อนลง) · ชั้นบน = ตัวเนื้อ
 *   ลูก ๆ ใน <defs> ต้องไม่ตั้ง fill เอง จะได้รับสีจาก <use> แต่ละชั้น
 * ⚠️ เนื้ออะคริลิคโปร่ง (opacity < 1) — ชั้น "สันหนา" ต้องมาสก์ให้เหลือเฉพาะส่วนที่ "พ้นตัวเนื้อ"
 *    ไม่งั้นสีสันจะทะลุขึ้นมาเป็นแถบเข้มพาดกลางแผ่น (เจอมาแล้วตอนวาดรอบแรก)
 * ⚠️ ตรวจแล้วว่า librsvg (ตัวเรนเดอร์ของ sharp) รองรับ feGaussianBlur / feDropShadow / mask / clipPath
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องขยับ REV ที่ build script เสมอ
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 640);

const OUT = (
  (process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/photo-fram-acrylic/upload"
).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#3f3a35";
const MUTED = "#9a9187";

/** พื้นหลังสตูดิโอ — ไล่เฉดครีม มีวงแสงนวล ๆ ตรงกลาง */
const BG = `
  <radialGradient id="bg" cx="50%" cy="42%" r="72%">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="62%" stop-color="#f7f4ef"/>
    <stop offset="100%" stop-color="#ebe5dc"/>
  </radialGradient>
  <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="soft2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#2a2018" flood-opacity="0.28"/>
  </filter>`;

let defsExtra = "";
const scene = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${BG}${defs}${defsExtra}</defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${body}
</svg>`;

const label = (x, y, text, size = 42, fill = INK) =>
  `<text x="${x}" y="${y}" font-family="${TH}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${fill}">${text}</text>`;

/** ลายที่สกรีนลงชิ้นงาน = มาสคอตเป็ด iDucky ของฝ่าย Content */
const artwork = (cx, cy, w, h, opacity = 1) => {
  const box = Math.min(w, h * 0.98);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/* ── รูปทรงแผ่น (ขอบหยัก) ────────────────────────────────────────────────
 * ลูก ๆ ไม่ตั้ง fill/stroke เอง — <use> แต่ละชั้นจะเป็นคนกำหนดสีให้
 */
const RATIO = 0.723;
let uid = 0;

function silhouette(id, x, y, w, h) {
  const r = Math.max(7, w / 17);
  const nx = Math.max(2, Math.round(w / (r * 2)));
  const ny = Math.max(2, Math.round(h / (r * 2)));
  const c = [];
  const push = (cx, cy) => c.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"/>`);
  for (let i = 0; i <= nx; i++) {
    push(x + (w * i) / nx, y);
    push(x + (w * i) / nx, y + h);
  }
  for (let i = 1; i < ny; i++) {
    push(x, y + (h * i) / ny);
    push(x + w, y + (h * i) / ny);
  }
  return `<g id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(r * 1.4).toFixed(1)}"/>${c.join("")}</g>`;
}

/** เนื้ออะคริลิคแต่ละชนิด — สีตัวเนื้อ / สันหนา / ความโปร่ง */
const MATERIALS = {
  clear: { top: "#dbeefb", bottom: "#b7dcf3", edge: "#7fbadf", opacity: 0.82 },
  milky: { top: "#f2f0ed", bottom: "#ddd9d3", edge: "#b7b2ab", opacity: 1 },
  holo: { top: "#fbd3e8", bottom: "#c9d8fb", edge: "#a892d6", opacity: 0.96, iridescent: true },
};

/**
 * แผ่นกรอบใส่รูป 1 ชิ้น — เงาพื้น + สันหนา + เนื้อ + ผิวเงา + ช่องกลาง
 *   mat    คีย์ใน MATERIALS · art = สกรีนลายบนขอบบน · card = โชว์รูปที่สอดอยู่ในช่อง
 *   hole   เจาะรูร้อยโซ่ · tilt = องศาที่เอียง (ค่าบวก = เอียงขวา)
 */
function plate(cx, top, w, h, opts = {}) {
  const { mat = "clear", art = true, card = true, hole = false, tilt = 0, depth = 13 } = opts;
  const m = MATERIALS[mat];
  const id = `p${uid++}`;
  const x = cx - w / 2;
  const bw = w * 0.19;
  const winX = x + bw;
  const winY = top + h * 0.26;
  const winW = w - bw * 2;
  const winH = h - (winY - top) - bw;
  const cy = top + h / 2;
  const rot = tilt ? ` transform="rotate(${tilt} ${cx} ${cy})"` : "";

  defsExtra += `
    ${silhouette(`${id}s`, x, top, w, h)}
    <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${x}" y1="${top}" x2="${x + w}" y2="${top + h}">
      <stop offset="0%" stop-color="${m.top}"/>
      ${m.iridescent ? `<stop offset="26%" stop-color="#c9f2e0"/><stop offset="52%" stop-color="#fdf0c2"/><stop offset="76%" stop-color="#f9c6e2"/>` : ""}
      <stop offset="100%" stop-color="${m.bottom}"/>
    </linearGradient>
    <mask id="${id}m"><use href="#${id}s" fill="#ffffff"/></mask>
    <!-- มาสก์ "นอกตัวเนื้อ" — เนื้ออะคริลิคโปร่ง ถ้าปล่อยสันหนาไว้ข้างหลังจะทะลุขึ้นมาเป็นแถบเข้มครึ่งล่าง -->
    <mask id="${id}o"><rect width="${W}" height="${H}" fill="#ffffff"/><use href="#${id}s" fill="#000000"/></mask>
    <!-- เงาในช่องว่าง (ตอนไม่ได้สอดรูป) — ไล่จากขอบบนลงมาจาง ๆ ให้ดูเป็นช่องลึก ไม่ใช่แถบสีทึบ -->
    <linearGradient id="${id}i" gradientUnits="userSpaceOnUse" x1="${winX}" y1="${winY}" x2="${winX}" y2="${winY + winH * 0.45}">
      <stop offset="0%" stop-color="#2a2018" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#2a2018" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${id}c"><rect x="${x - w}" y="${top + h * 0.42}" width="${w * 3}" height="${h}"/></clipPath>`;

  return `<g${rot}>
    <!-- เงาตกกระทบพื้น -->
    <use href="#${id}s" fill="#8a7c6c" opacity="0.34" filter="url(#soft)" transform="translate(7 ${depth + 20})"/>
    <!-- สันหนาของแผ่น (อะคริลิคหนา ~3 มม.) — ตัดให้โผล่เฉพาะครึ่งล่าง
         ไม่งั้นช่องว่างระหว่างลูกหยักด้านบนจะเห็นสันเป็นฟันแหลม ๆ ผิดรูป -->
    <g clip-path="url(#${id}c)" mask="url(#${id}o)"><use href="#${id}s" fill="${m.edge}" transform="translate(0 ${depth})"/></g>
    <!-- ตัวเนื้อ -->
    <use href="#${id}s" fill="url(#${id}g)" opacity="${m.opacity}"/>
    <!-- ผิวเงาสะท้อนแสงทแยง (ตัดขอบด้วย mask ของรูปทรง) -->
    <g mask="url(#${id}m)" filter="url(#soft2)">
      <path d="M${x - w * 0.1} ${top + h * 0.86} L${x + w * 0.74} ${top - h * 0.06} l${w * 0.22} 0 L${x + w * 0.12} ${top + h * 1.06} Z"
        fill="#ffffff" opacity="0.3"/>
      <path d="M${x + w * 0.66} ${top + h * 1.06} L${x + w * 1.16} ${top + h * 0.4} l${w * 0.09} 0 L${x + w * 0.82} ${top + h * 1.1} Z"
        fill="#ffffff" opacity="0.2"/>
    </g>
    ${art ? artwork(cx, top + h * 0.15, w * 0.6, h * 0.17) : ""}
    <!-- ช่องกลาง: เห็นทะลุถึงรูปที่สอดไว้ -->
    ${
      card
        ? `<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="${w * 0.05}" fill="#ffffff" filter="url(#cardShadow)"/>
           <rect x="${winX + w * 0.03}" y="${winY + w * 0.03}" width="${winW - w * 0.06}" height="${winH - w * 0.06}" rx="${w * 0.03}" fill="#eef5fb"/>
           ${artwork(cx, winY + winH * 0.52, winW * 0.76, winH * 0.74, 0.95)}`
        : `<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="${w * 0.05}" fill="#efece7"/>
           <rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="${w * 0.05}" fill="url(#${id}i)"/>`
    }
    ${
      hole
        ? `<circle cx="${cx}" cy="${top + h * 0.045}" r="${w * 0.04}" fill="#cfd8e0"/>
           <circle cx="${cx}" cy="${top + h * 0.045 + 2}" r="${w * 0.033}" fill="#f7f4ef"/>`
        : ""
    }
  </g>`;
}

/** โซ่ไข่ปลา — ห่วงปิดร้อยผ่านรูด้านบน เม็ดโลหะไล่เงา */
function ballChain(cx, holeY, { rx = 46, ry = 72, beads = 26, r = 12, drop = 34 } = {}) {
  const cy = holeY - ry - drop;
  const pts = [];
  for (let i = 0; i < beads; i++) {
    const a = (Math.PI * 2 * i) / beads - Math.PI / 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  for (let i = 1; i <= 3; i++) pts.push([cx, cy + ry + (drop * i) / 3]);
  const bead = ([bx, by]) => `
    <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${r}" fill="url(#steel)"/>
    <circle cx="${(bx - r * 0.28).toFixed(1)}" cy="${(by - r * 0.32).toFixed(1)}" r="${r * 0.3}" fill="#ffffff" opacity="0.85"/>`;
  return `
    <g opacity="0.3" filter="url(#soft2)" transform="translate(6 18)">
      ${pts.map(([bx, by]) => `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${r}" fill="#8a7c6c"/>`).join("")}
    </g>
    ${pts.map(bead).join("")}`;
}
const STEEL = `
  <radialGradient id="steel" cx="34%" cy="30%" r="78%">
    <stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#d7dee5"/><stop offset="100%" stop-color="#8d99a6"/>
  </radialGradient>`;

/** ฐานสแตนดี้มองเฉียง — แผ่นกลมมีความหนา ร่องกลางไว้เสียบตัวกรอบ */
function baseDisc(cx, cy, rx, { printed = false } = {}) {
  const ry = rx * 0.27;
  const th = rx * 0.14;
  const id = `b${uid++}`;
  defsExtra += `
    <linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="${cx - rx}" y1="${cy - ry}" x2="${cx + rx}" y2="${cy + ry}">
      <stop offset="0%" stop-color="#e6f3fb"/><stop offset="100%" stop-color="#bcdcf0"/>
    </linearGradient>`;
  return `
    <ellipse cx="${cx + 5}" cy="${cy + th + 16}" rx="${rx * 1.02}" ry="${ry}" fill="#8a7c6c" opacity="0.34" filter="url(#soft)"/>
    <path d="M${cx - rx} ${cy} v${th} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${th} z" fill="#8fc3e0"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${printed ? "url(#dots)" : `url(#${id}t)`}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#ffffff" opacity="0.18"/>
    <path d="M${cx - rx * 0.72} ${cy - ry * 0.34} a${rx * 0.72} ${ry * 0.72} 0 0 1 ${rx * 1.05} -${ry * 0.16}"
      fill="none" stroke="#ffffff" stroke-width="${rx * 0.05}" opacity="0.7" stroke-linecap="round"/>
    <rect x="${cx - rx * 0.42}" y="${cy - rx * 0.055}" width="${rx * 0.84}" height="${rx * 0.11}" rx="${rx * 0.055}"
      fill="#5f7a8c" opacity="0.5"/>`;
}

const DOTS = `
  <pattern id="dots" width="58" height="58" patternUnits="userSpaceOnUse" patternTransform="scale(1 0.32)">
    <rect width="58" height="58" fill="#cfeae4"/>
    <circle cx="15" cy="15" r="9" fill="#f6c453"/>
    <circle cx="44" cy="44" r="9" fill="#f191b8"/>
  </pattern>`;

/* ── 1. แบบ: พวงกุญแจ / สแตนดี้ ─────────────────────────────────────────── */
const typeKeyring = (() => {
  const h = 430;
  const w = h * RATIO;
  const top = 226;
  const body = `${ballChain(350, top + h * 0.045)}${plate(350, top, w, h, { hole: true, tilt: -3 })}`;
  return scene(body, STEEL);
})();

const typeStandee = (() => {
  const h = 438;
  const w = h * RATIO;
  const top = 108;
  const body = `${plate(350, top, w, h, { tilt: 2 })}${baseDisc(350, top + h + 22, w * 0.66)}`;
  return scene(body, DOTS);
})();

/* ── 2. ประเภทเนื้ออะคริลิค (แกนราคาของตาราง) ───────────────────────────── */
const FULL_H = 548;
const FULL_W = FULL_H * RATIO;
const FULL_TOP = 82;

const matClear = scene(plate(350, FULL_TOP, FULL_W, FULL_H, { mat: "clear", tilt: -2 }));
const matSpecial = scene(plate(350, FULL_TOP, FULL_W, FULL_H, { mat: "holo", tilt: -2 }));

/* ── 3. เพิ่มขนาดเกินมาตรฐาน — ต้องมีตัวเลข ไม่งั้นดูไม่ออกว่าเทียบอะไร ──── */
const sizeAdd = (() => {
  const PX_PER_CM = 45;
  const bottom = 512;
  const box = (cm, cx) => {
    const h = cm * PX_PER_CM;
    const w = h * RATIO;
    return `${plate(cx, bottom - h, w, h, { art: false, card: false })}${label(cx, bottom + 84, `${cm} ซม.`, 40)}`;
  };
  return scene(`
    ${box(6, 178)}
    ${box(8, 500)}
    <path d="M296 ${bottom - 150} h56 m0 0 l-21 -18 m21 18 l-21 18" stroke="${MUTED}" stroke-width="7"
      fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
})();

/* ── 4. สกรีนกี่ด้าน — หน้า/หลัง วางคู่กัน ─────────────────────────────── */
function screenArt(sides) {
  const h = 362;
  const w = h * RATIO;
  const top = 168;
  const two = sides === 2;
  return scene(`
    ${plate(176, top, w, h, { tilt: -2 })}
    ${plate(524, top, w, h, two ? { tilt: 2 } : { mat: "milky", art: false, tilt: 2 })}
    ${label(176, top + h + 96, "ด้านหน้า", 36)}
    ${label(524, top + h + 96, "ด้านหลัง", 36, two ? INK : MUTED)}`);
}

/* ── 5. ขนาดฐาน (สเกลจริงเทียบกันได้ · เส้นประ = ฐานเล็กสุดไว้เทียบ) ────── */
const BASE_PX_PER_CM = 62;
/* ผู้ใช้สั่งแยกขนาดฐานเป็นรายเซนติเมตร 2 ก.ย. 69 (เดิมเป็นช่วง 3-5 / 6-7 / 8 ตามหัวคอลัมน์ตารางร้าน)
 * — วาดครบทุกขนาด สเกลจริงเทียบกันได้ · เส้นประ = ฐานเล็กสุด (3 ซม.) ไว้เทียบว่าใหญ่ขึ้นแค่ไหน */
const BASE_MIN_CM = 3;
const BASES = [3, 4, 5, 6, 7, 8].map((cm) => ({ key: `base-${cm}`, cm, label: `${cm} ซม.` }));

function baseSizeArt(b) {
  const rx = (b.cm * BASE_PX_PER_CM) / 2;
  const std = (BASE_MIN_CM * BASE_PX_PER_CM) / 2;
  const cx = 350;
  const cy = 352;
  return scene(`
    ${b.cm > BASE_MIN_CM ? `<ellipse cx="${cx}" cy="${cy}" rx="${std}" ry="${std * 0.27}" fill="none" stroke="#c9c0b4" stroke-width="4" stroke-dasharray="13 11"/>` : ""}
    ${baseDisc(cx, cy, rx)}
    <line x1="${cx - rx}" y1="${cy + rx * 0.27 + 74}" x2="${cx + rx}" y2="${cy + rx * 0.27 + 74}" stroke="${MUTED}" stroke-width="4"/>
    <line x1="${cx - rx}" y1="${cy + rx * 0.27 + 60}" x2="${cx - rx}" y2="${cy + rx * 0.27 + 88}" stroke="${MUTED}" stroke-width="4"/>
    <line x1="${cx + rx}" y1="${cy + rx * 0.27 + 60}" x2="${cx + rx}" y2="${cy + rx * 0.27 + 88}" stroke="${MUTED}" stroke-width="4"/>
    ${label(cx, cy + rx * 0.27 + 134, b.label, 40)}`);
}

/* ── 6. ฐานใส / ฐานสกรีนลาย ─────────────────────────────────────────────── */
const basePlain = scene(baseDisc(350, 360, 258));
const basePrinted = scene(baseDisc(350, 360, 258, { printed: true }), DOTS);

/* ── เขียนไฟล์ ───────────────────────────────────────────────────────────── */
const SHEETS = {
  "type-keyring": typeKeyring,
  "type-standee": typeStandee,
  "mat-clear": matClear,
  "mat-special": matSpecial,
  "size-add": sizeAdd,
  "screen-1side": screenArt(1),
  "screen-2side": screenArt(2),
  ...Object.fromEntries(BASES.map((b) => [b.key, baseSizeArt(b)])),
  "base-plain": basePlain,
  "base-printed": basePrinted,
};

for (const [name, svg] of Object.entries(SHEETS)) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}
console.log(`\nเสร็จ ${Object.keys(SHEETS).length} ภาพ → ${OUT}`);
