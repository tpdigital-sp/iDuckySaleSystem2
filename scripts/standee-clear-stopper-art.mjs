#!/usr/bin/env node
/**
 * ภาพจำลองตัวเลือกของ "สแตนดี้อะคริลิค + จุกใส" (id: new-mt1k6h3q-6601)
 *
 *   node scripts/standee-clear-stopper-art.mjs             # วาดลง .cache/standee-clear-stopper/upload
 *   node scripts/standee-clear-stopper-art.mjs --upload    # อัปขึ้น Storage products/standee-clear-stopper/
 *
 * งานนี้เป็นอะคริลิค 2 ชิ้นประกบกันด้วย "จุกใส" (แผ่นบนหมุน/ขยับได้) แล้วเสียบลงฐานสแตนดี้
 * ภาพชุดนี้จึงต้องเล่าให้ครบ 3 ส่วนในภาพเดียว: ตัวสแตนดี้ (แผ่นล่าง) · แผ่นบนใส · ฐาน
 *
 *   body-3 … body-20   ตัวสแตนดี้เป็นตัวเอก (สเกลจริงเทียบกันได้ · 20 ซม. = 400 px) มีฐาน + แผ่นบนตัวอย่าง
 *   top-2 … top-10     แผ่นบนใสเป็นตัวเอก — ตัวสแตนดี้เป็นเส้นประอยู่หลัง + บอกค่าแผ่นบนขนาดนั้น
 *   parts              ภาพอธิบายส่วนประกอบทั้งชุด (ใช้ในแท็บ/แกลเลอรี)
 *   stopper            ภาพซูมจุกใส — แกนกลางที่ยึดสองแผ่นเข้าด้วยกัน
 *
 * สไตล์ภาพยึดชุดเดียวกับ standy-option-art.mjs + keyring-stopper-plates-art.mjs (กรอบขาว หัวเรื่อง เส้นบอกขนาด)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพแล้วให้ขยับ REV
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";

const UPLOAD = process.argv.includes("--upload");
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/standee-clear-stopper/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

/** โฟลเดอร์บน Storage อ่านออกกว่า id ร่าง (new-mt1k6h3q-6601) — build script ประกอบ URL ชุดเดียวกันนี้ */
export const FOLDER = "standee-clear-stopper";
export const PREFIX = "optart";
export const REV = "v1";

const MASCOT = await mascotDataUri("heart", 560);

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
/** แผ่นล่าง (ตัวสแตนดี้) = ชิ้นหลัก วาดเข้มกว่า */
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";
/** แผ่นบน = อะคริลิคใส วาดจางกว่าให้แยกออกว่าเป็นคนละชิ้น */
const CLEAR = "rgba(226,232,240,0.55)";
const CLEAR_EDGE = "#7dd3fc";

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

/** จุกใส — แกนกลางที่ยึดแผ่นบนกับแผ่นล่างไว้ด้วยกัน (หมุนได้) */
const stopper = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(241,245,249,0.92)" stroke="#94a3b8" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <path d="M${cx - r * 0.72} ${cy - r * 0.28} a${r} ${r} 0 0 1 ${r * 0.68} -${r * 0.6}" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.9"/>`;

/** ฐานอะคริลิคมองแบบเฉียง (ชุดเดียวกับ standy-option-art) */
const baseSideView = (cx, cy, rx) => {
  const ry = Math.max(8, rx * 0.26);
  const th = 14;
  return `
    <path d="M${cx - rx} ${cy} v${th} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${th} z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
    <rect x="${cx - rx * 0.44}" y="${cy - 6}" width="${rx * 0.88}" height="12" rx="6" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`;
};

/** ป้ายกำกับชิ้นส่วน วางใต้หัวเรื่อง ไม่ทับชิ้นงาน */
const legend = (items) =>
  items
    .map((it, i) => {
      const y = 146 + i * 30;
      return `<rect x="54" y="${y - 15}" width="22" height="22" rx="7" fill="${it.fill}" stroke="${it.stroke}" stroke-width="3"/>
      <text x="86" y="${y + 3}" font-family="${TH}" font-size="19" fill="${SUB}">${it.text}</text>`;
    })
    .join("");

const LEG_BOTTOM = { fill: GLASS, stroke: GLASS_EDGE, text: "ตัวสแตนดี้ (แผ่นล่าง) — สกรีนลาย ไดคัทตามทรง" };
const LEG_TOP = { fill: CLEAR, stroke: CLEAR_EDGE, text: "แผ่นบน อะคริลิคใส — หมุน/ขยับรอบจุกได้" };

/* ── สเกลกลาง ─────────────────────────────────────────────────────────── */
const BODY_SIZES = Array.from({ length: 18 }, (_, i) => i + 3); // 3-20 ซม.
const TOP_SIZES = Array.from({ length: 9 }, (_, i) => i + 2); // 2-10 ซม.
const PX_PER_CM = 16; // 20 ซม. = 320 px
const GROUND = 520; // ระดับปากฐาน (ขอบล่างของตัวสแตนดี้)
const RATIO = 0.74; // กว้าง : สูง ของตัวอย่างชิ้นงาน
const CX = 300;

