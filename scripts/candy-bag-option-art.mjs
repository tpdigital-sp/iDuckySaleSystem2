#!/usr/bin/env node
/**
 * CANDY BAG (candy-bag) — ภาพตัวอย่างของ 2 กลุ่มตัวเลือก
 * (/products/CANDY-BAG)
 *
 *   node scripts/candy-bag-option-art.mjs            # วาด/ครอปลง .cache/candy-bag/upload (ไม่แตะ DB)
 *   node scripts/candy-bag-option-art.mjs --write    # + อัป storage + ตั้ง imageSrc + อ่านกลับเทียบ
 *
 * ── 5 ใบ ───────────────────────────────────────────────────────────
 *   screen-1-side / screen-2-side   กลุ่ม "สกรีนกี่ด้าน" — ภาพวาดสไตล์บ้าน (ชุดเดียวกับ CARD HOLDER ใส
 *                                   scripts/cardholder-clear-screen-option.mjs) แต่เป็นทรง CANDY BAG:
 *                                   ขอบหยักบน-ล่าง · รางซิปแนวตั้งริมซ้าย · รูร้อยโซ่มุมขวาบน
 *                                   (ทรงตามรูปแกลเลอรีใบแรกของสินค้า)
 *   hook-z2 / hook-b / hook-c       กลุ่ม "สีตะขอ" — รูปงานจริง ครอปจากชาร์ต "ตะขอ | อะไหล่เสริม"
 *                                   ต้นฉบับความละเอียดสูงในไดรฟ์ร้าน 3423×5000 (ชาร์ตเดียวกับที่เว็บ
 *                                   pricelists ใช้ แต่ในเว็บเล็กกว่า 3 เท่า) — ทั้ง 3 ใบมาจากชาร์ตใบเดียวกัน
 *                                   พื้น/แสงจึงเป็นชุดเดียวกัน · ครอปให้โซ่อยู่กลางเฟรม
 *
 * ⚠️ กลุ่ม "สกรีนกี่ด้าน" + "สีตะขอ" เป็น **แกนตารางราคา** (pricing.driverLabels) — สคริปต์นี้แตะแค่
 *    imageSrc/desc ห้ามแตะชื่อกลุ่ม/ชื่อตัวเลือกเด็ดขาด (คีย์ pricing.cells อ้างชื่อพวกนี้ตรง ๆ)
 *    ตอนอ่านกลับมีด่านเทียบว่า cells/driverLabels เท่าเดิมเป๊ะ ดู [[iducky-price-driver-trap]]
 * ⚠️ กลุ่ม "สีตะขอ" ไม่ได้ตั้ง display → ปุ่มตัวเลือกครอปกลางภาพ 62×62 ([[iducky-option-thumb-crop]])
 *    โซ่ต้องอยู่กลางเฟรมและกินพื้นที่ ห้ามเว้นขอบเยอะ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "candy-bag";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// 1) กลุ่ม "สกรีนกี่ด้าน" — ภาพวาด 900×900
// ═══════════════════════════════════════════════════════════════════════════
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

const frame = (title, subtitle, body, note1 = "", note2 = "", defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

const tag = (cx, y, text, on = false) => {
  const w = text.length * 12.5 + 40;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="38" rx="19" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2"/>
  <text x="${cx}" y="${y + 26}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

// ── ลายสกรีนเล็ก ๆ (ชุดเดียวกับ CARD HOLDER — ให้ภาพตัวเลือกทั้งร้านเป็นชุดเดียวกัน) ──
const star = (cx, cy, r, fill, op = 1) => {
  const p = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${p}" fill="${fill}" opacity="${op}"/>`;
};
const heart = (cx, cy, s, fill, op = 1) => `<path d="M ${cx} ${cy + s * 0.75}
  C ${cx - s * 1.2} ${cy - s * 0.1} ${cx - s * 0.5} ${cy - s * 0.95} ${cx} ${cy - s * 0.25}
  C ${cx + s * 0.5} ${cy - s * 0.95} ${cx + s * 1.2} ${cy - s * 0.1} ${cx} ${cy + s * 0.75} Z"
  fill="${fill}" opacity="${op}"/>`;

/** ตำแหน่งลาย (u,v ∈ 0..1 ของตัวถุง) — สกรีนเต็มใบทั้ง 2 แบบ ต่างกันแค่ชุดลาย/สี */
const ART_A = [
  ["s", 0.18, 0.12, 1], ["h", 0.46, 0.09, 0.85], ["d", 0.72, 0.13, 0.5], ["s", 0.86, 0.2, 0.9],
  ["h", 0.14, 0.27, 0.9], ["d", 0.34, 0.22, 0.45], ["s", 0.6, 0.25, 0.95],
  ["h", 0.82, 0.36, 0.85], ["s", 0.22, 0.42, 1], ["d", 0.5, 0.39, 0.5], ["h", 0.66, 0.47, 0.9],
  ["s", 0.14, 0.58, 0.95], ["d", 0.37, 0.55, 0.45], ["h", 0.58, 0.63, 0.85], ["s", 0.84, 0.6, 1],
  ["d", 0.24, 0.71, 0.5], ["h", 0.46, 0.76, 0.9], ["s", 0.7, 0.79, 0.95], ["d", 0.88, 0.75, 0.45],
  ["h", 0.16, 0.88, 0.85], ["s", 0.42, 0.91, 1], ["d", 0.64, 0.89, 0.5], ["h", 0.84, 0.93, 0.9],
];
const ART_B = [
  ["h", 0.2, 0.1, 0.9], ["s", 0.44, 0.14, 1], ["d", 0.68, 0.1, 0.5], ["h", 0.86, 0.18, 0.85],
  ["s", 0.16, 0.24, 0.95], ["d", 0.4, 0.27, 0.45], ["h", 0.64, 0.3, 0.9],
  ["s", 0.86, 0.4, 1], ["h", 0.2, 0.4, 0.85], ["d", 0.46, 0.44, 0.5], ["s", 0.68, 0.52, 0.95],
  ["h", 0.16, 0.56, 0.9], ["d", 0.38, 0.62, 0.45], ["s", 0.6, 0.68, 1], ["h", 0.86, 0.64, 0.85],
  ["d", 0.22, 0.74, 0.5], ["s", 0.44, 0.8, 0.95], ["h", 0.7, 0.83, 0.9],
  ["s", 0.18, 0.9, 1], ["d", 0.5, 0.93, 0.5], ["h", 0.8, 0.92, 0.85], ["d", 0.88, 0.78, 0.45],
];

