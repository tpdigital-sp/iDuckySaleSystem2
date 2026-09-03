#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "Premium Bag" (premium-bag · slug Premium-Bag)
 *
 *   node scripts/premium-bag-option-art.mjs            (วาดภาพลง .cache/premium-bag/upload)
 *   node scripts/premium-bag-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * ทำไมต้องวาดเอง: แกลเลอรีมีแต่รูปถุงสำเร็จ 5 ใบ ไม่มีรูปไหนบอกได้ว่า "ซิป / กระดุม / กระเป๋าเล็กด้านใน /
 * ป้ายแท็ก / ผ้าร่มซับใน" หน้าตาเป็นยังไง และไม่มีรูปเทียบสัดส่วน 5 ขนาด — สไตล์การ์ดยึดตาม
 * drawstring-bag-option-art.mjs (การ์ดขาว 900×900 + ป้ายชี้ + บรรทัดราคาใต้ภาพ)
 *
 * ได้ 14 ไฟล์ (900×900 จัตุรัส — แกลเลอรี/ปุ่มตัวเลือกครอปจัตุรัส):
 *   กลุ่ม "OPTION" (7)  opt-zip / opt-snap / opt-pocket-plain / opt-pocket-print / opt-tag / opt-lining-white / opt-lining-print
 *   กลุ่ม "ขนาด"  (5)  size-1..5 ตามลำดับตัวเลือกใน DB — สเกลเดียวกันทุกใบ เทียบข้ามการ์ดได้จริง
 *   กลุ่ม "สีซิป" (2)  zipcolor-white / zipcolor-black
 *
 * ที่มาของตัวเลข: products.premium-bag ใน DB (3 ก.ย. 69)
 *   ราคาต่อใบเรทที่ 1 ช่วง 1-10 ใบ → 5000 ใบขึ้นไป · OPTION extra: ซิป 10 · กระดุม 10 ·
 *   กระเป๋าเล็ก 15/20 · ป้ายแท็ก 3 · ผ้าร่มซับใน 35/50 · วัสดุ: ผ้าดิบ 8 ออนซ์ (data.terms)
 *
 * ⚠️ ชื่อตัวเลือกในภาพใช้คำที่สะกดถูก ("กระดุมเหล็ก") แต่ใน DB สะกด "กระดุกเหล็ก" —
 *    การจับคู่ imageSrc ใช้ชื่อจาก DB ตรง ๆ (คีย์ `choice`) จึงไม่พัง ถ้าจะแก้คำสะกดค่อยแก้แยก
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "premium-bag";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/premium-bag/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
/** ผ้าดิบ 8 ออนซ์ — โทนครีมอมน้ำตาล ให้ต่างจากพื้นการ์ดขาวชัด ๆ */
const CLOTH = "#f4e8d0";
const CLOTH_EDGE = "#c3a674";
const CLOTH_DARK = "#e7d6b4";
const STITCH = "#b08f56";

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

/** ป้ายราคาส่วนเพิ่มมุมขวาบน — ตัวเลขต้องอ่านออกตั้งแต่ภาพย่อ */
const extraBadge = (baht) => `
  <rect x="${W - 210}" y="150" width="152" height="52" rx="26" fill="#ecfeff" stroke="${CYAN}" stroke-width="2"/>
  <text x="${W - 134}" y="185" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${CYAN}">+฿${baht}/ใบ</text>`;

