#!/usr/bin/env node
/**
 * BANNER (banner-artcard · /products/BANNER) — ภาพประกอบกลุ่ม "การตัด" 3 ใบ
 *
 *   node scripts/banner-cut-option-art.mjs            (วาดภาพลง .cache/banner-artcard/upload ดูก่อน)
 *   node scripts/banner-cut-option-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * เล่าเรื่องเดียวกันทั้ง 3 ใบ: "แผ่น 65 × 30 ซม. 1 แผ่น ได้ของออกมาหน้าตายังไง"
 *   ไม่ไดคัท        แผ่นเต็มพิมพ์เต็มหน้า — 1 แผ่น = 1 ชิ้น
 *   ไดคัทตามขนาด    ตัดเป็นสี่เหลี่ยม (วาด A5 4 ชิ้นตามสเกลจริง = ตรงกับ badge "ได้ 4 ชิ้น / แผ่น")
 *   ไดคัทตามทรง     ตัดวิ่งตามทรงลาย เศษกระดาษรอบ ๆ ทิ้ง
 * ทั้ง 3 ใบวางแผ่นที่พิกัดเดียวกัน (y 300-588 = โซนที่ปุ่มตัวเลือกครอปเห็นพอดี)
 * ลูกค้าจึงเทียบได้ทันทีว่าเส้นตัดต่างกันตรงไหน — ไม่มีเส้น / เส้นตรง / เส้นโค้งตามลาย
 *
 * + เปลี่ยน display ของกลุ่มจาก "dropdown" → "cards"
 *   เมนูเลื่อนโชว์รูปได้แค่ตัวที่เลือกอยู่ใบเดียว 44px (ดู ProductDetail: opt.display === "dropdown")
 *   ใส่รูปแล้วลูกค้าจะไม่เห็น 2 ใบที่เหลือเลย — กลุ่มอื่นในสินค้าตัวนี้ก็เป็น cards อยู่แล้ว
 * + ใส่ desc ต่อตัวเลือก (การ์ด < 6 ใบ โชว์ desc ใต้ชื่อ)
 *
 * ที่มาของตัวเลข: products.banner-artcard ใน DB (4 ก.ย. 69)
 *   ไม่ไดคัท perUnit 1 · ไดคัทตามขนาด extra 15 · ไดคัทตามทรง extra 30
 *   ขนาดตัด A4=2 / A5=4 / A6=9 / A7=18 ชิ้นต่อแผ่น
 * กลุ่มนี้ไม่ใช่แกนตารางราคา (driverLabels = ชนิดกระดาษ × เคลือบ (เฉพาะด้านหน้า))
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { MASCOTS, assetPath, mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "banner-artcard";
const GROUP = "การตัด";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const CUT = "#e11d48";      // สีเส้นตัด — ต้องไม่ใช่โทนเดียวกับงานพิมพ์ ไม่งั้นจมหาย
const PAPER = "#edf0f3";   // แผ่นเปล่า/เศษกระดาษ — เทาอ่อนพอให้ขอบขาวของชิ้นไดคัทเด้งออกมา

/** แผ่นจริง 65 × 30 ซม. — วางที่เดิมทั้ง 3 ใบ */
const CM = 9.6;
const SHEET_W = 65 * CM;    // 624
const SHEET_H = 30 * CM;    // 288
const SX = (W - SHEET_W) / 2;
const SY = 300;             // 300-588 = โซนที่ภาพย่อ 62×62 ครอปเห็น

const HEART = await mascotDataUri("heart", 300);

/**
 * ชิ้นไดคัทตามทรง — พองจาก alpha ของ PNG มาสคอตจริง (ไม่ได้วาดทรงเอง)
 * ได้ขอบขาวรอบตัว + เส้นตัดสีชมพูวิ่งตามทรง เหมือนงานไดคัทจริง
 */
