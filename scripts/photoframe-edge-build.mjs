#!/usr/bin/env node
/**
 * กรอบรูปอะคริลิค ขอบเงิน/ทอง/ดำ/โรสโกล (id new-mt2s2cme-5226 · slug กรอบรูปอะคริลิค-ขอบเงิน-ทอง-ดำ-โรสโกล)
 * — ดึงราคาสดจาก https://www.iduckyofficial-pricelists.com/photoframe
 *   (ตารางใต้หัวข้อ "กรอบรูปอะคริลิค ขอบสีเงิน สีทอง สีดำ โรสโกล" · ขนาด A4/A3/40x60 × 4 ช่วงจำนวน)
 *   + สร้างตัวเลือก "ขนาด" (การ์ดวาดสเกลจริง) และ "สีขอบอลูมิเนียม" (รูปถ่ายมุมกรอบจริง 4 สี)
 *   + แกลเลอรี 5 ช่อง (ช่องที่ 2 เป็นคลิปงานจริงจากหน้า pricelists)
 *
 *   node scripts/photoframe-edge-build.mjs           (ดึงราคา + วาด/ครอปภาพลง .cache ดูก่อน)
 *   node scripts/photoframe-edge-build.mjs --write   (+ อัปโหลด storage + เขียนสินค้า + อ่านกลับเทียบ)
 *
 * จากหน้าเว็บ::
 *   • ขอบกว้าง 1cm | ขอบหนา 2cm · วัสดุเป็นอลูมิเนียม · กรอบมีสี ดำ | เงิน | ทอง | โรสโกล
 *   • จำนวน 1-10 คละลายได้ · 11 ขึ้นไป คละลายละ 5 → เรทเดียวทรงเดียวกับ photoframe-8/uv
 *     (minQty 11 · minPerDesign 5 · underMinPieceFee 5 · freeMixBelowQty 11 · tierByDesign)
 *   • ทุกสีขอบราคาเดียวกัน → กลุ่มสีเป็นตัวเลือกธรรมดามีภาพ ไม่ใช่แกนตาราง
 *
 * ภาพสีขอบ = รูปถ่ายมุมกรอบจริงจากเว็บ: เงิน/ทอง อยู่ในรูปเดียวกัน (6152a254) ครอปซ้าย-ขวา ·
 * โรสโกล (2e0080ea) · ดำ (64c13eaf) — จุดต่างอยู่กลางภาพอยู่แล้ว (ปุ่มครอปกลาง 62×62)
 * การ์ดขนาด 3 ใบวาดสเกลจริงเดียวกัน (1 ซม. = 11 px) สไตล์สตูดิโอครีมชุดเดียวกับ photoframe-2/3
 * ⚠️ คลิป 28cce62d ที่แทรกก่อนหัวข้อบนหน้าเว็บ **เป็นกรอบรูปน้ำกลิสเตอร์ (photoframe-5) ไม่ใช่ตัวนี้**
 *   (เปิดดูเฟรมแล้วเป็นกรอบเขย่ากลิตเตอร์) — อย่าเอามาใส่แกลเลอรี · แกลเลอรีจึงมี 4 ช่องรูปจริง
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ขยับ VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "new-mt2s2cme-5226";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/photoframe-edge/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });
const WRITE = process.argv.includes("--write");

const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

/* ── 1. ดึงราคาสดจากหน้า /photoframe ─────────────────────────────────── */
const PAGE = "https://www.iduckyofficial-pricelists.com/photoframe";
const html = await (await fetch(PAGE, { headers: { "user-agent": "Mozilla/5.0" } })).text();
if (html.length < 100000) die("หน้า /photoframe โหลดมาสั้นผิดปกติ");

