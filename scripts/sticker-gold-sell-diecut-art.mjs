#!/usr/bin/env node
/**
 * Sticker Gold | Silver | RoseGold (sticker-gold-silver-rosegold · /products/Sticker-Gold-Silver-RoseGold)
 * ภาพประกอบ 2 กลุ่ม รวม 4 ใบ — ผู้ใช้สั่ง 4 ก.ย. 69
 *   • "ขายแบบ"    → พิมพ์ลาย / ไม่พิมพ์ลาย
 *   • "แบบไดคัท"  → ไดคัท 50% (ตัดครึ่ง) / ไดคัท 100% (ตัดขาดทีละชิ้น)
 *
 *   node scripts/sticker-gold-sell-diecut-art.mjs           (วาดลง .cache/… ดูก่อน ไม่แตะ DB)
 *   node scripts/sticker-gold-sell-diecut-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * ทำไมต้องมีภาพ: 2 กลุ่มนี้เป็นข้อความล้วน แต่เป็น "แกนตารางราคา" ทั้งคู่ (driverLabels
 * = ["ขายแบบ","แบบไดคัท"]) — ลูกค้าเลือกผิดคือได้ของผิดทั้งล็อต
 *   · ขายแบบ  : ต่างกันที่ "มีลายพิมพ์บนฟอยล์ไหม" — ไม่พิมพ์ = ได้ฟอยล์เปล่าตามทรง
 *   · แบบไดคัท: 50% = มีดตัดแค่ชั้นสติ๊กเกอร์ แผ่นรองไม่ขาด (ลอกทีละดวง)
 *               100% = ตัดขาดทั้งแผ่นรอง ได้เป็นชิ้น ๆ แยกกัน
 *     ภาพจึงกางภาพตัดขวาง (มีด + 2 ชั้น) ไว้ใต้ภาพหลัก เพราะเป็นจุดต่างที่อธิบายด้วยคำยาก
 *
 * ที่มาของคำอธิบาย: choices[].desc ของสินค้าใน DB (ไม่ได้แต่งใหม่)
 * กลุ่มทั้งสองเป็นแกนราคา → เติมได้แค่ choices[].imageSrc **ห้ามแก้ชื่อตัวเลือก**
 * ([[iducky-price-driver-trap]]) · สคริปต์ตรวจ driverLabels + จำนวน cells ก่อน/หลังเขียน
 *
 * ⚠️ กลุ่มนี้ display=dropdown → หน้าร้านโชว์ภาพของตัวที่เลือกเป็นรูปเล็ก 44px ข้างเมนู
 *    + กดเลือกแล้วแกลเลอรีเด้งไปภาพใบนั้น (ProductDetail: jumpToImage) จุดต่างต้องอ่านออกทั้งเล็กและใหญ่
 *    → ใช้ "สีของลาย" เป็นตัวแยกใบพิมพ์/ไม่พิมพ์ และ "แผ่นเดียว vs ชิ้นกระจาย" แยก 50%/100%
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "sticker-gold-silver-rosegold";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const BACK = "#eef2f6";      // แผ่นรอง (silicone) — เทาอ่อน
const BACK_LINE = "#cbd5e1";

const HEART = await mascotDataUri("heart", 360);
const PEACE = await mascotDataUri("peace", 360);

/** วางมาสคอตกลางกรอบ รักษาสัดส่วน */
const art = (m, cx, cy, boxH, opacity = 1) => {
  const h = boxH, w = h * m.ratio;
  return `<image href="${m.uri}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`;
};

/** เนื้อฟอยล์เมทัลลิก + ริ้วแสง — ใช้ทุกใบ (ตัวอย่างเป็นเนื้อสีทอง บอกไว้ในโน้ตท้ายภาพ) */
const DEFS = `
  <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0"    stop-color="#faeec2"/>
    <stop offset="0.28" stop-color="#d8b055"/>
    <stop offset="0.5"  stop-color="#f7e6a6"/>
    <stop offset="0.74" stop-color="#c99a3c"/>
    <stop offset="1"    stop-color="#e7c877"/>
  </linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
    <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0.28"/>
  </linearGradient>
  <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#22d3ee"/>
    <stop offset="1" stop-color="#4f46e5"/>
  </linearGradient>`;

