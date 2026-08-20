#!/usr/bin/env node
/**
 * ภาพประกอบ "ขนาดแผ่นล่าง / ขนาดแผ่นบน" ของพวงกุญแจ + อะไหล่จุกสีใส
 *
 *   node scripts/keyring-stopper-plates-art.mjs [--out=<dir>]
 *
 * ทำไมต้องวาดใหม่: ภาพชุดเดิม (size-2..size-10) วาดเป็นอะคริลิค "แผ่นเดียว" และวาดจุกสีใสไว้ในรูตะขอ
 * แต่ของจริงเป็นอะคริลิค 2 ชิ้นประกบกัน โดยจุกสีใสอยู่ "กลางชิ้น" ทำหน้าที่เป็นแกนให้แผ่นบนหมุน/ขยับได้
 * ส่วนรูตะขออยู่มุมบนแยกต่างหาก (ดูคลิป dook-dik keychain ในแกลเลอรีสินค้า)
 *
 * ได้ 2 ชุด (สเกลจริงเทียบกันได้ทั้งชุด · 10 ซม. = 380 px):
 *   size-2..size-10   แผ่นล่างเป็นตัวเอก — แผ่นบน 2 ซม. ประกบให้ดูเป็นตัวอย่าง
 *   top-2..top-10     แผ่นบนเป็นตัวเอก — แผ่นล่างเป็นเส้นประอยู่หลัง + บอกราคาแผ่นบนขนาดนั้น
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดแผ่นล่างจึงขึ้นเป็น v4 (ของเดิม v3)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 560);

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/keyring-stopper/plates").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";
/** แผ่นบนเป็นอะคริลิคใส — วาดจางกว่าแผ่นล่างให้แยกออกว่าเป็นคนละชิ้น */
const CLEAR = "rgba(226,232,240,0.55)";
const CLEAR_EDGE = "#7dd3fc";

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const PX_PER_CM = 38;
const RATIO = 0.78; // กว้าง : ยาว ของชิ้นงานตัวอย่าง
const BASE_Y = 566; // ขอบล่างของชิ้นงาน

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="70" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="108" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 38 - (a.length - 1 - i) * 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** เส้นบอกขนาดแนวตั้ง ป้ายอยู่ขวาเส้น */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" fill="${CYAN}">${label}</text>`;

