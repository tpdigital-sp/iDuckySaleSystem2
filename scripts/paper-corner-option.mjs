#!/usr/bin/env node
/**
 * เพิ่มกลุ่มตัวเลือก "มุม" (มุมมน / มุมแหลม) ให้งานกระดาษ 5 ตัว   [ผู้ใช้สั่ง 9 ก.ย. 69]
 *   กระดาษเนื้อพิเศษ · กระดาษเคลือบฟอยล์ · โฟโต้การ์ด · กระดาษอาร์ตมัน PET · โปสการ์ด
 *
 *   node scripts/paper-corner-option.mjs                 # ดูแผน + วาดภาพลง scripts/out/paper-corner (ไม่เขียน DB)
 *   node scripts/paper-corner-option.mjs --write         # อัปโหลดภาพ + เขียน + อ่านกลับเทียบ
 *   node scripts/paper-corner-option.mjs --write postcard-th   # เฉพาะบางตัว
 *
 * ภาพประจำตัวเลือกวาดใหม่ (การ์ดกระดาษใบเดียวกันเป๊ะ ต่างกันแค่มุม + วงซูมมุม) เก็บชุดกลางที่
 *   product-images/products/preset-corner/corner-rounded-v1.jpg · corner-sharp-v1.jpg  ใช้ร่วมทั้ง 5 ตัว
 *
 * ตัวเลือกนี้ราคาเท่ากัน (+฿0) ไม่แตะตารางราคา/กฎ/เรท — แค่แทรกกลุ่มใหม่เข้าชุด (section) ที่เกี่ยวกับการตัด/ขนาด
 * ตัวที่มี "ไดคัทตามทรง / ไม่ตัด" ให้โผล่เฉพาะตอนตัดตามขนาด (ชิ้นงานไดคัทตามทรงไม่มีมุมให้เลือก)
 * รันซ้ำได้: มีกลุ่ม "มุม" อยู่แล้ว = เขียนทับกลุ่มเดิมตรงตำแหน่งเดิม
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";

const WRITE = process.argv.includes("--write");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const GROUP_LABEL = "มุม";
const V = "v1";
const STORAGE_DIR = "products/preset-corner";
const OUT_DIR = new URL("./out/paper-corner/", import.meta.url);

/** แผนต่อสินค้า: ชื่อที่คาด (กันเขียนผิดตัว) · แทรกหลังกลุ่มไหน · ชุด · เงื่อนไขโชว์ */
const PLANS = {
  "texture-paper": {
    name: "กระดาษเนื้อพิเศษ",
    after: "ขนาดตัด (สูง)",
    section: "2. การตัด + ขนาด",
    showWhen: { label: "การตัด", choices: ["ตัดตามขนาด"] },
  },
  "paper-foil": {
    name: "กระดาษเคลือบฟอยล์",
    after: "ขนาดตัด (สูง)",
    section: "2. การตัด + ขนาด",
    showWhen: { label: "การตัด", choices: ["ตัดตามขนาด"] },
  },
  "photocard-digital": {
    name: "โฟโต้การ์ด",
    after: "ขนาดตัด",
    section: "1. ขนาด",
  },
  "paper-art-pet": {
    name: "กระดาษอาร์ตมัน PET",
    after: "ขนาดตัด (สูง)",
    section: "2. ขนาด",
    showWhen: { label: "เรทราคา", choices: ["ตัดตามขนาด"] }, // เงื่อนไขเดียวกับกลุ่ม "ขนาดตัด" ของตัวนี้
  },
  "postcard-th": {
    name: "โปสการ์ด",
    after: "แนวโปสการ์ด",
    section: "2. ขนาด + แนววาง + จำนวนด้าน",
  },
};

const CHOICES = [
  { name: "มุมมน", file: `corner-rounded-${V}.jpg`, r: 30, desc: "ตัดมุมโค้งมน ขอบไม่สะดุดมือ · ราคาเท่ากัน" },
  { name: "มุมแหลม", file: `corner-sharp-${V}.jpg`, r: 0, desc: "ตัดมุมฉาก 90° ขอบตรงคม ได้พื้นที่ลายเต็มมุม · ราคาเท่ากัน" },
];

