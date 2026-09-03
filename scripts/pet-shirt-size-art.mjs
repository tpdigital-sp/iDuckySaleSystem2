/**
 * การ์ดขนาดเสื้อสัตว์เลี้ยง (catdogcollar-4) — S/M/L/XL/XXL
 * v5 (จัตุรัส 900×900 กันแกลเลอรีครอปข้าง): ใช้ภาพมาสคอตทางการ iDUCKY_02.png (เป็ดยืนถือหัวใจ) จากไดรฟ์ Content
 *     สเกลตัวเป็ดตามขนาด + เส้นวัดรอบอก/ยาวหลัง + ป้ายวงกลมตัวอักษรขนาด
 *     (v1 วงกลมตัวอักษร → v2 เสื้อวาด → v3 เป็ดวาด SVG — ผู้ใช้ขอเป็ดทางการแทน)
 * ตัวเลขวัดตัวเป็น "ข้อมูลจำลอง" มีป้ายกำกับในภาพ — ผู้ใช้ยังไม่ส่งตัวเลขจริง
 *
 * ต้นฉบับเป็ด: /Volumes/iDuckyShop/- ตัวอย่าง เคสลูกค้าสั่งทำ/- รวมงานฝ่าย Content/WEB/iduckystore/iDUCKY/iDUCKY_02.png
 * (สคริปต์สำเนามาเก็บที่ .tmpwork/pet-shirt/duck-src.png เผื่อไดรฟ์ไม่ได้ต่อ)
 *
 * รัน:  node scripts/pet-shirt-size-art.mjs            (วาดภาพลง .tmpwork/pet-shirt/)
 *       node scripts/pet-shirt-size-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 */
import { readFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PRODUCT_ID = "catdogcollar-4";
const VER = "v5";
const OUT_DIR = new URL("../.tmpwork/pet-shirt/", import.meta.url).pathname;
mkdirSync(OUT_DIR, { recursive: true });

const DUCK_VOLUME = "/Volumes/iDuckyShop/- ตัวอย่าง เคสลูกค้าสั่งทำ/- รวมงานฝ่าย Content/WEB/iduckystore/iDUCKY/iDUCKY_02.png";
const DUCK_LOCAL = OUT_DIR + "duck-src.png";
if (!existsSync(DUCK_LOCAL)) {
  if (!existsSync(DUCK_VOLUME)) { console.error("ไม่เจอไฟล์เป็ดทั้งในไดรฟ์และสำเนา:", DUCK_VOLUME); process.exit(1); }
  copyFileSync(DUCK_VOLUME, DUCK_LOCAL);
  console.log("สำเนาเป็ดต้นฉบับ →", DUCK_LOCAL);
}

const FONT = "Mitr, Thonburi, sans-serif";
const navy = "#173A6B", navySoft = "#4A6A96", blueDeep = "#2C81C4", yolk = "#FFD447";

// ข้อมูลจำลอง (อิงมาตรฐานเสื้อสัตว์เลี้ยงทั่วไป) — มีตัวเลขจริงเมื่อไหร่แก้ตรงนี้แล้วรัน --write ซ้ำ
const SIZES = [
  { name: "S",   neck: "20–24", chest: "30–34", back: "20", weight: "1–2.5 กก." },
  { name: "M",   neck: "24–28", chest: "35–39", back: "25", weight: "2.5–4.5 กก." },
  { name: "L",   neck: "28–32", chest: "40–44", back: "30", weight: "4.5–7 กก." },
  { name: "XL",  neck: "32–36", chest: "45–50", back: "35", weight: "7–10 กก." },
  { name: "XXL", neck: "36–40", chest: "51–58", back: "40", weight: "10–15 กก." },
];
// สเกลตัวเป็ดต่อขนาด — สเกลเดียวกันทุกใบ เทียบข้ามการ์ดได้จริง
const DUCK_SCALE = { S: 0.85, M: 0.98, L: 1.11, XL: 1.24, XXL: 1.38 };

// การ์ดเป็นจัตุรัส — แกลเลอรีหน้าสินค้าเป็น aspect-square + object-cover ภาพ 4:3 โดนตัดข้าง (v4 โดนมาแล้ว)
const W = 900, H = 900, CX = W / 2, GROUND = 780; // ตีนเป็ดทุกการ์ดยืนบรรทัดเดียวกัน
const duckTrimmed = await sharp(readFileSync(DUCK_LOCAL)).trim().png().toBuffer();

async function makeCard(s, outPath) {
  const k = DUCK_SCALE[s.name];
  const duckH = Math.round(450 * k);
  const duck = await sharp(duckTrimmed).resize({ height: duckH }).png().toBuffer();
  const duckW = (await sharp(duck).metadata()).width;
  const top = GROUND - duckH, left = Math.round(CX - duckW / 2);
  const chestY = GROUND - Math.round(duckH * 0.40); // แนวเส้นรอบอก (ช่วงพุง/อกเป็ด)
  const arrowX = left + duckW + 24;                  // ลูกศรยาวหลัง ขวาของตัวเป็ด
  const arrowTop = top + Math.round(duckH * 0.10), arrowBot = GROUND;
  // ป้ายตัวอักษรขนาด — หนีบไม่ให้ชนลูกศรยาวหลังบนการ์ดตัวเล็ก
  const badge = { x: Math.min(left + Math.round(duckW * 0.86), arrowX - 62 - 14), y: GROUND - 62, r: 62 };
  const badgeFont = s.name.length === 1 ? 66 : s.name.length === 2 ? 48 : 36;

  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#F2FAFF"/><stop offset="1" stop-color="#FFFBF2"/>
</linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle cx="845" cy="855" r="100" fill="#E2F3FE" opacity="0.8"/>
<circle cx="55" cy="860" r="80" fill="#A9E5D2" opacity="0.35"/>
<text x="46" y="56" font-family="${FONT}" font-size="36" fill="${navy}">เสื้อสัตว์เลี้ยง · ขนาด ${s.name}</text>
<rect x="642" y="24" width="232" height="30" rx="15" fill="${yolk}"/>
<text x="758" y="45" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="500" fill="${navy}">ภาพตัวอย่างจำลอง (MOCKUP)</text>
<ellipse cx="${CX}" cy="${GROUND + 10}" rx="${Math.round(duckW * 0.48)}" ry="16" fill="#C6E8FB" opacity="0.55"/>
</svg>`;

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<!-- เส้นวัดรอบอก (ซ้าย) -->
<line x1="272" y1="${chestY}" x2="${left + Math.round(duckW * 0.85)}" y2="${chestY}" stroke="#FF9EB0" stroke-width="4" stroke-dasharray="10 8" opacity="0.85"/>
<rect x="38" y="${chestY - 46}" width="230" height="72" rx="14" fill="#fff" stroke="#FFD3DC" stroke-width="2"/>
<text x="153" y="${chestY - 16}" text-anchor="middle" font-family="${FONT}" font-size="23" fill="${navy}">รอบอก</text>
<text x="153" y="${chestY + 15}" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="500" fill="#E4657F">${s.chest} ซม.</text>
<!-- ลูกศรยาวหลัง (ขวา) -->
<line x1="${arrowX}" y1="${arrowTop}" x2="${arrowX}" y2="${arrowBot}" stroke="${blueDeep}" stroke-width="4"/>
<path d="M ${arrowX - 8},${arrowTop + 12} ${arrowX},${arrowTop} ${arrowX + 8},${arrowTop + 12} Z" fill="${blueDeep}"/>
<path d="M ${arrowX - 8},${arrowBot - 12} ${arrowX},${arrowBot} ${arrowX + 8},${arrowBot - 12} Z" fill="${blueDeep}"/>
<rect x="${arrowX + 14}" y="${(arrowTop + arrowBot) / 2 - 36}" width="150" height="72" rx="14" fill="#fff" stroke="#C6E8FB" stroke-width="2"/>
<text x="${arrowX + 89}" y="${(arrowTop + arrowBot) / 2 - 6}" text-anchor="middle" font-family="${FONT}" font-size="23" fill="${navy}">ยาวหลัง</text>
<text x="${arrowX + 89}" y="${(arrowTop + arrowBot) / 2 + 25}" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="500" fill="${blueDeep}">${s.back} ซม.</text>
<!-- ป้ายตัวอักษรขนาด (ให้ปุ่ม 28px ยังอ่านออก) -->
<circle cx="${badge.x}" cy="${badge.y}" r="${badge.r}" fill="${blueDeep}"/>
<circle cx="${badge.x}" cy="${badge.y}" r="${badge.r - 5}" fill="none" stroke="#fff" stroke-width="3" opacity="0.6"/>
<text x="${badge.x}" y="${badge.y + badgeFont * 0.34}" text-anchor="middle" font-family="${FONT}" font-size="${badgeFont}" font-weight="500" fill="#fff">${s.name}</text>
<!-- สเปคล่าง -->
<text x="${CX}" y="${H - 60}" text-anchor="middle" font-family="${FONT}" font-size="26" fill="${navySoft}">รอบคอ ${s.neck} ซม. · เหมาะกับน้ำหนัก ${s.weight}</text>
</svg>`;

  await sharp(Buffer.from(bg))
    .composite([{ input: duck, left, top }, { input: Buffer.from(overlay), left: 0, top: 0 }])
    .flatten({ background: "#F7FBFF" }).jpeg({ quality: 90 }).toFile(outPath);
}

const WRITE = process.argv.includes("--write");
const files = [];
for (const s of SIZES) {
  const file = `size-${s.name.toLowerCase()}-${VER}.jpg`;
  await makeCard(s, OUT_DIR + file);
  files.push({ size: s.name, file, path: OUT_DIR + file });
  console.log("วาดแล้ว", file);
}
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage ──
const urls = {};
for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  urls[f.size] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.size]);
}

// ── ตั้ง choice.imageSrc (อ่าน-แก้-เขียนทั้ง data แล้วอ่านกลับเทียบ) ──
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const grp = (data.options ?? []).find((o) => o.label === "ขนาด");
if (!grp) { console.error("ไม่เจอกลุ่ม 'ขนาด'"); process.exit(1); }
for (const c of grp.choices) {
  if (!urls[c.name]) { console.error("ตัวเลือกไม่รู้จัก:", c.name); process.exit(1); }
  c.imageSrc = urls[c.name];
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g2 = back.data.options.find((o) => o.label === "ขนาด");
for (const s of SIZES) {
  const got = g2.choices.find((c) => c.name === s.name)?.imageSrc;
  if (got !== urls[s.name]) { console.error("อ่านกลับไม่ตรง!", s.name, got); process.exit(1); }
}
console.log("✓ ตั้ง imageSrc ครบ 5 ขนาด อ่านกลับตรงทุกตัว · savedAt =", back.data.savedAt);
