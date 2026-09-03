#!/usr/bin/env node
/**
 * กล่องดินสอ | ปากกาอะคริลิค (otheracrylicproducts2-2) — กลุ่ม "ขนาด" การ์ด + ภาพสกรีน 1-4 ด้าน
 *
 *   node scripts/pencil-box-size-screen.mjs            (วาดภาพลง .cache/pencil-box/upload ดูก่อน)
 *   node scripts/pencil-box-size-screen.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ทำ 3 อย่าง (ผู้ใช้สั่ง 3 ก.ย. 69):
 *   1. เพิ่มกลุ่ม "ขนาด" แบบการ์ด — ขนาดเดียว 6.5 × 10 ซม. + ภาพวาดกล่องพร้อมลูกศรวัด
 *   2. วาดภาพตัวอย่างประจำตัวเลือกสกรีนทั้ง 4 ตัว — "ด้าน" ของตัวนี้คือด้านรอบกล่อง (มี 4 ด้าน)
 *      ไม่ใช่เลเยอร์สกรีนแบบชุดกลาง acrylic-howto ที่แปะค้างอยู่ (ความหมายผิด — เขียนทับทิ้ง)
 *   3. เปลี่ยนชื่อตัวเลือก "1 ด้าน" → "สกรีน 1 ด้าน" … "4 ด้าน" → "สกรีน 4 ด้าน"
 *      (extra เดิม 2 ด้าน +20 · 3 ด้าน +40 · 4 ด้าน +60 ต้องอยู่ครบ — กลุ่มนี้ไม่มี rules อ้างชื่อ)
 *
 * รันซ้ำได้: รับทั้งชื่อเก่า/ใหม่ตอนหาตัวเลือก · กลุ่ม "ขนาด" เจอแล้ว = เขียนทับ ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);
const PEACE = await mascotDataUri("peace", 420);

const PRODUCT_ID = "otheracrylicproducts2-2";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/pencil-box/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "6.5 × 10 ซม.";
const SCREEN_GROUP = "สกรีน";
/** ชื่อเก่า → ชื่อใหม่ (รันซ้ำ = เจอชื่อใหม่อยู่แล้วก็ผ่าน) */
const RENAME = {
  "1 ด้าน": "สกรีน 1 ด้าน",
  "2 ด้าน": "สกรีน 2 ด้าน",
  "3 ด้าน": "สกรีน 3 ด้าน",
  "4 ด้าน": "สกรีน 4 ด้าน",
};

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** กรอบการ์ดพื้นหลัง + หัวเรื่อง/หมายเหตุ (ชุดเดียวกับ folding-mirror-screen-option) */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ power-strip-size-option) */
const dim = (x1, y1, x2, y2, label) => {
  const vert = x1 === x2;
  const lx = vert ? x1 + 22 : (x1 + x2) / 2;
  const ly = vert ? (y1 + y2) / 2 + 8 : y2 + 34;
  const tick = (x, y) => (vert
    ? `<line x1="${x - 8}" y1="${y}" x2="${x + 8}" y2="${y}" stroke="${SUB}" stroke-width="3"/>`
    : `<line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y + 8}" stroke="${SUB}" stroke-width="3"/>`);
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vert ? 0 : (label.length * 12.5) / 2)}" y="${ly - 24}" width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx + (vert ? (label.length * 12.5) / 2 : 0)}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/**
 * กล่องดินสออะคริลิคทรงสี่เหลี่ยม เปิดปากบน มุมเฉียง (oblique) เห็นหน้า+ข้างขวา+ปากกล่อง
 * front/side: true = ด้านนั้นพิมพ์ลาย (หน้า = heart · ข้าง = peace) · false = อะคริลิคใสเปล่า
 */
