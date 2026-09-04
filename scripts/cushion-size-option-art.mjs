#!/usr/bin/env node
/**
 * หมอนอิงยัดใย (cushion) — ภาพประกอบตัวเลือกกลุ่ม "ขนาด" ทั้ง 7 ขนาด + เปลี่ยนเป็นการ์ด
 *
 *   node scripts/cushion-size-option-art.mjs           (วาดภาพลง .cache/cushion/upload ดูก่อน)
 *   node scripts/cushion-size-option-art.mjs --write   (+ อัปโหลด storage + เขียน imageSrc/desc/display + อ่านกลับเทียบ)
 *
 * ⚠️ กลุ่ม "ขนาด" เป็นแกนตารางราคา — pricing.driverLabels = ["ขนาด"] และ priceRates[0] ก็ใช้แกนเดียวกัน
 *    ชื่อตัวเลือก ("12x12 นิ้ว" ฯลฯ) คือคีย์ของ pricing.cells → **ห้ามแก้ชื่อ/ลำดับ** ไม่งั้นราคาหล่นไป
 *    product.price เงียบ ๆ ([[iducky-price-driver-trap]]) สคริปต์นี้แตะแค่ imageSrc / desc / display
 *
 * ดีไซน์: 7 ใบวาดสเกลเดียวกัน (PX_PER_INCH = 19) — ใบ 24 นิ้วต้องดูใหญ่กว่าใบ 12 นิ้วเท่าตัวจริง
 *  - หมอนวาดตามงานจริง: ผ้าซับลิเมชั่นพิมพ์เต็มหน้า มุมจิกออกเป็นหู ขอบถูกใยดันจนเว้าเข้าเล็กน้อย
 *  - กระดาษ A4 จาง ๆ ฝั่งขวาทุกใบ (ขนาดคงที่) = ตัวเทียบขนาดสัมบูรณ์
 *  - ป้ายเลขนิ้วตัวใหญ่อยู่ตำแหน่งเดียวกันทุกใบ และตกในกรอบ 300–600 เสมอ
 *    (ปุ่ม/การ์ดตัวเลือกครอปกลางภาพ — ดู [[iducky-option-thumb-crop]])
 *
 * รันซ้ำได้: เขียนทับ imageSrc/desc ตัวเดิม ไม่แตะชื่อ/ลำดับ/ราคา
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const PRODUCT_ID = "cushion";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลรวมทุกใบ — ใบใหญ่สุด 24 นิ้ว = 456 px ยังเหลือที่ให้ลูกศรวัด/กระดาษเทียบ */
const PX_PER_INCH = 19;
/** ศูนย์กลางหมอน — ทุกใบวางจุดเดียวกัน ย่อเป็นปุ่มแล้วเทียบขนาดกันได้ */
const CX = 450;
const CY = 420;
/** เส้นลูกศรวัดตำแหน่งคงที่ทุกใบ (ใต้/ซ้ายของใบใหญ่สุด) */
const DIM_Y = 700;
const DIM_X = 168;
/** ป้ายเลขนิ้ว — ตำแหน่งคงที่ทุกใบ อยู่กลางกรอบครอป 300–600 */
const BADGE_Y = 556;

/**
 * ขนาดทั้ง 7 — name = ชื่อตัวเลือกใน DB (คีย์ตารางราคา ห้ามเปลี่ยน)
 * cm = ปัดจากนิ้วจริง (1 นิ้ว = 2.54 ซม.) ใช้บอกลูกค้าเฉย ๆ ไม่ได้เอาไปคิดเงิน
 */
