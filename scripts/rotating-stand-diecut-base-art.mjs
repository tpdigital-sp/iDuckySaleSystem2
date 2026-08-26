#!/usr/bin/env node
/**
 * rotating-stand: ภาพประกอบกลุ่ม "ไดคัท" (ทรงกรอบ 3 แบบ) + "ขนาดฐาน" (ฐาน 3-10 ซม.)
 *
 *   node scripts/rotating-stand-diecut-base-art.mjs                    # วาดภาพลง .cache (ดูก่อน)
 *   node scripts/rotating-stand-diecut-base-art.mjs --upload           # + อัปขึ้น Supabase Storage
 *   node scripts/rotating-stand-diecut-base-art.mjs --upload --write   # + ผูก imageSrc เข้า DB
 *
 * ที่มา: ผู้ใช้ส่งภาพหน้าจอ 26 ส.ค. 69 — กลุ่ม ไดคัท / ขนาดฐาน ยังเป็นเมนูเปล่า "มีภาพประกอบด้วย"
 * วาดสไตล์เดียวกับชุด sizeadd-* ของสินค้านี้ (ดู rotating-stand-frame-art.mjs) มาสคอตเป็ดแขวนในกรอบ
 *   diecut-square-v1 | diecut-round-v1 | diecut-shape-v1     ← กลุ่ม "ไดคัท" (ทรงทั้งชุด กรอบ+ตัวแขวน)
 *   basesize-3-v1 … basesize-10-v1                           ← กลุ่ม "ขนาดฐาน" (3-4 มาตรฐาน · +ซม.ละ 10)
 * เก็บที่ storage products/rotating-stand-frame/ — ชื่อไฟล์ใหม่ทั้งหมด (ห้ามทับชื่อเดิม แคชค้าง)
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
const ID = "rotating-stand";
const IMG_DIR = "rotating-stand-frame";
const OUT = ".cache/rot/upload-frame-extra";
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("heart", 560);
const mascotArt = (cx, cy, w, h) => {
  const box = Math.min(w, h);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;
const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 42}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/* ── กลีบดอกไม้แบบชุด standee-rotating (LCG-free กำหนดตายตัว) — ใช้เป็นกรอบไดคัทตามทรง ── */
function flowerPath(cx, cy, r, petals = 8) {
  const inner = r * 0.86;
  const step = (Math.PI * 2) / petals;
  const at = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  let d = "";
  for (let i = 0; i < petals; i++) {
    const a = i * step - Math.PI / 2;
    const [sx, sy] = at(inner, a - step / 2);
    const [ex, ey] = at(inner, a + step / 2);
    const [c1x, c1y] = at(r * 1.22, a - step * 0.3);
    const [c2x, c2y] = at(r * 1.22, a + step * 0.3);
    d += `${i === 0 ? `M${sx.toFixed(1)} ${sy.toFixed(1)}` : ""} C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }
  return `${d} Z`;
}

/* ── ชุดกรอบ + ตัวแขวน + ฐาน โดยเปลี่ยนทรงกรอบตามแบบไดคัท ── */
function diecutSet(kind) {
  const cx = 350;
  const cy = 330;
  const baseY = 545;
  let outer = "";
  let windowShape = "";
  let hangTop, hangBottom;
  if (kind === "square") {
    const w = 300, h = 380, top = cy - h / 2;
    outer = `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="18" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>`;
    windowShape = `<rect x="${cx - w / 2 + 26}" y="${top + 26}" width="${w - 52}" height="${h - 52}" rx="${(w - 52) / 2}" fill="#ffffff" stroke="#bae6fd" stroke-width="3"/>`;
    hangTop = top + 32; hangBottom = top + h - 32;
  } else if (kind === "round") {
    const r = 190;
    outer = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>`;
    windowShape = `<circle cx="${cx}" cy="${cy}" r="${r - 30}" fill="#ffffff" stroke="#bae6fd" stroke-width="3"/>`;
    hangTop = cy - r + 36; hangBottom = cy + r - 36;
  } else {
    const r = 185;
    outer = `<path d="${flowerPath(cx, cy, r)}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4" stroke-linejoin="round"/>`;
    windowShape = `<circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="#ffffff" stroke="#bae6fd" stroke-width="3"/>`;
    hangTop = cy - r * 0.72 + 8; hangBottom = cy + r * 0.72 - 8;
  }
  return `
    ${outer}${windowShape}
    <line x1="${cx}" y1="${hangTop}" x2="${cx}" y2="${cy - 74}" stroke="${LINE}" stroke-width="4"/>
    <rect x="${cx - 34}" y="${cy - 82}" width="68" height="16" rx="6" fill="#e2e8f0" stroke="${LINE}" stroke-width="2"/>
    ${mascotArt(cx, cy + 26, 190, 150)}
    <line x1="${cx}" y1="${cy + 104}" x2="${cx}" y2="${hangBottom}" stroke="${LINE}" stroke-width="4"/>
    <path d="M${cx - 92} ${baseY} v16 a92 23 0 0 0 184 0 v-16 z" fill="rgba(148,197,255,0.28)" stroke="#7dd3fc" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${baseY}" rx="92" ry="23" fill="rgba(148,197,255,0.28)" stroke="#7dd3fc" stroke-width="3"/>`;
}

