#!/usr/bin/env node
/**
 * สแตนดี้ฐานไฟ (id "1-3" · /products/สแตนดี้ฐานไฟ) — กลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/light-standee-size-option.mjs            (วาดภาพลง .cache/1-3/upload ดูก่อน)
 *   node scripts/light-standee-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปคร้าน: 10_อะคริลิค/สแตนดี้อะคริลิค/07-3-3_.../P-nรวมStandy3-01.jpg
 *   • ฐานไฟทรงกลม     เริ่ม 390.- · อะคริลิคใส 15 cm หนา 5 mm · ฐานไฟทรงกลม 10 cm · เพิ่มขนาด cm.ละ 15 บาท
 *   • ฐานไฟทรงสี่เหลี่ยม เริ่ม 350.- · อะคริลิคใส 15 cm หนา 3 mm · ฐาน 15x4.5x3 cm · เพิ่มขนาด cm.ละ 10 บาท
 *   (ราคาใน DB ตรงใบสเปคแล้ว: ทรงกลม 390/289/280/270 · ทรงสี่เหลี่ยม 350/239/230/220)
 *
 * ทำ 3 อย่าง:
 *   1. กลุ่ม "ขนาด" แบบการ์ด **สองกลุ่มชื่อเดียวกัน** แยกด้วย showWhen ของกลุ่ม "ฐานไฟ"
 *      (แพทเทิร์นบ้าน [[iducky-duplicate-group-label]] — เรทเพิ่มขนาดคนละราคาต่อทรงฐาน
 *       และค่า selections ใช้คีย์ "ขนาด" ร่วมกัน สลับทรงฐานแล้วตัวที่เลือกไว้ไม่หาย)
 *        • "15 ซม. (มาตรฐาน)"            รวมในราคาแล้ว
 *        • "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)"  คิดเพิ่มจาก **ด้านที่ยาวที่สุด** ส่วนที่เกิน 15 ซม.
 *   2. ช่องกรอก "ขนาดกำหนดเอง (กว้าง)" + "(สูง)" — โผล่เมื่อเลือกกำหนดขนาดเอง (ผู้ใช้สั่ง 4 ก.ย. 69
 *      ให้กรอกได้ทั้งกว้างและยาว ไม่ใช่ช่องเดียว) · คิดเงินด้วย `choice.sizeFee` ที่อ่านสองช่องนี้
 *      แล้วเทียบขั้นตามด้านยาวสุด — ขั้นละ 1 ซม. (16 ซม. = +เรท · 30 ซม. = +เรท×15)
 *      ⚠️ ทำไมไม่ใช้ inputFee: inputFee คิดจากค่าในช่องของตัวเองช่องเดียว กรอกสองช่องแล้วจะคิดซ้ำ
 *   3. กล่อง 📐 custom เดิม (mode "quote") ขยับเส้นแบ่งเป็น "มากกว่า 30 ซม." ให้รับต่อจากกลุ่มใหม่
 *      ไม่งั้นหน้าสินค้ามีสองทางถามขนาดใหญ่ที่ทับกัน · ไม่แตะ mode/keepOptions
 *
 * ⚠️ ตีความเอง (ใบสเปคไม่ระบุ) — รอผู้ใช้ยืนยัน:
 *   • "เพิ่มขนาด cm.ละ N" คิดจากด้านที่ยาวที่สุดส่วนที่เกิน 15 ซม. (ตาม terms ของสินค้าเอง
 *     "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด") — เศษปัดขึ้นเต็มเซนติเมตร (15.5 → คิดเท่า 16)
 *   • เพดานรับ 30 ซม. — ใหญ่กว่านั้นใช้กล่อง 📐 ให้แอดมินตีราคา (เลขเดียวกับ askOver ของ standy)
 *
 * รันซ้ำได้: เจอกลุ่ม/ช่องกรอกเดิม = ตัดทิ้งแล้ววางใหม่ ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * ⚠️ data.savedAt ต้องเป็น ISO string เสมอ (ไม่ใช่ Date.now())
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const PRODUCT_ID = "1-3";
const VER = "v2";  // v1 = ช่องกรอกช่องเดียว (ด้านยาวสุด) — v2 กรอก กว้าง×สูง ภาพเปลี่ยนทั้งชุด
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/1-3/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const BASE_GROUP = "ฐานไฟ";        // แกนตารางราคา — ห้ามแตะชื่อกลุ่ม/ชื่อตัวเลือก
const ROUND = "ทรงกลม";
const SQUARE = "ทรงสี่เหลี่ยม";
const SIZE_GROUP = "ขนาด";
const STD_CHOICE = "15 ซม. (มาตรฐาน)";
const CUSTOM_CHOICE = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W_LABEL = "ขนาดกำหนดเอง (กว้าง)";
const H_LABEL = "ขนาดกำหนดเอง (สูง)";
const OLD_INPUT_LABEL = "ขนาดอะคริลิค · ด้านยาวสุด"; // ของรุ่นแรก — ต้องเก็บกวาดออก ไม่งั้นคิดเงินซ้ำ
const FREE = 15;        // 15 ซม. แรกรวมในราคาแล้ว (ทั้งสองทรงฐาน)
const RATE_SQUARE = 10; // ฐานไฟทรงสี่เหลี่ยม — เพิ่ม ซม.ละ ฿10
const RATE_ROUND = 15;  // ฐานไฟทรงกลม — เพิ่ม ซม.ละ ฿15
const MAX = 30;         // เกินนี้ให้แอดมินตีราคา (กล่อง 📐 custom รับต่อ)
const CUSTOM_BOX_LABEL = `เพิ่มขนาดมากกว่า ${MAX} ซม.`;
const CUSTOM_BOX_NOTE = `ใหญ่กว่า ${MAX} ซม. ทางร้านตีราคาให้เป็นรายกรณี — กรอกขนาดที่ต้องการไว้ได้เลย แล้วแอดมินจะแจ้งราคากลับ`;

/** ขั้นค่าบริการตามด้านยาวสุด ขั้นละ 1 ซม. (15 ซม. = ฟรี · เกินขั้นสุดท้ายใช้ขั้นสุดท้าย) */
const tiersFor = (rate) => Array.from({ length: MAX - FREE + 1 }, (_, i) => ({ upTo: FREE + i, fee: i * rate }));