const plate = (cx, bottom, long) => {
  const h = long;
  const w = long * RATIO;
  return { x: cx - w / 2, y: bottom - h, w, h, cx, cy: bottom - h / 2, r: Math.min(26, h * 0.15) };
};

/** ค่าแผ่นบนต่อชิ้น ตามขนาด × ช่วงจำนวน (กติกาเดียวกับพวงกุญแจ + จุกสีใส) */
const topPlateFee = (cm) => [20, 15, 12].map((b) => b + (cm - 2) * 10);

/* ── ชุดที่ 1: ขนาดตัวสแตนดี้ (แผ่นล่าง) ─────────────────────────────── */
function bodyArt(cm) {
  const ghost = 20 * PX_PER_CM;
  const b = plate(CX, GROUND, cm * PX_PER_CM);
  // แผ่นบนตัวอย่าง 2 ซม. ประกบค่อนไปทางล่างของตัวสแตนดี้ (ของจริงหมุนรอบจุกที่กลางชิ้น)
  const tLong = Math.min(2 * PX_PER_CM, b.h * 0.5);
  const t = plate(b.cx, Math.min(GROUND - 8, b.y + b.h * 0.72 + tLong / 2), tLong);
  return frame(`
    ${title(`ตัวสแตนดี้ ${cm} ซม.`, "ชิ้นหลัก — วัดจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)")}
    ${legend([LEG_BOTTOM, LEG_TOP])}
    ${
      cm < 20
        ? `<rect x="${CX - (ghost * RATIO) / 2}" y="${GROUND - ghost}" width="${ghost * RATIO}" height="${ghost}" rx="26"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>`
        : ""
    }
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(b.cx, b.y + b.h * 0.36, b.w * 0.78, b.h * 0.5)}
    <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.r}" fill="${CLEAR}" stroke="${CLEAR_EDGE}" stroke-width="3"/>
    ${stopper(t.cx, t.y + t.h * 0.34, Math.max(9, Math.min(18, t.h * 0.2)))}
    ${baseSideView(CX, GROUND + 22, Math.max(54, b.w * 0.54))}
    ${dimV(CX + (ghost * RATIO) / 2 + 24, b.y, GROUND, `${cm} ซม.`)}
    ${foot([
      "อะคริลิคหนา 3 มม. · พิมพ์ระบบ UV · ไดคัทตามลาย",
      "ราคาที่แสดงรวมแผ่นบน + จุกใส + ฐานแล้ว",
      cm < 20 ? "เส้นประ = ขนาดใหญ่สุด 20 ซม. (ไว้เทียบขนาด)" : "ขนาดใหญ่สุดของเรทที่ 1",
    ])}`);
}

/* ── ชุดที่ 2: ขนาดแผ่นบน (อะคริลิคใส) ───────────────────────────────── */
function topArt(cm) {
  const bodyCm = 10; // ตัวสแตนดี้อ้างอิงไว้เทียบสัดส่วน
  /** ชุดนี้เล่าเรื่องแผ่นบน จึงซูมใหญ่กว่าชุดขนาดตัว (แผ่นบน 2-10 ซม. เท่านั้น) */
  const PX = 30;
  const b = plate(CX, GROUND, bodyCm * PX);
  const t = plate(CX, Math.min(GROUND - 6, b.y + b.h * 0.7 + (cm * PX) / 2), cm * PX);
  const [f1, f2, f3] = topPlateFee(cm);
  return frame(`
    ${title(`แผ่นบน ${cm} ซม.`, "อะคริลิคใส ประกบหน้าตัวสแตนดี้ด้วยจุกใส")}
    ${legend([LEG_TOP, { ...LEG_BOTTOM, text: "เส้นประ = ตัวสแตนดี้ 10 ซม. (ไว้เทียบขนาด)" }])}
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>
    <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.r}" fill="${CLEAR}" stroke="${CYAN}" stroke-width="5"/>
    ${artwork(t.cx, t.y + t.h * 0.6, t.w * 0.62, t.h * 0.42, 0.9)}
    ${stopper(t.cx, t.y + t.h * 0.26, Math.max(10, Math.min(24, t.h * 0.12)))}
    ${baseSideView(CX, GROUND + 22, Math.max(54, b.w * 0.54))}
    ${dimV(Math.max(t.x + t.w, b.x + b.w) + 34, t.y, t.y + t.h, `${cm} ซม.`)}
    ${foot([
      "แผ่นบนเป็นอะคริลิคใสอย่างเดียว สกรีนได้ 1 ด้าน",
      `ค่าแผ่นบนขนาดนี้ +${f1} (1-10 ชิ้น) · +${f2} (11-29) · +${f3} (30 ชิ้นขึ้นไป)`,
      "รวมอยู่ในราคาที่หน้าสินค้าแสดงแล้ว",
    ])}`);
}

