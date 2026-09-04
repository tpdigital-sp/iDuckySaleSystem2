#!/usr/bin/env node
/**
 * กรอบรูปอะคริลิค แม่เหล็ก (photoframe-4) — ภาพประกอบตัวเลือกกลุ่ม "ขนาด" 3 ขนาด + การ์ด
 *
 *   node scripts/photo-frame-magnet-size-option.mjs           (วาดภาพลง .cache/photoframe-4/upload ดูก่อน)
 *   node scripts/photo-frame-magnet-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * กลุ่ม "ขนาด" เป็นแกนราคา (pricing.driverLabels ["ขนาด"] · cells คีย์ตามชื่อตัวเลือก)
 * — ห้ามแตะชื่อตัวเลือก เติมแค่ desc + imageSrc + display "cards"
 *
 * ตัวสินค้าตามรูปงานจริง (products/photoframe-4 บนเว็บเดิม):
 *   อะคริลิคใส 2 แผ่นประกบกันด้วยแม่เหล็กฝัง 4 มุม · แผ่นหน้าพิมพ์ลายเป็นขอบกรอบ เว้นช่องกลางใส
 *   หนีบรูป/โฟโต้การ์ดไว้ตรงกลาง ดึงแผ่นหน้าออกเปลี่ยนรูปเองได้
 *
 * ดีไซน์: ทั้ง 3 ใบสเกลเดียวกัน (CM = 34 px/ซม.) วางชิดเส้นฐานเดียวกัน เทียบขนาดข้ามใบได้จริง
 *   ชื่อตัวเลือกอ่านเป็น กว้าง × สูง × หนา (17x12.8 = แนวนอน · อีกสองตัวแนวตั้ง)
 *   ยืนยันจาก "ข้อควรทราบก่อนสั่ง" ของใบสินค้าเอง: 6x9 หนา 2 ซม. · 7.5x10.8 หนา 2 ซม. ·
 *   17x12 หนา 1 ซม. "แบบมีขาตั้ง" — v2 จึงมีภาพตัดข้างบอกความหนา + ชิปบอกขาตั้ง
 *
 * รันซ้ำได้: เขียนทับ desc/imageSrc ตัวเดิม ไม่เพิ่ม/ลบตัวเลือก ไม่แตะกลุ่มอื่น
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "photoframe-4";
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/photoframe-4/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลรวมทุกใบ — ใบใหญ่สุด 17 ซม. = 578 px ยังเหลือที่ให้ลูกศรวัดสองฝั่ง */
const CM = 34;
/** เส้นฐานร่วม — ทุกขนาดวางขอบล่างตรงกัน ตาเทียบขนาดได้ทันที */
const BASE = 641;

/** ขนาดทั้ง 3 — name = ชื่อตัวเลือกใน DB (แกนราคา ห้ามเปลี่ยน) · t = ความหนาชุด (ซม.) */
const SIZES = [
  {
    name: "6x9x2cm",
    w: 6,
    h: 9,
    t: 2,
    sub: "กรอบแนวตั้ง — ขนาดเล็กสุด",
    chip: "อะคริลิคใส 2 แผ่น ประกบแม่เหล็ก 4 มุม · หนารวม 2 ซม.",
    desc: "กรอบแนวตั้ง ขนาดเล็กสุด หนารวม 2 ซม. — อะคริลิคใส 2 แผ่น ประกบด้วยแม่เหล็ก 4 มุม",
  },
  {
    name: "7.5x10.8x2cm",
    w: 7.5,
    h: 10.8,
    t: 2,
    sub: "กรอบแนวตั้ง — ขนาดกลาง",
    chip: "อะคริลิคใส 2 แผ่น ประกบแม่เหล็ก 4 มุม · หนารวม 2 ซม.",
    desc: "กรอบแนวตั้ง ขนาดกลาง หนารวม 2 ซม. ใส่รูปได้ใหญ่ขึ้น — ประกบด้วยแม่เหล็ก 4 มุม",
  },
  {
    name: "17x12.8x1cm",
    w: 17,
    h: 12.8,
    t: 1,
    stand: true,
    sub: "กรอบแนวนอน — ขนาดใหญ่สุด มีขาตั้ง",
    chip: "อะคริลิคใส 2 แผ่น ประกบแม่เหล็ก 4 มุม · หนารวม 1 ซม. · มีขาตั้ง",
    desc: "กรอบแนวนอน ขนาดใหญ่สุด หนารวม 1 ซม. มาพร้อมขาตั้ง — ประกบด้วยแม่เหล็ก 4 มุม",
  },
];

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับสคริปต์ขนาดใบอื่น) */
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