function motifs(x, y, w, h, palette, list) {
  const base = w * 0.085;
  return list.map(([k, u, v, m = 1], i) => {
    const cx = x + u * w, cy = y + v * h, s = base * m;
    const c = palette[i % palette.length];
    return k === "s" ? star(cx, cy, s, c, 0.92) : k === "h" ? heart(cx, cy, s * 0.85, c, 0.9)
      : `<circle cx="${cx}" cy="${cy}" r="${s * 0.55}" fill="${c}" opacity="0.85"/>`;
  }).join("");
}

const SKY = { grad: "skyPrint", dots: ["#ffffff", "#ffe08a", "#ff9fc4", "#8ad2ef"], art: ART_A };
const PINK = { grad: "pinkPrint", dots: ["#ffffff", "#a7e3f7", "#ffd98a", "#ffa9c9"], art: ART_B };

/**
 * เส้นรอบรูปถุง CANDY BAG — ขอบหยักฟันปลาบน-ล่าง (ทรงซองขนม) ด้านข้างตรง
 * teeth = จำนวนฟัน · amp = ความลึกฟัน (ตามรูปงานจริง ฟันตื้น ๆ ถี่ ๆ)
 */
function bagPath(x, y, w, h, teeth = 11) {
  const amp = h * 0.035, step = w / teeth;
  const top = [`M ${x} ${y + amp}`];
  for (let i = 0; i < teeth; i++) {
    top.push(`L ${(x + (i + 0.5) * step).toFixed(1)} ${y}`);
    top.push(`L ${(x + (i + 1) * step).toFixed(1)} ${y + amp}`);
  }
  const bottom = [`L ${x + w} ${y + h - amp}`];
  for (let i = teeth; i > 0; i--) {
    bottom.push(`L ${(x + (i - 0.5) * step).toFixed(1)} ${y + h}`);
    bottom.push(`L ${(x + (i - 1) * step).toFixed(1)} ${y + h - amp}`);
  }
  return `${top.join(" ")} ${bottom.join(" ")} Z`;
}

