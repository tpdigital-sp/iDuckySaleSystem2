#!/usr/bin/env node
/**
 * กระดาษเย็บบน (package-staple-top) — ภาพประกอบกลุ่ม "ขนาดแบบที่ยังไม่พับ" 5 ใบ (v2)
 *
 *   node scripts/staple-top-size-option-art.mjs            (วาดลง .cache ดูก่อน)
 *   node scripts/staple-top-size-option-art.mjs --write    (+ อัปโหลด + เขียน DB + อ่านกลับเทียบ)
 *
 * ⚠️ ทำไมต้องวาดใหม่ (เจ้าของร้านทักเอง 4 ก.ย. 69): "เย็บบน จะพับครึ่ง และเย็บบนซอง"
 *    ชุดเดิม (size-7x6.jpg ฯลฯ) วาดเป็นซองที่มีแถบม่วงพาดหัว — ดูไม่ออกเลยว่าการ์ด "พับครึ่ง"
 *    แล้วเลขที่เขียนกำกับคือแผ่นก่อนพับ ลูกค้าจึงนึกว่า 10.5×7 คือขนาดหัวการ์ดที่เห็นบนซอง
 *
 * ใบละ 2 ช่อง เล่าลำดับการทำงานจริง:
 *   ① แผ่นก่อนพับ = เลขที่เลือก (ตามชื่อกลุ่ม) + เส้นพับกลางใบ
 *   ② พับครึ่งแล้วครอบปากซองเย็บลวด → หัวการ์ดที่เห็นสูงครึ่งเดียว (ส. ÷ 2)
 *
 * ทั้ง 5 ใบใช้ "สเกลเดียวกัน" (SCALE px/ซม.) — เลื่อนดูทีละใบแล้วเทียบขนาดกันได้จริง
 * ที่มาของเลข: products.package-staple-top กลุ่ม "ขนาดแบบที่ยังไม่พับ" (ชื่อตัวเลือก + piecesPerUnit)
 *
 * ⚠️ ห้ามอัปทับชื่อไฟล์เดิม (CDN/Next แคช) — ชุดนี้จึงเป็น -v2 คนละไฟล์กับของเดิม
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "package-staple-top";
const GROUP = "ขนาดแบบที่ยังไม่พับ";
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const FOLD = "#94a3b8";
const CARD_FRONT = "#6b5aa6";
const CARD_BACK = "#8d7fc0";
const BAG = "#d9d0f2";

const HEART = await mascotDataUri("heart", 320);

/** 5 ขนาดในกลุ่ม — w/h = แผ่น "ก่อนพับ" (ซม.) ตามชื่อกลุ่ม · pieces = ใบต่อแผ่น A3 จาก DB */
const SIZES = [
  { name: "7x6cm (18 ใบ/1A3)", w: 7, h: 6, pieces: 18, file: "size-7x6" },
  { name: "7.5x6cm (15 ใบ/1A3)", w: 7.5, h: 6, pieces: 15, file: "size-7-5x6" },
  { name: "10.5x7cm (10 ใบ/1A3)", w: 10.5, h: 7, pieces: 10, file: "size-10-5x7" },
  { name: "13x8cm (8 ใบ/1A3)", w: 13, h: 8, pieces: 8, file: "size-13x8" },
  { name: "8.5x16cm (5 ใบ/1A3)", w: 8.5, h: 16, pieces: 5, file: "size-8-5x16" },
];

/* สเกลร่วม: ตัวที่กินที่สุดคือซองของ 8.5×16 (สูง 20 ซม.) — ล็อกให้พอดีช่องภาพ แล้วใบอื่นเล็กตามจริง */
const SCALE = 21;                    // px ต่อ 1 ซม.
const MIDY = 452;                    // แกนกลางแนวตั้งของช่องภาพ
const BOX = 420;                     // ความสูงสูงสุดที่ช่องภาพรับได้ (กันซองของ 8.5×16 ล้นไปทับข้อความล่าง)
const LX = 292;                      // กึ่งกลางช่องซ้าย (แผ่นก่อนพับ)
const RX = 636;                      // กึ่งกลางช่องขวา (ซองที่เย็บแล้ว)
/** ซองสมมุติของแต่ละขนาด — กว้างเท่าการ์ด สูงพอให้เห็นว่าหัวการ์ดกินพื้นที่ซองแค่ไหน */
const bagH = (s) => Math.max((s.h / 2) * 2.5, s.h * 1.2);

