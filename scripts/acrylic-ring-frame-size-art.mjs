#!/usr/bin/env node
/**
 * ภาพประจำ "ขนาดด้านยาวที่สุด" ของ Acrylic Ring Frame — id `acrylic-ring-frame`
 * แยกไฟล์จาก scripts/acrylic-ring-frame-option-art.mjs (นั่นทำกลุ่มอื่นครบแล้ว)
 *
 *   node scripts/acrylic-ring-frame-size-art.mjs           (วาดลง .cache/acrylic-ring-frame/size ดูก่อน)
 *   node scripts/acrylic-ring-frame-size-art.mjs --write   (+ อัปโหลด + เขียน imageSrc รายตัว + อ่านกลับเทียบ)
 *
 * เดิมทั้ง 16 ตัวเลือกใช้ภาพ "วิธีวัด" ใบเดียวกัน — เจ้าของร้านสั่ง (4 ก.ย. 69) ให้มีภาพตัวอย่าง
 * ของขนาดจริง ๆ ทีละใบ · ทุกใบจึงวาด **สเกลเดียวกัน** (1 ซม. = 82 px) บนพื้นเดียวกัน:
 *   • ไม้บรรทัดเซนติเมตรด้านซ้าย (ตำแหน่งคงที่ทุกใบ) — เลื่อนเทียบใบต่อใบแล้วเห็นว่าโตขึ้นจริง
 *   • เงาประ = ขนาดใหญ่สุด 6.5 ซม. ค้างไว้ทุกใบ ให้เทียบว่าใบนี้เต็มกรอบแค่ไหน
 *   • ป้ายตัวเลขคร่อมกลางชิ้นงาน — รูปย่อ 44 px ข้างเมนูเลื่อนอ่านได้แค่ของใหญ่สุดในภาพ
 *   • มุมล่างมีผังย่อ "วัดด้านยาวสุด ไม่วัดแนวทแยง" (ตาม terms) แทนภาพวิธีวัดใบเดิมที่ถูกแทนที่
 *
 * ⚠️ ชิ้นงานเป็นงานไดคัทตามแบบลูกค้า — ทรงในภาพเป็นทรงตัวอย่าง วาด "ด้านยาวที่สุด" เป็นแนวตั้ง
 *    กว้าง = 0.8 × ด้านยาวสุด (สัดส่วนกลาง ๆ ตามรูปงานจริงในแกลเลอรี)
 * ⚠️ ชื่อตัวเลือก ("5.8 cm") ไม่ใช่คีย์ตารางราคา (driverLabels: []) แต่ห้ามแก้อยู่ดี — custom/showWhen อ้างชื่อกลุ่ม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "acrylic-ring-frame";
const GROUP = "ขนาดด้านยาวที่สุด";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/size`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลร่วมทุกใบ — เปลี่ยนตรงนี้ที่เดียวแล้วทุกใบขยับพร้อมกัน */
const CM = 82; // px ต่อ 1 ซม.
const MAXCM = 6.5; // ขนาดใหญ่สุดในกลุ่ม = เงาประ
const BASE = 782; // เส้นฐาน (0 ซม.) ชิ้นงานทุกใบยืนบนเส้นนี้
const CX = 400; // กลางชิ้นงาน — เยื้องซ้าย เว้นมุมขวาล่างให้ผังย่อ "วิธีวัด"
const RULER = 120; // แกนไม้บรรทัด

const sizes = Array.from({ length: 16 }, (_, i) => Math.round((5 + i * 0.1) * 10) / 10);
/** ชื่อตัวเลือกใน DB เขียนแบบตัดศูนย์ท้าย ("5 cm" ไม่ใช่ "5.0 cm") */
const nameOf = (cm) => `${cm} cm`;
const fileOf = (cm) => `size-${String(cm).replace(".", "-")}-${VER}.jpg`;

const star = (cx, cy, r, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.44 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
};

