#!/usr/bin/env node
/**
 * ไฟแช็ค Cricket (lighter) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบทุกกลุ่มตัวเลือก
 *
 *   node scripts/lighter-size-option-art.mjs            (วาดภาพลง .cache/lighter/upload ดูก่อน)
 *   node scripts/lighter-size-option-art.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค (50_ของใช้และของที่ระลึก/ไฟแช็ค/P-Lighter-01.jpg — ยกมาไว้ใน description แล้ว):
 * ไฟแช็ค Cricket ขนาดเดียว 2×8 ซม. · ตัวเรือนไนล่อน จุดได้มากกว่า 2,000 ครั้ง
 * เลือกสีตัวไฟแช็คได้ 5 สี (ขาว ดำ แดง น้ำเงิน เหลือง) · สกรีนได้ 1-2 ด้าน
 *
 * ทำ 3 อย่าง:
 *   1. เพิ่มกลุ่ม "ขนาด" ไว้หน้ากลุ่ม "สีไฟแช็ค" — ตัวเลือกเดียว "2×8 ซม." ไม่บวกราคา
 *      พร้อมภาพวาดใหม่ (900×900) ตัวไฟแช็ค+ลูกศรวัด 8/2 ซม.
 *   2. เติม choice.imageSrc ให้ 5 สีในกลุ่ม "สีไฟแช็ค" (dropdown โชว์รูปสีที่เลือกข้างเมนู)
 *   3. เติม choice.imageSrc ให้กลุ่ม "สกรีนกี่ด้าน" — 1 ด้าน (หน้าอย่างเดียว) / 2 ด้าน (หน้า-หลังคนละลาย)
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ · กลุ่มเดิมแตะแค่ imageSrc (desc/extra คงเดิม)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);
const PEACE = await mascotDataUri("peace", 420);

const PRODUCT_ID = "lighter";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/lighter/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "2×8 ซม.";
const COLOR_GROUP = "สีไฟแช็ค";
const SCREEN_GROUP = "สกรีนกี่ด้าน";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สีตัวไฟแช็คตามของจริง (Cricket หัวดำทุกสี — ดูรูปงานจริงในแกลเลอรี) */
const COLORS = {
  "ขาว": { fill: "#ffffff", edge: "#cbd5e1", file: "white" },
  "ดำ": { fill: "#23262d", edge: "#0f1115", file: "black" },
  "แดง": { fill: "#dc2626", edge: "#b91c1c", file: "red" },
  "น้ำเงิน": { fill: "#1e40af", edge: "#1e3a8a", file: "blue" },
  "เหลือง": { fill: "#facc15", edge: "#eab308", file: "yellow" },
};

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ hologram-bag-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** กรอบการ์ดพื้นหลัง + หัวเรื่อง/หมายเหตุ ใช้ร่วมทุกภาพ */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/**
 * ตัวไฟแช็ค Cricket มองด้านหน้า — หัวฝาดำ + ลูกล้อจุดไฟ + ก้านกดโผล่ขวา ตัวเรือนสีตามเลือก
 * ขนาดรวม 2×8 ซม. (กว้าง 2 = ตัวเรือน · สูง 8 = นับตั้งแต่ลูกล้อถึงก้น)
 * mascot = ลายสกรีนแทนลายลูกค้า (null = ไม่พิมพ์ลาย)
 */