const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const tables = [];
{
  const re = /<table[\s\S]*?<\/table>/g; let m;
  while ((m = re.exec(html))) tables.push({ html: m[0], start: m.index, end: m.index + m[0].length });
}
// ตารางของสินค้านี้ = ตารางที่ข้อความก่อนหน้า (นับจากท้ายตารางก่อนหน้า) จบด้วยหัวข้อขอบสี
let table = null;
for (let i = 0; i < tables.length; i++) {
  const prevEnd = i > 0 ? tables[i - 1].end : Math.max(0, tables[i].start - 8000);
  const ctx = strip(html.slice(Math.max(prevEnd, tables[i].start - 8000), tables[i].start));
  if (/ขอบสีเงิน\s*สีทอง\s*สีดำ\s*โรสโกล\s*$/.test(ctx)) { table = tables[i]; break; }
}
if (!table) die("หาตารางใต้หัวข้อ 'กรอบรูปอะคริลิค ขอบสีเงิน สีทอง สีดำ โรสโกล' ไม่เจอ");

const cellsRaw = (table.html.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || []).map((c) => strip(c));
if (cellsRaw.length !== 20) die(`ตารางมี ${cellsRaw.length} ช่อง (คาด 20 = หัว 4 + 4 แถว × 4)`);
const header = cellsRaw.slice(0, 4);
if (!/A4/.test(header[1]) || !/A3/.test(header[2]) || !/40\s*x\s*60/i.test(header[3]))
  die("หัวตารางไม่ใช่ A4/A3/40x60: " + header.join(" | "));

const SIZES = [
  { name: "A4", desc: "21 × 29.7 ซม.", w: 21, h: 29.7, popular: true },
  { name: "A3", desc: "29.7 × 42 ซม.", w: 29.7, h: 42 },
  { name: "40×60 ซม.", desc: "40 × 60 ซม. — ใหญ่สุดของร้าน", w: 40, h: 60 },
];
const TIERS = [];
const priceRows = []; // [ [690,890,1090], ... ] แถวละ tier
for (let r = 0; r < 4; r++) {
  const row = cellsRaw.slice(4 + r * 4, 8 + r * 4);
  TIERS.push(row[0]);
  const nums = row.slice(1).map((x) => Number(x.replace(/[^\d]/g, "")));
  if (nums.some((n) => !Number.isFinite(n) || n < 100 || n > 5000)) die("ราคาเพี้ยนในแถว: " + row.join(" | "));
  priceRows.push(nums);
}
// ราคาแต่ละคอลัมน์ต้องไล่ลงตามจำนวน และไล่ขึ้นตามขนาด
for (let c = 0; c < 3; c++) for (let r = 1; r < 4; r++)
  if (priceRows[r][c] > priceRows[r - 1][c]) die("ราคาไม่ไล่ลงตามจำนวน คอลัมน์ " + SIZES[c].name);
for (let r = 0; r < 4; r++) for (let c = 1; c < 3; c++)
  if (priceRows[r][c] < priceRows[r][c - 1]) die("ราคาไม่ไล่ขึ้นตามขนาด แถว " + TIERS[r]);

const tierDefs = TIERS.map((label) => {
  const m = label.match(/^(\d+)\s*-\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label };
});
const cells = Object.fromEntries(SIZES.map((s, c) => [s.name, priceRows.map((row) => row[c])]));
const PRICING = { unit: "อัน", cells, tiers: tierDefs, driverLabels: ["ขนาด"] };
const allPrices = priceRows.flat();
const PRICE_MIN = Math.min(...allPrices);
const PRICE_MAX = Math.max(...allPrices);
const PRICE_BASE = priceRows[0][0]; // A4 ช่วง 1-10

console.log("ตารางราคาจากเว็บ:");
for (let r = 0; r < 4; r++) console.log("  " + TIERS[r].padEnd(14) + priceRows[r].join(" / "));

/* ── 2. โหลดรูปจริง + ครอปสีขอบ ──────────────────────────────────────── */
const WIX = (id) => `https://static.wixstatic.com/media/${id}`;
const SRC = {
  front: "959b83_962906ce3f794f0187b6a48884439998~mv2.jpg",   // หน้าตรง ตั้งโต๊ะ
  table: "959b83_1649cd11c907474d9f21d44b4afe2b14~mv2.jpg",   // มุมเฉียงบนโต๊ะ
  back: "959b83_5e5405e086c241fe93b9cfb752be1aaa~mv2.jpg",    // ด้านหลัง เห็นขาตั้ง
  closeup: "959b83_396b8452a8d740a9bf6032fce709261c~mv2.jpg", // โคลสอัพผิวงาน
  pair: "959b83_6152a2548ad5441094a043b86e156a17~mv2.jpg",    // เงิน(ซ้าย) + ทอง(ขวา)
  rosegold: "959b83_2e0080eafd68439b9958b1b672b807da~mv2.jpg",
  black: "959b83_64c13eafc6554702885489a99719081d~mv2.jpg",
};