const DIECUTS = {
  "diecut-square-v1": { choice: "ทรงสี่เหลี่ยม", kind: "square", sub: "ทรงมาตรฐาน ไม่บวกเพิ่ม" },
  "diecut-round-v1": { choice: "ทรงกลม", kind: "round", sub: "ทรงมาตรฐาน ไม่บวกเพิ่ม" },
  "diecut-shape-v1": { choice: "ไดคัทตามทรง", kind: "shape", sub: "+20 บาท/ชิ้น (คิดทั้งชุด กรอบ + ตัวแขวน)" },
};

/* ── ขนาดฐาน 3-10 ซม. — ฐานสเกลตามจริง + กรอบจาง ๆ ให้เห็นว่าใหญ่ขึ้นเทียบชุด ── */
function baseSizeArt(cm) {
  const cx = 350;
  const baseY = 470;
  const rx = 24 * cm; // 3 ซม. = 72 … 10 ซม. = 240
  const ry = rx * 0.25;
  const fee = Math.max(0, cm - 4) * 10;
  const sub = fee === 0 ? "ขนาดมาตรฐาน · ราคารวมสกรีนลายฐานแล้ว" : `บวกเพิ่ม ซม.ละ 10 บาท = +${fee} บาท/ชิ้น`;
  const stdRx = 24 * 4; // เส้นประ = ขอบฐานมาตรฐาน 4 ซม. ไว้เทียบ
  return frame(`
    ${title(`ฐาน ${cm} ซม.`, sub)}
    <g opacity="0.35">
      <rect x="${cx - 95}" y="150" width="190" height="248" rx="14" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
      <rect x="${cx - 78}" y="167" width="156" height="214" rx="78" fill="#ffffff" stroke="#bae6fd" stroke-width="2"/>
      ${mascotArt(cx, 282, 120, 96)}
    </g>
    <line x1="${cx}" y1="398" x2="${cx}" y2="${baseY - ry - 14}" stroke="${LINE}" stroke-width="3" stroke-dasharray="6 6"/>
    ${cm > 4 ? `<ellipse cx="${cx}" cy="${baseY}" rx="${stdRx}" ry="${stdRx * 0.25}" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="8 8"/>` : ""}
    <path d="M${cx - rx} ${baseY} v18 a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-18 z" fill="rgba(148,197,255,0.28)" stroke="#7dd3fc" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${baseY}" rx="${rx}" ry="${ry}" fill="rgba(148,197,255,0.28)" stroke="#7dd3fc" stroke-width="3"/>
    ${dimH(baseY + 92, cx - rx, cx + rx, `${cm} ซม.`)}
    <text x="${W / 2}" y="${H - 26}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ฐานอะคริลิคใส · สกรีนลายฐานได้ในราคาเดิม (ฐานมาตรฐาน 3-4 ซม.)</text>`);
}