/** ดวงสติ๊กเกอร์ 1 ดวง — เนื้อฟอยล์ + (ถ้าพิมพ์) ลายบนดวง */
function dot(cx, cy, r, { printed, rot = 0, dash = true, key = "" } = {}) {
  const d = r * 2;
  const g = `
    <rect x="${cx - r}" y="${cy - r}" width="${d}" height="${d}" rx="${r * 0.42}" fill="url(#foil)"/>
    <rect x="${cx - r}" y="${cy - r}" width="${d}" height="${d}" rx="${r * 0.42}" fill="url(#sheen)"/>
    ${printed ? `
      <circle cx="${cx}" cy="${cy}" r="${r * 0.74}" fill="url(#ink)" opacity="0.92"/>
      ${art(key === "b" ? PEACE : HEART, cx, cy + r * 0.04, r * 1.16)}
    ` : ""}
    ${dash ? `<rect x="${cx - r}" y="${cy - r}" width="${d}" height="${d}" rx="${r * 0.42}" fill="none" stroke="#0f172a" stroke-width="2" stroke-dasharray="7 6" opacity="0.35"/>` : ""}`;
  return rot ? `<g transform="rotate(${rot} ${cx} ${cy})">${g}</g>` : g;
}

/** โครงการ์ดกลาง — หัวเรื่อง + คำโปรย + เนื้อ + โน้ตท้าย 2 บรรทัด */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="90" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="130" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 68}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 36}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ป้ายกลางภาพ — ตัวชี้ขาดตอนย่อเป็นรูปเล็ก */
const badge = (y, text, tone = OK) => {
  const w = text.length * 15 + 64;
  return `
  <rect x="${W / 2 - w / 2}" y="${y - 33}" width="${w}" height="66" rx="24" fill="#ffffff" stroke="${tone}" stroke-width="3.5"/>
  <text x="${W / 2}" y="${y + 11}" font-family="${TH}" font-size="30" font-weight="800" text-anchor="middle" fill="${tone}">${text}</text>`;
};

/* ══ กลุ่ม "ขายแบบ" — แผ่นฟอยล์ 6 ดวง พิมพ์ลาย vs เปล่า ══════════════ */
const SH = { x: 96, y: 208, w: 708, h: 400 };
function sellArt(printed) {
  const cols = [SH.x + 138, SH.x + 354, SH.x + 570];
  const rows = [SH.y + 112, SH.y + 288];
  const dots = rows.flatMap((cy, ri) => cols.map((cx, ci) =>
    dot(cx, cy, 78, { printed, key: (ri + ci) % 2 ? "b" : "a" })));
  return card(
    printed ? "พิมพ์ลาย" : "ไม่พิมพ์ลาย",
    printed ? "พิมพ์ลายของคุณลงบนเนื้อฟอยล์ด้วยระบบ UV" : "แผ่นฟอยล์เปล่า ไดคัทตามทรงที่สั่ง — ไม่มีลายพิมพ์",
    `
    <rect x="${SH.x + 6}" y="${SH.y + 10}" width="${SH.w}" height="${SH.h}" rx="14" fill="#0f172a" opacity="0.08"/>
    <rect x="${SH.x}" y="${SH.y}" width="${SH.w}" height="${SH.h}" rx="14" fill="${BACK}" stroke="${BACK_LINE}" stroke-width="2.5"/>
    ${dots.join("")}
    <text x="${W / 2}" y="${SH.y + SH.h + 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">
      ${printed ? "ลายที่พิมพ์อยู่บนเนื้อฟอยล์ — เนื้อโลหะจะเห็นวิ้งผ่านลายที่โปร่ง" : "ได้เนื้อฟอยล์ล้วนตามทรง เอาไปใช้เป็นขอบ/สติ๊กเกอร์สีพื้นได้"}</text>
    ${badge(SH.y + SH.h + 108, printed ? "มีลายพิมพ์บนเนื้อฟอยล์" : "ฟอยล์เปล่า ไม่มีลาย", printed ? OK : "#94a3b8")}`,
    printed ? "ส่งไฟล์ลายมาได้ทั้ง AI / PDF / PNG ความละเอียด 300 dpi" : "ราคาเบากว่าแบบพิมพ์ลาย — คิดค่าไดคัทตามขนาดที่สั่ง",
    "ตัวอย่างใช้เนื้อสีทอง · เลือกสีเนื้อ (เงิน / ทอง / โรสโกลด์) ได้ในกลุ่มด้านบน"
  );
}

