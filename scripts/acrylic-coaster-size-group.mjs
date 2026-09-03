#!/usr/bin/env node
/**
 * Acrylic Coaster (/products/acrylic-coaster) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบ
 *
 *   node scripts/acrylic-coaster-size-group.mjs            (วาดภาพลง .cache/acrylic-coaster/upload ดูก่อน)
 *   node scripts/acrylic-coaster-size-group.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปคร้าน (P-nCoaster-01 — สรุปไว้ใน scripts/assets/proposals-gifts.json):
 * ขนาดเริ่มต้น 10×10 ซม. · เพิ่มขนาดได้ บวก ซม.ละ 10 บาท
 *
 * ทำ 2 อย่าง:
 *   1. กลุ่ม "ขนาด" (การ์ด 2 ใบ พร้อมภาพวาดใหม่ 900×900) แทรกไว้หน้ากลุ่ม "ประเภท"
 *        • "10×10 ซม. (มาตรฐาน)"        ไม่บวกเพิ่ม
 *        • "📐 กำหนดขนาดเอง (+฿10/ซม.)"  เกิน 10 ซม. คิดเพิ่ม ซม.ละ ฿10
 *   2. ช่องกรอก "ขนาดที่ต้องการ · ด้านยาวสุด" (โผล่เมื่อเลือกกำหนดขนาดเอง)
 *      คิดเงินด้วย inputFee { perUnit: 10, free: 10 } — กรอก 14 → +฿40/อัน
 *      ⚠️ ตีความ "ซม.ละ 10" ว่าวัดจาก **ด้านยาวสุด** ส่วนที่เกิน 10 ซม. (ช่องเดียว ไม่แยกกว้าง/สูง
 *      แบบกระเป๋า เพราะที่รองแก้วไดคัทตามทรง — ร้านวัดตัวงานด้านยาวสุดแบบเดียวกับพวงกุญแจ)
 *      เพดานรับไว้ 30 ซม. — ใหญ่กว่านั้นให้ทักแชทตีราคา (เลขเดียวกับ askOver ของสแตนดี้)
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด"/ช่องกรอกอยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "acrylic-coaster";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/acrylic-coaster/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const STD_CHOICE = "10×10 ซม. (มาตรฐาน)";
const CUSTOM_CHOICE = "📐 กำหนดขนาดเอง (+฿10/ซม.)";
const INPUT_LABEL = "ขนาดที่ต้องการ · ด้านยาวสุด";
const RATE = 10;   // บาทต่อ ซม. ที่เกินมาตรฐาน
const FREE = 10;   // 10 ซม. แรกรวมในราคาแล้ว
const MAX = 30;    // เกินนี้ให้แอดมินตีราคา (เลขเดียวกับ askOver สแตนดี้)
const TYPE_GROUP = "ประเภท"; // จุดแทรก: หน้ากลุ่มนี้

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ hologram-bag-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 + 22 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 34 : -16);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? 0 : (label.length * 13) / 2)}" y="${ly - 25}"
      width="${label.length * 13}" height="33" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="${vertical ? "start" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** แผ่นอะคริลิคใสจัตุรัส (มุมมองตรง) + ลายมาสคอตตรงกลาง — ใช้ทั้งสองการ์ด */
const coasterPlate = (cx, cy, side, opts = {}) => {
  const x = cx - side / 2;
  const y = cy - side / 2;
  const pad = 26;
  const r = MASCOT.ratio;
  let ah = side - pad * 2;
  let aw = ah * r;
  if (aw > side - pad * 2) { aw = side - pad * 2; ah = aw / r; }
  return `
  <rect x="${x + 10}" y="${y + 14}" width="${side}" height="${side}" rx="26" fill="#0f172a" opacity="0.07"/>
  <rect x="${x}" y="${y}" width="${side}" height="${side}" rx="26" fill="url(#acryl)" stroke="#b8c8d9" stroke-width="3.5"/>
  <rect x="${x}" y="${y}" width="${side}" height="${side}" rx="26" fill="url(#sheen)"/>
  ${opts.noMascot ? "" : `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`}
  <rect x="${x + 8}" y="${y + 8}" width="${side - 16}" height="${side - 16}" rx="20" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.7"/>`;
};

