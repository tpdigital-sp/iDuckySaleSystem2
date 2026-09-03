#!/usr/bin/env node
/**
 * Mini Calendar (mini-calendar) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/mini-calendar-size-art.mjs            (วาดภาพลง .cache/mini-calendar/upload ดูก่อน)
 *   node scripts/mini-calendar-size-art.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปคร้าน (AdminBuddy/academy-assets/print/calendar.jpg — ปฏิทินมินิ):
 *   ขนาดเดียว กว้าง 6 ซม. × สูง 8 ซม. · กระดาษ 260 แกรม · ฐานกระดาษอาร์ตขาว 400 แกรม · ห่วงสันเกลียวสีขาว
 * → กลุ่ม "ขนาด" ตัวเลือกเดียว ไม่บวกราคา วางไว้หน้าสุด (แพทเทิร์นเดียวกับ [[iducky-hologram-bag]] /
 *   ที่เปิดขวด / ฟองน้ำขัดผิว) — ราคาไม่ผูกกับกลุ่มนี้ (pricing.driverLabels ว่าง คีย์เดียว "")
 *
 * ดีไซน์: เล่มจิ๋วมองด้านหน้า (ห่วงสันเกลียว + หน้าเดือน + ฐานตั้งโต๊ะ) สเกลจริง 46 px/ซม.
 *   วางบัตรประชาชน/บัตร ATM (8.6 × 5.4 ซม.) เทียบข้าง ๆ — ของที่ทุกคนมีในกระเป๋า เห็นแล้วรู้เลยว่าจิ๋วแค่ไหน
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ · กลุ่มอื่นไม่แตะ (เช็คหลังเขียนว่าไม่หาย)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "mini-calendar";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mini-calendar/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "กว้าง 6 × สูง 8 ซม.";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลจริงทั้งใบ — 1 ซม. = 46 px (เล่ม 8 ซม. = 368 px เทียบบัตร 8.56 ซม. ได้พอดีในกรอบ) */
const CM = 46;

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 9 : y2 + 34;
  const tick = (x, y) =>
    `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 13) / 2 - 6}" y="${ly - 25}" width="${label.length * 13 + 12}" height="33" rx="7" fill="#ffffff" opacity="0.95"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** ห่วงสันเกลียวสีขาว คร่อมขอบบนของเล่ม */
function spiral(x0, x1, y) {
  const n = 7;
  const gap = (x1 - x0) / (n + 1);
  let out = "";
  for (let i = 1; i <= n; i++) {
    const cx = x0 + gap * i;
    out += `
      <ellipse cx="${cx}" cy="${y}" rx="9" ry="17" fill="none" stroke="#cbd5e1" stroke-width="5"/>
      <ellipse cx="${cx}" cy="${y - 3}" rx="9" ry="14" fill="none" stroke="#ffffff" stroke-width="4.5"/>`;
  }
  return out;
}

/** ตารางวันที่ 7 คอลัมน์ — จุดกลมแทนตัวเลข (ย่อแล้วยังอ่านออกว่าเป็นหน้าปฏิทิน) */
function monthGrid(x0, y0, w, h) {
  const cols = 7;
  const rows = 5;
  const cw = w / cols;
  const ch = h / rows;
  let out = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x0 + cw * (c + 0.5);
      const cy = y0 + ch * (r + 0.5);
      const today = r === 2 && c === 3;
      out += today
        ? `<circle cx="${cx}" cy="${cy}" r="${Math.min(cw, ch) * 0.42}" fill="${OK}"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${Math.min(cw, ch) * 0.2}" fill="#94a3b8" opacity="0.75"/>`;
    }
  }
  return out;
}