/** โซ่ไข่ปลาเล็ก ๆ ที่คล้องรูมุมขวาบน — ลูกปัดแรกชิดขอบรู ให้เห็นว่าร้อยรูอยู่จริง ไม่ใช่ลอย
 *  (วาดพอรู้ว่ามีโซ่ ไม่แย่งสายตาจากลายสกรีน) */
function chain(cx, cy, r = 6) {
  const pts = [[0, -9], [8, -22], [22, -31], [38, -30], [48, -20], [50, -7], [44, 3]];
  return pts.map(([dx, dy], i) =>
    `<circle cx="${cx + dx}" cy="${cy + dy}" r="${r - (i > 4 ? 0.6 : 0)}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.4"/>`).join("");
}

/**
 * ถุง CANDY BAG 1 ใบ (สัดส่วนจริง 9 × 11 ซม.)
 *   printed = พิมพ์ลายเต็มใบ · false = ถุงใสไม่มีหมึก (เห็นลายด้านหน้าทะลุมาจาง ๆ กลับด้าน)
 */
function bag(id, x, y, w, h, { theme = SKY, printed = true, ghost = null } = {}) {
  const amp = h * 0.035;
  const d = bagPath(x, y, w, h);
  const zipX = x + w * 0.13;                       // รางซิปแนวตั้งริมซ้าย (ตามรูปงานจริง)
  const holeX = x + w * 0.87, holeY = y + amp + h * 0.055;
  const inner = printed
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${theme.grad})"/>
       ${motifs(x, y, w, h, theme.dots, theme.art)}`
    : ghost
      ? `<g opacity="0.2" transform="translate(${(2 * x + w).toFixed(1)} 0) scale(-1 1)">
           <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${ghost.grad})"/>
           ${motifs(x, y, w, h, ghost.dots, ghost.art)}
         </g>`
      : "";
  return `<g>
    <path d="${d}" transform="translate(5 9)" fill="#0f172a" opacity="0.07"/>
    <path d="${d}" fill="url(#clearPlastic)"/>
    <clipPath id="clip-${id}"><path d="${d}"/></clipPath>
    <g clip-path="url(#clip-${id})">
      ${inner}
      <!-- รางซิป + หัวซิป (พลาสติกขาวขุ่น เห็นทะลุลายเสมอ) -->
      <rect x="${zipX - w * 0.028}" y="${y + amp * 1.2}" width="${w * 0.056}" height="${h - amp * 2.4}" rx="${w * 0.028}" fill="#ffffff" opacity="0.62"/>
      ${Array.from({ length: 16 }, (_, i) =>
        `<rect x="${zipX - w * 0.02}" y="${(y + amp * 1.6 + i * ((h - amp * 3.2) / 16)).toFixed(1)}" width="${w * 0.04}" height="2.4" rx="1.2" fill="#94a3b8" opacity="0.5"/>`).join("")}
      <rect x="${zipX - w * 0.045}" y="${y + h * 0.7}" width="${w * 0.09}" height="${h * 0.075}" rx="${w * 0.025}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.6"/>
      <!-- แสงสะท้อนแผ่นพลาสติก -->
      <path d="M ${x + w * 0.2} ${y + h} L ${x + w * 0.62} ${y} L ${x + w * 0.78} ${y} L ${x + w * 0.36} ${y + h} Z" fill="#ffffff" opacity="0.14"/>
    </g>
    <path d="${d}" fill="none" stroke="#8fbccb" stroke-width="2.5"/>
    <circle cx="${holeX}" cy="${holeY}" r="${w * 0.038}" fill="#ffffff" stroke="#94a3b8" stroke-width="2.4"/>
    ${chain(holeX, holeY - w * 0.038, w * 0.026)}
  </g>`;
}

const DEFS = `
  <linearGradient id="clearPlastic" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#f6fcff"/><stop offset="0.55" stop-color="#ecf7fd"/><stop offset="1" stop-color="#dcedf6"/>
  </linearGradient>
  <linearGradient id="skyPrint" x1="0" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#bfe3fb"/><stop offset="0.5" stop-color="#9fd8f7"/><stop offset="1" stop-color="#77cfe8"/>
  </linearGradient>
  <linearGradient id="pinkPrint" x1="0" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#ffc3dc"/><stop offset="0.5" stop-color="#ffd9e6"/><stop offset="1" stop-color="#c9b8f2"/>
  </linearGradient>`;

const BH = 372;                    // สูงตัวถุงในภาพ
const BW = (BH * 9) / 11;          // กว้างตามสัดส่วนจริง 9 × 11 ซม.
const CY = 452, LX = 208, RX = 692;

function screenArt(sides) {
  const one = sides === 1;
  const top = CY - BH / 2;
  const body = `
  ${bag("f", LX - BW / 2, top, BW, BH, { theme: SKY, printed: true })}
  ${bag("b", RX - BW / 2, top, BW, BH, one ? { printed: false, ghost: SKY } : { theme: PINK, printed: true })}
  ${one ? `<text x="${RX}" y="${CY + 8}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#9fb0bf">ไม่พิมพ์</text>` : ""}
  ${tag(LX, 684, "ด้านหน้า — พิมพ์ลาย", true)}
  ${tag(RX, 684, one ? "ด้านหลัง — ใส ไม่มีลาย" : "ด้านหลัง — พิมพ์ลาย", !one)}
  <g>
    <circle cx="${W / 2}" cy="${CY - 14}" r="84" fill="#ffffff" stroke="${OK}" stroke-width="4"/>
    <text x="${W / 2}" y="${CY + 6}" font-family="${TH}" font-size="88" font-weight="800" text-anchor="middle" fill="${OK}">${sides}</text>
    <text x="${W / 2}" y="${CY + 48}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${SUB}">ด้าน</text>
  </g>`;
  return one
    ? frame("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้าด้านเดียว", body,
      "ด้านหลังเป็นถุงใสไม่มีหมึก — มองทะลุเห็นลายด้านหน้ากลับด้าน",
      "สกรีนระบบ UV เต็มใบ 9 × 11 ซม. ทับรางซิปได้", DEFS)
    : frame("สกรีน 2 ด้าน", "พิมพ์ลายทั้งสองด้าน", body,
      "ด้านหลังพิมพ์เต็มใบ จะเป็นคนละลายกับด้านหน้าก็ได้",
      "ใส่การ์ด/ของข้างในแล้วยังเห็นลายทั้งสองฝั่ง", DEFS);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) กลุ่ม "สีตะขอ" — ครอปรูปงานจริงจากชาร์ตตะขอความละเอียดสูงในไดรฟ์ร้าน
// ═══════════════════════════════════════════════════════════════════════════
/** ชาร์ต "ตะขอ | อะไหล่เสริม" ต้นฉบับ 3423×5000 (ตัวที่อยู่บนเว็บ pricelists เล็กกว่านี้ 3 เท่า) */
const HOOK_CHART = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/P-ตะขอ+อะไหล่-01.jpg";
/** สำเนาไว้ในเครื่อง เผื่อไดรฟ์ร้านไม่ได้ต่อ (รันซ้ำได้โดยไม่ต้องเสียบไดรฟ์) */
const HOOK_CHART_LOCAL = `.cache/${PRODUCT_ID}/_src-hookchart.jpg`;
/** ช่องบนชาร์ต [left, top, width, height] — วัดจากต้นฉบับ 3423×5000
 *  ครอบเฉพาะ "ตัวโซ่" ไม่เอาป้ายวงกลม Z2/B/C · ตัวหนังสือใต้ช่อง · ขอบฟ้าของชาร์ต */
const HOOK_BOX = {
  "hook-z2": { box: [645, 578, 230, 215], note: "Z2 โซ่ไข่ปลาสีเงิน" },
  "hook-b": { box: [1368, 578, 235, 232], note: "B โซ่ไข่ปลาสีทอง" },
  "hook-c": { box: [1806, 576, 372, 232], note: "C โซ่ไข่ปลาหลายสี", contain: true },
};

async function hookSource() {
  if (existsSync(HOOK_CHART_LOCAL)) return HOOK_CHART_LOCAL;
  if (!existsSync(HOOK_CHART)) {
    console.error(`ไม่พบชาร์ตตะขอต้นฉบับ — เสียบไดรฟ์ร้านก่อน:\n  ${HOOK_CHART}`);
    process.exit(1);
  }
  mkdirSync(`.cache/${PRODUCT_ID}`, { recursive: true });
  writeFileSync(HOOK_CHART_LOCAL, readFileSync(HOOK_CHART));
  return HOOK_CHART_LOCAL;
}

// ── เรนเดอร์ทั้ง 5 ใบ ──────────────────────────────────────────────────────
const built = [];

for (const sides of [1, 2]) {
  const file = `screen-${sides}-side-${VER}.jpg`;
  const buf = await sharp(Buffer.from(screenArt(sides))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  built.push({ key: `screen-${sides}`, file, buf, note: `สกรีน ${sides} ด้าน` });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — สกรีน ${sides} ด้าน`);
}