/** ป้ายชี้ชิ้นส่วน — เส้นบาง ๆ + ข้อความ */
const callout = (x1, y1, x2, y2, text, anchor = "start") => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="#94a3b8"/>
  <text x="${x2 + (anchor === "end" ? -8 : 8)}" y="${y2 + 6}" font-family="${TH}" font-size="20" text-anchor="${anchor}" fill="${SUB}">${text}</text>`;

/** ลายที่สกรีน — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) */
const artwork = (cx, cy, box, opacity = 1) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

// ── ทรงถุง (มองด้านหน้า) ────────────────────────────────────────────
const bagGeom = (cx, top, w, h) => ({ cx, x: cx - w / 2, top, w, h, bottom: top + h, r: Math.min(24, w * 0.07) });

/** หูหิ้ว 2 เส้น — เส้นหลังจางกว่าให้ดูมีความหนา */
const handles = (g, { sw = 15 } = {}) => {
  const x1 = g.x + g.w * 0.27;
  const x2 = g.x + g.w * 0.73;
  const lift = g.h * 0.42;
  const one = (dx, dy, color, op) => `<path d="M${x1 + dx} ${g.top + dy} C ${x1 + dx} ${g.top - lift + dy} ${x2 + dx} ${g.top - lift + dy} ${x2 + dx} ${g.top + dy}"
      fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`;
  return one(-9, -12, CLOTH_DARK, 0.9) + one(-9, -12, CLOTH_EDGE, 0.25) + one(0, 0, CLOTH, 1) +
    `<path d="M${x1} ${g.top} C ${x1} ${g.top - lift} ${x2} ${g.top - lift} ${x2} ${g.top}" fill="none" stroke="${CLOTH_EDGE}" stroke-width="${sw + 5}" stroke-linecap="round" opacity="0.35"/>` +
    one(0, 0, CLOTH, 1);
};

/** ตัวถุงด้านหน้า + ริมพับปากถุง + ตะเข็บข้าง */
const bagBody = (g, { fill = CLOTH, clipId = "" } = {}) => `
  ${clipId ? `<clipPath id="${clipId}"><rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" rx="${g.r}"/></clipPath>` : ""}
  <rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" rx="${g.r}" fill="${fill}" stroke="${CLOTH_EDGE}" stroke-width="4"/>
  <line x1="${g.x + 8}" y1="${g.top + 30}" x2="${g.x + g.w - 8}" y2="${g.top + 30}" stroke="${STITCH}" stroke-width="2.5" stroke-dasharray="9 7" opacity="0.7"/>`;

/**
 * "หน้าต่างตัดให้เห็นด้านใน" — กรอบเส้นประบนตัวถุง โชว์ผนังด้านในสีตามซับ
 * ใช้กับตัวเลือกที่ของอยู่ข้างใน (กระเป๋าเล็ก / ผ้าร่มซับใน) เพราะภาพถุงปิดมองไม่เห็น
 * คืนพิกัดกรอบกลับไปด้วย คนเรียกจะได้วางของข้างในไม่ให้ล้นกรอบ
 */
const cutBox = (g, { top = 54, hRatio = 0.64 } = {}) => ({ x: g.x + 26, y: g.top + top, w: g.w - 52, h: g.h * hRatio });

const cutaway = (g, { fill, edge, inner = "", chip = "top", box }) => {
  const b = box ?? cutBox(g);
  const cy = chip === "bottom" ? b.y + b.h - 48 : b.y + 12;
  return `
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="16" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="16" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-dasharray="11 8" opacity="0.35"/>
    ${inner}
    <rect x="${b.x + 12}" y="${cy}" width="208" height="36" rx="18" fill="#ffffff" opacity="0.94" stroke="#e2e8f0" stroke-width="2"/>
    <text x="${b.x + 116}" y="${cy + 25}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ภาพตัดให้เห็นด้านใน</text>`;
};

/** ซิปพาดปากถุง — เทปซิป + ฟันซิป + หัวซิปพร้อมห่วงดึง (k = สเกล ใช้ตอนวาดภาพซูม) */
const zipper = (cx, y, len, { tape, tapeEdge, teeth, k = 1 }) => {
  const th = 34 * k;
  const step = 19 * k;
  const tw = 11 * k;
  const x = cx - len / 2;
  const midY = y + th / 2;
  const t = [];
  for (let i = 0; i < Math.floor((len - 22 * k) / step); i++) {
    const tx = x + 10 * k + i * step;
    t.push(`<rect x="${tx}" y="${i % 2 ? midY - tw - 1 : midY + 1}" width="${tw}" height="${tw}" rx="${2.5 * k}" fill="${teeth}"/>`);
  }
  const sw = 42 * k;
  const sx = x + len - sw - 14 * k;
  return `
    <rect x="${x}" y="${y}" width="${len}" height="${th}" rx="${9 * k}" fill="${tape}" stroke="${tapeEdge}" stroke-width="${3 * k}"/>
    ${t.join("")}
    <line x1="${x + 6 * k}" y1="${midY}" x2="${x + len - 6 * k}" y2="${midY}" stroke="${tapeEdge}" stroke-width="${2 * k}" opacity="0.5"/>
    <path d="M${sx} ${midY - 15 * k} h${sw} a${8 * k} ${8 * k} 0 0 1 ${8 * k} ${8 * k} v${14 * k} a${8 * k} ${8 * k} 0 0 1 ${-8 * k} ${8 * k} h${-sw} l${-9 * k} ${-15 * k} z"
      fill="#cbd5e1" stroke="#94a3b8" stroke-width="${2.5 * k}"/>
    <line x1="${sx + sw * 0.5}" y1="${midY + 15 * k}" x2="${sx + sw * 0.5}" y2="${midY + 26 * k}" stroke="#94a3b8" stroke-width="${5 * k}"/>
    <ellipse cx="${sx + sw * 0.5}" cy="${midY + 45 * k}" rx="${11 * k}" ry="${19 * k}" fill="none" stroke="#94a3b8" stroke-width="${5 * k}"/>`;
};