/* ══ กลุ่ม "แบบไดคัท" — 50% ยังติดแผ่นรอง vs 100% แยกเป็นชิ้น ═════════ */
/** ภาพตัดขวาง: มีด + ชั้นสติ๊กเกอร์ + กาว + แผ่นรอง — จุดต่างจริงของ 50/100 */
function crossSection(y, through) {
  const x0 = 152, x1 = 748, cx = (x0 + x1) / 2;
  const top = y + 26;      // ชั้นสติ๊กเกอร์ (ฟอยล์)
  const bot = y + 58;      // แผ่นรอง
  const gap = 11;          // ช่องที่มีดผ่าน — กว้างพอให้เห็นว่าแผ่นรองขาด/ไม่ขาด
  // ใบมีดผอมกว่าช่องตัด ไม่งั้นบังช่องที่เป็นจุดต่างของภาพ · ด้ามอยู่ใต้หัวข้อ ไม่ทับกัน
  const blade = `
    <rect x="${cx - 8}" y="${y - 84}" width="16" height="44" rx="5" fill="#475569"/>
    <path d="M ${cx} ${y - 46} L ${cx - 9} ${y - 6} L ${cx} ${through ? bot + 20 : top + 22} L ${cx + 9} ${y - 6} Z"
      fill="#94a3b8" stroke="#64748b" stroke-width="2"/>`;
  return `
  <rect x="112" y="${y - 140}" width="676" height="262" rx="20" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="${y - 104}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${INK}">ภาพตัดขวาง — มีดลงลึกแค่ไหน</text>
  <!-- ชั้นสติ๊กเกอร์: ตัดขาดทั้งสองแบบ จึงเว้นช่องกลางเท่ากัน -->
  <rect x="${x0}" y="${top}" width="${cx - gap - x0}" height="26" rx="4" fill="url(#foil)" stroke="#a97f28" stroke-width="1.5"/>
  <rect x="${cx + gap}" y="${top}" width="${x1 - cx - gap}" height="26" rx="4" fill="url(#foil)" stroke="#a97f28" stroke-width="1.5"/>
  <!-- แผ่นรอง: 50% ยังเป็นผืนเดียว · 100% ขาดตามกัน -->
  ${through
      ? `<rect x="${x0}" y="${bot}" width="${cx - gap - x0}" height="22" rx="4" fill="${BACK}" stroke="${BACK_LINE}" stroke-width="2"/>
         <rect x="${cx + gap}" y="${bot}" width="${x1 - cx - gap}" height="22" rx="4" fill="${BACK}" stroke="${BACK_LINE}" stroke-width="2"/>`
      : `<rect x="${x0}" y="${bot}" width="${x1 - x0}" height="22" rx="4" fill="${BACK}" stroke="${BACK_LINE}" stroke-width="2"/>`}
  ${blade}
  <text x="${x0 - 10}" y="${top + 20}" font-family="${TH}" font-size="17" font-weight="600" text-anchor="end" fill="${SUB}">เนื้อสติ๊กเกอร์</text>
  <text x="${x0 - 10}" y="${bot + 18}" font-family="${TH}" font-size="17" font-weight="600" text-anchor="end" fill="${through ? "#e11d48" : OK}">แผ่นรอง</text>
  <text x="${W / 2}" y="${y + 106}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle"
    fill="${through ? "#e11d48" : OK}">${through ? "มีดตัดขาดทั้งแผ่นรอง → หลุดเป็นชิ้น ๆ" : "แผ่นรองไม่ขาด → ดวงยังติดอยู่บนแผ่น"}</text>`;
}