async function dieCutPiece(mascot, width = 300) {
  const artBuf = await sharp(assetPath(MASCOTS[mascot] ?? mascot)).trim({ threshold: 1 }).resize({ width }).png().toBuffer();
  const m = await sharp(artBuf).metadata();
  const pad = Math.round(width * 0.25);   // เผื่อที่ให้ทรงพองออก — แคบไปขอบไดคัทจะโดนตัดหัวท้าย
  const cw = m.width + pad * 2;
  const ch = m.height + pad * 2;
  const canvas = () => sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const padded = await canvas().composite([{ input: artBuf, left: pad, top: pad }]).png().toBuffer();
  // ⚠️ alpha มาสคอตมีขอบฟุ้ง — threshold ให้คมก่อน ไม่งั้นขอบที่ "พอง" แทบไม่ขยับ
  const hard = await sharp(await sharp(padded).extractChannel("alpha").toBuffer()).threshold(140).toBuffer();
  // ขอบขาว = alpha ที่พองออกมา · เส้นตัด = วงที่พองกว่านิดเดียว (threshold ต่ำกว่า = ทรงใหญ่กว่า)
  // ทั้งคู่ผ่าน threshold จึงได้ขอบคม ไม่ใช่เงาฟุ้ง — ต่างกันแค่ 22/255 จะได้เส้นบาง ๆ เหมือนรอยไดคัท
  // ⚠️ sharp เรียง .blur().threshold() ต่อกันในไพป์ไลน์เดียวไม่ได้ — threshold กลายเป็น no-op
  //    (พิสูจน์แล้ว: mean ของผลลัพธ์เท่าภาพเบลอเป๊ะ ทรงไม่พองเลย) ต้องคั่น toBuffer() ก่อนเสมอ
  // threshold สูง = ทรงเล็ก · ต่ำ = ทรงใหญ่ — ช่องว่างระหว่าง 2 ค่าคือความหนาของเส้นตัด
  const S = width * 0.075;
  const soft = await sharp(hard).blur(S).toBuffer();
  const edge = await sharp(soft).threshold(90).toBuffer();                // ขอบขาวของชิ้นงาน
  const ring = await sharp(soft).threshold(55).toBuffer();                // วงนอก = เส้นตัด
  const fill = (hex, mask) => sharp({ create: { width: cw, height: ch, channels: 3, background: hex } }).joinChannel(mask).png().toBuffer();
  const buf = await canvas().composite([
    { input: await fill(CUT, ring) },
    { input: await fill("#ffffff", edge) },
    { input: padded },
  ]).png({ compressionLevel: 9 }).toBuffer();
  return { uri: `data:image/png;base64,${buf.toString("base64")}`, ratio: cw / ch };
}
const PIECE = await dieCutPiece("heart");

/** วางภาพในกรอบ w×h โดยรักษาสัดส่วน */
const fit = (m, cx, cy, boxW, boxH) => {
  let w = boxW;
  let h = w / m.ratio;
  if (h > boxH) { h = boxH; w = h * m.ratio; }
  return `<image href="${m.uri}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
};

/** งานพิมพ์บนพื้นที่ x,y,w,h — ลายเดียวกับการ์ด "จำนวนด้านที่พิมพ์" ย่อ/ขยายตามช่อง */
function printed(id, x, y, w, h) {
  const k = h / 288;                       // 1 = เต็มแผ่น
  // ⚠️ คุมด้วยความกว้างช่องด้วย — คิดจากความสูงอย่างเดียว คำว่า BIRTHDAY (8 ตัว) ล้นทะลุเส้นตัด
  const byW = (w * 0.86) / (8 * 0.62);
  const big = Math.max(13, Math.min(36 * k * 1.15, byW));
  const small = Math.max(9, Math.min(22 * k * 1.15, byW * 0.6));
  const mh = h * 0.72;
  const mw = mh * HEART.ratio;
  const tx = x + mw + w * 0.06;
  const two = w / h > 1.4;                 // ช่องแนวนอนวางมาสคอตซ้าย-ตัวอักษรขวา · ช่องแนวตั้งวางซ้อนกัน
  return `
  <defs>
    <linearGradient id="p${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#0e7490"/>
    </linearGradient>
    <clipPath id="c${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.max(4, 8 * k)}"/></clipPath>
  </defs>
  <g clip-path="url(#c${id})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#p${id})"/>
    ${two ? `
      ${fit(HEART, x + w * 0.03 + mw / 2, y + h / 2, mw, mh)}
      <text x="${tx}" y="${y + h * 0.46}" font-family="${TH}" font-size="${big}" font-weight="800" fill="#ffffff">HAPPY</text>
      <text x="${tx}" y="${y + h * 0.46 + big * 1.1}" font-family="${TH}" font-size="${big}" font-weight="800" fill="#ffffff">BIRTHDAY</text>
      <text x="${tx + 1}" y="${y + h * 0.46 + big * 2.05}" font-family="${TH}" font-size="${small}" font-weight="600" fill="#ffffff" opacity="0.9">iDUCKY · 09.09</text>`
    : `
      ${fit(HEART, x + w / 2, y + h * 0.38, w * 0.72, h * 0.5)}
      <text x="${x + w / 2}" y="${y + h * 0.78}" font-family="${TH}" font-size="${big}" font-weight="800" text-anchor="middle" fill="#ffffff">HAPPY</text>
      <text x="${x + w / 2}" y="${y + h * 0.78 + big * 1.1}" font-family="${TH}" font-size="${big}" font-weight="800" text-anchor="middle" fill="#ffffff">BIRTHDAY</text>`}
  </g>`;
}

/** ตัวแผ่นกระดาษ + เงา */
const sheet = (fillPaper = true) => `
  <rect x="${SX + 5}" y="${SY + 9}" width="${SHEET_W}" height="${SHEET_H}" rx="8" fill="#0f172a" opacity="0.09"/>
  ${fillPaper ? `<rect x="${SX}" y="${SY}" width="${SHEET_W}" height="${SHEET_H}" rx="8" fill="${PAPER}" stroke="#cbd5e1" stroke-width="2.5"/>` : ""}`;

/** ป้ายเล็ก */
const tag = (cx, y, text, tone = "plain") => {
  const w = text.length * 12.5 + 40;
  const c = tone === "ok" ? OK : tone === "cut" ? CUT : SUB;
  const bg = tone === "ok" ? "#ecfeff" : tone === "cut" ? "#fff1f2" : "#f1f5f9";
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="38" rx="19" fill="${bg}" stroke="${tone === "plain" ? "#cbd5e1" : c}" stroke-width="2"/>
  <text x="${cx}" y="${y + 26}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${c}">${text}</text>`;
};

