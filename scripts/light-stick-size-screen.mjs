#!/usr/bin/env node
/**
 * "แท่งไฟ" (Light Stick) — id `light-stick` (/products/แท่งไฟ-Light-Stick)
 *
 *   node scripts/light-stick-size-screen.mjs            (วาดภาพลง .cache/light-stick/upload ดูก่อน)
 *   node scripts/light-stick-size-screen.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค: 10_อะคริลิค/แท่งไฟLED-บงไฟ/P-nแท่งไฟ-01.jpg  (บล็อกบน = LIGHT STICK 390.- · บล็อกล่างเป็น
 * "Light Bon" 590.- ทรงกลม คนละสินค้า อย่าเอาเลขมาปน)
 *   - แสงไฟ RGB (กดปุ่มเปลี่ยนสีไฟได้) เปิดไฟได้ 15 สี
 *   - แท่งไฟ (ด้ามจับสีขาว) ขนาด 10.5 × 3.5 ซม. · ใช้ถ่าน AAA 3 ก้อน
 *   - อะคริลิคใส หนา 5 mm
 *   - **ขนาด 10×10 cm (เพิ่มขนาดบวกเพิ่ม cm ละ 15 บาท)**
 *   - **สกรีน 1 ด้าน (ถ้าสกรีน 2 ด้าน บวกเพิ่ม 10 บาท)**  ← ตรงกับ extra 10 ที่มีใน DB อยู่แล้ว
 *
 * ทำ 3 อย่างตามที่ผู้ใช้สั่ง:
 *   1. เพิ่มกลุ่ม "ขนาด" แบบการ์ด 2 ใบ ไว้หน้ากลุ่ม "สกรีนกี่ด้าน"
 *        • "10×10 ซม. (มาตรฐาน)"        ไม่บวกเพิ่ม
 *        • "📐 กำหนดขนาดเอง (+฿15/ซม.)"  เกิน 10 ซม. คิดเพิ่ม ซม.ละ ฿15
 *      + ช่องกรอก **กว้าง × ยาว** 2 ช่อง (โผล่เมื่อเลือกกำหนดขนาดเอง · บังคับกรอกทั้งคู่)
 *        คิดเงินด้วย `choice.sizeFee` — ขั้นราคาตาม **ด้านที่ยาวที่สุด** ของสองช่อง
 *        (4 ก.ย. 69 ผู้ใช้สั่งเปลี่ยนจากช่องเดียว "ด้านยาวสุด" มาเป็น กว้าง/ยาว)
 *        ⚠️ ที่ใช้ sizeFee ไม่ใช่ inputFee เพราะ inputFee อ่านได้แค่ช่องของตัวเอง —
 *        สองช่องต่างคนต่างคิดเงินจะกลายเป็นคิดซ้ำ · sizeFee อ่านคู่ช่อง ก.×ย. แล้วคิดครั้งเดียว
 *        ขั้นราคาเป็น ceil: กรอก 10.5 ตกขั้น 11 ซม. = +฿15 (10×10 = ฿0)
 *   2. เปลี่ยนชื่อตัวเลือกกลุ่ม "สกรีนกี่ด้าน" เป็น "สกรีน 1 ด้าน" / "สกรีน 2 ด้าน" (+฿10 เท่าเดิม)
 *   3. วาดภาพประกอบครบทั้ง 4 ตัวเลือก (900×900 สไตล์บ้าน)
 *
 * ⚠️ ตีความเอง 2 จุด (ใบสเปคไม่ได้เขียน) — รอผู้ใช้ยืนยัน:
 *    • "เพิ่มขนาด cm ละ 15" คิดจาก **ด้านยาวสุด** ของ ก.×ย. ที่กรอก (ไม่ใช่คิดสองด้านแยกกัน) —
 *      ตรงกับ terms ของสินค้าเองที่เขียนว่า "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด"
 *      เช่น 6 × 14 ซม. = ด้านยาวสุด 14 → +฿60 (เท่ากับ 14 × 14 ซม.)
 *    • เพดานรับ 20 ซม. (หัวอะคริลิคใหญ่กว่านี้หนักเกินด้ามจับกว้าง 3.5 ซม.) — ใหญ่กว่านั้นทักแชทตีราคา
 *      หมายเหตุ: ที่รองแก้ว/สแตนดี้ใช้เพดาน 30 แต่สินค้านั้นไม่มีด้ามจับถือ
 *
 * ราคา: pricing.driverLabels = [] → คีย์ราคาคือ "" ทั้ง pricing และ priceRates.r1
 *   ชื่อกลุ่มใหม่ "ขนาด" จึงไม่ไปชนแกนตารางราคา ([[iducky-price-driver-trap]]) — ยังเช็คซ้ำตอนอ่านกลับ
 *
 * รันซ้ำได้: เจอกลุ่ม/ช่องกรอกเดิม = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * ⚠️ data.savedAt ต้องเป็น ISO string (ไม่ใช่ตัวเลข)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);
const MASCOT2 = await mascotDataUri("peace", 420); // ลายด้านหลัง — ให้เห็นว่าหน้า-หลังคนละลายได้

const PRODUCT_ID = "light-stick";
const VER = "v1";
const CUSTOM_VER = "v2"; // การ์ด "กำหนดขนาดเอง" แก้ข้อความเป็น กว้าง × ยาว — อัปทับชื่อเดิมไม่ได้ (CDN แคช)
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const STD_CHOICE = "10×10 ซม. (มาตรฐาน)";
const CUSTOM_CHOICE = "📐 กำหนดขนาดเอง (+฿15/ซม.)";
const W_LABEL = "ขนาดกำหนดเอง (กว้าง)";
const H_LABEL = "ขนาดกำหนดเอง (ยาว)";
const RATE = 15; // ใบสเปค: เพิ่มขนาดบวกเพิ่ม cm ละ 15 บาท
const FREE = 10; // 10 ซม. แรกรวมในราคาแล้ว
const MAX = 20;  // เกินนี้ให้แอดมินตีราคา (ตีความเอง — ดูหัวไฟล์)
/**
 * ขั้นราคาตามด้านยาวสุด: ≤10 ซม. ฟรี · จากนั้น ซม.ละ ฿15 → ≤11 = ฿15 … ≤20 = ฿150
 * sizeFeeBreakdownOf ใช้ขั้นแรกที่ "ด้านยาวสุด ≤ upTo" (เกินขั้นสุดท้ายใช้ขั้นสุดท้าย —
 * แต่กรอกเกิน MAX ปุ่มสั่งล็อกจาก input.max อยู่แล้ว จึงไม่มีทางไปถึงตรงนั้น)
 */
