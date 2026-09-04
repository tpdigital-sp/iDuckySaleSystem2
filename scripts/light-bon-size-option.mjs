#!/usr/bin/env node
/**
 * LIGHT BON (light-bon) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบที่กลุ่มตัวเลือก
 *
 *   node scripts/light-bon-size-option.mjs            (วาดภาพลง .cache/light-bon/upload ดูก่อน)
 *   node scripts/light-bon-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค 10_อะคริลิค/แท่งไฟLED-บงไฟ/P-nแท่งไฟ-01.jpg (ครึ่งล่าง = LIGHT BON):
 *   - แท่งไฟ ขนาด +-23 cm            - กรอบวงกลม ขนาด 9.6 cm
 *   - ด้ามจับสีขาว ขนาด 13 x 3.3 CM  - ใช้ถ่าน AAA จำนวน 3 ก้อน
 *   - ขนาดอะคริลิค สูงไม่เกิน 9 cm x กว้างไม่เกิน 7 cm   - สกรีน 2 ด้าน
 *   ตัวเลข 13 / 23 ซม. ตรงกับรูปงานจริงใบที่ 5 ในแกลเลอรี (มีเส้นวัดกำกับในรูป) → เชื่อได้
 *
 * ⚠️ ตัวเลขที่ "ขัดกัน" ระหว่างใบสเปคกับ terms ในฐานข้อมูล — ภาพนี้จึงไม่พูดถึงเลย:
 *      ความหนาอะคริลิค  ใบสเปค 5 มม. / terms 3 มิล
 *      จำนวนสีไฟ        ใบสเปค 15 สี / terms + description 16 สี
 *      ขนาดด้ามจับ      ใบสเปค + รูปงานจริง 13 × 3.3 / terms 10.5 × 3.5 (ตัวเลขของ "แท่งไฟอะคริลิค" คนละตัว)
 *    ภาพใช้เฉพาะตัวเลขที่ใบสเปคกับรูปงานจริงตรงกัน — ที่เหลือรอเจ้าของร้านชี้ขาดก่อนค่อยแก้ terms
 *
 * LIGHT BON มีขนาดเดียว → กลุ่ม "ขนาด" มีตัวเลือกเดียว ไม่บวกราคา
 * ⚠️ pricing/priceRates ของตัวนี้เป็นคอลัมน์เดียว (cells [""] · driverLabels []) — กลุ่มนี้ต้องไม่เป็นแกนราคา
 *    ห้ามใส่ชื่อกลุ่มลง driverLabels ไม่งั้นคีย์ตารางราคาไม่ตรง ราคาหล่นไป product.price ([[iducky-price-driver-trap]])
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "light-bon";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/light-bon/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "กรอบวงกลม 9.6 ซม.";
const SIZE_DESC = "ขนาดเดียว — แผ่นอะคริลิคใสในกรอบ สูงไม่เกิน 9 ซม. × กว้างไม่เกิน 7 ซม. · ยาวรวมทั้งแท่งประมาณ 23 ซม. ด้ามจับสีขาว 13 × 3.3 ซม.";
const FILE = `size-globe96-${VER}.jpg`;

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CM = 25; // 1 ซม. = 25 px — ใช้สเกลเดียวกันทั้งแท่งไฟและแผ่นอะคริลิคด้านขวา จะได้เทียบขนาดกันได้

/**
 * ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลขบนแถบขาว
 * side: แนวนอน = "below"/"above" · แนวตั้ง = "left"/"right" (ป้ายไปอยู่ฝั่งนั้นของเส้น ไม่ทับเส้น)
 */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const right = side === "right";
  const lx = vertical ? x1 + (right ? 14 : -14) : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "above" ? -14 : 30);
  const bw = label.length * 12.5;
  const bx = vertical ? (right ? lx : lx - bw) : lx - bw / 2;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${bx}" y="${ly - 24}" width="${bw}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? (right ? "start" : "end") : "middle"}" fill="${SUB}">${label}</text>`;
};

