#!/usr/bin/env node
/**
 * ปฎิทินผ้าแคนวาส (40x85cm) — กลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบขนาด
 *
 *   node scripts/canvas-calendar-size-option.mjs           (วาดภาพลง .cache/40x85cm/upload ดูก่อน)
 *   node scripts/canvas-calendar-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ขนาดมาตรฐานผืนละ 40 × 85 ซม. (แนวตั้ง) แขวนผนังด้วยหมุด 2 ตัวหัวผืน — อ้างรูปงานจริง
 * products/40x85cm/photo-hang-front-v1.jpg · เพิ่มขนาดได้ทีละนิ้วผ่านกลุ่ม "เพิ่มขนาด"
 *
 * กลุ่ม "ขนาด" มีอยู่แล้ว (display cards ตัวเลือกเดียว) — สคริปต์นี้เติม imageSrc ให้ตัวเลือก
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("peace", 420);

const PRODUCT_ID = "40x85cm";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/40x85cm/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "40x85 ซม.";
const SIZE_DESC = "ผ้าแคนวาสแนวตั้ง แขวนผนัง · เพิ่มขนาดได้ทีละนิ้วในกลุ่ม “เพิ่มขนาด”";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ placemat-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/**
 * ภาพ "ขนาดปฏิทินผ้า" — ผืนแนวตั้ง 40×85 ซม. แขวนหมุด 2 ตัว
 * บนผืน: ช่องลายพิมพ์ทรงโค้ง + มาสคอตแทนลายลูกค้า / ล่าง: ตาราง 12 เดือน 3×4 + เลขปี
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (พิกัด 300–600) — ป้ายขนาดจึงวางคร่อมกลางผืน
 */