/** ไม้บรรทัดแนวตั้ง 0–7 ซม. — ตำแหน่งเดียวกันทุกใบ คือหลักฐานว่าใบไหนใหญ่กว่า */
function ruler() {
  let out = `<line x1="${RULER}" y1="${BASE}" x2="${RULER}" y2="${BASE - 7 * CM}" stroke="#cbd5e1" stroke-width="4"/>`;
  for (let t = 0; t <= 14; t++) {
    const cm = t / 2;
    const y = BASE - cm * CM;
    const long = t % 2 === 0;
    out += `<line x1="${RULER}" y1="${y}" x2="${RULER + (long ? 26 : 14)}" y2="${y}" stroke="#cbd5e1" stroke-width="${long ? 4 : 3}"/>`;
    if (long) out += `<text x="${RULER - 14}" y="${y + 9}" font-family="${TH}" font-size="24" font-weight="600" text-anchor="end" fill="#94a3b8">${cm}</text>`;
  }
  return out + `<text x="${RULER - 14}" y="${BASE - 7 * CM - 22}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="end" fill="#94a3b8">ซม.</text>`;
}

/** ผังย่อมุมขวาล่าง — ย้ำว่าวัดด้านยาวสุด ไม่ใช่แนวทแยง (ข้อความเดียวกับ terms) */
function ruleInset() {
  const x0 = 628, y0 = 586, bw = 244, bh = 250;
  const x = x0 + 24, y = y0 + 58, w = 86, h = 140;
  const ax = x + w + 26;
  return `
    <rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" rx="20" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
    <text x="${x0 + 18}" y="${y0 + 36}" font-family="${TH}" font-size="21" font-weight="700" fill="${SUB}">วิธีวัด</text>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#dbeafe" stroke="#93c5fd" stroke-width="2.5"/>
    <line x1="${ax}" y1="${y}" x2="${ax}" y2="${y + h}" stroke="${OK}" stroke-width="4"/>
    <line x1="${ax - 10}" y1="${y}" x2="${ax + 10}" y2="${y}" stroke="${OK}" stroke-width="4"/>
    <line x1="${ax - 10}" y1="${y + h}" x2="${ax + 10}" y2="${y + h}" stroke="${OK}" stroke-width="4"/>
    <text x="${ax + 20}" y="${y + h / 2 + 8}" font-family="${TH}" font-size="21" font-weight="700" fill="${OK}">ยาวสุด</text>
    <line x1="${x + 10}" y1="${y + h - 10}" x2="${x + w - 10}" y2="${y + 10}" stroke="#ef4444" stroke-width="4" stroke-dasharray="10 8"/>
    <circle cx="${x + w - 14}" cy="${y + 18}" r="20" fill="#fee2e2" stroke="#ef4444" stroke-width="4"/>
    <path d="M ${x + w - 23} ${y + 9} l 18 18 M ${x + w - 5} ${y + 9} l -18 18" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"/>
    <text x="${x0 + bw / 2}" y="${y0 + bh - 16}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ไม่วัดแนวทแยง</text>`;
}

