#!/usr/bin/env node
/**
 * การ์ดขนาด S/M/L/XL ของ "เสื้อกีฬา ทรง SPORT (พิมพ์ลายเต็มตัว)" (id: sport) — รุ่น v3
 *
 *   node scripts/sport-size-cards-v3.mjs            (วาดลง .cache/sport-size-v3/ + ใบเทียบย่อ 80 px)
 *   node scripts/sport-size-cards-v3.mjs --write    (+ อัปโหลด storage ชื่อไฟล์ใหม่ + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * เจ้าของร้านสั่ง 25 ก.ย. 69 "ออกแบบภาพให้ใหม่หน่อย ของกลุ่มขนาด" — ของเดิม (size-s.jpg?v=2) มีปัญหา
 *   1. เสื้อในภาพเป็นเสื้อยืดแร็กแลนสีฟ้าซีด ไม่เหมือนเสื้อจริงในแกลเลอรี (ครีม · คอกลมกรมท่า · แขนฟ้า · แถบหมากรุกที่ชาย)
 *   2. ตัวไซซ์อยู่แค่ในชิปมุมซ้ายบน ย่อลงปุ่ม 80 px แล้ว S/M/L/XL หน้าตาเหมือนกันหมด
 *   3. บรรทัดวิธีวัดอยู่ชิดขอบล่าง โดนป้ายตัวนับ "7/10" ของแกลเลอรีทับ
 * v3 จึง: วาดเสื้อตามของจริง · ตัวไซซ์เป็นเบอร์ใหญ่บนอกแบบเสื้อกีฬา · เสื้อเล็ก-ใหญ่ตามสัดส่วนจริง
 *   (ชายเสื้อบรรทัดเดียวกัน + เงาเส้นประของ XL ไว้เทียบ) · ข้อความทั้งหมดอยู่เหนือ 86% ของความสูง
 *
 * ตัวเลขจากตารางไซซ์ของทางร้าน (19 ส.ค. 69 · ทรง SPORT มีถึง XL) หน่วยนิ้ว:
 *   Size       S     M   L     XL
 *   รอบอก      39    42  45    48
 *   ความยาว    22.5  25  27.5  30
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้ 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่เสมอ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";

const WRITE = process.argv.includes("--write");
const PRODUCT_ID = "sport";
const VER = "v3";
const OUT = `.cache/sport-size-${VER}`;
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { key: "s", name: "S", chest: 39, len: 22.5 },
  { key: "m", name: "M", chest: 42, len: 25 },
  { key: "l", name: "L", chest: 45, len: 27.5 },
  { key: "xl", name: "XL", chest: 48, len: 30 },
];
const XL = SIZES[SIZES.length - 1];
const cm = (inch) => Math.round(inch * 2.54);

const W = 900;
const H = 900;
const TH = "'Sukhumvit Set', Thonburi, 'Noto Sans Thai', sans-serif";
const INK = "#0f2a4a";
const SUB = "#5b7188";
const BLUE = "#2c81c4";
const NAVY = "#1f3f7a";
const SKY = "#7cc3f0";
const SKY_EDGE = "#4fa3dc";
const CREAM = "#fbf6ea";
const CREAM_EDGE = "#d9cfb8";
const GHOST = "#a9c6e3";

/** เสื้อ XL เต็มสเกล (พิกัดท้องถิ่น: คอที่ y=0 · ชายเสื้อ y=430 · ลำตัวกว้าง ±200 · ปลายแขน ±262) */
const SH = { bodyHalf: 200, hem: 430, armpit: 200, neckHalf: 58, neckY: 14, sleeveX: 272, sleeveTop: 150, sleeveBot: 242, cuffX: 236 };
const bodyPath = `M ${-SH.bodyHalf} ${SH.armpit} L ${-SH.bodyHalf} ${SH.hem - 22} Q ${-SH.bodyHalf} ${SH.hem} ${-SH.bodyHalf + 22} ${SH.hem}
  L ${SH.bodyHalf - 22} ${SH.hem} Q ${SH.bodyHalf} ${SH.hem} ${SH.bodyHalf} ${SH.hem - 22} L ${SH.bodyHalf} ${SH.armpit}
  L ${SH.neckHalf} ${SH.neckY} Q 0 ${SH.neckY + 34} ${-SH.neckHalf} ${SH.neckY} Z`;
