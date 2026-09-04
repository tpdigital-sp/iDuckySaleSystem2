#!/usr/bin/env node
/**
 * ภาพประกอบอีก 2 กลุ่มของ **กิ๊บติดผมอะคริลิค** (otheracrylicproducts5-1)
 * — กลุ่ม "ขนาด" ทำไปแล้วที่ scripts/hair-clip-size-option-art.mjs
 *
 *   node scripts/hair-clip-option-art.mjs            วาด/ครอปลง .cache/hair-clip/upload อย่างเดียว
 *   node scripts/hair-clip-option-art.mjs --write    + อัปโหลด storage + เขียน DB + อ่านกลับเทียบ
 *
 * 1. "กิ๊บ" (สีเงิน / สีทอง) — **ครอปจากรูปงานจริง** ที่อยู่ในแกลเลอรีสินค้าอยู่แล้ว
 *    (959b83_08b41c55d0fd4ed0b7b663169cf478d8 = ชาร์ตเทียบทอง/เงิน) หมุนกลับ 11° ให้กิ๊บนอนแนวนอน
 *    แล้วครอปทีละตัว · สีโลหะเป็นเรื่องที่ภาพถ่ายจริงบอกได้ดีกว่าภาพวาด
 *
 * 2. "ติดกิ๊บ" (ด้านซ้าย / ด้านขวา) = **ฝั่งหัวที่ใส่** (เจ้าของร้านยืนยัน 4 ก.ย. 69)
 *    → วาดหัวคน **มองจากด้านหลัง** เพื่อให้ซ้าย/ขวาในภาพ = ซ้าย/ขวาของคนใส่ตรง ๆ
 *      (ถ้าวาดหน้าตรง ซ้ายของคนใส่จะกลายเป็นขวาของคนดู = อ่านผิดกันแน่)
 *
 * ทั้งสองกลุ่มตั้ง display เป็น "cards" ด้วย — ปุ่ม pills ย่อรูปเหลือ 28px กลม ดูไม่ออกว่าเป็นอะไร
 * ส่วนการ์ดโชว์ 80px + คำอธิบาย (กลุ่มละ 2 ตัวเลือก ยังไม่ถึงเกณฑ์ทรงกระชับ 6 ตัว)
 *
 * ⚠️ ห้ามเปลี่ยน label กลุ่ม/ชื่อตัวเลือก · ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN แคช) แก้ภาพให้ขึ้น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "otheracrylicproducts5-1";
const VER = "v1";
const OUT = ".cache/hair-clip/upload";
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("hello", 420);

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

const frame = (body, tint = "#ffffff") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="${tint}" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const jpg = (svg) => sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

const files = [];
const push = (group, choice, name, buf, desc, ver = VER) => {
  const file = `${name}-${ver}.jpg`;
  const path = `${OUT}/${file}`;
  writeFileSync(path, buf);
  files.push({ group, choice, file, path, desc });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${group} / ${choice}`);
};

// ── 1. กลุ่ม "กิ๊บ" — ครอปจากชาร์ตทอง/เงินของจริง ───────────────────
// ต้นฉบับ wix เป็น 612×433 (ที่ลิงก์ /v1/fill/w_900 คือตัวอัปสเกล ไม่ได้ชัดกว่า) จึงดึงตัวต้นฉบับมาครอปเอง
const CHART_URL = "https://static.wixstatic.com/media/959b83_08b41c55d0fd4ed0b7b663169cf478d8~mv2.jpg";
const chartRot = await sharp(Buffer.from(await (await fetch(CHART_URL)).arrayBuffer()))
  .rotate(11, { background: "#ffffff" }) // ชาร์ตถ่ายเอียง — หมุนกลับให้กิ๊บนอนแนวนอน
  .toBuffer();

/** กล่องครอปวัดจากภาพหลังหมุน (683×542) — เลี่ยงตัวหนังสือ "ทอง"/"เงิน" และมุมขาวจากการหมุน */
const CLIP_COLORS = [
  { choice: "สีทอง", name: "clip-gold", box: { left: 56, top: 130, width: 560, height: 130 },
    title: "กิ๊บสีทอง", tint: "#fdf3dc", chip: "#e6bb6a", desc: "กิ๊บปากเป็ดโลหะ สีทอง" },
  { choice: "สีเงิน", name: "clip-silver", box: { left: 56, top: 296, width: 560, height: 130 },
    title: "กิ๊บสีเงิน", tint: "#eef1f5", chip: "#b7c0ca", desc: "กิ๊บปากเป็ดโลหะ สีเงิน" },
];