/** ชิ้นงานหนึ่งขนาด — ด้านยาวสุดเป็นแนวตั้ง กว้าง 0.8 เท่า ยืนบนเส้นฐาน */
function art(cm) {
  const h = cm * CM;
  const w = h * 0.8;
  const y = BASE - h;
  const x = CX - w / 2;
  const r = w * 0.09;

  /* เงาประของขนาดใหญ่สุด — ค้างตำแหน่งเดิมทุกใบ */
  const gh = MAXCM * CM;
  const gw = gh * 0.8;
  const ghost =
    cm === MAXCM
      ? ""
      : `<rect x="${CX - gw / 2}" y="${BASE - gh}" width="${gw}" height="${gh}" rx="${gw * 0.09}" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="14 10"/>
         <text x="${CX + gw / 2 + 12}" y="${BASE - gh + 26}" font-family="${TH}" font-size="21" font-weight="600" fill="#94a3b8">6.5</text>`;

  /* ช่องโชว์รูปทรงโค้ง + มาสคอตแทนรูปลูกค้า */
  const wx = x + w * 0.18;
  const wy = y + h * 0.26;
  const ww = w * 0.64;
  const wh = h * 0.46;

  /* ห่วงสันสมุดขอบซ้าย — จำนวนห่วงคงที่ 5 วง ย่อ/ขยายตามชิ้นงาน */
  let rings = "";
  for (let i = 0; i < 5; i++) {
    const cy = y + (h / 6) * (i + 1);
    const rw = w * 0.17;
    const rh = h * 0.062;
    rings += `
      <rect x="${x - rw * 0.42}" y="${cy - rh / 2}" width="${rw}" height="${rh}" rx="${rh / 2}" fill="#e8f4fa" stroke="#8fb8cc" stroke-width="2"/>
      <rect x="${x - rw * 0.42 + rw * 0.26}" y="${cy - rh * 0.22}" width="${rw * 0.46}" height="${rh * 0.44}" rx="${rh * 0.22}" fill="#ffffff" stroke="#a9cfe0" stroke-width="1.4"/>`;
  }

  /* แถบหัวชิ้นงานเป็นที่วางตัวเลขขนาด — เดิมวางคร่อมกลางแล้วทับหน้ามาสคอตจนดูไม่ออกว่าเป็นกรอบรูป */
  const label = `${cm} ซม.`;
  const band = h * 0.2;
  const fs = Math.min(w * 0.2, 58);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#cfe9fb"/><stop offset="0.55" stop-color="#bfe0f7"/><stop offset="1" stop-color="#a9d8f2"/>
    </linearGradient>
    <clipPath id="win"><path d="M ${wx} ${wy + wh} L ${wx} ${wy + wh * 0.42} Q ${wx + ww / 2} ${wy - wh * 0.16} ${wx + ww} ${wy + wh * 0.42} L ${wx + ww} ${wy + wh} Z"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">ด้านยาวที่สุด ${cm} ซม.</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ทุกภาพในกลุ่มนี้วาดสเกลเดียวกัน — เทียบกับไม้บรรทัดด้านซ้ายได้เลย</text>

  ${ruler()}
  <line x1="${RULER}" y1="${BASE}" x2="${W - 60}" y2="${BASE}" stroke="#e2e8f0" stroke-width="3"/>
  ${ghost}

  <!-- ชิ้นงาน -->
  <ellipse cx="${CX}" cy="${BASE + 12}" rx="${w * 0.56}" ry="14" fill="#0f172a" opacity="0.08"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#print)" stroke="#8fb8cc" stroke-width="3"/>
  <rect x="${x}" y="${y}" width="${w}" height="${band}" rx="${r}" fill="#ffffff" opacity="0.92"/>
  <rect x="${x}" y="${y + h * 0.87}" width="${w}" height="${h * 0.13}" rx="${r}" fill="#7fd8d0" opacity="0.85"/>
  ${star(x + w * 0.13, y + band * 0.5, w * 0.04, "#fbbf24")}
  ${star(x + w * 0.87, y + band * 0.5, w * 0.04, "#fbbf24")}
  <text x="${CX}" y="${y + band * 0.5 + fs * 0.36}" font-family="${TH}" font-size="${fs}" font-weight="800" text-anchor="middle" fill="${OK}">${label}</text>
  <path d="M ${wx} ${wy + wh} L ${wx} ${wy + wh * 0.42} Q ${wx + ww / 2} ${wy - wh * 0.16} ${wx + ww} ${wy + wh * 0.42} L ${wx + ww} ${wy + wh} Z"
    fill="#ffffff" stroke="#2f5f9e" stroke-width="${w * 0.013}"/>
  <g clip-path="url(#win)">
    <rect x="${wx}" y="${wy - wh * 0.2}" width="${ww}" height="${wh * 1.3}" fill="#eef7fd"/>
    <image href="${MASCOT.uri}" x="${wx + ww * 0.06}" y="${wy + wh * 0.03}" width="${ww * 0.88}" height="${wh * 0.94}" preserveAspectRatio="xMidYMid meet"/>
  </g>
  ${rings}
  <circle cx="${x + w * 0.88}" cy="${y + h * 0.05}" r="${w * 0.035}" fill="#ffffff" stroke="#7ba3b8" stroke-width="2.5"/>

  ${ruleInset()}
</svg>`;
}

// ── เรนเดอร์ ──────────────────────────────────────────────────────────
const built = [];
for (const cm of sizes) {
  const file = fileOf(cm);
  const buf = await sharp(Buffer.from(art(cm))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  built.push({ cm, file, name: nameOf(cm), buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${nameOf(cm)}`);
}
/* แผ่นเทียบ: เรียงทุกใบย่อ 44 px (เท่ารูปข้างเมนูเลื่อน) ต่อกัน ดูว่าไล่ขนาดเห็นจริงไหม */
{
  const S = 44;
  const G = 6;
  const tiles = [];
  for (let i = 0; i < built.length; i++) {
    tiles.push({ input: await sharp(built[i].buf).resize(S, S).toBuffer(), left: i * (S + G) + G, top: G });
  }
  await sharp({ create: { width: built.length * (S + G) + G, height: S + G * 2, channels: 3, background: "#334155" } })
    .composite(tiles)
    .jpeg()
    .toFile(`${OUT}/_strip44.jpg`);
  console.log(`🔍 ${OUT}/_strip44.jpg — ทุกใบย่อ 44 px เรียงเทียบ`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)");
  process.exit(0);
}