/** 50% — แผ่นเดียว 6 ดวงยังติดแผ่นรอง มีดวงหนึ่งกำลังลอกขึ้น */
function diecut50() {
  const S = { x: 118, y: 190, w: 664, h: 316 };
  const cols = [S.x + 116, S.x + 332, S.x + 548];
  const rows = [S.y + 92, S.y + 232];
  const cells = [];
  rows.forEach((cy, ri) => cols.forEach((cx, ci) => {
    if (ri === 0 && ci === 2) return;          // ดวงนี้ลอกขึ้นอยู่ — วาดทีหลัง
    cells.push(dot(cx, cy, 66, { printed: true, key: (ri + ci) % 2 ? "b" : "a" }));
  }));
  const px = cols[2], py = rows[0];
  return card(
    "ไดคัท 50% (ตัดครึ่ง)",
    "ตัดเฉพาะเนื้อสติ๊กเกอร์ · ลายยังติดแผ่นรอง ลอกใช้ทีละดวง",
    `
    <rect x="${S.x + 6}" y="${S.y + 10}" width="${S.w}" height="${S.h}" rx="14" fill="#0f172a" opacity="0.08"/>
    <rect x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" rx="14" fill="${BACK}" stroke="${BACK_LINE}" stroke-width="2.5"/>
    ${cells.join("")}
    <!-- ช่องที่ลอกดวงออกไปแล้ว: เห็นแผ่นรองเปล่า ๆ (เส้นประ = รอยไดคัทเดิม) -->
    <rect x="${px - 66}" y="${py - 66}" width="132" height="132" rx="28" fill="#e2e8f0" stroke="${BACK_LINE}" stroke-width="2" stroke-dasharray="8 7"/>
    <!-- ดวงที่กำลังลอกขึ้น -->
    <g transform="rotate(-13 ${px + 34} ${py - 44})">
      <rect x="${px - 30}" y="${py - 108}" width="132" height="132" rx="28" fill="#0f172a" opacity="0.16"/>
      ${dot(px + 36, py - 42, 66, { printed: true, dash: false, key: "a" })}
    </g>
    <path d="M ${px + 118} ${py + 74} q 34 -34 12 -84" fill="none" stroke="${OK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M ${px + 126} ${py - 24} l 4 24 l -22 -12 Z" fill="${OK}"/>
    <text x="${px + 4}" y="${S.y + S.h + 38}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${OK}">ลอกทีละดวง</text>
    ${crossSection(700, false)}`,
    "เหมาะแจกทั้งแผ่น / ทยอยลอกใช้ · คิดค่าจุดไดคัทตามโควตาของขนาดที่เลือก",
    "คละลายในแผ่นเดียวได้ 2 ลาย (เกินจากนั้นลายละ ฿20)"
  );
}