const sleevePath = (dir) => {
  const s = dir; // -1 ซ้าย · 1 ขวา
  return `M ${s * SH.neckHalf} ${SH.neckY} L ${s * SH.sleeveX} ${SH.sleeveTop} Q ${s * (SH.sleeveX + 8)} ${SH.sleeveTop + 10} ${s * (SH.sleeveX - 4)} ${SH.sleeveTop + 22}
    L ${s * SH.cuffX} ${SH.sleeveBot} Q ${s * (SH.cuffX - 8)} ${SH.sleeveBot + 8} ${s * (SH.cuffX - 18)} ${SH.sleeveBot - 2}
    L ${s * SH.bodyHalf} ${SH.armpit} Z`;
};
const outlinePath = `M ${-SH.neckHalf} ${SH.neckY} L ${-SH.sleeveX} ${SH.sleeveTop} L ${-SH.cuffX} ${SH.sleeveBot} L ${-SH.bodyHalf + 8} ${SH.armpit + 12}
  L ${-SH.bodyHalf} ${SH.hem - 22} Q ${-SH.bodyHalf} ${SH.hem} ${-SH.bodyHalf + 22} ${SH.hem} L ${SH.bodyHalf - 22} ${SH.hem}
  Q ${SH.bodyHalf} ${SH.hem} ${SH.bodyHalf} ${SH.hem - 22} L ${SH.bodyHalf - 8} ${SH.armpit + 12} L ${SH.cuffX} ${SH.sleeveBot}
  L ${SH.sleeveX} ${SH.sleeveTop} L ${SH.neckHalf} ${SH.neckY} Q 0 ${SH.neckY + 34} ${-SH.neckHalf} ${SH.neckY} Z`;

/** ตำแหน่งบนการ์ด: ชายเสื้อทุกไซซ์อยู่บรรทัดเดียวกัน (HEM_Y) กึ่งกลาง CX */
const CX = 392;
const HEM_Y = 672;

const mascot = await mascotDataUri("hello", 360);

/** วาดเสื้อไซซ์หนึ่ง (สเกลตามรอบอก/ความยาวจริงเทียบ XL) */
function shirt(sz) {
  const sx = sz.chest / XL.chest;
  const sy = sz.len / XL.len;
  const top = HEM_Y - SH.hem * sy;
  const g = (inner) => `<g transform="translate(${CX} ${top}) scale(${sx} ${sy})">${inner}</g>`;
  return `
  <defs>
    <clipPath id="body-${sz.key}"><path d="${bodyPath}"/></clipPath>
    <clipPath id="slL-${sz.key}"><path d="${sleevePath(-1)}"/></clipPath>
    <clipPath id="slR-${sz.key}"><path d="${sleevePath(1)}"/></clipPath>
  </defs>
  ${g(`
    <!-- ลำตัว -->
    <path d="${bodyPath}" fill="${CREAM}" stroke="${CREAM_EDGE}" stroke-width="3" stroke-linejoin="round"/>
    <!-- แถบหมากรุกที่ชายเสื้อ + เส้นกรมท่าคาด -->
    <g clip-path="url(#body-${sz.key})">
      <rect x="-220" y="${SH.hem - 52}" width="440" height="52" fill="url(#chk)"/>
      <rect x="-220" y="${SH.hem - 60}" width="440" height="8" fill="${NAVY}"/>
    </g>
    <!-- แขนแร็กแลนฟ้า + แถบหมากรุกปลายแขน -->
    <path d="${sleevePath(-1)}" fill="${SKY}" stroke="${SKY_EDGE}" stroke-width="3" stroke-linejoin="round"/>
    <path d="${sleevePath(1)}" fill="${SKY}" stroke="${SKY_EDGE}" stroke-width="3" stroke-linejoin="round"/>
    <g clip-path="url(#slL-${sz.key})"><g transform="translate(-238 181) rotate(-21)"><rect x="-14" y="-110" width="28" height="220" fill="url(#chk)"/><rect x="14" y="-110" width="6" height="220" fill="${NAVY}"/></g></g>
    <g clip-path="url(#slR-${sz.key})"><g transform="translate(238 181) rotate(21)"><rect x="-14" y="-110" width="28" height="220" fill="url(#chk)"/><rect x="-20" y="-110" width="6" height="220" fill="${NAVY}"/></g></g>
    <!-- คอกลมกรมท่า -->
    <ellipse cx="0" cy="${SH.neckY + 12}" rx="${SH.neckHalf + 10}" ry="22" fill="${NAVY}"/>
    <ellipse cx="0" cy="${SH.neckY + 13}" rx="${SH.neckHalf - 4}" ry="12" fill="#ffffff"/>
    <!-- ลายบนอก: iDUCKY + เบอร์ไซซ์ + เป็ด -->
    <image href="${mascot.uri}" x="${-SH.bodyHalf + 18}" y="${SH.hem - 60 - 118}" width="${104 * mascot.ratio}" height="104" preserveAspectRatio="xMidYMax meet"/>
    <polygon points="158,150 164,166 180,168 168,178 171,194 158,186 145,194 148,178 136,168 152,166" fill="#ffdb57" stroke="${NAVY}" stroke-width="2"/>
  `)}
  ${chestPrint(sz)}`;
}

