#!/usr/bin/env node
/**
 * กลุ่ม "ขนาด" ของ **กิ๊บติดผมอะคริลิค** (otheracrylicproducts5-1 · /products/กิ๊บติดผมอะคริลิค)
 * แปลง dropdown → การ์ด (display "cards") + วาดภาพประกอบ 5 ใบ (2/3/4/5/6 ซม.)
 *
 *   node scripts/hair-clip-size-option-art.mjs           วาดลง .cache/hair-clip/upload อย่างเดียว
 *   node scripts/hair-clip-size-option-art.mjs --write   + อัปโหลด storage + เขียน DB + อ่านกลับเทียบ
 *
 * ทำไมภาพเป็นแบบนี้:
 *   ตัวสินค้าคือ "ชิ้นอะคริลิคไดคัท ติดบนกิ๊บปากเป็ดโลหะ" (รูปงานจริงในแกลเลอรี: แถบยาว + หัวลายที่ปลาย)
 *   → ทุกใบวาด **สเกลเดียวกัน** โดยตัวกิ๊บโลหะคงที่ทุกใบ ชิ้นอะคริลิคยาวขึ้นตามขนาดที่เลือก
 *     คนดูเทียบได้ว่า 2 ซม. คือหัวลายเล็ก ๆ ส่วน 6 ซม. คือแถบยาวคลุมทั้งตัวกิ๊บ
 *   → กล่องรูปบนการ์ดเป็นจัตุรัส 80px และไฟล์เป็น 900×900 (จัตุรัสเหมือนกัน) = ย่อทั้งใบ ไม่ถูกครอป
 *     จึงวาดชิ้นงานให้กินพื้นที่เต็มเฟรม ตัวหนังสือหัว/ท้ายอย่างละบรรทัด (ดู memory iducky-option-thumb-crop)
 *
 * ⚠️ ห้ามเปลี่ยน label กลุ่ม "ขนาด" และชื่อตัวเลือก "N cm" — กลุ่ม "เพิ่มขนาด" ผูก showWhen ไว้ที่ "6 cm"
 * ⚠️ ความยาวตัวกิ๊บโลหะในภาพเป็นภาพประกอบ (ไม่ได้พิมพ์ตัวเลขกำกับ) — ไม้บรรทัด/ลูกศรวัด "ชิ้นอะคริลิค" เท่านั้น
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "otheracrylicproducts5-1";
const GROUP = "ขนาด";
const VER = "v1";
const OUT = ".cache/hair-clip/upload";
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("hello", 460);

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
/** โลหะกิ๊บ — วาดเป็นสีทอง (ตัวเลือกกลุ่ม "กิ๊บ" มีทอง/เงิน ทองอ่านง่ายกว่าบนพื้นขาว) */
const GOLD = "#e6bb6a";
const GOLD_DK = "#b98c39";
const GOLD_LT = "#f7e2b4";

/** สเกลจริง 1 ซม. = 138 px ทุกใบ (6 ซม. = 828 px) */
const CM = 138;
/** ตัวกิ๊บปากเป็ดโลหะ — คงที่ทุกใบ ใช้เป็นหลักเทียบขนาด (ภาพประกอบ ไม่ได้กำกับตัวเลข) */
const CLIP_CM = 5.5;
const CX = 450;
/** ก้นชิ้นอะคริลิค = สันบนของกิ๊บ (อะคริลิคติดทับสันบน) */
const BASE = 452;

/** ทรงชิ้นอะคริลิค: หัวลายกลมที่ปลายซ้าย + แถบยาวต่อไปทางขวา สูงสุด 2 ซม. ตามงานจริง */
const headOf = (cm) => Math.min(cm * CM * 0.6, 2.0 * CM);

/** 5 ขนาดจาก DB — key ต้องตรงกับ choice.name เป๊ะ ๆ */
const SIZES = [
  { choice: "2 cm", cm: 2, file: "size-2cm", desc: "หัวลายเล็ก ๆ ติดคู่กันสองอันได้" },
  { choice: "3 cm", cm: 3, file: "size-3cm", desc: "ขนาดกำลังดี ใส่ได้ทุกวัน" },
  { choice: "4 cm", cm: 4, file: "size-4cm", desc: "ยอดนิยม เห็นลายชัดเต็มตา" },
  { choice: "5 cm", cm: 5, file: "size-5cm", desc: "แถบยาว คลุมตัวกิ๊บเกือบทั้งอัน" },
  { choice: "6 cm", cm: 6, file: "size-6cm", desc: "ใหญ่สุด · ต่อยาวได้อีก ซม.ละ ฿10" },
];

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

