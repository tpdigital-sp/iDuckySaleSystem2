#!/usr/bin/env node
/**
 * กล่องดนตรีติดตู้เย็น (standymusic-2) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/music-box-size-option-art.mjs           (วาดภาพลง .cache/standymusic-2/upload ดูก่อน)
 *   node scripts/music-box-size-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * สินค้าตัวนี้ "ไม่มีกลุ่มตัวเลือกเลย" (data.options = []) — ตารางราคาก็ช่องเดียว (driverLabels = [])
 * จึงเพิ่มกลุ่ม "ขนาด" ตัวเลือกเดียว ไม่บวกราคา ไม่แตะตารางราคา (ไม่กลายเป็นแกนราคา)
 *
 * ขนาด/สเปคจาก data.terms ของสินค้าเอง + รูปงานจริงในแกลเลอรี (Wix 4 ใบ):
 *   ชิ้นงาน 10 × 10 ซม. · อะคริลิค 3 ชั้น (หน้า 1mm | กลาง 5mm | หลัง 2mm สีขาว)
 *   ด้านหลังมีแม่เหล็ก 4 จุดที่มุม + ช่องลำโพงเป็นจุดไข่ปลากลางแผ่น · ขอบมีพอร์ต Type-C
 *   โยนไฟล์ MP3 ลงเองได้ (ไม่เกิน 3.5 MB ≈ 1 เพลง) · สาย iPhone ใช้ไม่ได้
 *
 * ⚠️ การ์ดใบเดียว = ไม่เข้าโหมดกระชับ → รูปเรนเดอร์ที่ 80×80 และโชว์ desc ด้วย
 *    ภาพจัตุรัส 900×900 ลงกล่องจัตุรัส = เห็นเต็มใบ ไม่ถูกครอป → วาดชิ้นงานให้เต็มเฟรม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "standymusic-2";
const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "10 × 10 ซม.";
const SIZE_DESC =
  "ชิ้นงาน 10 × 10 ซม. (ขนาดเดียว) · อะคริลิค 3 ชั้น หน้า 1 มม. | กลาง 5 มม. | หลัง 2 มม. (ขาว)\nหลังมีแม่เหล็ก 4 จุด ติดตู้เย็นได้เลย · โหลดเพลง MP3 ลงเองผ่านสาย Type-C";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/standymusic-2/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** แผ่นงานจริง 10 ซม. → 560 px (1 ซม. = 56 px) */
const CM = 56;
const PW = 10 * CM;
const PX = 128;
const PY = 108;