/** ลาย "iDUCKY" + เบอร์ไซซ์บนอก — วาดในพิกัดการ์ด (ไม่โดนสเกลบี้) ใหญ่เท่าที่อกรับได้ */
function chestPrint(sz) {
  const sx = sz.chest / XL.chest;
  const sy = sz.len / XL.len;
  const top = HEM_Y - SH.hem * sy;
  const bw = SH.bodyHalf * 2 * sx;
  const wordY = top + 118 * sy;
  const bandTop = HEM_Y - 60 * sy;
  const two = sz.name.length > 1;
  const F = Math.round(Math.min(bw * (two ? 0.56 : 0.68), (bandTop - wordY - 16) * 1.12));
  const baseline = Math.round(bandTop - 18);
  return `
  <text x="${CX}" y="${wordY}" font-family="${TH}" font-size="${Math.round(40 * sx + 8)}" font-weight="700" text-anchor="middle" fill="${NAVY}" letter-spacing="1">iDUCKY</text>
  <text x="${CX + (two ? 36 : 22)}" y="${baseline}" font-family="${TH}" font-size="${F}" font-weight="700" text-anchor="middle" fill="${NAVY}" stroke="${SKY}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">${sz.name}</text>`;
}

/** เงาเส้นประของ XL ไว้เทียบ (ไซซ์ที่ไม่ใช่ XL) */
function ghostXL(sz) {
  if (sz.key === XL.key) return "";
  const top = HEM_Y - SH.hem;
  return `
  <g transform="translate(${CX} ${top})">
    <path d="${outlinePath}" fill="none" stroke="${GHOST}" stroke-width="3" stroke-dasharray="12 10" stroke-linejoin="round"/>
    <ellipse cx="0" cy="${SH.neckY + 12}" rx="${SH.neckHalf + 10}" ry="22" fill="none" stroke="${GHOST}" stroke-width="3" stroke-dasharray="12 10"/>
  </g>
  <text x="${CX + SH.sleeveX - 4}" y="${top + SH.sleeveTop - 30}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="end" fill="${GHOST}">XL</text>`;
}

const pill = (cx, cy, w, h, big, small) => `
  <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="#ffffff" stroke="#cfe3f5" stroke-width="2"/>
  <text x="${cx}" y="${cy + (small ? -2 : 9)}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${BLUE}">${big}</text>
  ${small ? `<text x="${cx}" y="${cy + 22}" font-family="${TH}" font-size="17" text-anchor="middle" fill="${SUB}">${small}</text>` : ""}`;

