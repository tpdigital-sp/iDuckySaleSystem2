#!/usr/bin/env node
/**
 * แจกันอะคริลิค (otheracrylicproducts2-1) — เพิ่มกลุ่ม "ขนาด" แบบการ์ด + ภาพประกอบทุกกลุ่มตัวเลือก
 *
 *   node scripts/vase-size-option.mjs            (วาดภาพลง .cache/vase/upload ดูก่อน)
 *   node scripts/vase-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *   node scripts/vase-size-option.mjs --verify   (เช็คซ้ำอย่างเดียว ไม่เขียน — กันค่าเด้งกลับ)
 *
 * ตามใบสเปค ACRYLIC VASES (/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/งานอะคริลิคทั่วไป/16_แจกัน VASE/P-nแจกัน-01.jpg):
 * กล่องแจกัน 6.5×10 ซม. มีขนาดและทรงเดียว · แบบอะคริลิคประกอบไดคัทเริ่มต้น 8×10 ซม.
 * (+ซม.ละ 10.-/ด้าน) งานประกอบติดกาวโดยมือ อาจมีเบี้ยวและเห็นคราบกาวบ้าง
 *
 * ทำ 2 อย่าง:
 *   1. เพิ่มกลุ่ม "ขนาด" (display cards) ไว้บนสุด — ตัวเลือกเดียว "6.5×10 ซม." ไม่บวกราคา + ภาพลูกศรวัด
 *   2. กลุ่ม "แบบ" (แกนตารางราคา — ห้ามเปลี่ยนชื่อ!): ตั้ง display cards + เติม desc/imageSrc 2 ตัวเลือก
 *
 * รันซ้ำได้: กลุ่ม "ขนาด" เจอแล้วเขียนทับ · กลุ่ม "แบบ" แก้เฉพาะ display/desc/imageSrc ชื่อคงเดิม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 460);
const PEACE = await mascotDataUri("peace", 460);

const PRODUCT_ID = "otheracrylicproducts2-1";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/vase/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "6.5×10 ซม.";
const SIZE_DESC = "กล่องแจกันอะคริลิคใส ทรง/ขนาดเดียว";
const TYPE_GROUP = "แบบ";
/** desc ต่อตัวเลือกกลุ่ม "แบบ" (ชื่อ = แกนตารางราคา ห้ามแตะ) */
const TYPE_DESC = {
  "อะคริลิค 1 ด้าน": "อะคริลิคไดคัทตามทรงลาย ติดหน้าแจกัน 1 ด้าน · เริ่มต้น 8×10 ซม.",
  "อะคริลิค 2 ด้าน": "อะคริลิคไดคัทติดหน้า-หลัง 2 ด้าน · หน้า-หลังคนละลายได้",
};

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
/** อะคริลิคใสของตัวแจกัน */
const CLEAR_EDGE = "#9db8c9";
const CLEAR_FILL = "#eef7fb";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ mirror-comb-size-art) */
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
  <defs>
    <linearGradient id="irid" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd9ec"/>
      <stop offset="0.35" stop-color="#d9e7ff"/>
      <stop offset="0.7" stop-color="#c9f3ef"/>
      <stop offset="1" stop-color="#fdeccb"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/**
 * ตัวแจกันอะคริลิคใส — กล่องสี่เหลี่ยมแนวตั้ง 6.5×10 ซม. เห็นปากกล่องด้านบนเฉียงนิด ๆ
 * มีปากกา 2 ด้ามเสียบอยู่ · mascot = ลายสกรีนบนหน้ากล่อง (null = กล่องเปล่า)
 */