function penBox(x, y, w, h, { front = true, side = false, pens = true, id = "b" } = {}) {
  const dx = 64; // ระยะเฉียงไปขวา
  const dy = -42; // ระยะเฉียงขึ้นบน
  const skew = (Math.atan2(-dy, dx) * 180) / Math.PI; // มุม skew หน้าข้าง

  // ลายหน้ากล่อง clip ในกรอบหน้า
  let art = "";
  if (front) {
    let aw = w * 0.78;
    let ah = aw / HEART.ratio;
    const maxH = h * 0.72;
    if (ah > maxH) { ah = maxH; aw = ah * HEART.ratio; }
    art = `<image href="${HEART.uri}" x="${x + w / 2 - aw / 2}" y="${y + h / 2 - ah / 2 + 8}" width="${aw}" height="${ah}"
      preserveAspectRatio="xMidYMid meet" clip-path="url(#face-${id})"/>`;
  }

  // ลายข้างกล่อง — วาดในพิกัดตรงแล้ว skew ทั้งกลุ่มตามหน้าข้าง
  let sideArt = "";
  if (side) {
    let aw = dx * 0.84;
    let ah = aw / PEACE.ratio;
    sideArt = `<g transform="translate(${x + w} ${y}) skewY(-${skew})">
      <rect width="${dx}" height="${h}" fill="#cffafe" opacity="0.55"/>
      <image href="${PEACE.uri}" x="${(dx - aw) / 2}" y="${h / 2 - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    </g>`;
  }

  // ดินสอ/ปากกาโผล่จากปากกล่อง
  const pen = (px, py, len, ang, color, tip) => `<g transform="rotate(${ang} ${px} ${py})">
    <rect x="${px - 8}" y="${py - len}" width="16" height="${len}" rx="7" fill="${color}"/>
    ${tip ? `<path d="M ${px - 8} ${py - len + 4} L ${px} ${py - len - 18} L ${px + 8} ${py - len + 4} Z" fill="#fbbf24"/>
    <circle cx="${px}" cy="${py - len - 14}" r="3.5" fill="#374151"/>` : ""}
  </g>`;

  return `
  <defs>
    <clipPath id="face-${id}"><rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" rx="10"/></clipPath>
    <linearGradient id="acr-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#eef4f8"/>
    </linearGradient>
  </defs>
  <!-- ดินสอ/ปากกาในกล่อง (อยู่หลังปากกล่อง) -->
  ${pens ? `
    ${pen(x + w * 0.28 + dx * 0.5, y + dy + 26, 128, -10, "#f59e0b", true)}
    ${pen(x + w * 0.55 + dx * 0.5, y + dy + 24, 112, 4, "#38bdf8", false)}
    ${pen(x + w * 0.78 + dx * 0.5, y + dy + 26, 122, 12, "#f472b6", false)}` : ""}
  <!-- ปากกล่อง (ก้นเปิดด้านบน) -->
  <path d="M ${x} ${y} L ${x + dx} ${y + dy} L ${x + w + dx} ${y + dy} L ${x + w} ${y} Z"
    fill="#dbeafe" stroke="#94a3b8" stroke-width="2.5"/>
  <path d="M ${x + 10} ${y - 3} L ${x + dx} ${y + dy + 7} L ${x + w + dx - 10} ${y + dy + 7} L ${x + w - 10} ${y - 3} Z"
    fill="#bfdbfe" opacity="0.7"/>
  <!-- ด้านข้างขวา -->
  <path d="M ${x + w} ${y} L ${x + w + dx} ${y + dy} L ${x + w + dx} ${y + dy + h} L ${x + w} ${y + h} Z"
    fill="#e8eef4" stroke="#94a3b8" stroke-width="2.5"/>
  ${sideArt}
  <path d="M ${x + w} ${y} L ${x + w + dx} ${y + dy} L ${x + w + dx} ${y + dy + h} L ${x + w} ${y + h} Z"
    fill="none" stroke="#94a3b8" stroke-width="2.5"/>
  <!-- หน้ากล่อง -->
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#acr-${id})" stroke="#0f172a" stroke-width="3"/>
  ${art}
  ${front ? "" : `<text x="${x + w / 2}" y="${y + h / 2 + 9}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="#c2c9d2">ไม่พิมพ์</text>`}`;
}

// ── ภาพการ์ดขนาด 6.5 × 10 ซม. ───────────────────────────────────────
function sizeArt() {
  const w = 210;
  const h = 320;
  const x = W / 2 - w / 2 - 36;
  const y = 300;
  const body = `
  ${penBox(x, y, w, h, { front: true, side: false, id: "sz" })}
  ${dim(x, y + h + 30, x + w, y + h + 30, "กว้าง 6.5 ซม.")}
  ${dim(x + w + 96, y, x + w + 96, y + h, "สูง 10 ซม.")}`;
  return card("ขนาดกล่องดินสอ — ขนาดเดียว", "6.5 × 10 ซม. · อะคริลิคพิมพ์ลายระบบ UV", body,
    "เลือกสกรีนได้ 1-4 ด้านรอบกล่อง", "ไม่มีขั้นต่ำ ยิ่งสั่งเยอะยิ่งถูก");
}

