#!/usr/bin/env node
/**
 * ที่เปิดขวด แบบทรงกลม มีแม่เหล็ก (otheracrylicproducts4-5) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบ
 *
 *   node scripts/bottle-opener-size-group.mjs            (วาดภาพลง .cache/bottle-opener/upload ดูก่อน)
 *   node scripts/bottle-opener-size-group.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปคร้าน (AdminBuddy/academy-assets/gifts/opener.jpg):
 * ที่เปิดขวดทรงกลม (มีแม่เหล็ก) มี "ขนาดเดียว" 5.8 ซม. · ขายเป็นเซ็ต เซ็ตละ 2 ชิ้น
 * (ทรงแบนสแตนเลส 18×4×0.2 ซม. เป็นสินค้าคนละตัว ยังไม่มีใน DB — ไม่เกี่ยว)
 *
 * เพิ่มกลุ่ม "ขนาด" ไว้หน้ากลุ่ม "เคลือบแบบ" — ตัวเลือกเดียว "ทรงกลม 5.8 ซม." ไม่บวกราคา
 * พร้อมภาพวาดใหม่ (900×900): หน้าปัดกลม+ลูกศรวัด 5.8 ซม. + ด้านหลังโชว์ที่เปิดขวด/แม่เหล็ก
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "otheracrylicproducts4-5";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/bottle-opener/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "ทรงกลม 5.8 ซม.";
const COAT_GROUP = "เคลือบแบบ"; // จุดแทรก: หน้ากลุ่มนี้

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาดแนวนอน — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข */
const dim = (x1, y, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${SUB}" stroke-width="2.5"/>
  <line x1="${x1}" y1="${y - 8}" x2="${x1}" y2="${y + 8}" stroke="${SUB}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 8}" x2="${x2}" y2="${y + 8}" stroke="${SUB}" stroke-width="3"/>
  <rect x="${(x1 + x2) / 2 - (label.length * 13) / 2}" y="${y + 12}" width="${label.length * 13}" height="33" rx="7" fill="#ffffff" opacity="0.94"/>
  <text x="${(x1 + x2) / 2}" y="${y + 37}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;

function sizeArt() {
  const CM = 76;               // 1 ซม. = 76 px → เส้นผ่านศูนย์กลาง 5.8 = ~441 px
  const D = 5.8 * CM;
  const cx = 328;
  const cy = 452;
  const r = D / 2;
  const mr = MASCOT.ratio;
  let ah = D * 0.62;
  let aw = ah * mr;
  if (aw > D * 0.66) { aw = D * 0.66; ah = aw / mr; }
  // ด้านหลัง (ใบเล็กขวาล่าง): โลหะเงิน + ช่องเปิดขวด + ป้ายแม่เหล็ก
  const bx = 682;
  const by = 596;
  const br = 108;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="face" cx="0.35" cy="0.3" r="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.65" stop-color="#f1f7fb"/>
      <stop offset="1" stop-color="#dcebf4"/>
    </radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8edf2"/>
      <stop offset="0.5" stop-color="#c3ccd6"/>
      <stop offset="1" stop-color="#aab6c2"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#b9c6d2"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="94" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">ทรงกลม ขนาด 5.8 ซม.</text>
  <text x="${W / 2}" y="136" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ขนาดเดียว · ขายเป็นเซ็ต เซ็ตละ 2 ชิ้น</text>

  <!-- ด้านหน้า: หน้าปัดกลมพิมพ์ลาย (งานกระดาษ Digital เคลือบผิว) -->
  <circle cx="${cx + 8}" cy="${cy + 12}" r="${r}" fill="#0f172a" opacity="0.08"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rim)"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 9}" fill="url(#face)" stroke="#c8d4de" stroke-width="2"/>
  <image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2 + 6}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  <path d="M ${cx - r * 0.62} ${cy - r * 0.62} A ${r * 0.88} ${r * 0.88} 0 0 1 ${cx + r * 0.28} ${cy - r * 0.84}"
    fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.65"/>
  ${dim(cx - r, cy + r + 44, cx + r, "5.8 ซม.")}

  <!-- ด้านหลัง: แม่เหล็ก + หัวเปิดขวดโลหะ -->
  <circle cx="${bx + 5}" cy="${by + 8}" r="${br}" fill="#0f172a" opacity="0.08"/>
  <circle cx="${bx}" cy="${by}" r="${br}" fill="url(#metal)" stroke="#98a6b3" stroke-width="3"/>
  <circle cx="${bx}" cy="${by - 26}" r="34" fill="#6b7a88"/>
  <rect x="${bx - 17}" y="${by - 44}" width="34" height="26" rx="8" fill="url(#metal)" stroke="#5d6b78" stroke-width="2.5"/>
  <rect x="${bx - 40}" y="${by + 34}" width="80" height="22" rx="11" fill="#42505d"/>
  <rect x="${bx - 40}" y="${by + 34}" width="80" height="22" rx="11" fill="none" stroke="#2e3a45" stroke-width="2" stroke-dasharray="6 5"/>
  <rect x="${bx - 128}" y="${by + br + 22}" width="256" height="42" rx="21" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${bx}" y="${by + br + 51}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">ด้านหลังมีแม่เหล็ก</text>

  <text x="${W / 2}" y="${H - 74}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ใช้เปิดขวด + ติดตู้เย็นได้ในชิ้นเดียว · ลายในภาพเป็นตัวอย่างตำแหน่งพิมพ์</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายตามสั่งงานกระดาษระบบ Digital · 1 เซ็ตเลือกเคลือบได้ 1 แบบ</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-5-8cm-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — หน้าปัด 5.8 ซม. + ด้านหลังแม่เหล็ก`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/bottle-opener/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

const sizeGroup = {
  label: SIZE_GROUP,
  choices: [{
    name: SIZE_CHOICE,
    desc: "เส้นผ่านศูนย์กลาง 5.8 ซม. ด้านหลังเป็นแม่เหล็ก ติดตู้เย็นได้ · ขายเป็นเซ็ต เซ็ตละ 2 ชิ้น",
    imageSrc: sizeUrl,
  }],
};

// รันซ้ำได้: มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้หน้ากลุ่ม "เคลือบแบบ"
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else {
  const atCoat = options.findIndex((o) => o.label === COAT_GROUP);
  options.splice(atCoat < 0 ? 0 : atCoat, 0, sizeGroup);
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options;
const gSize = got.find((o) => o.label === SIZE_GROUP);
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [gSize?.choices?.length === 1 && gSize.choices[0].name === SIZE_CHOICE, "ตัวเลือกขนาดไม่ตรง"],
  [gSize?.choices?.[0]?.imageSrc === sizeUrl, "ภาพตัวเลือกไม่ลง"],
  [got.findIndex((o) => o.label === SIZE_GROUP) <= got.findIndex((o) => o.label === COAT_GROUP), "กลุ่มขนาดไม่ได้อยู่หน้ากลุ่มเคลือบแบบ"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) พร้อมภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