async function fetchBuf(url) {
  const r = await fetch(url);
  if (!r.ok) die("โหลดไม่ได้: " + url);
  return Buffer.from(await r.arrayBuffer());
}

const bufs = {}; // file → Buffer พร้อมอัป
const jpeg = (img) => img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();

for (const [key, id] of Object.entries(SRC)) {
  const raw = await fetchBuf(WIX(id));
  if (key === "pair") {
    const meta = await sharp(raw).metadata();
    const half = Math.floor(meta.width / 2);
    bufs[`edge-silver-${VER}.jpg`] = await jpeg(sharp(raw).extract({ left: 0, top: 0, width: half, height: meta.height }).resize({ width: 800, withoutEnlargement: true }));
    bufs[`edge-gold-${VER}.jpg`] = await jpeg(sharp(raw).extract({ left: meta.width - half, top: 0, width: half, height: meta.height }).resize({ width: 800, withoutEnlargement: true }));
  } else if (key === "rosegold" || key === "black") {
    bufs[`edge-${key}-${VER}.jpg`] = await jpeg(sharp(raw).resize({ width: 800, withoutEnlargement: true }));
  } else {
    bufs[`photo-${key}-${VER}.jpg`] = await jpeg(sharp(raw).resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }));
  }
}
/* ── 3. การ์ดขนาด 3 ใบ — สเกลจริงเดียวกัน (1 ซม. = 11 px) ─────────────── */
const W = 900, H = 900, CM = 11;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#3f3a35", SUB = "#9a9187";