const defs = `<defs>
    <!-- เนื้ออะคริลิคใส — ฟ้าจางไล่เฉด + แสงสะท้อน -->
    <linearGradient id="acryl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef7fb"/>
      <stop offset="0.5" stop-color="#e3f0f7"/>
      <stop offset="1" stop-color="#d8e9f3"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

const card = (title, sub, body, foot) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="94" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="136" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>
  ${body}
  ${foot.map((t, i) => `<text x="${W / 2}" y="${H - 74 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${t}</text>`).join("")}
</svg>`;

/** การ์ด 1 — ขนาดมาตรฐาน 10×10 ซม. */
function stdArt() {
  const CM = 42; // 1 ซม. = 42 px → แผ่น 10×10 = 420×420
  const side = 10 * CM;
  const cx = W / 2;
  const cy = 468;
  const x = cx - side / 2;
  const y = cy - side / 2;
  return card(
    "ขนาดมาตรฐาน 10 × 10 ซม.",
    "รวมในราคาแล้ว — ไดคัทตามทรงได้ในขนาดนี้",
    `${coasterPlate(cx, cy, side)}
     ${dim(x, y + side + 40, x + side, y + side + 40, "10 ซม.")}
     ${dim(x + side + 40, y, x + side + 40, y + side, "10 ซม.")}`,
    ["อะคริลิคพิมพ์ลาย UV ตามสั่ง · ลายในภาพเป็นตัวอย่างตำแหน่งพิมพ์"],
  );
}

/** การ์ด 2 — กำหนดขนาดเอง (กรอบประขยายรอบแผ่นมาตรฐาน + ป้ายเรท) */
function customArt() {
  const CM = 30; // ย่อสเกลให้กรอบใหญ่ 14 ซม. ยังอยู่ในการ์ด
  const stdSide = 10 * CM;
  const bigSide = 14 * CM;
  const cx = W / 2;
  const cy = 470;
  const bx = cx - bigSide / 2;
  const by = cy - bigSide / 2;
  // ลูกศรชี้ออกตามแนวทแยงทั้ง 4 มุม = ขยายได้ทุกทิศ
  const arrow = (x, y, dx, dy) => `
    <line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="${OK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${x + dx} ${y + dy} l ${-dx * 0.32 - dy * 0.18} ${-dy * 0.32 + dx * 0.18} M ${x + dx} ${y + dy} l ${-dx * 0.32 + dy * 0.18} ${-dy * 0.32 - dx * 0.18}"
      stroke="${OK}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  const g = 34; // ระยะลูกศรพ้นกรอบประ
  return card(
    "กำหนดขนาดเองได้",
    `ใหญ่กว่า 10 ซม. คิดเพิ่ม ซม.ละ ฿${RATE} (รับได้ถึง ${MAX} ซม.)`,
    `${coasterPlate(cx, cy, stdSide)}
     <rect x="${bx}" y="${by}" width="${bigSide}" height="${bigSide}" rx="26"
       fill="none" stroke="${OK}" stroke-width="4" stroke-dasharray="14 11"/>
     ${arrow(bx + 6, by + 6, -g, -g)}
     ${arrow(bx + bigSide - 6, by + 6, g, -g)}
     ${arrow(bx + 6, by + bigSide - 6, -g, g)}
     ${arrow(bx + bigSide - 6, by + bigSide - 6, g, g)}
     <rect x="${cx - 200}" y="${by + bigSide + 34}" width="400" height="52" rx="26" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
     <text x="${cx}" y="${by + bigSide + 70}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${OK}">+฿${RATE} ต่อ ซม. ที่เกิน 10 ซม.</text>`,
    ["วัดจากด้านยาวสุดของชิ้นงาน · กรอกขนาดในช่องด้านล่างได้เลย", `ใหญ่กว่า ${MAX} ซม. ทักแชทให้แอดมินตีราคา`],
  );
}