/** กระดุมเหล็ก (แม่เหล็ก/แป๊ก) กลางปากถุง — วงแหวนโลหะ 2 ชั้น + แถบผ้าเย็บติด */
const snapButton = (cx, cy, r = 34) => `
  <rect x="${cx - 44}" y="${cy - 58}" width="88" height="96" rx="16" fill="${CLOTH_DARK}" stroke="${CLOTH_EDGE}" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#cbd5e1" stroke="#64748b" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.45}" fill="#94a3b8"/>
  <circle cx="${cx - r * 0.3}" cy="${cy - r * 0.35}" r="${r * 0.2}" fill="#f8fafc" opacity="0.85"/>`;

/** ลายพื้นจาง ๆ สำหรับผ้าซับสกรีนลาย */
const softPattern = (x, y, w, h) => {
  const out = [];
  const cols = 5;
  const rows = 5;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = x + w * ((c + (r % 2 ? 0.5 : 0)) / (cols - 0.5));
      const py = y + h * ((r + 0.45) / rows);
      out.push(
        r % 2 === c % 2
          ? `<circle cx="${px}" cy="${py}" r="10" fill="#7dd3fc" opacity="0.5"/>`
          : `<path d="M${px} ${py + 7} c -9 -8 -14 -14 -7 -20 c 4 -4 7 -1 7 2 c 0 -3 3 -6 7 -2 c 7 6 2 12 -7 20 z" fill="#f9a8d4" opacity="0.55"/>`
      );
    }
  return out.join("");
};

// ── การ์ดกลุ่ม OPTION ───────────────────────────────────────────────
/** ถุงกลางการ์ด — ขนาดเดียวกันทุกใบในกลุ่ม OPTION เทียบกันแล้วไม่สะดุดตา */
const optBag = () => bagGeom(W / 2, 300, 400, 380);

function optZip() {
  const g = optBag();
  return frame(`
    ${title("ซิป (สีขาว / สีดำ)", "ซิปพาดปากถุงตลอดแนว — ปิดแล้วของไม่หล่น")}
    ${extraBadge(10)}
    ${handles(g)}
    ${bagBody(g)}
    ${artwork(g.cx, g.top + g.h * 0.62, g.w * 0.42, 0.95)}
    ${zipper(g.cx, g.top - 17, g.w - 24, { tape: "#ffffff", tapeEdge: "#94a3b8", teeth: "#9ca3af" })}
    ${callout(g.cx - g.w * 0.28, g.top - 2, 66, 250, "ซิปตลอดแนวปากถุง", "start")}
    ${callout(g.cx + g.w * 0.38, g.top + 46, W - 66, 330, "หัวซิปมีห่วงดึง", "end")}
    ${foot(["คิดเพิ่ม +฿10 ต่อใบ", "เลือกสีซิปได้ที่หัวข้อ “สีซิป” — ขาว หรือ ดำ"])}`);
}