/** ลูกศรวัดขนาด — ขีดปลายสองข้าง + ป้ายตัวเลขคร่อมเส้น */
const dim = (x1, y1, x2, y2, label) => {
  const vert = x1 === x2;
  const lx = (x1 + x2) / 2;
  const ly = (y1 + y2) / 2;
  const lw = label.length * 15 + 26;
  const tick = (x, y) =>
    vert
      ? `<line x1="${x - 11}" y1="${y}" x2="${x + 11}" y2="${y}" stroke="${SUB}" stroke-width="3"/>`
      : `<line x1="${x}" y1="${y - 11}" x2="${x}" y2="${y + 11}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - lw / 2}" y="${ly - 21}" width="${lw}" height="42" rx="10" fill="#ffffff" opacity="0.95"/>
    <text x="${lx}" y="${ly + 11}" font-family="${TH}" font-size="29" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** ลายพิมพ์บนแผ่น — หน้าจอเครื่องเล่นเพลง (ตามรูปงานจริงในแกลเลอรี) */
const playerArt = (x, y, s) => {
  const mw = s * 0.42 * MASCOT.ratio;
  const mh = s * 0.42;
  const barY = y + s * 0.775;
  const ctrlY = y + s * 0.875;
  const icon = (cx, d) => `
    <path d="M ${cx - d} ${ctrlY - d} L ${cx - d} ${ctrlY + d} M ${cx - d} ${ctrlY} L ${cx + d * 0.7} ${ctrlY - d}
      L ${cx + d * 0.7} ${ctrlY + d} Z" fill="#ffffff" opacity="0.92"/>`;
  return `
  <!-- กรอบรูปในลาย -->
  <rect x="${x + s * 0.085}" y="${y + s * 0.1}" width="${s * 0.83}" height="${s * 0.5}" rx="6" fill="#ffffff" opacity="0.92"/>
  <rect x="${x + s * 0.105}" y="${y + s * 0.12}" width="${s * 0.79}" height="${s * 0.4}" rx="3" fill="#7fc6e8"/>
  <rect x="${x + s * 0.105}" y="${y + s * 0.36}" width="${s * 0.79}" height="${s * 0.16}" rx="0" fill="#4ea9d8"/>
  <image href="${MASCOT.uri}" x="${x + s / 2 - mw / 2}" y="${y + s * 0.5 - mh}" width="${mw}" height="${mh}"
    preserveAspectRatio="xMidYMid meet"/>
  <text x="${x + s / 2}" y="${y + s * 0.585}" font-family="${TH}" font-size="${s * 0.036}"
    text-anchor="middle" fill="#1d4ed8">- ใส่รูป + เพลงของคุณเองได้ -</text>
  <!-- ปุ่มหน้าต่างมุมขวาบน -->
  ${[0, 1, 2]
    .map(
      (i) =>
        `<rect x="${x + s * 0.79 + i * s * 0.045}" y="${y + s * 0.045}" width="${s * 0.036}" height="${s * 0.036}"
           rx="2" fill="none" stroke="#1d4ed8" stroke-width="1.6"/>`
    )
    .join("")}
  <!-- ชื่อเพลง + แถบเวลา -->
  <text x="${x + s / 2}" y="${y + s * 0.705}" font-family="${TH}" font-size="${s * 0.072}"
    text-anchor="middle" fill="#ffffff" opacity="0.95">Day after day</text>
  <line x1="${x + s * 0.2}" y1="${barY}" x2="${x + s * 0.8}" y2="${barY}" stroke="#ffffff" stroke-width="3" opacity="0.85"/>
  <line x1="${x + s * 0.2}" y1="${barY}" x2="${x + s * 0.62}" y2="${barY}" stroke="#1e3a8a" stroke-width="3.4" opacity="0.7"/>
  <circle cx="${x + s * 0.62}" cy="${barY}" r="${s * 0.016}" fill="#ffffff"/>
  <text x="${x + s * 0.155}" y="${barY + s * 0.032}" font-family="${TH}" font-size="${s * 0.032}" fill="#ffffff" opacity="0.9">3:45</text>
  <text x="${x + s * 0.845}" y="${barY + s * 0.032}" font-family="${TH}" font-size="${s * 0.032}" text-anchor="end" fill="#ffffff" opacity="0.9">4:49</text>
  <!-- แถวปุ่มควบคุม + ปุ่มกดจริงสีดำตรงกลาง -->
  <path d="M ${x + s * 0.245} ${ctrlY - s * 0.018} a ${s * 0.017} ${s * 0.017} 0 0 1 ${s * 0.032} 0
    a ${s * 0.017} ${s * 0.017} 0 0 1 ${s * 0.032} 0 q 0 ${s * 0.026} -${s * 0.032} ${s * 0.042}
    q -${s * 0.032} -${s * 0.016} -${s * 0.032} -${s * 0.042} z" fill="#ffffff" opacity="0.9"/>
  ${icon(x + s * 0.365, s * 0.026)}
  <g transform="rotate(180 ${x + s * 0.635} ${ctrlY})">${icon(x + s * 0.635, s * 0.026)}</g>
  <path d="M ${x + s * 0.735} ${ctrlY - s * 0.03} l ${s * 0.011} ${s * 0.022} ${s * 0.024} 0.5
    -${s * 0.019} ${s * 0.016} 0.007 ${s * 0.024} -${s * 0.023} -${s * 0.013} -${s * 0.023} ${s * 0.013}
    0.007 -${s * 0.024} -${s * 0.019} -${s * 0.016} ${s * 0.024} -0.5 z" fill="#ffffff" opacity="0.9"/>
  <circle cx="${x + s / 2}" cy="${ctrlY}" r="${s * 0.052}" fill="#111827"/>
  <circle cx="${x + s / 2}" cy="${ctrlY}" r="${s * 0.052}" fill="none" stroke="#0b1220" stroke-width="2" opacity="0.6"/>`;
};

/** แผ่นกล่องดนตรีมองจากด้านหน้า */
const plateFront = (x, y, s) => `
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="#cfe0fb"/>
      <stop offset="0.45" stop-color="#8ab4ec"/>
      <stop offset="1" stop-color="#3a6fc4"/>
    </linearGradient>
  </defs>
  <rect x="${x + 6}" y="${y + 12}" width="${s}" height="${s}" rx="20" fill="#0f172a" opacity="0.13"/>
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="20" fill="url(#plate)"/>
  ${playerArt(x, y, s)}
  <!-- ขอบอะคริลิคใสหนา 8 มม. (1+5+2) -->
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="20" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.55"/>
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="20" fill="none" stroke="#94a3b8" stroke-width="1.6"/>
  <!-- แสงสะท้อนผิวอะคริลิค -->
  <path d="M ${x + s * 0.06} ${y + s} L ${x + s * 0.42} ${y} L ${x + s * 0.6} ${y} L ${x + s * 0.24} ${y + s} Z"
    fill="#ffffff" opacity="0.09"/>`;

