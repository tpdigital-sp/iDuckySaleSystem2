#!/usr/bin/env node
/**
 * กล่องดินสอ | ปากกาอะคริลิค (otheracrylicproducts2-2) — เพิ่มกลุ่ม "ขนาด" แบบการ์ด + ภาพตัวเลือกสกรีน
 * + เปลี่ยนชื่อตัวเลือกกลุ่ม "สกรีน": 1 ด้าน → สกรีน 1 ด้าน … 4 ด้าน → สกรีน 4 ด้าน
 *
 *   node scripts/pencil-box-size-screen-art.mjs            (วาดภาพลง .cache/pencil-box/upload ดูก่อน)
 *   node scripts/pencil-box-size-screen-art.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามคำอธิบายสินค้า: กล่องดินสอ/ปากกาอะคริลิค พิมพ์ UV ขนาด 6.5×10 ซม. สกรีนได้ 1-4 ด้านรอบกล่อง
 * ⚠️ "3 ด้าน/4 ด้าน" ของตัวนี้คือด้านของกล่อง ไม่ใช่เลเยอร์สกรีน (ดู split-screen-sides.mjs)
 *    ภาพ 1/2 ด้านเดิมชี้ชุดกลาง acrylic-howto (งานแผ่นแบน) — เปลี่ยนเป็นภาพเฉพาะกล่อง 4 ด้าน
 *
 * ทำ 3 อย่าง:
 *   1. เพิ่มกลุ่ม "ขนาด" (display cards) ไว้บนสุด — ตัวเลือกเดียว "6.5×10 ซม." ไม่บวกราคา + ภาพวาดลูกศรวัด
 *   2. กลุ่ม "สกรีน": เปลี่ยนชื่อตัวเลือกเป็น "สกรีน 1-4 ด้าน" (extra เดิม 20/40/60 คงอยู่)
 *   3. วาดภาพประกอบทั้ง 4 ตัวเลือก — ผังกล่อง 4 ด้าน ด้านที่พิมพ์มีลาย ด้านที่เหลือใสเปล่า
 *
 * รันซ้ำได้: กลุ่ม "ขนาด" เจอแล้วเขียนทับ · ชื่อใหม่เจอแล้วไม่เปลี่ยนซ้ำ (หาได้ทั้งชื่อเก่า-ใหม่)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 460);
const PEACE = await mascotDataUri("peace", 460);
const HELLO = await mascotDataUri("hello", 460);
const SHOPPING = await mascotDataUri("shopping", 460);
/** ลายประจำด้านที่ 1-4 ของกล่อง (คนละลายให้เห็นว่าคละลายรอบกล่องได้) */
const SIDE_ART = [HEART, PEACE, HELLO, SHOPPING];