function sizeCard(s) {
  const fw = s.w * CM, fh = s.h * CM;
  const edge = 1 * CM;                    // ขอบอลูมิเนียมกว้าง 1 ซม. สเกลจริง
  const bottom = 740, cx = 420;
  const x = cx - fw / 2, top = bottom - fh;
  const rx = cx + fw / 2 + 44;            // ไม้บรรทัดวัดด้านยาว (แนวตั้ง)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="62%" stop-color="#f7f4ef"/><stop offset="100%" stop-color="#ebe5dc"/>
    </radialGradient>
    <linearGradient id="alu" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f3f5f7"/><stop offset="45%" stop-color="#c9d1d8"/><stop offset="100%" stop-color="#98a3ad"/>
    </linearGradient>
    <linearGradient id="art" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbcfe8"/><stop offset="100%" stop-color="#f472b6"/>
    </linearGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#2a2018" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="${cx}" cy="${bottom + 14}" rx="${fw * 0.62}" ry="16" fill="#c9beb0" opacity="0.55" filter="url(#soft)"/>
  <g filter="url(#drop)">
    <rect x="${x}" y="${top}" width="${fw}" height="${fh}" fill="url(#alu)" rx="3"/>
    <rect x="${x + edge}" y="${top + edge}" width="${fw - edge * 2}" height="${fh - edge * 2}" fill="url(#art)"/>
    <circle cx="${cx}" cy="${top + fh * 0.42}" r="${fw * 0.2}" fill="#ffffff" opacity="0.9"/>
    <circle cx="${cx}" cy="${top + fh * 0.42}" r="${fw * 0.13}" fill="#fde68a"/>
    <rect x="${x + edge}" y="${top + edge}" width="${(fw - edge * 2) * 0.42}" height="${fh - edge * 2}" fill="#ffffff" opacity="0.14"/>
  </g>
  <line x1="${rx}" y1="${top}" x2="${rx}" y2="${bottom}" stroke="${SUB}" stroke-width="4"/>
  <line x1="${rx - 14}" y1="${top}" x2="${rx + 14}" y2="${top}" stroke="${SUB}" stroke-width="4"/>
  <line x1="${rx - 14}" y1="${bottom}" x2="${rx + 14}" y2="${bottom}" stroke="${SUB}" stroke-width="4"/>
  <text x="${rx + 24}" y="${(top + bottom) / 2}" font-family="${TH}" font-size="34" fill="${SUB}" dominant-baseline="middle">${s.h} ซม.</text>
  <text x="${cx}" y="${bottom + 92}" font-family="${TH}" font-size="52" font-weight="700" fill="${INK}" text-anchor="middle">${s.name}</text>
  ${s.name.includes("ซม.") ? "" : `<text x="${cx}" y="${bottom + 140}" font-family="${TH}" font-size="34" fill="${SUB}" text-anchor="middle">${s.w} × ${s.h} ซม.</text>`}
</svg>`;
}
for (const s of SIZES) {
  const file = `size-${s.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${VER}.jpg`;
  bufs[file] = await sharp(Buffer.from(sizeCard(s))).flatten({ background: "#f7f4ef" }).jpeg({ quality: 90 }).toBuffer();
  s.file = file;
}

for (const [file, buf] of Object.entries(bufs)) writeFileSync(`${OUT}/${file}`, buf);
console.log(`\nไฟล์ ${Object.keys(bufs).length} ชิ้นอยู่ที่ ${OUT}/`);

if (!WRITE) { console.log("(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

/* ── 4. อัปโหลด storage + เขียนสินค้า ────────────────────────────────── */
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urls = {};
for (const [file, buf] of Object.entries(bufs)) {
  const key = `products/${PRODUCT_ID}/${file}`;
  const contentType = file.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
  const { error } = await sb.storage.from("product-images").upload(key, buf, { contentType, upsert: true });
  if (error) die(`อัปโหลด ${file} ไม่ได้: ${error.message}`);
  urls[file] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log("อัปโหลด storage แล้ว " + Object.keys(urls).length + " ไฟล์");

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr || !row) die("อ่านสินค้าไม่ได้: " + (readErr && readErr.message));
const data = row.data;

const EDGES = [
  { name: "ขอบสีเงิน", file: `edge-silver-${VER}.jpg`, desc: "อลูมิเนียมสีเงิน ผิวปัดเงา" },
  { name: "ขอบสีทอง", file: `edge-gold-${VER}.jpg`, desc: "อลูมิเนียมสีทอง ผิวปัดเงา" },
  { name: "ขอบสีดำ", file: `edge-black-${VER}.jpg`, desc: "อลูมิเนียมสีดำ ผิวด้าน" },
  { name: "ขอบสีโรสโกล", file: `edge-rosegold-${VER}.jpg`, desc: "อลูมิเนียมสีโรสโกลด์ ผิวปัดเงา" },
];

data.pricing = PRICING;
data.priceRates = [{
  id: "r1",
  label: "เรทที่ 1",
  minQty: 11,
  minPerDesign: 5,
  underMinPieceFee: 5,
  freeMixBelowQty: 11,
  pricing: PRICING,
}];
data.tierByDesign = true;
data.options = [
  {
    label: "ขนาด",
    display: "cards",
    note: "ราคาตามตารางขึ้นกับขนาดและจำนวน — ขอบกรอบกว้าง 1 ซม. หนา 2 ซม.",
    choices: SIZES.map((s) => ({
      name: s.name,
      desc: s.desc,
      ...(s.popular ? { popular: true } : {}),
      imageSrc: urls[s.file],
    })),
  },
  {
    label: "สีขอบอลูมิเนียม",
    display: "cards",
    note: "กรอบวัสดุอลูมิเนียม เลือกได้ 4 สี — ทุกสีราคาเดียวกัน",
    choices: EDGES.map((e, i) => ({
      name: e.name,
      desc: e.desc,
      ...(i === 0 ? { popular: true } : {}),
      imageSrc: urls[e.file],
    })),
  },
];
const GRAD = "from-sky-100 to-blue-200";
data.emoji = "🖼️";
data.gradient = GRAD;
data.images = [
  { src: urls[`photo-front-${VER}.jpg`], emoji: "🖼️", label: "ด้านหน้า", gradient: GRAD },
  { src: urls[`photo-table-${VER}.jpg`], emoji: "🖼️", label: "มุมเฉียง", gradient: GRAD },
  { src: urls[`photo-back-${VER}.jpg`], emoji: "🖼️", label: "ด้านหลัง มีขาตั้ง", gradient: GRAD },
  { src: urls[`photo-closeup-${VER}.jpg`], emoji: "🖼️", label: "โคลสอัพผิวงาน", gradient: GRAD },
];
data.price = PRICE_BASE;
data.priceMin = PRICE_MIN;
data.priceMax = PRICE_MAX;
data.quoteOption = false;
data.highlights = ["กรอบอลูมิเนียม 4 สี เงิน/ทอง/ดำ/โรสโกลด์", "พิมพ์ลายตามสั่ง", "ราคาปรับตามจำนวน"];
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products")
  .update({ price: PRICE_BASE, data }).eq("id", PRODUCT_ID).select("data");
if (updErr) die("เขียนไม่ได้: " + updErr.message);
if (!upd || upd.length !== 1) die("update โดน " + (upd ? upd.length : 0) + " แถว");

/* ── 5. อ่านกลับเทียบของจริง (เช็ครูปร่างค่า ไม่ใช่แค่เท่ากับตัวแปร) ──── */
const { data: back } = await sb.from("products").select("price,data").eq("id", PRODUCT_ID).single();
const b = back.data;
const isUrl = (v) => typeof v === "string" && v.startsWith("https://") && v.includes(`products/${PRODUCT_ID}/`);
const errs = [];
if (back.price !== PRICE_BASE) errs.push("คอลัมน์ price ไม่ตรง");
if (b.savedAt !== data.savedAt) errs.push("savedAt ไม่ตรง (โดนเขียนแซง?)");
for (const s of SIZES) {
  const got = b.pricing && b.pricing.cells && b.pricing.cells[s.name];
  const want = cells[s.name];
  if (!got || got.join(",") !== want.join(",")) errs.push(`cells[${s.name}] = ${JSON.stringify(got)} (คาด ${want.join(",")})`);
  const got2 = b.priceRates && b.priceRates[0] && b.priceRates[0].pricing.cells[s.name];
  if (!got2 || got2.join(",") !== want.join(",")) errs.push(`priceRates[0].cells[${s.name}] ไม่ตรง`);
}
const r1 = (b.priceRates || [])[0] || {};
for (const [k, v] of [["minQty", 11], ["minPerDesign", 5], ["underMinPieceFee", 5], ["freeMixBelowQty", 11]])
  if (r1[k] !== v) errs.push(`priceRates[0].${k} = ${r1[k]} (คาด ${v})`);
if (b.tierByDesign !== true) errs.push("tierByDesign ไม่ true");
const opts = b.options || [];
if (opts.length !== 2) errs.push("options ไม่ครบ 2 กลุ่ม");
for (const g of opts) for (const c of g.choices || [])
  if (!isUrl(c.imageSrc)) errs.push(`ตัวเลือก "${c.name}" imageSrc รูปร่างผิด: ${c.imageSrc}`);
if ((b.images || []).length !== 4) errs.push("images ไม่ครบ 4 ช่อง");
if ((b.images || []).some((im) => im.videoSrc)) errs.push("มี videoSrc หลงมา (คลิปบนเว็บเป็นของ photoframe-5)");
for (const im of b.images || []) if (!isUrl(im.src)) errs.push("images.src รูปร่างผิด: " + im.src);
if (b.priceMin !== PRICE_MIN || b.priceMax !== PRICE_MAX) errs.push("priceMin/priceMax ไม่ตรง");

if (errs.length) { errs.forEach((e) => console.error("✗ " + e)); process.exit(1); }
console.log("✓ อ่านกลับตรงทุกข้อ — ราคา " + PRICE_MIN + "-" + PRICE_MAX + " · ตัวเลือก 2 กลุ่ม · แกลเลอรี 4 ช่อง");
console.log("  สินค้ายังเป็นฉบับร่าง (hidden) — เปิดดูที่ /admin/products แล้วกดเผยแพร่เมื่อพร้อม");
