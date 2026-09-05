#!/usr/bin/env node
/**
 * โปสเตอร์แขวนผนัง (uv-2) — ภาพประกอบตัวเลือก 4 กลุ่ม: ประเภท · แคนวาส เกรดพรีเมี่ยม · ขนาด · พิมพ์
 *
 *   node scripts/wall-poster-option-art.mjs           (วาด/ครอปลง .cache/uv-2/upload ดูก่อน)
 *   node scripts/wall-poster-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * แหล่งภาพจริง: ใบสเปคร้าน ~/Desktop/AdminBuddy/academy-assets/print/wallposter.jpg (1500×1165)
 *   — ครอปรูปโปสเตอร์ UV (SPY×FAMILY) กับ SUB (ผ้าดิบลายเป็ด) เป็นภาพกลุ่ม "ประเภท"
 *   — ครอปดิบสำรองไว้ที่ scripts/assets/wall-poster/ เผื่อเครื่องไม่มี AdminBuddy
 * ที่เหลือวาดเอง (สเปคจากใบเดียวกัน): เนื้อเงา/ด้าน = การ์ดผิวแคนวาส · ขนาด A3–A0 สเกลเดียวกัน ·
 *   พิมพ์แนวตั้ง/นอน = เงาผืนสูง vs กว้าง (ท่อแขวนอยู่ด้านบนเสมอ)
 *
 * ⚠️ กลุ่ม "ขนาด" กับ "พิมพ์" เป็นแกนตารางราคา (driverLabels) — ห้ามแก้ชื่อกลุ่ม/ตัวเลือก
 *    สคริปต์เติมแค่ imageSrc + desc (+ display cards เฉพาะกลุ่มที่ไม่ใช่ dropdown) [[iducky-price-driver-trap]]
 * ⚠️ ภาพจัตุรัส 900×900 โชว์เต็มใบที่ 80px (ไม่ครอปกลาง) — วาดชิ้นงานเต็มเฟรม จุดต่างต้องใหญ่
 *    ตรวจด้วย resize(80,80) ไม่ใช่ extract กลางภาพ [[iducky-option-thumb-crop]] [[iducky-cards-no-crop]]
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "uv-2";
const VER = "v1";
const OUT = ".cache/uv-2/upload";
mkdirSync(OUT, { recursive: true });

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

// ── 1) ครอปรูปจริงจากใบสเปค (กลุ่ม "ประเภท") ────────────────────────────
const SHEET = `${process.env.HOME}/Desktop/AdminBuddy/academy-assets/print/wallposter.jpg`;
const RAW_DIR = "scripts/assets/wall-poster";
mkdirSync(RAW_DIR, { recursive: true });

/** พิกัดบนใบสเปค 1500×1165 — วัดจากไฟล์จริง 5 ก.ย. 69 */
const PHOTO_CROPS = [
  { raw: "photo-uv.jpg", left: 92, top: 318, width: 352, height: 347 },   // โปสเตอร์แคนวาส UV แขวนเต็มผืน
  { raw: "photo-sub.jpg", left: 923, top: 318, width: 239, height: 347 }, // โปสเตอร์ผ้าดิบ SUB แขวนเต็มผืน
];

/** ครอปดิบ → เก็บสำรอง → วางลงพื้นจัตุรัส 900×900 (กันโดน object-cover ครอปข้างบนเว็บ) */
async function photoCard(crop) {
  const rawPath = `${RAW_DIR}/${crop.raw}`;
  if (!existsSync(rawPath)) {
    if (!existsSync(SHEET)) throw new Error(`ไม่มีทั้งครอปสำรอง ${rawPath} และใบสเปค ${SHEET}`);
    await sharp(SHEET).extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height }).jpeg({ quality: 95 }).toFile(rawPath);
  }
  const inner = await sharp(rawPath).resize(860, 860, { fit: "inside" }).toBuffer();
  const m = await sharp(inner).metadata();
  return sharp({ create: { width: W, height: H, channels: 3, background: "#f4f6f8" } })
    .composite([{ input: inner, left: Math.round((W - m.width) / 2), top: Math.round((H - m.height) / 2) }])
    .jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

