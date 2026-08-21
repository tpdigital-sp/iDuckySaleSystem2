#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "BLANKET HOODIE / ผ้าห่มมีฮู้ด"
 *
 *   node scripts/blanket-hoodie-art.mjs [--out=<dir>]
 *
 * ทำไมต้องวาดเอง: รูปงานจริงบนหน้า pricelists เป็นภาพนางแบบห่ม ดูไม่ออกว่าผืนไหน Small ผืนไหน Large
 * และไม่มีรูปที่บอกว่า "พิมพ์ 1 ด้าน / 2 ด้าน" ต่างกันตรงไหน — ตัวเลือกบนหน้าสินค้าจึงต้องมีภาพสเกลของตัวเอง
 *
 * ได้ 4 ไฟล์ (ทุกภาพสเกลเดียวกัน เทียบกันได้ · 1 ซม. = 3.4 px):
 *   size-small.jpg  ผืนเล็ก 85x130cm  (ผืนใหญ่เป็นเส้นประอยู่หลังไว้เทียบ)
 *   size-large.jpg  ผืนใหญ่ 125x150cm (ผืนเล็กเป็นเส้นประอยู่หลังไว้เทียบ)
 *   side-1.jpg      พิมพ์ 1 ด้าน — ด้านหน้ามีลาย ด้านหลังเป็นผ้าขาว
 *   side-2.jpg      พิมพ์ 2 ด้าน — มีลายทั้งสองด้าน (ฮู้ดพิมพ์ได้ด้านเดียว)
 *
 * ที่มาของตัวเลข: iduckyofficial-pricelists.com/blanket ตาราง BLANKET HOODIE
 *   Small : สูง 85 x กว้าง 130cm (ขนาดรวมฮู้ด) · Large : สูง 125 x กว้าง 150cm (ขนาดรวมฮู้ด)
 *   ราคางานสกรีน 2 ด้าน :: Small +100 · Large +150
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ออกไฟล์ใหม่ให้ขึ้นรุ่น -v2 แทน
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/blanket-hoodie/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900; // จัตุรัสพอดี — แกลเลอรีหน้าสินค้าครอปภาพเป็นสี่เหลี่ยมจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
/** สีผ้า: ของจริงเป็นผ้าห่มสีขาว พิมพ์ซับลิเมชั่นลายฟ้า — วาดให้ดูเป็นผ้าขนนุ่ม */
const CLOTH = "#e0f2fe";
const CLOTH_EDGE = "#7dd3fc";
const PLAIN = "#f8fafc";
const PLAIN_EDGE = "#cbd5e1";

const PX_PER_CM = 3.4;

/** ขนาดจริงจากเว็บตารางราคา (ซม.) — สูงรวมฮู้ดแล้ว */
const SIZES = {
  small: { w: 130, h: 85, label: "Small", price: "เริ่มต้น ฿490 / ผืน", extra2: "พิมพ์ 2 ด้าน +100" },
  large: { w: 150, h: 125, label: "Large", price: "เริ่มต้น ฿940 / ผืน", extra2: "พิมพ์ 2 ด้าน +150" },
};

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** เส้นบอกขนาดแนวนอน ป้ายอยู่ใต้เส้น */
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 34}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวตั้ง ป้ายอยู่ซ้ายเส้น */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x - 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${CYAN}">${label}</text>`;

/**
 * ทรงผ้าห่มมีฮู้ด (มองจากด้านหน้า) — ตัวผ้าคลุมสี่เหลี่ยม + ฮู้ดโค้งบนกลาง
 * ความสูงที่ส่งเข้ามาคือ "ขนาดรวมฮู้ด" ตามที่เว็บตารางราคาระบุ
 */
const capeGeom = (cx, top, w, h) => {
  const hoodH = h * 0.3;
  const hoodW = Math.min(w * 0.36, hoodH * 1.7);
  return { cx, top, w, h, hoodH, hoodW, bodyTop: top + hoodH, x: cx - w / 2, bottom: top + h };
};

