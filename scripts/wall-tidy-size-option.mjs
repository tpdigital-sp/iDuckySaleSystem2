#!/usr/bin/env node
/**
 * WALL TIDY กระเป๋าแขวนผนัง (wall-tidy) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/wall-tidy-size-option.mjs            (วาดภาพลง .cache/wall-tidy/upload ดูก่อน)
 *   node scripts/wall-tidy-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามข้อมูลสินค้า: ผ้าแคนวาส 14 ออนซ์ พิมพ์ซับลิเมชั่น ขนาดเดียว สูง 55 × กว้าง 33 ซม.
 * มี 7 ช่องใส่ของ (เรียง 2-3-2 ตามรูปงานจริง) พร้อมสายเกี่ยว+ตะขอ 2 เส้น
 *
 * เพิ่มกลุ่ม "ขนาด" (display: cards) ตัวเลือกเดียว "55×33 ซม." ไม่บวกราคา
 * พร้อมภาพวาดใหม่ (900×900) กระเป๋าแนวตั้ง 7 ช่อง + ลูกศรวัด 55/33 ซม. + ลายมาสคอต
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("peace", 360);

const PRODUCT_ID = "wall-tidy";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "55×33 ซม.";
const SIZE_DESC = "แนวตั้ง สูง 55 × กว้าง 33 ซม. · 7 ช่องใส่ของ พร้อมสายเกี่ยว 2 เส้น";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาดแนวตรง — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ sponge-size-option) */
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

/**
 * ภาพ "ขนาดกระเป๋าแขวนผนัง" — มุมมองตรงหน้า แนวตั้ง:
 * ตัวกระเป๋าพื้นพิมพ์ลายพาสเทล (ซับลิเมชั่นเต็มใบ) + ช่องใส่ของ 7 ช่อง เรียง 2-3-2
 * แถบผ้าน้ำตาลปิดท้าย + สายเกี่ยวพร้อมตะขอ 2 เส้นด้านบน · ลูกศรวัด 55 / 33 ซม.
 */