/* ── วาดภาพ ─────────────────────────────────────────────────────────
 * การ์ดกระดาษแนวตั้ง (สัดส่วนโฟโต้การ์ด 5.5 × 8.5) ใบเดียวกันเป๊ะทั้งสองภาพ ต่างกันแค่ "มุม"
 * + วงซูมมุมขวาบนขยายให้เทียบชัดตอนภาพย่อ · ไม่มีมุมลอกแบบสติ๊กเกอร์ (นี่คือกระดาษ)
 */
const S = 900;
const BG = "#eef3f7";
const INK = "#33454e";
const { uri: duck } = await mascotDataUri("heart", 420);

const rr = (x, y, w, h, r) =>
  r <= 0
    ? `M${x} ${y}h${w}v${h}h${-w}z`
    : `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

const artwork = (x, y, w, h) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sky)"/>
  <circle cx="${x + w * 0.25}" cy="${y + h * 0.16}" r="${w * 0.13}" fill="#ffffff" opacity=".5"/>
  <path d="M${x} ${y + h * 0.5} L${x + w * 0.3} ${y + h * 0.3} L${x + w * 0.6} ${y + h * 0.5} Z" fill="#ffffff" opacity=".7"/>
  <path d="M${x + w * 0.45} ${y + h * 0.52} L${x + w * 0.78} ${y + h * 0.26} L${x + w} ${y + h * 0.52} Z" fill="#ffffff" opacity=".62"/>
  <path d="M${x} ${y + h * 0.62} Q${x + w * 0.35} ${y + h * 0.5} ${x + w * 0.65} ${y + h * 0.64} T${x + w} ${y + h * 0.6} V${y + h} H${x} Z" fill="#ffffff" opacity=".85"/>
  <image href="${duck}" x="${x + w * 0.12}" y="${y + h * 0.3}" width="${w * 0.76}" height="${h * 0.62}" preserveAspectRatio="xMidYMid meet"/>`;

