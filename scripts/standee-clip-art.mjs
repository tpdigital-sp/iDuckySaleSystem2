#!/usr/bin/env node
/**
 * เตรียมภาพของสินค้า "สแตนดี้ + คลิปหนีบ"
 *
 *   node scripts/standee-clip-art.mjs [--out=<dir>]
 *
 * ได้ 2 ชุด แล้วให้ scripts/add-standee-clip.ts --upload อัปขึ้น Supabase Storage:
 *   1. ภาพงานจริง/แผ่นข้อมูลจากเว็บตารางราคา (iduckyofficial-pricelists.com/pricestandy)
 *      photo-clip    งานจริง "สแตนดี้ + คลิปหนีบ" (แปะกาวสำหรับหนีบรูปที่ด้านหลัง)
 *      photo-addon   แผ่น "Standy สแตนดี้+ส่วนเสริม" — ช่องคลิปหนีบ บวกเพิ่ม 10 บาท
 *      photo-1/2     งานจริงสแตนดี้ (ไว้ให้เห็นทรงงาน + ฐาน)
 *      color-chart   ตารางสีอะคริลิคของร้าน (ใช้ในแท็บ "ชนิดอะคริลิค")
 *   2. ภาพประกอบตัวเลือก — วาดเป็น SVG แล้วเรนเดอร์ด้วย sharp ให้สไตล์เดียวกันทั้งชุด
 *      hero                  ภาพอธิบายสินค้า (ด้านหน้าสกรีนลาย · คลิปหนีบรูปที่ขอบบน)
 *      clip-detail           คลิปหนีบชิดขอบบน (ไม่ล้ำพ้นอะคริลิค) หนีบอะไรได้บ้าง
 *      size-6..size-20       ขนาดตัวสแตนดี้ (สเกลจริง แนวตั้ง+แนวนอนในภาพเดียว)
 *      base-3/6/7/8/9/10/11/12 ขนาดฐาน (มองจากด้านบน เทียบฐาน 3-5 ซม.)
 *      basescreen-no|yes     ฐานสกรีนลาย / ไม่สกรีน
 *      baseshape-round|square|special  ทรงฐาน (พิเศษ = ปลีก +10 · ส่ง +5 บาท/ชิ้น)
 *      screen-1|screen-2     งานสกรีน 1 ด้าน / 2 ด้าน
 *      layout-portrait|landscape  ตัวสแตนดี้แนวตั้ง / แนวนอน
 *      clear-plain           อะคริลิคใส (ตัวเลือกมาตรฐาน · ขาวขุ่น C-02 ใช้สวอตช์จริงจากชาร์ตสีกลาง)
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ (ขยับ REV ที่สคริปต์ add-)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
// ลายที่ "สกรีน" บนชิ้นงานในภาพประกอบ = มาสคอตเป็ด iDucky ของฝ่าย Content (น่ารักกว่าวาดเอง)
import { mascotDataUri } from "./iducky-assets.mjs";

let MASCOT = null;
/** โหลดมาสคอตครั้งเดียวตอนเริ่มเรนเดอร์ (ไม่ใช้ top-level await — สคริปต์อื่น import ไฟล์นี้ได้) */
const loadMascot = async () => (MASCOT ??= await mascotDataUri("heart", 560));
// สคริปต์นี้รันตรง ๆ อย่างเดียว (ไม่มีไฟล์ไหน import) — ต้องโหลดมาสคอตก่อนสร้าง SVG
// เพราะภาพอย่าง hero/clearArt ประกอบเป็นค่าคงที่ตั้งแต่โหลดไฟล์ ถ้าโหลดทีหลัง MASCOT ยังเป็น null
await loadMascot();

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/clip/upload").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";
const CARD_FILL = "rgba(226,232,240,0.75)";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map(
      (t, i) =>
        `<text x="${W / 2}" y="${H - 40 - (lines.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** เส้นบอกขนาดแนวตั้ง */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y1}" x2="${x + 12}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 12}" y1="${y2}" x2="${x + 12}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 18}" y="${(y1 + y2) / 2 + 10}" font-family="${TH}" font-size="29" font-weight="700" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวนอน */
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 42}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** ลายสกรีนจำลองบนตัวสแตนดี้ */
/**
 * ลายที่สกรีนบนชิ้นงาน — ใช้มาสคอตเป็ด iDucky (ไฟล์จริงจากฝ่าย Content)
 * วางให้พอดีกรอบ (w × h) โดยคงสัดส่วนภาพไว้ · faded = ชั้นที่อยู่ลึกลงไป (งานหลายเลเยอร์)
 */
const artwork = (cx, cy, w, h, faded = false) => {
  const box = Math.min(w, h * 0.98);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${faded ? 0.4 : 1}"/>`;
};