/* ── 1. วาด ── */
async function render(name, svg) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}
for (const [name, d] of Object.entries(DIECUTS))
  await render(name, frame(`${title(d.choice, d.sub)}${diecutSet(d.kind)}
    <text x="${W / 2}" y="${H - 26}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ทรงของทั้งชุด — กรอบอะคริลิค + ตัวแขวนด้านใน</text>`));
const BASE_SIZES = [3, 4, 5, 6, 7, 8, 9, 10];
for (const cm of BASE_SIZES) await render(`basesize-${cm}-v1`, baseSizeArt(cm));
console.log(`\n📁 ${readdirSync(OUT).length} ไฟล์ที่ ${OUT}`);

if (!UPLOAD) {
  console.log("(วาดอย่างเดียว — เติม --upload เพื่ออัปขึ้น storage · --write เพื่อผูกเข้า DB)");
  process.exit(0);
}

/* ── 2. อัปขึ้น storage ── */
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const URL_OF = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${IMG_DIR}/${name}.jpg`;
const NAMES = [...Object.keys(DIECUTS), ...BASE_SIZES.map((c) => `basesize-${c}-v1`)];
for (const name of NAMES) {
  const buf = readFileSync(`${OUT}/${name}.jpg`);
  const { error } = await sb.storage
    .from("product-images")
    .upload(`products/${IMG_DIR}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`อัป ${name} ไม่สำเร็จ — ${error.message}`);
  console.log(`☁️ ${name}.jpg`);
}

if (!WRITE) {
  console.log("(อัปแล้ว ยังไม่ผูกเข้า DB — เติม --write)");
  process.exit(0);
}

/* ── 3. ผูก imageSrc เข้ากลุ่ม ไดคัท / ขนาดฐาน ── */
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่ได้ — ${error.message}`);
const p = structuredClone(row.data);
const grp = (label) => {
  const g = (p.options ?? []).find((o) => o.label === label);
  if (!g) throw new Error(`ไม่เจอกลุ่ม "${label}"`);
  return g;
};
const diecut = grp("ไดคัท");
for (const [name, d] of Object.entries(DIECUTS)) {
  const c = diecut.choices.find((x) => x.name === d.choice);
  if (!c) throw new Error(`ไดคัท: ไม่เจอตัวเลือก "${d.choice}"`);
  c.imageSrc = URL_OF(name);
}
const base = grp("ขนาดฐาน");
for (const cm of BASE_SIZES) {
  const c = base.choices.find((x) => x.name === `ฐาน ${cm} ซม.` || x.name.startsWith(`ฐาน ${cm} ซม.`));
  if (!c) throw new Error(`ขนาดฐาน: ไม่เจอตัวเลือก "ฐาน ${cm} ซม."`);
  c.imageSrc = URL_OF(`basesize-${cm}-v1`);
}
const missDiecut = diecut.choices.filter((c) => !c.imageSrc).map((c) => c.name);
const missBase = base.choices.filter((c) => !c.imageSrc).map((c) => c.name);
if (missDiecut.length || missBase.length)
  throw new Error(`ยังมีตัวเลือกไม่มีภาพ — ไดคัท: ${missDiecut.join(",") || "-"} · ขนาดฐาน: ${missBase.join(",") || "-"}`);
const up = await sb.from("products").update({ data: p }).eq("id", ID);
if (up.error) throw new Error(`เขียน ${ID} ไม่สำเร็จ — ${up.error.message}`);
console.log(`💾 ผูกภาพครบ: ไดคัท ${diecut.choices.length} ตัวเลือก · ขนาดฐาน ${base.choices.length} ตัวเลือก`);
