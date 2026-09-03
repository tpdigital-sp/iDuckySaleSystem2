#!/usr/bin/env node
/**
 * กระจกพับ (mirror-4) — กลุ่ม "สกรีนกี่ด้าน": เปลี่ยนชื่อตัวเลือก + ภาพตัวอย่าง
 *
 *   node scripts/folding-mirror-screen-option.mjs            (วาดภาพลง .cache/mirror-4/upload ดูก่อน)
 *   node scripts/folding-mirror-screen-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ทำ 2 อย่าง (ผู้ใช้สั่ง 3 ก.ย. 69):
 *   1. เปลี่ยนชื่อตัวเลือก "1 ด้าน" → "สกรีน 1 ด้าน" · "2 ด้าน" → "สกรีน 2 ด้าน"
 *      (desc/extra เดิมอยู่ครบ — กลุ่มนี้ไม่ใช่แกนราคา ไม่มี rules อ้างชื่อ เปลี่ยนได้ตรง ๆ)
 *   2. วาดภาพตัวอย่าง 900×900 ต่อตัวเลือก — ตลับกระจกพับกลมฝาขาว 2 ใบเทียบกัน
 *      ฝาหน้า-ฝาหลัง (1 ด้าน = หลังไม่พิมพ์ · 2 ด้าน = หลังมีลายอีกลาย)
 *
 * รันซ้ำได้: รับทั้งชื่อเก่า/ใหม่ตอนหาตัวเลือก · เขียนทับ imageSrc ตัวเดิม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);
const PEACE = await mascotDataUri("peace", 420);

const PRODUCT_ID = "mirror-4";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mirror-4/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SCREEN_GROUP = "สกรีนกี่ด้าน";
/** ชื่อเก่า → ชื่อใหม่ (รันซ้ำ = เจอชื่อใหม่อยู่แล้วก็ผ่าน) */
const RENAME = { "1 ด้าน": "สกรีน 1 ด้าน", "2 ด้าน": "สกรีน 2 ด้าน" };

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** กรอบการ์ดพื้นหลัง + หัวเรื่อง/หมายเหตุ (ชุดเดียวกับ lighter-size-option-art) */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ป้ายชื่อใต้ตลับ (ฝาหน้า/ฝาหลัง) */
const tag = (cx, y, text, on = true) => {
  const w = text.length * 14 + 44;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

/**
 * ตลับกระจกพับกลม มองด้านหน้า — ฝาหนังขาว บานพับเงินโผล่บนสุด (ทรงตามรูปงานจริงในแกลเลอรี)
 * mascot = ลายสกรีนแทนลายลูกค้า (null = ฝาสีพื้น ไม่พิมพ์)
 */
function compact(cx, cy, R, mascot = null, id = "g") {
  // ลายพิมพ์ clip อยู่ในวงฝา
  let art = "";
  if (mascot) {
    let aw = R * 1.15;
    let ah = aw / mascot.ratio;
    const maxH = R * 1.2;
    if (ah > maxH) { ah = maxH; aw = ah * mascot.ratio; }
    art = `<image href="${mascot.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
      preserveAspectRatio="xMidYMid meet" clip-path="url(#lid-${id})"/>`;
  }
  return `
  <defs>
    <clipPath id="lid-${id}"><circle cx="${cx}" cy="${cy}" r="${R - 8}"/></clipPath>
    <radialGradient id="sheen-${id}" cx="0.32" cy="0.26" r="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#fdfcfa"/>
      <stop offset="1" stop-color="#eceef2"/>
    </radialGradient>
  </defs>
  <!-- บานพับเงิน โผล่เหนือขอบฝา -->
  <rect x="${cx - R * 0.24}" y="${cy - R - 14}" width="${R * 0.48}" height="26" rx="9"
    fill="#9ca3af" stroke="#6b7280" stroke-width="2.5"/>
  <line x1="${cx}" y1="${cy - R - 12}" x2="${cx}" y2="${cy - R + 2}" stroke="#6b7280" stroke-width="2"/>
  <!-- ฝาตลับ -->
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sheen-${id})" stroke="#d6dae1" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 7}" fill="none" stroke="#e8eaee" stroke-width="2"/>
  ${art}`;
}

// ── ภาพสกรีน 1 ด้าน / 2 ด้าน ─────────────────────────────────────────
function screenArt(sides) {
  const R = 150;
  const cy = 400;
  const lx = W / 2 - 190;
  const rx = W / 2 + 190;
  const one = sides === 1;
  const body = `
  ${compact(lx, cy, R, HEART, "sa")}
  ${compact(rx, cy, R, one ? null : PEACE, "sb")}
  ${one ? `<text x="${rx}" y="${cy + 10}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#c2c9d2">ไม่พิมพ์ลาย</text>` : ""}
  ${tag(lx, cy + R + 40, "ฝาหน้า — มีลาย")}
  ${tag(rx, cy + R + 40, one ? "ฝาหลัง — ไม่พิมพ์" : "ฝาหลัง — มีลาย", !one)}`;
  return one
    ? card("สกรีน 1 ด้าน", "พิมพ์ลายฝาหน้าด้านเดียว", body,
      "ฝาหลังเป็นสีพื้น ไม่มีลาย · เปิดฝาด้านในเป็นกระจก")
    : card("สกรีน 2 ด้าน", "พิมพ์ลายทั้งฝาหน้าและฝาหลัง", body,
      "หน้า-หลังคนละลายได้ · เปิดฝาด้านในเป็นกระจก");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = [
  { file: `screen-1side-${VER}.jpg`, svg: screenArt(1), choice: "สกรีน 1 ด้าน" },
  { file: `screen-2side-${VER}.jpg`, svg: screenArt(2), choice: "สกรีน 2 ด้าน" },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${SCREEN_GROUP}: ${j.choice}`);
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

const g = (data.options ?? []).find((o) => o.label === SCREEN_GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP}"`); process.exit(1); }

// 1. เปลี่ยนชื่อตัวเลือก (idempotent — เจอชื่อใหม่อยู่แล้วก็ข้าม)
for (const c of g.choices ?? []) if (RENAME[c.name]) c.name = RENAME[c.name];

// 2. เติม imageSrc (desc/extra เดิมอยู่ครบ)
for (const j of JOBS) {
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${SCREEN_GROUP}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === SCREEN_GROUP);
for (const j of JOBS) {
  const c = bg?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
}
const stale = bg.choices.find((c) => RENAME[c.name]);
if (stale) { console.error("ยังมีชื่อเก่าค้าง!", stale); process.exit(1); }
const two = bg.choices.find((c) => c.name === "สกรีน 2 ด้าน");
if (two?.extra !== 10) { console.error("extra สกรีน 2 ด้าน หาย!", two); process.exit(1); }
console.log(`✓ เปลี่ยนชื่อ + ภาพตัวเลือก ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