for (const c of CLIP_COLORS) {
  // แถบรูปยาว 800 px เอียง -10° (กรอบรวมยังไม่เกินขอบการ์ด) + พื้นการ์ดย้อมสีโลหะ
  // — ย่อเหลือ 80px แล้ว "ทั้งใบเป็นโทนทอง vs โทนเงิน" คือจุดต่างที่ยังอ่านออก
  const BW = 800;
  const band = await sharp(chartRot).extract(c.box).resize(BW).png().toBuffer();
  const bh = Math.round((BW * c.box.height) / c.box.width);
  const svg = frame(`
    <text x="${W / 2}" y="112" font-family="${TH}" font-size="46" font-weight="800" text-anchor="middle" fill="${INK}">${c.title}</text>
    <rect x="${W / 2 - 90}" y="150" width="180" height="18" rx="9" fill="${c.chip}"/>
    <g transform="rotate(-10 ${W / 2} 470)">
      <rect x="${(W - BW) / 2 - 7}" y="${470 - bh / 2 - 7}" width="${BW + 14}" height="${bh + 14}" rx="18" fill="#ffffff" opacity="0.75"/>
      <image href="data:image/png;base64,${band.toString("base64")}"
        x="${(W - BW) / 2}" y="${470 - bh / 2}" width="${BW}" height="${bh}"/>
    </g>
    <text x="${W / 2}" y="${H - 86}" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">รูปงานจริง · เลือกสีตัวกิ๊บได้ ราคาเท่ากัน</text>`, c.tint);
  push("กิ๊บ", c.choice, c.name, await jpg(svg), c.desc);
}

// ── 2. กลุ่ม "ติดกิ๊บ" — เป็ด iDucky ใส่กิ๊บฝั่งซ้าย/ขวา ─────────────
// v1 เคยวาดเป็นหัวคนมองจากด้านหลัง เจ้าของร้านสั่งเปลี่ยนเป็นตัวเป็ดแทน (4 ก.ย. 69) → ขึ้น v2
const GOLD = "#e6bb6a";
const GOLD_DK = "#b98c39";

/**
 * เป็ด iDucky ตัวเต็ม (iDUCKY_02) วาดที่ 620px เริ่มที่ y=208
 * ⚠️ หัวเป็ด **ไม่ได้อยู่กลางเฟรม** — ตัวมาสคอตเอียงขวา วัดจากภาพที่เรนเดอร์จริงได้
 *    ช่วงสีเหลืองที่ y=300–330 คือ x≈290–720 → กลางหัว x≈505 (ไม่ใช่ 450)
 *    ถ้าเปลี่ยนรูปมาสคอต/ขนาด ต้องวัดใหม่ ไม่งั้นกิ๊บจะลอยหลุดหัว
 */
const DUCK = await mascotDataUri("heart", 760);
const DUCK_S = 620;
const DUCK_X = (W - DUCK_S) / 2;
const DUCK_Y = 208;
const HEAD_CX = 505;   // กลางหัวเป็ดตามที่วัดจากภาพจริง
const HEAD_CY = 302;   // ระดับบนหัว ที่กิ๊บควรหนีบ
/** กิ๊บบนหัวเป็ด — ไม่ได้อิงสเกลจริง (เป็ดเป็นการ์ตูน) ยาวราวครึ่งหนึ่งของความกว้างหัว */
const CLIP_LEN = 200;

/** ชิ้นงาน 1 อัน (แถบอะคริลิค + หัวลายไดคัท + ตัวกิ๊บโลหะ) — mirror=true คือกลับด้าน */
const wornClip = (cx, cy, deg, mirror) => {
  const len = CLIP_LEN;
  const h = len / 3;
  const r = h / 2;
  const sh = h * 0.58;
  const body = `
    <!-- ตัวกิ๊บโลหะโผล่ใต้ชิ้นอะคริลิค -->
    <rect x="${-len / 2 + 8}" y="${sh / 2 - 2}" width="${len - 26}" height="${h * 0.32}" rx="${h * 0.16}"
      fill="${GOLD}" stroke="${GOLD_DK}" stroke-width="2.5"/>
    <!-- แถบอะคริลิค -->
    <rect x="${-len / 2 + r * 0.7}" y="${-sh / 2}" width="${len - r * 0.7}" height="${sh}" rx="${sh * 0.32}"
      fill="#bfe6f4" stroke="#5aa9c4" stroke-width="3.5"/>
    <!-- หัวลายไดคัท (ลายเป็ดตัวเล็กในวงกลม) -->
    <clipPath id="wc${mirror ? "R" : "L"}"><circle cx="${-len / 2 + r}" cy="0" r="${r - 2}"/></clipPath>
    <circle cx="${-len / 2 + r}" cy="0" r="${r}" fill="#ffffff" stroke="#5aa9c4" stroke-width="3.5"/>
    <image href="${MASCOT.uri}" x="${-len / 2 + r - r * 0.86}" y="${-r * 0.86}"
      width="${r * 1.72}" height="${r * 1.72}" preserveAspectRatio="xMidYMid meet" clip-path="url(#wc${mirror ? "R" : "L"})"/>
    <circle cx="${-len / 2 + r}" cy="0" r="${r}" fill="none" stroke="#5aa9c4" stroke-width="3.5"/>`;
  return `<g transform="translate(${cx} ${cy}) rotate(${deg})${mirror ? " scale(-1 1)" : ""}">${body}</g>`;
};

