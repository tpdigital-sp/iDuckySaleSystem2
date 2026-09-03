#!/usr/bin/env node
/**
 * ทรงแบน (สแตนเลส) otheracrylicproducts4-4 — เพิ่มกลุ่ม "ขนาด" + ภาพประกอบตัวเลือก
 *
 *   node scripts/flat-stainless-size-option.mjs            (วาดภาพลง .cache/flat-stainless/upload ดูก่อน)
 *   node scripts/flat-stainless-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ที่เปิดขวดสแตนเลสทรงแบน เคลือบขาว มี "ขนาดเดียว" 18×4×0.2 ซม. (ตาม terms)
 * พิมพ์ซับลิเมชั่น เลือกสกรีน 1 ด้าน / 2 ด้าน (+฿10)
 *
 * ทำ 2 อย่าง:
 *   1. เพิ่มกลุ่ม "ขนาด" ไว้หน้ากลุ่ม "พิมพ์กี่ด้าน" — ตัวเลือกเดียว "18×4 ซม." ไม่บวกราคา
 *      พร้อมภาพวาด (900×900) ตัวเปิดขวด+รูเปิดฝา+ลูกศรวัด 18/4 ซม. + ป้ายหนา 0.2 ซม.
 *   2. วาดภาพ "สกรีน 1 ด้าน / 2 ด้าน" เทียบหน้า-หลังคู่กัน ตั้ง choice.imageSrc ให้กลุ่มเดิม
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);
const PEACE = await mascotDataUri("peace", 420);

const PRODUCT_ID = "otheracrylicproducts4-4";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/flat-stainless/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "18×4 ซม.";
const SIDE_GROUP = "พิมพ์กี่ด้าน";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ hologram-bag-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- ผิวสแตนเลสเคลือบขาว — ไล่เฉดเทาอ่อนให้ดูเป็นโลหะ -->
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f1f5f9"/>
      <stop offset="0.35" stop-color="#ffffff"/>
      <stop offset="0.65" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e8edf3"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, s) => `
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${s}</text>`;

const foot = (lines) => lines
  .map((t, i) => `<text x="${W / 2}" y="${H - 72 + i * 32}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${t}</text>`)
  .join("");

/**
 * ตัวเปิดขวดทรงแบน — แคปซูลตั้ง (หัว-ท้ายมน) + รูเปิดฝาแบบมุมมนใกล้ปลายบน (ตามรูปงานจริง)
 * printed: วางลายมาสคอต + ลายประกอบ + โลโก้ iducky จิ๋วเหนือรู · ไม่พิมพ์ = ผิวขาวเปล่า
 */
function opener(cx, top, bw, bh, { printed = false, mascot = HEART } = {}) {
  const x = cx - bw / 2;
  const hw = bw * 0.62;               // รูเปิดฝา
  const hh = bw * 0.72;
  const hx = cx - hw / 2;
  const hy = top + bw * 0.55;
  const r = mascot.ratio;
  let aw = bw - 26;
  let ah = aw / r;
  if (ah > bh * 0.34) { ah = bh * 0.34; aw = ah * r; }
  const acy = top + bh * 0.62;
  const deco = printed
    ? `<circle cx="${cx - bw * 0.26}" cy="${top + bh * 0.36}" r="7" fill="#ef4444"/>
       <circle cx="${cx + bw * 0.24}" cy="${top + bh * 0.42}" r="5" fill="#eab308"/>
       <circle cx="${cx + bw * 0.2}" cy="${top + bh * 0.86}" r="6" fill="#2563eb"/>
       <circle cx="${cx - bw * 0.22}" cy="${top + bh * 0.9}" r="4" fill="#ef4444"/>`
    : "";
  return `
    <rect x="${x}" y="${top}" width="${bw}" height="${bh}" rx="${bw / 2}" fill="url(#steel)" stroke="#cbd5e1" stroke-width="3"/>
    <rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" rx="${hw * 0.28}" fill="#f8fafc" stroke="#b6c2d2" stroke-width="3"/>
    <line x1="${hx + 8}" y1="${hy + hh - 7}" x2="${hx + hw - 8}" y2="${hy + hh - 7}" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
    ${printed ? `<text x="${cx}" y="${top + bw * 0.42}" font-family="${TH}" font-size="${bw * 0.17}" font-weight="700" text-anchor="middle" fill="#2563eb">iducky</text>` : ""}
    ${deco}
    ${printed ? `<image href="${mascot.uri}" x="${cx - aw / 2}" y="${acy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>` : ""}`;
}