function optSnap() {
  const g = optBag();
  return frame(`
    ${title("กระดุมเหล็ก", "แป๊กเหล็กกลางปากถุง — กดปิดเร็ว ไม่ต้องรูดซิป")}
    ${extraBadge(10)}
    ${handles(g)}
    ${bagBody(g)}
    ${artwork(g.cx, g.top + g.h * 0.66, g.w * 0.40, 0.95)}
    ${snapButton(g.cx, g.top + 40)}
    ${callout(g.cx + 48, g.top + 26, W - 66, 250, "แป๊กเหล็กชุบเงา", "end")}
    ${callout(g.cx - 48, g.top + 76, 66, 330, "แถบผ้าเย็บติด", "start")}
    ${foot(["คิดเพิ่ม +฿10 ต่อใบ", "ติดกลางปากถุง 1 จุด · ใช้แทนซิปได้ในงบที่ถูกกว่า"])}`);
}

function optPocket(printed) {
  const g = optBag();
  const b = cutBox(g, { top: 34, hRatio: 0.78 }); // กรอบภาพตัดขยับขึ้นชิดริมพับ ช่องจะได้เย็บติดปากถุงจริง
  const pw = b.w - 96;
  const px = b.x + 48;
  const py = b.y + 8;   // ปากช่องอยู่ใต้ริมพับปากถุง
  const ph = 218;       // ก้นช่องลึกลงมาราวครึ่งใบ
  const pocket = `
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="${printed ? "#fdf7e8" : "#f8f2e4"}" stroke="${CLOTH_EDGE}" stroke-width="3"/>
    <line x1="${px + 6}" y1="${py + 20}" x2="${px + pw - 6}" y2="${py + 20}" stroke="${STITCH}" stroke-width="2.5" stroke-dasharray="8 6" opacity="0.85"/>
    ${printed
      ? artwork(px + pw / 2, py + ph * 0.62, ph * 0.66)
      : `<text x="${px + pw / 2}" y="${py + ph * 0.68}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#a8a29e">ผ้าพื้น ไม่สกรีน</text>`}`;
  return frame(`
    ${title(printed ? "กระเป๋าเล็กด้านใน (สกรีน)" : "กระเป๋าเล็กด้านใน (ไม่สกรีน)", printed ? "ช่องเก็บของเล็กด้านใน + สกรีนลายบนตัวช่อง" : "ช่องเก็บของเล็กด้านใน เย็บติดผนังถุง")}
    ${extraBadge(printed ? 20 : 15)}
    ${handles(g)}
    ${bagBody(g)}
    ${cutaway(g, { fill: "#e3d2ae", edge: CLOTH_EDGE, inner: pocket, chip: "bottom", box: b })}
    ${callout(px + pw - 8, py + 12, W - 66, 290, "ปากช่องเย็บริม", "end")}
    ${callout(px + 8, py + ph - 12, 66, 650, "ช่องเก็บของเล็ก", "start")}
    ${foot([`คิดเพิ่ม +฿${printed ? 20 : 15} ต่อใบ`, printed ? "ลายบนช่องเล็กใช้ไฟล์เดียวกับลายหลักได้" : "อยากได้ลายบนช่องเล็กด้วย เลือกแบบ (สกรีน) แทน"])}`);
}

function optTag() {
  const g = bagGeom(W / 2 - 120, 300, 340, 360);
  const tw = 150;
  const th = 80;
  const tx = g.x + g.w - 18;
  const ty = g.top + 190;
  return frame(`
    ${title("ป้ายแท็ก", "ป้ายผ้าเย็บติดตะเข็บข้าง — ใส่ชื่อแบรนด์/ข้อความได้")}
    ${extraBadge(3)}
    ${handles(g)}
    ${bagBody(g)}
    ${artwork(g.cx, g.top + g.h * 0.56, g.w * 0.42, 0.95)}
    <!-- ป้ายผ้าพับครึ่ง เย็บติดตะเข็บข้าง -->
    <rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
    <line x1="${tx}" y1="${ty + 13}" x2="${tx + tw}" y2="${ty + 13}" stroke="${STITCH}" stroke-width="2.5" stroke-dasharray="7 6"/>
    <text x="${tx + tw / 2}" y="${ty + 48}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">iDucky</text>
    <text x="${tx + tw / 2}" y="${ty + 69}" font-family="${TH}" font-size="12" text-anchor="middle" fill="${SUB}">MADE IN THAILAND</text>
    ${callout(tx + tw, ty + 16, W - 66, 250, "เย็บติดตะเข็บข้าง", "end")}
    ${callout(tx + tw, ty + th - 14, W - 66, 400, "ใส่โลโก้/ข้อความได้", "end")}
    ${foot(["คิดเพิ่ม +฿3 ต่อใบ — ตัวเลือกที่ถูกที่สุดในรายการเสริม", "ตำแหน่งมาตรฐาน: ตะเข็บข้างขวา สูงจากก้นถุงประมาณ 1 ใน 3"])}`);
}

