#!/usr/bin/env node
/**
 * BANNER (แบนเนอร์กระดาษอาร์ตการ์ด · banner-artcard · /products/BANNER)
 * ภาพประกอบกลุ่มตัวเลือก "จำนวนด้านที่พิมพ์" — 2 ใบ
 *
 *   node scripts/banner-print-sides-art.mjs            (วาดภาพลง .cache/banner-artcard/upload ดูก่อน)
 *   node scripts/banner-print-sides-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * ทำไมต้องมีภาพ: กลุ่มนี้เดิมเป็นปุ่มข้อความล้วน ลูกค้าอ่าน "พิมพ์ 2 ด้าน +15"
 * แล้วยังนึกไม่ออกว่าอีกด้านของแผ่นหน้าตาเป็นยังไง (กระดาษเปล่า vs พิมพ์อีกลาย)
 * การ์ดจึงกาง "แผ่นหน้า / แผ่นหลัง" ให้เห็นคู่กันในใบเดียว
 *
 * ที่มาของตัวเลข: products.banner-artcard ใน DB (3 ก.ย. 69)
 *   terms: 1 แผ่น 65 × 30 ซม. ต่อ 1 ลาย · พิมพ์ 2 ด้าน บวกแผ่นละ 15 บาท
 *   choices: "พิมพ์ 1 ด้าน" | "พิมพ์ 2 ด้าน" (extra 15)
 * กลุ่มนี้ **ไม่ใช่แกนตารางราคา** (driverLabels = ชนิดกระดาษ, เคลือบ (เฉพาะด้านหน้า))
 * จึงเติมได้แค่ imageSrc ไม่ต้องแตะคีย์ cells
 *
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (เทียบเท่าโซน 300-600 ของภาพ 900×900)
 *    จุดต่างจึงต้องอยู่กลางใบ: ป้ายเลขด้าน + ขอบบนของแผ่นหลัง (ขาวเปล่า vs พิมพ์ลาย)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "banner-artcard";
const GROUP = "จำนวนด้านที่พิมพ์";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const PAPER = "#fdfdfb";   // สีเนื้อกระดาษอาร์ตการ์ดที่ยังไม่พิมพ์

const HEART = await mascotDataUri("heart", 420);
const PEACE = await mascotDataUri("peace", 420);

/** แผ่นจริง 65 × 30 ซม. — สเกลเดียวกันทั้ง 2 ใบ */
const CM = 6.6;
const SHEET_W = 65 * CM;   // 429
const SHEET_H = 30 * CM;   // 198
const SX = (W - SHEET_W) / 2;
const FRONT_Y = 214;
const BACK_Y = 540;
const BADGE_Y = 470;       // กลางภาพพอดี — โซนที่ปุ่มตัวเลือกครอปเห็น