const SIZE_TIERS = Array.from({ length: MAX - FREE + 1 }, (_, i) => ({ upTo: FREE + i, fee: i * RATE }));

const SCREEN_GROUP = "สกรีนกี่ด้าน";
const ONE_SIDE = "สกรีน 1 ด้าน";
const TWO_SIDE = "สกรีน 2 ด้าน";
const TWO_EXTRA = 10; // ใบสเปค: สกรีน 2 ด้าน บวกเพิ่ม 10 บาท (ตรงกับของเดิมใน DB)

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

const defs = `<defs>
    <!-- เนื้ออะคริลิคใส หนา 5 มม. — ฟ้าจางไล่เฉด -->
    <linearGradient id="acryl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef8fc"/>
      <stop offset="0.5" stop-color="#e0f0f8"/>
      <stop offset="1" stop-color="#cfe6f2"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.45">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="0.58" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <!-- ด้ามจับสีขาว -->
    <linearGradient id="grip" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d9e2ea"/>
      <stop offset="0.28" stop-color="#ffffff"/>
      <stop offset="0.75" stop-color="#f4f7fa"/>
      <stop offset="1" stop-color="#d2dce5"/>
    </linearGradient>
    <!-- แสงไฟ RGB ที่เรืองจากฐานขึ้นไปในแผ่นอะคริลิค -->
    <radialGradient id="glow" cx="0.5" cy="0.95" r="0.9">
      <stop offset="0" stop-color="#67e8f9" stop-opacity="0.85"/>
      <stop offset="0.45" stop-color="#7dd3fc" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#a5b4fc" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rgb" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f87171"/>
      <stop offset="0.25" stop-color="#fbbf24"/>
      <stop offset="0.5" stop-color="#4ade80"/>
      <stop offset="0.75" stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#c084fc"/>
    </linearGradient>
  </defs>`;

const card = (title, sub, body, foot) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>
  ${body}
  ${foot.filter(Boolean).map((t, i, a) => `<text x="${W / 2}" y="${H - 42 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`).join("")}
