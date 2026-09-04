#!/usr/bin/env node
/**
 * Light Box (light-box) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบตัวเลือก
 *
 *   node scripts/light-box-size-option.mjs           (วาดภาพลง .cache/light-box/upload ดูก่อน)
 *   node scripts/light-box-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค: 60_ตกแต่งและงานแสดง/LightBox/P-LightBox-01.jpg + P-Howto LightB-01.jpg
 *   Light Box = กรอบไม้ + แผ่นอะคริลิคใส หนา 1.5 มม. **ขนาดเดียว A5 14.8 × 21 ซม.**
 *   แสงไฟ three-color light เปลี่ยนสี + ปรับความสว่างได้ · สายเสียบ USB มีปุ่มเปิด-ปิด
 *   ด้านหลังไม่มีขาตั้ง แต่ตั้งเองได้ไม่ล้ม · ออกแบบภาพซ้อนได้ 2-3 เลเยอร์ (ใบ HOW-TO แบบที่ 1/2/3)
 *   ⚠️ terms ใน DB: "กรอบจะมีการบังขอบภาพเข้าไป" — ใส่เป็น note ของกลุ่มให้ลูกค้าเผื่อขอบตอนออกแบบ
 *   ⚠️ ราคาบนใบสเปคหยุดที่ 400 (50++ ชิ้น) แต่ DB ไล่ถึง 250 (1000 กล่อง) — ไม่แตะราคาในสคริปต์นี้
 *      (เรื่องค้างเดิม ดู [[iducky-descriptions-from-sheets]])
 *
 * ของเดิมใน DB: data.options = [] (ไม่มีกลุ่มตัวเลือกเลย) → กลุ่มนี้เป็นกลุ่มแรกของสินค้า
 * ราคา: กลุ่มนี้ **ไม่ใช่แกนตารางราคา** — pricing.driverLabels = [] คีย์ราคาจึงเป็น "" ตรงกับ cells[""]
 *   การ์ดใบเดียวไม่มี extra → ยอดเงินเท่าเดิมทุกช่วงจำนวน (490…250)
 *   ยังเช็คซ้ำตอนอ่านกลับว่าชื่อกลุ่มไม่ไปชน driverLabels ([[iducky-price-driver-trap]])
 *
 * ภาพ 900×900 วาดสเกลจริง (1 ซม. = 19 px) กรอบไม้แนวนอน 21 × 14.8 ซม. เปิดไฟอยู่
 *   มี "มือถือ" (สูง ~15.5 ซม.) สเกลเดียวกันวางเทียบข้าง ๆ + ลูกศรวัดสองแกน + สาย USB พร้อมปุ่มเปิด-ปิด
 *   ในจอไฟเป็นฉากกลางคืนซ้อนเลเยอร์ (ฟ้า→ภูเขา 3 ชั้น→พื้น) มีมาสคอตเป็ดยืนแทน "ลายของลูกค้า"
 * ⚠️ การ์ด (display:"cards") ย่อภาพจัตุรัสลงกล่อง 80×80 object-cover = เห็นเต็มใบ ไม่ครอปกลาง
 *    (ต่างจากปุ่มตัวเลือกธรรมดาที่ครอป 62×62 — [[iducky-option-thumb-crop]]) จึงจัดองค์ประกอบเต็มจัตุรัส
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = ตัดทิ้งแล้ววางใหม่หน้าสุด ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "light-box";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "ขนาด";
const CHOICE = "A5 · 14.8 × 21 ซม.";
const FILE = `size-a5-${VER}.jpg`;

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const CM = 20; // 1 ซม. = 20 px → กรอบ 21 × 14.8 ซม. = 420 × 296 px

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="76" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

const pill = (cx, y, text) => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`;
};

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
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

/**
 * มือถือขนาด "คงที่" ไว้เทียบสัดส่วน — เครื่องทั่วไปสูง ~15.5 ซม. กว้าง ~7.5 ซม.
 * วาดด้วยสเกล CM เดียวกับกล่องไฟ จึงอ่านขนาดจริงของกล่องได้จากภาพเดียว
 */