// ── 2) การ์ดผิวแคนวาส เงา/ด้าน (วาดเอง — รูปเทียบจริงในใบสเปคเล็กเกิน 140px) ──
/** ลายทอแคนวาส: เส้นตารางถี่จาง ๆ ทับสีพิมพ์ ให้เห็นว่าเป็นเนื้อผ้าไม่ใช่กระดาษ */
const weave = (id) => `
  <pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse">
    <rect width="7" height="7" fill="none"/>
    <line x1="0" y1="3.5" x2="7" y2="3.5" stroke="#ffffff" stroke-width="1" opacity="0.16"/>
    <line x1="3.5" y1="0" x2="3.5" y2="7" stroke="#0f172a" stroke-width="1" opacity="0.07"/>
  </pattern>`;

function faceArt(gloss) {
  const mh = 380, mw = mh * MASCOT.ratio;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    ${weave("wv")}
    <!-- v2: แถบแสงแคบ 2 เส้น ค่อนไปบนซ้าย — เดิม (v1) แถบเดียวกว้างทึบกลางภาพ กลบลายจนดูเป็นภาพจาง -->
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.08" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.16" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="0.22" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.27" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.33" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="0.37" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="0.44" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="cv"><rect x="60" y="128" width="780" height="644" rx="14"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <text x="450" y="86" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${gloss ? "เนื้อเงา (Glossy)" : "เนื้อด้าน (Matte)"}</text>

  <rect x="66" y="138" width="780" height="644" rx="14" fill="#0f172a" opacity="0.12"/>
  <rect x="60" y="128" width="780" height="644" rx="14" fill="url(#print)" stroke="#94a3b8" stroke-width="2"/>
  <g clip-path="url(#cv)">
    <circle cx="450" cy="430" r="250" fill="#ffffff" opacity="0.35"/>
    <image href="${MASCOT.uri}" x="${450 - mw / 2}" y="${450 - mh / 2}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="60" y="128" width="780" height="644" fill="url(#wv)"/>
    ${gloss
      ? `<rect x="60" y="128" width="780" height="644" fill="url(#sheen)"/>
         <g fill="#ffffff"><path d="M735 205 l7 22 22 7 -22 7 -7 22 -7 -22 -22 -7 22 -7z"/>
         <path d="M170 640 l5 16 16 5 -16 5 -5 16 -5 -16 -16 -5 16 -5z" opacity="0.9"/></g>`
      : `<rect x="60" y="128" width="780" height="644" fill="#0f172a" opacity="0.05"/>`}
  </g>

  <text x="450" y="846" font-family="${TH}" font-size="30" text-anchor="middle" fill="${SUB}">${gloss ? "ผิวเงาสะท้อนแสง — สีสดคมชัด" : "ผิวด้านไม่สะท้อนแสง — โทนสีนุ่ม"}</text>
</svg>`;
}

// ── 3) การ์ดขนาด A3–A0 สเกลเดียวกัน (ท่อแขวนบน+ล่าง ผืนเลือกอยู่ทึบ ที่เหลือเส้นประ) ──
const SIZES = {
  A3: { w: 29.7, h: 42 }, A2: { w: 42, h: 59.4 }, A1: { w: 59.4, h: 84.1 }, A0: { w: 84.1, h: 118.8 },
};
const CMS = 4.55;           // สเกลร่วมทุกใบ: A0 สูง 118.8 ซม. = 541px
const BAR_TOP = 232;        // ขอบบนท่อแขวน ตำแหน่งเดียวกันทุกใบ/ทุกไซซ์ (ผืนห้อยลงจากบน)
const HOOK_Y = 158;

/** ท่อสอดสีขาว + เชือกขึ้นไปหาตะขอ (ทรงเดียวกับรูปจริงในใบสเปค) */
function hanger(cx, y, w, hookY) {
  const bw = w + 26;
  return `
  <line x1="${cx - bw / 2 + 8}" y1="${y + 7}" x2="${cx}" y2="${hookY}" stroke="#d6d3d1" stroke-width="5"/>
  <line x1="${cx + bw / 2 - 8}" y1="${y + 7}" x2="${cx}" y2="${hookY}" stroke="#d6d3d1" stroke-width="5"/>
  <circle cx="${cx}" cy="${hookY}" r="13" fill="#4ade80" stroke="#16a34a" stroke-width="3"/>
  <rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="16" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>`;
}

function sizeArt(name) {
  const s = SIZES[name];
  const w = s.w * CMS, h = s.h * CMS;
  const cx = 450, y0 = BAR_TOP + 16;
  /* เงาเส้นประของไซซ์อื่น ๆ — แขวนจากท่อเดียวกัน เทียบกันได้ทันทีว่าใบนี้ใหญ่แค่ไหน */
  const ghosts = Object.entries(SIZES).filter(([k]) => k !== name).map(([k, g]) => {
    const gw = g.w * CMS, gh = g.h * CMS;
    return `<rect x="${cx - gw / 2}" y="${y0}" width="${gw}" height="${gh}" rx="4" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 7"/>
    <text x="${cx + gw / 2 - 12}" y="${y0 + gh - 12}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="end" fill="#b6c2d1">${k}</text>`;
  }).join("");
  const mh = Math.min(h * 0.5, 240), mw = mh * MASCOT.ratio;
  const labelSize = name === "A3" ? 96 : 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    ${weave("wv")}
    <clipPath id="sheet"><rect x="${cx - w / 2}" y="${y0}" width="${w}" height="${h}" rx="4"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <text x="450" y="84" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด ${name} — ${s.w} × ${s.h} ซม.</text>

  ${ghosts}
  <rect x="${cx - w / 2 + 6}" y="${y0 + 8}" width="${w}" height="${h}" rx="4" fill="#0f172a" opacity="0.12"/>
  <rect x="${cx - w / 2}" y="${y0}" width="${w}" height="${h}" rx="4" fill="url(#print)" stroke="#94a3b8" stroke-width="2"/>
  <g clip-path="url(#sheet)">
    <circle cx="${cx}" cy="${y0 + h * 0.42}" r="${w * 0.36}" fill="#ffffff" opacity="0.35"/>
    <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${y0 + h * 0.42 - mh / 2}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${cx - w / 2}" y="${y0}" width="${w}" height="${h}" fill="url(#wv)"/>
  </g>
  <rect x="${cx - (w + 26) / 2}" y="${y0 + h - 6}" width="${w + 26}" height="14" rx="7" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
  ${hanger(cx, BAR_TOP, w, HOOK_Y)}

  <rect x="${cx - labelSize * 1.05}" y="${810 - labelSize * 0.92}" width="${labelSize * 2.1}" height="${labelSize * 1.18}" rx="18" fill="#ffffff" opacity="0.94" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${cx}" y="${810}" font-family="${TH}" font-size="${labelSize}" font-weight="800" text-anchor="middle" fill="${INK}">${name}</text>
</svg>`;
}

// ── 4) การ์ดพิมพ์ แนวตั้ง/แนวนอน (สัดส่วน A-series ท่อแขวนอยู่ด้านบนเสมอ) ──
function orientArt(portrait) {
  const w = portrait ? 400 : 620, h = portrait ? 566 : 438;
  const cx = 450, y0 = 250;
  const mh = portrait ? h * 0.42 : h * 0.56, mw = mh * MASCOT.ratio;
  const line = (x, y, len, op = 0.75) => `<rect x="${x}" y="${y}" width="${len}" height="9" rx="4.5" fill="#ffffff" opacity="${op}"/>`;
  const artwork = portrait
    ? `<circle cx="${cx}" cy="${y0 + h * 0.32}" r="${w * 0.36}" fill="#ffffff" opacity="0.35"/>
       <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${y0 + h * 0.1}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
       <rect x="${cx - w * 0.36}" y="${y0 + h * 0.62}" width="${w * 0.72}" height="${h * 0.08}" rx="10" fill="#ffffff" opacity="0.9"/>
       ${line(cx - w * 0.3, y0 + h * 0.77, w * 0.6)}${line(cx - w * 0.24, y0 + h * 0.85, w * 0.48, 0.55)}`
    : `<circle cx="${cx - w * 0.22}" cy="${y0 + h * 0.5}" r="${h * 0.36}" fill="#ffffff" opacity="0.35"/>
       <image href="${MASCOT.uri}" x="${cx - w * 0.22 - mw / 2}" y="${y0 + h * 0.5 - mh / 2}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
       <rect x="${cx + w * 0.04}" y="${y0 + h * 0.28}" width="${w * 0.36}" height="${h * 0.12}" rx="10" fill="#ffffff" opacity="0.9"/>
       ${line(cx + w * 0.04, y0 + h * 0.52, w * 0.36)}${line(cx + w * 0.04, y0 + h * 0.63, w * 0.28, 0.55)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    ${weave("wv")}
    <clipPath id="sheet"><rect x="${cx - w / 2}" y="${y0}" width="${w}" height="${h}" rx="4"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <text x="450" y="90" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${portrait ? "แนวตั้ง (Portrait)" : "แนวนอน (Landscape)"}</text>

  <rect x="${cx - w / 2 + 6}" y="${y0 + 9}" width="${w}" height="${h}" rx="4" fill="#0f172a" opacity="0.12"/>
  <rect x="${cx - w / 2}" y="${y0}" width="${w}" height="${h}" rx="4" fill="url(#print)" stroke="#94a3b8" stroke-width="2"/>
  <g clip-path="url(#sheet)">
    ${artwork}
    <rect x="${cx - w / 2}" y="${y0}" width="${w}" height="${h}" fill="url(#wv)"/>
  </g>
  <rect x="${cx - (w + 26) / 2}" y="${y0 + h - 6}" width="${w + 26}" height="14" rx="7" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
  ${hanger(cx, y0 - 16, w, y0 - 92)}

  <text x="450" y="852" font-family="${TH}" font-size="30" text-anchor="middle" fill="${SUB}">${portrait ? "ผืนสูง — ลายวางตามแนวตั้ง" : "ผืนกว้าง — ลายวางตามแนวนอน"}</text>
</svg>`;
}

// ── รายการภาพทั้งหมด: group → [{name ตรง DB เป๊ะ, file, desc, make}] ──────
const PLAN = [
  {
    group: "ประเภท", display: "cards",
    picks: [
      { name: "ระบบ UV", file: `type-uv-${VER}.jpg`, make: () => photoCard(PHOTO_CROPS[0]),
        desc: "พิมพ์ UV บนแคนวาส Poly Cotton เลือกเนื้อเงา/ด้านได้ · ขอบงานไม่เย็บ อาจมีตัดติดสีขาวหรือขอบรุ่ยเป็นเส้น" },
      { name: "ระบบซับลิเมชั่น (แคนวาส 14 ออนซ์)", file: `type-sub-${VER}.jpg`, make: () => photoCard(PHOTO_CROPS[1]),
        desc: "พิมพ์ซับลิเมชั่นบนผ้าแคนวาส 14 ออนซ์ (ผ้าดิบ) สีซึมเนื้อผ้า · เย็บขอบงานด้ายสีขาว" },
    ],
  },
  {
    group: "แคนวาส เกรดพรีเมี่ยม", display: "cards",
    picks: [
      { name: "เนื้อเงา", file: "face-gloss-v2.jpg", make: () => svgJpeg(faceArt(true)), // v2 — CDN แคชชื่อเดิม ต้องขึ้นรุ่นใหม่
        desc: "ผิวเงาสะท้อนแสง สีสดคมชัด เหมาะลายสีจัด ๆ" },
      { name: "เนื้อด้าน", file: `face-matte-${VER}.jpg`, make: () => svgJpeg(faceArt(false)),
        desc: "ผิวด้านไม่สะท้อนแสง โทนสีนุ่ม ถ่ายรูปไม่ติดแสงวับ" },
    ],
  },
  {
    group: "ขนาด", display: null, // คง dropdown เดิม — โชว์ภาพย่อของตัวที่เลือกข้างเมนูเอง
    picks: ["A3", "A2", "A1", "A0"].map((k) => ({
      name: `ขนาด ${k}`, file: `size-${k.toLowerCase()}-${VER}.jpg`, make: () => svgJpeg(sizeArt(k)),
      desc: `${SIZES[k].w} × ${SIZES[k].h} ซม. (คลาดเคลื่อนได้ ±1-2 นิ้ว)`,
    })),
  },
  {
    group: "พิมพ์", display: "cards",
    picks: [
      { name: "แนวตั้ง", file: `print-portrait-${VER}.jpg`, make: () => svgJpeg(orientArt(true)),
        desc: "ผืนสูง ลายวางแนวตั้ง — เหมาะโปสเตอร์ตัวละคร ภาพคนเต็มตัว" },
      { name: "แนวนอน", file: `print-landscape-${VER}.jpg`, make: () => svgJpeg(orientArt(false)),
        desc: "ผืนกว้าง ลายวางแนวนอน — เหมาะภาพหมู่ ภาพวิว แบนเนอร์" },
    ],
  },
];

const svgJpeg = (svg) => sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

for (const g of PLAN) {
  for (const p of g.picks) {
    p.buf = await p.make();
    writeFileSync(`${OUT}/${p.file}`, p.buf);
    await sharp(p.buf).resize(80, 80).png().toFile(`${OUT}/_80-${p.file}.png`); // ตรวจตามที่การ์ดย่อจริง
    console.log(`🖼  ${OUT}/${p.file}  ${Math.round(p.buf.length / 1024)} KB — [${g.group}] ${p.name}`);
  }
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — เปิดดูภาพ + _80-*.png แล้วรันซ้ำด้วย --write)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const g of PLAN) for (const p of g.picks) {
  const key = `products/${PRODUCT_ID}/${p.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, p.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  p.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", p.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];
const beforeCount = options.length;

for (const g of PLAN) {
  const opt = options.find((o) => o.label === g.group);
  if (!opt) { console.error(`ไม่เจอกลุ่ม "${g.group}"`); process.exit(1); }
  if (g.display) opt.display = g.display;
  opt.choices = opt.choices.map((c) => {
    const p = g.picks.find((b) => b.name === c.name);
    if (!p) { console.error(`[${g.group}] เจอตัวเลือกที่ไม่มีในสคริปต์ (ชื่ออาจถูกแก้):`, JSON.stringify(c.name)); process.exit(1); }
    return { ...c, imageSrc: p.url, desc: p.desc };
  });
  if (opt.choices.length !== g.picks.length) { console.error(`[${g.group}] จำนวนตัวเลือกไม่ตรง`, opt.choices.map((c) => c.name)); process.exit(1); }
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (back.data.options.length !== beforeCount) { console.error("จำนวนกลุ่มตัวเลือกเปลี่ยน!", back.data.options.length, beforeCount); process.exit(1); }
for (const g of PLAN) {
  const opt = back.data.options.find((o) => o.label === g.group);
  for (const p of g.picks) {
    const c = opt?.choices.find((x) => x.name === p.name);
    if (c?.imageSrc !== p.url || c?.desc !== p.desc) { console.error("อ่านกลับไม่ตรง!", g.group, p.name, c); process.exit(1); }
  }
  if (g.display && opt.display !== g.display) { console.error(`[${g.group}] display ไม่เป็น ${g.display}`, opt.display); process.exit(1); }
}
console.log(`✓ ${PLAN.length} กลุ่ม / ${PLAN.reduce((n, g) => n + g.picks.length, 0)} ภาพ · กลุ่มครบ ${back.data.options.length} · savedAt =`, back.data.savedAt);