const px = (cm) => cm * SCALE;
const fmt = (n) => String(Math.round(n * 10) / 10).replace(/\.0$/, "");

/** รูเย็บลวด 2 รู */
const staples = (cx, y) => [-1, 1].map((d) => `
  <rect x="${cx + d * px(1.3) - 11}" y="${y - 3}" width="22" height="6" rx="3" fill="#334155" opacity="0.5"/>`).join("");

/** ลายบนด้านหน้าการ์ด (มาสคอต + iducky) — ย่อตามความสูงหน้าการ์ด */
const frontArt = (cx, top, hh) => {
  const mh = hh * 0.52;
  const mw = mh * HEART.ratio;
  const fs = Math.max(9, Math.round(hh * 0.16));
  return `
  <image href="${HEART.uri}" x="${cx - mw / 2}" y="${top + hh * 0.14}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${cx}" y="${top + hh * 0.88}" font-family="${TH}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="#ffffff" opacity="0.95">iducky</text>`;
};

/** ลูกศรบอกด้าน + ตัวเลข */
const dimH = (x0, x1, y, text) => `
  <line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${SUB}" stroke-width="2"/>
  <line x1="${x0}" y1="${y - 6}" x2="${x0}" y2="${y + 6}" stroke="${SUB}" stroke-width="2"/>
  <line x1="${x1}" y1="${y - 6}" x2="${x1}" y2="${y + 6}" stroke="${SUB}" stroke-width="2"/>
  <rect x="${(x0 + x1) / 2 - text.length * 6 - 8}" y="${y - 13}" width="${text.length * 12 + 16}" height="26" rx="8" fill="#ffffff"/>
  <text x="${(x0 + x1) / 2}" y="${y + 7}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="middle" fill="${SUB}">${text}</text>`;
const dimV = (x, y0, y1, text) => `
  <line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${SUB}" stroke-width="2"/>
  <line x1="${x - 6}" y1="${y0}" x2="${x + 6}" y2="${y0}" stroke="${SUB}" stroke-width="2"/>
  <line x1="${x - 6}" y1="${y1}" x2="${x + 6}" y2="${y1}" stroke="${SUB}" stroke-width="2"/>
  <text x="${x - 10}" y="${(y0 + y1) / 2 + 7}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="end" fill="${SUB}">${text}</text>`;

/**
 * ① แผ่นก่อนพับ — ครึ่งล่าง = ด้านหน้า (ลายหงายปกติ) · ครึ่งบน = ด้านหลัง
 * ลายครึ่งบนวาด "กลับหัว" เพราะพับเอาด้านพิมพ์ออกนอกแล้วครึ่งบนไปอยู่หลังซอง กลับหัว 180°
 * รูเย็บลวดอยู่ริมนอกของแต่ละครึ่ง (ขอบบนสุด/ล่างสุดของแผ่น) — พับแล้วขอบคู่นี้มาชนกันตรงที่เย็บ
 */
