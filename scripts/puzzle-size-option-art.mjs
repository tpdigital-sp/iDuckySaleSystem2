#!/usr/bin/env node
/**
 * PUZZLE (พัซเซิลปริศนา เกมเลื่อนภาพ) — ภาพประกอบตัวเลือกกลุ่ม "ขนาด" 3 ขนาด
 *
 *   node scripts/puzzle-size-option-art.mjs            (วาดภาพลง .cache/puzzle/upload ดูก่อน)
 *   node scripts/puzzle-size-option-art.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * กลุ่ม "ขนาด" เป็นแกนราคา (pricing.driverLabels ["ขนาด"] + priceRates r1) —
 * ห้ามแตะชื่อตัวเลือก เติมแค่ display:"cards" + desc + imageSrc
 *
 * ทรงชิ้นงานอ้างรูปงานจริง products/puzzle/*.jpg — กรอบพลาสติกขาวมุมมน "แนวตั้ง"
 * หัวกรอบเป็นแถบชื่อ/โลโก้ ใต้ลงมาเป็นช่องเลื่อนสี่เหลี่ยมจัตุรัส 4×4 เว้นช่องว่างมุมบนซ้าย
 * ⚠️ ชื่อขนาด "9x7.5" = สูง 9 กว้าง 7.5 (ตัวแรกคือด้านยาว/สูง) — วัดจากรูปหมู่ 3 ขนาด
 *    93c0ce9c-4d37-48a3-a0c1-9f8a5d4094ca.jpg สัดส่วนกว้าง/สูงตรงกับ 7.5/9, 9/11, 11.5/13.5
 *
 * ดีไซน์: ทุกใบสเกลเดียวกัน (CM = 38 px/ซม.) + เส้นประเงาขนาดใหญ่สุดซ้อนหลัง = เทียบขนาดข้ามใบได้
 * เลขขนาดตัวใหญ่คร่อมกลางภาพ ตามกติกาปุ่มตัวเลือกครอปกลาง 62×62 (พิกัด 300–600)
 *
 * รันซ้ำได้: เขียนทับ desc/imageSrc ตัวเดิม ไม่แตะชื่อ/ลำดับ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "puzzle";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/puzzle/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** สเกลรวมทุกใบ — ใบใหญ่สุด 13.5 ซม. = 513 px ยังเหลือที่ให้ลูกศรวัด */
const CM = 38;
/** จุดกึ่งกลางชิ้นงานทุกใบ — ให้ป้ายเลขตกกลางกรอบครอป 300–600 */
const CX = 450;
const CY = 470;

/** ขนาดทั้ง 3 — key = ชื่อตัวเลือกใน DB (แกนราคาตาราง cells ห้ามเปลี่ยน) */
const SIZES = [
  { name: "ขนาด 9x7.5cm", h: 9, w: 7.5, label: "9 × 7.5", desc: "กรอบ 7.5 × 9 ซม. — ขนาดเล็กสุด พกพาง่าย เหมาะเป็นของแจกงานอีเวนต์" },
  { name: "ขนาด 11x9cm", h: 11, w: 9, label: "11 × 9", desc: "กรอบ 9 × 11 ซม. — ขนาดกลาง ช่องเลื่อนถนัดมือ ลายเห็นชัดขึ้น" },
  { name: "ขนาด 13.5x11.5cm", h: 13.5, w: 11.5, label: "13.5 × 11.5", desc: "กรอบ 11.5 × 13.5 ซม. — ขนาดใหญ่สุด ลายเต็มตา เหมาะเป็นของขวัญ/ของสะสม" },
];
const BIG = SIZES[SIZES.length - 1];

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

/**
 * ตัวพัซเซิลเลื่อนภาพ — กรอบขาวมุมมน + แถบหัวชื่อ + ช่องเลื่อน 4×4 เว้นมุมบนซ้าย
 * (x0,y0) มุมบนซ้ายกรอบ · w,h เป็น px แล้ว · id กันชน clipPath ซ้ำ
 */