const capeShape = (g, { fill, edge, opacity = 1, dashed = false }) => {
  const d = dashed ? ` stroke-dasharray="12 9"` : "";
  const r = Math.min(26, g.w * 0.05);
  return `
    <path d="M${g.cx - g.hoodW / 2} ${g.bodyTop} Q${g.cx - g.hoodW / 2} ${g.top} ${g.cx} ${g.top} Q${g.cx + g.hoodW / 2} ${g.top} ${g.cx + g.hoodW / 2} ${g.bodyTop}"
      fill="${fill}" stroke="${edge}" stroke-width="4" opacity="${opacity}"${d}/>
    <rect x="${g.x}" y="${g.bodyTop}" width="${g.w}" height="${g.h - g.hoodH}" rx="${r}"
      fill="${fill}" stroke="${edge}" stroke-width="4" opacity="${opacity}"${d}/>`;
};

/** ปากฮู้ด + กระดุมสีขาวช่วงคอ (ของจริงเป็นกระดุมขาว) */
const capeDetail = (g, { buttons = true } = {}) => {
  const openR = g.hoodW * 0.32;
  const btnR = Math.max(5, g.w * 0.012);
  const btns = buttons
    ? [0.1, 0.2]
        .map(
          (t) =>
            `<circle cx="${g.cx}" cy="${g.bodyTop + (g.h - g.hoodH) * t}" r="${btnR}" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>`
        )
        .join("")
    : "";
  return `
    <path d="M${g.cx - openR} ${g.bodyTop} a${openR} ${openR * 0.78} 0 0 1 ${openR * 2} 0 z"
      fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
    <line x1="${g.cx}" y1="${g.bodyTop}" x2="${g.cx}" y2="${g.bottom}" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="7 7"/>
    ${btns}`;
};