/** ชิปผลลัพธ์ใต้แผ่น (A4 = 2 ชิ้น ฯลฯ) */
const chip = (x, y, w, head, sub, on = false) => `
  <rect x="${x}" y="${y}" width="${w}" height="72" rx="18" fill="${on ? "#ecfeff" : "#f8fafc"}" stroke="${on ? OK : "#e2e8f0"}" stroke-width="${on ? 3 : 2}"/>
  <text x="${x + w / 2}" y="${y + 32}" font-family="${TH}" font-size="27" font-weight="800" text-anchor="middle" fill="${on ? OK : INK}">${head}</text>
  <text x="${x + w / 2}" y="${y + 58}" font-family="${TH}" font-size="19" font-weight="600" text-anchor="middle" fill="${SUB}">${sub}</text>`;

const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

// ── ใบที่ 1: ไม่ไดคัท ────────────────────────────────────────────────
function noCutArt() {
  const body = `
  ${tag(W / 2, SY - 70, "แผ่นละ 65 × 30 ซม. · ไม่มีเส้นตัด", "ok")}
  ${sheet(false)}
  ${printed("full", SX, SY, SHEET_W, SHEET_H)}
  <rect x="${SX}" y="${SY}" width="${SHEET_W}" height="${SHEET_H}" rx="8" fill="none" stroke="#0f172a" stroke-width="2" opacity="0.12"/>
  ${chip(W / 2 - 170, SY + SHEET_H + 46, 340, "1 แผ่น = 1 ชิ้น", "ได้แผ่นเต็มไปเลย ไม่ต้องตัด", true)}`;
  return card("ไม่ไดคัท (เต็มแผ่น)", "ได้กระดาษแผ่นเต็ม 65 × 30 ซม. ตามที่พิมพ์", body,
    "ราคาต่อหน่วยคือราคาต่อแผ่น ไม่มีค่าไดคัทเพิ่ม",
    "เหมาะกับป้ายเชียร์ / ป้ายอีเวนต์ที่ใช้ทั้งแผ่น");
}

// ── ใบที่ 2: ไดคัทตามขนาด ────────────────────────────────────────────
/** วาด A5 (14.8 × 21 ซม.) 4 ชิ้นตามสเกลจริงบนแผ่น — ตรงกับ badge "ได้ 4 ชิ้น / แผ่น" ใน DB */
function sizeCutArt() {
  const pw = 14.8 * CM;
  const ph = 21 * CM;
  const n = 4;
  const gap = (SHEET_W - pw * n) / (n + 1);
  const py = SY + (SHEET_H - ph) / 2;
  const pieces = Array.from({ length: n }, (_, i) => {
    const px = SX + gap * (i + 1) + pw * i;
    return `
    ${printed(`s${i}`, px, py, pw, ph)}
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="8" fill="none" stroke="${CUT}" stroke-width="3" stroke-dasharray="11 8"/>`;
  }).join("");
  const cw = 176;
  const cg = 14;
  const cx0 = W / 2 - (cw * 4 + cg * 3) / 2;
  const chips = [["A4", "2 ชิ้น / แผ่น"], ["A5", "4 ชิ้น / แผ่น"], ["A6", "9 ชิ้น / แผ่น"], ["A7", "18 ชิ้น / แผ่น"]]
    .map(([h, s], i) => chip(cx0 + (cw + cg) * i, SY + SHEET_H + 46, cw, h, s, h === "A5")).join("");
  const body = `
  ${tag(W / 2, SY - 70, "เส้นตัดเป็นสี่เหลี่ยม ตามขนาดที่เลือก", "cut")}
  ${sheet()}
  ${pieces}
  ${chips}`;
  return card("ไดคัทตามขนาด  +฿15", "ตัดแผ่นเป็นสี่เหลี่ยมขนาดสำเร็จ (ในรูปคือ A5)", body,
    "เลือก A4 / A5 / A6 / A7 หรือกำหนดขนาดเอง (ระบุ ก. × ส.)",
    "ค่าไดคัท ฿15 ต่อแผ่น — ระบบบอกให้ว่า 1 แผ่นได้กี่ชิ้น");
}

