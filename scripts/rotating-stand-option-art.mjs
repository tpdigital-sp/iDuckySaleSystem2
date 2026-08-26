#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "Rotating Stand" (id: rotating-stand) — กลุ่ม "ไดคัท" และ "ขนาดฐาน"
 *
 *   node scripts/rotating-stand-option-art.mjs            # วาดลง .cache/rot/optart
 *   node scripts/rotating-stand-option-art.mjs --upload   # อัปขึ้น Supabase Storage
 *   node scripts/rotating-stand-option-art.mjs --apply    # ใส่ imageSrc ให้ตัวเลือกที่ยังไม่มีภาพ
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 — "มีภาพประกอบด้วย" (2 กลุ่มนี้ยังเป็นเมนูเปล่า ๆ ไม่มีรูป)
 *
 * ⚠️ ห้ามยืมภาพฐานของ standy (optart-base-N) มาใช้ — ภาพชุดนั้นพิมพ์ราคาของ standy ติดมาด้วย
 *    ("ราคาปลีก 1-10 ชิ้น รวมฐานแล้ว · 11 ชิ้นขึ้นไป +N บาท") ซึ่งคนละเรทกับสินค้านี้
 *    สินค้านี้: ฐาน 3-4 ซม. รวมในราคา (รวมสกรีนลายฐาน) · เกินจากนั้นเซนละ 10 บาท ถึง 10 ซม.
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพแล้วต้องขยับ REV
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";

const UPLOAD = process.argv.includes("--upload");
const APPLY = process.argv.includes("--apply");
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/rot/optart").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const ID = "rotating-stand";
const IMG_DIR = "rotating-stand-frame"; // path เดิมของสินค้านี้ (ดู add-rotating-stand-frame.ts)
const PREFIX = "optart";
const REV = "v1";

const MASCOT = await mascotDataUri("heart", 560);
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

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 38 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 42}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