/** ฐานอะคริลิคมองแบบเฉียง */
const baseSideView = (cx, cy, rx, screened = false) => {
  const ry = rx * 0.26;
  const th = 15;
  const fill = screened ? "rgba(13,148,136,0.20)" : GLASS;
  const edge = screened ? "#0d9488" : GLASS_EDGE;
  return `
    <path d="M${cx - rx} ${cy} v${th} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${th} z" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${edge}" stroke-width="3"/>
    <rect x="${cx - rx * 0.42}" y="${cy - 7}" width="${rx * 0.84}" height="13" rx="6" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`;
};

/** คลิปหนีบ (มองจากด้านหลัง) — คลิปพลาสติกแปะกาวไว้กลางแผ่น เอาไว้หนีบรูป/การ์ด */
const clipPart = (cx, top, w, h) => `
  <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${Math.max(3, w * 0.16)}"
    fill="#ffffff" stroke="#94a3b8" stroke-width="3"/>
  <rect x="${cx - w * 0.3}" y="${top + h * 0.12}" width="${w * 0.6}" height="${h * 0.42}" rx="${Math.max(2, w * 0.1)}"
    fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
  <line x1="${cx - w / 2 + 3}" y1="${top + h * 0.72}" x2="${cx + w / 2 - 3}" y2="${top + h * 0.72}"
    stroke="#94a3b8" stroke-width="3"/>`;

// ── 1. ขนาดตัวสแตนดี้ 15-20 ซม. (สเกลจริง เทียบกันได้ทั้งชุด) ───────────────
// ทำได้ทั้งแนวตั้งและแนวนอน (แบบงานจริงที่เป็นแผ่นกว้างวางการ์ดด้านหลัง)
// จึงวาดคู่กันในภาพเดียว สเกลเดียวกัน — ตัวเลข ซม. คือ "ด้านที่ยาวที่สุด" ทั้งสองแนว
const SIZES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const PX_PER_CM = 13; // 20cm = 260px (ต้องวางสองแนวในภาพเดียว จึงย่อสเกลลง)
const GROUND = 520;
/** สัดส่วนด้านสั้นต่อด้านยาวของตัวงาน (ใช้วาดให้ดูเป็นแผ่นสแตนดี้) */
const RATIO = 0.72;
/** คลิปหนีบพลาสติก — กว้างประมาณ 2.5 ซม. สูงประมาณ 3 ซม. (วาดสเกลเดียวกับตัวสแตนดี้) */
const CLIP_W_CM = 2.5;
const CLIP_H_CM = 3;