// ── ภาพสกรีน 1-4 ด้าน ────────────────────────────────────────────────
/** แผนผังมองจากด้านบน — สี่เหลี่ยมปากกล่อง + แถบ 4 ด้าน ไล่ติ้กด้านที่พิมพ์ */
function topView(cx, cy, n) {
  const s = 176; // ด้านในปากกล่อง
  const t = 30; // ความหนาแถบด้าน
  const g = 7; // ช่องไฟ
  const half = s / 2;
  const bar = (hx, hy, hw, hh, on) => `
    <rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" rx="9"
      fill="${on ? OK : "#eef2f6"}" stroke="${on ? "#0e7490" : "#cbd5e1"}" stroke-width="2"/>`;
  // เรียงลำดับด้านที่พิมพ์: หน้า → หลัง → ขวา → ซ้าย
  const order = { front: 0, back: 1, right: 2, left: 3 };
  const lit = (k) => order[k] < n;
  return `
  <rect x="${cx - half}" y="${cy - half}" width="${s}" height="${s}" rx="12" fill="#f0f9ff" stroke="#94a3b8" stroke-width="2.5"/>
  <text x="${cx}" y="${cy + 9}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ปากกล่อง</text>
  ${bar(cx - half + g, cy + half + g, s - g * 2, t, lit("front"))}
  ${bar(cx - half + g, cy - half - g - t, s - g * 2, t, lit("back"))}
  ${bar(cx + half + g, cy - half + g, t, s - g * 2, lit("right"))}
  ${bar(cx - half - g - t, cy - half + g, t, s - g * 2, lit("left"))}
  <text x="${cx}" y="${cy + half + t + 42}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${lit("front") ? OK : SUB}">หน้า</text>
  <text x="${cx}" y="${cy - half - t - 22}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${lit("back") ? OK : SUB}">หลัง</text>
  <text x="${cx + half + t + 34}" y="${cy + 8}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${lit("right") ? OK : SUB}">ขวา</text>
  <text x="${cx - half - t - 34}" y="${cy + 8}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${lit("left") ? OK : SUB}">ซ้าย</text>
  <text x="${cx}" y="${cy + half + t + 84}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">มองจากด้านบน · ฟ้า = ด้านที่พิมพ์</text>`;
}

function screenArt(n) {
  const w = 172;
  const h = 262;
  const bx = 118;
  const by = 330;
  const body = `
  ${penBox(bx, by, w, h, { front: true, side: n >= 3, id: `sc${n}` })}
  ${topView(640, 430, n)}
  <rect x="${W / 2 - 250}" y="${H - 158}" width="500" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${W / 2}" y="${H - 127}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">พิมพ์ลาย ${n} ด้าน จากทั้งหมด 4 ด้านรอบกล่อง</text>`;
  const subs = {
    1: "พิมพ์ลายด้านหน้าด้านเดียว",
    2: "พิมพ์ลายด้านหน้าและด้านหลัง",
    3: "พิมพ์ลาย 3 ด้าน เว้นไว้ 1 ด้าน",
    4: "พิมพ์ลายครบทุกด้านรอบกล่อง",
  };
  return card(`สกรีน ${n} ด้าน`, subs[n], body,
    "เลือกด้านที่จะพิมพ์ได้ · แต่ละด้านคนละลายก็ได้");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = [
  { file: `size-65x10-${VER}.jpg`, svg: sizeArt(), group: SIZE_GROUP, choice: SIZE_CHOICE },
  ...[1, 2, 3, 4].map((n) => ({
    file: `screen-${n}side-box-${VER}.jpg`, svg: screenArt(n), group: SCREEN_GROUP, choice: `สกรีน ${n} ด้าน`,
  })),
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
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
const options = data.options ?? [];

// 1. กลุ่ม "ขนาด" แบบการ์ด — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกหน้าสุด
const sizeJob = JOBS[0];
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  choices: [{ name: SIZE_CHOICE, desc: "อะคริลิคพิมพ์ลาย UV · สกรีนได้ 1-4 ด้านรอบกล่อง", imageSrc: sizeJob.url }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.unshift(sizeGroup);

// 2+3. กลุ่ม "สกรีน" — เปลี่ยนชื่อ (idempotent) + เขียนทับ imageSrc (extra เดิมห้ามหาย)
const g = options.find((o) => o.label === SCREEN_GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP}"`); process.exit(1); }
for (const c of g.choices ?? []) if (RENAME[c.name]) c.name = RENAME[c.name];
for (const j of JOBS.slice(1)) {
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${SCREEN_GROUP}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bs = back.data.options.find((o) => o.label === SIZE_GROUP);
if (bs?.display !== "cards" || bs?.choices?.[0]?.name !== SIZE_CHOICE || bs?.choices?.[0]?.imageSrc !== sizeJob.url) {
  console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", JSON.stringify(bs)); process.exit(1);
}
const bg = back.data.options.find((o) => o.label === SCREEN_GROUP);
for (const j of JOBS.slice(1)) {
  const c = bg?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
}
if (bg.choices.find((c) => RENAME[c.name])) { console.error("ยังมีชื่อเก่าค้าง!", bg.choices); process.exit(1); }
const EXTRAS = { "สกรีน 1 ด้าน": undefined, "สกรีน 2 ด้าน": 20, "สกรีน 3 ด้าน": 40, "สกรีน 4 ด้าน": 60 };
for (const [name, extra] of Object.entries(EXTRAS)) {
  const c = bg.choices.find((c) => c.name === name);
  if (c?.extra !== extra) { console.error(`extra "${name}" เพี้ยน!`, c); process.exit(1); }
}
console.log(`✓ กลุ่ม "ขนาด" การ์ด + เปลี่ยนชื่อ/ภาพสกรีน 4 ตัว (extra ครบ) อ่านกลับตรง · savedAt =`, back.data.savedAt);