const mascotArt = (cx, cy, w, h) => {
  const box = Math.min(w, h);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

/** ฐานเสียบมองแบบเฉียง (ใต้กรอบ) */
const baseSide = (cx, y, rx) => `
  <path d="M${cx - rx} ${y} v${Math.round(rx * 0.18)} a${rx} ${rx * 0.25} 0 0 0 ${rx * 2} 0 v-${Math.round(rx * 0.18)} z"
    fill="rgba(148,197,255,0.28)" stroke="#7dd3fc" stroke-width="3"/>
  <ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${rx * 0.25}" fill="rgba(148,197,255,0.28)" stroke="#7dd3fc" stroke-width="3"/>`;

/** แกนแขวน + ตัวสแตนดี้หมุนกลางกรอบ */
const hanger = (cx, top, bottom, w) => `
  <line x1="${cx}" y1="${top + 14}" x2="${cx}" y2="${top + (bottom - top) * 0.32}" stroke="${LINE}" stroke-width="4"/>
  <rect x="${cx - 34}" y="${top + (bottom - top) * 0.28}" width="68" height="16" rx="6" fill="#e2e8f0" stroke="${LINE}" stroke-width="2"/>
  ${mascotArt(cx, top + (bottom - top) * 0.57, w * 0.54, (bottom - top) * 0.38)}
  <line x1="${cx}" y1="${top + (bottom - top) * 0.72}" x2="${cx}" y2="${bottom - 14}" stroke="${LINE}" stroke-width="4"/>`;

// ── 1. กลุ่ม "ไดคัท" ────────────────────────────────────────────────────────
const FW = 250; // กรอบในภาพ (กว้าง)
const FH = 325;
const CX = 350;
const FTOP = 168;
const FBOT = FTOP + FH;

const diecutSquare = frame(`
  ${title("ทรงสี่เหลี่ยม", "ตัดเป็นกรอบสี่เหลี่ยมมุมมน — ไม่บวกเพิ่ม")}
  <rect x="${CX - FW / 2}" y="${FTOP}" width="${FW}" height="${FH}" rx="16" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  <rect x="${CX - FW / 2 + 22}" y="${FTOP + 22}" width="${FW - 44}" height="${FH - 44}" rx="${(FW - 44) / 2}"
    fill="#ffffff" stroke="#bae6fd" stroke-width="3"/>
  ${hanger(CX, FTOP, FBOT, FW)}
  ${baseSide(CX, FBOT + 8, 96)}
  ${foot(["ราคาตามตาราง ไม่บวกเพิ่ม", "กรอบ + ตัวสแตนดี้ สกรีน 2 ด้าน"])}`);

/**
 * ทรงไดคัทตามลาย — วาดเป็นเส้นขอบโค้งอิสระรอบตัวงาน (blob) เทียบกับเส้นประทรงสี่เหลี่ยม
 * รัศมีคงที่ (ไม่สุ่ม) เพื่อให้รันกี่ครั้งก็ได้ภาพเดิม
 */
function blobPath(cx, cy, rx, ry) {
  const R = [1.0, 0.9, 1.06, 0.93, 1.1, 0.88, 1.04, 0.95, 1.08, 0.9, 1.02, 0.95];
  const pts = R.map((k, i) => {
    const a = (i / R.length) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = `M${mid(pts[pts.length - 1], pts[0]).map((n) => n.toFixed(1)).join(" ")}`;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % pts.length]);
    d += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return d + " Z";
}

const diecutShape = frame(`
  ${title("ไดคัทตามทรง", "ตัดขอบตามรูปทรงของลาย · +20 บาท/ชิ้น")}
  <rect x="${CX - FW / 2}" y="${FTOP}" width="${FW}" height="${FH}" rx="16" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="8 8"/>
  <path d="${blobPath(CX, FTOP + FH / 2, FW / 2 + 6, FH / 2 + 6)}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  <path d="${blobPath(CX, FTOP + FH / 2, FW / 2 - 18, FH / 2 - 18)}" fill="#ffffff" stroke="#bae6fd" stroke-width="3"/>
  ${hanger(CX, FTOP, FBOT, FW)}
  ${baseSide(CX, FBOT + 8, 96)}
  ${foot(["บวกเพิ่มชิ้นละ 20 บาท (คิดทั้งชุด กรอบ + ตัวแขวน)", "เส้นประ = ทรงสี่เหลี่ยม (ไว้เทียบ)"])}`);

// ── 2. กลุ่ม "ขนาดฐาน" 3-10 ซม. (มองจากด้านบน) ──────────────────────────────
const BASES = [3, 4, 5, 6, 7, 8, 9, 10];
const PX_PER_CM = 34; // 10 ซม. = 340px (สเกลเดียวกันทุกภาพ ไว้เทียบขนาด)
const STD_MAX = 4;
const PER_CM = 10;

function baseArt(cm) {
  const r = (cm * PX_PER_CM) / 2;
  const cx = 350;
  const cy = 306;
  const fee = Math.max(0, cm - STD_MAX) * PER_CM;
  return frame(`
    ${title(`ฐาน ${cm} ซม.`, "มองจากด้านบน — ร่องกลางไว้เสียบกรอบ")}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${mascotArt(cx, cy - r * 0.24, r * 1.05, r * 1.05)}
    <rect x="${cx - r * 0.58}" y="${cy + r * 0.4}" width="${r * 1.16}" height="${Math.max(12, r * 0.15)}" rx="9"
      fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
    ${dimH(cy + r + 42, cx - r, cx + r, `${cm} ซม.`)}
    ${foot([
      cm > STD_MAX ? `เพิ่มจากฐานมาตรฐาน ${cm - STD_MAX} ซม. = +${fee} บาท/ชิ้น` : "ขนาดมาตรฐาน รวมอยู่ในราคาชุดแล้ว",
      "ราคารวมสกรีนลายฐานแล้ว · ทรงกลม/สี่เหลี่ยม เลือกได้ที่กลุ่มทรงฐาน",
      "ทุกภาพวาดด้วยสเกลเดียวกัน เทียบขนาดกันได้",
    ])}`);
}

// ── วาด/อัป/ผูกกับสินค้า ────────────────────────────────────────────────────
const SHEETS = {
  "diecut-square": diecutSquare,
  "diecut-shape": diecutShape,
  ...Object.fromEntries(BASES.map((cm) => [`base-${cm}`, baseArt(cm)])),
};

for (const [name, svg] of Object.entries(SHEETS)) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${IMG_DIR}/${PREFIX}-${file}-${REV}.jpg`;

if (UPLOAD) {
  const client = sb();
  for (const f of readdirSync(OUT).filter((f) => f.endsWith(".jpg"))) {
    const buf = await readFile(`${OUT}/${f}`);
    const { error } = await client.storage
      .from("product-images")
      .upload(`products/${IMG_DIR}/${PREFIX}-${f.replace(/\.jpg$/, "")}-${REV}.jpg`, buf, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) throw new Error(`${f}: ${error.message}`);
    console.log(`⬆️  ${PREFIX}-${f.replace(/\.jpg$/, "")}-${REV}.jpg`);
  }
}

/** ตัวเลือกในฐานข้อมูล → ชื่อไฟล์ภาพ */
const MAP = {
  ไดคัท: (name) => ({ ทรงสี่เหลี่ยม: "diecut-square", ไดคัทตามทรง: "diecut-shape" })[name],
  ขนาดฐาน: (name) => {
    const cm = parseInt(String(name).replace(/[^\d]/g, " ").trim(), 10);
    return BASES.includes(cm) ? `base-${cm}` : null;
  },
};

if (APPLY) {
  const client = sb();
  const { data, error } = await client.from("products").select("data").eq("id", ID).single();
  if (error) throw new Error(`อ่านสินค้าไม่ได้: ${error.message}`);
  const d = data.data;
  let filled = 0;
  let kept = 0;
  for (const opt of d.options ?? []) {
    const mapper = MAP[opt.label];
    if (!mapper) continue;
    for (const c of opt.choices) {
      if (c.imageSrc) {
        kept++;
        continue; // ของเดิมไม่ทับ
      }
      const file = mapper(c.name);
      if (!file) continue;
      c.imageSrc = url(file);
      filled++;
    }
  }
  console.log(`   ใส่ภาพให้ตัวเลือกที่ยังว่าง ${filled} ตัว · คงของเดิม ${kept} ตัว`);
  if (filled) {
    d.savedAt = new Date().toISOString();
    const { error: upErr } = await client.from("products").update({ data: d }).eq("id", ID);
    if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
    console.log("✅ บันทึกแล้ว");
  }
}