function vaseBox(cx, topY, CM, mascot = null, id = "v") {
  const w = 6.5 * CM;
  const h = 10 * CM;
  const bx = cx - w / 2;
  const dp = 0.9 * CM; // ความลึกปากกล่องที่โผล่ให้เห็น
  let art = "";
  if (mascot) {
    let ah = h * 0.52;
    let aw = ah * mascot.ratio;
    if (aw > w - 0.9 * CM) { aw = w - 0.9 * CM; ah = aw / mascot.ratio; }
    art = `<image href="${mascot.uri}" x="${cx - aw / 2}" y="${topY + h - ah - 0.55 * CM}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return `
  <!-- ปากกาเสียบในแจกัน -->
  <g transform="rotate(-8 ${cx} ${topY})">
    <rect x="${cx - 0.55 * CM}" y="${topY - 1.7 * CM}" width="${0.42 * CM}" height="${3.1 * CM}" rx="${0.2 * CM}" fill="#67c3d4" stroke="#4ba8bb" stroke-width="2"/>
    <polygon points="${cx - 0.55 * CM},${topY - 1.7 * CM} ${cx - 0.34 * CM},${topY - 2.2 * CM} ${cx - 0.13 * CM},${topY - 1.7 * CM}" fill="#f6d6a8"/>
  </g>
  <g transform="rotate(7 ${cx} ${topY})">
    <rect x="${cx + 0.4 * CM}" y="${topY - 1.3 * CM}" width="${0.42 * CM}" height="${2.7 * CM}" rx="${0.2 * CM}" fill="#8fd3a8" stroke="#6cb98a" stroke-width="2"/>
    <polygon points="${cx + 0.4 * CM},${topY - 1.3 * CM} ${cx + 0.61 * CM},${topY - 1.8 * CM} ${cx + 0.82 * CM},${topY - 1.3 * CM}" fill="#f6d6a8"/>
  </g>
  <!-- ปากกล่องด้านบน -->
  <polygon points="${bx},${topY} ${bx + 0.5 * CM},${topY - dp} ${bx + w - 0.5 * CM},${topY - dp} ${bx + w},${topY}"
    fill="${CLEAR_FILL}" opacity="0.85" stroke="${CLEAR_EDGE}" stroke-width="2.5"/>
  <!-- ตัวกล่องใส -->
  <rect x="${bx}" y="${topY}" width="${w}" height="${h}" rx="6" fill="${CLEAR_FILL}" opacity="0.6" stroke="${CLEAR_EDGE}" stroke-width="3.5"/>
  <line x1="${bx + 0.35 * CM}" y1="${topY + 0.5 * CM}" x2="${bx + 0.35 * CM}" y2="${topY + h - 0.5 * CM}" stroke="#ffffff" stroke-width="5" opacity="0.8"/>
  <line x1="${bx + w - 0.4 * CM}" y1="${topY + 0.8 * CM}" x2="${bx + w - 0.4 * CM}" y2="${topY + h - 0.8 * CM}" stroke="#ffffff" stroke-width="3" opacity="0.6"/>
  ${art}`;
}

/**
 * แผ่นอะคริลิคประกอบไดคัทตามทรงลาย — พื้นรุ้งโฮโลแกรม ขอบขาวหนาแบบไดคัท + มาสคอต
 * faded = แผ่นด้านหลัง (มองผ่านตัวกล่อง จางลง)
 */
function diecutPanel(cx, cy, CM, mascot, id = "d", faded = false) {
  const pw = 5.6 * CM;
  const ph = 7 * CM;
  let ah = ph - 1.1 * CM;
  let aw = ah * mascot.ratio;
  if (aw > pw - 0.9 * CM) { aw = pw - 0.9 * CM; ah = aw / mascot.ratio; }
  return `
  <g opacity="${faded ? 0.55 : 1}">
    <rect x="${cx - pw / 2}" y="${cy - ph / 2}" width="${pw}" height="${ph}" rx="${1.6 * CM}"
      fill="url(#irid)" stroke="#ffffff" stroke-width="10"/>
    <rect x="${cx - pw / 2}" y="${cy - ph / 2}" width="${pw}" height="${ph}" rx="${1.6 * CM}"
      fill="none" stroke="${CLEAR_EDGE}" stroke-width="2" opacity="0.7"/>
    <image href="${mascot.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}

/** ป้ายชื่อใต้ชิ้นงาน */
const tag = (cx, y, text, on = true) => {
  const w = text.length * 14 + 44;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

// ── 1. ภาพกลุ่ม "ขนาด" — 6.5×10 ซม. ─────────────────────────────────
function sizeArt() {
  const CM = 46;
  const cx = W / 2 + 40;
  const topY = 250;
  const w = 6.5 * CM;
  const h = 10 * CM;
  const body = `
  ${vaseBox(cx, topY, CM, HEART, "sz")}
  ${dim(cx - w / 2 - 52, topY, cx - w / 2 - 52, topY + h, "10 ซม.")}
  ${dim(cx - w / 2, topY + h + 34, cx + w / 2, topY + h + 34, "6.5 ซม.")}`;
  return card("ขนาดแจกัน 6.5 × 10 ซม.", "กล่องแจกันอะคริลิคใส — มีขนาดและทรงเดียว", body,
    "ใส่ดอกไม้หรือปากกา ตั้งโต๊ะทำงานได้ · พิมพ์ลายตามสั่งระบบ UV",
    "แบบอะคริลิคประกอบไดคัท เริ่มต้น 8×10 ซม. (+ซม.ละ 10.-/ด้าน)");
}

// ── 2. ภาพกลุ่ม "แบบ" — อะคริลิค 1 ด้าน / 2 ด้าน ─────────────────────
function typeArt(sides) {
  const CM = 42;
  const cx = W / 2;
  const topY = 300;
  const h = 10 * CM;
  const one = sides === 1;
  const body = `
  ${one ? "" : diecutPanel(cx + 1.3 * CM, topY + 2.4 * CM, CM, PEACE, "db", true)}
  ${vaseBox(cx, topY, CM, null, "tp")}
  ${diecutPanel(cx - 1.6 * CM, topY + h - 3.4 * CM, CM, HEART, "df")}
  ${tag(cx, topY + h + 40, one ? "อะคริลิคไดคัทติดด้านหน้า 1 ชิ้น" : "ติดหน้า-หลัง อย่างละ 1 ชิ้น")}`;
  return one
    ? card("อะคริลิค 1 ด้าน", "อะคริลิคไดคัทตามทรงลาย ติดหน้าแจกัน 1 ด้าน", body,
      "ขนาดอะคริลิคประกอบเริ่มต้น 8×10 ซม. · สกรีนบนอะคริลิค",
      "งานประกอบติดกาวโดยมือ อาจมีเบี้ยวและเห็นคราบกาวบ้าง")
    : card("อะคริลิค 2 ด้าน", "อะคริลิคไดคัทติดหน้า-หลังแจกัน ทั้งสองด้าน", body,
      "หน้า-หลังคนละลายได้ · ขนาดอะคริลิคเริ่มต้น 8×10 ซม.",
      "งานประกอบติดกาวโดยมือ อาจมีเบี้ยวและเห็นคราบกาวบ้าง");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = [
  { file: `size-6-5x10-${VER}.jpg`, svg: sizeArt(), group: SIZE_GROUP, choice: SIZE_CHOICE },
  { file: `type-acrylic-1side-${VER}.jpg`, svg: typeArt(1), group: TYPE_GROUP, choice: "อะคริลิค 1 ด้าน" },
  { file: `type-acrylic-2side-${VER}.jpg`, svg: typeArt(2), group: TYPE_GROUP, choice: "อะคริลิค 2 ด้าน" },
];

const VERIFY_ONLY = process.argv.includes("--verify");
if (!VERIFY_ONLY) {
  for (const j of JOBS) {
    j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    writeFileSync(`${OUT}/${j.file}`, j.buf);
    console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
  }
}

const WRITE = process.argv.includes("--write");
if (!WRITE && !VERIFY_ONLY) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${PRODUCT_ID}/${j.file}`;

if (WRITE) {
  for (const j of JOBS) {
    const key = `products/${PRODUCT_ID}/${j.file}`;
    const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
    if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  }
  console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${PRODUCT_ID}/`);

  const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
  if (readErr) { console.error(readErr); process.exit(1); }
  const data = row.data;
  // สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
  writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));
  const options = data.options ?? [];

  // 1. กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้บนสุด
  const sizeJob = JOBS.find((j) => j.group === SIZE_GROUP);
  const sizeGroup = {
    label: SIZE_GROUP,
    display: "cards",
    choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: sizeJob.url }],
  };
  const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
  if (atSize >= 0) options[atSize] = sizeGroup;
  else options.unshift(sizeGroup);

  // 2. กลุ่ม "แบบ" — display cards + desc/imageSrc (ชื่อกลุ่ม/ตัวเลือกเป็นแกนราคา ไม่แตะ)
  const typeGroup = options.find((o) => o.label === TYPE_GROUP);
  if (!typeGroup) { console.error(`ไม่เจอกลุ่ม "${TYPE_GROUP}"`); process.exit(1); }
  typeGroup.display = "cards";
  for (const j of JOBS.filter((j) => j.group === TYPE_GROUP)) {
    const c = typeGroup.choices.find((c) => c.name === j.choice);
    if (!c) { console.error(`ไม่เจอตัวเลือก "${TYPE_GROUP}: ${j.choice}"`); process.exit(1); }
    c.imageSrc = j.url;
    c.desc = TYPE_DESC[j.choice];
  }

  data.options = options;
  data.savedAt = new Date().toISOString();
  const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
  if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }
}

