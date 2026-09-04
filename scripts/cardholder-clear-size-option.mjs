#!/usr/bin/env node
/**
 * CARD HOLDER (พลาสติกใส) — cardholder-clear
 * เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด (display:"cards") + ภาพประกอบวาดเอง
 *
 *   node scripts/cardholder-clear-size-option.mjs           (วาดภาพลง .cache/cardholder-clear/upload ดูก่อน)
 *   node scripts/cardholder-clear-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ── ขนาดมาจากไหน ───────────────────────────────────────────────────
 * ใบราคาร้าน (30_อุปกรณ์มือถือ/Card-Holder/ราคา.jpg) ไม่ได้เขียนขนาดไว้เลย
 * เอาจาก 2 แหล่งที่วัดได้จริง:
 *  1) **เทมเพลตอาร์ตเวิร์กของร้าน** `/Volumes/iDuckyShop/All Template/24 Card Holder - Card PVC/Card holder ใส -.ai`
 *     คลายสตรีมในไฟล์ .ai แล้ววัดเส้นไดคัทจริง: กรอบนอก 184.855 × 298.439 pt = **65.2 × 105.3 มม.**
 *     → ปัดเป็น **6.5 × 10.5 ซม.** · มุมโค้ง r ≈ 1.5 มม.
 *     ช่องร้อยโซ่บนสุด 42.09 × 12.47 pt = 14.9 × 4.4 มม. อยู่กลางใบ ห่างขอบบน ~4.3 มม.
 *     (เทียบความถูกต้องของวิธีวัด: ไฟล์ `FrameCard ใส -.ai` ในโฟลเดอร์เดียวกันวัดได้ 69.5 × 99.5 มม.
 *      = FRAME CARD 7 × 10 ซม. พอดี — วิธีนี้เชื่อได้)
 *  2) **ซองสินค้าในรูปใบราคา** (优和 水晶系列 6616) พิมพ์ว่า 规格 54×85mm · 可入2片IC卡
 *     = ขนาด "บัตร" ที่ใส่ได้ (บัตรมาตรฐาน 5.4 × 8.5 ซม.) ใส่ได้ 2 ใบ — ไม่ใช่ขนาดตัวการ์ด
 *  ⚠️ ตัวการ์ด (6.5 × 10.5) ใหญ่กว่าบัตรที่ใส่ (5.4 × 8.5) เพราะมีกรอบพลาสติกรอบบัตร
 *     กรอบนี้บังขอบบัตรไว้ข้างละ ~6 มม. — ในภาพจึงวาดช่องใสเล็กกว่าตัวบัตรจริง ตรงกับรูปสินค้า
 *
 * มีขนาดเดียว (ใบราคามีการ์ดใสตัวเดียว 100 บาท · ตัวเล็ก 7×10 คือ FRAME CARD คนละสินค้า)
 * กลุ่มนี้ **ไม่ใช่แกนตารางราคา** — pricing.driverLabels = ["สกรีน"] ห้ามแตะ ([[iducky-price-driver-trap]])
 *
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (พิกัด 300–600) — ป้ายขนาดจึงวางไว้บนหัวบัตรกลางใบ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "cardholder-clear";
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "6.5 × 10.5 ซม.";
const SIZE_DESC = "ขนาดเดียว · ช่องใส่บัตรมาตรฐาน 5.4 × 8.5 ซม. ใส่ได้ 2 ใบ · แถมโซ่ไข่ปลาสีเงิน";

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 32 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

// ── ตัวสินค้า: การ์ดใส่บัตรพลาสติกใส สกรีนเต็มใบ + ช่องใสตรงกลาง ───────
const CM = 43;                       // 1 ซม. = 43 px
const BW = 6.5 * CM;                 // กว้าง 279.5
const BH = 10.5 * CM;                // สูง 451.5
const CX = 450;                      // กลางใบ
const TOP = 268;                     // ขอบบนตัวการ์ด (เว้นที่ให้โซ่ไข่ปลาด้านบน)
const BOT = TOP + BH;                // 719.5
const L = CX - BW / 2, R = CX + BW / 2;
const RAD = 1.5 * CM / 10;           // มุมโค้ง 1.5 มม.

/** ช่องใสตรงกลาง (ที่มองเห็นบัตร) — กรอบสกรีนบังขอบบัตรไว้ ตามรูปสินค้าจริง */
const WL = L + 0.18 * BW, WR = R - 0.18 * BW;
const WT = TOP + 0.15 * BH, WB = BOT - 0.06 * BH;
const WW = WR - WL, WH = WB - WT;