/** เส้นบอกขนาดแนวตั้ง ป้ายอยู่ "ซ้าย" ของเส้น (ใช้เมื่อฝั่งขวามีรูปอื่นอยู่) */
const dimVLeft = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x - 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="end" fill="${CYAN}">${label}</text>`;

/** เส้นบอกขนาดแนวนอน ป้ายอยู่ "เหนือ" เส้น */
const dimHUp = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y - 16}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** ตัวสแตนดี้ 1 ตัว (ลายด้านหน้า + คลิปหนีบคร่อมขอบบน) พร้อมฐาน */
function body(cx, bottom, w, h, landscape, showClipLabel = true) {
  const clipW = Math.max(16, CLIP_W_CM * PX_PER_CM);
  const clipH = Math.max(20, CLIP_H_CM * PX_PER_CM);
  const top = bottom - h;
  // ทางร้านติดคลิปไว้ "ชิดขอบบน" ของตัวงาน (หนีบรูปได้ง่ายกว่าติดกลางแผ่น)
  // ⚠️ ตัวคลิปไม่ล้ำพ้นขอบอะคริลิค — วาดให้อยู่ในกรอบแผ่นทั้งชิ้น (เส้นประ = มองทะลุจากด้านหน้า)
  const artCy = landscape ? top + h * 0.46 : top + h * 0.36;
  const artW = landscape ? w * 0.62 : w * 0.82;
  const artH = landscape ? h * 0.55 : h * 0.46;
  const clipX = cx - clipW / 2;
  const clipY = top + Math.max(4, h * 0.03);
  return `
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${Math.min(28, Math.min(w, h) * 0.14)}"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(cx, artCy, artW, artH)}
    <rect x="${clipX}" y="${clipY}" width="${clipW}" height="${clipH}" rx="4"
      fill="rgba(226,232,240,0.9)" stroke="#94a3b8" stroke-width="3" stroke-dasharray="7 5"/>
    ${
      showClipLabel && clipW > 26
        ? `<text x="${cx + clipW / 2 + 8}" y="${clipY + clipH * 0.6}" font-family="${TH}" font-size="16" fill="${SUB}">คลิปชิดขอบบน</text>`
        : ""
    }
    ${baseSideView(cx, bottom + 26, Math.max(58, w * 0.46))}`;
}

function sizeArt(cm) {
  const long = cm * PX_PER_CM;
  const short = long * RATIO;
  const bottom = GROUND;
  // ซ้าย = แนวตั้ง (สูง = ขนาดที่สั่ง) · ขวา = แนวนอน (กว้าง = ขนาดที่สั่ง)
  const cxP = 225;
  const cxL = 500;
  const ghost = 20 * PX_PER_CM;
  return frame(`
    ${title(`ตัวสแตนดี้ ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)")}
    <text x="${cxP}" y="172" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">แนวตั้ง</text>
    <text x="${cxL}" y="172" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">แนวนอน</text>
    ${
      cm < 20
        ? `<rect x="${cxP - (ghost * RATIO) / 2}" y="${bottom - ghost}" width="${ghost * RATIO}" height="${ghost}" rx="28"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>`
        : ""
    }
    ${body(cxP, bottom, short, long, false)}
    ${dimVLeft(cxP - short / 2 - 20, bottom - long, bottom, `${cm} ซม.`)}
    ${body(cxL, bottom, long, short, true)}
    ${dimHUp(bottom - short - 30, cxL - long / 2, cxL + long / 2, `${cm} ซม.`)}
    ${foot([
      "คลิปหนีบแปะชิดขอบบน (ไม่ล้ำพ้นอะคริลิค) — หนีบรูป/การ์ด/โน้ตได้ง่าย",
      cm < 20
        ? "เส้นประ = ขนาดใหญ่สุด 20 ซม. · ราคาเท่ากันทั้งแนวตั้ง/แนวนอน"
        : "ขนาดใหญ่สุดที่สั่งได้ · ราคาเท่ากันทั้งแนวตั้ง/แนวนอน",
    ])}`);
}

/** ภาพตัวเลือก "แนววางงาน" — แนวตั้ง / แนวนอน (แบบแผ่นกว้างวางการ์ดด้านหลัง) */
function layoutArt(landscape) {
  const long = 18 * PX_PER_CM * 1.5;
  const short = long * RATIO;
  const bottom = 500;
  const w = landscape ? long : short;
  const h = landscape ? short : long;
  return frame(`
    ${title(landscape ? "แนวนอน" : "แนวตั้ง", landscape ? "ตัวงานเป็นแผ่นกว้าง คลิปชิดขอบบน" : "ตัวงานเป็นแผ่นสูง คลิปชิดขอบบน")}
    ${body(350, bottom, w, h, landscape)}
    ${foot([
      "ราคาเท่ากันทั้งสองแนว — ขนาดที่สั่งคือด้านที่ยาวที่สุด",
      landscape ? "เหมาะกับลายแนวนอน ตัวละครคู่ หรือหนีบรูปแนวนอน" : "เหมาะกับลายตัวละครเดี่ยว ตั้งได้สูงเด่น",
    ])}`);
}