const chartPath = await hookSource();
for (const [key, { box, note, contain }] of Object.entries(HOOK_BOX)) {
  const file = `${key}-${VER}.jpg`;
  const [left, top, width, height] = box;
  const buf = await sharp(chartPath)
    .extract({ left, top, width, height })
    .resize(900, 900, contain ? { fit: "contain", background: "#ffffff" } : { fit: "cover", kernel: "lanczos3" })
    .sharpen({ sigma: 1.1 })                       // ครอปเล็กแล้วขยาย — คมขึ้นนิดให้ลูกปัดโซ่ไม่เบลอ
    .jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  built.push({ key, file, buf, note });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${note}`);
}

/* แผ่นรวมรูปย่อ — ขนาดจริงบนหน้าสินค้า: การ์ด 80px · ปุ่มกลม 28px
   (ภาพจัตุรัสลงกล่องจัตุรัส object-cover = เห็นเต็มใบ ไม่ถูกครอป) */
const TS = 160;
await sharp({ create: { width: TS * built.length, height: TS, channels: 3, background: "#ffffff" } })
  .composite(await Promise.all(built.map(async (b, i) => ({
    input: await sharp(b.buf).resize(b.key.startsWith("screen") ? 80 : 28).resize(TS, TS, { kernel: "nearest" }).toBuffer(),
    left: i * TS, top: 0,
  }))))
  .jpeg({ quality: 90 })
  .toFile(`${OUT}/_thumbs-all.jpg`);
console.log(`🔎 ${OUT}/_thumbs-all.jpg — รูปย่อขนาดจริง (การ์ด 80px / ปุ่มตะขอ 28px) ${built.length} ใบเรียงเทียบ`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัป storage + เขียน options ────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.key] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  const head = await fetch(url[b.key], { method: "HEAD" });
  if (!head.ok) { console.error("ดึงรูปที่อัปแล้วไม่ได้", url[b.key], head.status); process.exit(1); }
}
console.log(`⬆️  อัปโหลด ${built.length} ไฟล์ขึ้น storage แล้ว`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

/** ราคาก่อนแก้ — แกนราคา 2 กลุ่มนี้ห้ามขยับแม้แต่คีย์เดียว */
const pricingBefore = JSON.stringify({ cells: data.pricing?.cells, drivers: data.pricing?.driverLabels });

/** เติมภาพ (+desc) ให้ตัวเลือกในกลุ่มหนึ่ง — ชื่อกลุ่ม/ชื่อตัวเลือกคงเดิมเสมอ */
const applied = [];
function apply(label, rows) {
  const g = (data.options ?? []).find((o) => o.label === label);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${label}" — หยุดก่อน`); process.exit(1); }
  for (const r of rows) {
    const c = (g.choices ?? []).find((x) => x.name === r.choice);
    if (!c) { console.error(`ไม่เจอตัวเลือก "${r.choice}" ในกลุ่ม "${label}" — หยุดก่อน`); process.exit(1); }
    c.imageSrc = url[r.key];
    if (r.desc) c.desc = r.desc;
    applied.push({ label, name: c.name, key: r.key, desc: r.desc });
  }
}