const SIZES = [
  { name: "12x12 นิ้ว", inch: 12, use: "เล็กกะทัดรัด กอดง่าย วางเก้าอี้ทำงานหรือในรถ · ของฝากชิ้นเล็ก" },
  { name: "14x14 นิ้ว", inch: 14, use: "ขนาดของฝากยอดนิยม จัดเซ็ตของขวัญพอดี ลายเห็นเต็มตา" },
  { name: "16x16 นิ้ว", inch: 16, use: "ขนาดหมอนอิงมาตรฐานทั่วไป วางโซฟาได้พอดีตัว" },
  { name: "18x18 นิ้ว", inch: 18, use: "ใหญ่ขึ้นอีกนิด ลายเด่นชัด วางโซฟาหรือหัวเตียง" },
  { name: "20x20 นิ้ว", inch: 20, use: "ลายใหญ่ชัดเจน กอดสบาย เหมาะกับงานอีเวนต์/ของรางวัล" },
  { name: "22x22 นิ้ว", inch: 22, use: "ใหญ่พิเศษ เด่นบนโซฟาตัวยาว ใช้พิงหลังได้จริง" },
  { name: "24x24 นิ้ว", inch: 24, use: "ใหญ่ที่สุดของร้าน พิงได้เต็มหลัง โชว์ลายได้เต็มพื้นที่" },
];
const cmOf = (inch) => Math.round(inch * 2.54);

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลขบนพื้นขาว */
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