/** ทรงแผ่นอะคริลิคไดคัท (โค้งมนคล้ายลายจริง) สูง h กว้าง w รอบจุด (cx, cy) */
const slabPath = (cx, cy, w, h) => {
  const rx = w / 2;
  const ry = h / 2;
  return `M ${cx} ${cy - ry}
    C ${cx + rx * 0.92} ${cy - ry * 0.82}, ${cx + rx} ${cy - ry * 0.18}, ${cx + rx * 0.86} ${cy + ry * 0.38}
    C ${cx + rx * 0.74} ${cy + ry * 0.86}, ${cx + rx * 0.32} ${cy + ry}, ${cx} ${cy + ry}
    C ${cx - rx * 0.32} ${cy + ry}, ${cx - rx * 0.74} ${cy + ry * 0.86}, ${cx - rx * 0.86} ${cy + ry * 0.38}
    C ${cx - rx} ${cy - ry * 0.18}, ${cx - rx * 0.92} ${cy - ry * 0.82}, ${cx} ${cy - ry} Z`;
};

/**
 * ภาพกลุ่ม "ขนาด" — แท่งไฟทั้งแท่งพร้อมลูกศรวัด (ซ้าย) + พื้นที่ลายบนแผ่นอะคริลิค (ขวา)
 * ทั้งสองฝั่งวาดด้วยสเกลเดียวกัน (1 ซม. = 25 px) ลูกค้าจึงเทียบได้ว่าแผ่นลายเล็กกว่ากรอบวงกลมแค่ไหน
 */