/* ── ชุดที่ 3: ภาพอธิบายส่วนประกอบ ───────────────────────────────────── */
function partsArt() {
  const PX = 26; // ภาพเล่าเรื่อง ไม่ต้องเทียบสเกลกับชุดอื่น — ซูมให้เห็นจุกใสชัด
  const b = plate(230, GROUND, 12 * PX);
  const t = plate(230, GROUND - 20, 5 * PX);
  const label = (x, y, text) =>
    `<text x="${x}" y="${y}" font-family="${TH}" font-size="21" fill="${SUB}">${text}</text>`;
  const lead = (x1, y1, x2, y2) =>
    `<path d="M${x1} ${y1} H${x2}" stroke="${CYAN}" stroke-width="3" stroke-linecap="round"/>
     <circle cx="${x1}" cy="${y1}" r="5" fill="${CYAN}"/>`;
  return frame(`
    ${title("ส่วนประกอบของงาน", "อะคริลิค 2 ชิ้น ประกบด้วยจุกใส แล้วเสียบลงฐาน")}
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(b.cx, b.y + b.h * 0.33, b.w * 0.76, b.h * 0.46)}
    <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.r}" fill="${CLEAR}" stroke="${CLEAR_EDGE}" stroke-width="4"/>
    ${artwork(t.cx, t.y + t.h * 0.6, t.w * 0.6, t.h * 0.42, 0.9)}
    ${stopper(t.cx, t.y + t.h * 0.26, 22)}
    ${baseSideView(230, GROUND + 22, 130)}
    ${lead(b.cx, b.y + 26, 470, b.y + 26)}${label(478, b.y + 32, "ตัวสแตนดี้ (แผ่นล่าง)")}
    ${lead(t.cx + t.w * 0.42, t.y + t.h * 0.62, 470, t.y + t.h * 0.62)}${label(478, t.y + t.h * 0.62 + 6, "แผ่นบน อะคริลิคใส")}
    ${lead(t.cx + 24, t.y + t.h * 0.26, 470, t.y + t.h * 0.26)}${label(478, t.y + t.h * 0.26 + 6, "จุกใส (หมุนได้)")}
    ${lead(360, GROUND + 30, 470, GROUND + 30)}${label(478, GROUND + 36, "ฐานสแตนดี้")}
    ${foot([
      "แผ่นบนหมุน/ขยับรอบจุกใสได้ — เล่นมุกลายซ้อนลายได้",
      "ราคาต่อชิ้นรวมทั้ง 2 แผ่น + จุกใส + ฐานแล้ว",
    ])}`);
}

/* ── ชุดที่ 4: ซูมจุกใส ──────────────────────────────────────────────── */
function stopperArt() {
  const b = plate(300, 500, 220);
  const t = plate(300, 512, 150);
  return frame(`
    ${title("จุกใส คืออะไร", "แกนใสที่ยึดอะคริลิค 2 แผ่นเข้าด้วยกัน")}
    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(b.cx, b.y + b.h * 0.32, b.w * 0.7, b.h * 0.4)}
    <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.r}" fill="${CLEAR}" stroke="${CLEAR_EDGE}" stroke-width="4"/>
    ${artwork(t.cx, t.y + t.h * 0.62, t.w * 0.58, t.h * 0.4, 0.9)}
    ${stopper(t.cx, t.y + t.h * 0.26, 30)}
    <path d="M${t.cx + 62} ${t.y + t.h * 0.26 - 46} a70 70 0 0 1 0 92" stroke="${CYAN}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M${t.cx + 62} ${t.y + t.h * 0.26 + 46} l-16 -8 l17 -11 z" fill="${CYAN}"/>
    ${baseSideView(300, 522, 120)}
    ${foot([
      "จุกใสสวมในรูเจาะของทั้งสองแผ่น แทนหมุด/ห่วงเหล็ก",
      "กันรูสึก/บิ่น และทำให้แผ่นบนหมุนได้ลื่น",
      "ค่าจุกใสชุดละ 10 บาท รวมในราคาที่แสดงแล้ว",
    ])}`);
}

/* ── เขียนไฟล์ ───────────────────────────────────────────────────────── */
const render = async (name, svg) => {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
};

for (const cm of BODY_SIZES) await render(`body-${cm}`, bodyArt(cm));
for (const cm of TOP_SIZES) await render(`top-${cm}`, topArt(cm));
await render("parts", partsArt());
await render("stopper", stopperArt());
console.log(`🎨 วาดแล้ว ${BODY_SIZES.length + TOP_SIZES.length + 2} ภาพ → ${OUT}`);

if (UPLOAD) {
  const env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const files = readdirSync(OUT).filter((f) => f.endsWith(".jpg"));
  let done = 0;
  for (const f of files) {
    const buf = await readFile(`${OUT}/${f}`);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${FOLDER}/${PREFIX}-${f.replace(/\.jpg$/, "")}-${REV}.jpg`, buf, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) throw new Error(`${f}: ${error.message}`);
    done++;
    if (done % 10 === 0 || done === files.length) console.log(`⬆️  ${done}/${files.length}`);
  }
}