function sizeArt() {
  /** 1 ซม. = 6.4 px → ผืน 40×85 ซม. = 256×544 px */
  const CM = 6.4;
  const PW = 40 * CM;
  const PH = 85 * CM;
  const cx = W / 2;
  const x0 = cx - PW / 2;
  const y0 = 196;
  const r = MASCOT.ratio;

  /* ช่องลายพิมพ์ด้านบน (ทรงโค้งครึ่งวงกลมเหมือนงานจริง) */
  const artH = PH * 0.34;
  const ax = x0 + 16;
  const ay = y0 + 18;
  const aw = PW - 32;
  const mh = artH * 0.62;
  const mw = mh * r;

  /* ตาราง 12 เดือน 3 คอลัมน์ × 4 แถว */
  const gx = x0 + 18;
  const gy = ay + artH + 22;
  const gw = PW - 36;
  const gh = PH - (gy - y0) - 74;
  const cw = gw / 3;
  const ch = gh / 4;
  const months = [];
  for (let i = 0; i < 12; i++) {
    const bx = gx + (i % 3) * cw;
    const by = gy + Math.floor(i / 3) * ch;
    months.push(`
      <rect x="${bx + 4}" y="${by + 3}" width="${cw - 8}" height="10" rx="5" fill="#94a3b8" opacity="0.55"/>
      ${[0, 1, 2, 3, 4].map((rw) => `<rect x="${bx + 4}" y="${by + 19 + rw * 7.4}" width="${cw - 8 - (rw === 4 ? 18 : 0)}" height="3.4" rx="1.7" fill="#cbd5e1"/>`).join("")}`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- เนื้อผ้าแคนวาส โทนขาวนวล -->
    <linearGradient id="canvasCloth" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#fbfaf6"/>
      <stop offset="1" stop-color="#f1efe6"/>
    </linearGradient>
    <!-- ลายทอผ้าแคนวาส -->
    <pattern id="canvasWeave" width="11" height="11" patternUnits="userSpaceOnUse">
      <path d="M 0 5.5 H 11" stroke="#e3ddcd" stroke-width="0.9" opacity="0.22"/>
      <path d="M 5.5 0 V 11" stroke="#e3ddcd" stroke-width="0.9" opacity="0.16"/>
    </pattern>
    <!-- ท้องฟ้าในช่องลายพิมพ์ -->
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b6e8f2"/>
      <stop offset="1" stop-color="#e6f8fb"/>
    </linearGradient>
    <clipPath id="artClip"><path d="M ${ax} ${ay + artH} V ${ay + aw / 2} A ${aw / 2} ${aw / 2} 0 0 1 ${ax + aw} ${ay + aw / 2} V ${ay + artH} Z"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${cx}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 40 × 85 ซม.</text>
  <text x="${cx}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ผ้าแคนวาสแนวตั้ง แขวนผนัง — ขนาดมาตรฐาน</text>

  <!-- เงาผืนผ้า -->
  <rect x="${x0 + 7}" y="${y0 + 12}" width="${PW}" height="${PH}" rx="6" fill="#0f172a" opacity="0.07"/>
  <!-- ตัวผืนผ้าแคนวาส -->
  <rect x="${x0}" y="${y0}" width="${PW}" height="${PH}" rx="6" fill="url(#canvasCloth)" stroke="#ddd6c4" stroke-width="2.5"/>
  <clipPath id="sheet"><rect x="${x0 + 2}" y="${y0 + 2}" width="${PW - 4}" height="${PH - 4}" rx="5"/></clipPath>
  <g clip-path="url(#sheet)"><rect x="${x0}" y="${y0}" width="${PW}" height="${PH}" fill="url(#canvasWeave)"/></g>

  <!-- ช่องลายพิมพ์ทรงโค้ง + มาสคอตแทนลายของลูกค้า -->
  <g clip-path="url(#artClip)">
    <rect x="${ax}" y="${ay}" width="${aw}" height="${artH}" fill="url(#sky)"/>
    <!-- เนินดอกไม้ -->
    <path d="M ${ax} ${ay + artH} L ${ax} ${ay + artH * 0.72} Q ${ax + aw * 0.5} ${ay + artH * 0.42} ${ax + aw} ${ay + artH * 0.6} L ${ax + aw} ${ay + artH} Z" fill="#7fd6c9" opacity="0.85"/>
    ${[[0.12, 0.82], [0.26, 0.74], [0.44, 0.7], [0.62, 0.72], [0.8, 0.76], [0.9, 0.84], [0.34, 0.86], [0.7, 0.88]]
      .map(([fx, fy], i) => `<circle cx="${ax + aw * fx}" cy="${ay + artH * fy}" r="${5 - (i % 3)}" fill="${["#ffb3c1", "#ffd166", "#f7768e"][i % 3]}" opacity="0.9"/>`).join("")}
    <image href="${MASCOT.uri}" x="${ax + aw / 2 - mw / 2}" y="${ay + artH * 0.16}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <path d="M ${ax} ${ay + artH} V ${ay + aw / 2} A ${aw / 2} ${aw / 2} 0 0 1 ${ax + aw} ${ay + aw / 2} V ${ay + artH} Z" fill="none" stroke="#cfe3ea" stroke-width="2"/>

  <!-- ตาราง 12 เดือน + เลขปี -->
  ${months.join("")}
  <text x="${cx}" y="${y0 + PH - 22}" font-family="${TH}" font-size="34" font-weight="700" text-anchor="middle" fill="#334155" opacity="0.75">2026</text>

  <!-- หมุดแขวน 2 ตัวหัวผืน (ตามงานจริง) -->
  <circle cx="${x0 + 22}" cy="${y0 + 20}" r="8" fill="#e7c98a" stroke="#c9a55f" stroke-width="2"/>
  <circle cx="${x0 + PW - 22}" cy="${y0 + 20}" r="8" fill="#e7c98a" stroke="#c9a55f" stroke-width="2"/>

  <!-- ป้ายขนาดคร่อมกลางผืน — ให้ย่อเป็นปุ่ม 62px แล้วยังอ่านออก -->
  <rect x="${cx - 90}" y="${H / 2 - 27}" width="180" height="60" rx="15" fill="#0f172a" opacity="0.10"/>
  <rect x="${cx - 90}" y="${H / 2 - 30}" width="180" height="60" rx="15" fill="#ffffff" opacity="0.97" stroke="#cbd5e1" stroke-width="2"/>
  <text x="${cx}" y="${H / 2 + 11}" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${INK}">40 × 85</text>

  <!-- ลูกศรวัดสองแกน -->
  ${dim(x0, y0 + PH + 40, x0 + PW, y0 + PH + 40, "40 ซม.")}
  ${dim(x0 - 46, y0, x0 - 46, y0 + PH, "85 ซม.")}

  <text x="${cx}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายตามสั่งเต็มผืน · เพิ่มขนาดได้ทีละนิ้ว</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-40x85-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
/* ครอปกลาง 300–600 ไว้ตรวจว่าที่เห็นบนปุ่มตัวเลือกยังบอกขนาดได้ */
await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ผืนปฏิทิน 40×85 ซม. (+ _thumb ครอปกลาง)`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้เป็นกลุ่มแรก
const sizeGroup = { label: SIZE_GROUP, display: "cards", choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: sizeUrl }] };
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.splice(0, 0, sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
const got = g?.choices?.[0];
if (g?.display !== "cards" || got?.name !== SIZE_CHOICE || got?.imageSrc !== sizeUrl) { console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", g); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) การ์ด + ภาพ อ่านกลับตรง · savedAt =`, back.data.savedAt);
