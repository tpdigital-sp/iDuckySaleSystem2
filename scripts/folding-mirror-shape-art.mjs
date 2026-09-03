#!/usr/bin/env node
/**
 * กระจกพับ (mirror-4) — ภาพตัวอย่างกลุ่ม "รูปทรง" 3 ตัวเลือก
 *
 *   node scripts/folding-mirror-shape-art.mjs            (วาดภาพลง .cache/mirror-4/upload ดูก่อน)
 *   node scripts/folding-mirror-shape-art.mjs --write    (+ อัปโหลด storage + เติม imageSrc + อ่านกลับเทียบ)
 *
 * วาดตลับกระจกพับ 3 ทรงพร้อมลูกศรวัดขนาด — สเกลเดียวกันทุกใบ (PPM คงที่) เทียบขนาดกันได้จริง:
 *   กระจกทรงสี่เหลี่ยม [ 61x95mm ] · กระจกทรงหัวใจ [70x70mm] · กระจกทรงกลม [70mm]
 * กลุ่มเป็น dropdown — ProductDetail โชว์ภาพของตัวที่เลือกข้างเมนู + เด้งแกลเลอรีตอนเปลี่ยน
 *
 * ⚠️ "รูปทรง" เป็นแกนตารางราคา (driverLabels) — สคริปต์นี้แตะแค่ imageSrc ห้ามแตะชื่อตัวเลือก
 * รันซ้ำได้: เขียนทับ imageSrc ตัวเดิม · แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ (CDN/Next แคช 30 วัน)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);

const PRODUCT_ID = "mirror-4";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mirror-4/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SHAPE_GROUP = "รูปทรง";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const PPM = 4.2; // px ต่อ mm — คงที่ทุกใบให้เทียบขนาดกันได้
const CY = 430; // จุดกึ่งกลางแนวตั้งของชิ้นงาน

/** กรอบการ์ด + หัวเรื่อง/หมายเหตุ (ชุดเดียวกับ folding-mirror-screen-option) */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ลูกศรวัดขนาด (ทรงเดียวกับ lighter-size-option-art) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 30;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** เนื้อฝาหนังขาว + ขอบ + ลายมาสคอต clip ในทรง — shapeSvg(fillAttr) คืน element ของทรงนั้น */
const lid = (shapeOf, cx, cy, artW, artH, id) => `
  <defs>
    <clipPath id="clip-${id}">${shapeOf("")}</clipPath>
    <radialGradient id="sheen-${id}" cx="0.32" cy="0.26" r="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#fdfcfa"/>
      <stop offset="1" stop-color="#eceef2"/>
    </radialGradient>
  </defs>
  ${shapeOf(`fill="url(#sheen-${id})" stroke="#d6dae1" stroke-width="3"`)}
  <image href="${HEART.uri}" x="${cx - artW / 2}" y="${cy - artH / 2}" width="${artW}" height="${artH}"
    preserveAspectRatio="xMidYMid meet" clip-path="url(#clip-${id})"/>`;

/** บานพับเงินบนสุด */
const hinge = (cx, topY, w = 66) => `
  <rect x="${cx - w / 2}" y="${topY - 14}" width="${w}" height="26" rx="9"
    fill="#9ca3af" stroke="#6b7280" stroke-width="2.5"/>
  <line x1="${cx}" y1="${topY - 12}" x2="${cx}" y2="${topY + 2}" stroke="#6b7280" stroke-width="2"/>`;

// ── ทรงสี่เหลี่ยม 61×95 มม. ──────────────────────────────────────────
function squareArt() {
  const cx = W / 2;
  const w = 61 * PPM;
  const h = 95 * PPM;
  const x = cx - w / 2;
  const y = CY - h / 2;
  const shapeOf = (a) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" ${a}/>`;
  const artW = w * 0.72;
  const body = `
  ${hinge(cx, y)}
  ${lid(shapeOf, cx, CY, artW, artW / HEART.ratio, "sq")}
  ${dim(x - 46, y, x - 46, y + h, "95 มม.")}
  ${dim(x, y + h + 40, x + w, y + h + 40, "61 มม.")}`;
  return card("กระจกทรงสี่เหลี่ยม 61 × 95 มม.", "ตลับกระจกพับ พิมพ์ลายตามสั่ง", body,
    "เปิดฝาด้านในเป็นกระจก · สกรีนลายได้ 1-2 ด้าน");
}