// ── 2. ภาพอธิบายสินค้า (ด้านหน้า / ด้านหลัง) ──────────────────────────────
const hero = (() => {
  const h = 268;
  const w = h * 0.72;
  const lx = 208;
  const rx = 492;
  const top = 188;
  const bottom = top + h;
  const clipW = 46;
  const clipH = 56;
  return frame(`
    ${title("สแตนดี้ + คลิปหนีบ", "สกรีนลายด้านหน้า · คลิปหนีบรูปชิดขอบบน")}
    <rect x="${lx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(lx, top + h * 0.42, w, h)}
    ${baseSideView(lx, bottom + 22, 92)}
    <!-- รูปที่หนีบไว้ โผล่พ้นขอบบนของตัวสแตนดี้ (แบบงานจริง) -->
    <rect x="${rx - 54}" y="${top - 56}" width="108" height="104" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
    <text x="${rx}" y="${top - 26}" font-family="${TH}" font-size="18" text-anchor="middle" fill="${SUB}">รูป / การ์ด</text>
    <rect x="${rx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4" fill-opacity="0.9"/>
    ${clipPart(rx, top + 10, clipW, clipH)}
    <path d="M${rx + clipW / 2 + 16} ${top + 34} h30" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
    <text x="${rx + clipW / 2 + 22}" y="${top + 26}" font-family="${TH}" font-size="19" fill="${SUB}">คลิป</text>
    ${baseSideView(rx, bottom + 22, 92)}
    <text x="${lx}" y="${bottom + 92}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหน้า</text>
    <text x="${rx}" y="${bottom + 92}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหลัง</text>
    ${foot([
      "คลิปหนีบแปะชิดขอบบน ไม่ล้ำพ้นแผ่นอะคริลิค (+10 บาท/ชิ้น รวมในราคาแล้ว)",
      "หนีบรูป โฟโต้การ์ด โน้ต หรือการ์ดอวยพรได้ เปลี่ยนเองได้ตลอด",
    ])}`);
})();

// ── 3. ขนาดฐาน (มองจากด้านบน) ────────────────────────────────────────────
const BASES = [
  { key: 3, label: "ฐาน 3-5 ซม.", cm: 5, note: "ฐานมาตรฐานของงานตัวเล็ก (6-10 ซม.)" },
  // ⚠️ ตารางราคาส่งรวม 6-7 ซม. ไว้ช่องเดียว (15/25 บาท) แต่ "เรทปลีก 1-10 ชิ้น" คิด ซม. ละ 5 บาท
  //    ตั้งแต่ 7 ซม. ขึ้นไป → ต้องแยกให้ลูกค้าเลือกทีละ ซม. ไม่งั้นคิดราคาไม่ตรง
  { key: 6, label: "ฐาน 6 ซม.", cm: 6, note: "เหมาะกับตัวสแตนดี้ 10-12 ซม." },
  { key: 7, label: "ฐาน 7 ซม.", cm: 7, note: "เหมาะกับตัวสแตนดี้ 12-14 ซม." },
  { key: 8, label: "ฐาน 8 ซม.", cm: 8, note: "ตั้งได้มั่นคงขึ้น" },
  { key: 9, label: "ฐาน 9 ซม.", cm: 9, note: "ตั้งได้มั่นคงขึ้น" },
  { key: 10, label: "ฐาน 10 ซม.", cm: 10, note: "เหมาะกับตัวสแตนดี้ 15 ซม. ขึ้นไป" },
  { key: 11, label: "ฐาน 11 ซม.", cm: 11, note: "เหมาะกับตัวสแตนดี้ 18 ซม. ขึ้นไป" },
  { key: 12, label: "ฐาน 12 ซม.", cm: 12, note: "ฐานใหญ่สุดที่สั่งผ่านหน้าเว็บได้" },
];
const BASE_PX_PER_CM = 28; // 12cm = 336px
/** เรทปลีก 1-10 ชิ้น: ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว · เกินจากนั้นคิด ซม. ละ 5 บาท */
const FREE_UP_TO_CM = 6;
const BAHT_PER_CM = 5;
const retailBaseFee = (cm) => (cm > FREE_UP_TO_CM ? (cm - FREE_UP_TO_CM) * BAHT_PER_CM : 0);