function puzzle(x0, y0, w, h, id) {
  const pad = 0.55 * CM;            // ขอบกรอบรอบช่องเลื่อน
  const sq = w - pad * 2;           // ช่องเลื่อนเป็นจัตุรัส
  const ty = y0 + h - pad - sq;     // ขอบบนของช่องเลื่อน
  const tx = x0 + pad;
  const cell = sq / 4;
  const headMid = y0 + (ty - y0) / 2 + sq * 0.035;

  /* ลายลูกค้า = มาสคอตบนพื้นฟ้า/เนินหญ้า เต็มช่องเลื่อน แล้วค่อยตัดเป็นตาราง
     วางค่อนล่าง (ตัวเล็กลง) ให้หัวเป็ดพ้นป้ายเลขขนาดที่คร่อมกลางภาพ */
  let mh = sq * 0.46;
  let mw = mh * MASCOT.ratio;
  if (mw > sq * 0.6) { mw = sq * 0.6; mh = mw / MASCOT.ratio; }

  /* เส้นแบ่งชิ้น 3 เส้นต่อแกน */
  const lines = [1, 2, 3].map((i) => `
    <line x1="${tx + cell * i}" y1="${ty}" x2="${tx + cell * i}" y2="${ty + sq}" stroke="#ffffff" stroke-width="2.6" opacity="0.7"/>
    <line x1="${tx}" y1="${ty + cell * i}" x2="${tx + sq}" y2="${ty + cell * i}" stroke="#ffffff" stroke-width="2.6" opacity="0.7"/>`).join("");

  return `
  <!-- เงากรอบ -->
  <rect x="${x0 + 6}" y="${y0 + 11}" width="${w}" height="${h}" rx="${0.5 * CM}" fill="#0f172a" opacity="0.10"/>
  <!-- กรอบพลาสติกขาวมุมมน -->
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${0.5 * CM}" fill="url(#shell)" stroke="#e2e8f0" stroke-width="2.5"/>
  <!-- แถบหัวกรอบ = ชื่อ/โลโก้ที่พิมพ์ได้ -->
  <text x="${x0 + w / 2}" y="${headMid}" font-family="${TH}" font-size="${sq * 0.115}" font-weight="700"
    text-anchor="middle" fill="#c2410c" letter-spacing="1">iDUCKY</text>

  <!-- ร่องช่องเลื่อน -->
  <rect x="${tx - 4}" y="${ty - 4}" width="${sq + 8}" height="${sq + 8}" rx="6" fill="#e2e8f0"/>
  <clipPath id="tiles-${id}"><rect x="${tx}" y="${ty}" width="${sq}" height="${sq}" rx="3"/></clipPath>
  <g clip-path="url(#tiles-${id})">
    <rect x="${tx}" y="${ty}" width="${sq}" height="${sq}" fill="url(#sky)"/>
    <path d="M ${tx} ${ty + sq} L ${tx} ${ty + sq * 0.8} Q ${tx + sq * 0.5} ${ty + sq * 0.68} ${tx + sq} ${ty + sq * 0.78} L ${tx + sq} ${ty + sq} Z" fill="#8ad9c6" opacity="0.9"/>
    ${[[0.72, 0.15, 1], [0.24, 0.24, 0.72]].map(([fx, fy, k]) => `
      <g fill="#ffffff" opacity="0.85">
        <circle cx="${tx + sq * fx}" cy="${ty + sq * fy}" r="${sq * 0.055 * k}"/>
        <circle cx="${tx + sq * fx + sq * 0.05 * k}" cy="${ty + sq * fy + sq * 0.015 * k}" r="${sq * 0.04 * k}"/>
        <circle cx="${tx + sq * fx - sq * 0.05 * k}" cy="${ty + sq * fy + sq * 0.018 * k}" r="${sq * 0.035 * k}"/>
      </g>`).join("")}
    <image href="${MASCOT.uri}" x="${tx + sq / 2 - mw / 2}" y="${ty + sq * 0.96 - mh}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    ${lines}
    <!-- ช่องว่างมุมบนซ้าย (ที่ไว้เลื่อนชิ้น) + วงจับนิ้วตามงานจริง -->
    <rect x="${tx}" y="${ty}" width="${cell}" height="${cell}" fill="#f1f5f9"/>
    <rect x="${tx + 3}" y="${ty + 3}" width="${cell - 6}" height="${cell - 6}" rx="4" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <circle cx="${tx + cell / 2}" cy="${ty + cell / 2}" r="${cell * 0.3}" fill="none" stroke="#cbd5e1" stroke-width="${Math.max(3, cell * 0.09)}"/>
  </g>
  <rect x="${tx}" y="${ty}" width="${sq}" height="${sq}" rx="3" fill="none" stroke="#cbd5e1" stroke-width="2"/>`;
}