/** 100% — ชิ้นแยกกระจาย มีขอบแผ่นรองติดมาทุกชิ้น */
function diecut100() {
  const P = [
    { x: 232, y: 248, r: 72, rot: -9, k: "a" },
    { x: 448, y: 220, r: 66, rot: 7, k: "b" },
    { x: 662, y: 254, r: 70, rot: -5, k: "a" },
    { x: 292, y: 416, r: 64, rot: 11, k: "b" },
    { x: 500, y: 430, r: 74, rot: -7, k: "a" },
    { x: 684, y: 418, r: 62, rot: 9, k: "b" },
  ];
  const piece = (p) => `
    <g transform="rotate(${p.rot} ${p.x} ${p.y})">
      <rect x="${p.x - p.r - 9}" y="${p.y - p.r - 3}" width="${(p.r + 9) * 2}" height="${(p.r + 9) * 2}" rx="${p.r * 0.5}" fill="#0f172a" opacity="0.13"/>
      <rect x="${p.x - p.r - 9}" y="${p.y - p.r - 9}" width="${(p.r + 9) * 2}" height="${(p.r + 9) * 2}" rx="${p.r * 0.5}" fill="${BACK}" stroke="${BACK_LINE}" stroke-width="2"/>
      ${dot(p.x, p.y, p.r, { printed: true, dash: false, key: p.k })}
    </g>`;
  return card(
    "ไดคัท 100% (ตัดขาดทีละชิ้น)",
    "ตัดขาดทั้งแผ่นรอง แยกออกมาเป็นชิ้น ๆ พร้อมใช้ทันที",
    `
    ${P.map(piece).join("")}
    <text x="${W / 2}" y="540" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ได้เป็นชิ้นแยกกัน ทุกชิ้นมีแผ่นรองของตัวเอง — หยิบแจกได้เลย</text>
    ${crossSection(700, true)}`,
    "เหมาะแจกทีละชิ้น / แถมในกล่องสินค้า · ไม่ต้องตัดแบ่งเองทีหลัง",
    "ขนาดชิ้นเล็กสุด 2 × 2 ซม. ใหญ่สุดเท่าแผ่น A3"
  );
}

/* ── วาดลงแคช ─────────────────────────────────────────────────────── */
const JOBS = [
  { group: "ขายแบบ", choice: "พิมพ์ลาย", file: `sell-printed-${VER}.jpg`, svg: sellArt(true) },
  { group: "ขายแบบ", choice: "ไม่พิมพ์ลาย", file: `sell-blank-${VER}.jpg`, svg: sellArt(false) },
  { group: "แบบไดคัท", choice: "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)", file: `diecut-50-${VER}.jpg`, svg: diecut50() },
  { group: "แบบไดคัท", choice: "ไดคัท 100% (ตัดขาดทีละชิ้น)", file: `diecut-100-${VER}.jpg`, svg: diecut100() },
];
for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

/* ── อัปโหลด storage + เขียน DB ────────────────────────────────────── */
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/sticker-metallic/${j.file}`;      // โฟลเดอร์รูปของสินค้าตัวนี้ (ดู images ใน DB)
  const { error } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/sticker-metallic/`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — ดัมป์สภาพเดิมกันเหนียว
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const before = { groups: (data.options ?? []).length, drivers: JSON.stringify(data.pricing?.driverLabels), cells: Object.keys(data.pricing?.cells ?? {}).length };
for (const j of JOBS) {
  const g = (data.options ?? []).find((o) => (o.label ?? "").trim() === j.group);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${j.group}"`); process.exit(1); }
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}" ในกลุ่ม ${j.group}`); process.exit(1); }
  c.imageSrc = j.url;
}
data.savedAt = new Date().toISOString();   // ?v=savedAt กันเบราว์เซอร์ค้างรูปเก่า
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

/* ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────── */
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of JOBS) {
  const c = (back.data.options ?? []).find((o) => (o.label ?? "").trim() === j.group)?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.group, j.choice, c?.imageSrc); process.exit(1); }
}
const after = { groups: (back.data.options ?? []).length, drivers: JSON.stringify(back.data.pricing?.driverLabels), cells: Object.keys(back.data.pricing?.cells ?? {}).length };
for (const k of ["groups", "drivers", "cells"]) {
  if (before[k] !== after[k]) { console.error(`⚠️ ${k} เพี้ยน: ${before[k]} → ${after[k]}`); process.exit(1); }
}
console.log(`✓ ภาพ ${JOBS.length} ใบ ครบ · กลุ่ม ${after.groups} · แกนราคา ${after.drivers} · cells ${after.cells} · savedAt = ${back.data.savedAt}`);