function baseArt(b) {
  const r = (b.cm * BASE_PX_PER_CM) / 2;
  const std = (5 * BASE_PX_PER_CM) / 2;
  const cx = 350;
  const cy = 350;
  return frame(`
    ${title(b.label, retailBaseFee(b.cm) ? `${b.note} · เรทปลีก ซม. ละ ${BAHT_PER_CM} บาท` : b.note)}
    ${b.cm > 5 ? `<circle cx="${cx}" cy="${cy}" r="${std}" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="8 8"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    <rect x="${cx - r * 0.52}" y="${cy - 8}" width="${r * 1.04}" height="16" rx="8" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
    ${dimH(cy + r + 40, cx - r, cx + r, `${b.cm} ซม.`)}
    ${foot([
      b.cm > 5 ? "เส้นประ = ฐาน 3-5 ซม. (ขนาดเล็กสุด) ไว้เทียบ" : "ร่องกลางฐานไว้เสียบตัวสแตนดี้",
      retailBaseFee(b.cm)
        ? `1-10 ชิ้น +${retailBaseFee(b.cm)} บาท · 11 ชิ้นขึ้นไป คิดเพิ่มตามขนาด`
        : "1-10 ชิ้น ราคารวมฐานแล้ว · 11 ชิ้นขึ้นไป คิดเพิ่มตามขนาด",
    ])}`);
}

// ── 4. ฐานสกรีนลาย / ไม่สกรีน ────────────────────────────────────────────
const dotsDef = `
  <defs>
    <pattern id="dots" width="46" height="46" patternUnits="userSpaceOnUse">
      <circle cx="12" cy="12" r="8" fill="#fbbf24"/>
      <circle cx="34" cy="34" r="8" fill="#f472b6"/>
    </pattern>
  </defs>`;
const slot = (cx, cy) => `
  <rect x="${cx - 96}" y="${cy - 8}" width="192" height="16" rx="8" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`;

const baseScreenNo = frame(`
  ${title("ไม่สกรีนฐาน", "ฐานอะคริลิคใส เห็นทะลุ ไม่มีลาย")}
  <circle cx="350" cy="378" r="180" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  ${slot(350, 378)}
  ${foot([
    "1-10 ชิ้น: ฐาน 3-6 ซม. ไม่คิดเพิ่ม · 7 ซม. ขึ้นไป ซม. ละ 5 บาท",
    "11 ชิ้นขึ้นไป คิดตามขนาดฐาน (ซม.):",
    "3-5 +10 · 6-7 +15 · 8 +20 · 9 +25 · 10 +30 · 11 +35 · 12 +40",
  ])}`);

const baseScreenYes = frame(`
  ${dotsDef}
  ${title("สกรีนลายฐาน", "พิมพ์ลายลงบนฐาน คิดเพิ่มตามขนาดฐาน")}
  <circle cx="350" cy="378" r="180" fill="url(#dots)" opacity="0.55"/>
  <circle cx="350" cy="378" r="180" fill="rgba(13,148,136,0.18)" stroke="#0d9488" stroke-width="4"/>
  ${slot(350, 378)}
  ${foot([
    "1-10 ชิ้น: ค่าสกรีนฐาน +10 บาท (คิดแยกจากค่าฐานตามขนาด)",
    "11 ชิ้นขึ้นไป คิดตามขนาดฐาน (ซม.):",
    "3-5 +20 · 6-7 +25 · 8 +30 · 9 +35 · 10 +40 · 11 +45 · 12 +50",
  ])}`);

// ── 4.5 ทรงฐาน (กลม / สี่เหลี่ยม ไม่บวกเพิ่ม · ทรงพิเศษ คิดเพิ่ม) ─────────
/** ฐานไดคัททรงดอกไม้ — ตัวอย่าง "ฐานทรงพิเศษ" (เส้นรอบรูปเส้นเดียว) */
function flowerPath(cx, cy, r) {
  const petals = 5;
  const step = (Math.PI * 2) / petals;
  const inner = r * 0.56;
  const at = (rad, ang) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
  let d = "";
  for (let i = 0; i < petals; i++) {
    const a = i * step - Math.PI / 2;
    const [sx, sy] = at(inner, a - step / 2);
    const [ex, ey] = at(inner, a + step / 2);
    const [c1x, c1y] = at(r * 1.22, a - step * 0.3);
    const [c2x, c2y] = at(r * 1.22, a + step * 0.3);
    d += `${i === 0 ? `M${sx.toFixed(1)} ${sy.toFixed(1)}` : ""} C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }
  return `<path d="${d} Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4" stroke-linejoin="round"/>`;
}