// ── ภาพ "ขนาด 18×4 ซม." ─────────────────────────────────────────────
function sizeArt() {
  /** 1 ซม. = 30 px → ตัวเปิดขวด 4×18 = 120×540 px วางกลางการ์ด */
  const CM = 30;
  const bw = 4 * CM;
  const bh = 18 * CM;
  const cx = W / 2;
  const by = 190;
  const bx = cx - bw / 2;
  const body = `
    ${title("ขนาด 18 × 4 ซม.", "ที่เปิดขวดสแตนเลสทรงแบน — ขนาดเดียว")}
    ${opener(cx, by, bw, bh, { printed: true })}
    ${dim(bx - 36, by, bx - 36, by + bh, "18 ซม.")}
    ${dim(bx, by + bh + 34, bx + bw, by + bh + 34, "4 ซม.")}
    <g transform="translate(${cx + 168} ${by + bh / 2})">
      <rect x="-118" y="-60" width="236" height="120" rx="18" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
      <rect x="-58" y="-30" width="116" height="9" rx="4.5" fill="url(#steel)" stroke="#cbd5e1" stroke-width="2"/>
      <text x="0" y="10" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">หนา 0.2 ซม.</text>
      <text x="0" y="42" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">แบนบาง พกพาง่าย</text>
    </g>
    ${foot([
      "สแตนเลสเคลือบขาว พิมพ์ลายตามสั่งระบบซับลิเมชั่น",
      "เลือกสกรีน 1 ด้าน หรือ 2 ด้านได้ · แข็งแรง ใช้เปิดขวดได้จริง",
    ])}`;
  return frame(body);
}

// ── ภาพ "พิมพ์กี่ด้าน" — วางด้านหน้า/ด้านหลังคู่กัน ──────────────────
function sideArt(sides) {
  const two = sides === 2;
  const CM = 23;
  const bw = 4 * CM;
  const bh = 18 * CM;
  const gap = 170;
  const top = 208;
  const lx = W / 2 - gap / 2 - bw / 2;
  const rx = W / 2 + gap / 2 + bw / 2;

  const panel = (cx, label, printed, mascot) => `
    ${opener(cx, top, bw, bh, { printed, mascot })}
    <text x="${cx}" y="${top + bh + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>
    ${printed ? "" : `<text x="${cx}" y="${top + bh + 78}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#94a3b8">สแตนเลสขาว ไม่พิมพ์ลาย</text>`}`;

  const body = `
    ${title(two ? "สกรีน 2 ด้าน" : "สกรีน 1 ด้าน", two ? "มีลายทั้งด้านหน้าและด้านหลัง — คนละลายได้" : "มีลายด้านหน้า · ด้านหลังเป็นสแตนเลสเคลือบขาว")}
    ${panel(lx, "ด้านหน้า", true, HEART)}
    ${panel(rx, "ด้านหลัง", two, PEACE)}
    <g transform="translate(${W / 2} 748)">
      <rect x="-250" y="-38" width="500" height="76" rx="20" fill="${two ? "#ecfeff" : "#f8fafc"}" stroke="${two ? "#a5f3fc" : "#e2e8f0"}" stroke-width="2"/>
      <text x="0" y="9" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${two ? "#0e7490" : "#475569"}">${
        two ? "คิดเพิ่ม อันละ ฿10" : "ราคาปกติตามตารางราคา"
      }</text>
    </g>
    ${foot([
      two ? "ลายด้านหน้ากับด้านหลังใช้คนละลายได้" : "พิมพ์ซับลิเมชั่น สีสดซึมเป็นเนื้อเดียวกับผิวเคลือบ",
    ])}`;
  return frame(body);
}

const ART = {
  "size-18x4": { svg: sizeArt(), choice: SIZE_CHOICE, group: SIZE_GROUP, note: "ขนาด 18×4 ซม. + หนา 0.2 ซม." },
  "side-1": { svg: sideArt(1), choice: "สกรีน 1 ด้าน", group: SIDE_GROUP, note: "สกรีน 1 ด้าน — หลังสแตนเลสขาว" },
  "side-2": { svg: sideArt(2), choice: "สกรีน 2 ด้าน", group: SIDE_GROUP, note: "สกรีน 2 ด้าน — หน้า+หลัง (+฿10)" },
};

const files = [];
for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${name}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// 1. กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้หน้ากลุ่ม "พิมพ์กี่ด้าน"
const sizeUrl = files.find((f) => f.name === "size-18x4").url;
const sizeGroup = { label: SIZE_GROUP, choices: [{ name: SIZE_CHOICE, imageSrc: sizeUrl }] };
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else {
  const atSide = options.findIndex((o) => o.label === SIDE_GROUP);
  options.splice(atSide < 0 ? 0 : atSide, 0, sizeGroup);
}

// 2. ภาพกลุ่ม "พิมพ์กี่ด้าน"
for (const f of files.filter((f) => f.group === SIDE_GROUP)) {
  const grp = options.find((o) => o.label === SIDE_GROUP);
  const c = grp?.choices?.find((c) => c.name === f.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`); process.exit(1); }
  c.imageSrc = f.url;
}

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gotSize = back.data.options.find((o) => o.label === SIZE_GROUP)?.choices?.[0];
if (gotSize?.name !== SIZE_CHOICE || gotSize?.imageSrc !== sizeUrl) { console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", gotSize); process.exit(1); }
for (const f of files.filter((f) => f.group === SIDE_GROUP)) {
  const got = back.data.options.find((o) => o.label === SIDE_GROUP)?.choices?.find((c) => c.name === f.choice)?.imageSrc;
  if (got !== f.url) { console.error("อ่านกลับไม่ตรง!", f.choice, got); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) + ภาพ "${SIDE_GROUP}" 2 ตัว อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