/** ป้ายฝั่ง + ลูกศรชี้เข้าหากิ๊บ — ตัวแยกหลักเวลาย่อเหลือ 80px */
const sideTag = (x, y, text, sign) => `
  <rect x="${x - 92}" y="${y - 40}" width="184" height="80" rx="40" fill="${OK}"/>
  <text x="${x}" y="${y + 17}" font-family="${TH}" font-size="48" font-weight="800" text-anchor="middle" fill="#ffffff">${text}</text>
  <path d="M ${x + sign * -92} ${y} l ${-sign * 34} 0" stroke="${OK}" stroke-width="9" stroke-linecap="round"/>`;

const SIDES = [
  { choice: "ด้านซ้าย", name: "side-left", tag: "ซ้าย", sign: -1, desc: "ติดตัวกิ๊บฝั่งซ้าย (มองจากด้านหน้า)" },
  { choice: "ด้านขวา", name: "side-right", tag: "ขวา", sign: 1, desc: "ติดตัวกิ๊บฝั่งขวา (มองจากด้านหน้า)" },
];

for (const s of SIDES) {
  const svg = frame(`
    <text x="${W / 2}" y="92" font-family="${TH}" font-size="44" font-weight="800" text-anchor="middle" fill="${INK}">ติดกิ๊บ${s.choice}</text>
    <ellipse cx="${W / 2}" cy="${H - 118}" rx="248" ry="34" fill="#e2e8f0" opacity="0.75"/>
    <image href="${DUCK.uri}" x="${DUCK_X}" y="${DUCK_Y}" width="${DUCK_S}" height="${DUCK_S}" preserveAspectRatio="xMidYMid meet"/>
    ${wornClip(HEAD_CX + s.sign * 112, HEAD_CY, s.sign * -12, s.sign > 0)}
    ${sideTag(W / 2 + s.sign * 316, 210, s.tag, s.sign)}
    <text x="${W / 2}" y="${H - 46}" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">ภาพมองจากด้านหน้า · เลือกฝั่งที่จะติดตัวกิ๊บ</text>`);
  push("ติดกิ๊บ", s.choice, s.name, await jpg(svg), s.desc, "v2");
}

// ── ตรวจ "ย่อ 80px แล้วยังแยกออกไหม" ────────────────────────────────
writeFileSync(`${OUT}/_thumbs-80-b.png`, await sharp({ create: { width: 80 * files.length, height: 80, channels: 3, background: "#fff" } })
  .composite(await Promise.all(files.map(async (f, i) => ({ input: await sharp(f.path).resize(80, 80).toBuffer(), left: i * 80, top: 0 }))))
  .png().toBuffer());
console.log(`🔍 ${OUT}/_thumbs-80-b.png`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด + เขียน DB ──────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (...m) => { console.error("✗", ...m); process.exit(1); };

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images")
    .upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) die("อัปโหลดพัง", key, error.message);
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}
if (files.some((f) => typeof f.url !== "string" || !f.url.startsWith("https://"))) die("มีใบที่ยังไม่ได้ url");

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die(readErr.message);
const data = row.data;

for (const g of ["กิ๊บ", "ติดกิ๊บ"]) {
  const grp = (data.options ?? []).find((o) => o.label === g);
  if (!grp) die(`ไม่เจอกลุ่ม "${g}"`);
  grp.display = "cards";
}
for (const f of files) {
  const c = data.options.find((o) => o.label === f.group).choices?.find((c) => c.name === f.choice);
  if (!c) die(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`);
  c.imageSrc = f.url;
  c.desc = f.desc;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr?.message);

// ── อ่านกลับเทียบรูปร่างของค่าจริง ──────────────────────────────────
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (backErr) die(backErr.message);
for (const f of files) {
  const grp = back.data.options.find((o) => o.label === f.group);
  if (grp?.display !== "cards") die("display ไม่ใช่ cards", f.group, grp?.display);
  const c = grp.choices.find((c) => c.name === f.choice);
  if (typeof c?.imageSrc !== "string" || !c.imageSrc.startsWith("https://") || c.imageSrc !== f.url)
    die("imageSrc อ่านกลับไม่ตรง", f.group, f.choice, c?.imageSrc);
  if (c.desc !== f.desc) die("desc อ่านกลับไม่ตรง", f.group, f.choice, c?.desc);
}
// งานรอบก่อน (กลุ่ม "ขนาด") ต้องไม่หายไปกับการเขียนรอบนี้
const size = back.data.options.find((o) => o.label === "ขนาด");
if (size?.display !== "cards" || size.choices.some((c) => !c.imageSrc)) die("กลุ่ม \"ขนาด\" ที่ทำไว้รอบก่อนหลุด");
if (!back.data.options.find((o) => o.label === "เพิ่มขนาด")?.showWhen?.choices?.includes("6 cm")) die("showWhen \"เพิ่มขนาด\" หลุด");
console.log(`✓ ตั้งภาพ+การ์ดครบ ${files.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