// ── ทรงหัวใจ 70×70 มม. ───────────────────────────────────────────────
function heartArt() {
  const cx = W / 2;
  const w = 70 * PPM;
  const h = 70 * PPM;
  const x = cx - w / 2;
  const yTop = CY - h / 2;
  // พาธหัวใจมาตรฐาน (viewBox 32×29.6) — ติ่งบนกลม ร่องลึก ปลายแหลมมน · สเกลเข้ากรอบ w×h
  // ทรงนี้ไม่วาดบานพับ — บานพับอยู่ตรงร่องหัวใจ วาดแล้วเห็นเป็นเศษเทาโผล่เหมือนตำหนิ
  const HD = "M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,21.2c6.1-9.3,16-12.1,16-21.2C32,3.8,28.2,0,23.6,0z";
  const sx = w / 32;
  const sy = h / 29.6;
  const shapeOf = (a) => `<path d="${HD}" transform="translate(${x},${yTop}) scale(${sx},${sy})" ${a.replace('stroke-width="3"', `stroke-width="${(3 / ((sx + sy) / 2)).toFixed(3)}"`)}/>`;
  const artW = w * 0.46; // ย่อกว่าทรงอื่น — กันหัวมาสคอตโดนร่องหัวใจตัดแหว่ง
  const body = `
  ${lid(shapeOf, cx, yTop + h * 0.47, artW, artW / HEART.ratio, "ht")}
  ${dim(x - 52, yTop, x - 52, yTop + h, "70 มม.")}
  ${dim(x, yTop + h + 40, x + w, yTop + h + 40, "70 มม.")}`;
  return card("กระจกทรงหัวใจ 70 × 70 มม.", "ตลับกระจกพับ พิมพ์ลายตามสั่ง", body,
    "เปิดฝาด้านในเป็นกระจก · สกรีนลายได้ 1-2 ด้าน");
}

// ── ทรงกลม 70 มม. ────────────────────────────────────────────────────
function roundArt() {
  const cx = W / 2;
  const R = (70 * PPM) / 2;
  const shapeOf = (a) => `<circle cx="${cx}" cy="${CY}" r="${R}" ${a}/>`;
  const artW = R * 1.15;
  const body = `
  ${hinge(cx, CY - R)}
  ${lid(shapeOf, cx, CY, artW, artW / HEART.ratio, "rd")}
  ${dim(cx - R, CY + R + 40, cx + R, CY + R + 40, "70 มม.")}`;
  return card("กระจกทรงกลม 70 มม.", "ตลับกระจกพับ พิมพ์ลายตามสั่ง — เส้นผ่านศูนย์กลาง 70 มม.", body,
    "เปิดฝาด้านในเป็นกระจก · สกรีนลายได้ 1-2 ด้าน");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = [
  { file: `shape-square-${VER}.jpg`, svg: squareArt(), choice: "กระจกทรงสี่เหลี่ยม [ 61x95mm ]" },
  { file: `shape-heart-${VER}.jpg`, svg: heartArt(), choice: "กระจกทรงหัวใจ [70x70mm]" },
  { file: `shape-round-${VER}.jpg`, svg: roundArt(), choice: "กระจกทรงกลม [70mm]" },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${SHAPE_GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เติม imageSrc ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${PRODUCT_ID}/`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const g = (data.options ?? []).find((o) => o.label === SHAPE_GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${SHAPE_GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${SHAPE_GROUP}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — ชื่อตัวเลือก (แกนราคา) ต้องไม่ขยับ + imageSrc ลงครบ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === SHAPE_GROUP);
for (const j of JOBS) {
  const c = bg?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
  if (!back.data.pricing?.cells?.[j.choice]) { console.error("cell แกนราคาหาย!", j.choice); process.exit(1); }
}
console.log(`✓ ภาพตัวเลือก ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · cells แกนราคาครบ · savedAt =`, back.data.savedAt);