/** ด้านหลัง — แผ่นขาว แม่เหล็ก 4 จุด + ช่องลำโพงจุดไข่ปลา */
const plateBack = (x, y, s) => {
  const dots = [];
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) {
      const dx = x + s / 2 + (c - 3) * s * 0.035;
      const dy = y + s / 2 + (r - 3) * s * 0.035;
      if (Math.hypot(c - 3, r - 3) > 3.4) continue;
      dots.push(`<circle cx="${dx}" cy="${dy}" r="${s * 0.008}" fill="#cbd5e1"/>`);
    }
  const mag = (mx, my) => `
    <circle cx="${mx}" cy="${my}" r="${s * 0.088}" fill="#6b4a44"/>
    <circle cx="${mx}" cy="${my}" r="${s * 0.088}" fill="none" stroke="#4d332e" stroke-width="1.5"/>
    <ellipse cx="${mx - s * 0.026}" cy="${my - s * 0.03}" rx="${s * 0.03}" ry="${s * 0.017}" fill="#ffffff" opacity="0.18"/>`;
  const p = s * 0.19;
  return `
  <rect x="${x + 4}" y="${y + 8}" width="${s}" height="${s}" rx="14" fill="#0f172a" opacity="0.1"/>
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="14" fill="#fbfcfe" stroke="#d8dee7" stroke-width="2"/>
  ${dots.join("")}
  ${mag(x + p, y + p)}${mag(x + s - p, y + p)}${mag(x + p, y + s - p)}${mag(x + s - p, y + s - p)}`;
};

function card() {
  const plateR = PX + PW;
  const plateB = PY + PW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="26" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  ${plateFront(PX, PY, PW)}

  <!-- ลูกศรวัด 10 × 10 ซม. -->
  ${dim(PX, PY - 46, plateR, PY - 46, "10 ซม.")}
  ${dim(plateR + 46, PY, plateR + 46, plateB, "10 ซม.")}

  <!-- พอร์ต Type-C ที่ขอบล่าง -->
  <rect x="${PX + PW * 0.5 - 34}" y="${plateB - 3}" width="68" height="15" rx="7.5" fill="#1f2937"/>
  <text x="${PX + PW * 0.5 + 96}" y="${plateB + 30}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">พอร์ต Type-C</text>

  <!-- ด้านหลัง: แม่เหล็ก 4 จุด -->
  ${plateBack(632, 700, 150)}
  <text x="707" y="878" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ด้านหลัง · แม่เหล็ก 4 จุด</text>

  <!-- สเปคชั้นอะคริลิค -->
  <rect x="60" y="716" width="520" height="52" rx="26" fill="#ecfeff" stroke="#a5f3fc" stroke-width="2.5"/>
  <text x="320" y="750" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${OK}">อะคริลิค 3 ชั้น · หน้า 1 | กลาง 5 | หลัง 2 มม.</text>
  <text x="320" y="806" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">ขนาดเดียว 10 × 10 ซม. · ติดตู้เย็นได้เลย</text>
  <text x="320" y="848" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">โหลดเพลง MP3 ลงเองผ่านสาย Type-C (ไม่เกิน 3.5 MB)</text>
</svg>`;
}

const buf = await sharp(Buffer.from(card())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-10x10-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
/* ตรวจแบบที่หน้าเว็บเห็นจริง — การ์ด 80px (ภาพจัตุรัสลงกล่องจัตุรัส = ย่อทั้งใบ ไม่ครอป) */
await sharp(buf).resize(80, 80).resize(320, 320, { kernel: "nearest" }).toFile(`${OUT}/_thumb80-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — แผ่น 10×10 + ด้านหลังแม่เหล็ก 4 จุด`);
console.log(`🔎 ${OUT}/_thumb80-${FILE} — ย่อ 80px แบบที่การ์ดเห็นจริง`);

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

/* รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ */
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  choices: [{ name: SIZE_CHOICE, imageSrc: sizeUrl, desc: SIZE_DESC }],
};
const at = options.findIndex((o) => o.label === SIZE_GROUP);
if (at >= 0) options[at] = sizeGroup;
else options.unshift(sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
const c = g?.choices?.[0];
if (g?.display !== "cards" || c?.name !== SIZE_CHOICE || c?.imageSrc !== sizeUrl || c?.desc !== SIZE_DESC) {
  console.error("อ่านกลับไม่ตรง!", JSON.stringify(g)); process.exit(1);
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) แบบการ์ด + ภาพ อ่านกลับตรง · savedAt =`, back.data.savedAt);