/** ช่องร้อยโซ่บนสุด 14.9 × 4.4 มม. ห่างขอบบน 4.3 มม. */
const SLOT_W = 1.49 * CM, SLOT_H = 0.44 * CM, SLOT_Y = TOP + 0.43 * CM;

/** บัตรที่สอดอยู่ข้างใน (มาตรฐาน 5.4 × 8.5 ซม.) — วาดสเกลเดียวกับตัวการ์ด */
const CARD_W = 5.4 * CM, CARD_H = 8.5 * CM;
const CARD_L = CX - CARD_W / 2, CARD_B = BOT - 16, CARD_T = CARD_B - CARD_H;

/** โซ่ไข่ปลา — เม็ดกลมเงินเรียงตามส่วนโค้งครึ่งวงรีที่ลอดช่องบนสุด + หัวต่อตรงช่อง */
function ballChain() {
  const cy = SLOT_Y + SLOT_H / 2, rx = 46, ry = 122;
  let out = "";
  for (let i = 0; i <= 26; i++) {
    const t = Math.PI * (i / 26);
    const x = CX - rx * Math.cos(t), y = cy - ry * Math.sin(t);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="url(#bead)" stroke="#94a3b8" stroke-width="1"/>`;
  }
  return out;
}

/** ดาว 5 แฉก / หัวใจ — ลายเล็ก ๆ บนกรอบสกรีน (แทนลายลูกค้า) */
const star = (cx, cy, r, fill, op = 1) => {
  const p = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${p}" fill="${fill}" opacity="${op}"/>`;
};
const heart = (cx, cy, s, fill, op = 1) => `<path d="M ${cx} ${cy + s * 0.75}
  C ${cx - s * 1.2} ${cy - s * 0.1} ${cx - s * 0.5} ${cy - s * 0.95} ${cx} ${cy - s * 0.25}
  C ${cx + s * 0.5} ${cy - s * 0.95} ${cx + s * 1.2} ${cy - s * 0.1} ${cx} ${cy + s * 0.75} Z"
  fill="${fill}" opacity="${op}"/>`;

/** ลายบนกรอบสกรีน — เรียงเฉพาะ "แถบกรอบ" รอบช่องใส ไม่ทับตัวบัตร */
function printMotifs() {
  const WHITE = "#ffffff", YEL = "#ffe08a", PINK = "#ffb3cd", SKY = "#8ad2ef";
  const spots = [
    // แถบซ้าย
    [335, 372, "s", 15, YEL], [333, 424, "h", 12, PINK], [337, 474, "d", 6, WHITE],
    [334, 522, "s", 13, WHITE], [336, 574, "h", 11, SKY], [333, 624, "s", 14, YEL], [337, 666, "d", 5, WHITE],
    // แถบขวา
    [565, 362, "h", 12, PINK], [567, 412, "s", 14, WHITE], [563, 462, "d", 6, WHITE],
    [566, 512, "s", 15, YEL], [564, 562, "h", 11, PINK], [567, 612, "d", 5, WHITE], [563, 658, "s", 13, SKY],
    // แถบบน
    [332, 302, "s", 13, WHITE], [371, 292, "h", 10, PINK], [404, 314, "d", 5, WHITE],
    [497, 314, "d", 5, WHITE], [530, 292, "s", 12, YEL], [568, 303, "h", 10, SKY],
    // แถบล่าง
    [341, 706, "h", 10, PINK], [392, 700, "s", 12, WHITE], [450, 708, "d", 5, WHITE],
    [509, 701, "h", 10, SKY], [559, 706, "s", 12, YEL],
  ];
  return spots.map(([x, y, k, s, c]) =>
    k === "s" ? star(x, y, s, c, 0.92) : k === "h" ? heart(x, y, s, c, 0.9)
      : `<circle cx="${x}" cy="${y}" r="${s}" fill="${c}" opacity="0.85"/>`).join("");
}

function sizeArt() {
  const r = MASCOT.ratio;
  const PHOTO = 132;                       // กรอบรูปบนบัตร (มาสคอตแทนลายลูกค้า)
  let ah = PHOTO - 16, aw = ah * r;
  if (aw > PHOTO - 12) { aw = PHOTO - 12; ah = aw / r; }
  const photoY = 404;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- เม็ดโซ่ไข่ปลาสีเงิน -->
    <radialGradient id="bead" cx="0.34" cy="0.3" r="0.85">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#dbe2ea"/><stop offset="1" stop-color="#9aa7b6"/>
    </radialGradient>
    <!-- ลายสกรีนพาสเทล ชมพู→ฟ้า แบบงานจริงของร้าน (แทนลายลูกค้า) -->
    <linearGradient id="print" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#ffc3dc"/><stop offset="0.45" stop-color="#bfe3fb"/><stop offset="1" stop-color="#77cfe8"/>
    </linearGradient>
    <!-- เนื้อบัตรที่ใส่อยู่ข้างใน (มองผ่านช่องใส) -->
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1f5f9"/>
    </linearGradient>
    <clipPath id="bodyClip">
      <rect x="${L}" y="${TOP}" width="${BW}" height="${BH}" rx="${RAD}"/>
    </clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${CX}" y="86" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 6.5 × 10.5 ซม.</text>
  <text x="${CX}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">การ์ดใส่บัตรพลาสติกใส — มีขนาดเดียว</text>

  <!-- โซ่ไข่ปลาลอดช่องบนสุด -->
  ${ballChain()}

  <!-- ตัวการ์ด: เงา + กรอบสกรีนเต็มใบ -->
  <rect x="${L + 5}" y="${TOP + 12}" width="${BW}" height="${BH}" rx="${RAD}" fill="#0f172a" opacity="0.08"/>
  <g clip-path="url(#bodyClip)">
    <rect x="${L}" y="${TOP}" width="${BW}" height="${BH}" fill="url(#print)"/>
    ${printMotifs()}
    <!-- ขอบสกรีนฟุ้งขาวเล็กน้อย ตามที่ร้านแจ้งไว้ในเงื่อนไข -->
    <rect x="${L}" y="${TOP}" width="${BW}" height="${BH}" rx="${RAD}" fill="none" stroke="#ffffff" stroke-width="13" opacity="0.38"/>
  </g>
  <rect x="${L}" y="${TOP}" width="${BW}" height="${BH}" rx="${RAD}" fill="none" stroke="#8fbccb" stroke-width="2.5"/>

  <!-- ช่องใสตรงกลาง = เห็นบัตรที่ใส่อยู่ -->
  <rect x="${WL}" y="${WT}" width="${WW}" height="${WH}" rx="7" fill="url(#card)" stroke="#cbd5e1" stroke-width="2"/>
  <!-- ป้ายขนาดวางบนหัวบัตร ให้ตกอยู่ในกรอบครอปกลาง 300–600 -->
  <rect x="${CX - 76}" y="352" width="152" height="42" rx="21" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${CX}" y="381" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${OK}">6.5 × 10.5 ซม.</text>
  <!-- รูปบนบัตร (มาสคอตแทนลายลูกค้า) -->
  <rect x="${CX - PHOTO / 2}" y="${photoY}" width="${PHOTO}" height="${PHOTO}" rx="10" fill="#f0f9ff" stroke="#dbeafe" stroke-width="2"/>
  <image href="${MASCOT.uri}" x="${CX - aw / 2}" y="${photoY + (PHOTO - ah) / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  <!-- บรรทัดชื่อ/เลขที่ บนบัตร -->
  ${[0, 1, 2].map((i) => `
    <rect x="${WL + 16}" y="${560 + i * 30}" width="34" height="9" rx="4.5" fill="#cbd5e1"/>
    <rect x="${WL + 58}" y="${562 + i * 30}" width="${WW - 76}" height="5" rx="2.5" fill="#e2e8f0"/>`).join("")}
  <!-- แถบบาร์โค้ดท้ายบัตร -->
  <g>${Array.from({ length: 22 }, (_, i) => `<rect x="${WL + 26 + i * 6}" y="650" width="${i % 3 === 0 ? 3.6 : 1.8}" height="26" fill="#94a3b8"/>`).join("")}</g>

  <!-- ช่องร้อยโซ่ (เจาะทะลุ เห็นพื้นหลังการ์ด) -->
  <rect x="${CX - SLOT_W / 2}" y="${SLOT_Y}" width="${SLOT_W}" height="${SLOT_H}" rx="${SLOT_H / 2}" fill="#eef2f6" stroke="#8fbccb" stroke-width="2"/>

  <!-- แสงสะท้อนบนผิวพลาสติกใส -->
  <g clip-path="url(#bodyClip)">
    <path d="M ${L - 30} ${BOT} L ${L + 78} ${TOP - 30} L ${L + 122} ${TOP - 30} L ${L + 14} ${BOT} Z" fill="#ffffff" opacity="0.13"/>
  </g>

  <!-- เส้นประ = ขอบบัตรที่สอดอยู่ข้างใน (5.4 × 8.5 ซม. สเกลเดียวกัน) -->
  <rect x="${CARD_L}" y="${CARD_T}" width="${CARD_W}" height="${CARD_H}" rx="9"
    fill="none" stroke="${OK}" stroke-width="2" stroke-dasharray="7 6" opacity="0.5"/>
  <line x1="${CARD_L + CARD_W}" y1="${CARD_B - 46}" x2="${CARD_L + CARD_W + 78}" y2="${CARD_B - 46}" stroke="${OK}" stroke-width="2" opacity="0.55"/>
  <circle cx="${CARD_L + CARD_W}" cy="${CARD_B - 46}" r="4" fill="${OK}" opacity="0.7"/>
  <text x="${CARD_L + CARD_W + 88}" y="${CARD_B - 51}" font-family="${TH}" font-size="20" font-weight="700" fill="${OK}">บัตรมาตรฐาน</text>
  <text x="${CARD_L + CARD_W + 88}" y="${CARD_B - 25}" font-family="${TH}" font-size="20" fill="${SUB}">5.4 × 8.5 ซม. (2 ใบ)</text>

  <!-- ลูกศรวัดสองแกน -->
  ${dim(L, BOT + 34, R, BOT + 34, "6.5 ซม.")}
  ${dim(L - 48, TOP, L - 48, BOT, "10.5 ซม.")}

  <text x="${CX}" y="${H - 68}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ตัวการ์ด 6.5 × 10.5 ซม. · ช่องใส่บัตรมาตรฐาน 5.4 × 8.5 ซม. ใส่ได้ 2 ใบ</text>
  <text x="${CX}" y="${H - 36}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">สกรีนเต็มใบล้นถึงขอบ (ขอบจะฟุ้งขาวเล็กน้อย) · แถมโซ่ไข่ปลาสีเงิน</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-6.5x10.5-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — การ์ดใส่บัตรใส 6.5 × 10.5 ซม.`);

// ครอปกลาง 300–600 ไว้เช็คหน้าตาปุ่มตัวเลือก 62×62 ก่อนเขียน DB
await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-check.jpg`);
console.log(`🔍 ${OUT}/_thumb-check.jpg — กรอบที่ปุ่มตัวเลือกจะเห็นจริง`);

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

// กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้เป็นกลุ่มแรก (ก่อนกลุ่มแกนราคา "สกรีน")
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: sizeUrl }],
};
const at = options.findIndex((o) => o.label === SIZE_GROUP);
if (at >= 0) options[at] = sizeGroup;
else options.splice(0, 0, sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
const c = g?.choices?.[0];
if (g?.display !== "cards" || c?.name !== SIZE_CHOICE || c?.desc !== SIZE_DESC || c?.imageSrc !== sizeUrl) {
  console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", JSON.stringify(g)); process.exit(1);
}
const driver = back.data.pricing?.driverLabels?.join(",");
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) การ์ด+desc+ภาพ อ่านกลับตรง · แกนราคายังเป็น [${driver}] · savedAt =`, back.data.savedAt);
