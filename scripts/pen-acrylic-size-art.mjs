#!/usr/bin/env node
/**
 * ปากกาติดอะคริลิค (otheracrylicproducts2-6) — ภาพประกอบกลุ่มตัวเลือก "ขนาด" 6 ใบ
 *
 *   node scripts/pen-acrylic-size-art.mjs            (วาดภาพลง .cache/pen-acrylic/upload ดูก่อน)
 *   node scripts/pen-acrylic-size-art.mjs --write    (+ อัปโหลด storage + เขียน imageSrc + อ่านกลับเทียบ)
 *
 * ตาม terms ของสินค้า: อะคริลิคไดคัทใส หนา 2 มม. ขนาด 3.5-4 ซม. (วัดด้านยาวสุด)
 * สกรีน UV ด้านบนอะคริลิค · ปากกาเจล KIOKU คละสี (ขาว ดำ เทา) เลือกสีไม่ได้
 *
 * การ์ดขนาด: ปากกา+อะคริลิคสเกลเดียวกันทุกใบ (เทียบกันได้จริง) + ลูกศรวัด +
 * เลขตัวใหญ่กลางภาพ (ภาพย่อบนปุ่ม/ข้าง dropdown เล็กมาก ต้องอ่านเลขออก) +
 * เกจ 3.5→4.0 ชี้ตำแหน่งขนาดที่เลือก
 *
 * รันซ้ำได้: แตะแค่ choice.imageSrc ของกลุ่ม "ขนาด" (ชื่อ/desc/extra เดิมอยู่ครบ)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);

const PRODUCT_ID = "otheracrylicproducts2-6";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/pen-acrylic/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
/** ชื่อตัวเลือกใน DB เป๊ะ ๆ → ขนาดเป็นซม. */
const SIZES = [
  { choice: "3.5 cm", cm: 3.5, file: "3-5" },
  { choice: "3.6 cm", cm: 3.6, file: "3-6" },
  { choice: "3.7 cm", cm: 3.7, file: "3-7" },
  { choice: "3.8 cm", cm: 3.8, file: "3-8" },
  { choice: "3.9 cm", cm: 3.9, file: "3-9" },
  { choice: "4 cm", cm: 4, file: "4-0" },
];

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ lighter-size-option-art) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 + 16 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 30;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "start" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** กรอบการ์ดพื้นหลัง + หัวเรื่อง/หมายเหตุ ใช้ร่วมทุกภาพ */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="126" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 66}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 36}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/**
 * ปากกาเจล KIOKU มองด้านหน้า (ตามรูปจริงในแกลเลอรี): ปุ่มกดบน + ช่วงคลิปกึ่งใส
 * เห็นไส้หมึก + ตัวเรือนขาว + ปลายกรวย รวมยาว ~14 ซม.
 */
function pen(cx, topY, CM, id = "p") {
  const bw = 1.05 * CM; // กว้างตัวเรือน ~1 ซม.
  const plungerH = 0.9 * CM;
  const clipY = topY + plungerH;
  const clipH = 1.7 * CM;
  const bodyY = clipY + clipH;
  const tipY = topY + 12.6 * CM; // จุดเริ่มสอบปลาย
  const endY = topY + 14 * CM;
  const bx = cx - bw / 2;
  return `
  <defs>
    <linearGradient id="psheen-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.6"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.85" stop-color="#94a3b8" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#64748b" stop-opacity="0.3"/>
    </linearGradient>
  </defs>
  <!-- ปุ่มกด -->
  <rect x="${cx - 0.3 * CM}" y="${topY}" width="${0.6 * CM}" height="${plungerH + 6}" rx="${0.16 * CM}" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2.5"/>
  <!-- ช่วงคลิปกึ่งใส เห็นไส้หมึก -->
  <rect x="${bx + 2}" y="${clipY}" width="${bw - 4}" height="${clipH + 6}" rx="${0.14 * CM}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2.5"/>
  <rect x="${cx - 0.11 * CM}" y="${clipY + 0.2 * CM}" width="${0.22 * CM}" height="${clipH - 0.2 * CM}" rx="${0.1 * CM}" fill="#f87171" opacity="0.75"/>
  <rect x="${cx + 0.18 * CM}" y="${clipY - 0.08 * CM}" width="${0.24 * CM}" height="${clipH * 0.92}" rx="${0.1 * CM}" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
  <!-- ตัวเรือนขาว -->
  <rect x="${bx}" y="${bodyY}" width="${bw}" height="${tipY - bodyY}" rx="${0.18 * CM}" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
  <rect x="${bx}" y="${bodyY}" width="${bw}" height="${tipY - bodyY}" rx="${0.18 * CM}" fill="url(#psheen-${id})"/>
  <!-- ปลายกรวย + หัวปากกา -->
  <path d="M ${bx} ${tipY} L ${cx - 0.09 * CM} ${endY - 0.34 * CM} L ${cx + 0.09 * CM} ${endY - 0.34 * CM} L ${bx + bw} ${tipY} Z" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2.5"/>
  <path d="M ${cx - 0.09 * CM} ${endY - 0.34 * CM} L ${cx} ${endY} L ${cx + 0.09 * CM} ${endY - 0.34 * CM} Z" fill="#94a3b8"/>`;
}