// ── อัปโหลด + เขียน imageSrc รายตัวเลือก ───────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.error("อัปโหลดพัง", key, error);
    process.exit(1);
  }
  b.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${built.length} ไฟล์`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) {
  console.error(readErr);
  process.exit(1);
}
const data = row.data;
const g = (data.options ?? []).find((o) => o.label === GROUP);
if (!g) {
  console.error(`ไม่เจอกลุ่ม "${GROUP}"`);
  process.exit(1);
}
if (g.choices.length !== built.length) {
  console.error("จำนวนตัวเลือกไม่ตรงกับภาพที่วาด", g.choices.map((c) => c.name));
  process.exit(1);
}
g.choices = g.choices.map((c) => {
  const b = built.find((x) => x.name === c.name);
  if (!b) {
    console.error("เจอตัวเลือกที่ไม่มีในสคริปต์ (ชื่ออาจถูกแก้):", c.name);
    process.exit(1);
  }
  return { ...c, imageSrc: b.url };
});

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) {
  console.error("update พัง/0 แถว", updErr);
  process.exit(1);
}

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
for (const b of built) {
  const c = bg?.choices?.find((x) => x.name === b.name);
  if (c?.imageSrc !== b.url) {
    console.error("อ่านกลับไม่ตรง!", b.name, c);
    process.exit(1);
  }
}
/* กลุ่มอื่นต้องไม่ถูกแตะ — ภาพที่ทำไว้รอบก่อนยังอยู่ครบ */
const others = back.data.options.filter((o) => o.label !== GROUP);
const missing = others.filter((o) => (o.choices ?? []).some((c) => !c.imageSrc));
if (missing.length) {
  console.error("กลุ่มอื่นมีตัวเลือกที่ภาพหาย!", missing.map((o) => o.label));
  process.exit(1);
}
console.log(`✓ กลุ่ม "${GROUP}" มีภาพรายขนาดครบ ${built.length} ใบ · กลุ่มอื่นภาพครบเหมือนเดิม · savedAt =`, back.data.savedAt);
