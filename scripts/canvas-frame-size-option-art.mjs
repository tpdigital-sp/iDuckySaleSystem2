#!/usr/bin/env node
/**
 * Canvas Frame (canvas-frame) — ภาพประกอบตัวเลือกกลุ่ม "ขนาด" ทั้ง 6 ขนาด
 *
 *   node scripts/canvas-frame-size-option-art.mjs          (วาดภาพลง .cache/canvas-frame/upload ดูก่อน)
 *   node scripts/canvas-frame-size-option-art.mjs --write   (+ อัปโหลด storage + เขียน imageSrc/desc/display + อ่านกลับเทียบ)
 *
 * กลุ่ม "ขนาด" เป็นแกนราคา (pricing.driverLabels ["ขนาด"] + priceRates r1) — ห้ามแตะชื่อตัวเลือก
 * เติมแค่ imageSrc/desc และตั้ง display เป็นการ์ด
 *
 * ดีไซน์: ทุกใบสเกลเดียวกัน (CM = 4 px/ซม.) เทียบขนาดข้ามใบได้จริง
 *  - กรอบแคนวาสวาดเป็นทรงสามมิติบาง ๆ เห็นสันข้าง = ลายพิมพ์ต่อเนื่องถึงขอบด้านข้าง (ตามงานจริง)
 *  - กระดาษ A4 (21×29.7 ซม.) จาง ๆ ฝั่งซ้ายทุกใบ = ตัวเทียบขนาดสัมบูรณ์
 *  - ป้ายเลขขนาดตัวใหญ่ถูกวางให้ตกในกรอบ 300–600 เสมอ (ปุ่ม/การ์ดครอปกลางภาพ ดู iducky-option-thumb-crop)
 *
 * ชื่อขนาด = กว้าง × สูง (วาดเป็นแนวตั้ง) — สลับแนวนอนได้ ลูกค้าแจ้งในหมายเหตุ
 * รันซ้ำได้: เขียนทับ imageSrc/desc ตัวเดิม ไม่แตะชื่อ/ลำดับ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("peace", 420);

const PRODUCT_ID = "canvas-frame";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/canvas-frame/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลรวมทุกใบ — ใบใหญ่สุด 120 ซม. = 480 px ยังเหลือที่ให้ลูกศรวัด/ป้าย */
const CM = 4;
/** ความหนาเฟรม 2.5 ซม. (สันข้างที่มองเห็น) */
const DEPTH = 2.5 * CM;

/** แกนกลางฉาก — ทุกใบวางกึ่งกลางจุดเดียวกัน ย่อเป็นปุ่มแล้วเทียบขนาดกันได้ */
const CX = 450;
const CY = 420;
/** เส้นลูกศรวัดตำแหน่งคงที่ทุกใบ (ใต้/ขวาสุดของใบใหญ่สุด) */
const DIM_Y = 706;
const DIM_X = 742;