// ── อ่านกลับมาเทียบ (ทั้งโหมด --write และ --verify) ──────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
let ok = true;
for (const j of JOBS) {
  const got = back.data.options.find((o) => o.label === j.group)?.choices?.find((c) => c.name === j.choice);
  if (got?.imageSrc !== j.url) { console.error("อ่านกลับ imageSrc ไม่ตรง!", j.group, j.choice, got?.imageSrc); ok = false; }
}
const backSize = back.data.options.find((o) => o.label === SIZE_GROUP);
if (backSize?.display !== "cards" || back.data.options[0]?.label !== SIZE_GROUP) { console.error("กลุ่มขนาดไม่อยู่บนสุด/ไม่ใช่ cards!"); ok = false; }
if (backSize?.choices?.[0]?.desc !== SIZE_DESC) { console.error("desc กลุ่มขนาดไม่ตรง!"); ok = false; }
const backType = back.data.options.find((o) => o.label === TYPE_GROUP);
if (backType?.display !== "cards") { console.error("กลุ่มแบบไม่ใช่ cards!"); ok = false; }
const names = (backType?.choices ?? []).map((c) => c.name).join("|");
if (names !== "อะคริลิค 1 ด้าน|อะคริลิค 2 ด้าน") { console.error("ชื่อตัวเลือกกลุ่มแบบเพี้ยน (แกนราคา)!", names); ok = false; }
for (const [n, d] of Object.entries(TYPE_DESC))
  if (backType?.choices?.find((c) => c.name === n)?.desc !== d) { console.error("desc กลุ่มแบบไม่ตรง!", n); ok = false; }
// แกนราคาต้องไม่ขยับ
if (JSON.stringify(back.data.pricing?.driverLabels) !== '["แบบ"]') { console.error("driverLabels เพี้ยน!", back.data.pricing?.driverLabels); ok = false; }
if (!ok) process.exit(1);
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (cards) + กลุ่ม "${TYPE_GROUP}" (cards) ภาพ ${JOBS.length} ใบ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