function optLining(printed) {
  const g = optBag();
  const b = cutBox(g);
  const inner = printed
    ? softPattern(b.x + 14, b.y + 54, b.w - 28, b.h - 74)
    : `<text x="${b.x + b.w / 2}" y="${b.y + b.h * 0.62}" font-family="${TH}" font-size="23" text-anchor="middle" fill="#94a3b8">ผ้าร่มสีขาวเรียบ</text>`;
  return frame(`
    ${title(printed ? "ผ้าร่ม ซับด้านใน (สกรีนลาย)" : "ผ้าร่ม ซับด้านใน (สีขาว)", printed ? "บุผ้าร่มเต็มด้านใน + สกรีนลายบนผ้าซับ" : "บุผ้าร่มเต็มด้านใน — ทรงอยู่ตัว ไม่เห็นตะเข็บ")}
    ${extraBadge(printed ? 50 : 35)}
    ${handles(g)}
    ${bagBody(g)}
    ${cutaway(g, { fill: printed ? "#f2fbff" : "#ffffff", edge: "#7dd3fc", inner })}
    ${callout(b.x + b.w - 10, b.y + b.h * 0.35, W - 66, 300, printed ? "ลายอยู่บนผ้าซับ" : "ผ้าร่มบุเต็มด้านใน", "end")}
    ${callout(b.x + 10, b.y + b.h - 26, 66, 620, "ปิดตะเข็บด้านใน", "start")}
    ${foot([`คิดเพิ่ม +฿${printed ? 50 : 35} ต่อใบ`, printed ? "ลายผ้าซับใช้ไฟล์แยกจากลายด้านนอกได้" : "อยากได้ลายบนผ้าซับด้วย เลือกแบบ (สกรีนลาย) แทน"])}`);
}

// ── การ์ดกลุ่ม "สีซิป" ──────────────────────────────────────────────
function zipColor(dark) {
  const g = bagGeom(W / 2, 320, 380, 320);
  const tape = dark ? "#1f2937" : "#ffffff";
  const tapeEdge = dark ? "#0f172a" : "#94a3b8";
  const teeth = dark ? "#64748b" : "#9ca3af";
  return frame(`
    ${title(dark ? "สีซิป: ดำ" : "สีซิป: ขาว", dark ? "เทปซิปสีดำ — ตัดกับผ้าดิบ เห็นเส้นซิปเป็นเส้นกราฟิก" : "เทปซิปสีขาว — กลืนไปกับผ้าดิบ ดูเรียบสะอาด")}
    ${handles(g)}
    ${bagBody(g)}
    ${artwork(g.cx, g.top + g.h * 0.62, g.w * 0.38, 0.95)}
    ${zipper(g.cx, g.top - 17, g.w - 24, { tape, tapeEdge, teeth })}
    <!-- แถบซูม 1.5 เท่า ให้เห็นสีเทปกับฟันซิปชัด ๆ ตั้งแต่ภาพย่อ -->
    <rect x="${W / 2 - 250}" y="668" width="500" height="156" rx="20" fill="#eef2f7" stroke="#dbe3ec" stroke-width="2"/>
    ${zipper(W / 2 - 24, 690, 400, { tape, tapeEdge, teeth, k: 1.5 })}
    ${foot(["ราคาเท่ากันทั้งสองสี — ส่วนเพิ่มคิดที่ตัวเลือก “ซิป” +฿10/ใบ แล้ว"])}`);
}

