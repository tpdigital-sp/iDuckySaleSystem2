#!/usr/bin/env node
/**
 * เติมภาพประกอบตัวเลือกให้สินค้า "สแตนดี้อะคริลิค (Acrylic Standee)" — id: standy
 *
 *   node scripts/standy-option-art.mjs                  # วาดภาพลง .cache/standy/upload
 *   node scripts/standy-option-art.mjs --upload         # อัปขึ้น Supabase Storage (products/standy/)
 *   node scripts/standy-option-art.mjs --apply          # ใส่ imageSrc ให้ตัวเลือกที่ "ยังไม่มีภาพ" ในฐานข้อมูล
 *
 * ⚠️ --apply แตะเฉพาะ choice.imageSrc ที่ยังว่างเท่านั้น — ของเดิม (รูปงานจริงที่ทีมงานใส่ไว้)
 *    ไม่ถูกทับ และไม่แตะข้อมูลอื่นของสินค้าเลย (สถานะเผยแพร่ · ราคา · แท็บ คงเดิมทั้งหมด)
 *
 * สิ่งที่ยังขาดในสินค้านี้ (ตอนเขียนสคริปต์): ขนาดตัวสแตนดี้ 28 แบบ · ขนาดฐาน 19 แบบ ·
 * อุปกรณ์เสริม 5 ตัว (ไม่เพิ่ม · จุกยางหมุนได้ · NFC · เซาะร่องติดแม่เหล็ก · เซาะร่องติดจุดหมุน)
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
// ลายที่ "สกรีน" บนชิ้นงาน = มาสคอตเป็ด iDucky ของฝ่าย Content
import { mascotDataUri } from "./iducky-assets.mjs";

let MASCOT = null;
const loadMascot = async () => (MASCOT ??= await mascotDataUri("heart", 560));
await loadMascot();

const UPLOAD = process.argv.includes("--upload");
const APPLY = process.argv.includes("--apply");
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/standy/upload").replace(
  /\/$/,
  ""
);
mkdirSync(OUT, { recursive: true });

const ID = "standy";
/** ขึ้นรุ่นใหม่ทุกครั้งที่แก้ภาพ — CDN/Next แคชชื่อไฟล์เดิมไว้ */
const REV = "v1";
const PREFIX = "optart";

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
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map(
      (t, i) =>
        `<text x="${W / 2}" y="${H - 40 - (lines.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${x + 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="27" font-weight="700" fill="${CYAN}">${label}</text>`;

const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 40}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/** ลายที่สกรีนบนตัวสแตนดี้ = มาสคอตเป็ด (คงสัดส่วนภาพ) */
const artwork = (cx, cy, w, h) => {
  const box = Math.min(w, h * 0.98);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet"/>`;
};

/** ฐานอะคริลิคมองแบบเฉียง */
const baseSideView = (cx, cy, rx) => {
  const ry = Math.max(8, rx * 0.26);
  const th = 14;
  return `
    <path d="M${cx - rx} ${cy} v${th} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-${th} z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="3"/>
    <rect x="${cx - rx * 0.44}" y="${cy - 6}" width="${rx * 0.88}" height="12" rx="6" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`;
};

// ── 1. ขนาดตัวสแตนดี้ 3-30 ซม. ────────────────────────────────────────────
const SIZES = Array.from({ length: 28 }, (_, i) => i + 3);
const PX_PER_CM = 13.6; // 30cm = 408px
const GROUND = 540;
const RATIO = 0.74;

