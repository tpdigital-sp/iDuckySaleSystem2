#!/usr/bin/env node
/**
 * PASSPORT CASE (passport-case · /products/PASSPORT-CASE) — ภาพประกอบกลุ่ม "สกรีนกี่ด้าน" 2 ใบ
 * (เจ้าของร้านสั่ง 22 ต.ค. 69 "สร้างภาพให้หน่อย")
 *
 *   node scripts/passport-case-sides-art.mjs            (วาดลง .cache/passport-case/upload ดูก่อน)
 *   node scripts/passport-case-sides-art.mjs --write    (+ อัป storage + ตั้ง imageSrc/desc/display cards + อ่านกลับเทียบ)
 *
 * ภาพ: บน = ปกด้านนอกกางออก (หลัง | สัน | หน้า) · ล่าง = ด้านในกางออก (ช่องใส่บัตรซ้าย | กลาง | แผงขวา)
 *   1 ด้าน (ด้านนอก) = ด้านนอกพิมพ์ลาย · ด้านในหนังเปล่า "ไม่พิมพ์"
 *   2ด้าน (ด้านในได้แค่ 1 ฝั่ง) = ด้านนอกพิมพ์ลาย + ด้านในพิมพ์ได้แค่ "แผงขวา" (ตามเทมเพลต (2ด้าน)Passport.ai อาร์ตบอร์ด 2)
 * สัดส่วนจากเทมเพลต 221×149 มม. (ขอบปก 216×144 @2.5 · สัน 106.8–114.2 · ด้านใน: แผงซ้าย ≤100.5 ช่องบัตร 14.5–91 × 13.6–136.6 · แผงขวา ≥156.6)
 * ลายตัวอย่าง = มาสคอตเป็ดจริง (iducky-assets) — หน้า heart พื้นฟ้า-teal · ด้านใน peace พื้นชมพู-ส้ม (ชุดเดียวกับ banner-print-sides-art)
 * กลุ่มนี้ไม่ใช่แกนตารางราคา (driverLabels ว่าง · ราคาบวกในตัวเลือก) — แตะแค่ imageSrc/desc/display · ⚠️ แก้ภาพ = ขึ้น VER ใหม่ (CDN แคช)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "passport-case";
const GROUP = "สกรีนกี่ด้าน";
const ONE = "1 ด้าน (ด้านนอก)";
const TWO = "2ด้าน (ด้านในได้แค่ 1 ฝั่ง)";
const VER = "v1";
const OUT = `.cache/${PRODUCT_ID}/upload`;
mkdirSync(OUT, { recursive: true });

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const LEATHER = "#f6f3ee", STITCH = "#cbbfae";
const HEART = await mascotDataUri("heart", 420);
const PEACE = await mascotDataUri("peace", 420);

/* สเกล: กว้าง 340 px = 221 มม. (สูง ~229) · ป้ายเลขด้านคั่นกลางไม่ทับปก */
const SW = 340, S = SW / 221, SH = 149 * S;
const SX = (W - SW) / 2;
const OUT_Y = 188, BADGE_Y = 470, IN_Y = 580;
const mm = (v) => v * S;
const art = (m, cx, cy, h) => {
  const w = h * m.ratio;
  return `<image href="${m.uri}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
};
const star = (x, y, r, o) => `<path d="M ${x} ${y - r} L ${x + r * 0.32} ${y - r * 0.32} L ${x + r} ${y} L ${x + r * 0.32} ${y + r * 0.32} L ${x} ${y + r} L ${x - r * 0.32} ${y + r * 0.32} L ${x - r} ${y} L ${x - r * 0.32} ${y - r * 0.32} Z" fill="#ffffff" opacity="${o}"/>`;

/** ขอบปกมุมมน (216×144 @2.5 · รัศมี ~8.5 มม.) */
const coverRect = (y, extra = "") => `<rect x="${SX + mm(2.5)}" y="${y + mm(2.5)}" width="${mm(216)}" height="${mm(144)}" rx="${mm(8.5)}" ${extra}/>`;
const stitch = (y) => `<rect x="${SX + mm(5)}" y="${y + mm(5)}" width="${mm(211)}" height="${mm(139)}" rx="${mm(6.5)}" fill="none" stroke="${STITCH}" stroke-width="1.6" stroke-dasharray="4 4"/>`;
const shadow = (y) => `<rect x="${SX + mm(2.5) + 5}" y="${y + mm(2.5) + 9}" width="${mm(216)}" height="${mm(144)}" rx="${mm(8.5)}" fill="#0f172a" opacity="0.09"/>`;

/** ด้านนอก: พิมพ์เต็มปก (หลัง | สัน | หน้า) */
function outside(y) {
  const cy = y + SH / 2;
  return `
  <defs>
    <linearGradient id="gOut" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
    <clipPath id="cOut">${coverRect(y)}</clipPath>
  </defs>
  ${shadow(y)}
  <g clip-path="url(#cOut)">
    <rect x="${SX}" y="${y}" width="${SW}" height="${SH}" fill="url(#gOut)"/>
    ${star(SX + mm(20), y + mm(22), 9, 0.55)}${star(SX + mm(80), y + mm(120), 7, 0.45)}${star(SX + mm(198), y + mm(26), 8, 0.5)}${star(SX + mm(140), y + mm(128), 10, 0.4)}
    <text x="${SX + mm(54)}" y="${cy + 8}" font-family="${TH}" font-size="26" font-weight="800" text-anchor="middle" fill="#ffffff" opacity="0.95">PASSPORT</text>
    ${art(HEART, SX + mm(166), cy + 4, SH * 0.72)}
    <rect x="${SX + mm(106.8)}" y="${y}" width="${mm(7.4)}" height="${SH}" fill="#0f172a" opacity="0.12"/>
  </g>
  ${stitch(y)}
  ${coverRect(y, `fill="none" stroke="#0f172a" stroke-width="2" opacity="0.18"`)}`;
}

/** ด้านใน: ช่องใส่บัตรซ้าย + แผงขวา (พิมพ์หรือไม่พิมพ์) */
function inside(y, printRight) {
  const rx = SX + mm(156.6), rw = mm(218.5 - 156.6);
  return `
  <defs>
    <linearGradient id="gIn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbcfe8"/><stop offset="1" stop-color="#fb923c"/></linearGradient>
    <clipPath id="cIn">${coverRect(y)}</clipPath>
  </defs>
  ${shadow(y)}
  ${coverRect(y, `fill="${LEATHER}"`)}
  <g clip-path="url(#cIn)">
    ${printRight ? `<rect x="${rx}" y="${y}" width="${rw + mm(3)}" height="${SH}" fill="url(#gIn)"/>
    ${star(rx + mm(12), y + mm(20), 7, 0.6)}${star(rx + mm(48), y + mm(124), 6, 0.5)}
    ${art(PEACE, rx + rw / 2, y + SH / 2 + 4, SH * 0.6)}` : `<text x="${rx + rw / 2}" y="${y + SH / 2 + 8}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="#b6bfca">ไม่พิมพ์</text>`}
    <!-- ช่องใส่บัตร/พาสปอร์ต (พลาสติกใส) แผงซ้าย -->
    <rect x="${SX + mm(14.5)}" y="${y + mm(13.6)}" width="${mm(76.5)}" height="${mm(123)}" rx="${mm(6)}" fill="#e8f2f8" stroke="#a9c3d3" stroke-width="2"/>
    <path d="M ${SX + mm(24)} ${y + mm(126)} L ${SX + mm(62)} ${y + mm(22)} L ${SX + mm(72)} ${y + mm(22)} L ${SX + mm(34)} ${y + mm(126)} Z" fill="#ffffff" opacity="0.55"/>
    <line x1="${SX + mm(100.5)}" y1="${y}" x2="${SX + mm(100.5)}" y2="${y + SH}" stroke="${STITCH}" stroke-width="2"/>
    <line x1="${rx}" y1="${y}" x2="${rx}" y2="${y + SH}" stroke="${STITCH}" stroke-width="2"/>
  </g>
  ${stitch(y)}
  ${coverRect(y, `fill="none" stroke="#0f172a" stroke-width="2" opacity="0.18"`)}`;
}

const tag = (cx, y, text, on) => {
  const w = text.length * 12.5 + 40;
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="38" rx="19" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2"/>
  <text x="${cx}" y="${y + 26}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};
function badge(sides, extra) {
  const bw = extra ? 400 : 300, x0 = W / 2 - bw / 2;
  const nx = extra ? W / 2 - 130 : W / 2 - 44, lx = extra ? W / 2 - 48 : W / 2 + 62;
  return `<rect x="${x0}" y="${BADGE_Y - 46}" width="${bw}" height="92" rx="26" fill="#ffffff" stroke="${OK}" stroke-width="3.5"/>
  <text x="${nx}" y="${BADGE_Y + 22}" font-family="${TH}" font-size="66" font-weight="800" text-anchor="middle" fill="${OK}">${sides}</text>
  <text x="${lx}" y="${BADGE_Y + 18}" font-family="${TH}" font-size="34" font-weight="700" text-anchor="middle" fill="${INK}">ด้าน</text>
  ${extra ? `<line x1="${W / 2 + 8}" y1="${BADGE_Y - 28}" x2="${W / 2 + 8}" y2="${BADGE_Y + 28}" stroke="#e2e8f0" stroke-width="2.5"/>
  <text x="${W / 2 + 110}" y="${BADGE_Y + 2}" font-family="${TH}" font-size="30" font-weight="800" text-anchor="middle" fill="${OK}">${extra}</text>
  <text x="${W / 2 + 110}" y="${BADGE_Y + 32}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${SUB}">ต่อชิ้น</text>` : ""}`;
}
const card = (title, subtitle, body, note) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="80" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="118" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  <text x="${W / 2}" y="${H - 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${note}</text>
</svg>`;

function sidesArt(two) {
  const body = `
  ${tag(W / 2, OUT_Y - 46, "ด้านนอก (ปก) — พิมพ์ลายเต็มปก", true)}
  ${outside(OUT_Y)}
  ${badge(two ? 2 : 1, two ? "+฿25" : "")}
  ${tag(W / 2, IN_Y - 48, two ? "ด้านใน — พิมพ์ได้แค่แผงขวา" : "ด้านใน — หนังเปล่า ไม่พิมพ์", two)}
  ${inside(IN_Y, two)}`;
  return two
    ? card("สกรีน 2 ด้าน", "ด้านนอกเต็มปก + ด้านในแผงขวา 1 ฝั่ง", body, "ด้านในฝั่งซ้ายเป็นช่องใส่บัตรใส พิมพ์ไม่ได้ · ด้านนอกกับด้านในคนละลายได้")
    : card("สกรีน 1 ด้าน", "พิมพ์ลายเฉพาะปกด้านนอก", body, "ลายเต็มปก หลัง–สัน–หน้า ต่อกันเป็นผืนเดียว · ด้านในไม่มีหมึก");
}

const built = [];
for (const two of [false, true]) {
  const key = two ? "two" : "one";
  const file = `sides-${key}-${VER}.jpg`;
  const buf = await sharp(Buffer.from(sidesArt(two))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  built.push({ key, file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB`);
}
if (!process.argv.includes("--write")) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)");
  process.exit(0);
}

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = {};
for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.key] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  if (!(await fetch(url[b.key], { method: "HEAD" })).ok) { console.error("ดึงรูปที่อัปแล้วไม่ได้", url[b.key]); process.exit(1); }
}
const { data: row } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const data = row.data;
const pricingBefore = JSON.stringify({ p: data.pricing, r: data.priceRates });
const g = (data.options ?? []).find((o) => o.label === GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
const set = { [ONE]: { key: "one", desc: "พิมพ์ลายเฉพาะปกด้านนอก (หลัง–สัน–หน้า) ด้านในหนังเปล่าไม่มีหมึก" }, [TWO]: { key: "two", desc: "ด้านนอกเต็มปก + ด้านในพิมพ์ได้แค่แผงขวา 1 ฝั่ง (ฝั่งซ้ายเป็นช่องใส่บัตร)" } };
for (const [name, v] of Object.entries(set)) {
  const c = g.choices.find((x) => x.name === name);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${name}"`); process.exit(1); }
  c.imageSrc = url[v.key];
  c.desc = v.desc;
}
g.display = "cards";
data.savedAt = new Date().toISOString();
const { error: ue } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID);
if (ue) { console.error(ue); process.exit(1); }
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
for (const [name, v] of Object.entries(set)) {
  const c = bg.choices.find((x) => x.name === name);
  if (c?.imageSrc !== url[v.key] || c?.desc !== v.desc) { console.error("อ่านกลับไม่ตรง", name, c); process.exit(1); }
}
if (JSON.stringify({ p: back.data.pricing, r: back.data.priceRates }) !== pricingBefore) { console.error("ราคาเพี้ยน!"); process.exit(1); }
console.log(`✓ ตั้งภาพ + คำอธิบาย ${Object.keys(set).length} ตัวเลือก · display cards · ราคาเท่าเดิม`);
const { revalidateLive } = await import("./lib/revalidate-live.mts").catch(() => ({ revalidateLive: null }));
if (revalidateLive) await revalidateLive(env, { productIds: [PRODUCT_ID] });