function flatPanel(s) {
  const w = px(s.w);
  const h = px(s.h);
  const x0 = LX - w / 2;
  const y0 = MIDY - h / 2;
  const fold = MIDY;
  const halfH = h / 2;
  return `
  <clipPath id="flatFront"><rect x="${x0}" y="${fold}" width="${w}" height="${halfH}"/></clipPath>
  <clipPath id="flatBack"><rect x="${x0}" y="${y0}" width="${w}" height="${halfH}"/></clipPath>
  <rect x="${x0 + 4}" y="${y0 + 6}" width="${w}" height="${h}" rx="7" fill="#0f172a" opacity="0.08"/>
  <rect x="${x0}" y="${y0}" width="${w}" height="${halfH}" rx="7" fill="${CARD_BACK}"/>
  <rect x="${x0}" y="${fold}" width="${w}" height="${halfH}" rx="7" fill="${CARD_FRONT}"/>
  <rect x="${x0}" y="${fold - 8}" width="${w}" height="10" fill="${CARD_BACK}"/>
  <rect x="${x0}" y="${fold}" width="${w}" height="10" fill="${CARD_FRONT}"/>
  <g clip-path="url(#flatBack)" transform="rotate(180 ${LX} ${y0 + halfH / 2})">${frontArt(LX, y0, halfH)}</g>
  <g clip-path="url(#flatFront)">${frontArt(LX, fold, halfH)}</g>
  ${staples(LX, y0 + halfH * 0.22)}
  ${staples(LX, y0 + h - halfH * 0.22)}
  <line x1="${x0}" y1="${fold}" x2="${x0 + w}" y2="${fold}" stroke="#ffffff" stroke-width="4" opacity="0.55"/>
  <line x1="${x0}" y1="${fold}" x2="${x0 + w}" y2="${fold}" stroke="${FOLD}" stroke-width="2.5" stroke-dasharray="6 6"/>
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="7" fill="none" stroke="#5b4d90" stroke-width="2"/>
  <text x="${x0 + w + 12}" y="${y0 + halfH / 2 + 6}" font-family="${TH}" font-size="18" font-weight="700" fill="${SUB}">หลัง</text>
  <text x="${x0 + w + 12}" y="${fold + halfH / 2 + 6}" font-family="${TH}" font-size="18" font-weight="700" fill="${SUB}">หน้า</text>
  ${dimH(x0, x0 + w, y0 - 26, `${fmt(s.w)} ซม.`)}
  ${dimV(x0 - 22, y0, y0 + h, `${fmt(s.h)}`)}
  <text x="${LX}" y="${y0 + h + 34}" font-family="${TH}" font-size="19" font-weight="600" text-anchor="middle" fill="${FOLD}">เส้นพับกลางใบ</text>`;
}

/** ② พับครึ่งครอบปากซองแล้วเย็บลวด: หัวการ์ดที่เห็น = สูงครึ่งเดียวของแผ่น */
function packPanel(s) {
  const w = px(s.w);
  const headH = px(s.h / 2);
  const lip = headH * 0.55;                              // หัวการ์ดโผล่เหนือขอบซอง เหมือนของจริง
  const bh = Math.min(px(bagH(s)), BOX - lip);           // ซองสูงเท่าไหร่ก็ห้ามล้นกรอบภาพ
  const x0 = RX - w / 2;
  const cardTop = MIDY - (bh + lip) / 2;                 // จัดทั้งชุด (การ์ด+ซอง) กึ่งกลางช่อง
  const bagTop = cardTop + lip;
  const mh = Math.min(bh * 0.4, w * 0.62);
  const mw = mh * HEART.ratio;
  return `
  <linearGradient id="bagG" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#efe9ff"/><stop offset="1" stop-color="${BAG}"/>
  </linearGradient>
  <clipPath id="headClip"><rect x="${x0}" y="${cardTop}" width="${w}" height="${headH}" rx="6"/></clipPath>
  <rect x="${x0 + 4}" y="${bagTop + 6}" width="${w}" height="${bh}" rx="8" fill="#0f172a" opacity="0.08"/>
  <rect x="${x0}" y="${bagTop}" width="${w}" height="${bh}" rx="8" fill="url(#bagG)" stroke="#c4b5fd" stroke-width="2"/>
  <image href="${HEART.uri}" x="${RX - mw / 2}" y="${bagTop + bh - mh - px(0.6)}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  <path d="M ${x0 + px(0.7)} ${bagTop + bh - 4} L ${x0 + w * 0.34} ${bagTop + 4} L ${x0 + w * 0.46} ${bagTop + 4} L ${x0 + px(0.7) + w * 0.12} ${bagTop + bh - 4} Z" fill="#ffffff" opacity="0.35"/>
  <rect x="${x0}" y="${cardTop}" width="${w}" height="${headH}" rx="6" fill="${CARD_FRONT}"/>
  <g clip-path="url(#headClip)">${frontArt(RX, cardTop, headH)}</g>
  ${staples(RX, cardTop + headH * 0.8)}
  <line x1="${x0}" y1="${cardTop}" x2="${x0 + w}" y2="${cardTop}" stroke="${FOLD}" stroke-width="2.5" stroke-dasharray="6 6"/>
  <text x="${x0 + w + 10}" y="${cardTop + 6}" font-family="${TH}" font-size="17" font-weight="700" fill="${FOLD}">รอยพับ</text>
  ${dimV(x0 - 16, cardTop, cardTop + headH, `${fmt(s.h / 2)}`)}
  <text x="${RX}" y="${bagTop + bh + 34}" font-family="${TH}" font-size="19" font-weight="600" text-anchor="middle" fill="${SUB}">หัวการ์ดที่เห็นบนซอง</text>`;
}