const FILES = [
  { file: `size-10x10-${VER}.jpg`, svg: stdArt(), choice: STD_CHOICE },
  { file: `size-custom-${VER}.jpg`, svg: customArt(), choice: CUSTOM_CHOICE },
];
const bufs = {};
for (const f of FILES) {
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  bufs[f.file] = buf;
  writeFileSync(`${OUT}/${f.file}`, buf);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urls = {};
for (const f of FILES) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, bufs[f.file], { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urls[f.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.choice]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: "ขนาดมาตรฐาน 10×10 ซม. — สั่งใหญ่กว่านี้ได้ คิดเพิ่ม ซม.ละ ฿10",
  choices: [
    {
      name: STD_CHOICE,
      popular: true,
      desc: "ขนาดเริ่มต้นของร้าน รวมในราคาแล้ว · ไดคัทตามทรงได้",
      imageSrc: urls[STD_CHOICE],
    },
    {
      name: CUSTOM_CHOICE,
      desc: `ใหญ่กว่า 10 ซม. คิดเพิ่ม ซม.ละ ฿${RATE} จากด้านยาวสุด (รับได้ถึง ${MAX} ซม.) — กรอกขนาดในช่องด้านล่าง`,
      imageSrc: urls[CUSTOM_CHOICE],
    },
  ],
};

const sizeInput = {
  label: INPUT_LABEL,
  // ⚠️ ต้องมี choices: [] เสมอแม้เป็นช่องกรอก — โค้ดหลายที่เรียก opt.choices.map/[0] ตรง ๆ
  choices: [],
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE_GROUP, choices: [CUSTOM_CHOICE] },
  input: {
    kind: "number",
    unit: "ซม.",
    min: FREE,
    max: MAX,
    required: false,
    placeholder: String(FREE),
    hint: `${FREE} ซม. แรกรวมในราคาแล้ว — เกินจากนี้คิดเพิ่ม ซม. ละ ฿${RATE} (รับได้ถึง ${MAX} ซม.) · ใหญ่กว่านั้นทักแชทให้แอดมินตีราคา`,
  },
  inputFee: { perUnit: RATE, free: FREE },
};

// รันซ้ำได้: ตัดของเดิม (ทั้งกลุ่มขนาดและช่องกรอก) ทิ้งก่อนแล้ววางใหม่ที่หน้ากลุ่ม "ประเภท"
const cleaned = options.filter((o) => o.label !== SIZE_GROUP && o.label !== INPUT_LABEL);
const atType = cleaned.findIndex((o) => o.label === TYPE_GROUP);
if (atType < 0) { console.error(`ไม่เจอกลุ่ม "${TYPE_GROUP}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
cleaned.splice(atType, 0, sizeGroup, sizeInput);

data.options = cleaned;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options;
const gSize = got.find((o) => o.label === SIZE_GROUP);
const gInput = got.find((o) => o.label === INPUT_LABEL);
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [got.filter((o) => o.label === INPUT_LABEL).length === 1, "ช่องกรอกซ้ำ/หาย (คิดเงินซ้ำ)"],
  [gSize?.choices?.[0]?.name === STD_CHOICE && gSize?.choices?.[0]?.imageSrc === urls[STD_CHOICE], "การ์ดมาตรฐานไม่ตรง"],
  [gSize?.choices?.[1]?.name === CUSTOM_CHOICE && gSize?.choices?.[1]?.imageSrc === urls[CUSTOM_CHOICE], "การ์ดกำหนดขนาดเองไม่ตรง"],
  [gInput?.inputFee?.perUnit === RATE && gInput?.inputFee?.free === FREE, "ค่าบริการช่องกรอกไม่ถูก"],
  [gInput?.showWhen?.label === SIZE_GROUP && gInput?.showWhen?.choices?.[0] === CUSTOM_CHOICE, "showWhen ช่องกรอกไม่ถูก"],
  [gInput?.input?.max === MAX && gInput?.input?.required === false, "เพดาน/required ช่องกรอกไม่ถูก"],
  [Array.isArray(gInput?.choices), "ช่องกรอกขาด choices: [] (หน้าสินค้าจะ 500)"],
  [got.findIndex((o) => o.label === SIZE_GROUP) < got.findIndex((o) => o.label === TYPE_GROUP), "กลุ่มขนาดไม่ได้อยู่หน้ากลุ่มประเภท"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nตัวอย่างค่าบริการ (ต่อใบ):");
for (const v of [10, 12, 15, 20, 30]) console.log(`  ด้านยาวสุด ${String(v).padStart(2)} ซม.  →  +฿${Math.max(0, v - FREE) * RATE}`);
console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" (2 การ์ด+ภาพ) + ช่องกรอก "${INPUT_LABEL}" อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