/** เส้นบอกแนวจาง ๆ จากขอบชิ้นงานไปหาเส้นลูกศร (ลูกศรอยู่ตำแหน่งคงที่ทุกใบ) */
const guide = (x1, y1, x2, y2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#cbd5e1" stroke-width="1.6" stroke-dasharray="6 6"/>`;

/**
 * เส้นรอบรูปหมอนหลังยัดใย — มุมจิกอยู่ที่มุมสี่เหลี่ยมขนาดจริง ขอบเว้าเข้าเพราะใยดันตรงกลาง
 * pad > 0 = ย่อเข้ามาใช้วาดรอยเย็บด้านใน
 */
const cushionPath = (size, pad = 0) => {
  const h = size / 2 - pad;
  const x0 = CX - h, x1 = CX + h, y0 = CY - h, y1 = CY + h;
  const inset = size * 0.038; // ขอบเว้าพอให้เห็นว่าอูม แต่ยังอ่านเป็นสี่เหลี่ยมขนาดจริง
  return `M ${x0} ${y0}
    Q ${CX} ${y0 + inset} ${x1} ${y0}
    Q ${x1 - inset} ${CY} ${x1} ${y1}
    Q ${CX} ${y1 - inset} ${x0} ${y1}
    Q ${x0 + inset} ${CY} ${x0} ${y0} Z`;
};

/** ลายที่พิมพ์บนผ้า (แทนลายของลูกค้า) — ฟ้ามิ้นต์ + ดอกไม้ + มาสคอตเป็ด วางค่อนไปด้านบน */
function artwork(size) {
  const h = size / 2;
  const x0 = CX - h, y0 = CY - h;
  let mh = size * 0.44;
  let mw = mh * MASCOT.ratio;
  if (mw > size * 0.62) { mw = size * 0.62; mh = mw / MASCOT.ratio; }
  const flowers = [[0.12, 0.84], [0.26, 0.9], [0.4, 0.83], [0.6, 0.88], [0.74, 0.82], [0.88, 0.89], [0.18, 0.72], [0.82, 0.71]]
    .map(([fx, fy], i) => {
      const cx = x0 + size * fx, cy = y0 + size * fy, r = Math.max(2.4, size * 0.021 - (i % 3) * 0.8);
      const petal = ["#ffffff", "#fef3c7", "#ffe4f0"][i % 3];
      return `<g>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="${cx}" cy="${cy - r * 1.25}" rx="${r * 0.62}" ry="${r * 1.05}" fill="${petal}" transform="rotate(${a} ${cx} ${cy})"/>`).join("")}<circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="#fbbf24"/></g>`;
    })
    .join("");
  return `
    <rect x="${x0}" y="${y0}" width="${size}" height="${size}" fill="url(#print)"/>
    <!-- ใบไม้/เนินหญ้าด้านล่าง -->
    <path d="M ${x0} ${y0 + size} L ${x0} ${y0 + size * 0.8} Q ${CX} ${y0 + size * 0.68} ${x0 + size} ${y0 + size * 0.78} L ${x0 + size} ${y0 + size} Z" fill="#7fd8c3" opacity="0.75"/>
    <path d="M ${x0} ${y0 + size} L ${x0} ${y0 + size * 0.9} Q ${CX} ${y0 + size * 0.8} ${x0 + size} ${y0 + size * 0.88} L ${x0 + size} ${y0 + size} Z" fill="#4fb3a1" opacity="0.6"/>
    ${flowers}
    <image href="${MASCOT.uri}" x="${CX - mw / 2}" y="${y0 + size * 0.14}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>`;
}

/** ตัวหมอน: ลายพิมพ์เต็มหน้า + แสงเงาให้ดูอูม + รอยเย็บรอบขอบ */
function cushionArt(size, id) {
  const outline = cushionPath(size);
  return `
  <!-- เงาบนพื้น -->
  <ellipse cx="${CX + 8}" cy="${CY + size / 2 + 16}" rx="${size * 0.5}" ry="${Math.max(9, size * 0.042)}" fill="#0f172a" opacity="0.09"/>
  <clipPath id="cut${id}"><path d="${outline}"/></clipPath>
  <path d="${outline}" fill="#ffffff"/>
  <g clip-path="url(#cut${id})">
    ${artwork(size)}
    <!-- เนื้อผ้าโพลี + ความอูมของใย: สว่างกลางใบ เข้มลงตรงขอบ -->
    <rect x="${CX - size / 2}" y="${CY - size / 2}" width="${size}" height="${size}" fill="url(#weave)"/>
    <ellipse cx="${CX - size * 0.12}" cy="${CY - size * 0.12}" rx="${size * 0.42}" ry="${size * 0.4}" fill="#ffffff" opacity="0.13"/>
    <path d="${outline}" fill="none" stroke="#0f172a" stroke-width="${size * 0.1}" opacity="0.08"/>
  </g>
  <!-- รอยเย็บด้านใน + เส้นขอบชิ้นงาน -->
  <path d="${cushionPath(size, size * 0.035)}" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="7 6" opacity="0.75"/>
  <path d="${outline}" fill="none" stroke="#94a3b8" stroke-width="2.2"/>`;
}

/** กระดาษ A4 จาง ๆ ไว้เทียบขนาด — ตำแหน่ง/ขนาดเดียวกันทุกใบ */
function a4Ref() {
  const pw = 8.27 * PX_PER_INCH;
  const ph = 11.69 * PX_PER_INCH;
  const x0 = 790 - pw / 2;
  const y0 = CY - ph / 2;
  return `
  <g opacity="0.55">
    <rect x="${x0 + 4}" y="${y0 + 6}" width="${pw}" height="${ph}" rx="3" fill="#0f172a" opacity="0.10"/>
    <rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" rx="3" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${x0 + 12}" y="${y0 + 22 + i * 15}" width="${pw - 24 - (i === 5 ? 26 : 0)}" height="5" rx="2.5" fill="#cbd5e1"/>`).join("")}
  </g>
  <text x="${790}" y="${y0 + ph + 30}" font-family="${TH}" font-size="20" font-weight="600" text-anchor="middle" fill="${SUB}">กระดาษ A4</text>
  <text x="${790}" y="${y0 + ph + 54}" font-family="${TH}" font-size="17" text-anchor="middle" fill="#94a3b8">ไว้เทียบขนาด</text>`;
}

/** การ์ดขนาดหนึ่งใบ */
function sizeArt(s, id) {
  const size = s.inch * PX_PER_INCH;
  const x0 = CX - size / 2;
  const y0 = CY - size / 2;
  const bottom = y0 + size;
  const cm = cmOf(s.inch);

  const big = `${s.inch}×${s.inch}`;
  const bw = big.length * 34 + 128;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6fd6ce"/>
      <stop offset="1" stop-color="#d3f4ee"/>
    </linearGradient>
    <!-- ลายทอผ้าโพลีเนื้อละเอียด -->
    <pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 0 4 H 8" stroke="#ffffff" stroke-width="1" opacity="0.2"/>
      <path d="M 4 0 V 8" stroke="#0f172a" stroke-width="0.7" opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด ${s.inch} × ${s.inch} นิ้ว</text>
  <text x="${W / 2}" y="134" font-family="${TH}" font-size="26" font-weight="600" text-anchor="middle" fill="${OK}">≈ ${cm} × ${cm} เซนติเมตร</text>
  <text x="${W / 2}" y="172" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${s.use}</text>

  ${a4Ref()}
  ${cushionArt(size, id)}

  <!-- เส้นบอกแนวไปหาลูกศรวัด (ลูกศรอยู่ตำแหน่งคงที่ทุกใบ = เทียบกันได้ด้วยตา) -->
  ${guide(x0, bottom, x0, DIM_Y)}
  ${guide(x0 + size, bottom, x0 + size, DIM_Y)}
  ${guide(x0, y0, DIM_X, y0)}
  ${guide(x0, bottom, DIM_X, bottom)}
  ${dim(x0, DIM_Y, x0 + size, DIM_Y, `${s.inch} นิ้ว`)}
  ${dim(DIM_X, y0, DIM_X, bottom, `${s.inch} นิ้ว`)}

  <!-- ป้ายเลขนิ้วกลางภาพ — ปุ่มตัวเลือกครอปกลาง 300–600 ต้องอ่านออก -->
  <g>
    <rect x="${W / 2 - bw / 2}" y="${BADGE_Y - 39}" width="${bw}" height="78" rx="20" fill="#ffffff" opacity="0.96" stroke="#a5f3fc" stroke-width="2.5"/>
    <text x="${W / 2}" y="${BADGE_Y + 19}" font-family="${TH}" font-size="54" font-weight="800" text-anchor="middle" fill="${OK}">${big}<tspan dx="9" font-size="26" font-weight="700" fill="${SUB}">นิ้ว</tspan></text>
  </g>

  <text x="${W / 2}" y="${H - 104}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ทุกภาพสเกลเดียวกัน เทียบขนาดข้ามตัวเลือกได้จริง</text>
  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">พิมพ์ซับลิเมชั่นเต็มหน้า เย็บ + ยัดใยพร้อมใช้ · เนื้อผ้า 4 แบบ พิมพ์ 1-2 ด้าน</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#94a3b8">ภาพวาดจำลอง ลายบนหมอนเป็นตัวอย่าง · ขนาดคลาดเคลื่อนได้ตามการยัดใย</text>
</svg>`;
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = SIZES.map((s, i) => ({
  file: `size-${s.inch}in-${VER}.jpg`,
  svg: sizeArt(s, i),
  choice: s.name,
  desc: `≈ ${cmOf(s.inch)} × ${cmOf(s.inch)} ซม. — ${s.use}`,
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
group.note = "ขนาดวัดจากผืนผ้าที่เย็บ (หน่วยนิ้ว) · ทุกภาพวาดสเกลเดียวกัน เทียบขนาดกันได้ · ราคาต่อใบเปลี่ยนตามขนาดที่เลือก ดูตารางด้านล่าง";

data.savedAt = new Date().toISOString(); // กันแคชรูปเดิม ([[iducky-image-cache-bust]])
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const backGroup = back.data.options.find((o) => o.label === SIZE_GROUP);
for (const j of JOBS) {
  const c = backGroup?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url || c?.desc !== j.desc) { console.error("อ่านกลับไม่ตรง!", j.choice, c?.imageSrc); process.exit(1); }
}
if (backGroup?.display !== "cards") { console.error("display ไม่ใช่ cards", backGroup?.display); process.exit(1); }
if (backGroup?.choices?.length !== SIZES.length) { console.error("จำนวนตัวเลือกเปลี่ยน", backGroup?.choices?.length); process.exit(1); }
// แกนราคาต้องไม่สะเทือน — ชื่อตัวเลือกยังตรงคีย์ cells ครบ ทั้ง pricing และ priceRates
const keySets = [Object.keys(back.data.pricing?.cells ?? {}), ...(back.data.priceRates ?? []).map((r) => Object.keys(r.pricing?.cells ?? {}))];
for (const c of backGroup.choices) {
  for (const ks of keySets) {
    if (!ks.includes(c.name)) { console.error("ชื่อตัวเลือกหลุดจากคีย์ตารางราคา!", c.name); process.exit(1); }
  }
}
if (back.data.priceMin !== 175 || back.data.priceMax !== 345) { console.error("ช่วงราคาเปลี่ยน", back.data.priceMin, back.data.priceMax); process.exit(1); }
console.log(`✓ imageSrc+desc ${JOBS.length} ตัวเลือก + การ์ด อ่านกลับตรงทุกตัว · คีย์ตารางราคาครบ · savedAt =`, back.data.savedAt);