const panelHead = (cx, y, n, text) => `
  <circle cx="${cx - text.length * 6.2 - 16}" cy="${y - 8}" r="15" fill="${OK}"/>
  <text x="${cx - text.length * 6.2 - 16}" y="${y - 1}" font-family="${TH}" font-size="19" font-weight="800" text-anchor="middle" fill="#ffffff">${n}</text>
  <text x="${cx + 14}" y="${y}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${INK}">${text}</text>`;

const art = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="46" font-weight="800" text-anchor="middle" fill="${INK}">${fmt(s.w)} × ${fmt(s.h)} ซม.</text>
  <text x="${W / 2}" y="130" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">แผ่นก่อนพับ · ได้ ${s.pieces} ใบ / แผ่น A3</text>
  ${panelHead(LX, 196, "1", "แผ่นก่อนพับ")}
  ${panelHead(RX, 196, "2", "พับครึ่ง เย็บบนซอง")}
  ${flatPanel(s)}
  ${packPanel(s)}
  <text x="${W / 2}" y="${H - 74}" font-family="${TH}" font-size="23" font-weight="600" text-anchor="middle" fill="${INK}">พับครึ่งแล้วหัวการ์ดสูง ${fmt(s.h / 2)} ซม. (กว้าง ${fmt(s.w)} ซม. เท่าเดิม)</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ภาพทุกขนาดวาดด้วยสเกลเดียวกัน — เลื่อนเทียบขนาดกันได้เลย</text>
</svg>`;

// ── วาดลงแคช ─────────────────────────────────────────────────────────
const JOBS = SIZES.map((s) => ({ ...s, out: `${s.file}-${VER}.jpg`, svg: art(s) }));
for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.out}`, j.buf);
  console.log(`🖼  ${OUT}/${j.out}  ${Math.round(j.buf.length / 1024)} KB — ${j.name}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด + เขียน DB ───────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.out}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const g = (data.options ?? []).find((o) => o.label === GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = g.choices.find((c) => c.name === j.name);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.name}"`); process.exit(1); }
  c.imageSrc = j.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ ──────────────────────────────────────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
for (const j of JOBS) {
  const c = bg?.choices?.find((c) => c.name === j.name);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.name, c?.imageSrc); process.exit(1); }
  if (c.piecesPerUnit !== j.pieces) { console.error("piecesPerUnit เพี้ยน", j.name, c.piecesPerUnit); process.exit(1); }
}
// กลุ่มนี้เป็นแกนตารางราคา — ชื่อตัวเลือก/คีย์ cells ห้ามขยับแม้แต่ตัวเดียว
const cellKeys = (d) => Object.keys(d.pricing?.cells ?? {}).sort().join("│");
if (cellKeys(back.data) !== cellKeys(row.data)) { console.error("คีย์ตารางราคาขยับ!"); process.exit(1); }
const names = (d) => d.options.find((o) => o.label === GROUP).choices.map((c) => c.name).join("│");
if (names(back.data) !== names(row.data)) { console.error("ชื่อ/ลำดับตัวเลือกเพี้ยน"); process.exit(1); }
console.log(`✓ ภาพ ${JOBS.length} ใบ · savedAt =`, back.data.savedAt);