const SHAPES = {
  [SQUARE]: { key: "sq", rate: RATE_SQUARE, thick: "3 มม.", baseText: "ฐานไฟทรงสี่เหลี่ยม 15×4.5×3 ซม." },
  [ROUND]: { key: "rd", rate: RATE_ROUND, thick: "5 มม.", baseText: "ฐานไฟทรงกลม ⌀10 ซม." },
};

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข · side: below/above/left */
const dim = (x1, y1, x2, y2, label, side = "below", color = SUB) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 + (side === "left" ? -22 : 22) : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 34 : -16);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${color}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? (side === "left" ? label.length * 13 : 0) : (label.length * 13) / 2)}" y="${ly - 25}"
      width="${label.length * 13}" height="33" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="${vertical ? (side === "left" ? "end" : "start") : "middle"}" fill="${color}">${label}</text>`;
};

const defs = `<defs>
    <linearGradient id="acryl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eff8fc"/>
      <stop offset="0.5" stop-color="#e2f0f8"/>
      <stop offset="1" stop-color="#d5e8f4"/>
    </linearGradient>
    <!-- แสงจากฐานไล่ขึ้นบนแผ่นอะคริลิค -->
    <linearGradient id="lit" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ffd58a" stop-opacity="0.85"/>
      <stop offset="0.35" stop-color="#ffe9bd" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eccfa6"/>
      <stop offset="0.45" stop-color="#dcb480"/>
      <stop offset="1" stop-color="#c1935d"/>
    </linearGradient>
    <linearGradient id="woodTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6e4c8"/>
      <stop offset="1" stop-color="#e6c99f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffe0a0" stop-opacity="0.9"/>
      <stop offset="0.55" stop-color="#ffe9bd" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#ffe9bd" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

/** ฐานไฟทรงสี่เหลี่ยม (มองด้านหน้า) — แท่งไม้ 15 × 3 ซม. ร่องเสียบเรืองแสงกลางสัน */
const baseSquare = (cx, topY, bw, bh, slotW) => {
  const x = cx - bw / 2;
  const lip = Math.max(9, bh * 0.22);
  return `
  <ellipse cx="${cx}" cy="${topY + bh + 12}" rx="${bw * 0.62}" ry="${bh * 0.3}" fill="#0f172a" opacity="0.10"/>
  <ellipse cx="${cx}" cy="${topY + lip / 2}" rx="${slotW * 1.7}" ry="${bh * 2.1}" fill="url(#glow)"/>
  <rect x="${x}" y="${topY}" width="${bw}" height="${bh}" rx="${bh * 0.22}" fill="url(#wood)" stroke="#b0854f" stroke-width="2"/>
  <rect x="${x}" y="${topY}" width="${bw}" height="${lip}" rx="${lip * 0.45}" fill="url(#woodTop)"/>
  <rect x="${cx - slotW / 2}" y="${topY + lip * 0.18}" width="${slotW}" height="${Math.max(7, lip * 0.5)}" rx="${Math.max(3.5, lip * 0.25)}" fill="#fff4d4" stroke="#f0c878" stroke-width="1.5"/>`;
};