/** ขนาดทั้ง 6 — key = ชื่อตัวเลือกใน DB (แกนราคา ห้ามเปลี่ยน) */
const SIZES = [
  { name: "30x30cm", w: 30, h: 30, use: "จัตุรัสขนาดเล็ก ตั้งโต๊ะ หรือแขวนกลุ่มหลายใบ" },
  { name: "30x40cm", w: 30, h: 40, use: "ขนาดเริ่มต้นยอดนิยม แต่งมุมเล็ก ๆ ในบ้าน" },
  { name: "40x60cm", w: 40, h: 60, use: "แขวนเดี่ยวเหนือโต๊ะทำงาน หรือหัวเตียง" },
  { name: "50x70cm", w: 50, h: 70, use: "เท่าโปสเตอร์มาตรฐาน เด่นชัดกลางผนัง" },
  { name: "60x80cm", w: 60, h: 80, use: "ใหญ่เต็มผนังห้องนั่งเล่น เห็นรายละเอียดลาย" },
  { name: "100x120cm", w: 100, h: 120, use: "ใหญ่พิเศษ งานโชว์ คาเฟ่ ร้าน หรือล็อบบี้" },
];

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 30;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}" width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** เส้นบอกแนวจาง ๆ จากขอบชิ้นงานไปหาเส้นลูกศร (เส้นลูกศรอยู่ตำแหน่งคงที่ทุกใบ) */
const guide = (x1, y1, x2, y2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#cbd5e1" stroke-width="1.6" stroke-dasharray="6 6"/>`;

/** ลายที่พิมพ์บนผ้าใบ — ฟ้า/เนิน/ดอกไม้ + มาสคอตแทนลายของลูกค้า (อิงรูปงานจริง) */
function artwork(x0, y0, w, h) {
  let mh = h * 0.46;
  let mw = mh * MASCOT.ratio;
  if (mw > w * 0.5) { mw = w * 0.5; mh = mw / MASCOT.ratio; }
  const flowers = [[0.1, 0.86], [0.22, 0.79], [0.36, 0.83], [0.5, 0.77], [0.63, 0.84], [0.76, 0.78], [0.88, 0.85], [0.3, 0.92], [0.68, 0.93]]
    .map(([fx, fy], i) => `<circle cx="${x0 + w * fx}" cy="${y0 + h * fy}" r="${Math.max(2, w * 0.017 - (i % 3) * 0.6)}" fill="${["#ff8fa3", "#ffd166", "#ef476f"][i % 3]}"/>`)
    .join("");
  return `
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#sky)"/>
    <circle cx="${x0 + w * 0.8}" cy="${y0 + h * 0.16}" r="${w * 0.07}" fill="#fff3bf" opacity="0.9"/>
    <path d="M ${x0} ${y0 + h} L ${x0} ${y0 + h * 0.74} Q ${x0 + w * 0.5} ${y0 + h * 0.6} ${x0 + w} ${y0 + h * 0.7} L ${x0 + w} ${y0 + h} Z" fill="#6ec9b8"/>
    <path d="M ${x0} ${y0 + h} L ${x0} ${y0 + h * 0.86} Q ${x0 + w * 0.55} ${y0 + h * 0.74} ${x0 + w} ${y0 + h * 0.84} L ${x0 + w} ${y0 + h} Z" fill="#4fb3a1" opacity="0.85"/>
    ${flowers}
    <image href="${MASCOT.uri}" x="${x0 + w / 2 - mw / 2}" y="${y0 + h * 0.24}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>`;
}

/**
 * กรอบแคนวาสทรงสามมิติบาง ๆ — หน้าใบ + สันข้างขวา + สันบน
 * สันข้างใช้สีลายที่จางลง สื่อว่าพิมพ์ต่อเนื่องอ้อมขอบ (จุดขายของงานนี้)
 */
function canvasFrame(x0, y0, w, h) {
  const d = DEPTH;
  const up = d * 0.55;
  return `
  <!-- เงาใต้ชิ้นงาน -->
  <rect x="${x0 + 10}" y="${y0 + 16}" width="${w + d}" height="${h}" rx="4" fill="#0f172a" opacity="0.10"/>
  <!-- สันบน (ลายอ้อมขอบ — หันขึ้นจึงสว่างกว่า) -->
  <path d="M ${x0} ${y0} L ${x0 + d} ${y0 - up} L ${x0 + w + d} ${y0 - up} L ${x0 + w} ${y0} Z" fill="#c9ecf5" stroke="#7f9aa8" stroke-width="1.6"/>
  <!-- สันข้างขวา (ลายอ้อมขอบ — หันข้างจึงเข้มกว่าหน้าใบ) -->
  <path d="M ${x0 + w} ${y0} L ${x0 + w + d} ${y0 - up} L ${x0 + w + d} ${y0 + h - up} L ${x0 + w} ${y0 + h} Z" fill="url(#edge)" stroke="#7f9aa8" stroke-width="1.6"/>
  <!-- หน้าใบ: ผ้าใบพิมพ์ลายเต็มหน้า -->
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff"/>
  <clipPath id="face"><rect x="${x0}" y="${y0}" width="${w}" height="${h}"/></clipPath>
  <g clip-path="url(#face)">
    ${artwork(x0, y0, w, h)}
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#weave)"/>
  </g>
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="#7f9aa8" stroke-width="2.2"/>`;
}

/** กระดาษ A4 จาง ๆ ไว้เทียบขนาด — ตำแหน่งเดียวกันทุกใบ */
function a4Ref() {
  const pw = 21 * CM;
  const ph = 29.7 * CM;
  const x0 = 112 - pw / 2;
  const y0 = CY - ph / 2;
  return `
  <g opacity="0.55">
    <rect x="${x0 + 4}" y="${y0 + 6}" width="${pw}" height="${ph}" rx="3" fill="#0f172a" opacity="0.10"/>
    <rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" rx="3" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${x0 + 12}" y="${y0 + 22 + i * 15}" width="${pw - 24 - (i === 5 ? 26 : 0)}" height="5" rx="2.5" fill="#cbd5e1"/>`).join("")}
  </g>
  <text x="${x0 + pw / 2}" y="${y0 + ph + 30}" font-family="${TH}" font-size="20" font-weight="600" text-anchor="middle" fill="${SUB}">กระดาษ A4</text>
  <text x="${x0 + pw / 2}" y="${y0 + ph + 54}" font-family="${TH}" font-size="17" text-anchor="middle" fill="#94a3b8">ไว้เทียบขนาด</text>`;
}

/** การ์ดขนาดหนึ่งใบ */
function sizeArt(s) {
  const w = s.w * CM;
  const h = s.h * CM;
  const x0 = CX - w / 2;
  const y0 = CY - h / 2;
  const bottom = y0 + h;

  /* ป้ายเลขขนาด — วางใต้ขอบล่างของใบ (ใบเล็กจะได้ไม่โดนป้ายบัง) แต่ยังอยู่ในกรอบครอปกลาง 300–600 เสมอ */
  const big = `${s.w}×${s.h}`;
  const badgeY = Math.min(558, bottom + 45);
  const numFont = big.length >= 7 ? 46 : 58;
  const bw = Math.min(298, big.length * numFont * 0.62 + 96);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a5e3f0"/>
      <stop offset="1" stop-color="#e8f8fb"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7fc6d8"/>
      <stop offset="1" stop-color="#5aa7bb"/>
    </linearGradient>
    <!-- ลายทอผ้าใบ (แคนวาส) -->
    <pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 0 4 H 8" stroke="#ffffff" stroke-width="1" opacity="0.22"/>
      <path d="M 4 0 V 8" stroke="#0f172a" stroke-width="0.7" opacity="0.06"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด ${s.w} × ${s.h} ซม.</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${s.use}</text>

  ${a4Ref()}
  ${canvasFrame(x0, y0, w, h)}

  <!-- เส้นบอกแนวไปหาลูกศรวัด (ลูกศรอยู่ตำแหน่งคงที่ทุกใบ = เทียบกันได้ด้วยตา) -->
  ${guide(x0, bottom, x0, DIM_Y)}
  ${guide(x0 + w, bottom, x0 + w, DIM_Y)}
  ${guide(x0 + w + DEPTH, y0 - DEPTH * 0.55, DIM_X, y0 - DEPTH * 0.55)}
  ${guide(x0 + w + DEPTH, bottom - DEPTH * 0.55, DIM_X, bottom - DEPTH * 0.55)}
  ${dim(x0, DIM_Y, x0 + w, DIM_Y, `${s.w} ซม.`)}
  ${dim(DIM_X, y0 - DEPTH * 0.55, DIM_X, bottom - DEPTH * 0.55, `${s.h} ซม.`)}

  <!-- ป้ายเลขขนาดกลางภาพ — ปุ่มตัวเลือกครอปกลาง 300–600 ต้องอ่านออก -->
  <g>
    <rect x="${W / 2 - bw / 2}" y="${badgeY - 39}" width="${bw}" height="78" rx="20" fill="#ffffff" opacity="0.96" stroke="#a5f3fc" stroke-width="2.5"/>
    <text x="${W / 2}" y="${badgeY + numFont * 0.35}" font-family="${TH}" font-size="${numFont}" font-weight="800" text-anchor="middle" fill="${OK}">${big}<tspan dx="9" font-size="26" font-weight="700" fill="${SUB}">ซม.</tspan></text>
  </g>

  <text x="${W / 2}" y="${H - 104}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ทุกภาพสเกลเดียวกัน เทียบขนาดข้ามตัวเลือกได้จริง</text>
  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ UV เต็มหน้า ต่อเนื่องถึงขอบด้านข้าง · โครงไม้สนขึงผ้าใบสำเร็จ พร้อมแขวน</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="#94a3b8">ภาพวาดจำลอง · สลับเป็นแนวนอนได้ แจ้งในช่องหมายเหตุถึงร้าน</text>
</svg>`;
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = SIZES.map((s) => ({
  file: `size-${s.name.replace("cm", "")}-${VER}.jpg`,
  svg: sizeArt(s),
  choice: s.name,
  desc: s.use,
}));

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  /* ครอปกลาง 300–600 ไว้ตรวจว่าที่เห็นบนปุ่มตัวเลือกยังบอกขนาดได้ */
  await sharp(j.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${j.file}`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${SIZE_GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน imageSrc ─────────────────────────────────
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
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const group = (data.options ?? []).find((o) => o.label === SIZE_GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = group.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}" ในกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
  c.imageSrc = j.url; // แตะแค่ imageSrc/desc — ชื่อเป็นคีย์แกนราคา ห้ามเปลี่ยน
  c.desc = j.desc;
}
group.display = "cards";

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const backGroup = back.data.options.find((o) => o.label === SIZE_GROUP);
for (const j of JOBS) {
  const got = backGroup?.choices?.find((c) => c.name === j.choice)?.imageSrc;
  if (got !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, got); process.exit(1); }
}
if (backGroup?.display !== "cards") { console.error("display ไม่ใช่ cards", backGroup?.display); process.exit(1); }
// แกนราคาต้องไม่สะเทือน — ชื่อตัวเลือกยังตรงคีย์ cells ครบ ทั้ง pricing และ priceRates
const keySets = [Object.keys(back.data.pricing?.cells ?? {}), ...(back.data.priceRates ?? []).map((r) => Object.keys(r.pricing?.cells ?? {}))];
for (const c of backGroup.choices) {
  for (const ks of keySets) {
    if (!ks.includes(c.name)) { console.error("ชื่อตัวเลือกหลุดจากคีย์ตาราง!", c.name); process.exit(1); }
  }
}
console.log(`✓ imageSrc ${JOBS.length} ภาพ + การ์ด อ่านกลับตรงทุกตัว · คีย์ตารางราคาครบ · savedAt =`, back.data.savedAt);