/**
 * อะคริลิคไดคัทติดบนปากกา — แผ่นใสตามทรงมาสคอต (ขอบขาวสไตล์ไดคัท) + แป้นใสยึดกับตัวเรือน
 * sizeCm = ด้านยาวสุด (แนวตั้ง)
 */
function charm(cx, cy, CM, sizeCm, id = "c") {
  const h = sizeCm * CM;
  let aw = h * HEART.ratio;
  let ah = h;
  const pad = 0.16 * CM; // ขอบไดคัทเผื่อรอบลาย
  const rw = aw + pad * 2;
  const rh = ah + pad * 2;
  return `
  <defs>
    <linearGradient id="acr-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="#eef6fb" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#dbeaf3" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <!-- แป้นใสยึดกับปากกา -->
  <rect x="${cx - 0.55 * CM}" y="${cy + rh / 2 - 0.5 * CM}" width="${1.1 * CM}" height="${0.62 * CM}" rx="${0.12 * CM}"
    fill="#e0f2fe" opacity="0.65" stroke="#bae6fd" stroke-width="2"/>
  <!-- แผ่นอะคริลิคไดคัท (ขอบมนตามลาย) -->
  <rect x="${cx - rw / 2}" y="${cy - rh / 2}" width="${rw}" height="${rh}" rx="${rw * 0.3}"
    fill="url(#acr-${id})" stroke="#bcd3e0" stroke-width="3"/>
  <image href="${HEART.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  <!-- แสงสะท้อนผิวอะคริลิค -->
  <path d="M ${cx - rw / 2 + rw * 0.14} ${cy - rh / 2 + rh * 0.1} q ${rw * 0.1} ${rh * 0.28} -${rw * 0.02} ${rh * 0.5}"
    fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`;
}

/** เกจ 3.5 → 4.0 ชี้ขนาดที่เลือก */
function gauge(cx, y, width, active) {
  const min = 3.5;
  const max = 4;
  const x0 = cx - width / 2;
  const ticks = SIZES.map((s) => {
    const x = x0 + ((s.cm - min) / (max - min)) * width;
    const on = s.cm === active;
    return `
    <line x1="${x}" y1="${y - (on ? 12 : 8)}" x2="${x}" y2="${y + (on ? 12 : 8)}"
      stroke="${on ? OK : "#cbd5e1"}" stroke-width="${on ? 5 : 3}"/>
    ${on ? `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="${OK}" stroke-width="3.5"/>` : ""}`;
  }).join("");
  return `
  <line x1="${x0}" y1="${y}" x2="${x0 + width}" y2="${y}" stroke="#cbd5e1" stroke-width="3"/>
  ${ticks}
  <text x="${x0 - 28}" y="${y + 8}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="end" fill="${SUB}">3.5</text>
  <text x="${x0 + width + 28}" y="${y + 8}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="start" fill="${SUB}">4.0</text>`;
}

// ── การ์ดขนาด — สเกลเดียวกันทุกใบ (CM คงที่) เทียบกันได้จริง ─────────
function sizeArt(s) {
  const CM = 48;
  const px = 300; // แกนปากกา
  const topY = 158;
  const charmCy = topY + 4.4 * CM;
  const rh = s.cm * CM + 0.32 * CM;
  const label = s.cm.toFixed(1).replace(/\.0$/, s.cm === 4 ? ".0" : "");
  const body = `
  ${pen(px, topY, CM, "p")}
  ${charm(px, charmCy, CM, s.cm, "c")}
  ${dim(px + 130, charmCy - rh / 2, px + 130, charmCy + rh / 2, `${label} ซม.`)}
  <text x="640" y="430" font-family="${TH}" font-size="150" font-weight="800" text-anchor="middle" fill="${OK}">${label}</text>
  <text x="640" y="482" font-family="${TH}" font-size="36" font-weight="700" text-anchor="middle" fill="${SUB}">เซนติเมตร</text>
  ${gauge(640, 560, 220, s.cm)}`;
  return card(`ขนาดอะคริลิค ${label} ซม.`, "วัดจากด้านยาวสุดของอะคริลิคไดคัท — ปากกาสเกลเดียวกันทุกภาพ", body,
    "อะคริลิคใสหนา 2 มม. สกรีนลายด้วยระบบ UV ด้านบนอะคริลิค",
    "ปากกาเจลหมึกน้ำเงิน KIOKU คละสีตัวด้าม (ขาว ดำ เทา) เลือกสีไม่ได้");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = SIZES.map((s) => ({
  file: `size-${s.file}-${VER}.jpg`, svg: sizeArt(s), group: SIZE_GROUP, choice: s.choice,
}));

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
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

const g = (data.options ?? []).find((o) => o.label === SIZE_GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.group}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === SIZE_GROUP);
for (const j of JOBS) {
  const got = bg?.choices?.find((c) => c.name === j.choice)?.imageSrc;
  if (got !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, got); process.exit(1); }
}
if (bg.choices.length !== 6) { console.error("จำนวนตัวเลือกเพี้ยน!", bg.choices.length); process.exit(1); }
console.log(`✓ ภาพตัวเลือก "${SIZE_GROUP}" ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