// ── การ์ดกลุ่ม "ขนาด" ───────────────────────────────────────────────
/** ราคาเรทที่ 1 ต่อใบ [ช่วง 1-10 ใบ, ช่วง 5000 ใบขึ้นไป] — จาก pricing.cells ใน DB */
const SIZES = [
  { name: "35x40cm", w: 35, h: 40, d: 0, shape: "ทรงแบน ไม่มีข้าง", price: [350, 95] },
  { name: "27x22x8cm", w: 27, h: 22, d: 8, shape: "ทรงเล็ก มีข้าง 8 ซม.", price: [370, 110] },
  { name: "40x30x10cm", w: 40, h: 30, d: 10, shape: "ทรงนอน มีข้าง 10 ซม.", price: [380, 120] },
  { name: "45x35x15cm", w: 45, h: 35, d: 15, shape: "ทรงใหญ่ มีข้าง 15 ซม.", price: [390, 130] },
  { name: "35x40x10cm", w: 35, h: 40, d: 10, shape: "ทรงตั้ง มีข้าง 10 ซม.", price: [400, 140] },
];
const PX = 7.3; // พิกเซลต่อเซนติเมตร — ค่าเดียวกันทุกการ์ด ขนาดในภาพจึงเทียบกันได้จริง
const GROUND = 690; // ก้นถุงทุกใบวางบรรทัดเดียวกัน