/** บัตรประชาชน/บัตร ATM 8.56 × 5.4 ซม. วางตั้ง — ของเทียบขนาด (จาง = แค่เทียบ ไม่ใช่สินค้า) */
function idCard(x0, y0) {
  const w = 5.4 * CM;
  const h = 8.56 * CM;
  return `<g opacity="0.5">
    <rect x="${x0 + 5}" y="${y0 + 9}" width="${w}" height="${h}" rx="16" fill="#0f172a" opacity="0.12"/>
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="16" fill="#eef2f7" stroke="#94a3b8" stroke-width="2.5"/>
    <rect x="${x0 + 22}" y="${y0 + 26}" width="${w - 44}" height="${h * 0.34}" rx="10" fill="#cbd5e1"/>
    <circle cx="${x0 + w / 2}" cy="${y0 + 26 + h * 0.13}" r="${h * 0.075}" fill="#94a3b8"/>
    <path d="M ${x0 + w / 2 - h * 0.11} ${y0 + 26 + h * 0.32} a ${h * 0.11} ${h * 0.1} 0 0 1 ${h * 0.22} 0 z" fill="#94a3b8"/>
    ${[0, 1, 2].map((i) => `<rect x="${x0 + 22}" y="${y0 + h * 0.5 + i * 26}" width="${(w - 44) * (i === 2 ? 0.6 : 1)}" height="12" rx="6" fill="#cbd5e1"/>`).join("")}
    <rect x="${x0 + 22}" y="${y0 + h - 52}" width="${w * 0.3}" height="${w * 0.22}" rx="7" fill="#d8dfe8" stroke="#b3bec9" stroke-width="2"/>
  </g>`;
}

function sizeArt() {
  const pw = 6 * CM;   // 276
  const ph = 8 * CM;   // 368
  const px = 148;
  const py = 246;
  const pb = py + ph;  // ขอบล่างของหน้ากระดาษ = ระดับเดียวกับขอบล่างบัตร
  const cardX = 566;
  const cardY = pb - 8.56 * CM;

  // มาสคอต = ลายลูกค้า พิมพ์ครึ่งบนของหน้า
  let ah = ph * 0.42;
  let aw = ah * MASCOT.ratio;
  if (aw > pw * 0.72) { aw = pw * 0.72; ah = aw / MASCOT.ratio; }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f2f7fb"/>
    </linearGradient>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="1" stop-color="#dde6ee"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="96" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">กว้าง 6 ซม. × สูง 8 ซม.</text>
  <text x="${W / 2}" y="140" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ขนาดเดียว · กระดาษ 260 แกรม · ฐานอาร์ตขาว 400 แกรม · ห่วงสันเกลียวสีขาว</text>

  <!-- ฐานตั้งโต๊ะ (กระดาษอาร์ตขาว) + เงาบนโต๊ะ -->
  <ellipse cx="${px + pw / 2}" cy="${pb + 60}" rx="${pw * 0.72}" ry="17" fill="#0f172a" opacity="0.08"/>
  <path d="M ${px - 26} ${pb + 52} L ${px + 16} ${pb - 4} L ${px + pw - 16} ${pb - 4} L ${px + pw + 26} ${pb + 52} Z"
    fill="url(#base)" stroke="#c9d5e0" stroke-width="2.5" stroke-linejoin="round"/>

  <!-- เล่มปฏิทิน: หน้ากระดาษ 6 × 8 ซม. -->
  <rect x="${px + 7}" y="${py + 11}" width="${pw}" height="${ph}" rx="10" fill="#0f172a" opacity="0.10"/>
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="10" fill="url(#paper)" stroke="#cbd5e1" stroke-width="2.5"/>
  <image href="${MASCOT.uri}" x="${px + (pw - aw) / 2}" y="${py + ph * 0.1}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  <line x1="${px + 22}" y1="${py + ph * 0.58}" x2="${px + pw - 22}" y2="${py + ph * 0.58}" stroke="#e2e8f0" stroke-width="2.5"/>
  <text x="${px + pw / 2}" y="${py + ph * 0.68}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}" letter-spacing="2">JANUARY</text>
  ${monthGrid(px + 24, py + ph * 0.73, pw - 48, ph * 0.22)}
  ${spiral(px, px + pw, py + 4)}

  <!-- ลูกศรวัด: กว้างใต้เล่ม · สูงด้านซ้าย -->
  ${dim(px, pb + 92, px + pw, pb + 92, "6 ซม.")}
  ${dim(px - 64, py, px - 64, pb, "8 ซม.")}

  <!-- ของเทียบขนาด: บัตรประชาชน/บัตร ATM -->
  ${idCard(cardX, cardY)}
  ${(() => {
    const label = "เทียบบัตรประชาชน 8.6 × 5.4 ซม.";
    const cx = cardX + (5.4 * CM) / 2;
    const pw2 = Math.max(5.4 * CM + 48, label.length * 12.4 + 44);
    return `<rect x="${cx - pw2 / 2}" y="${pb + 76}" width="${pw2}" height="40" rx="20" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
  <text x="${cx}" y="${pb + 103}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${SUB}">${label}</text>`;
  })()}

  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">เล่มจิ๋วตั้งโต๊ะ พอดีมุมโต๊ะทำงาน · ลายในภาพเป็นตัวอย่างตำแหน่งพิมพ์</text>
  <text x="${W / 2}" y="${H - 38}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${OK}">พิมพ์ลายตามสั่งทั้งเล่ม ระบบ Digital Printing · ไม่มีขั้นต่ำ</text>
</svg>`;
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-6x8-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — เล่ม 6×8 ซม. + บัตรประชาชนเทียบขนาด`);