apply("สกรีนกี่ด้าน", [
  { choice: "สกรีน 1 ด้าน", key: "screen-1", desc: "พิมพ์ลายด้านหน้า ด้านหลังเป็นถุงใสไม่มีหมึก" },
  { choice: "สกรีน 2 ด้าน", key: "screen-2", desc: "พิมพ์ลายทั้งสองด้าน หน้า-หลังคนละลายได้" },
]);
apply("สีตะขอ", [
  { choice: "ตะขอ Z2 โซ่ไข่ปลาสีเงิน", key: "hook-z2" },
  { choice: "ตะขอ B โซ่ไข่ปลาสีทอง", key: "hook-b" },
  { choice: "ตะขอ C โซ่ไข่ปลาหลายสี", key: "hook-c" },
]);

data.savedAt = new Date().toISOString();                 // ISO เท่านั้น (ตัวเลข = หน้าแก้ไขติด 409 ตลอด)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ ("ไม่ error" ไม่ได้แปลว่าค่าลงจริง) ────────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bo = back.data.options ?? [];
for (const a of applied) {
  const g = bo.find((o) => o.label === a.label);
  const c = g?.choices?.find((x) => x.name === a.name);
  if (c?.imageSrc !== url[a.key] || (a.desc && c?.desc !== a.desc)) {
    console.error("อ่านกลับไม่ตรง:", a.label, a.name, c); process.exit(1);
  }
}
const pricingAfter = JSON.stringify({ cells: back.data.pricing?.cells, drivers: back.data.pricing?.driverLabels });
if (pricingAfter !== pricingBefore) { console.error("ตารางราคาเพี้ยน!\nก่อน:", pricingBefore, "\nหลัง:", pricingAfter); process.exit(1); }
/* กฎ rules ชี้ชื่อตัวเลือกของ 2 กลุ่มนี้ตรง ๆ — ชื่อต้องอยู่ครบเหมือนเดิม */
for (const r of back.data.rules ?? []) {
  const g = bo.find((o) => o.label === r.when?.label);
  for (const nm of r.when?.choices ?? []) {
    if (!g?.choices?.some((c) => c.name === nm)) { console.error("rules ชี้ตัวเลือกที่หายไป!", r.when.label, nm); process.exit(1); }
  }
}
console.log(`✓ เติมภาพ ${applied.length} ตัวเลือก (${built.length} ไฟล์) · ตารางราคา/แกนราคา/กฎ เท่าเดิมเป๊ะ · savedAt = ${back.data.savedAt}`);