/** ลูกศรวัดแนวนอน + ป้ายกลางเส้น */
const dimH = (x1, x2, y, label) => {
  const lw = label.length * 14 + 22;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${SUB}" stroke-width="3"/>
    <rect x="${(x1 + x2) / 2 - lw / 2}" y="${y - 20}" width="${lw}" height="40" rx="9" fill="#ffffff" opacity="0.95"/>
    <text x="${(x1 + x2) / 2}" y="${y + 11}" font-family="${TH}" font-size="28" font-weight="800"
      text-anchor="middle" fill="${INK}">${label}</text>`;
};

/**
 * กิ๊บปากเป็ดโลหะ (ตามรูปที่ 4 ในแกลเลอรี: สันบนตรง ปากล่างมีซี่ฟัน หมุดสปริงกลางตัว)
 * วาดคงที่ทุกใบ = หลักเทียบขนาดของชิ้นอะคริลิค
 */
const metalClip = () => {
  const len = CLIP_CM * CM;
  const x0 = CX - len / 2;
  const x1 = CX + len / 2;
  const upTop = BASE;
  const upBot = BASE + 30;
  const loTop = BASE + 34;
  const loBot = BASE + 62;
  // ซี่ฟันใต้ปากล่าง — มีเฉพาะช่วงหน้า (ฝั่งปลายปาก) เหมือนกิ๊บปากเป็ดจริง
  let teeth = "";
  for (let x = x0 + 16; x < x0 + len * 0.72; x += 22) {
    teeth += `<path d="M ${x} ${loBot - 1} l 11 -12 l 11 12 Z" fill="${GOLD_DK}" opacity="0.5"/>`;
  }
  return `
    <!-- ปากล่าง -->
    <path d="M ${x0 + 14} ${loTop} L ${x1 - 26} ${loTop} Q ${x1} ${(loTop + loBot) / 2} ${x1 - 26} ${loBot}
             L ${x0 + 14} ${loBot} Q ${x0 - 2} ${(loTop + loBot) / 2} ${x0 + 14} ${loTop} Z"
      fill="${GOLD}" stroke="${GOLD_DK}" stroke-width="3"/>
    ${teeth}
    <!-- สันบน (แผ่นเรียบ ที่ติดชิ้นอะคริลิค) -->
    <path d="M ${x0 + 10} ${upTop} L ${x1 - 30} ${upTop} Q ${x1 + 4} ${(upTop + upBot) / 2} ${x1 - 30} ${upBot}
             L ${x0 + 10} ${upBot} Q ${x0 - 6} ${(upTop + upBot) / 2} ${x0 + 10} ${upTop} Z"
      fill="${GOLD_LT}" stroke="${GOLD_DK}" stroke-width="3"/>
    <line x1="${x0 + 26}" y1="${upTop + 11}" x2="${x1 - 62}" y2="${upTop + 11}" stroke="#ffffff" stroke-width="8"
      stroke-linecap="round" opacity="0.8"/>
    <!-- หมุดสปริง -->
    <circle cx="${x1 - 96}" cy="${upBot + 2}" r="12" fill="${GOLD}" stroke="${GOLD_DK}" stroke-width="3"/>
    <circle cx="${x1 - 96}" cy="${upBot + 2}" r="4" fill="${GOLD_DK}"/>`;
};

/**
 * ชิ้นอะคริลิคไดคัท — แถบยาวตามความยาวที่เลือก + หัวลายกลมที่ปลายซ้าย (ล้ำลงล่างนิดหน่อย)
 * สูงสุด 2 ซม. ตามงานจริง (ยาวขึ้นเรื่อย ๆ แต่ไม่สูงขึ้นหลังจาก 4 ซม.)
 */
const acrylic = (cm) => {
  const len = cm * CM;
  const x0 = CX - len / 2;
  const x1 = x0 + len;
  const headD = headOf(cm);
  const r = headD / 2;
  const cy = BASE - r; // ก้นหัวลายแตะสันกิ๊บพอดี · แถบใช้แกนกลางเดียวกับหัว
  const sh = headD * 0.58; // ความสูงแถบ
  const sTop = cy - sh / 2;
  const sBot = cy + sh / 2;
  const sx = x0 + headD * 0.34; // แถบเริ่มหลังหัวลายนิดหน่อย (ไดคัทเป็นชิ้นเดียวกัน)
  // ขอบบนของแถบหยักโค้งเบา ๆ ให้อ่านออกว่า "ไดคัทตามลาย" ไม่ใช่สี่เหลี่ยม
  const xe = x1 - sh * 0.32; // ปลายแถบมน — จุดขวาสุดของส่วนโค้งยังเท่ากับ x1 พอดี
  const bumps = Math.max(2, Math.round((xe - sx) / (sh * 0.9)));
  const bw = (xe - sx) / bumps;
  let top = `M ${sx.toFixed(1)} ${sTop.toFixed(1)}`;
  for (let i = 0; i < bumps; i++) {
    top += ` q ${(bw / 2).toFixed(1)} ${(-sh * 0.16).toFixed(1)} ${bw.toFixed(1)} 0`;
  }
  const strip = `${top} Q ${x1.toFixed(1)} ${cy.toFixed(1)} ${xe.toFixed(1)} ${sBot.toFixed(1)} L ${sx.toFixed(1)} ${sBot.toFixed(1)} Z`;
  const aw = r * 1.55;
  const ah = aw / MASCOT.ratio;
  const inner = ah > r * 1.66 ? { h: r * 1.66, w: r * 1.66 * MASCOT.ratio } : { h: ah, w: aw };
  return `
    <g>
      <!-- เงาใต้ชิ้นงาน -->
      <g transform="translate(5 7)" opacity="0.07">
        <path d="${strip}" fill="#0f172a"/><circle cx="${x0 + r}" cy="${cy}" r="${r}" fill="#0f172a"/>
      </g>
      <!-- แถบลาย -->
      <path d="${strip}" fill="#bfe6f4" stroke="#5aa9c4" stroke-width="4" stroke-linejoin="round"/>
      <path d="M ${x0 + len * 0.52} ${cy + sh * 0.16} q ${len * 0.07} ${-sh * 0.28} ${len * 0.14} 0"
        fill="none" stroke="#7fc6de" stroke-width="5" stroke-linecap="round"/>
      <path d="M ${x0 + len * 0.74} ${cy + sh * 0.2} q ${len * 0.07} ${-sh * 0.28} ${len * 0.14} 0"
        fill="none" stroke="#7fc6de" stroke-width="5" stroke-linecap="round"/>
      <!-- หัวลายไดคัท (ทับรอยต่อแถบ = ไดคัทชิ้นเดียวกัน) · ลายถูกคลิปด้วยวงกลม ไม่ให้ล้นขอบไดคัท -->
      <clipPath id="head${cm}"><circle cx="${x0 + r}" cy="${cy}" r="${r - 2}"/></clipPath>
      <circle cx="${x0 + r}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#5aa9c4" stroke-width="4"/>
      <image href="${MASCOT.uri}" x="${x0 + r - inner.w / 2}" y="${cy - inner.h / 2}"
        width="${inner.w}" height="${inner.h}" preserveAspectRatio="xMidYMid meet" clip-path="url(#head${cm})"/>
      <circle cx="${x0 + r}" cy="${cy}" r="${r}" fill="none" stroke="#5aa9c4" stroke-width="4"/>
      <!-- ไฮไลต์ผิวอะคริลิคเงา -->
      <path d="M ${x0 + len * 0.46} ${sTop + sh * 0.26} L ${x1 - len * 0.06} ${sTop + sh * 0.24}"
        fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity="0.7"/>
    </g>`;
};

/** ไม้บรรทัด 0–6 ซม. สเกลเดียวกับชิ้นงาน + ไฮไลต์ช่วง 0→ขนาดที่เลือก */
const ruler = (y, selCm) => {
  const x0 = CX - (6 * CM) / 2;
  let ticks = "";
  for (let mm = 0; mm <= 60; mm++) {
    const x = x0 + (mm / 10) * CM;
    const big = mm % 10 === 0;
    const mid = mm % 5 === 0;
    ticks += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + (big ? 26 : mid ? 18 : 10)}" stroke="${big ? INK : "#94a3b8"}" stroke-width="${big ? 3 : 1.5}"/>`;
    if (big) ticks += `<text x="${x}" y="${y + 54}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${mm / 10}</text>`;
  }
  const selX = x0 + selCm * CM;
  // ไม่กำกับหน่วยท้ายไม้บรรทัด — ชนขอบเฟรม และหัวเรื่อง/ลูกศรวัดบอก "ซม." อยู่แล้ว
  return `
    <rect x="${x0}" y="${y - 14}" width="${selCm * CM}" height="14" rx="5" fill="${OK}" opacity="0.28"/>
    <line x1="${x0}" y1="${y}" x2="${x0 + 6 * CM}" y2="${y}" stroke="${INK}" stroke-width="3"/>
    ${ticks}
    <line x1="${selX}" y1="${y - 36}" x2="${selX}" y2="${y + 26}" stroke="${OK}" stroke-width="4"/>
    <circle cx="${selX}" cy="${y - 36}" r="8" fill="${OK}"/>`;
};