const SHAPES = {
  "baseshape-round": {
    t: "ฐานทรงกลม",
    s: "ทรงมาตรฐาน — ไม่บวกเพิ่ม",
    draw: `<circle cx="350" cy="374" r="172" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>`,
    foot: ["ทรงมาตรฐานของร้าน ราคาตามตารางเลย", "เลือกขนาดฐานได้ 6-7 ถึง 12 ซม."],
  },
  "baseshape-square": {
    t: "ฐานทรงสี่เหลี่ยม",
    s: "ทรงมาตรฐาน — ไม่บวกเพิ่ม",
    draw: `<rect x="192" y="216" width="316" height="316" rx="22" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>`,
    foot: ["ทรงมาตรฐานของร้าน ราคาตามตารางเลย", "เลือกขนาดฐานได้ 6-7 ถึง 12 ซม."],
  },
  "baseshape-special": {
    t: "ฐานทรงพิเศษ",
    s: "ไดคัทตามทรงที่ออกแบบ (เช่น ดอกไม้ ดาว หัวใจ)",
    draw: flowerPath(350, 374, 182),
    foot: ["ราคาปลีก (1-10 ชิ้น) บวกเพิ่ม 10 บาท/ชิ้น", "11 ชิ้นขึ้นไป บวกเพิ่ม 5 บาท/ชิ้น"],
  },
};

const shapeArt = (s) => frame(`${title(s.t, s.s)}${s.draw}${slot(350, 374)}${foot(s.foot)}`);

// ── 5. งานสกรีน 1 ด้าน / 2 ด้าน ──────────────────────────────────────────
function screenArt(sides) {
  const h = 300;
  const w = h * 0.72;
  const lx = 208;
  const rx = 492;
  const top = 216;
  const two = sides === 2;
  return frame(`
    ${title(`สกรีน ${sides} ด้าน`, two ? "พิมพ์ลายทั้งด้านหน้าและด้านหลัง" : "พิมพ์ลายด้านหน้าด้านเดียว")}
    <text x="${lx}" y="168" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหน้า</text>
    <rect x="${lx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(lx, top + h * 0.3, w * 0.85, h * 0.55)}
    <text x="${rx}" y="168" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">ด้านหลัง</text>
    <rect x="${rx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${
      two
        ? artwork(rx, top + h * 0.3, w * 0.85, h * 0.55)
        : `<text x="${rx}" y="${top + h * 0.5}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${LINE}">ใสไม่มีลาย</text>`
    }
    ${clipPart(rx, top + 12, 40, 50)}
    ${foot([
      two
        ? "บวกตามขนาด · 6-7 ซม. +15 · 8-10 +25 · 11-13 +30"
        : "ราคามาตรฐานตามตาราง (ค่าคลิปหนีบรวมแล้ว)",
      two ? "14-16 +35 · 17 +40 · 18 +45 · 19 +50 · 20 +55 บาท/ชิ้น" : "คลิปหนีบอยู่ชิดขอบบนทุกแบบ",
    ])}`);
}

// ── 6. คลิปหนีบ (อะไหล่ที่แปะไว้ขอบบน) ──────────────────────────────────
const clipDetailArt = (() => {
  const h = 280;
  const w = h * 0.78;
  const cx = 350;
  const top = 300;
  return frame(`
    ${title("คลิปหนีบชิดขอบบน", "ติดชิดขอบบน ตัวคลิปไม่ล้ำพ้นอะคริลิค")}
    <rect x="${cx - 78}" y="${top - 176}" width="156" height="186" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
    <text x="${cx}" y="${top - 84}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">รูป / โฟโต้การ์ด</text>
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="30" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(cx, top + h * 0.5, w * 0.8, h * 0.5)}
    ${clipPart(cx, top + 14, 58, 72)}
    <path d="M${cx + 46} ${top + 44} h32" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
    <text x="${cx + 52}" y="${top + 36}" font-family="${TH}" font-size="19" fill="${SUB}">คลิปหนีบ</text>
    ${foot(["คลิปพลาสติกสีขาว กว้างประมาณ 2.5 ซม. ติดชิดขอบบน", "รูปที่หนีบโผล่พ้นขอบขึ้นไป แต่ตัวคลิปอยู่ในแผ่น"])}`);
})();