function sizeArt(cm) {
  const h = cm * PX_PER_CM;
  const w = h * RATIO;
  const cx = 300;
  const ghost = 30 * PX_PER_CM;
  const top = GROUND - h;
  return frame(`
    ${title(`ตัวสแตนดี้ ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)")}
    ${
      cm < 30
        ? `<rect x="${cx - (ghost * RATIO) / 2}" y="${GROUND - ghost}" width="${ghost * RATIO}" height="${ghost}" rx="26"
      fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="8 8"/>`
        : ""
    }
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${Math.min(26, h * 0.14)}"
      fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(cx, top + h * 0.5, w * 0.84, h * 0.84)}
    ${baseSideView(cx, GROUND + 22, Math.max(52, w * 0.52))}
    ${dimV(cx + (ghost * RATIO) / 2 + 24, top, GROUND, `${cm} ซม.`)}
    ${foot([
      "อะคริลิคหนา 3 มม. · ไดคัทตามลาย · พิมพ์ระบบ UV",
      cm < 30 ? "เส้นประ = ขนาดใหญ่สุด 30 ซม. (ไว้เทียบขนาด)" : "ขนาดใหญ่สุดที่สั่งผ่านหน้าเว็บได้",
    ])}`);
}

// ── 2. ขนาดฐาน 2-20 ซม. (มองจากด้านบน) ───────────────────────────────────
const BASES = Array.from({ length: 19 }, (_, i) => i + 2);
const BASE_PX_PER_CM = 17; // 20cm = 340px (เผื่อที่ให้เส้นบอกขนาด + คำอธิบายใต้ภาพ)

function baseArt(cm) {
  const r = (cm * BASE_PX_PER_CM) / 2;
  const std = (5 * BASE_PX_PER_CM) / 2;
  const cx = 350;
  const cy = 340;
  const fee = cm <= 5 ? 10 : cm <= 7 ? 15 : cm === 8 ? 20 : (cm - 8) * 5 + 20;
  return frame(`
    ${title(`ฐาน ${cm} ซม.`, "มองจากด้านบน — ร่องกลางไว้เสียบตัวสแตนดี้")}
    ${cm > 5 ? `<circle cx="${cx}" cy="${cy}" r="${std}" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="8 8"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    <rect x="${cx - r * 0.55}" y="${cy - 8}" width="${r * 1.1}" height="16" rx="8" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>
    ${dimH(cy + r + 34, cx - r, cx + r, `${cm} ซม.`)}
    ${foot([
      cm > 5 ? "เส้นประ = ฐาน 5 ซม. (ไว้เทียบขนาด)" : "ฐานขนาดเล็ก เหมาะกับตัวสแตนดี้ 3-8 ซม.",
      `ราคาปลีก 1-10 ชิ้น รวมฐานแล้ว · 11 ชิ้นขึ้นไป +${fee} บาท/ชิ้น`,
    ])}`);
}

// ── 3. อุปกรณ์เสริมที่ยังไม่มีภาพ ─────────────────────────────────────────
/** ตัวสแตนดี้ตัวอย่างเล็ก ๆ ไว้ประกอบภาพอุปกรณ์เสริม */
const miniStandee = (cx, bottom, h) => {
  const w = h * RATIO;
  const top = bottom - h;
  return `
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="20" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    ${artwork(cx, top + h * 0.5, w * 0.84, h * 0.84)}
    ${baseSideView(cx, bottom + 20, w * 0.6)}`;
};

const ACCS = {
  "acc-none": {
    t: "ไม่เพิ่มอุปกรณ์เสริม",
    s: "ตัวสแตนดี้ + ฐาน ตามมาตรฐาน",
    draw: `${miniStandee(350, 440, 250)}`,
    foot: ["ราคาตามตาราง ไม่บวกเพิ่ม", "อยากได้ลูกเล่นเพิ่ม เลือกอุปกรณ์เสริมในช่องนี้ได้"],
  },
  "acc-stopper": {
    t: "จุกยางหมุนได้ (ชุด)",
    s: "จุกยางใสคั่นระหว่างตัวงานกับฐาน — หมุนตัวงานได้",
    draw: `
      ${miniStandee(350, 420, 230)}
      <circle cx="350" cy="440" r="26" fill="rgba(226,232,240,0.75)" stroke="#94a3b8" stroke-width="3"/>
      <circle cx="350" cy="440" r="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
      <path d="M300 440 h-34" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
      <text x="150" y="446" font-family="${TH}" font-size="21" fill="${SUB}">จุกยางใส</text>
      <path d="M420 400 a54 54 0 0 1 0 76" stroke="#38bdf8" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M420 476 l-14 -6 l16 -10 z" fill="#38bdf8"/>`,
    foot: ["บวกเพิ่มชุดละ 10 บาท", "หมุนตัวสแตนดี้บนฐานได้ ไม่ต้องยกทั้งตัว"],
  },
  "acc-nfc": {
    t: "NFC",
    s: "ติดชิป NFC ที่ด้านหลัง — แตะมือถือแล้วเปิดลิงก์ได้",
    draw: `
      ${miniStandee(280, 440, 240)}
      <circle cx="500" cy="330" r="62" fill="#ffffff" stroke="#94a3b8" stroke-width="3"/>
      <text x="500" y="340" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${SUB}">NFC</text>
      <path d="M540 288 a58 58 0 0 1 0 84" stroke="#38bdf8" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M556 272 a80 80 0 0 1 0 116" stroke="#38bdf8" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.6"/>
      <rect x="470" y="404" width="60" height="104" rx="12" fill="#f1f5f9" stroke="${LINE}" stroke-width="3"/>
      <text x="500" y="466" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">มือถือ</text>`,
    foot: ["บวกเพิ่มอันละ 20 บาท", "ใส่ลิงก์ร้าน/โซเชียล/นามบัตรดิจิทัลได้"],
  },
  "acc-groove-magnet": {
    t: "เซาะร่อง ติดแม่เหล็ก 3 มม.",
    s: "เซาะร่องที่ตัวงานแล้วฝังแม่เหล็กลงไป",
    draw: `
      ${miniStandee(350, 430, 240)}
      <circle cx="300" cy="248" r="20" fill="#e2e8f0" stroke="#64748b" stroke-width="3"/>
      <circle cx="300" cy="248" r="8" fill="#94a3b8"/>
      <path d="M324 248 h116" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
      <text x="450" y="254" font-family="${TH}" font-size="21" fill="${SUB}">แม่เหล็ก 3 มม.</text>
      <text x="350" y="504" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ฝังลงในร่องที่เซาะไว้ที่ตัวงาน</text>`,
    foot: ["บวกเพิ่มจุดละ 15 บาท", "ฝังเรียบไปกับผิวงาน ไม่นูนออกมา"],
  },
  "acc-groove-pivot": {
    t: "เซาะร่อง ติดจุดหมุน",
    s: "เซาะร่องทำจุดหมุน ให้ชิ้นงานขยับ/หมุนได้",
    draw: `
      ${miniStandee(350, 430, 240)}
      <circle cx="300" cy="244" r="18" fill="#ffffff" stroke="#64748b" stroke-width="3"/>
      <circle cx="300" cy="244" r="7" fill="#64748b"/>
      <path d="M258 214 a56 56 0 0 1 88 0" stroke="#38bdf8" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M346 214 l-16 -3 l7 -14 z" fill="#38bdf8"/>
      <path d="M324 244 h116" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
      <text x="450" y="250" font-family="${TH}" font-size="21" fill="${SUB}">จุดหมุน</text>
      <text x="350" y="504" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ชิ้นส่วนที่ต่อกับจุดหมุนจะขยับได้</text>`,
    foot: ["บวกเพิ่มจุดละ 15 บาท", "ใช้ทำชิ้นส่วนที่ขยับได้ เช่น แขน/ปีก/ป้าย"],
  },
};