function lighter(cx, topY, CM, color, mascot = null, id = "g") {
  const w = 2 * CM;
  const hTotal = 8 * CM;
  const wheelH = 0.55 * CM; // ส่วนลูกล้อที่พ้นฝาขึ้นไป
  const hoodY = topY + wheelH;
  const hoodH = 1.15 * CM;
  const bodyY = hoodY + hoodH;
  const bodyH = topY + hTotal - bodyY;
  const bx = cx - w / 2;
  const dark = color.fill !== "#ffffff" && color.fill !== "#facc15";

  // ลายสกรีน (มาสคอต) กลางตัวเรือนค่อนบน
  let art = "";
  if (mascot) {
    let aw = w - 26;
    let ah = aw / mascot.ratio;
    const maxH = 3.1 * CM;
    if (ah > maxH) { ah = maxH; aw = ah * mascot.ratio; }
    art = `<image href="${mascot.uri}" x="${cx - aw / 2}" y="${bodyY + 0.7 * CM}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  return `
  <defs>
    <linearGradient id="sheen-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="${dark ? 0.16 : 0.5}"/>
      <stop offset="0.35" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.8" stop-color="#000000" stop-opacity="${dark ? 0.22 : 0.07}"/>
      <stop offset="1" stop-color="#000000" stop-opacity="${dark ? 0.3 : 0.12}"/>
    </linearGradient>
  </defs>
  <!-- ก้านกดแก๊ส โผล่ขวาของฝา -->
  <rect x="${cx + w * 0.16}" y="${hoodY + 0.06 * CM}" width="${w * 0.62}" height="${0.42 * CM}" rx="${0.16 * CM}" fill="#111827"/>
  <!-- ลูกล้อจุดไฟ — วาดก่อนฝา ให้โผล่แค่ครึ่งบนเหนือขอบฝา -->
  <circle cx="${cx - w * 0.18}" cy="${hoodY + 0.16 * CM}" r="${0.42 * CM}" fill="#64748b" stroke="#334155" stroke-width="3"/>
  <circle cx="${cx - w * 0.18}" cy="${hoodY + 0.16 * CM}" r="${0.3 * CM}" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="2.5 4"/>
  <!-- ตัวเรือน -->
  <rect x="${bx}" y="${bodyY - 6}" width="${w}" height="${bodyH + 6}" rx="${0.32 * CM}" fill="${color.fill}" stroke="${color.edge}" stroke-width="3"/>
  <rect x="${bx}" y="${bodyY - 6}" width="${w}" height="${bodyH + 6}" rx="${0.32 * CM}" fill="url(#sheen-${id})"/>
  ${art}
  <!-- ฝาครอบดำ + โลโก้ -->
  <rect x="${bx - 2}" y="${hoodY}" width="${w + 4}" height="${hoodH}" rx="${0.22 * CM}" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
  <rect x="${bx - 2}" y="${hoodY}" width="${w + 4}" height="${hoodH * 0.45}" rx="${0.22 * CM}" fill="#ffffff" opacity="0.08"/>
  <text x="${cx}" y="${hoodY + hoodH * 0.66}" font-family="${TH}" font-size="${0.46 * CM}" font-weight="700" font-style="italic" text-anchor="middle" fill="#f1f5f9">Cricket</text>`;
}

/** ป้ายชื่อใต้ตัวไฟแช็ค (ด้านหน้า/ด้านหลัง) */
const tag = (cx, y, text, on = true) => {
  const w = text.length * 14 + 44; // ตัวไทยมีสระ/วรรณยุกต์ซ้อน นับกว้างจริง ~14px/ตัวอักษรที่ฟอนต์ 23
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

// ── 1. ภาพกลุ่ม "ขนาด" — 2×8 ซม. ─────────────────────────────────────
function sizeArt() {
  const CM = 62;
  const cx = W / 2;
  const topY = 190;
  const w = 2 * CM;
  const hTotal = 8 * CM;
  const body = `
  ${lighter(cx, topY, CM, COLORS["ขาว"], HEART, "sz")}
  ${dim(cx - w / 2 - 46, topY, cx - w / 2 - 46, topY + hTotal, "8 ซม.")}
  ${dim(cx - w / 2, topY + hTotal + 36, cx + w / 2, topY + hTotal + 36, "2 ซม.")}`;
  return card("ขนาดไฟแช็ค 2 × 8 ซม.", "ไฟแช็ค Cricket พิมพ์ลายตามสั่ง — ขนาดเดียว", body,
    "ตัวเรือนไนล่อนทนความร้อน · จุดได้มากกว่า 2,000 ครั้ง",
    "เลือกสีตัวไฟแช็คได้ 5 สี · สกรีนลายได้ 1-2 ด้าน");
}

// ── 2. ภาพสีไฟแช็ค 5 สี ──────────────────────────────────────────────
function colorArt(name) {
  const CM = 56;
  const cx = W / 2;
  const topY = 205;
  // แถวจุดสี 5 เม็ด เม็ดที่เลือกมีวงแหวน
  const names = Object.keys(COLORS);
  const dotY = 745;
  const dots = names.map((n, i) => {
    const x = cx + (i - 2) * 72;
    const on = n === name;
    return `
    <circle cx="${x}" cy="${dotY}" r="23" fill="${COLORS[n].fill}" stroke="${COLORS[n].edge}" stroke-width="3"/>
    ${on ? `<circle cx="${x}" cy="${dotY}" r="32" fill="none" stroke="${OK}" stroke-width="4"/>` : ""}`;
  }).join("");
  const body = `${lighter(cx, topY, CM, COLORS[name], HEART, "c")}${dots}`;
  return card(`สีไฟแช็ค — ${name}`, "หัวฝาสีดำทุกสี · พิมพ์ลายตามสั่งด้วยระบบ UV", body,
    "เลือกสีตัวไฟแช็คได้ 5 สี — ขาว ดำ แดง น้ำเงิน เหลือง");
}

// ── 3. ภาพสกรีน 1 ด้าน / 2 ด้าน ──────────────────────────────────────
function screenArt(sides) {
  const CM = 50;
  const topY = 220;
  const hTotal = 8 * CM;
  const lx = W / 2 - 155;
  const rx = W / 2 + 155;
  const one = sides === 1;
  const body = `
  ${lighter(lx, topY, CM, COLORS["ขาว"], HEART, "sa")}
  ${lighter(rx, topY, CM, COLORS["ขาว"], one ? null : PEACE, "sb")}
  ${tag(lx, topY + hTotal + 26, "ด้านหน้า — มีลาย")}
  ${tag(rx, topY + hTotal + 26, one ? "ด้านหลัง — ไม่พิมพ์" : "ด้านหลัง — มีลาย", !one)}`;
  return one
    ? card("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้าด้านเดียว", body, "อีกด้านเป็นสีตัวไฟแช็คล้วน ไม่มีลาย")
    : card("สกรีน 2 ด้าน", "พิมพ์ลายทั้งสองด้าน", body, "หน้า-หลังคนละลายได้");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
/** ชื่อไฟล์ → svg + ปลายทาง (group/choice) */
const JOBS = [
  { file: `size-2x8-${VER}.jpg`, svg: sizeArt(), group: SIZE_GROUP, choice: SIZE_CHOICE },
  ...Object.entries(COLORS).map(([name, c]) => ({
    file: `color-${c.file}-${VER}.jpg`, svg: colorArt(name), group: COLOR_GROUP, choice: name,
  })),
  { file: `screen-1side-${VER}.jpg`, svg: screenArt(1), group: SCREEN_GROUP, choice: "สกรีน 1 ด้าน" },
  { file: `screen-2side-${VER}.jpg`, svg: screenArt(2), group: SCREEN_GROUP, choice: "สกรีน 2 ด้าน" },
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

// 1. กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้หน้ากลุ่มสีไฟแช็ค
const sizeJob = JOBS.find((j) => j.group === SIZE_GROUP);
const sizeGroup = { label: SIZE_GROUP, choices: [{ name: SIZE_CHOICE, imageSrc: sizeJob.url }] };
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else {
  const atColor = options.findIndex((o) => o.label === COLOR_GROUP);
  options.splice(atColor < 0 ? 0 : atColor, 0, sizeGroup);
}

// 2-3. เติม imageSrc ให้ตัวเลือกเดิม (desc/extra ของเดิมอยู่ครบ)
for (const j of JOBS.filter((j) => j.group !== SIZE_GROUP)) {
  const g = options.find((o) => o.label === j.group);
  const c = g?.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.group}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of JOBS) {
  const got = back.data.options.find((o) => o.label === j.group)?.choices?.find((c) => c.name === j.choice)?.imageSrc;
  if (got !== j.url) { console.error("อ่านกลับไม่ตรง!", j.group, j.choice, got); process.exit(1); }
}
const screen2 = back.data.options.find((o) => o.label === SCREEN_GROUP)?.choices?.find((c) => c.name === "สกรีน 2 ด้าน");
if (screen2?.extra !== 10) { console.error("extra สกรีน 2 ด้าน หาย!", screen2); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" + ภาพตัวเลือก ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