const cornerArt = (r) => {
  const CW = 420; // การ์ด 5.5 ซม.
  const CH = Math.round((CW * 8.5) / 5.5);
  const CX = (S - CW) / 2 - 40;
  const CY = (S - CH) / 2 + 50;
  const [MX, MY] = [CX + CW / 2, CY + CH / 2];
  const TILT = -5;
  const rot = (x, y) => {
    const a = (TILT * Math.PI) / 180;
    const [dx, dy] = [x - MX, y - MY];
    return [MX + dx * Math.cos(a) - dy * Math.sin(a), MY + dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const edge = rr(CX, CY, CW, CH, r);
  const card = `
    <g transform="rotate(${TILT} ${MX} ${MY})">
      <g clip-path="url(#cardClip)">
        <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" fill="#ffffff"/>
        ${artwork(CX, CY, CW, CH)}
      </g>
      <path d="${edge}" fill="none" stroke="#93b0be" stroke-width="2.5" opacity=".6"/>
    </g>`;

  const [ZPX, ZPY] = rot(CX + CW, CY);
  const Z = 3.6;
  const [BX, BY, BR] = [690, 170, 122];
  const dx = ZPX - BX;
  const dy = ZPY - BY;
  const len = Math.hypot(dx, dy);
  const [ux, uy] = [dx / len, dy / len];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe7f6"/><stop offset="1" stop-color="#7fcbe8"/>
    </linearGradient>
    <clipPath id="cardClip"><path d="${edge}"/></clipPath>
    <clipPath id="bubble"><circle cx="${BX}" cy="${BY}" r="${BR}"/></clipPath>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#3d5866" flood-opacity=".22"/>
    </filter>
  </defs>
  <rect width="${S}" height="${S}" fill="${BG}"/>
  <ellipse cx="${MX}" cy="${CY + CH + 44}" rx="${CW * 0.5}" ry="24" fill="#c8d6de" opacity=".45"/>
  <g filter="url(#sh)">${card}</g>
  <circle cx="${ZPX.toFixed(1)}" cy="${ZPY.toFixed(1)}" r="28" fill="none" stroke="${INK}" stroke-width="3" opacity=".35"/>
  <line x1="${(ZPX - ux * 28).toFixed(1)}" y1="${(ZPY - uy * 28).toFixed(1)}" x2="${(BX + ux * BR).toFixed(1)}" y2="${(BY + uy * BR).toFixed(1)}" stroke="${INK}" stroke-width="3" opacity=".3" stroke-dasharray="8 8"/>
  <circle cx="${BX}" cy="${BY}" r="${BR}" fill="#ffffff"/>
  <g clip-path="url(#bubble)">
    <rect x="${BX - BR}" y="${BY - BR}" width="${BR * 2}" height="${BR * 2}" fill="${BG}"/>
    <g transform="translate(${BX} ${BY}) scale(${Z}) translate(${-ZPX} ${-ZPY})">${card}</g>
  </g>
  <circle cx="${BX}" cy="${BY}" r="${BR}" fill="none" stroke="#ffffff" stroke-width="12"/>
  <circle cx="${BX}" cy="${BY}" r="${BR + 6}" fill="none" stroke="${INK}" stroke-width="3" opacity=".35"/>
</svg>`;
};

mkdirSync(OUT_DIR, { recursive: true });
for (const c of CHOICES) {
  c.buf = await sharp(Buffer.from(cornerArt(c.r))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(new URL(c.file, OUT_DIR), c.buf);
  console.log(`🖼  ${c.name} → ${c.file} (${(c.buf.length / 1024).toFixed(0)} KB)`);
}

/* ── DB ─────────────────────────────────────────────────────────── */
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const ids = Object.keys(PLANS).filter((id) => !ONLY.length || ONLY.includes(id));
const bad = ONLY.filter((id) => !PLANS[id]);
if (bad.length) die(`ไม่มีแผนของ: ${bad.join(", ")}`);

// อัปโหลดภาพชุดกลาง (ครั้งเดียว ใช้ทุกตัว)
for (const c of CHOICES) {
  const key = `${STORAGE_DIR}/${c.file}`;
  c.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  if (!WRITE) continue;
  const { error } = await sb.storage.from("product-images").upload(key, c.buf, { contentType: "image/jpeg", upsert: true });
  if (error) die(`อัปโหลด ${key} ไม่ได้: ${error.message}`);
  const head = await fetch(c.url, { method: "HEAD" });
  if (!head.ok) die(`อัปแล้วแต่เปิดไม่ได้ ${c.url} (${head.status})`);
  console.log(`☁️  ${c.url}`);
}
if (CHOICES.some((c) => typeof c.url !== "string" || !c.url.startsWith("https://"))) die("url ภาพไม่ครบ");

const buildGroup = (plan) => ({
  label: GROUP_LABEL,
  display: "cards",
  section: plan.section,
  ...(plan.showWhen ? { showWhen: plan.showWhen } : {}),
  choices: CHOICES.map((c) => ({ name: c.name, extra: 0, imageSrc: c.url, desc: c.desc })),
});

const sameGroup = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let written = 0;
for (const id of ids) {
  const plan = PLANS[id];
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) die(`อ่าน ${id} ไม่ได้: ${error.message}`);
  if (row.name !== plan.name) die(`${id}: ชื่อไม่ตรงที่คาด ("${row.name}") — หยุดกันเขียนทับผิดตัว`);

  const d = row.data;
  const options = [...(d.options ?? [])];
  const group = buildGroup(plan);

  // ยามก่อนแทรก: กลุ่มอ้างอิงต้องมี 1 กลุ่มพอดี · กลุ่มชุดเดียวกันต้องอยู่ติดกันอยู่แล้ว
  const afterIdx = options.map((o, i) => (o.label === plan.after ? i : -1)).filter((i) => i >= 0);
  if (afterIdx.length !== 1) die(`${id}: กลุ่ม "${plan.after}" มี ${afterIdx.length} กลุ่ม (ต้อง 1)`);
  if (options[afterIdx[0]].section !== plan.section)
    die(`${id}: กลุ่ม "${plan.after}" อยู่ชุด "${options[afterIdx[0]].section}" ไม่ใช่ "${plan.section}"`);
  if (plan.showWhen && !options.some((o) => o.label === plan.showWhen.label) && plan.showWhen.label !== "เรทราคา")
    die(`${id}: showWhen อ้างกลุ่ม "${plan.showWhen.label}" ที่ไม่มี`);
  if (plan.showWhen?.label === "เรทราคา") {
    const rateLabels = (d.priceRates ?? []).map((r) => r.label);
    const miss = plan.showWhen.choices.filter((c) => !rateLabels.includes(c));
    if (miss.length) die(`${id}: showWhen อ้างเรท ${miss.join(", ")} ที่ไม่มี (มี: ${rateLabels.join(" | ")})`);
  }

  const existing = options.map((o, i) => (o.label === GROUP_LABEL ? i : -1)).filter((i) => i >= 0);
  if (existing.length > 1) die(`${id}: มีกลุ่ม "${GROUP_LABEL}" ${existing.length} กลุ่ม — ไปดูก่อน`);
  let next;
  if (existing.length === 1) {
    if (sameGroup(options[existing[0]], group)) { console.log(`= ${id} (${row.name}): กลุ่ม "${GROUP_LABEL}" ตรงอยู่แล้ว ข้าม`); continue; }
    next = options.map((o, i) => (i === existing[0] ? group : o));
    console.log(`~ ${id} (${row.name}): เขียนทับกลุ่ม "${GROUP_LABEL}" ตำแหน่งที่ ${existing[0] + 1}`);
  } else {
    next = [...options.slice(0, afterIdx[0] + 1), group, ...options.slice(afterIdx[0] + 1)];
    console.log(`+ ${id} (${row.name}): แทรก "${GROUP_LABEL}" หลัง "${plan.after}" [${plan.section}]${plan.showWhen ? ` โชว์เมื่อ ${plan.showWhen.label} = ${plan.showWhen.choices.join("/")}` : ""}`);
  }
  console.log(`   ลำดับใหม่: ${next.map((o) => (o.label === GROUP_LABEL ? `【${o.label}】` : o.label)).join(" › ")}`);
  if (!WRITE) continue;

  const savedAt = new Date().toISOString();
  const data = { ...d, options: next, savedAt };
  const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", id).select("data");
  if (updErr) die(`${id}: เขียนไม่ได้: ${updErr.message}`);
  if (!upd?.length) die(`${id}: update โดน 0 แถว`);

  // อ่านกลับ เทียบรูปร่างค่าจริง
  const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", id).single();
  if (backErr) die(`${id}: อ่านกลับไม่ได้: ${backErr.message}`);
  const bo = back.data.options ?? [];
  const bi = bo.findIndex((o) => o.label === GROUP_LABEL);
  const want = next.findIndex((o) => o.label === GROUP_LABEL);
  if (bi !== want) die(`${id}: อ่านกลับ กลุ่ม "${GROUP_LABEL}" อยู่ตำแหน่ง ${bi} ไม่ใช่ ${want}`);
  const bg = bo[bi];
  if (bg.section !== plan.section || bg.display !== "cards") die(`${id}: อ่านกลับ section/display ไม่ตรง`);
  if (bg.choices.length !== 2) die(`${id}: อ่านกลับ choices ${bg.choices.length} ตัว`);
  for (const [k, c] of CHOICES.entries()) {
    const b = bg.choices[k];
    if (b.name !== c.name || typeof b.imageSrc !== "string" || !b.imageSrc.startsWith("https://") || b.imageSrc !== c.url)
      die(`${id}: อ่านกลับตัวเลือก "${c.name}" ไม่ตรง: ${JSON.stringify(b)}`);
  }
  if (back.data.savedAt !== savedAt) die(`${id}: savedAt อ่านกลับไม่ตรง`);
  if (bo.length !== options.length + (existing.length ? 0 : 1)) die(`${id}: จำนวนกลุ่มอ่านกลับผิด`);
  written++;
  console.log(`   ✓ เขียนแล้ว อ่านกลับตรง (${bo.length} กลุ่ม)`);
}

console.log(WRITE ? `\nเสร็จ: เขียน ${written}/${ids.length} ตัว` : `\n(dry-run — ใส่ --write เพื่อเขียนจริง · ภาพตัวอย่างอยู่ที่ scripts/out/paper-corner/)`);