/** ฐานไฟทรงกลม (มองเฉียงหน้า) — ทรงกระบอกไม้ ⌀10 ซม. หน้าบนเป็นวงรี มีร่องเสียบเรืองแสง */
const baseRound = (cx, topY, bw, bh, slotW) => {
  const rx = bw / 2;
  const ry = bh * 0.62; // ความหนาของหน้าบนที่มองเห็นเป็นวงรี
  const bodyH = bh;
  return `
  <ellipse cx="${cx}" cy="${topY + bodyH + ry + 10}" rx="${rx * 1.06}" ry="${ry * 0.7}" fill="#0f172a" opacity="0.10"/>
  <ellipse cx="${cx}" cy="${topY + ry * 0.1}" rx="${slotW * 1.5}" ry="${bh * 1.9}" fill="url(#glow)"/>
  <path d="M ${cx - rx} ${topY} L ${cx - rx} ${topY + bodyH} A ${rx} ${ry} 0 0 0 ${cx + rx} ${topY + bodyH} L ${cx + rx} ${topY} Z"
    fill="url(#wood)" stroke="#b0854f" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${topY}" rx="${rx}" ry="${ry}" fill="url(#woodTop)" stroke="#b0854f" stroke-width="2"/>
  <rect x="${cx - slotW / 2}" y="${topY - 5}" width="${slotW}" height="10" rx="5" fill="#fff4d4" stroke="#f0c878" stroke-width="1.5"/>`;
};