function sizeArt() {
  // ── แท่งไฟฝั่งซ้าย ──────────────────────────────────────────────
  const cx = 322;
  const R = 4.8 * CM;              // กรอบวงกลม 9.6 ซม. → รัศมี 4.8
  const topY = 205;                // ยอดกรอบวงกลม
  const cy = topY + R;             // จุดศูนย์กลางกรอบ
  const hTop = cy + R;             // ยอดด้ามจับ = ก้นกรอบ
  const hBot = hTop + 13 * CM;     // ก้นด้ามจับ (ด้าม 13 ซม.) → รวมทั้งแท่ง ≈ 22.6 ≈ 23 ซม.
  const gw = (3.3 * CM) / 2;       // ครึ่งความกว้างที่กริป 3.3 ซม.

  // ── แผ่นอะคริลิคฝั่งขวา ─────────────────────────────────────────
  const ax = 712;
  const aw = 7 * CM;               // กว้างไม่เกิน 7 ซม.
  const ah = 9 * CM;               // สูงไม่เกิน 9 ซม.
  const aTop = 382;
  const aCy = aTop + ah / 2;

  /** ลาย (มาสคอต) ให้พอดีในกรอบ w×h โดยไม่บิดสัดส่วน */
  const fit = (w, h) => {
    let mw = w;
    let mh = mw / MASCOT.ratio;
    if (mh > h) { mh = h; mw = mh * MASCOT.ratio; }
    return { mw, mh };
  };
  /* ลายเดียวกันทั้งสองฝั่ง วาดเท่ากันเป๊ะ — ในกรอบวงกลมคือ "แผ่นเดียวกันนี้" สอดอยู่ข้างใน */
  const ART = fit(aw * 0.74, ah * 0.66);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- ทรงกลมพลาสติกใส: สว่างบนซ้าย เข้มขอบล่างขวา -->
    <radialGradient id="globe" cx="0.36" cy="0.3" r="0.82">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.96"/>
      <stop offset="0.55" stop-color="#eef6fb" stop-opacity="0.62"/>
      <stop offset="0.88" stop-color="#cbd9e4" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#93a7b7" stop-opacity="0.75"/>
    </radialGradient>
    <!-- แสงไฟ RGB จากวงไฟที่ก้นกรอบ ไล่ขึ้นบน -->
    <radialGradient id="glow" cx="0.5" cy="0.86" r="0.78">
      <stop offset="0" stop-color="#fde68a" stop-opacity="0.95"/>
      <stop offset="0.34" stop-color="#fbbf24" stop-opacity="0.6"/>
      <stop offset="0.68" stop-color="#f472b6" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0.14"/>
    </radialGradient>
    <!-- แสงฟุ้งรอบกรอบ (นอกลูกกลม) -->
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.6" stop-color="#fbbf24" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#fbbf24" stop-opacity="0"/>
    </radialGradient>
    <!-- ด้ามจับพลาสติกสีขาว -->
    <linearGradient id="grip" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#cfd8e0"/>
      <stop offset="0.22" stop-color="#ffffff"/>
      <stop offset="0.62" stop-color="#f1f5f9"/>
      <stop offset="1" stop-color="#b9c5cf"/>
    </linearGradient>
    <!-- แผ่นอะคริลิคใสฝั่งขวา -->
    <linearGradient id="slab" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.98"/>
      <stop offset="0.5" stop-color="#e6f4f9" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#cfe6ef" stop-opacity="0.95"/>
    </linearGradient>
    <clipPath id="globeClip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดกรอบวงกลม 9.6 ซม.</text>
  <text x="${W / 2}" y="126" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">LIGHT BON มีขนาดเดียว — ยาวรวมทั้งแท่งประมาณ 23 ซม.</text>

  <!-- ═══ แท่งไฟ ═══ -->
  <ellipse cx="${cx}" cy="${cy}" rx="${R * 1.7}" ry="${R * 1.7}" fill="url(#halo)"/>

  <!-- ด้ามจับ: กริป 3.3 ซม. แล้วผายออกรับกรอบวงกลม -->
  <path d="M ${cx - gw} ${hBot - 26}
           Q ${cx - gw} ${hBot} ${cx - gw + 24} ${hBot}
           L ${cx + gw - 24} ${hBot}
           Q ${cx + gw} ${hBot} ${cx + gw} ${hBot - 26}
           L ${cx + gw} ${hTop + 150}
           C ${cx + gw + 8} ${hTop + 66} ${cx + gw + 22} ${hTop + 18} ${cx + gw + 26} ${hTop}
           L ${cx - gw - 26} ${hTop}
           C ${cx - gw - 22} ${hTop + 18} ${cx - gw - 8} ${hTop + 66} ${cx - gw} ${hTop + 150} Z"
        fill="url(#grip)" stroke="#94a3b8" stroke-width="2.5" stroke-linejoin="round"/>
  <!-- ปุ่มกดเปลี่ยนสีไฟ -->
  <circle cx="${cx}" cy="${hTop + 118}" r="17" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2.5"/>
  <circle cx="${cx}" cy="${hTop + 118}" r="7" fill="none" stroke="#64748b" stroke-width="3"/>
  <line x1="${cx}" y1="${hTop + 107}" x2="${cx}" y2="${hTop + 117}" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>
  <!-- ฝาปิดช่องถ่านที่ก้นด้าม -->
  <line x1="${cx - gw + 6}" y1="${hBot - 54}" x2="${cx + gw - 6}" y2="${hBot - 54}" stroke="#cbd5e1" stroke-width="2.5"/>

  <!-- กรอบวงกลมใส + แสงไฟข้างใน -->
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#globe)"/>
  <g clip-path="url(#globeClip)">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#glow)"/>
    <!-- ลายสกรีนบนแผ่นอะคริลิคที่สอดอยู่ในกรอบ (เรืองแสงจากไฟด้านล่าง) -->
    <path d="${slabPath(cx, cy - 8, R * 1.38, R * 1.62)}" fill="#ffffff" opacity="0.34"/>
    <image href="${MASCOT.uri}" x="${cx - ART.mw / 2}" y="${cy - 8 - ART.mh / 2}"
      width="${ART.mw}" height="${ART.mh}" preserveAspectRatio="xMidYMid meet" opacity="0.94"/>
    <!-- วงไฟ LED ที่ก้นกรอบ -->
    ${Array.from({ length: 9 }, (_, i) => {
      const t = -0.86 + (i / 8) * 1.72;
      return `<circle cx="${(cx + t * R * 0.78).toFixed(1)}" cy="${(cy + R * 0.7 - Math.abs(t) * 12).toFixed(1)}" r="7" fill="#fffbeb" opacity="0.9"/>`;
    }).join("")}
    <!-- ไฮไลต์พลาสติกใส -->
    <ellipse cx="${cx - R * 0.36}" cy="${cy - R * 0.42}" rx="${R * 0.3}" ry="${R * 0.19}"
      fill="#ffffff" opacity="0.85" transform="rotate(-34 ${cx - R * 0.36} ${cy - R * 0.42})"/>
    <ellipse cx="${cx + R * 0.46}" cy="${cy + R * 0.3}" rx="${R * 0.1}" ry="${R * 0.26}"
      fill="#ffffff" opacity="0.4" transform="rotate(-24 ${cx + R * 0.46} ${cy + R * 0.3})"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#94a3b8" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 7}" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.65"/>

  <!-- ลูกศรวัดของแท่งไฟ -->
  ${dim(cx - R - 44, topY, cx - R - 44, hBot, "23 ซม.", "left")}
  ${dim(cx - R, topY - 36, cx + R, topY - 36, "9.6 ซม.", "above")}
  ${dim(cx + R + 24, hTop, cx + R + 24, hBot, "13 ซม.", "right")}
  <text x="${cx}" y="${hBot + 46}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${SUB}">ด้ามจับสีขาว 13 × 3.3 ซม. · ถ่าน AAA 3 ก้อน</text>

  <!-- ═══ พื้นที่ลายบนแผ่นอะคริลิค ═══ -->
  <text x="${ax}" y="${aTop - 46}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">พื้นที่ลายของคุณ</text>
  <text x="${ax}" y="${aTop - 16}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">แผ่นอะคริลิคใสที่สอดอยู่ในกรอบ</text>

  <!-- กรอบเส้นประ = ขอบเขตใหญ่สุดที่ลายกินได้ -->
  <rect x="${ax - aw / 2}" y="${aTop}" width="${aw}" height="${ah}" rx="8"
    fill="#f0f9ff" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="10 7"/>
  <!-- แผ่นไดคัทจริงอยู่ในขอบเขตนั้น -->
  <path d="${slabPath(ax, aCy, aw * 0.9, ah * 0.9)}" fill="url(#slab)" stroke="#7dd3fc" stroke-width="3"/>
  <image href="${MASCOT.uri}" x="${ax - ART.mw / 2}" y="${aCy - ART.mh / 2}"
    width="${ART.mw}" height="${ART.mh}" preserveAspectRatio="xMidYMid meet"/>

  ${dim(ax - aw / 2 - 40, aTop, ax - aw / 2 - 40, aTop + ah, "9 ซม.", "left")}
  ${dim(ax - aw / 2, aTop + ah + 34, ax + aw / 2, aTop + ah + 34, "7 ซม.")}

  <text x="${ax}" y="${aTop + ah + 122}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${INK}">สูงไม่เกิน 9 × กว้างไม่เกิน 7 ซม.</text>
  <text x="${ax}" y="${aTop + ah + 154}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ไดคัทตามรูปลายได้</text>

  <text x="${W / 2}" y="${H - 36}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">อะคริลิคใสสกรีนลาย 2 ด้าน · ไฟ RGB กดปุ่มเปลี่ยนสีได้ หรือกดค้างให้วนเปลี่ยนสีอัตโนมัติ</text>
</svg>`;
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
/* ภาพจัตุรัสลงกล่องการ์ดจัตุรัส = ย่อทั้งใบ ไม่ครอป — ตรวจว่าที่ 80px ยังอ่านออกว่าเป็นแท่งไฟ ([[iducky-option-thumb-crop]]) */
await sharp(buf).resize(80, 80).resize(400, 400, { kernel: "nearest" }).toFile(`${OUT}/_thumb80-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${SIZE_GROUP}: ${SIZE_CHOICE} (+ _thumb80 ไว้ตรวจตอนย่อ)`);

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
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));
const options = data.options ?? [];

// กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้เป็นกลุ่มแรก
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: "LIGHT BON มีขนาดเดียว — กรอบวงกลม 9.6 ซม. · แผ่นอะคริลิคสูงไม่เกิน 9 กว้างไม่เกิน 7 ซม. (ตามใบสเปคร้าน P-nแท่งไฟ-01)",
  choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: sizeUrl }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.splice(0, 0, sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
const got = g?.choices?.[0];
if (g?.display !== "cards" || got?.name !== SIZE_CHOICE || got?.imageSrc !== sizeUrl || got?.desc !== SIZE_DESC) {
  console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", JSON.stringify(g)); process.exit(1);
}
/* กันเผลอ: กลุ่มนี้ต้องไม่กลายเป็นแกนตารางราคา (ราคาเป็นคอลัมน์เดียว คีย์ "") */
for (const p of [back.data.pricing, ...(back.data.priceRates ?? []).map((rr) => rr.pricing)]) {
  if ((p?.driverLabels ?? []).includes(SIZE_GROUP) || !p?.cells?.[""]) { console.error("ตารางราคาเพี้ยน!", p?.driverLabels, Object.keys(p?.cells ?? {})); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) เป็นการ์ด + ภาพ · ตารางราคาไม่ถูกแตะ · savedAt =`, back.data.savedAt);