const WRITE = process.argv.includes("--write");
if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)");
  process.exit(0);
}

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
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

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) {
  console.error("อัปโหลดพัง", key, upErr);
  process.exit(1);
}
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("name,data").eq("id", PRODUCT_ID).single();
if (readErr) {
  console.error(readErr);
  process.exit(1);
}
if (!/Mini Calendar/i.test(row.name)) {
  console.error(`id ${PRODUCT_ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
  process.exit(1);
}
const data = row.data;
const options = data.options ?? [];
const before = options.map((o) => o.label); // กันกลุ่มอื่นหาย ([[iducky-option-group-loss-guard]])

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: "ปฏิทินมินิมีขนาดเดียว — เล่มจิ๋วตั้งโต๊ะ พิมพ์ลายตามสั่งทั้งเล่ม",
  choices: [
    {
      name: SIZE_CHOICE,
      desc: "หน้ากระดาษ 6 × 8 ซม. หนา 260 แกรม\n• ฐานปฏิทินกระดาษอาร์ตขาว 400 แกรม\n• เข้าเล่มห่วงสันเกลียว สีขาว",
      imageSrc: sizeUrl,
    },
  ],
};

// รันซ้ำได้: มีอยู่แล้ว = เขียนทับที่เดิม, ยังไม่มี = แทรกไว้หน้าสุด (ขนาดควรเป็นสิ่งแรกที่ลูกค้าเห็น)
const at = options.findIndex((o) => o.label === SIZE_GROUP);
if (at >= 0) options[at] = sizeGroup;
else options.unshift(sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || upd?.length !== 1) {
  console.error("update พัง/ไม่ได้ 1 แถว", updErr);
  process.exit(1);
}

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === SIZE_GROUP);
const lost = before.filter((l) => l !== SIZE_GROUP && !got.some((o) => o.label === l));
const fails = [
  [back.data.savedAt === data.savedAt, "savedAt ไม่ตรง — ค่าไม่ลงจริง"],
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [g?.display === "cards", "กลุ่มขนาดไม่ได้เป็นการ์ด"],
  [g?.choices?.length === 1 && g.choices[0].name === SIZE_CHOICE, "ตัวเลือกขนาดไม่ตรง"],
  [g?.choices?.[0]?.imageSrc === sizeUrl, "ภาพตัวเลือกไม่ลง"],
  [got[0]?.label === SIZE_GROUP, "กลุ่มขนาดไม่ได้อยู่หน้าสุด"],
  [lost.length === 0, `กลุ่มเดิมหาย: ${lost.join(", ")}`],
].filter(([ok]) => !ok);
if (fails.length) {
  console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · "));
  process.exit(1);
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) แบบการ์ด อยู่หน้าสุด · กลุ่มเดิมครบ ${got.length - 1} กลุ่ม · savedAt = ${back.data.savedAt}`);