// ── ใบที่ 3: ไดคัทตามทรง ─────────────────────────────────────────────
function shapeCutArt() {
  const n = 4;
  const slot = SHEET_W / n;
  const pieces = Array.from({ length: n }, (_, i) =>
    fit(PIECE, SX + slot * i + slot / 2, SY + SHEET_H / 2, slot * 0.94, SHEET_H * 0.9)).join("");
  const body = `
  ${tag(W / 2, SY - 70, "เส้นตัดวิ่งโค้งตามทรงลาย", "cut")}
  ${sheet()}
  ${pieces}
  ${chip(W / 2 - 230, SY + SHEET_H + 46, 460, "ระบุกรอบนอก ก. × ส. ของทรง", "ระบบคำนวณให้ว่า 1 แผ่นตัดได้กี่ชิ้น", true)}`;
  return card("ไดคัทตามทรง  +฿30", "ตัดวิ่งตามรูปทรงของลาย ไม่ใช่สี่เหลี่ยม", body,
    "เศษกระดาษรอบทรงถูกทิ้ง — คิดพื้นที่จากกรอบนอกของทรง",
    "ค่าไดคัท ฿30 ต่อแผ่น · ขั้นต่ำกรอบนอก 3 ซม.");
}

// ── วาดลงแคช ─────────────────────────────────────────────────────────
const DESC = {
  "ไม่ไดคัท (เต็มแผ่น 65 × 30 cm)": "ได้กระดาษแผ่นเต็ม 65 × 30 ซม. — 1 แผ่น = 1 ชิ้น",
  "ไดคัทตามขนาด": "ตัดเป็นสี่เหลี่ยม A4 / A5 / A6 / A7 หรือกำหนดขนาดเอง",
  "ไดคัทตามทรง": "ตัดวิ่งตามทรงลาย — ระบุกรอบนอก ก. × ส. ของทรง",
};
const JOBS = [
  { choice: "ไม่ไดคัท (เต็มแผ่น 65 × 30 cm)", file: `cut-none-${VER}.jpg`, svg: noCutArt() },
  { choice: "ไดคัทตามขนาด", file: `cut-size-${VER}.jpg`, svg: sizeCutArt() },
  { choice: "ไดคัทตามทรง", file: `cut-shape-${VER}.jpg`, svg: shapeCutArt() },
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
if (g.choices?.length !== JOBS.length) { console.error("จำนวนตัวเลือกไม่ตรงที่วาดไว้", g.choices?.length); process.exit(1); }
for (const j of JOBS) {
  const c = g.choices.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
  c.desc = DESC[j.choice];
}
g.display = "cards";   // เมนูเลื่อนโชว์รูปได้แค่ใบที่เลือกอยู่ — 3 ตัวเลือกใส่การ์ดเห็นครบกว่า

data.savedAt = new Date().toISOString();   // ?v=savedAt กันเบราว์เซอร์ค้างรูปเก่า
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
for (const j of JOBS) {
  const c = bg?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
  if (c.desc !== DESC[j.choice]) { console.error("desc ไม่ตรง", j.choice); process.exit(1); }
}
if (bg.display !== "cards") { console.error("display ไม่เปลี่ยน"); process.exit(1); }
// ค่าราคา/ลำดับกลุ่มต้องไม่ขยับไปกับการเขียนรอบนี้
if (bg.choices.find((c) => c.name === "ไดคัทตามขนาด")?.extra !== 15
  || bg.choices.find((c) => c.name === "ไดคัทตามทรง")?.extra !== 30
  || bg.choices.find((c) => c.name.startsWith("ไม่ไดคัท"))?.perUnit !== 1) { console.error("ค่าราคาในกลุ่มหาย"); process.exit(1); }
const order = (a) => a.map((o) => o.label).join("│");
if (order(back.data.options) !== order(row.data.options)) { console.error("ลำดับกลุ่มเพี้ยน"); process.exit(1); }
console.log(`✓ ภาพ ${JOBS.length} ใบ + display cards + desc ครบ · savedAt =`, back.data.savedAt);
