#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือก "ประเภทอะคริลิค" ของสินค้า Carabiner Acrylic
 *
 *   node scripts/carabiner-art.mjs [--out=<dir>]      # วาดลง .cache/carabiner/upload
 *
 * ทำแค่ตัวเลือกเดียวคือ "อะคริลิคใส" — อีกสองตัวใช้สวอตช์จริงจากชาร์ตสีกลาง
 * (ขาวขุ่น C-02 → c02 · สีพิเศษ → holo-rainbow · ดู scripts/acrylic-colors.mjs)
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องขึ้นเลขรุ่นใหม่เสมอ (ชุดนี้ -v1)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
// ลายที่ "สกรีน" บนชิ้นงานในภาพประกอบ = มาสคอตเป็ด iDucky ของฝ่าย Content
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 560);

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/carabiner/upload").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";
const METAL = "#cbd5e1";
const METAL_EDGE = "#94a3b8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  <text x="${W / 2}" y="112" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>`;

const foot = (lines) =>
  lines
    .map(
      (t, i) =>
        `<text x="${W / 2}" y="${H - 40 - (lines.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** ลายที่สกรีนบนชิ้นงาน — วางกลางแผ่นโดยคงสัดส่วนภาพจริง เว้นขอบให้เห็นเนื้ออะคริลิคใส */
const artwork = (cx, cy, box) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

/** ห่วงคาราไบเนอร์ (ตะขอสปริง) ที่เกี่ยวกับรูเจาะด้านบนของชิ้นงาน */
const carabiner = (cx, cy, w, h) => `
  <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${w / 2}"
    fill="none" stroke="${METAL}" stroke-width="13"/>
  <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${w / 2}"
    fill="none" stroke="${METAL_EDGE}" stroke-width="3"/>
  <path d="M${cx + w / 2 - 6} ${cy - h / 2 + 22} L${cx + w / 2 - 6} ${cy + h / 2 - 22}"
    stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.9"/>`;

const clearArt = frame(`
  ${title("อะคริลิคใส", "ชนิดมาตรฐาน · เนื้อใสมองทะลุ")}
  ${carabiner(350, 196, 96, 132)}
  <rect x="212" y="248" width="276" height="286" rx="26" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  <circle cx="350" cy="278" r="11" fill="#ffffff" stroke="${GLASS_EDGE}" stroke-width="3"/>
  <path d="M232 512 L468 274" stroke="#ffffff" stroke-width="26" opacity="0.55"/>
  <path d="M262 528 L488 298" stroke="#ffffff" stroke-width="12" opacity="0.4"/>
  ${artwork(350, 400, 232)}
  ${foot([
    "พิมพ์ระบบ UV ไดคัทตามลาย · เจาะรูเกี่ยวห่วงคาราไบเนอร์",
    "ราคาตามตารางคือชนิดนี้ (เท่ากับขาวขุ่น C-02)",
    "อยากได้กลิตเตอร์/โฮโลแกรม เลือก 'สีพิเศษ' ได้",
  ])}`);

const buf = await sharp(Buffer.from(clearArt)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
writeFileSync(`${OUT}/clear-plain-v1.jpg`, buf);
console.log(`🎨 clear-plain-v1.jpg (${Math.round(buf.length / 1024)} KB) → ${OUT}`);