const PRODUCT_ID = "otheracrylicproducts2-2";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/pencil-box/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "6.5×10 ซม.";
const SCREEN_GROUP = "สกรีน";
/** ชื่อเก่า → ชื่อใหม่ ในกลุ่มสกรีน */
const SCREEN_RENAME = {
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
/** โทนอะคริลิคใส */
const ACR = "#eff9fd";
const ACR_EDGE = "#7dd3fc";

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
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/**
 * ผนังกล่อง 1 ด้าน มองตรง — แผ่นอะคริลิคใส 6.5×10 ซม.
 * mascot = ลายสกรีน UV บนผนัง (null = ใสเปล่าไม่พิมพ์)
 */
function wall(cx, topY, CM, mascot = null, id = "w") {
  const w = 6.5 * CM;
  const h = 10 * CM;
  const bx = cx - w / 2;
  let art = "";
  if (mascot) {
    let ah = h - 1.7 * CM;
    let aw = ah * mascot.ratio;
    if (aw > w - 1 * CM) { aw = w - 1 * CM; ah = aw / mascot.ratio; }
    art = `
    <clipPath id="clip-${id}"><rect x="${bx + 6}" y="${topY + 6}" width="${w - 12}" height="${h - 12}" rx="8"/></clipPath>
    <g clip-path="url(#clip-${id})">
      <image href="${mascot.uri}" x="${cx - aw / 2}" y="${topY + (h - ah) / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    </g>`;
  }
  return `
  <rect x="${bx}" y="${topY}" width="${w}" height="${h}" rx="12" fill="${ACR}" stroke="${ACR_EDGE}" stroke-width="3"/>
  <line x1="${bx + 14}" y1="${topY + 16}" x2="${bx + 14}" y2="${topY + h - 16}" stroke="#ffffff" stroke-width="4" opacity="0.8"/>
  ${art}`;
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

// ── 1. ภาพกลุ่ม "ขนาด" — กล่องใส่ปากกา 6.5×10 ซม. + ดินสอ/ปากกาเสียบ ──
function sizeArt() {
  const CM = 46;
  const cx = W / 2 + 40;
  const topY = 272;
  const w = 6.5 * CM;
  const h = 10 * CM;
  const bx = cx - w / 2;
  // ดินสอ/ปากกาโผล่พ้นปากกล่อง — แท่งเอียงเล็กน้อย + ปลายเหลา/หัวปากกา
  const pen = (px, lean, hgt, body, tip) => `
  <g transform="rotate(${lean} ${px} ${topY + 10})">
    <rect x="${px - 11}" y="${topY - hgt}" width="22" height="${hgt + 60}" rx="8" fill="${body}" stroke="#0f172a" stroke-width="2"/>
    <path d="M ${px - 11} ${topY - hgt} L ${px} ${topY - hgt - 34} L ${px + 11} ${topY - hgt} Z" fill="${tip}" stroke="#0f172a" stroke-width="2"/>
  </g>`;
  const body = `
  <!-- ดินสอ/ปากกาอยู่หลังผนังหน้า (วาดก่อนแล้วโดนผนังทับช่วงล่าง) -->
  ${pen(cx - 90, -7, 58, "#fbbf24", "#f59e0b")}
  ${pen(cx - 12, 3, 84, "#38bdf8", "#0369a1")}
  ${pen(cx + 78, 9, 46, "#f472b6", "#be185d")}
  <!-- ปากกล่องด้านใน -->
  <ellipse cx="${cx}" cy="${topY + 12}" rx="${w / 2 - 8}" ry="22" fill="#dbeefb" stroke="${ACR_EDGE}" stroke-width="2.5"/>
  <!-- ผนังหน้ากล่อง + ลายสกรีน -->
  ${wall(cx, topY, CM, HEART, "szf")}
  <!-- ขอบปากกล่องด้านหน้า -->
  <path d="M ${bx} ${topY + 14} Q ${cx} ${topY + 42} ${bx + w} ${topY + 14}" fill="none" stroke="${ACR_EDGE}" stroke-width="3" opacity="0.7"/>
  ${dim(bx - 52, topY, bx - 52, topY + h, "10 ซม.")}
  ${dim(bx, topY + h + 38, bx + w, topY + h + 38, "6.5 ซม.")}`;
  return card("ขนาด 6.5 × 10 ซม.", "กล่องดินสอ / ปากกาอะคริลิค — ขนาดเดียว", body,
    "อะคริลิคใสทรงกล่อง เปิดด้านบน วางโต๊ะทำงานได้พอดี",
    "พิมพ์ลายตามสั่งระบบ UV · สกรีนได้ 1-4 ด้านรอบกล่อง");
}

// ── 2. ภาพสกรีน 1-4 ด้าน — ผัง 4 ผนังรอบกล่อง ────────────────────────
function screenArt(sides) {
  const CM = 23;
  const h = 10 * CM;
  const colXs = [W / 2 - 170, W / 2 + 170];
  const rowYs = [186, 186 + h + 78];
  const body = [0, 1, 2, 3].map((i) => {
    const cx = colXs[i % 2];
    const topY = rowYs[Math.floor(i / 2)];
    const on = i < sides;
    return `
    ${wall(cx, topY, CM, on ? SIDE_ART[i] : null, `s${sides}w${i}`)}
    ${tag(cx, topY + h + 12, on ? `ด้านที่ ${i + 1} — มีลาย` : `ด้านที่ ${i + 1} — ไม่พิมพ์`, on)}`;
  }).join("");
  const extra = [0, 20, 40, 60][sides - 1];
  const noteBySides = {
    1: "อีก 3 ด้านเป็นอะคริลิคใส ไม่มีลาย",
    2: "อีก 2 ด้านเป็นอะคริลิคใส · แต่ละด้านคนละลายได้",
    3: "เหลือด้านเดียวเป็นอะคริลิคใส · แต่ละด้านคนละลายได้",
    4: "มีลายครบทุกด้านรอบกล่อง · แต่ละด้านคนละลายได้",
  };
  return card(`สกรีน ${sides} ด้าน`,
    `พิมพ์ลาย ${sides} ด้านรอบกล่อง${extra ? ` (+${extra}.-)` : ""}`,
    body, noteBySides[sides]);
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
/** ชื่อไฟล์ → svg + ปลายทาง (group/choice ชื่อสุดท้ายหลัง rename) */
const JOBS = [
  { file: `size-6-5x10-${VER}.jpg`, svg: sizeArt(), group: SIZE_GROUP, choice: SIZE_CHOICE },
  { file: `screen-1side-box-${VER}.jpg`, svg: screenArt(1), group: SCREEN_GROUP, choice: "สกรีน 1 ด้าน" },
  { file: `screen-2side-box-${VER}.jpg`, svg: screenArt(2), group: SCREEN_GROUP, choice: "สกรีน 2 ด้าน" },
  { file: `screen-3side-box-${VER}.jpg`, svg: screenArt(3), group: SCREEN_GROUP, choice: "สกรีน 3 ด้าน" },
  { file: `screen-4side-box-${VER}.jpg`, svg: screenArt(4), group: SCREEN_GROUP, choice: "สกรีน 4 ด้าน" },
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

// 1. กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้บนสุด (หน้ากลุ่มสกรีน)
const sizeJob = JOBS.find((j) => j.group === SIZE_GROUP);
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  choices: [{ name: SIZE_CHOICE, desc: "กล่องอะคริลิคเปิดด้านบน ขนาดเดียว", imageSrc: sizeJob.url }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else {
  const atScreen = options.findIndex((o) => o.label === SCREEN_GROUP);
  options.splice(atScreen < 0 ? 0 : atScreen, 0, sizeGroup);
}

// 2. กลุ่ม "สกรีน" — เปลี่ยนชื่อ 1-4 ด้าน → สกรีน 1-4 ด้าน (extra เดิมคงอยู่)
const screenGroup = options.find((o) => o.label === SCREEN_GROUP && o !== sizeGroup);
if (!screenGroup) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP}"`); process.exit(1); }
for (const [oldName, newName] of Object.entries(SCREEN_RENAME)) {
  const c = screenGroup.choices.find((c) => c.name === newName) || screenGroup.choices.find((c) => c.name === oldName);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${SCREEN_GROUP}: ${oldName}"`); process.exit(1); }
  c.name = newName;
}

// 3. เติม imageSrc ตัวเลือกสกรีน (ทับภาพชุดกลาง acrylic-howto เดิมของ 1/2 ด้าน · extra เดิมอยู่ครบ)
for (const j of JOBS.filter((j) => j.group !== SIZE_GROUP)) {
  const c = screenGroup.choices.find((c) => c.name === j.choice);
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
const backScreen = back.data.options.find((o) => o.label === SCREEN_GROUP && o.choices.length > 1);
if (backScreen.choices.some((c) => SCREEN_RENAME[c.name])) { console.error("ชื่อเก่ายังอยู่!", backScreen.choices.map((c) => c.name)); process.exit(1); }
const wantExtra = { "สกรีน 1 ด้าน": undefined, "สกรีน 2 ด้าน": 20, "สกรีน 3 ด้าน": 40, "สกรีน 4 ด้าน": 60 };
for (const [name, ex] of Object.entries(wantExtra)) {
  if (backScreen.choices.find((c) => c.name === name)?.extra !== ex) { console.error(`extra ของ "${name}" ไม่ตรง!`); process.exit(1); }
}
const backSize = back.data.options.find((o) => o.label === SIZE_GROUP);
if (backSize?.display !== "cards" || back.data.options[0]?.label !== SIZE_GROUP) { console.error("กลุ่มขนาดไม่อยู่บนสุด/ไม่ใช่ cards!"); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (cards) + rename สกรีน 1-4 ด้าน + ภาพตัวเลือก ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