function sizeArt(s) {
  const len = s.cm * CM;
  const body = `
    <text x="${CX}" y="80" font-family="${TH}" font-size="42" font-weight="800" text-anchor="middle" fill="${INK}">ขนาด ${s.cm} ซม.</text>
    ${dimH(CX - len / 2, CX + len / 2, BASE - headOf(s.cm) - 54, `${s.cm} ซม.`)}
    ${metalClip()}
    ${acrylic(s.cm)}
    <text x="${CX}" y="606" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">วัดด้านที่ยาวที่สุดของชิ้นอะคริลิค · ทุกใบสเกลเดียวกัน</text>
    ${ruler(694, s.cm)}
    <text x="${CX}" y="840" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ไดคัทตามลาย · อะคริลิคหนา 2 มม. พิมพ์ UV · กิ๊บโลหะทอง/เงิน</text>`;
  return frame(body);
}

// ── วาด 5 ใบ ────────────────────────────────────────────────────────
for (const s of SIZES) {
  const buf = await sharp(Buffer.from(sizeArt(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  s.file = `${s.file}-${VER}.jpg`;
  s.path = `${OUT}/${s.file}`;
  writeFileSync(s.path, buf);
  console.log(`🖼  ${s.file}  ${Math.round(buf.length / 1024)} KB — ${s.choice}`);
}

// ตรวจ "ย่อแล้วยังแยกออกไหม" — กล่องบนการ์ดคือ 80px
const strip = await sharp({ create: { width: 80 * SIZES.length, height: 80, channels: 3, background: "#fff" } })
  .composite(await Promise.all(SIZES.map(async (s, i) => ({
    input: await sharp(s.path).resize(80, 80).toBuffer(), left: i * 80, top: 0,
  }))))
  .png().toBuffer();
writeFileSync(`${OUT}/_thumbs-80.png`, strip);
console.log(`🔍 ${OUT}/_thumbs-80.png — เรียงภาพย่อ 80px ทั้ง 5 ใบไว้เทียบกัน`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด + เขียน DB ──────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (...m) => { console.error("✗", ...m); process.exit(1); };

for (const s of SIZES) {
  const key = `products/${PRODUCT_ID}/${s.file}`;
  const { error } = await sb.storage.from("product-images")
    .upload(key, readFileSync(s.path), { contentType: "image/jpeg", upsert: true });
  if (error) die("อัปโหลดพัง", key, error.message);
  s.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", s.url);
}
// ยามกัน "เขียน url ลงสำเนา" (memory ข้อ 9) — ต้องมี url ครบทุกใบก่อนแตะ DB
if (SIZES.some((s) => typeof s.url !== "string" || !s.url.startsWith("https://"))) die("มีใบที่ยังไม่ได้ url");

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die(readErr.message);
const data = row.data;

const grp = (data.options ?? []).find((o) => o.label === GROUP);
if (!grp) die(`ไม่เจอกลุ่ม "${GROUP}"`);
grp.display = "cards";
for (const s of SIZES) {
  const c = grp.choices?.find((c) => c.name === s.choice);
  if (!c) die(`ไม่เจอตัวเลือก "${s.choice}"`);
  c.imageSrc = s.url;
  c.desc = s.desc;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr?.message);

// ── อ่านกลับเทียบ "รูปร่างของค่าจริง" ไม่ใช่แค่เท่ากับตัวแปรฝั่งเรา ──
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (backErr) die(backErr.message);
const bg = back.data.options.find((o) => o.label === GROUP);
if (bg?.display !== "cards") die("display ไม่ใช่ cards", bg?.display);
for (const s of SIZES) {
  const c = bg.choices.find((c) => c.name === s.choice);
  if (typeof c?.imageSrc !== "string" || !c.imageSrc.startsWith("https://") || c.imageSrc !== s.url)
    die("imageSrc อ่านกลับไม่ตรง", s.choice, c?.imageSrc);
  if (c.desc !== s.desc) die("desc อ่านกลับไม่ตรง", s.choice, c?.desc);
}
// กลุ่ม "เพิ่มขนาด" ยังต้องผูก showWhen กับ "6 cm" เหมือนเดิม
const addOn = back.data.options.find((o) => o.label === "เพิ่มขนาด");
if (!addOn?.showWhen?.choices?.includes("6 cm")) die("showWhen ของกลุ่ม \"เพิ่มขนาด\" หลุด");
console.log(`✓ กลุ่ม "${GROUP}" เป็นการ์ดแล้ว ครบ ${SIZES.length} ใบ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