const dimArrowH = (x1, x2, y, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <path d="M${x1 + 12} ${y - 8} L${x1} ${y} L${x1 + 12} ${y + 8} Z" fill="${CYAN}"/>
  <path d="M${x2 - 12} ${y - 8} L${x2} ${y} L${x2 - 12} ${y + 8} Z" fill="${CYAN}"/>
  <rect x="${(x1 + x2) / 2 - 62}" y="${y + 12}" width="124" height="40" rx="12" fill="#ecfeff" stroke="#a5f3fc" stroke-width="2"/>
  <text x="${(x1 + x2) / 2}" y="${y + 40}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

const dimArrowV = (y1, y2, x, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <path d="M${x - 8} ${y1 + 12} L${x} ${y1} L${x + 8} ${y1 + 12} Z" fill="${CYAN}"/>
  <path d="M${x - 8} ${y2 - 12} L${x} ${y2} L${x + 8} ${y2 - 12} Z" fill="${CYAN}"/>
  <rect x="${x - 136}" y="${(y1 + y2) / 2 - 20}" width="124" height="40" rx="12" fill="#ecfeff" stroke="#a5f3fc" stroke-width="2"/>
  <text x="${x - 74}" y="${(y1 + y2) / 2 + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

function sizeArt(s) {
  const fw = s.w * PX;
  const fh = s.h * PX;
  const dp = s.d * PX;
  const dx = dp * 0.72;
  const dy = dp * 0.5;
  const x = (W - (fw + dx)) / 2 - 10; // เผื่อที่ป้ายวัดฝั่งซ้าย
  const top = GROUND - fh;
  const g = bagGeom(x + fw / 2, top, fw, fh);

  const side = s.d
    ? `<polygon points="${x + fw},${top} ${x + fw + dx},${top - dy} ${x + fw + dx},${GROUND - dy} ${x + fw},${GROUND}" fill="${CLOTH_DARK}" stroke="${CLOTH_EDGE}" stroke-width="4"/>
       <polygon points="${x},${top} ${x + dx},${top - dy} ${x + fw + dx},${top - dy} ${x + fw},${top}" fill="#d9c49b" stroke="${CLOTH_EDGE}" stroke-width="4"/>`
    : "";

  const depthDim = s.d
    ? `<line x1="${x + fw + 6}" y1="${GROUND + 16}" x2="${x + fw + dx + 6}" y2="${GROUND - dy + 16}" stroke="${CYAN}" stroke-width="3"/>
       <text x="${x + fw + dx + 22}" y="${GROUND - dy + 20}" font-family="${TH}" font-size="22" font-weight="700" fill="${CYAN}">ข้าง ${s.d} ซม.</text>`
    : `<text x="${x + fw + 24}" y="${GROUND - 10}" font-family="${TH}" font-size="21" fill="${SUB}">ไม่มีข้าง</text>`;

  return frame(`
    ${title(`ขนาด ${s.w} × ${s.h}${s.d ? ` × ${s.d}` : ""} ซม.`, `${s.shape} — ผ้าดิบ 8 ออนซ์`)}
    <ellipse cx="${g.cx + dx / 2}" cy="${GROUND + 16}" rx="${(fw + dx) * 0.5}" ry="14" fill="#e2e8f0" opacity="0.7"/>
    ${side}
    ${handles(g, { sw: Math.max(10, fw * 0.045) })}
    ${bagBody(g)}
    ${artwork(g.cx, top + fh * 0.58, Math.min(fw, fh) * 0.5, 0.95)}
    ${dimArrowH(x, x + fw, GROUND + 52, `${s.w} ซม.`)}
    ${dimArrowV(top, GROUND, x - 22, `${s.h} ซม.`)}
    ${depthDim}
    ${foot([
      `฿${s.price[0]} ต่อใบ (1-10 ใบ) → ฿${s.price[1]} ต่อใบ (5,000 ใบขึ้นไป)`,
      "ทุกขนาดเทียบสเกลเดียวกันในภาพ · คลาดเคลื่อนได้ 2-5 ซม. ตามลักษณะผ้าดิบ",
    ])}`);
}

// ── รายการภาพทั้งหมด ────────────────────────────────────────────────
const ART = [
  { name: "opt-zip", svg: optZip(), group: "OPTION", choice: "ซิป (สีขาว / สีดำ)", note: "ซิปพาดปากถุง (+฿10)" },
  { name: "opt-snap", svg: optSnap(), group: "OPTION", choice: "กระดุกเหล็ก", note: "กระดุมเหล็กกลางปากถุง (+฿10)" },
  { name: "opt-pocket-plain", ver: "v3", svg: optPocket(false), group: "OPTION", choice: "กระเป๋าเล็กด้านใน (ไม่สกรีน)", note: "ช่องเล็กด้านใน ไม่สกรีน (+฿15)" },
  { name: "opt-pocket-print", ver: "v3", svg: optPocket(true), group: "OPTION", choice: "กระเป๋าเล็กด้านใน (สกรีน)", note: "ช่องเล็กด้านใน สกรีน (+฿20)" },
  { name: "opt-tag", svg: optTag(), group: "OPTION", choice: "ป้ายแท็ก", note: "ป้ายผ้าตะเข็บข้าง (+฿3)" },
  { name: "opt-lining-white", svg: optLining(false), group: "OPTION", choice: "ผ้าร่ม ซับด้านใน (สีขาว)", note: "ผ้าร่มซับใน ขาว (+฿35)" },
  { name: "opt-lining-print", svg: optLining(true), group: "OPTION", choice: "ผ้าร่ม ซับด้านใน (สกรีนลาย)", note: "ผ้าร่มซับใน สกรีนลาย (+฿50)" },
  { name: "zipcolor-white", svg: zipColor(false), group: "สีซิป", choice: "ขาว", note: "ซิปขาว" },
  { name: "zipcolor-black", svg: zipColor(true), group: "สีซิป", choice: "ดำ", note: "ซิปดำ" },
  ...SIZES.map((s, i) => ({ name: `size-${i + 1}`, svg: sizeArt(s), group: "ขนาด", choice: s.name, note: `ขนาด ${s.name}` })),
];

const files = [];
for (const art of ART) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${art.name}-${art.ver ?? VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log(`\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา) ไฟล์อยู่ที่ ${OUT}/`); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc ──────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// กลุ่มชื่อซ้ำกันได้ (แยกด้วย showWhen) — ต้อง filter แล้ววนทุกกลุ่ม ไม่ใช่ find กลุ่มแรก
for (const f of files) {
  const hits = (data.options ?? []).filter((o) => o.label === f.group).flatMap((o) => (o.choices ?? []).filter((c) => c.name === f.choice));
  if (!hits.length) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`); process.exit(1); }
  for (const c of hits) c.imageSrc = f.url;
  f.hits = hits.length;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const f of files) {
  const got = back.data.options.filter((o) => o.label === f.group).flatMap((o) => (o.choices ?? []).filter((c) => c.name === f.choice)).map((c) => c.imageSrc);
  if (got.length !== f.hits || got.some((u) => u !== f.url)) { console.error("อ่านกลับไม่ตรง!", f.group, f.choice, got); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc ครบ ${files.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