const hArrow = (x1, x2, y) => `
  <line x1="${x1 + 10}" y1="${y}" x2="${x2 - 10}" y2="${y}" stroke="${BLUE}" stroke-width="3"/>
  <polygon points="${x1},${y} ${x1 + 16},${y - 8} ${x1 + 16},${y + 8}" fill="${BLUE}"/>
  <polygon points="${x2},${y} ${x2 - 16},${y - 8} ${x2 - 16},${y + 8}" fill="${BLUE}"/>`;
const vArrow = (x, y1, y2) => `
  <line x1="${x}" y1="${y1 + 10}" x2="${x}" y2="${y2 - 10}" stroke="${BLUE}" stroke-width="3"/>
  <polygon points="${x},${y1} ${x - 8},${y1 + 16} ${x + 8},${y1 + 16}" fill="${BLUE}"/>
  <polygon points="${x},${y2} ${x - 8},${y2 - 16} ${x + 8},${y2 - 16}" fill="${BLUE}"/>`;

function card(sz) {
  const sx = sz.chest / XL.chest;
  const sy = sz.len / XL.len;
  const top = HEM_Y - SH.hem * sy;
  const bodyL = CX - SH.bodyHalf * sx;
  const bodyR = CX + SH.bodyHalf * sx;
  const AX = 760; // แกนลูกศรความยาว
  const chestY = HEM_Y + 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eaf4fc"/><stop offset="1" stop-color="#f4f9fb"/></linearGradient>
    <linearGradient id="chip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a9de8"/><stop offset="1" stop-color="#2563c9"/></linearGradient>
    <pattern id="chk" width="26" height="26" patternUnits="userSpaceOnUse">
      <rect width="26" height="26" fill="#ffffff"/><rect width="13" height="13" fill="${NAVY}"/><rect x="13" y="13" width="13" height="13" fill="${NAVY}"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="820" cy="120" r="150" fill="#dbeefc" opacity="0.7"/>
  <circle cx="90" cy="820" r="120" fill="#fff3c4" opacity="0.6"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="34" fill="#ffffff" stroke="#e2ecf5" stroke-width="2"/>

  <!-- หัวการ์ด -->
  <rect x="56" y="56" width="112" height="112" rx="30" fill="url(#chip)"/>
  <text x="112" y="${sz.name.length > 1 ? 133 : 136}" font-family="${TH}" font-size="${sz.name.length > 1 ? 54 : 66}" font-weight="700" text-anchor="middle" fill="#ffffff">${sz.name}</text>
  <text x="192" y="104" font-family="${TH}" font-size="42" font-weight="700" fill="${INK}">เสื้อกีฬา ทรง SPORT</text>
  <text x="192" y="144" font-family="${TH}" font-size="23" fill="${SUB}">ไซซ์ ${sz.name} · รอบอก ${sz.chest}" (≈ ${cm(sz.chest)} ซม.) · ความยาว ${sz.len}" (≈ ${cm(sz.len)} ซม.)</text>
  <text x="192" y="176" font-family="${TH}" font-size="19" fill="#8aa0b5">รอบอก = วัดรอบตัวช่วงอก · ความยาว = วัดจากบ่าลงถึงชายเสื้อ</text>

  ${ghostXL(sz)}
  ${shirt(sz)}

  <!-- ความยาว: เส้นไกด์ประจากบ่า/ชายเสื้อ + ลูกศรแนวตั้ง + ป้าย -->
  <line x1="${CX + SH.neckHalf * sx + 8}" y1="${top}" x2="${AX + 26}" y2="${top}" stroke="${GHOST}" stroke-width="2" stroke-dasharray="6 6"/>
  <line x1="${bodyR + 8}" y1="${HEM_Y}" x2="${AX + 26}" y2="${HEM_Y}" stroke="${GHOST}" stroke-width="2" stroke-dasharray="6 6"/>
  ${vArrow(AX, top, HEM_Y)}
  ${pill(AX, (top + HEM_Y) / 2, 150, 76, `ยาว ${sz.len}"`, `≈ ${cm(sz.len)} ซม.`)}

  <!-- รอบอก: ลูกศรแนวนอนใต้ชายเสื้อ + ป้าย -->
  ${hArrow(bodyL, bodyR, chestY)}
  ${pill(CX, chestY + 44, 250, 46, `รอบอก ${sz.chest}"  ≈ ${cm(sz.chest)} ซม.`)}
</svg>`;
}

const bufs = {};
for (const sz of SIZES) {
  const svg = card(sz);
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  bufs[sz.key] = buf;
  writeFileSync(`${OUT}/size-${sz.key}-${VER}.jpg`, buf);
  console.log(`✓ วาด size-${sz.key}-${VER}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

/** ใบเทียบ: แถวบนขนาดเต็ม (ย่อ 300) · แถวล่างที่ 80 px ขยายกลับ 300 (ที่ลูกค้าเห็นบนการ์ดตัวเลือกจริง) */
{
  const tiles = [];
  for (let i = 0; i < SIZES.length; i++) {
    const b = bufs[SIZES[i].key];
    tiles.push({ input: await sharp(b).resize(300, 300).toBuffer(), left: i * 300, top: 0 });
    const tiny = await sharp(b).resize(80, 80).toBuffer();
    tiles.push({ input: await sharp(tiny).resize(300, 300, { kernel: "nearest" }).toBuffer(), left: i * 300, top: 300 });
  }
  await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#ffffff" } }).composite(tiles).jpeg().toFile(`${OUT}/_contact.jpg`);
  console.log(`✓ ใบเทียบ ${OUT}/_contact.jpg`);
}

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ดูภาพใน " + OUT + " แล้วรันซ้ำด้วย --write)");
  process.exit(0);
}