// ── 7. อะคริลิคใส (ตัวเลือกสีมาตรฐาน) ────────────────────────────────────
const clearArt = frame(`
  ${title("อะคริลิคใส", "ชนิดมาตรฐาน หนาประมาณ 3 มม. · เนื้อใสมองทะลุ")}
  <rect x="212" y="196" width="276" height="300" rx="26" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  <path d="M232 470 L468 220" stroke="#ffffff" stroke-width="26" opacity="0.55"/>
  <path d="M262 486 L488 246" stroke="#ffffff" stroke-width="12" opacity="0.4"/>
  ${artwork(350, 330, 276, 300)}
  ${foot([
    "อะคริลิคหนาประมาณ 3 มม. พิมพ์ระบบ UV",
    "ราคาตามตารางคือชนิดนี้ ไม่บวกเพิ่ม (เท่ากับขาวขุ่น C-02)",
    "อยากได้สี/กลิตเตอร์/โฮโลแกรม เลือกอะคริลิคพิเศษได้ (คิดเพิ่มตามขนาด)",
  ])}`);

// ── เขียนไฟล์ ────────────────────────────────────────────────────────────
async function render(name, svg) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

/** ภาพจากเว็บตารางราคา (id ของ static.wixstatic.com) + วิธีครอป */
const PHOTOS = {
  // งานจริง "สแตนดี้ + คลิปหนีบ" — ตัดแถบข้อความด้านล่างของภาพโปรโมทออก
  "photo-clip": { id: "959b83_34f6efe10db8414e8c736ef01a872c34~mv2", crop: (w, h) => ({ left: 0, top: 0, width: w, height: Math.round(h * 0.8) }) },
  // แผ่น "Standy สแตนดี้+ส่วนเสริม" — เอาครึ่งล่างที่มีช่องคลิปหนีบ บวกเพิ่ม 10 บาท
  "photo-addon": {
    id: "959b83_e15a0e03158f45df911859db6f6dcd4d~mv2",
    crop: (w, h) => ({ left: 0, top: Math.round(h * 0.5), width: w, height: Math.round(h * 0.5) }),
  },
  "photo-1": { id: "959b83_a85460c7247c4b06b76f9a1342f1f801~mv2" },
  "photo-2": { id: "959b83_a676cebfeb7740988332073cb37decb9~mv2" },
  "color-chart": { id: "959b83_ece384645d784b25ab624c67f2cbd4d8~mv2" },
};

async function photos() {
  for (const [name, spec] of Object.entries(PHOTOS)) {
    const res = await fetch(`https://static.wixstatic.com/media/${spec.id}.jpg`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    let img = sharp(Buffer.from(await res.arrayBuffer()));
    if (spec.crop) {
      const meta = await img.metadata();
      img = img.extract(spec.crop(meta.width, meta.height));
    }
    const buf = await img
      .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    writeFileSync(`${OUT}/${name}.jpg`, buf);
    console.log(`📷 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
}

await photos();
await render("hero", hero);
for (const cm of SIZES) await render(`size-${cm}`, sizeArt(cm));
for (const b of BASES) await render(`base-${b.key}`, baseArt(b));
for (const [name, sh] of Object.entries(SHAPES)) await render(name, shapeArt(sh));
await render("basescreen-no", baseScreenNo);
await render("basescreen-yes", baseScreenYes);
await render("screen-1", screenArt(1));
await render("screen-2", screenArt(2));
await render("clip-detail", clipDetailArt);
await render("clear-plain", clearArt);
await render("layout-portrait", layoutArt(false));
await render("layout-landscape", layoutArt(true));
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