const accArt = (a) => frame(`${title(a.t, a.s)}${a.draw}${foot(a.foot)}`);

// ── เขียนไฟล์ ────────────────────────────────────────────────────────────
async function render(name, svg) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
}

/** ตัวเลือกในฐานข้อมูล → ชื่อไฟล์ภาพที่วาดไว้ */
const MAP = {
  ขนาดตัวสแตนดี้: (name) => `size-${parseInt(name, 10)}`,
  ขนาดฐาน: (name) => `base-${parseInt(name, 10)}`,
  อุปกรณ์เสริม: (name) =>
    ({
      ไม่เพิ่ม: "acc-none",
      "จุกยางหมุนได้ (ชุด)": "acc-stopper",
      NFC: "acc-nfc",
      "เซาะร่อง ติดแม่เหล็ก 3mm": "acc-groove-magnet",
      "เซาะร่อง ติดจุดหมุน": "acc-groove-pivot",
    })[name],
};

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${PREFIX}-${file}-${REV}.jpg`;

async function uploadAll() {
  const client = sb();
  const files = readdirSync(OUT).filter((f) => f.endsWith(".jpg"));
  let done = 0;
  for (const f of files) {
    const buf = await readFile(`${OUT}/${f}`);
    const { error } = await client.storage
      .from("product-images")
      .upload(`products/${ID}/${PREFIX}-${f.replace(/\.jpg$/, "")}-${REV}.jpg`, buf, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) throw new Error(`${f}: ${error.message}`);
    done++;
    if (done % 20 === 0 || done === files.length) console.log(`⬆️  ${done}/${files.length}`);
  }
}

async function applyToProduct() {
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
        continue; // ของเดิม (รูปงานจริง) ไม่ทับ
      }
      const file = mapper(c.name);
      if (!file) continue;
      c.imageSrc = url(file);
      filled++;
    }
  }
  console.log(`   ใส่ภาพให้ตัวเลือกที่ยังว่าง ${filled} ตัว · คงของเดิมไว้ ${kept} ตัว`);
  if (!filled) return;
  const { error: upErr } = await client.from("products").update({ data: d }).eq("id", ID);
  if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
  console.log("✅ บันทึกแล้ว — ข้อมูลอื่นของสินค้าคงเดิมทั้งหมด");
}

for (const cm of SIZES) await render(`size-${cm}`, sizeArt(cm));
for (const cm of BASES) await render(`base-${cm}`, baseArt(cm));
for (const [name, a] of Object.entries(ACCS)) await render(name, accArt(a));
console.log(`🎨 วาดแล้ว ${SIZES.length + BASES.length + Object.keys(ACCS).length} ภาพ → ${OUT}`);

if (UPLOAD) await uploadAll();
if (APPLY) await applyToProduct();