/** ลายที่สกรีนบนชิ้นงาน — มาสคอตเป็ดของฝ่าย Content */
const artwork = (cx, cy, w, h, opacity = 1) => {
  const box = Math.min(w, h * 0.98);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/** จุกสีใส — แกนกลางที่ยึดแผ่นบนกับแผ่นล่างไว้ด้วยกัน (หมุนได้) */
const stopper = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(241,245,249,0.9)" stroke="#94a3b8" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <path d="M${cx - r * 0.72} ${cy - r * 0.28} a${r} ${r} 0 0 1 ${r * 0.68} -${r * 0.6}" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.9"/>`;

/** ห่วง/โซ่ที่คล้องรูมุมบนของแผ่นล่าง */
const ring = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#94a3b8" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="2"/>`;

/** กรอบสี่เหลี่ยมมนของชิ้นงาน (คืนพิกัดไว้ให้วางของอื่นต่อ) */
const plateBox = (cx, bottom, long) => {
  const h = long;
  const w = long * RATIO;
  return { x: cx - w / 2, y: bottom - h, w, h, cx, cy: bottom - h / 2, r: Math.min(26, h * 0.16) };
};

/** แผ่นล่าง = ชิ้นหลัก มีลายสกรีน + รูตะขอมุมบน (ลายวางค่อนไปทางบน เผื่อที่ให้แผ่นบนประกบด้านล่าง) */
const bottomPlate = (b) => {
  const holeR = Math.max(7, Math.min(15, b.h * 0.05));
  const holeCx = b.x + b.w - holeR * 2.2;
  const holeCy = b.y + holeR * 2.2;
  return `
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(b.cx, b.y + b.h * 0.38, b.w * 0.66, b.h * 0.42)}
    <circle cx="${holeCx}" cy="${holeCy}" r="${holeR}" fill="#ffffff" stroke="#94a3b8" stroke-width="3"/>
    ${ring(holeCx + holeR * 0.2, holeCy - holeR * 1.9, holeR * 1.4)}`;
};

/** ป้ายกำกับชิ้นส่วน — จุดสีเล็ก ๆ + ข้อความ (วางมุมล่างซ้ายของภาพ ไม่ทับชิ้นงาน) */
const legend = (items) =>
  items
    .map((it, i) => {
      // วางไว้ใต้หัวเรื่อง เหนือกรอบเส้นประ — ไม่ให้ตัวหนังสือไปทับชิ้นงาน
      const y = 140 + i * 30;
      return `<rect x="54" y="${y - 15}" width="22" height="22" rx="7" fill="${it.fill}" stroke="${it.stroke}" stroke-width="3"/>
      <text x="86" y="${y + 3}" font-family="${TH}" font-size="19" fill="${SUB}">${it.text}</text>`;
    })
    .join("");

/**
 * แผ่นบน = อะคริลิคใส ประกบทับแผ่นล่าง มีจุกสีใสเป็นแกนกลาง
 * จุกวางค่อนไปทางบนของชิ้น ลายอยู่ใต้จุก — ของจริงจุกอยู่กลางชิ้นพอดี แต่ถ้าวาดทับกลางลาย
 * พอย่อเป็นรูปเล็กจะเห็นแต่จุก ไม่รู้ว่าเป็นชิ้นงานพิมพ์ลาย
 */
const topPlate = (t, { highlight = false } = {}) => `
  <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.r}"
    fill="${CLEAR}" stroke="${highlight ? CYAN : CLEAR_EDGE}" stroke-width="${highlight ? 5 : 4}"/>
  ${artwork(t.cx, t.y + t.h * 0.64, t.w * 0.6, t.h * 0.42, 0.9)}
  ${stopper(t.cx, t.y + t.h * 0.27, Math.max(10, Math.min(24, t.h * 0.11)))}`;

/* ── ชุดที่ 1: ขนาดแผ่นล่าง ─────────────────────────────────────── */
function bottomArt(cm) {
  const ghost = plateBox(300, BASE_Y, 10 * PX_PER_CM);
  const b = plateBox(300, BASE_Y, cm * PX_PER_CM);
  // แผ่นบนตัวอย่าง 2 ซม. วางเยื้องลงมาให้เห็นขอบทั้งสองชิ้น (ของจริงประกบกลางชิ้น)
  const tLong = 2 * PX_PER_CM;
  // แผ่นบนตัวอย่าง 2 ซม. ประกบค่อนไปทางล่างของแผ่นล่าง (ของจริงหมุนรอบจุกที่กลางชิ้น)
  const t = plateBox(b.cx, Math.min(BASE_Y - 6, b.y + b.h * 0.74 + tLong / 2), tLong);
  return frame(`
    ${title(`แผ่นล่าง ${cm} ซม.`, "ชิ้นหลัก — วัดจากด้านที่ยาวที่สุด ไม่นับรวมรูตะขอ")}
    ${cm < 10 ? `<rect x="${ghost.x}" y="${ghost.y}" width="${ghost.w}" height="${ghost.h}" rx="26" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>` : ""}
    ${bottomPlate(b)}
    ${topPlate(t)}
    ${dimV(ghost.x + ghost.w + 26, b.y, b.y + b.h, `${cm} ซม.`)}
    ${legend([
      { fill: GLASS, stroke: GLASS_EDGE, text: "แผ่นล่าง (มีลาย) — ขนาดนี้" },
      { fill: CLEAR, stroke: CLEAR_EDGE, text: "แผ่นบน อะคริลิคใส — เลือกขนาดแยก" },
    ])}
    ${foot([
      "งานนี้เป็นอะคริลิค 2 ชิ้นเสมอ — ประกบกันด้วยจุกสีใสตรงกลาง",
      cm < 10 ? "เส้นประ = ขนาดใหญ่สุด 10 ซม. ในเรทนี้ (ไว้เทียบขนาด)" : "ขนาดใหญ่สุดของเรทที่ 1 ตามตารางเว็บ",
    ])}`);
}

/* ── ชุดที่ 2: ขนาดแผ่นบน ───────────────────────────────────────── */
const topPrice = (cm) => [20, 15, 12].map((p) => p + (cm - 2) * 10);

function topArt(cm) {
  // เส้นประ = แผ่นล่าง (ขนาดใหญ่สุด 10 ซม.) ไว้เทียบว่าแผ่นบนที่เลือกใหญ่แค่ไหนเมื่อไปประกบ
  const ghost = plateBox(300, BASE_Y, 10 * PX_PER_CM);
  const t = plateBox(300, Math.min(BASE_Y - 10, ghost.y + ghost.h * 0.72 + (cm * PX_PER_CM) / 2), cm * PX_PER_CM);
  const [retail, mid, bulk] = topPrice(cm);
  return frame(`
    ${title(`แผ่นบน ${cm} ซม.`, "อะคริลิคใส — ประกบด้วยจุกสีใส หมุน/ขยับได้")}
    <rect x="${ghost.x}" y="${ghost.y}" width="${ghost.w}" height="${ghost.h}" rx="26" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 8"/>
    ${cm < 9 ? `<text x="${ghost.x + 14}" y="${ghost.y + 32}" font-family="${TH}" font-size="19" fill="#94a3b8">แผ่นล่าง (เลือกขนาดแยก)</text>` : ""}
    ${topPlate(t, { highlight: true })}
    ${dimV(ghost.x + ghost.w + 26, t.y, t.y + t.h, `${cm} ซม.`)}
    ${foot([
      `ราคาแผ่นบน ${cm} ซม. (รวมในราคาที่แสดงแล้ว)`,
      `1-10 ชิ้น ${retail} บาท · 11-29 ชิ้น ${mid} บาท · 30 ชิ้นขึ้นไป ${bulk} บาท/ชิ้น`,
    ])}`);
}

/* ── เรนเดอร์ ───────────────────────────────────────────────────── */
const render = async (name, svg) => {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
};

for (const cm of SIZES) await render(`size-${cm}`, bottomArt(cm));
for (const cm of SIZES) await render(`top-${cm}`, topArt(cm));
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