// ---------- อัปโหลด + เขียน DB + อ่านกลับ ----------
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };
const urlOf = (key) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${PRODUCT_ID}/size-${key}-${VER}.jpg`;

for (const sz of SIZES) {
  const path = `products/${PRODUCT_ID}/size-${sz.key}-${VER}.jpg`;
  const { error } = await sb.storage.from("product-images").upload(path, bufs[sz.key], { contentType: "image/jpeg", upsert: true });
  if (error) die(`อัปโหลด ${path}: ${error.message}`);
  const head = await fetch(urlOf(sz.key), { method: "HEAD" });
  if (!head.ok) die(`เปิด ${urlOf(sz.key)} ไม่ได้ (${head.status})`);
  console.log(`☁️  ${path}`);
}

const { data: row, error: e1 } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (e1) die(e1.message);
const d = structuredClone(row.data);
const groups = (d.options ?? []).filter((o) => o.label === "ขนาด");
if (groups.length !== 1) die(`กลุ่ม "ขนาด" มี ${groups.length} กลุ่ม — ต้องมี 1`);
const grp = groups[0];
for (const sz of SIZES) {
  const c = (grp.choices ?? []).find((x) => x.name === sz.name);
  if (!c) die(`ไม่พบตัวเลือก "${sz.name}" ในกลุ่มขนาด (ชื่อในฐานตอนนี้: ${grp.choices.map((x) => x.name).join(", ")})`);
  c.imageSrc = urlOf(sz.key);
}
d.savedAt = new Date().toISOString();
const { data: rows, error: e2 } = await sb.from("products").update({ data: d }).eq("id", PRODUCT_ID).select("id");
if (e2) die(e2.message);
if (rows.length !== 1) die(`อัปเดตโดน ${rows.length} แถว`);

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === "ขนาด");
for (const sz of SIZES) {
  const v = bg.choices.find((x) => x.name === sz.name)?.imageSrc;
  if (typeof v !== "string" || !v.startsWith("https://") || v !== urlOf(sz.key)) die(`อ่านกลับ ${sz.name} ไม่ตรง: ${v}`);
}
if (back.data.savedAt !== d.savedAt) die("savedAt อ่านกลับไม่ตรง");
console.log(`✓ เขียนแล้ว อ่านกลับตรงทั้ง ${SIZES.length} ไซซ์ · savedAt=${back.data.savedAt}`);