const phone = (cx, cy) => {
  const w = 7.5 * CM, h = 15.5 * CM;
  const x = cx - w / 2, y = cy - h / 2;
  return `
  <g>
    <rect x="${x + 4}" y="${y + 8}" width="${w}" height="${h}" rx="${w * 0.16}" fill="#0f172a" opacity="0.08"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.16}" fill="#1e293b"/>
    <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="${w * 0.13}" fill="url(#screen)"/>
    <rect x="${cx - 13}" y="${y + 11}" width="26" height="7" rx="3.5" fill="#1e293b" opacity="0.55"/>
    <rect x="${cx - 18}" y="${y + h - 17}" width="36" height="5" rx="2.5" fill="#1e293b" opacity="0.35"/>
  </g>`;
};

/** กล่องไฟ A5 แนวนอน — กรอบไม้ + จออะคริลิคฉากกลางคืนซ้อนเลเยอร์ เปิดไฟอยู่ */
function sizeArt() {
  const BW = 21 * CM, BH = 14.8 * CM;      // 399 × 281 px = ขนาดจริงของกล่อง
  const cx = 420, cy = 340;
  const x0 = cx - BW / 2, y0 = cy - BH / 2; // 250.5 , 194.5
  const x1 = x0 + BW, y1 = y0 + BH;
  const RAIL = 1.2 * CM;                    // สันกรอบไม้ ~1.2 ซม. บังขอบภาพเข้าไป
  const ix = x0 + RAIL, iy = y0 + RAIL, iw = BW - RAIL * 2, ih = BH - RAIL * 2;

  const r = MASCOT.ratio;
  const dh = ih * 0.52, dw = dh * r;        // มาสคอตแทนลายของลูกค้า ยืนบนพื้นในฉาก

  const label = CHOICE;
  const lw = label.length * 21 + 76;
  const LABEL_Y = 530;

  return frame(`
    ${title("ขนาด A5 · 14.8 × 21 ซม.", "กรอบไม้ + อะคริลิคใส หนา 1.5 มม. — มีขนาดเดียว")}

    <defs>
      <!-- เนื้อไม้กรอบ -->
      <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d3a273"/>
        <stop offset="0.5" stop-color="#b98352"/>
        <stop offset="1" stop-color="#9a683d"/>
      </linearGradient>
      <linearGradient id="woodIn" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8c5f38"/>
        <stop offset="1" stop-color="#b07f4e"/>
      </linearGradient>
      <!-- ท้องฟ้ากลางคืนหลังจอ — เลเยอร์ที่ไฟส่องทะลุ -->
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0b2a52"/>
        <stop offset="0.55" stop-color="#12557f"/>
        <stop offset="1" stop-color="#1c7f96"/>
      </linearGradient>
      <!-- แสงฟุ้งรอบดวงจันทร์ -->
      <radialGradient id="moonGlow">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <!-- แสงไฟเรืองรอบกล่อง -->
      <radialGradient id="bloom">
        <stop offset="0" stop-color="#7dd3fc" stop-opacity="0.42"/>
        <stop offset="1" stop-color="#7dd3fc" stop-opacity="0"/>
      </radialGradient>
      <!-- จอมือถือที่ใช้เทียบขนาด -->
      <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f1f5f9"/>
        <stop offset="1" stop-color="#cbd5e1"/>
      </linearGradient>
    </defs>

    <!-- แสงเรืองรอบกล่อง (สื่อว่าเปิดไฟอยู่) -->
    <ellipse cx="${cx}" cy="${cy}" rx="${BW * 0.82}" ry="${BH * 0.95}" fill="url(#bloom)"/>

    <!-- เงาใต้กล่อง -->
    <rect x="${x0 + 7}" y="${y0 + 14}" width="${BW}" height="${BH}" rx="12" fill="#0f172a" opacity="0.10"/>

    <!-- กรอบไม้ -->
    <rect x="${x0}" y="${y0}" width="${BW}" height="${BH}" rx="12" fill="url(#wood)" stroke="#7d5327" stroke-width="2.5"/>
    <rect x="${ix - 5}" y="${iy - 5}" width="${iw + 10}" height="${ih + 10}" rx="6" fill="url(#woodIn)"/>

    <!-- จออะคริลิค: ฉากกลางคืนซ้อนเลเยอร์ -->
    <clipPath id="scr"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="4"/></clipPath>
    <g clip-path="url(#scr)">
      <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="url(#sky)"/>
      <!-- ดาว -->
      ${[[0.12, 0.16], [0.27, 0.09], [0.43, 0.2], [0.62, 0.12], [0.78, 0.24], [0.9, 0.14], [0.2, 0.3], [0.55, 0.28]]
        .map(([fx, fy], i) => `<circle cx="${ix + iw * fx}" cy="${iy + ih * fy}" r="${i % 3 === 0 ? 2.6 : 1.8}" fill="#ffffff" opacity="0.85"/>`).join("")}
      <!-- ดวงจันทร์ + แสงฟุ้ง -->
      <circle cx="${ix + iw * 0.74}" cy="${iy + ih * 0.2}" r="46" fill="url(#moonGlow)"/>
      <circle cx="${ix + iw * 0.74}" cy="${iy + ih * 0.2}" r="19" fill="#fdfdf4"/>
      <!-- ภูเขา 3 ชั้น = เลเยอร์ซ้อน (ไกล→ใกล้ เข้มขึ้นทีละชั้น) -->
      <path d="M ${ix} ${iy + ih * 0.66} L ${ix + iw * 0.22} ${iy + ih * 0.4} L ${ix + iw * 0.46} ${iy + ih * 0.68}
               L ${ix + iw * 0.68} ${iy + ih * 0.42} L ${ix + iw} ${iy + ih * 0.7} L ${ix + iw} ${iy + ih} L ${ix} ${iy + ih} Z"
        fill="#3a86b8" opacity="0.95"/>
      <path d="M ${ix} ${iy + ih * 0.78} L ${ix + iw * 0.3} ${iy + ih * 0.54} L ${ix + iw * 0.58} ${iy + ih * 0.8}
               L ${ix + iw * 0.84} ${iy + ih * 0.58} L ${ix + iw} ${iy + ih * 0.76} L ${ix + iw} ${iy + ih} L ${ix} ${iy + ih} Z"
        fill="#1d5580" opacity="0.97"/>
      <path d="M ${ix} ${iy + ih * 0.88} L ${ix + iw * 0.36} ${iy + ih * 0.72} L ${ix + iw * 0.7} ${iy + ih * 0.9}
               L ${ix + iw} ${iy + ih * 0.78} L ${ix + iw} ${iy + ih} L ${ix} ${iy + ih} Z"
        fill="#0a2036"/>
      <!-- มาสคอตแทนลายของลูกค้า ยืนบนชั้นหน้าสุด -->
      <image href="${MASCOT.uri}" x="${ix + iw * 0.24 - dw / 2}" y="${iy + ih - dh - 6}" width="${dw}" height="${dh}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <!-- ขอบในกรอบ + แสงสะท้อนบนอะคริลิค -->
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="4" fill="none" stroke="#6d4620" stroke-width="2"/>
    <path d="M ${ix + 6} ${iy + ih * 0.52} L ${ix + iw * 0.2} ${iy + 6} L ${ix + iw * 0.33} ${iy + 6} L ${ix + 6} ${iy + ih * 0.86} Z"
      fill="#ffffff" opacity="0.07"/>

    <!-- สาย USB + ปุ่มเปิด-ปิด ออกทางขวาล่าง (ฝั่งซ้ายเป็นลูกศรวัดความสูง) -->
    <path d="M ${x1 - 26} ${y1} C ${x1 + 26} ${y1 + 40}, ${x1 + 14} ${y1 + 92}, ${x1 + 62} ${y1 + 120}"
      fill="none" stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/>
    <g transform="translate(${x1 + 58} ${y1 + 108}) rotate(14)">
      <rect x="0" y="0" width="58" height="26" rx="8" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>
      ${[0, 1, 2].map((i) => `<circle cx="${13 + i * 16}" cy="13" r="4.2" fill="${["#f87171", "#4ade80", "#60a5fa"][i]}"/>`).join("")}
    </g>
    <text x="776" y="${y1 + 176}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">สาย USB + ปุ่มเปิด-ปิด</text>

    <!-- ลูกศรวัดสองแกน (วัดตัวกรอบ) -->
    ${dim(x0, y0 - 30, x1, y0 - 30, "21 ซม.", "above")}
    ${dim(x0 - 34, y0, x0 - 34, y1, "14.8 ซม.")}

    <!-- มือถือเทียบสัดส่วน สูง ~15.5 ซม. วาดสเกลเดียวกับกล่อง -->
    ${phone(782, 340)}
    <text x="782" y="516" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">มือถือทั่วไป</text>
    <text x="782" y="542" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">(สูง ~15.5 ซม.)</text>

    <!-- ป้ายขนาดตัวใหญ่ คาบขอบล่างของกล่องไว้ ให้อ่านออกตั้งแต่ตอนย่อเป็นการ์ด -->
    <rect x="${(W - lw) / 2}" y="${LABEL_Y - 36}" width="${lw}" height="72" rx="36" fill="#ffffff" opacity="0.95" stroke="${OK}" stroke-width="3"/>
    <text x="${W / 2}" y="${LABEL_Y + 16}" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>

    ${pill(W / 2, 700, "ขนาดเดียว รวมในราคาสินค้าแล้ว")}
    ${foot([
      "อะคริลิคใส หนา 1.5 มม. · ออกแบบภาพซ้อนได้ 2-3 เลเยอร์",
      "ไฟ three-color เปลี่ยนสีและปรับความสว่างได้ · ด้านหลังไม่มีขาตั้ง แต่ตั้งเองได้ไม่ล้ม",
      "กรอบบังขอบภาพเข้าไปเล็กน้อย — วางส่วนสำคัญของลายไว้กลางภาพ",
    ])}`);
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
// ย่อ 80×80 เก็บไว้ดูด้วย — คือขนาดที่ลูกค้าเห็นจริงบนการ์ดตัวเลือก
await sharp(buf).resize(80, 80).toFile(`${OUT}/thumb-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

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
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", url);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const sizeGroup = {
  label: GROUP,
  display: "cards",
  note: "Light Box มีขนาดเดียว A5 14.8 × 21 ซม. · กรอบบังขอบภาพเข้าไปเล็กน้อย — วางส่วนสำคัญของลายไว้กลางภาพ",
  choices: [{
    name: CHOICE,
    popular: true,
    imageSrc: url,
    desc: "กรอบไม้ + อะคริลิคใส หนา 1.5 มม. · ไฟ three-color เปลี่ยนสีและปรับความสว่างได้ · สายเสียบ USB มีปุ่มเปิด-ปิด — รวมในราคาแล้ว",
  }],
};

// รันซ้ำได้: ตัดกลุ่มเดิมทิ้งก่อน แล้ววางไว้หน้าสุด
const options = (data.options ?? []).filter((o) => o.label !== GROUP);
data.options = [sizeGroup, ...options];
data.savedAt = new Date().toISOString();   // ?v=savedAt กันแคชรูป ([[iducky-image-cache-bust]])
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === GROUP);
const fails = [
  [got.filter((o) => o.label === GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [g?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [g?.choices?.length === 1, "จำนวนการ์ดไม่ใช่ 1 ใบ"],
  [g?.choices?.[0]?.name === CHOICE, "ชื่อการ์ดไม่ตรง"],
  [g?.choices?.[0]?.imageSrc === url, "ภาพการ์ดไม่ตรง"],
  [!g?.choices?.[0]?.extra, "การ์ดขนาดเดียวต้องไม่บวกราคา"],
  [!!g?.choices?.[0]?.desc, "การ์ดขาดคำอธิบาย"],
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 250 && back.data.priceMax === 490, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [JSON.stringify(back.data.pricing?.cells) === JSON.stringify({ "": [490, 450, 400, 350, 300, 280, 250] }), "ตารางราคาเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด 1 ใบ (${CHOICE}) + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
console.log("ราคาต่อกล่องเท่าเดิมทุกช่วงจำนวน: 490 / 450 / 400 / 350 / 300 / 280 / 250");