/** แผ่นอะคริลิคตั้ง — ทรงโค้งมนแบบไดคัทรอบลาย + ลายมาสคอตเป็นตัวอย่างงานสกรีน */
const acrylPanel = (cx, bottomY, ph, pw, id) => {
  const x = cx - pw / 2;
  const y = bottomY - ph;
  const r = Math.min(pw, ph) * 0.16;
  const ratio = MASCOT.ratio;
  const pad = pw * 0.1;
  let ah = ph - pad * 2.2;
  let aw = ah * ratio;
  if (aw > pw - pad * 2) { aw = pw - pad * 2; ah = aw / ratio; }
  return `
  <rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${r}" fill="url(#acryl)" stroke="#a9c3d6" stroke-width="3"/>
  <clipPath id="clip${id}"><rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${r}"/></clipPath>
  <g clip-path="url(#clip${id})">
    <rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#lit)"/>
    <rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#sheen)"/>
  </g>
  <image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${bottomY - pad * 1.1 - ah}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

const card = (title, sub, body, foot) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="94" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="136" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>
  ${body}
  ${foot.map((t, i) => `<text x="${W / 2}" y="${H - (foot.length > 1 ? 74 : 46) + i * 32}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${t}</text>`).join("")}
</svg>`;

/** การ์ด "มาตรฐาน 15 ซม." — วาดฐานตามทรงที่กลุ่มนั้นใช้ (sq/rd) */
function stdArt(shape) {
  const s = SHAPES[shape];
  const CM = 27;
  const ph = 15 * CM;                       // แผ่นอะคริลิค 15 ซม. (ด้านยาวสุด)
  const pw = ph * 0.62;
  const round = shape === ROUND;
  const bw = (round ? 10 : 15) * CM;        // ฐานกลม ⌀10 · ฐานสี่เหลี่ยมยาว 15
  const bh = (round ? 2.2 : 3) * CM;
  const cx = W / 2;
  const baseTop = round ? 622 : 640;
  const bottomY = baseTop + bh * (round ? 0.06 : 0.34);
  const panelTop = bottomY - ph;
  const baseBottom = baseTop + bh + (round ? bh * 0.62 : 0);
  return card(
    "ขนาดมาตรฐาน 15 ซม.",
    "รวมในราคาแล้ว — นับจากด้านที่ยาวที่สุดของชิ้นงาน",
    `${acrylPanel(cx, bottomY, ph, pw, `std${s.key}`)}
     ${round ? baseRound(cx, baseTop, bw, bh, pw * 0.78) : baseSquare(cx, baseTop, bw, bh, pw * 0.78)}
     ${dim(cx + pw / 2 + 46, panelTop, cx + pw / 2 + 46, bottomY, "15 ซม.")}
     ${dim(cx - bw / 2, baseBottom + 42, cx + bw / 2, baseBottom + 42, round ? "ฐาน ⌀10 ซม." : "ฐานไฟ 15 ซม.", "above")}`,
    [
      "อะคริลิคใสพิมพ์ลาย UV ตามสั่ง · ลายในภาพเป็นตัวอย่าง",
      `${s.baseText} · อะคริลิคหนา ${s.thick}`,
    ],
  );
}

/** การ์ด "กำหนดขนาดเอง" — กรอบประถึงเพดาน 30 ซม. + ลูกศร กว้าง/สูง + ป้ายเรทของทรงฐานนั้น */
function customArt(shape) {
  const s = SHAPES[shape];
  const round = shape === ROUND;
  const CM = 17;
  const ph = 15 * CM;
  const pw = ph * 0.62;
  const bigH = MAX * CM;                    // กรอบประ = ขนาดใหญ่สุดที่รับ (30 ซม.)
  const bigW = bigH * 0.62;
  const bw = (round ? 10 : 15) * CM;
  const bh = (round ? 2.2 : 3) * CM;
  const cx = W / 2;
  const baseTop = round ? 690 : 700;
  const bottomY = baseTop + bh * (round ? 0.06 : 0.34);
  const panelTop = bottomY - ph;
  const bigTop = bottomY - bigH;
  const baseBottom = baseTop + bh + (round ? bh * 0.62 : 0);
  return card(
    "กำหนดขนาดเองได้",
    "ระบุกว้าง × สูงเองได้ — คิดเพิ่มจากด้านที่ยาวที่สุด",
    `<rect x="${cx - bigW / 2}" y="${bigTop}" width="${bigW}" height="${bigH}" rx="${bigW * 0.14}"
       fill="none" stroke="${OK}" stroke-width="4" stroke-dasharray="14 11"/>
     ${acrylPanel(cx, bottomY, ph, pw, `cus${s.key}`)}
     ${round ? baseRound(cx, baseTop, bw, bh, pw * 0.78) : baseSquare(cx, baseTop, bw, bh, pw * 0.78)}
     <line x1="${cx - bigW / 2 - 30}" y1="${panelTop}" x2="${cx + pw / 2}" y2="${panelTop}"
       stroke="${SUB}" stroke-width="2" stroke-dasharray="7 6"/>
     <text x="${cx - bigW / 2 - 30}" y="${panelTop - 12}" font-family="${TH}" font-size="22" fill="${SUB}">15 ซม. (มาตรฐาน)</text>
     ${dim(cx - bigW / 2, bigTop + 34, cx + bigW / 2, bigTop + 34, "กว้าง", "below", OK)}
     ${dim(cx + bigW / 2 + 52, bigTop, cx + bigW / 2 + 52, bottomY, `สูง — ถึง ${MAX} ซม.`, "below", OK)}
     <rect x="${cx - 288}" y="${baseBottom - 8}" width="576" height="56" rx="28" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
     <text x="${cx}" y="${baseBottom + 29}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${OK}">${s.baseText.split(" ")[0]} +฿${s.rate} ต่อ ซม. ที่เกิน 15</text>`,
    [
      `เช่น 12 × 20 ซม. = +฿${(20 - FREE) * s.rate} (คิดจากด้านยาวสุด 20 ซม.)`,
      `ใหญ่กว่า ${MAX} ซม. ใช้ช่องกำหนดขนาดพิเศษด้านล่าง ให้แอดมินตีราคา`,
    ],
  );
}

// ── วาดภาพ ───────────────────────────────────────────────────────────
const FILES = [];
for (const shape of [SQUARE, ROUND]) {
  const s = SHAPES[shape];
  FILES.push({ file: `size-15cm-${s.key}-${VER}.jpg`, svg: stdArt(shape), tag: `std-${s.key}` });
  FILES.push({ file: `size-custom-${s.key}-${VER}.jpg`, svg: customArt(shape), tag: `cus-${s.key}` });
}
const bufs = {};
for (const f of FILES) {
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  bufs[f.file] = buf;
  writeFileSync(`${OUT}/${f.file}`, buf);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const f of FILES) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, bufs[f.file], { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  url[f.tag] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", url[f.tag]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

/** กลุ่ม "ขนาด" ของทรงฐานหนึ่ง — ชื่อกลุ่ม/ชื่อตัวเลือกเหมือนกันทั้งสองทรง ต่างกันแค่เรทกับภาพ */
const sizeGroupFor = (shape) => {
  const s = SHAPES[shape];
  return {
    label: SIZE_GROUP,
    display: "cards",
    showWhen: { label: BASE_GROUP, choices: [shape] },
    note: `ขนาดมาตรฐาน 15 ซม. — สั่งใหญ่กว่านี้ได้ ${s.baseText.split(" ")[0]} คิดเพิ่ม ซม.ละ ฿${s.rate} (นับจากด้านที่ยาวที่สุด)`,
    choices: [
      {
        name: STD_CHOICE,
        popular: true,
        desc: `ขนาดเริ่มต้นของร้าน รวมในราคาแล้ว · ${s.baseText} · อะคริลิคหนา ${s.thick}`,
        imageSrc: url[`std-${s.key}`],
      },
      {
        name: CUSTOM_CHOICE,
        desc: `กรอกกว้าง × สูงเองได้ — ส่วนที่เกิน 15 ซม. ของด้านยาวสุด คิดเพิ่ม ซม.ละ ฿${s.rate} (รับได้ถึง ${MAX} ซม.)`,
        imageSrc: url[`cus-${s.key}`],
        // 💰 ค่าบริการอ่านจากช่องกรอกสองช่อง แล้วเทียบขั้นตามด้านที่ยาวที่สุด
        sizeFee: {
          onlyWhen: { label: BASE_GROUP, choices: [shape] }, // กลุ่มอีกทรงถูกซ่อนอยู่แล้ว — กันอีกชั้น
          when: { label: SIZE_GROUP, choices: [CUSTOM_CHOICE] },
          widthLabel: W_LABEL,
          heightLabel: H_LABEL,
          tiers: tiersFor(s.rate),
        },
      },
    ],
  };
};

/** ช่องกรอกกว้าง/สูง — ใช้ร่วมกันทั้งสองทรงฐาน (showWhen ผูกกับคีย์ "ขนาด" ที่ใช้ร่วมกัน) */
const field = (label, hint) => ({
  label,
  // ⚠️ ต้องมี choices: [] เสมอแม้เป็นช่องกรอก — โค้ดหลายที่เรียก opt.choices.map/[0] ตรง ๆ
  choices: [],
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE_GROUP, choices: [CUSTOM_CHOICE] },
  input: { kind: "number", unit: "ซม.", min: 1, max: MAX, required: true, placeholder: "15", hint },
});
const fields = [
  field(W_LABEL, "ใส่ทศนิยมได้ เช่น 12.5"),
  field(H_LABEL, `ราคาคิดจากด้านที่ยาวที่สุด ส่วนที่เกิน 15 ซม. — ฐานไฟทรงสี่เหลี่ยม ซม.ละ ฿${RATE_SQUARE} · ฐานไฟทรงกลม ซม.ละ ฿${RATE_ROUND} (เศษปัดขึ้นเต็มเซนติเมตร) · รับได้ถึง ${MAX} ซม. ใหญ่กว่านั้นใช้ช่อง 📐 ให้แอดมินตีราคา`),
];

// รันซ้ำได้: ตัดของเดิมทุกชิ้น (รวมช่องกรอกรุ่นแรก) ทิ้งก่อน แล้ววางใหม่หลังกลุ่มฐานไฟ
const drop = new Set([SIZE_GROUP, OLD_INPUT_LABEL, W_LABEL, H_LABEL]);
const cleaned = options.filter((o) => !drop.has(o.label));
const atBase = cleaned.findIndex((o) => o.label === BASE_GROUP);
if (atBase < 0) { console.error(`ไม่เจอกลุ่ม "${BASE_GROUP}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
cleaned.splice(atBase + 1, 0, sizeGroupFor(SQUARE), sizeGroupFor(ROUND), ...fields);

data.options = cleaned;

// กล่อง 📐 custom เดิม (quote) — ขยับเส้นแบ่งไปที่ 30 ซม. ให้ต่อจากกลุ่มใหม่ ไม่ทับกัน
if (data.custom?.enabled) {
  data.custom.label = CUSTOM_BOX_LABEL;
  data.custom.note = CUSTOM_BOX_NOTE;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options;
const gSizes = got.filter((o) => o.label === SIZE_GROUP);   // ⚠️ กลุ่มชื่อซ้ำ ต้อง filter ไม่ใช่ find
const gw = got.find((o) => o.label === W_LABEL);
const gh = got.find((o) => o.label === H_LABEL);
const shapeOf = (g) => g.showWhen?.choices?.[0];
const fails = [
  [gSizes.length === 2, `กลุ่มขนาดต้องมี 2 กลุ่ม (เจอ ${gSizes.length})`],
  [gSizes.every((g) => g.display === "cards"), "กลุ่มขนาดไม่ได้เป็นการ์ด"],
  [new Set(gSizes.map(shapeOf)).size === 2 && gSizes.every((g) => [SQUARE, ROUND].includes(shapeOf(g))), "showWhen ทรงฐานของกลุ่มขนาดไม่ครบ/ซ้ำ"],
  [gSizes.every((g) => g.choices?.length === 2 && g.choices[0].name === STD_CHOICE && g.choices[1].name === CUSTOM_CHOICE), "ชื่อตัวเลือกในกลุ่มขนาดไม่ตรง"],
  [gSizes.every((g) => g.choices.every((c) => !!c.imageSrc)), "การ์ดบางใบไม่มีภาพ"],
  [gSizes.every((g) => g.choices[1].sizeFee?.tiers?.length === MAX - FREE + 1), "ขั้นค่าบริการตามขนาดไม่ครบ"],
  [gSizes.every((g) => {
    const t = g.choices[1].sizeFee.tiers;
    const rate = SHAPES[shapeOf(g)].rate;
    return t[0].upTo === FREE && t[0].fee === 0 && t.at(-1).upTo === MAX && t.at(-1).fee === (MAX - FREE) * rate;
  }), "เรทค่าบริการตามขนาดไม่ตรงกับทรงฐาน"],
  [gSizes.every((g) => g.choices[1].sizeFee.widthLabel === W_LABEL && g.choices[1].sizeFee.heightLabel === H_LABEL), "sizeFee ไม่ได้ชี้ช่องกรอกกว้าง/สูง"],
  [!!gw && !!gh, "ช่องกรอกกว้าง/สูงหาย"],
  [got.filter((o) => o.label === W_LABEL).length === 1 && got.filter((o) => o.label === H_LABEL).length === 1, "ช่องกรอกซ้ำ"],
  [!got.some((o) => o.label === OLD_INPUT_LABEL), "ช่องกรอกรุ่นแรก (ด้านยาวสุด) ยังอยู่ = คิดเงินซ้ำ"],
  [[gw, gh].every((f) => Array.isArray(f?.choices) && f.input?.max === MAX && f.input?.required === true && f.showWhen?.choices?.[0] === CUSTOM_CHOICE), "สเปกช่องกรอกไม่ถูก"],
  [got.findIndex((o) => o.label === SIZE_GROUP) === got.findIndex((o) => o.label === BASE_GROUP) + 1, "กลุ่มขนาดไม่ได้อยู่หลังกลุ่มฐานไฟ"],
  [JSON.stringify(back.data.pricing?.cells) === JSON.stringify(data.pricing?.cells), "ตารางราคาถูกแตะ"],
  [!back.data.custom?.enabled || (back.data.custom.label === CUSTOM_BOX_LABEL && back.data.custom.mode === "quote"), "กล่อง 📐 custom ยังทับกลุ่มขนาดใหม่"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nตัวอย่างค่าบริการ (ต่อชิ้น · คิดจากด้านยาวสุด):");
for (const [w, h] of [[10, 15], [12, 18], [12, 20], [25, 25], [20, 30]]) {
  const longest = Math.max(w, h);
  const over = Math.max(0, Math.ceil(longest) - FREE);
  console.log(`  ${String(w).padStart(2)} × ${String(h).padStart(2)} ซม.  →  ฐานสี่เหลี่ยม +฿${over * RATE_SQUARE}  ·  ฐานกลม +฿${over * RATE_ROUND}`);
}
console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" 2 กลุ่ม (การ์ด+ภาพ ครบ 4 ใบ) + ช่องกรอก กว้าง/สูง อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