function sizeArt() {
  const CM = 9.2; // 1 ซม. = 9.2 px
  const bw = Math.round(33 * CM); // 304 กว้าง
  const bh = Math.round(55 * CM); // 506 สูง
  const bx = Math.round((W - bw) / 2) + 40; // ขยับขวา เผื่อที่ลูกศร 55 ซม. ฝั่งซ้าย
  const by = 228; // เว้นหัวภาพให้พ้นตะขอสายเกี่ยว
  const pad = 16; // ขอบในตัวกระเป๋า

  // โซนช่อง: หัวกระเป๋า (มาสคอต) → แถว 2 ช่อง → แถว 3 ช่อง → แถว 2 ช่อง → แถบน้ำตาล
  const headH = 118;
  const bandH = 34;
  const gap = 14;
  const rowsTop = by + headH;
  const rowH = Math.floor((bh - headH - bandH - pad - gap * 2) / 3); // ≈ 3 แถวเท่ากัน

  const pocketFills = ["#dff1fb", "#d9f4ec", "#fdeccb", "#fcd9ec", "#ddd8fb", "#d3ecfd", "#d9f4d4"];
  let pk = 0;
  const pocketRow = (y, n) => {
    const gw = (bw - pad * 2 - gap * (n - 1)) / n;
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = bx + pad + i * (gw + gap);
      out += `
      <rect x="${x}" y="${y}" width="${gw}" height="${rowH}" rx="10" fill="${pocketFills[pk % pocketFills.length]}" stroke="#b8c4d6" stroke-width="2.5"/>
      <line x1="${x + 8}" y1="${y + 9}" x2="${x + gw - 8}" y2="${y + 9}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 5"/>
      <circle cx="${x + gw / 2}" cy="${y + rowH / 2 + 4}" r="${Math.min(gw, rowH) * 0.16}" fill="#ffffff" opacity="0.55"/>`;
      pk++;
    }
    return out;
  };

  // สายเกี่ยว 2 เส้น + ตะขอ เหนือขอบบน
  const strap = (x) => `
    <rect x="${x - 9}" y="${by - 64}" width="18" height="70" rx="8" fill="#fdeccb" stroke="#d3bf9c" stroke-width="2.5"/>
    <line x1="${x - 9}" y1="${by - 46}" x2="${x + 9}" y2="${by - 46}" stroke="#d3bf9c" stroke-width="2"/>
    <line x1="${x - 9}" y1="${by - 28}" x2="${x + 9}" y2="${by - 28}" stroke="#d3bf9c" stroke-width="2"/>
    <path d="M ${x} ${by - 64} c 0 -22 20 -30 20 -12 c 0 12 -10 10 -12 4" fill="none" stroke="#9aa6b6" stroke-width="5.5" stroke-linecap="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#c9f0f4"/>
      <stop offset="0.55" stop-color="#bfe9f2"/>
      <stop offset="1" stop-color="#d6f4ec"/>
    </linearGradient>
    <clipPath id="bodyClip"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="14"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="82" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดกระเป๋าแขวนผนัง 55 × 33 ซม.</text>
  <text x="${W / 2}" y="118" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">แนวตั้ง · 7 ช่องใส่ของ — ขนาดเดียว</text>

  ${strap(bx + bw * 0.24)}
  ${strap(bx + bw * 0.76)}

  <!-- ตัวกระเป๋า พิมพ์ลายเต็มใบ -->
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="14" fill="url(#print)" stroke="#b8c4d6" stroke-width="3"/>
  <g clip-path="url(#bodyClip)">
    <circle cx="${bx + 42}" cy="${by + 40}" r="20" fill="#fcd3ec" opacity="0.7"/>
    <circle cx="${bx + bw - 40}" cy="${by + 70}" r="14" fill="#fdeccb" opacity="0.8"/>
    <circle cx="${bx + bw - 58}" cy="${by + bh - 60}" r="22" fill="#d9d4fb" opacity="0.7"/>
    <circle cx="${bx + 52}" cy="${by + bh - 76}" r="15" fill="#c9f2df" opacity="0.9"/>
    <!-- แถบผ้าน้ำตาลปิดท้าย -->
    <rect x="${bx}" y="${by + bh - bandH}" width="${bw}" height="${bandH}" fill="#8a6244"/>
    <line x1="${bx}" y1="${by + bh - bandH + 7}" x2="${bx + bw}" y2="${by + bh - bandH + 7}" stroke="#6f4c33" stroke-width="2" stroke-dasharray="7 5"/>
  </g>
  <!-- หัวกระเป๋า: มาสคอตแทนลายของลูกค้า -->
  <image href="${MASCOT.uri}" x="${bx + bw / 2 - (headH - 26) * MASCOT.ratio / 2}" y="${by + 10}"
    width="${(headH - 26) * MASCOT.ratio}" height="${headH - 26}" preserveAspectRatio="xMidYMid meet"/>
  <!-- ช่องใส่ของ 2-3-2 -->
  ${pocketRow(rowsTop, 2)}
  ${pocketRow(rowsTop + rowH + gap, 3)}
  ${pocketRow(rowsTop + (rowH + gap) * 2, 2)}

  <!-- ลูกศรวัด -->
  ${dim(bx - 36, by, bx - 36, by + bh, "55 ซม.")}
  ${dim(bx, by + bh + 32, bx + bw, by + bh + 32, "33 ซม.", "above")}

  <!-- ป้ายระบบพิมพ์ -->
  <rect x="${W / 2 - 225}" y="${H - 122}" width="450" height="40" rx="20" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${W / 2}" y="${H - 94}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">พิมพ์ลายของคุณเต็มใบ ระบบซับลิเมชั่น</text>
  <text x="${W / 2}" y="${H - 52}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ผ้าแคนวาส 14 ออนซ์ · สายเกี่ยวพร้อมตะขอ 2 เส้น · เลือกสีไหมเย็บได้ 13 สี</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-55x33-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — กระเป๋าแขวนผนัง 55×33 ซม.`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// กลุ่ม "ขนาด" แบบการ์ด — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้หน้าสุด
const sizeGroup = { label: SIZE_GROUP, display: "cards", choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: sizeUrl }] };
const at = options.findIndex((o) => o.label === SIZE_GROUP);
if (at >= 0) options[at] = sizeGroup;
else options.unshift(sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gotGroup = back.data.options.find((o) => o.label === SIZE_GROUP);
const got = gotGroup?.choices?.[0];
if (gotGroup?.display !== "cards" || got?.name !== SIZE_CHOICE || got?.imageSrc !== sizeUrl) { console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", gotGroup); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (cards · ${SIZE_CHOICE}) อ่านกลับตรง · savedAt =`, back.data.savedAt);