/** ลายที่สกรีน — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) */
const artwork = (cx, cy, box, opacity = 1) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/** ป้ายชี้ชิ้นส่วน — เส้นบาง ๆ + ข้อความ */
const callout = (x1, y1, x2, y2, text, anchor = "start") => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="#94a3b8"/>
  <text x="${x2 + (anchor === "end" ? -8 : 8)}" y="${y2 + 6}" font-family="${TH}" font-size="20" text-anchor="${anchor}" fill="${SUB}">${text}</text>`;

// ── ภาพ "ขนาด" — วาดสองผืนสเกลเดียวกัน ผืนที่ไม่ได้เลือกเป็นเส้นประอยู่หลัง ──
function sizeArt(key) {
  const me = SIZES[key];
  const other = SIZES[key === "small" ? "large" : "small"];
  const baseY = 660; // ขอบล่างของผืน — ทั้งสองผืนชิดฐานเดียวกันและชิดขอบซ้ายเดียวกัน เทียบขนาดได้ตรง ๆ
  const x0 = 200; // ขอบซ้ายร่วมของทั้งสองผืน

  const gMe = capeGeom(x0 + (me.w * PX_PER_CM) / 2, baseY - me.h * PX_PER_CM, me.w * PX_PER_CM, me.h * PX_PER_CM);
  const gOther = capeGeom(
    x0 + (other.w * PX_PER_CM) / 2,
    baseY - other.h * PX_PER_CM,
    other.w * PX_PER_CM,
    other.h * PX_PER_CM
  );

  const body = `
    ${title(`${me.label} · ${me.w} x ${me.h} cm`, "ขนาดรวมฮู้ด · ผ้าห่มมีฮู้ด (Blanket Hoodie)")}
    ${capeShape(gMe, { fill: CLOTH, edge: CLOTH_EDGE })}
    ${capeDetail(gMe)}
    ${artwork(gMe.cx, gMe.bodyTop + (gMe.h - gMe.hoodH) * 0.56, Math.min(gMe.w * 0.4, (gMe.h - gMe.hoodH) * 0.66))}
    ${capeShape(gOther, { fill: "none", edge: "#94a3b8", dashed: true })}
    <line x1="${W - 372}" y1="${196}" x2="${W - 334}" y2="${196}" stroke="#94a3b8" stroke-width="3" stroke-dasharray="12 9"/>
    <text x="${W - 324}" y="${202}" font-family="${TH}" font-size="19" fill="#94a3b8">เส้นประ = ${other.label} ${other.w}x${other.h} cm</text>
    ${dimH(baseY + 38, gMe.x, gMe.x + gMe.w, `กว้าง ${me.w} cm`)}
    ${dimV(x0 - 34, gMe.top, baseY, `สูง ${me.h} cm`)}
    ${foot([me.price, "ผ้า Flannel 300 GSM · ผ้าห่มสีขาว กระดุมสีขาว", "เย็บเก็บขอบแล้วขนาดคลาดเคลื่อน +- 1-2 นิ้ว"])}`;
  return frame(body);
}

// ── ภาพ "พิมพ์กี่ด้าน" — วางด้านหน้า/ด้านหลังคู่กัน ──
function sideArt(sides) {
  const w = 118 * PX_PER_CM * 0.86;
  const h = 100 * PX_PER_CM * 0.86;
  const top = 310;
  const gap = 60;
  const left = capeGeom(W / 2 - w / 2 - gap / 2, top, w, h);
  const right = capeGeom(W / 2 + w / 2 + gap / 2, top, w, h);
  const two = sides === 2;

  const panel = (g, label, printed) => `
    ${capeShape(g, { fill: printed ? CLOTH : PLAIN, edge: printed ? CLOTH_EDGE : PLAIN_EDGE })}
    ${printed ? artwork(g.cx, g.bodyTop + (g.h - g.hoodH) * 0.5, Math.min(g.w * 0.46, (g.h - g.hoodH) * 0.74)) : ""}
    ${capeDetail(g, { buttons: printed })}
    ${
      !printed
        ? `<text x="${g.cx}" y="${g.bodyTop + (g.h - g.hoodH) * 0.52}" font-family="${TH}" font-size="24" text-anchor="middle" fill="#94a3b8">ผ้าขาว ไม่พิมพ์ลาย</text>`
        : ""
    }
    <text x="${g.cx}" y="${g.bottom + 42}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;

  const body = `
    ${title(two ? "พิมพ์ 2 ด้าน" : "พิมพ์ 1 ด้าน", two ? "มีลายทั้งด้านหน้าและด้านหลัง" : "มีลายด้านหน้า · ด้านหลังเป็นผ้าขาว")}
    ${panel(left, "ด้านหน้า", true)}
    ${panel(right, "ด้านหลัง", two)}
    ${callout(left.cx, left.top + left.hoodH * 0.5, 92, top - 34, two ? "ฮู้ดพิมพ์ได้ด้านเดียว" : "ฮู้ดพิมพ์ด้านนอก")}
    ${foot(
      two
        ? ["คิดเพิ่มจากราคาปกติ: Small +฿100 · Large +฿150 ต่อผืน", "ตัวผ้าคลุมพิมพ์ได้ 2 ด้าน ส่วนฮู้ดพิมพ์ได้ด้านเดียว"]
        : ["ราคาปกติตามตาราง (Small เริ่ม ฿490 · Large เริ่ม ฿940)", "ด้านหลังเป็นเนื้อผ้าขาวตามผ้าตั้งต้น"]
    )}`;
  return frame(body);
}

const ART = {
  "size-small": { svg: sizeArt("small"), note: "Small 130x85 cm (เทียบกับ Large เส้นประ)" },
  "size-large": { svg: sizeArt("large"), note: "Large 150x125 cm (เทียบกับ Small เส้นประ)" },
  "side-1": { svg: sideArt(1), note: "พิมพ์ 1 ด้าน — หลังเป็นผ้าขาว" },
  "side-2": { svg: sideArt(2), note: "พิมพ์ 2 ด้าน — หน้า+หลังมีลาย" },
};

for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🖼  ${name}.jpg  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}
console.log(`\n✅ วาดภาพตัวเลือกครบ ${Object.keys(ART).length} ไฟล์ ที่ ${OUT}`);