function sizeArt(s) {
  const w = s.w * CM;
  const h = s.h * CM;
  const x0 = CX - w / 2;
  const y0 = CY - h / 2;

  /* เส้นประขนาดใหญ่สุดซ้อนหลัง — ใบใหญ่สุดไม่ต้องวาด (ทับตัวเอง) */
  const bw = BIG.w * CM;
  const bh = BIG.h * CM;
  const ghost = s === BIG ? "" : `
    <rect x="${CX - bw / 2}" y="${CY - bh / 2}" width="${bw}" height="${bh}" rx="${0.5 * CM}"
      fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-dasharray="10 8"/>
    <text x="${CX + bw / 2 - 8}" y="${CY - bh / 2 - 12}" font-family="${TH}" font-size="20"
      text-anchor="end" fill="#94a3b8">ขนาดใหญ่สุด ${BIG.label} ซม.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="shell" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f1f5f9"/>
    </linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe9f5"/>
      <stop offset="1" stop-color="#eaf8fc"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${CX}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด ${s.label} ซม.</text>
  <text x="${CX}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">พัซเซิลปริศนา เลื่อนเล่นได้จริง · พิมพ์ลายเต็มแผ่นระบบ UV</text>

  ${ghost}
  ${puzzle(x0, y0, w, h, s.h.toString().replace(".", "-"))}

  <!-- ป้ายเลขขนาดคร่อมกลางภาพ — ย่อเป็นปุ่ม 62px แล้วยังอ่านออก -->
  <rect x="${CX - 108}" y="${CY - 29}" width="216" height="64" rx="16" fill="#0f172a" opacity="0.10"/>
  <rect x="${CX - 108}" y="${CY - 32}" width="216" height="64" rx="16" fill="#ffffff" opacity="0.97" stroke="#cbd5e1" stroke-width="2"/>
  <text x="${CX}" y="${CY + 12}" font-family="${TH}" font-size="${s.label.length > 8 ? 34 : 40}" font-weight="700"
    text-anchor="middle" fill="${INK}">${s.label}</text>

  <!-- ลูกศรวัดสองแกน -->
  ${dim(x0, y0 + h + 34, x0 + w, y0 + h + 34, `กว้าง ${s.w} ซม.`)}
  ${dim(x0 - 46, y0, x0 - 46, y0 + h, `สูง ${s.h} ซม.`)}

  <text x="${CX}" y="${H - 68}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ช่องเลื่อน 4 × 4 เว้นช่องว่าง 1 ช่อง · กรอบพลาสติกขาวมุมมน</text>
  <text x="${CX}" y="${H - 36}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ทุกภาพสเกลเดียวกัน · เส้นประ = ขนาดใหญ่สุด ${BIG.label} ซม.</text>
</svg>`;
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = SIZES.map((s) => ({
  file: `size-${s.h}x${s.w}-${VER}.jpg`,
  svg: sizeArt(s),
  choice: s.name,
  desc: s.desc,
}));

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  /* ครอปกลาง 300–600 ไว้ตรวจว่าที่เห็นบนปุ่มตัวเลือกยังบอกขนาดต่างกันได้ */
  await sharp(j.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${j.file}`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${SIZE_GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
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
group.display = "cards";
for (const j of JOBS) {
  const c = group.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}" ในกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
  c.desc = j.desc;
  c.imageSrc = j.url; // แตะแค่ desc/imageSrc — ชื่อเป็นคีย์แกนราคา ห้ามเปลี่ยน
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const backGroup = back.data.options.find((o) => o.label === SIZE_GROUP);
if (backGroup?.display !== "cards") { console.error("display ไม่เป็น cards", backGroup); process.exit(1); }
for (const j of JOBS) {
  const c = backGroup?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url || c?.desc !== j.desc) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
}
// แกนราคาต้องไม่สะเทือน — ชื่อตัวเลือกยังตรงคีย์ตารางทั้ง pricing และ priceRates
const cellKeys = Object.keys(back.data.pricing?.cells ?? {});
const rateKeys = (back.data.priceRates ?? []).map((r) => Object.keys(r.pricing?.cells ?? {}));
for (const c of backGroup.choices) {
  if (!cellKeys.includes(c.name)) { console.error("ชื่อตัวเลือกหลุดจากคีย์ตาราง!", c.name); process.exit(1); }
  for (const ks of rateKeys) if (!ks.includes(c.name)) { console.error("ชื่อตัวเลือกหลุดจากคีย์เรท!", c.name); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" การ์ด + desc + ภาพ ${JOBS.length} ใบ อ่านกลับตรง · คีย์ตาราง/เรทครบ · savedAt =`, back.data.savedAt);