/** วางมาสคอตในกรอบโดยรักษาสัดส่วน */
const art = (m, cx, cy, boxH) => {
  const h = boxH;
  const w = h * m.ratio;
  return `<image href="${m.uri}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
};

/**
 * ลายที่พิมพ์ลงแผ่น — ป้ายเชียร์ตามที่ลูกค้าสั่งจริง (มาสคอต + ตัวอักษร + ดาว)
 * design A = ด้านหน้า (ฟ้า-เขียว) · design B = ด้านหลัง (ชมพู-ส้ม) ให้เห็นว่าคนละลายกันได้
 */
function printedSheet(y, variant) {
  const a = variant === "A";
  const id = `g${variant}`;
  const cx = SX + SHEET_W / 2;
  const cy = y + SHEET_H / 2;
  const mascot = a ? HEART : PEACE;
  // ตัวอักษรบนแผ่นต้องแตกเป็น 2 บรรทัด — ช่องว่างขวามาสคอตกว้างแค่ ~260 px บรรทัดเดียวล้นออกนอกแผ่น
  const words = a ? ["HAPPY", "BIRTHDAY"] : ["WE LOVE", "YOU !"];
  const sub = a ? "iDUCKY  ·  09.09" : "ขอบคุณที่มาเจอกันนะ";
  const tx = SX + 172;
  const star = (x, sy, r, o) => `<path d="M ${x} ${sy - r} L ${x + r * 0.32} ${sy - r * 0.32} L ${x + r} ${sy} L ${x + r * 0.32} ${sy + r * 0.32} L ${x} ${sy + r} L ${x - r * 0.32} ${sy + r * 0.32} L ${x - r} ${sy} L ${x - r * 0.32} ${sy - r * 0.32} Z" fill="#ffffff" opacity="${o}"/>`;
  return `
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a ? "#67e8f9" : "#fbcfe8"}"/>
      <stop offset="1" stop-color="${a ? "#0e7490" : "#fb923c"}"/>
    </linearGradient>
    <clipPath id="clip${variant}"><rect x="${SX}" y="${y}" width="${SHEET_W}" height="${SHEET_H}" rx="8"/></clipPath>
  </defs>
  <g clip-path="url(#clip${variant})">
    <rect x="${SX}" y="${y}" width="${SHEET_W}" height="${SHEET_H}" fill="url(#${id})"/>
    ${star(SX + 44, y + 40, 15, 0.55)}${star(SX + 92, y + 150, 10, 0.4)}${star(SX + SHEET_W - 40, y + 44, 12, 0.45)}${star(SX + SHEET_W - 84, y + 158, 16, 0.35)}
    ${art(mascot, SX + 84, cy + 6, SHEET_H * 0.82)}
    <text x="${tx}" y="${cy - 24}" font-family="${TH}" font-size="36" font-weight="800" fill="#ffffff">${words[0]}</text>
    <text x="${tx}" y="${cy + 16}" font-family="${TH}" font-size="36" font-weight="800" fill="#ffffff">${words[1]}</text>
    <text x="${tx + 1}" y="${cy + 52}" font-family="${TH}" font-size="22" font-weight="600" fill="#ffffff" opacity="0.9">${sub}</text>
    <rect x="${tx}" y="${cy + 66}" width="130" height="5" rx="2.5" fill="#ffffff" opacity="0.75"/>
  </g>
  <rect x="${SX}" y="${y}" width="${SHEET_W}" height="${SHEET_H}" rx="8" fill="none" stroke="#0f172a" stroke-width="2" opacity="0.12"/>`;
}

/** แผ่นที่ไม่ได้พิมพ์ — เนื้อกระดาษอาร์ตการ์ดเปล่า */
function blankSheet(y) {
  const cx = SX + SHEET_W / 2;
  return `
  <rect x="${SX}" y="${y}" width="${SHEET_W}" height="${SHEET_H}" rx="8" fill="${PAPER}" stroke="#cbd5e1" stroke-width="2.5"/>
  <text x="${cx}" y="${y + SHEET_H / 2 + 11}" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="#b6bfca">กระดาษเปล่า ไม่พิมพ์</text>`;
}

/** เงาใต้แผ่น ให้ดูเป็นกระดาษวางซ้อนกัน ไม่ใช่สี่เหลี่ยมแบน */
const shadow = (y) => `<rect x="${SX + 5}" y="${y + 9}" width="${SHEET_W}" height="${SHEET_H}" rx="8" fill="#0f172a" opacity="0.09"/>`;

/** ป้ายกำกับแผ่น (ซ้าย/ขวาของแผ่น) */
const tag = (cx, y, text, on) => {
  const w = text.length * 12.5 + 40;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="38" rx="19" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2"/>
  <text x="${cx}" y="${y + 26}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ป้ายเลขด้านกลางภาพ — ตัวชี้ขาดในภาพย่อ 62×62 (ราคาส่วนเพิ่มอยู่ในป้ายเดียวกัน ไม่งั้นไปทับขอบแผ่นหลัง) */
function badge(sides, extra) {
  const bw = extra ? 400 : 300;
  const x0 = W / 2 - bw / 2;
  const nx = extra ? W / 2 - 130 : W / 2 - 44;
  const lx = extra ? W / 2 - 48 : W / 2 + 62;
  return `
  <rect x="${x0}" y="${BADGE_Y - 46}" width="${bw}" height="92" rx="26" fill="#ffffff" stroke="${OK}" stroke-width="3.5"/>
  <text x="${nx}" y="${BADGE_Y + 22}" font-family="${TH}" font-size="66" font-weight="800" text-anchor="middle" fill="${OK}">${sides}</text>
  <text x="${lx}" y="${BADGE_Y + 18}" font-family="${TH}" font-size="34" font-weight="700" text-anchor="middle" fill="${INK}">ด้าน</text>
  ${extra ? `
  <line x1="${W / 2 + 8}" y1="${BADGE_Y - 28}" x2="${W / 2 + 8}" y2="${BADGE_Y + 28}" stroke="#e2e8f0" stroke-width="2.5"/>
  <text x="${W / 2 + 110}" y="${BADGE_Y + 2}" font-family="${TH}" font-size="30" font-weight="800" text-anchor="middle" fill="${OK}">+฿15</text>
  <text x="${W / 2 + 110}" y="${BADGE_Y + 32}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${SUB}">ต่อแผ่น</text>` : ""}`;
}

function sidesArt(sides) {
  const one = sides === 1;
  const body = `
  ${shadow(FRONT_Y)}${printedSheet(FRONT_Y, "A")}
  ${tag(SX + SHEET_W / 2, FRONT_Y - 50, "ด้านหน้า — พิมพ์ลาย", true)}
  ${shadow(BACK_Y)}${one ? blankSheet(BACK_Y) : printedSheet(BACK_Y, "B")}
  ${tag(SX + SHEET_W / 2, BACK_Y + SHEET_H + 20, one ? "ด้านหลัง — กระดาษเปล่า" : "ด้านหลัง — พิมพ์ลาย", !one)}
  ${badge(sides, !one)}`;
  return one
    ? card("พิมพ์ 1 ด้าน", "พิมพ์เต็มแผ่นเฉพาะด้านหน้า", body,
      "ด้านหลังเป็นเนื้อกระดาษอาร์ตการ์ดเปล่า ไม่มีลาย",
      "แผ่นละ 65 × 30 ซม. · เคลือบได้เฉพาะด้านหน้า")
    : card("พิมพ์ 2 ด้าน", "พิมพ์เต็มแผ่นทั้งหน้าและหลัง · บวกแผ่นละ ฿15", body,
      "หน้า-หลังใช้คนละลายได้ ส่งไฟล์มา 2 ไฟล์",
      "เลือกเคลือบด้านหลังเพิ่มได้ (เงา/ด้าน +฿15 · พิเศษ +฿60 ต่อแผ่น)");
}

// ── วาดลงแคช ─────────────────────────────────────────────────────────
const JOBS = [
  { choice: "พิมพ์ 1 ด้าน", file: `sides-1-${VER}.jpg`, svg: sidesArt(1) },
  { choice: "พิมพ์ 2 ด้าน", file: `sides-2-${VER}.jpg`, svg: sidesArt(2) },
];
for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน DB ───────────────────────────────────────
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

const g = (data.options ?? []).find((o) => o.label === GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.savedAt = new Date().toISOString();   // ?v=savedAt กันเบราว์เซอร์ค้างรูปเก่า
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
for (const j of JOBS) {
  const c = bg?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
}
// กันกลุ่มตัวเลือกหาย/ราคาหล่น — กลุ่มนี้ไม่ใช่แกนราคา แต่ตรวจไว้ให้ชัวร์
if (back.data.options.length !== (row.data.options?.length ?? 0)) { console.error("จำนวนกลุ่มตัวเลือกเพี้ยน"); process.exit(1); }
if (bg.choices.find((c) => c.name === "พิมพ์ 2 ด้าน")?.extra !== 15) { console.error("ค่า extra ของพิมพ์ 2 ด้าน หาย"); process.exit(1); }
console.log(`✓ ภาพ ${JOBS.length} ใบ ครบ · savedAt =`, back.data.savedAt);