</svg>`;

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

const pill = (cx, y, text, w) => {
  const width = w ?? text.length * 14.5 + 56;
  return `
    <rect x="${cx - width / 2}" y="${y - 24}" width="${width}" height="48" rx="24" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 9}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`;
};

/** ป้ายตัวใหญ่คาบกลางภาพ — ปุ่มตัวเลือกครอปกลาง 300-600 ([[iducky-option-thumb-crop]]) */
const bigLabel = (cy, text, size = 46) => {
  const w = text.length * (size * 0.56) + 76;
  return `
    <rect x="${(W - w) / 2}" y="${cy - 38}" width="${w}" height="76" rx="38" fill="#ffffff" opacity="0.94" stroke="${OK}" stroke-width="3"/>
    <text x="${W / 2}" y="${cy + 16}" font-family="${TH}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${INK}">${text}</text>`;
};

/**
 * หัวอะคริลิคใสไดคัท (แผ่นหนา 5 มม.) — มุมมองตรง
 * art: data-uri ลายที่สกรีน · ถ้า null = แผ่นใสเปล่า (ด้านที่ไม่ได้สกรีน)
 */
const head = (cx, cy, side, art, opts = {}) => {
  const x = cx - side / 2, y = cy - side / 2, r = side * 0.16;
  let ah = side * 0.62, aw = ah * (art?.ratio ?? 1);
  if (aw > side * 0.74) { aw = side * 0.74; ah = aw / (art?.ratio ?? 1); }
  return `
  ${opts.noGlow ? "" : `<ellipse cx="${cx}" cy="${cy + side * 0.1}" rx="${side * (opts.glow ?? 0.95)}" ry="${side * (opts.glow ?? 0.95) * 0.9}" fill="url(#glow)"/>`}
  <rect x="${x + 7}" y="${y + 11}" width="${side}" height="${side}" rx="${r}" fill="#0f172a" opacity="0.07"/>
  <rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${r}" fill="url(#acryl)" stroke="#a9c6da" stroke-width="3.5"/>
  <rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${r}" fill="url(#sheen)"/>
  ${art ? `<image href="${art.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>` : ""}
  <rect x="${x + 8}" y="${y + 8}" width="${side - 16}" height="${side - 16}" rx="${r * 0.8}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.75"/>
  ${art ? "" : `<text x="${cx}" y="${cy + 10}" font-family="${TH}" font-size="${side * 0.115}" text-anchor="middle" fill="#94a3b8">ใสเปล่า</text>`}`;
};

/** ด้ามจับสีขาว 10.5 × 3.5 ซม. — มีปุ่มกดเปลี่ยนสีไฟ RGB */
const gripStick = (cx, top, w, h) => {
  const x = cx - w / 2;
  return `
  <rect x="${x + 5}" y="${top + 9}" width="${w}" height="${h}" rx="${w * 0.34}" fill="#0f172a" opacity="0.07"/>
  <rect x="${x}" y="${top}" width="${w}" height="${h}" rx="${w * 0.34}" fill="url(#grip)" stroke="#c3d0db" stroke-width="2.5"/>
  <!-- ร่องฝาถ่าน AAA 3 ก้อน -->
  <line x1="${x + 6}" y1="${top + h * 0.62}" x2="${x + w - 6}" y2="${top + h * 0.62}" stroke="#cfd9e3" stroke-width="2.5"/>
  <!-- ปุ่มกดเปลี่ยนสีไฟ RGB 15 สี — วางชิดใต้หัวอะคริลิค ไม่ให้ป้ายตัวใหญ่กลางภาพทับ -->
  <circle cx="${cx}" cy="${top + w * 0.45}" r="${w * 0.2}" fill="url(#rgb)" opacity="0.9"/>
  <circle cx="${cx}" cy="${top + w * 0.45}" r="${w * 0.2}" fill="none" stroke="#ffffff" stroke-width="2.5"/>`;
};

// ── การ์ดกลุ่ม "ขนาด" ───────────────────────────────────────────────
const CM = 24; // 1 ซม. = 24 px → หัว 10×10 ซม. = 240×240 · ด้าม 3.5×10.5 ซม. = 84×252

/** การ์ด 1 — ขนาดมาตรฐาน 10 × 10 ซม. */
function stdArt() {
  const side = 10 * CM, cy = 340;
  const cx = W / 2, x = cx - side / 2, y = cy - side / 2;
  const gw = 3.5 * CM, gh = 10.5 * CM, gtop = y + side - 6;
  return card(
    "หัวอะคริลิค 10 × 10 ซม.",
    "ขนาดมาตรฐาน — รวมในราคาแล้ว",
    `${gripStick(cx, gtop, gw, gh)}
     ${head(cx, cy, side, MASCOT)}
     ${dim(x, y - 34, x + side, y - 34, "10 ซม.", "above")}
     ${dim(x - 40, y, x - 40, y + side, "10 ซม.")}
     ${bigLabel(530, "10 × 10 ซม.", 48)}
     ${pill(cx, 700, "ไดคัทตามทรงของลายได้ในขนาดนี้")}`,
    [
      "อะคริลิคใส หนา 5 มม. ไดคัทตามแบบ · ด้ามจับสีขาว 10.5 × 3.5 ซม.",
      "ไฟ RGB กดเปลี่ยนสีได้ 15 สี · ใช้ถ่าน AAA 3 ก้อน",
      "ลายในภาพเป็นตัวอย่างตำแหน่งพิมพ์",
    ],
  );
}

/** การ์ด 2 — กำหนดขนาดเอง (กรอบประขยายรอบหัวมาตรฐาน + ป้ายเรท) */
function customArt() {
  const S = 19; // ย่อสเกลให้กรอบใหญ่ 14 ซม. ยังอยู่ในการ์ด
  const side = 10 * S, bigW = 15 * S, bigH = 12.5 * S, cy = 306;
  const cx = W / 2;
  const bx = cx - bigW / 2, by = cy - bigH / 2;
  const gw = 3.5 * S, gh = 10.5 * S, gtop = cy + side / 2 - 5;
  const arrow = (x, y, dx, dy) => `
    <line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="${OK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${x + dx} ${y + dy} l ${-dx * 0.32 - dy * 0.18} ${-dy * 0.32 + dx * 0.18} M ${x + dx} ${y + dy} l ${-dx * 0.32 + dy * 0.18} ${-dy * 0.32 - dx * 0.18}"
      stroke="${OK}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  const g = 30;
  return card(
    "กำหนดขนาดหัวอะคริลิคเองได้",
    `ใหญ่กว่า 10 ซม. คิดเพิ่ม ซม.ละ ${RATE} บาท (รับได้ถึง ${MAX} ซม.)`,
    `${gripStick(cx, gtop, gw, gh)}
     ${head(cx, cy, side, MASCOT)}
     <rect x="${bx}" y="${by}" width="${bigW}" height="${bigH}" rx="${bigH * 0.16}"
       fill="none" stroke="${OK}" stroke-width="4" stroke-dasharray="14 11"/>
     ${arrow(bx + 8, by + 8, -g, -g)}
     ${arrow(bx + bigW - 8, by + 8, g, -g)}
     ${arrow(bx + 8, by + bigH - 8, -g, g)}
     ${arrow(bx + bigW - 8, by + bigH - 8, g, g)}
     <text x="${cx}" y="${by - 16}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${OK}">กว้าง</text>
     <text x="${bx - 16}" y="${cy + 8}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="end" fill="${OK}">ยาว</text>
     ${bigLabel(534, `+${RATE} บาท / ซม.`, 44)}
     ${pill(cx, 700, `กว้าง × ยาว ไม่เท่ากันได้ · คิดจากด้านที่ยาวกว่า`)}`,
    [
      "กรอกกว้าง × ยาว ในช่องด้านล่าง — ระบบคิดค่าส่วนเกินให้อัตโนมัติ",
      `ใหญ่กว่า ${MAX} ซม. ทักแชทให้แอดมินตีราคา (ด้ามจับกว้าง 3.5 ซม. รับน้ำหนักได้จำกัด)`,
      "ด้ามจับยังเป็นขนาดเดิม 10.5 × 3.5 ซม. ทุกแบบ",
    ],
  );
}

// ── การ์ดกลุ่ม "สกรีนกี่ด้าน" ────────────────────────────────────────
/** หัวอะคริลิคคู่ หน้า-หลัง + ป้ายกำกับใต้แต่ละใบ */
const facePair = (backArt) => {
  const side = 232, cy = 320;
  const lx = 268, rx = 632;
  const cap = (cx, t, ok) => `
    <text x="${cx}" y="${cy + side / 2 + 44}" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="middle" fill="${ok ? OK : SUB}">${t}</text>`;
  return `
    ${head(lx, cy, side, MASCOT, { glow: 0.7 })}
    ${head(rx, cy, side, backArt, { glow: 0.7 })}
    ${cap(lx, "ด้านหน้า · มีลาย", true)}
    ${cap(rx, backArt ? "ด้านหลัง · มีลาย" : "ด้านหลัง · ไม่มีลาย", !!backArt)}`;
};

function oneSideArt() {
  return card(
    ONE_SIDE,
    "พิมพ์ลายด้านเดียว — อีกด้านเป็นอะคริลิคใส",
    `${facePair(null)}
     ${bigLabel(530, ONE_SIDE, 46)}
     ${pill(W / 2, 692, "รวมในราคาสินค้าแล้ว")}`,
    [
      "แสงไฟจากฐานวิ่งขึ้นในแผ่นอะคริลิค ขับเส้นลายด้านที่สกรีนให้เรืองชัด",
      "มองจากด้านหลังยังเห็นลายทะลุแผ่นใสได้ แต่จะกลับข้างซ้าย-ขวา",
    ],
  );
}

function twoSideArt() {
  return card(
    TWO_SIDE,
    `พิมพ์ทั้งสองด้าน หน้า-หลังคนละลายได้ · เพิ่มอันละ ${TWO_EXTRA} บาท`,
    `${facePair(MASCOT2)}
     ${bigLabel(530, TWO_SIDE, 46)}
     ${pill(W / 2, 692, `บวกเพิ่มอันละ ${TWO_EXTRA} บาท`)}`,
    [
      "ส่งลายมา 2 ไฟล์ได้ — หรือใช้ลายเดียวกันทั้งสองด้านให้เข้มขึ้นก็ได้",
      "เหมาะกับแท่งไฟที่ถูกมองจากทั้งสองฝั่งในคอนเสิร์ต/งานแฟนมีต",
    ],
  );
}

// ── เรนเดอร์ ────────────────────────────────────────────────────────
const FILES = [
  { file: `size-10x10-${VER}.jpg`, svg: stdArt(), key: STD_CHOICE },
  { file: `size-custom-${CUSTOM_VER}.jpg`, svg: customArt(), key: CUSTOM_CHOICE },
  { file: `screen-1-side-${VER}.jpg`, svg: oneSideArt(), key: ONE_SIDE },
  { file: `screen-2-side-${VER}.jpg`, svg: twoSideArt(), key: TWO_SIDE },
];
const bufs = {};
for (const f of FILES) {
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  bufs[f.file] = buf;
  writeFileSync(`${OUT}/${f.file}`, buf);
  // ครอปกลาง 300-600 = สิ่งที่ลูกค้าเห็นบนปุ่มตัวเลือกจริง
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${f.file}`);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(buf.length / 1024)} KB — ${f.key}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urls = {};
for (const f of FILES) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, bufs[f.file], { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urls[f.key] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.key]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: `หัวอะคริลิคมาตรฐาน 10×10 ซม. — กำหนดกว้าง × ยาว เองได้ คิดเพิ่ม ซม.ละ ฿${RATE} จากด้านที่ยาวกว่า (ด้ามจับเป็นขนาดเดิม 10.5 × 3.5 ซม. ทุกแบบ)`,
  choices: [
    {
      name: STD_CHOICE,
      popular: true,
      desc: "ขนาดเริ่มต้นของร้าน รวมในราคาแล้ว · อะคริลิคใส หนา 5 มม. ไดคัทตามทรงของลายได้",
      imageSrc: urls[STD_CHOICE],
    },
    {
      name: CUSTOM_CHOICE,
      desc: `กรอกกว้าง × ยาว เองได้ · ใหญ่กว่า 10 ซม. คิดเพิ่ม ซม.ละ ฿${RATE} จากด้านที่ยาวกว่า (รับได้ถึง ${MAX} ซม.) — กรอกขนาดในช่องด้านล่าง`,
      imageSrc: urls[CUSTOM_CHOICE],
      // 📏 คิดเงินครั้งเดียวจากคู่ช่อง ก.×ย. (ดู SizeFee) — ไม่ใช้ inputFee ที่อ่านได้แค่ช่องตัวเอง
      sizeFee: { widthLabel: W_LABEL, heightLabel: H_LABEL, tiers: SIZE_TIERS },
    },
  ],
};

// ช่องกรอก ก.×ย. — โผล่เมื่อเลือกกำหนดขนาดเอง · standardInput = ข้อมูลงานปกติ ไม่เข้ากล่อง 📐 สั่งทำพิเศษ
// บังคับกรอกทั้งคู่ (required) ไม่งั้นเลือกกำหนดขนาดเองแล้วปล่อยว่าง = ได้ของใหญ่ในราคาเดิม
const sizeField = (label, placeholder, hint) => ({
  label,
  // ⚠️ ต้องมี choices: [] เสมอแม้เป็นช่องกรอก — โค้ดหลายที่เรียก opt.choices.map/[0] ตรง ๆ
  choices: [],
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE_GROUP, choices: [CUSTOM_CHOICE] },
  input: { kind: "number", unit: "ซม.", min: 1, max: MAX, required: true, placeholder, hint },
});
const sizeInputs = [
  sizeField(W_LABEL, "10", "ใส่ทศนิยมได้ เช่น 8.5"),
  sizeField(H_LABEL, "14",
    `ราคาคิดจาก "ด้านที่ยาวกว่า" ของสองช่องนี้ — 10 ซม. แรกรวมในราคาแล้ว เกินจากนั้นคิดเพิ่ม ซม.ละ ฿${RATE} (เศษปัดขึ้นเต็ม ซม.) · รับได้ถึง ${MAX} ซม. ใหญ่กว่านั้นทักแชทให้แอดมินตีราคา`),
];


// เปลี่ยนชื่อตัวเลือกกลุ่มสกรีน + ใส่ภาพ (คงลำดับ/ราคาเดิมไว้)
const screenIdx = options.findIndex((o) => o.label === SCREEN_GROUP);
if (screenIdx < 0) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
const oldScreen = options[screenIdx];
const oldOne = oldScreen.choices?.find((c) => /^(สกรีน\s*)?1 ด้าน$/.test(c.name));
const oldTwo = oldScreen.choices?.find((c) => /^(สกรีน\s*)?2 ด้าน$/.test(c.name));
if (!oldOne || !oldTwo) { console.error("ไม่เจอตัวเลือก 1/2 ด้านเดิม — หยุดก่อน", oldScreen.choices?.map((c) => c.name)); process.exit(1); }
options[screenIdx] = {
  ...oldScreen,
  display: "cards",
  choices: [
    { ...oldOne, name: ONE_SIDE, imageSrc: urls[ONE_SIDE], desc: "พิมพ์ลายด้านเดียว อีกด้านเป็นอะคริลิคใส — รวมในราคาแล้ว" },
    { ...oldTwo, name: TWO_SIDE, extra: TWO_EXTRA, imageSrc: urls[TWO_SIDE], desc: `พิมพ์ลายทั้งสองด้าน หน้า-หลังคนละลายได้ · บวกเพิ่มอันละ ฿${TWO_EXTRA}` },
  ],
};

// รันซ้ำได้: ตัดของเดิม (กลุ่มขนาด + ช่องกรอก) ทิ้งก่อน แล้ววางใหม่หน้ากลุ่มสกรีน
// "ขนาดที่ต้องการ · ด้านยาวสุด" = ช่องเดี่ยวรุ่นแรก (4 ก.ย. 69) — ต้องกวาดทิ้งด้วย ไม่งั้นค้างคิดเงินซ้ำ
const STALE = ["ขนาดที่ต้องการ · ด้านยาวสุด"];
const cleaned = options.filter(
  (o) => o.label !== SIZE_GROUP && o.label !== W_LABEL && o.label !== H_LABEL && !STALE.includes(o.label)
);
const at = cleaned.findIndex((o) => o.label === SCREEN_GROUP);
cleaned.splice(at, 0, sizeGroup, ...sizeInputs);

data.options = cleaned;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gSize = got.find((o) => o.label === SIZE_GROUP);
const gW = got.find((o) => o.label === W_LABEL);
const gH = got.find((o) => o.label === H_LABEL);
const gFee = gSize?.choices?.[1]?.sizeFee;
const gScreen = got.find((o) => o.label === SCREEN_GROUP);
const fails = [
  [got.length === 4, `จำนวนกลุ่มไม่ใช่ 4 (ได้ ${got.length}) — กลุ่มหาย/ซ้ำ`],
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [got.filter((o) => o.label === W_LABEL).length === 1, "ช่องกว้างซ้ำ/หาย"],
  [got.filter((o) => o.label === H_LABEL).length === 1, "ช่องยาวซ้ำ/หาย"],
  [!got.some((o) => o.label === "ขนาดที่ต้องการ · ด้านยาวสุด"), "ช่องเดี่ยวรุ่นเก่ายังค้างอยู่ (คิดเงินซ้ำ)"],
  [!got.some((o) => o.inputFee), "ยังมี inputFee ค้าง — ต้องคิดเงินผ่าน sizeFee ทางเดียว"],
  [gSize?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [gSize?.choices?.[0]?.name === STD_CHOICE && gSize?.choices?.[0]?.imageSrc === urls[STD_CHOICE], "การ์ดมาตรฐานไม่ตรง"],
  [!gSize?.choices?.[0]?.extra, "การ์ดมาตรฐานต้องไม่บวกราคา"],
  [gSize?.choices?.[1]?.name === CUSTOM_CHOICE && gSize?.choices?.[1]?.imageSrc === urls[CUSTOM_CHOICE], "การ์ดกำหนดขนาดเองไม่ตรง"],
  [gFee?.widthLabel === W_LABEL && gFee?.heightLabel === H_LABEL, "sizeFee ไม่ได้ผูกกับคู่ช่อง ก.×ย."],
  [gFee?.tiers?.length === MAX - FREE + 1, "ขั้นราคาตามขนาดไม่ครบ"],
  [gFee?.tiers?.[0]?.upTo === FREE && gFee?.tiers?.[0]?.fee === 0, "ขั้นแรก (10 ซม.) ต้องฟรี"],
  [gFee?.tiers?.at(-1)?.upTo === MAX && gFee?.tiers?.at(-1)?.fee === (MAX - FREE) * RATE, "ขั้นสุดท้ายไม่ตรงเรท"],
  [[gW, gH].every((o) => o?.showWhen?.label === SIZE_GROUP && o?.showWhen?.choices?.[0] === CUSTOM_CHOICE), "showWhen ช่องกรอกไม่ถูก"],
  [[gW, gH].every((o) => o?.input?.max === MAX && o?.input?.required === true), "เพดาน/required ช่องกรอกไม่ถูก"],
  [[gW, gH].every((o) => Array.isArray(o?.choices)), "ช่องกรอกขาด choices: [] (หน้าสินค้าจะ 500)"],
  [got.findIndex((o) => o.label === W_LABEL) < got.findIndex((o) => o.label === H_LABEL), "ช่องกว้างต้องมาก่อนช่องยาว"],
  [got.findIndex((o) => o.label === SIZE_GROUP) < got.findIndex((o) => o.label === SCREEN_GROUP), "กลุ่มขนาดไม่ได้อยู่หน้ากลุ่มสกรีน"],
  [gScreen?.choices?.length === 2, "กลุ่มสกรีนจำนวนตัวเลือกเปลี่ยน"],
  [gScreen?.choices?.[0]?.name === ONE_SIDE && gScreen?.choices?.[1]?.name === TWO_SIDE, "ชื่อตัวเลือกสกรีนไม่ตรง"],
  [gScreen?.choices?.[0]?.imageSrc === urls[ONE_SIDE] && gScreen?.choices?.[1]?.imageSrc === urls[TWO_SIDE], "ภาพตัวเลือกสกรีนไม่ตรง"],
  [!gScreen?.choices?.[0]?.extra && gScreen?.choices?.[1]?.extra === TWO_EXTRA, "ราคาบวกเพิ่มสกรีน 2 ด้านเปลี่ยน"],
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(SIZE_GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(SIZE_GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 180 && back.data.priceMax === 390, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nตัวอย่างค่าขนาด (ต่ออัน) — คิดจากด้านที่ยาวกว่า:");
for (const [w, h] of [[10, 10], [6, 14], [12, 12], [10.5, 8], [20, 20]]) {
  const longest = Math.max(w, h);
  const fee = (SIZE_TIERS.find((t) => longest <= t.upTo) ?? SIZE_TIERS.at(-1)).fee;
  console.log(`  ${String(w).padStart(4)} × ${String(h).padEnd(4)} ซม. (ยาวสุด ${longest})  →  +฿${fee}`);
}
console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" (2 การ์ด+ภาพ) + ช่องกรอก "${W_LABEL}" / "${H_LABEL}" + กลุ่ม "${SCREEN_GROUP}" (${ONE_SIDE}/${TWO_SIDE} +฿${TWO_EXTRA} พร้อมภาพ)`);
console.log("อ่านกลับตรงทุกข้อ · savedAt =", back.data.savedAt);