/** ป้ายกำกับเล็ก (ชิปกลม) */
const tag = (cx, y, text, on = false) => {
  const w = text.length * 12.2 + 34;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="36" rx="18" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2"/>
  <text x="${cx}" y="${y + 25}" font-family="${TH}" font-size="20" font-weight="600" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

/** แม่เหล็กฝังมุม — จุดกลมเทาเงาโลหะ */
const magnet = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.6"/>
  <circle cx="${cx - r * 0.25}" cy="${cy - r * 0.25}" r="${r * 0.4}" fill="#f1f5f9" opacity="0.9"/>`;

/**
 * กรอบรูปแม่เหล็กหนึ่งชิ้น มุมบนซ้าย (x0,y0) ขนาด w×h px
 * แผ่นหลังใส (เยื้องลงขวา ให้เห็นว่ามี 2 แผ่น) + แผ่นหน้าพิมพ์ขอบลาย เว้นช่องกลางใส + รูปในช่อง
 */
function frame(x0, y0, w, h, id) {
  const off = 13;                       // ระยะเยื้องของแผ่นหลัง — สื่อว่าเป็น 2 แผ่นประกบ
  const bd = Math.max(w, h) * 0.115;    // ความหนาขอบลายที่พิมพ์บนแผ่นหน้า
  const wx = x0 + bd, wy = y0 + bd;     // ช่องใสตรงกลาง (ที่หนีบรูป)
  const ww = w - bd * 2, wh = h - bd * 2;
  const mr = Math.min(bd * 0.34, 9);    // รัศมีแม่เหล็ก
  const mo = bd * 0.5;                  // ระยะแม่เหล็กจากมุม

  /* รูปของลูกค้าในช่องใส — มาสคอตบนพื้นไล่สีนุ่ม ๆ */
  let ah = wh * 0.82;
  let aw = ah * MASCOT.ratio;
  if (aw > ww * 0.86) { aw = ww * 0.86; ah = aw / MASCOT.ratio; }

  return `
  <defs>
    <linearGradient id="acr-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fdff"/>
      <stop offset="0.5" stop-color="#e8f6fb"/>
      <stop offset="1" stop-color="#d7edf5"/>
    </linearGradient>
    <linearGradient id="brd-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bfe9f5"/>
      <stop offset="0.5" stop-color="#ffd7e3"/>
      <stop offset="1" stop-color="#ffe8bf"/>
    </linearGradient>
    <linearGradient id="pho-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfeefb"/>
      <stop offset="1" stop-color="#fef3f6"/>
    </linearGradient>
    <clipPath id="win-${id}"><rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="4"/></clipPath>
    <clipPath id="brdclip-${id}"><path d="M ${x0} ${y0} h ${w} v ${h} h ${-w} Z M ${wx} ${wy} h ${ww} v ${wh} h ${-ww} Z" clip-rule="evenodd"/></clipPath>
  </defs>

  <!-- เงาทั้งชิ้น -->
  <rect x="${x0 + off + 5}" y="${y0 + off + 9}" width="${w}" height="${h}" rx="8" fill="#0f172a" opacity="0.13"/>
  <!-- แผ่นหลัง อะคริลิคใส (เยื้องให้เห็นว่าประกบ 2 แผ่น) -->
  <rect x="${x0 + off}" y="${y0 + off}" width="${w}" height="${h}" rx="8" fill="url(#acr-${id})" stroke="#a9d6e5" stroke-width="2.5"/>
  ${magnet(x0 + off + mo + mr, y0 + off + mo + mr, mr)}
  ${magnet(x0 + off + w - mo - mr, y0 + off + mo + mr, mr)}
  ${magnet(x0 + off + mo + mr, y0 + off + h - mo - mr, mr)}
  ${magnet(x0 + off + w - mo - mr, y0 + off + h - mo - mr, mr)}

  <!-- รูปที่หนีบไว้ตรงกลาง (โผล่มาจากใต้แผ่นหน้า) -->
  <g clip-path="url(#win-${id})">
    <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="url(#pho-${id})"/>
    <image href="${MASCOT.uri}" x="${wx + ww / 2 - aw / 2}" y="${wy + wh - ah - wh * 0.04}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  </g>

  <!-- แผ่นหน้า: เนื้อใสทั้งแผ่น + ขอบพิมพ์ลาย เว้นช่องกลาง -->
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="8" fill="none" stroke="#a9d6e5" stroke-width="2.5"/>
  <g clip-path="url(#brdclip-${id})">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="8" fill="url(#brd-${id})"/>
    <!-- จุดลายน่ารักบนขอบกรอบ -->
    ${Array.from({ length: 26 }, (_, i) => {
      const t = i / 26;
      const px = x0 + (i % 2 ? bd * 0.42 : w - bd * 0.42);
      const py = y0 + bd * 0.5 + t * (h - bd);
      const qx = x0 + bd * 0.6 + t * (w - bd * 1.2);
      const qy = y0 + (i % 2 ? bd * 0.45 : h - bd * 0.45);
      const c = ["#ffffff", "#ff9fb8", "#ffd166", "#7fd6e8"][i % 4];
      return `<circle cx="${px}" cy="${py}" r="${2.6 + (i % 3)}" fill="${c}" opacity="0.85"/>
              <circle cx="${qx}" cy="${qy}" r="${2.2 + ((i + 1) % 3)}" fill="${c}" opacity="0.8"/>`;
    }).join("")}
  </g>
  <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="4" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>
  ${magnet(x0 + mo + mr, y0 + mo + mr, mr)}
  ${magnet(x0 + w - mo - mr, y0 + mo + mr, mr)}
  ${magnet(x0 + mo + mr, y0 + h - mo - mr, mr)}
  ${magnet(x0 + w - mo - mr, y0 + h - mo - mr, mr)}
  <!-- ไฮไลต์ผิวอะคริลิคแผ่นหน้า -->
  <path d="M ${x0 + 10} ${y0 + h - 10} L ${x0 + w * 0.42} ${y0 + 10} L ${x0 + w * 0.6} ${y0 + 10} L ${x0 + 22} ${y0 + h - 10} Z" fill="#ffffff" opacity="0.17"/>`;
}

/**
 * ภาพตัดข้าง "หนารวมกี่ ซม." — อะคริลิค 2 แผ่นประกบ มองจากด้านข้าง + รูปคั่นกลาง
 * (ใบสินค้าเขียนว่า 6x9 / 7.5x10.8 หนา 2 ซม. · 17x12.8 หนา 1 ซม.)
 */
function sideView(cx, cy, t) {
  const w = 112;                       // ความกว้างภาพตัดข้าง (ไม่ใช่สเกลจริง — บอกแค่ชั้นประกบ)
  const th = t === 1 ? 15 : 26;        // ความหนาแผ่นละ (ตาม 1 ซม. / 2 ซม.)
  const x = cx - w / 2;
  const tickY = (y) => `<line x1="${x + w + 14}" y1="${y}" x2="${x + w + 26}" y2="${y}" stroke="${SUB}" stroke-width="2.5"/>`;
  return `
  <g>
    <text x="${cx}" y="${cy - th - 20}" font-family="${TH}" font-size="19" font-weight="600" text-anchor="middle" fill="${SUB}">ภาพตัดข้าง</text>
    <rect x="${x}" y="${cy - th}" width="${w}" height="${th}" rx="3" fill="#e8f6fb" stroke="#a9d6e5" stroke-width="2"/>
    <rect x="${x}" y="${cy}" width="${w}" height="${th}" rx="3" fill="#e8f6fb" stroke="#a9d6e5" stroke-width="2"/>
    <line x1="${x + 3}" y1="${cy}" x2="${x + w - 3}" y2="${cy}" stroke="#ff9fb8" stroke-width="3"/>
    <line x1="${x + w + 20}" y1="${cy - th}" x2="${x + w + 20}" y2="${cy + th}" stroke="${SUB}" stroke-width="2.5"/>
    ${tickY(cy - th)}${tickY(cy + th)}
    <text x="${cx}" y="${cy + th + 32}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${SUB}">หนารวม ${t} ซม.</text>
  </g>`;
}

/** การ์ดขนาดหนึ่งใบ */
function sizeArt(s) {
  const fw = s.w * CM;
  const fh = s.h * CM;
  const x0 = W / 2 - fw / 2 - 6;   // เผื่อระยะเยื้องแผ่นหลัง ให้ชิ้นงานดูอยู่กลางการ์ด
  const y0 = BASE - fh;

  const big = `${s.w}×${s.h}`;
  const bw = big.length * 40 + 130;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด ${s.w} × ${s.h} ซม.</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${s.sub}</text>

  ${frame(x0, y0, fw, fh, s.name.replace(/[^0-9a-z]/gi, ""))}

  ${dim(x0, BASE + 36, x0 + fw, BASE + 36, `${s.w} ซม.`)}
  ${dim(x0 + fw + 46, y0, x0 + fw + 46, BASE, `${s.h} ซม.`)}

  ${sideView(152, 745, s.t)}

  <!-- เลขขนาดตัวใหญ่ — ภาพย่อบนปุ่มตัวเลือกเล็กมาก ต้องอ่านออก -->
  <g>
    <rect x="${W / 2 - bw / 2}" y="${726}" width="${bw}" height="90" rx="23" fill="#ffffff" opacity="0.95" stroke="#a5f3fc" stroke-width="2.5"/>
    <text x="${W / 2 - 34}" y="${791}" font-family="${TH}" font-size="72" font-weight="800" text-anchor="middle" fill="${OK}">${big}</text>
    <text x="${W / 2 + bw / 2 - 52}" y="${789}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${SUB}">ซม.</text>
  </g>

  ${tag(W / 2, 168, s.chip, true)}
  <text x="${W / 2}" y="${H - 38}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ทุกภาพสเกลเดียวกัน เทียบขนาดข้ามตัวเลือกได้จริง · หนีบรูปตรงกลาง เปลี่ยนรูปเองได้</text>
</svg>`;
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = SIZES.map((s) => ({
  file: `size-${s.name.replace(/cm$/, "").replace(/\./g, "-")}-${VER}.jpg`,
  svg: sizeArt(s),
  choice: s.name,
  desc: s.desc,
}));

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
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

const groups = data.options ?? [];
const group = groups.find((o) => o.label === SIZE_GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
const before = groups.length;
group.display = "cards";
for (const j of JOBS) {
  const c = group.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}" ในกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
  c.desc = j.desc;
  c.imageSrc = j.url; // ชื่อตัวเลือกเป็นคีย์แกนราคา ห้ามเปลี่ยน
}
if (groups.length !== before) { console.error("จำนวนกลุ่มตัวเลือกเปลี่ยน!"); process.exit(1); }

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const backGroup = back.data.options.find((o) => o.label === SIZE_GROUP);
if (backGroup?.display !== "cards") { console.error("display ไม่เป็น cards!", backGroup?.display); process.exit(1); }
for (const j of JOBS) {
  const c = backGroup?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url || c?.desc !== j.desc) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
}
// แกนราคาต้องไม่สะเทือน — ชื่อตัวเลือกยังตรงคีย์ cells ครบ (ทั้ง pricing และ priceRates)
const cellKeys = Object.keys(back.data.pricing?.cells ?? {});
const rateKeys = Object.keys(back.data.priceRates?.[0]?.pricing?.cells ?? {});
for (const c of backGroup.choices) {
  if (!cellKeys.includes(c.name) || !rateKeys.includes(c.name)) { console.error("ชื่อตัวเลือกหลุดจากคีย์ตาราง!", c.name); process.exit(1); }
}
// กลุ่ม "สกรีน" ต้องอยู่ครบเหมือนเดิม (showWhen อ้างชื่อขนาด)
const scr = back.data.options.find((o) => o.label === "สกรีน");
if (!scr || scr.choices?.length !== 4) { console.error('กลุ่ม "สกรีน" เพี้ยน!', scr); process.exit(1); }
console.log(`✓ ${JOBS.length} ภาพ + desc + display cards อ่านกลับตรง · คีย์ตารางครบ · savedAt =`, back.data.savedAt);
