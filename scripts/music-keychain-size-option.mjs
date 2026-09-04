#!/usr/bin/env node
/**
 * พวงกุญแจกล่องดนตรี / Keychain Music Box (standymusic-3) — กลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพวาด
 *
 *   node scripts/music-keychain-size-option.mjs           (วาดภาพลง .cache/standymusic-3/upload ดูก่อน)
 *   node scripts/music-keychain-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: ไม่มีกลุ่มขนาดเลย (มีแต่ชุดตะขอ) — ลูกค้าไม่เห็นว่าชิ้นงานใหญ่แค่ไหน
 * ของใหม่ตามใบสเปคร้าน P-SAmusic1-01.jpg (ช่อง Keychain Music Box):
 *   • ขนาดชิ้นงาน 8×8 ซม. (สกรีน 2 ด้าน)
 *   • อะคริลิคใสแผ่นหน้า 1 มม. | แผ่นกลาง 5 มม. | แผ่นหลัง 2 มม. → หนารวม 8 มม.
 *   • แผ่นหน้าเฉพาะอะคริลิคใสเท่านั้น
 *   • เพิ่มขนาด บวกเพิ่ม ซม.ละ 30 บาท
 *
 * ทำ 2 อย่าง:
 *   1. กลุ่ม "ขนาด" (การ์ด 2 ใบ + ภาพวาดใหม่ 900×900) วางไว้หน้าสุด ก่อนกลุ่ม "รับตะขอไหม"
 *        • "8 × 8 ซม. (มาตรฐาน)"          ไม่บวกเพิ่ม
 *        • "📐 กำหนดขนาดเอง (+฿30/ซม.)"   เกิน 8 ซม. คิดเพิ่ม ซม.ละ ฿30
 *   2. ช่องกรอก 2 ช่อง "ขนาดที่ต้องการ · ด้านกว้าง" และ "· ด้านยาว" (โผล่เมื่อเลือกกำหนดขนาดเอง)
 *      เจ้าของร้านสั่ง 4 ก.ย. 69: "กำหนด กว้าง ยาว ได้ แต่ขนาดบังคับให้เริ่มต้นที่ 8 ซม."
 *      → ทั้งคู่ min 8 · required (เลือกการ์ดนี้แล้วต้องกรอก ไม่งั้นกดสั่งไม่ได้) · เพดาน 13 ซม.
 *      คิดเงินด้วย inputFee { perUnit: 30, free: 8 } **ช่องละชุด** — ส่วนที่เกิน 8 ของแต่ละด้าน
 *      บวกกันตรง ๆ (ทรงเดียวกับ crossbody-bag ที่มีช่องกว้าง/สูงคู่กันอยู่แล้ว)
 *      เช่น 9 × 10 = เกิน 1 + 2 = 3 ซม. = +฿90/ชิ้น
 *
 * ⚠️ ตีความเอง 2 จุด รอร้านยืนยัน (ใบสเปคเขียนแค่ "เพิ่มขนาด บวกเพิ่ม cm ละ 30 บาท"):
 *    (1) นับ **ทีละด้านแล้วบวกกัน** (9 × 10 = +฿90) — ถ้าร้านคิดจาก "ด้านที่ยาวสุดด้านเดียว"
 *        (9 × 10 = +฿60) ให้ลบ inputFee ออกจากช่องด้านกว้าง เหลือเป็นช่องบันทึกขนาดเฉย ๆ
 *    (2) เพดานรับไว้ที่ **13 ซม. (+5 ซม.)** ตามพี่น้องตัวเดียวกัน standymusic-1 ที่ตั้ง qtyMax 5
 *        ใหญ่กว่านั้นให้ทักแชทให้แอดมินตีราคา — ถ้าร้านรับใหญ่กว่านี้ แก้ค่า MAX แล้วรันซ้ำได้เลย
 *
 * ราคา: กลุ่มนี้ **ไม่ใช่แกนตารางราคา** — pricing.driverLabels = [] และ cells มีคีย์เดียว ""
 *   สคริปต์เช็คซ้ำตอนอ่านกลับว่าชื่อกลุ่มไม่ไปชน driverLabels ([[iducky-price-driver-trap]])
 *   ค่าเพิ่มขนาดมาจาก inputFee ของช่องกรอกเท่านั้น การ์ดไม่มี extra → priceMin/priceMax คงเดิม 250/359
 *
 * ภาพ 900×900 สองใบวาดด้วย "สเกลเดียวกัน" (48 px = 1 ซม.) ใบกำหนดขนาดเองจึงใหญ่กว่าจริง ๆ
 * และวาดเป็น **สี่เหลี่ยมผืนผ้า 9 × 10 ซม.** (ไม่ใช่จัตุรัส) ให้เห็นว่ากำหนดกว้าง/ยาวแยกกันได้
 * ⚠️ การ์ดโชว์ภาพ 80×80 · ภาพจัตุรัสลงช่องจัตุรัส = ย่อทั้งใบ ไม่โดนครอป → ชิ้นงานต้องกินเฟรม
 *    หัวเรื่อง/ท้ายภาพอย่างละบรรทัดเดียว ชื่อ+คำอธิบายมีบนการ์ดอยู่แล้ว ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด"/ช่องกรอกอยู่แล้ว = ตัดทิ้งแล้ววางใหม่ ไม่เพิ่มซ้ำ (คิดเงินซ้ำ 2 ทาง)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "standymusic-3";
const VER = "v2"; // v1 = ช่องกรอกช่องเดียว "ด้านยาวสุด" (ก่อนแยกกว้าง/ยาว)
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const STD_CHOICE = "8 × 8 ซม. (มาตรฐาน)";
const CUSTOM_CHOICE = "📐 กำหนดขนาดเอง (+฿30/ซม.)";
const W_LABEL = "ขนาดที่ต้องการ · ด้านกว้าง";
const L_LABEL = "ขนาดที่ต้องการ · ด้านยาว";
const OLD_INPUT = "ขนาดที่ต้องการ · ด้านยาวสุด"; // ช่องเดียวรอบ v1 — ต้องตัดทิ้ง ไม่งั้นคิดเงินซ้ำ
const NEXT_GROUP = "รับตะขอไหม"; // จุดแทรก: หน้ากลุ่มนี้
const RATE = 30; // บาทต่อ ซม. ที่เกินมาตรฐาน (ใบสเปค)
const FREE = 8;  // 8 ซม. แรกรวมในราคาแล้ว
const MAX = 13;  // เพดานที่รับผ่านหน้าเว็บ (+5 ซม.) — ใหญ่กว่านี้ให้แอดมินตีราคา
const DEMO_W = 9;  // ขนาดตัวอย่างที่วาดในภาพใบ "กำหนดขนาดเอง" — ด้านกว้าง
const DEMO_L = 10; // ด้านยาว (จงใจไม่เท่ากัน ให้เห็นว่ากำหนดแยกด้านได้)

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", AMBER = "#b45309";
const PX = 48; // สเกลเดียวกันทั้ง 2 ใบ: 1 ซม. = 48 px → 8 ซม. = 384 · 10 ซม. = 480

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#2f8fd8"/><stop offset="0.55" stop-color="#63b6e8"/><stop offset="1" stop-color="#a7dcf5"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.4"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="82" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="120" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (t) => `<text x="${W / 2}" y="${H - 38}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${esc(t)}</text>`;

const pill = (cx, y, text, tone = "ok") => {
  const w = text.length * 14.5 + 56;
  const c = tone === "warn" ? AMBER : OK;
  const bg = tone === "warn" ? "#fffbeb" : "#ecfeff";
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${c}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${c}">${esc(text)}</text>`;
};

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 34 : -16);
  const lw = label.length * 13;
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? lw : lw / 2)}" y="${ly - 25}" width="${lw}" height="32" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${esc(label)}</text>`;
};

/**
 * ตัวสินค้า — พวงกุญแจกล่องดนตรีอะคริลิคใส 1 ชิ้น
 * วาดตามรูปงานจริง: ลายสกรีนเต็มหน้า + แถบเครื่องเล่นเพลงด้านล่าง (แถบเลื่อน · ปุ่มย้อน/เล่น/ถัดไป
 * โดยปุ่มกลางเป็นปุ่มกดจริงสีดำ) + คลื่นเสียง + รูร้อยตะขอกลางขอบบนพร้อมโซ่ไข่ปลา
 * ขอบขวา-ล่างเป็นสันหนา 3 ชั้น (1 มม. + 5 มม. + 2 มม. = 8 มม.)
 *
 * รับ w/h แยกกัน (ของจริงกำหนดกว้าง/ยาวไม่เท่ากันได้) — พิกัดลายยืดตามกรอบด้วย fx/fy
 * แต่ของกลม ๆ (ปุ่มกด รู มุมโค้ง) ใช้ k จากด้านสั้น จะได้ไม่บิดเป็นวงรีตอนชิ้นงานเป็นผืนผ้า
 * @param cx,cy กลางชิ้นงาน · @param w,h กว้าง/สูงเป็น px
 */
const musicBox = (cx, cy, w, h) => {
  const x0 = cx - w / 2, y0 = cy - h / 2;
  const d = 0.8 * PX;                 // สัน 8 มม. — เท่ากันทุกใบเพราะสเกลเดียวกัน
  const kw = w / 200, kh = h / 200;   // สเปซลายภายใน -100..100 ทั้งสองแกน
  const k = Math.min(kw, kh);         // สเกลของกลม/ความหนาเส้น
  const fx = (u) => x0 + (u + 100) * kw;
  const fy = (v) => y0 + (v + 100) * kh;
  const r = 9 * k;                    // รัศมีมุมโค้ง
  const bar = (cxp, dirn) => `
    <path d="M ${cxp + dirn * 10 * k} ${fy(75) - 13 * k} L ${cxp + dirn * 10 * k} ${fy(75) + 13 * k} L ${cxp - dirn * 10 * k} ${fy(75)} Z" fill="#4a9ed4"/>
    <rect x="${cxp + dirn * 12 * k - (dirn > 0 ? 0 : 4 * k)}" y="${fy(75) - 13 * k}" width="${4 * k}" height="${26 * k}" fill="#4a9ed4"/>`;
  return `
  <!-- เงาใต้ชิ้นงาน + โซ่ไข่ปลา วาดนอกกรอบลาย จะได้ยาว/หนาเท่ากันทุกใบ ไม่ล้นการ์ดตอนชิ้นใหญ่ -->
  <ellipse cx="${cx + 14}" cy="${y0 + h + d + 10}" rx="${w / 2 + 22}" ry="13" fill="#0f172a" opacity="0.10"/>
  <g fill="#c8d2dd" stroke="#9aa7b6" stroke-width="1.6">
    ${[0, 1, 2].map((i) => `<circle cx="${cx + (i % 2 ? 2 : -2)}" cy="${y0 - 13 - i * 12}" r="6"/>`).join("")}
  </g>
  <circle cx="${cx - 2}" cy="${y0 - 56}" r="12" fill="none" stroke="#b9c3cf" stroke-width="4.5"/>

  <!-- สันหนา 3 ชั้น (ขวา + ล่าง) : 1 มม. ใส · 5 มม. ใส · 2 มม. ใส -->
  <path d="M ${x0 + w} ${y0} l ${d} ${d} l 0 ${h} l ${-d} ${-d} Z" fill="#bfe0f2"/>
  <path d="M ${x0} ${y0 + h} l ${d} ${d} l ${w} 0 l ${-d} ${-d} Z" fill="#a9d4ec"/>
  <path d="M ${x0 + w + d * 0.125} ${y0 + d * 0.125} l 0 ${h}" stroke="#8ec4e4" stroke-width="1.6" fill="none"/>
  <path d="M ${x0 + w + d * 0.75} ${y0 + d * 0.75} l 0 ${h}" stroke="#8ec4e4" stroke-width="1.6" fill="none"/>

  <!-- แผ่นหน้า: ลายสกรีนเต็มหน้า -->
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="url(#sky)"/>
  <ellipse cx="${fx(-48)}" cy="${fy(-52)}" rx="${34 * kw}" ry="${17 * kh}" fill="#ffffff" opacity="0.85"/>
  <ellipse cx="${fx(-26)}" cy="${fy(-60)}" rx="${22 * kw}" ry="${14 * kh}" fill="#ffffff" opacity="0.85"/>
  <ellipse cx="${fx(52)}" cy="${fy(-24)}" rx="${26 * kw}" ry="${12 * kh}" fill="#ffffff" opacity="0.6"/>
  <!-- แถบเครื่องเล่นเพลงสีขาวด้านล่าง -->
  <path d="M ${x0} ${fy(22)} L ${x0 + w} ${fy(22)} L ${x0 + w} ${y0 + h - r}
    A ${r} ${r} 0 0 1 ${x0 + w - r} ${y0 + h} L ${x0 + r} ${y0 + h}
    A ${r} ${r} 0 0 1 ${x0} ${y0 + h - r} Z" fill="#ffffff" opacity="0.9"/>
  <!-- แถบเลื่อนเพลง + หัวเลื่อน -->
  <line x1="${fx(-72)}" y1="${fy(42)}" x2="${fx(72)}" y2="${fy(42)}" stroke="#7cb6dd" stroke-width="${3.5 * k}" stroke-linecap="round"/>
  <rect x="${fx(-40)}" y="${fy(42) - 9 * k}" width="${18 * k}" height="${18 * k}" rx="${4 * k}" fill="#cfe8f7" stroke="#5aa3d2" stroke-width="${3 * k}"/>
  <!-- ปุ่มย้อน / ปุ่มกดจริง / ปุ่มถัดไป -->
  ${bar(fx(-56), 1)}${bar(fx(56), -1)}
  <circle cx="${fx(0)}" cy="${fy(75)}" r="${19 * k}" fill="#e8eef4"/>
  <circle cx="${fx(0)}" cy="${fy(75)}" r="${15 * k}" fill="#1b1b1f"/>
  <circle cx="${fx(0) - 5 * k}" cy="${fy(75) - 5 * k}" r="${4 * k}" fill="#ffffff" opacity="0.35"/>
  <!-- คลื่นเสียง -->
  <g stroke="#9ec9e6" stroke-width="${2.6 * k}" stroke-linecap="round">
    ${[7, 13, 5, 16, 9, 18, 6, 12, 8].map((hh, i) => {
      const x = fx(-82) + i * 5 * k;
      return `<line x1="${x}" y1="${fy(92) - (hh / 2) * k}" x2="${x}" y2="${fy(92) + (hh / 2) * k}"/>`;
    }).join("")}
  </g>
  <!-- ผิวอะคริลิคใส: แสงสะท้อนทแยง -->
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="url(#glass)"/>
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.75"/>
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#7fb9dc" stroke-width="1.6"/>
  <!-- รูร้อยตะขอกลางขอบบน (ไม่นับในขนาดชิ้นงาน) -->
  <circle cx="${fx(0)}" cy="${y0 + 14 * k}" r="${7 * k}" fill="#eaf4fb" stroke="#7fb9dc" stroke-width="2"/>`;
};

// ── การ์ดใบที่ 1: ขนาดมาตรฐาน 8 × 8 ซม. ──────────────────────────────
const stdArt = () => {
  const size = FREE * PX;                    // 384
  const cx = W / 2 - 12, cy = 458;
  const half = size / 2;
  const left = cx - half, right = cx + half, top = cy - half, bottom = cy + half;
  return frame(`
    ${title("ขนาดมาตรฐาน 8 × 8 ซม.", "อะคริลิคใส 3 ชั้น หนารวม 8 มม. · สกรีนลาย 2 ด้าน")}
    ${musicBox(cx, cy, size, size)}
    ${dim(left, bottom + 74, right, bottom + 74, "กว้าง 8 ซม.")}
    ${dim(left - 54, top, left - 54, bottom, "ยาว 8 ซม.")}
    <!-- ป้ายชี้สันหนา 3 ชั้น -->
    <line x1="${right + 42}" y1="${bottom - 26}" x2="${right + 96}" y2="${bottom - 76}" stroke="${SUB}" stroke-width="2"/>
    <text x="${right + 100}" y="${bottom - 80}" font-family="${TH}" font-size="20" fill="${SUB}">หนา 8 มม.</text>
    <text x="${right + 100}" y="${bottom - 54}" font-family="${TH}" font-size="20" fill="${SUB}">(1+5+2 มม.)</text>
    ${pill(W / 2, 806, "ขนาดมาตรฐาน รวมในราคาแล้ว")}
    ${foot("ขนาดชิ้นงานไม่นับรูร้อยตะขอ · คลาดเคลื่อนได้เล็กน้อยตามรอบผลิต")}`);
};

// ── การ์ดใบที่ 2: กำหนดขนาดเอง — กว้าง/ยาวแยกกัน เริ่มที่ 8 ซม. ─────────
const customArt = () => {
  const bw = DEMO_W * PX, bh = DEMO_L * PX;  // 432 × 480 (สเกลเดียวกับใบมาตรฐาน)
  const std = FREE * PX;                     // 384
  const cx = W / 2 + 6, cy = 468;
  const left = cx - bw / 2, right = cx + bw / 2, top = cy - bh / 2, bottom = cy + bh / 2;
  const add = (DEMO_W - FREE + DEMO_L - FREE) * RATE;
  const lbl = "8 × 8 ซม. เดิม";
  return frame(`
    ${title("กำหนดกว้าง × ยาวเองได้ เริ่มที่ 8 ซม.", "")}
    <text x="${W / 2}" y="118" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="middle" fill="${AMBER}">เกิน 8 ซม. คิดเพิ่มด้านละ ซม.ละ 30 บาท · รับได้ถึง ${MAX} ซม.</text>
    ${musicBox(cx, cy, bw, bh)}
    <!-- กรอบ 8 × 8 ซม. เดิม ซ้อนกลางชิ้นใหญ่ ให้เห็นว่าโตขึ้นเท่าไหร่ (สเกลเดียวกับใบมาตรฐานเป๊ะ) -->
    <rect x="${cx - std / 2}" y="${cy - std / 2}" width="${std}" height="${std}" rx="9" fill="none"
      stroke="#ffffff" stroke-width="5" opacity="0.9"/>
    <rect x="${cx - std / 2}" y="${cy - std / 2}" width="${std}" height="${std}" rx="9" fill="none"
      stroke="${AMBER}" stroke-width="3.5" stroke-dasharray="14 10"/>
    <rect x="${cx - lbl.length * 8}" y="${cy - std / 2 - 21}" width="${lbl.length * 16}" height="42" rx="21"
      fill="#fffbeb" stroke="${AMBER}" stroke-width="2.5"/>
    <text x="${cx}" y="${cy - std / 2 + 8}" font-family="${TH}" font-size="22" font-weight="700"
      text-anchor="middle" fill="${AMBER}">${esc(lbl)}</text>
    ${dim(left - 46, top, left - 46, bottom, `ยาว ${DEMO_L} ซม.`)}
    ${dim(left, bottom + 72, right, bottom + 72, `กว้าง ${DEMO_W} ซม.`)}
    <text x="${W / 2}" y="${H - 38}" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="middle" fill="${AMBER}">ตัวอย่างนี้ ${DEMO_W} × ${DEMO_L} ซม. = เพิ่มชิ้นละ ${add} บาท</text>`);
};

const FILES = [
  { choice: STD_CHOICE, file: `size-8x8-${VER}.jpg`, svg: stdArt() },
  { choice: CUSTOM_CHOICE, file: `size-custom-${VER}.jpg`, svg: customArt() },
];
const bufs = {};
for (const f of FILES) {
  bufs[f.file] = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${f.file}`, bufs[f.file]);
  // ย่อ 80×80 (ขนาดจริงบนการ์ด) แล้วขยายกลับมาดู — ต้องยังอ่านออกว่าเป็นอะไร
  await sharp(bufs[f.file]).resize(80, 80).resize(320, 320, { kernel: "nearest" }).toFile(`${OUT}/thumb-${f.file}`);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(bufs[f.file].length / 1024)} KB — ${f.choice}`);
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
  urls[f.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.choice]);
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
  note: `ขนาดมาตรฐาน 8×8 ซม. (ไม่นับรูร้อยตะขอ) — กำหนดกว้าง/ยาวเองได้ เริ่มที่ ${FREE} ซม. เกินจากนี้คิดเพิ่มด้านละ ซม.ละ ฿${RATE}`,
  choices: [
    {
      name: STD_CHOICE,
      popular: true,
      desc: "ขนาดเริ่มต้นของร้าน รวมในราคาแล้ว · อะคริลิคใส 3 ชั้น หนารวม 8 มม. สกรีนลาย 2 ด้าน",
      imageSrc: urls[STD_CHOICE],
    },
    {
      name: CUSTOM_CHOICE,
      desc: `กรอกด้านกว้างและด้านยาวเองได้ เริ่มต้นที่ ${FREE} ซม. — ส่วนที่เกิน ${FREE} ซม. คิดเพิ่มด้านละ ซม.ละ ฿${RATE} (รับได้ถึง ${MAX} ซม.)`,
      imageSrc: urls[CUSTOM_CHOICE],
    },
  ],
};

/**
 * ช่องกรอกขนาด 1 ด้าน — กว้าง/ยาวใช้สเปกเดียวกันทุกอย่าง ต่างแค่ชื่อ
 * required (ไม่ตั้ง required:false) = เลือกการ์ด "กำหนดขนาดเอง" แล้วต้องกรอก ไม่งั้นปุ่มสั่งจะบอกให้กรอกก่อน
 * min = FREE ตามที่เจ้าของร้านสั่ง "ขนาดบังคับให้เริ่มต้นที่ 8 ซม." (กรอกน้อยกว่านี้ขึ้นเตือนใต้ช่อง)
 */
const sideInput = (label, side) => ({
  label,
  // ⚠️ ต้องมี choices: [] เสมอแม้เป็นช่องกรอก — โค้ดหลายที่เรียก opt.choices.map/[0] ตรง ๆ
  choices: [],
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE_GROUP, choices: [CUSTOM_CHOICE] },
  input: {
    kind: "number",
    unit: "ซม.",
    min: FREE,
    max: MAX,
    required: true,
    placeholder: String(FREE),
    hint: `${side} — เริ่มต้นที่ ${FREE} ซม. (รวมในราคาแล้ว) เกินจากนี้คิดเพิ่ม ซม.ละ ฿${RATE} · รับได้ถึง ${MAX} ซม. ใหญ่กว่านั้นทักแชทให้แอดมินตีราคา`,
  },
  inputFee: { perUnit: RATE, free: FREE },
});
const widthInput = sideInput(W_LABEL, "ด้านกว้างของชิ้นงาน");
const lengthInput = sideInput(L_LABEL, "ด้านยาวของชิ้นงาน");

// รันซ้ำได้: ตัดของเดิม (ทั้งกลุ่มขนาดและช่องกรอก) ทิ้งก่อน แล้ววางไว้หน้ากลุ่ม "รับตะขอไหม"
const cleaned = options.filter((o) => ![SIZE_GROUP, W_LABEL, L_LABEL, OLD_INPUT].includes(o.label));
const at = cleaned.findIndex((o) => o.label === NEXT_GROUP);
if (at < 0) { console.error(`ไม่เจอกลุ่ม "${NEXT_GROUP}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
cleaned.splice(at, 0, sizeGroup, widthInput, lengthInput);

// รอบ v1 ใส่ช่องเดียวไว้ — นับจำนวนกลุ่มหลังเขียนจากของที่เหลือจริง เผื่อรันทับของเก่า
const beforeCount = cleaned.length - 3;
data.options = cleaned;
data.savedAt = new Date().toISOString(); // ⚠️ ต้องเป็น ISO string ไม่งั้นหน้าแก้ไขติด 409 ตลอด
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gSize = got.find((o) => o.label === SIZE_GROUP);
const gW = got.find((o) => o.label === W_LABEL);
const gL = got.find((o) => o.label === L_LABEL);
const okInput = (g) =>
  g?.inputFee?.perUnit === RATE && g?.inputFee?.free === FREE &&
  g?.input?.min === FREE && g?.input?.max === MAX && g?.input?.required === true &&
  g?.showWhen?.label === SIZE_GROUP && g?.showWhen?.choices?.[0] === CUSTOM_CHOICE &&
  Array.isArray(g?.choices) && g?.standardInput === true;
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [got.filter((o) => o.label === W_LABEL).length === 1, "ช่องด้านกว้างซ้ำ/หาย (คิดเงินซ้ำ)"],
  [got.filter((o) => o.label === L_LABEL).length === 1, "ช่องด้านยาวซ้ำ/หาย (คิดเงินซ้ำ)"],
  [!got.some((o) => o.label === OLD_INPUT), "ช่องเดียวรอบ v1 ยังอยู่ (คิดเงินซ้ำ 2 ทาง)"],
  [got.length === beforeCount + 3, "จำนวนกลุ่มไม่ตรง (กลุ่มเดิมหายไป)"],
  [gSize?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [gSize?.choices?.length === 2, "จำนวนการ์ดไม่ครบ 2"],
  [gSize?.choices?.[0]?.name === STD_CHOICE && gSize?.choices?.[0]?.imageSrc === urls[STD_CHOICE], "การ์ดมาตรฐานไม่ตรง"],
  [gSize?.choices?.[1]?.name === CUSTOM_CHOICE && gSize?.choices?.[1]?.imageSrc === urls[CUSTOM_CHOICE], "การ์ดกำหนดขนาดเองไม่ตรง"],
  [gSize?.choices?.every((c) => c.desc), "การ์ดขาดคำอธิบาย"],
  [gSize?.choices?.every((c) => !c.extra), "การ์ดมี extra ติดมา (จะคิดเงินซ้ำกับช่องกรอก)"],
  [okInput(gW), "ช่องด้านกว้างตั้งค่าไม่ครบ (ค่าบริการ/ขั้นต่ำ/เพดาน/บังคับกรอก/showWhen)"],
  [okInput(gL), "ช่องด้านยาวตั้งค่าไม่ครบ (ค่าบริการ/ขั้นต่ำ/เพดาน/บังคับกรอก/showWhen)"],
  [got.findIndex((o) => o.label === SIZE_GROUP) === 0, "กลุ่มขนาดไม่ได้อยู่หน้าสุด"],
  [got.findIndex((o) => o.label === SIZE_GROUP) < got.findIndex((o) => o.label === NEXT_GROUP), `กลุ่มขนาดไม่ได้อยู่หน้ากลุ่ม "${NEXT_GROUP}"`],
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(SIZE_GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(SIZE_GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 250 && back.data.priceMax === 359, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [typeof back.data.savedAt === "string", "savedAt ไม่ใช่ ISO string (หน้าแก้ไขจะติด 409)"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log("\nค่าเพิ่มขนาดต่อชิ้น (กว้าง × ยาว — นับส่วนที่เกิน 8 ซม. ของทั้งสองด้าน):");
for (const [a, b] of [[8, 8], [8, 10], [9, 10], [10, 10], [12, 12], [13, 13]])
  console.log(`  ${a} × ${b} ซม.  →  +฿${(a - FREE + b - FREE) * RATE}`);
console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" (การ์ด 2 ใบ + ภาพ) + ช่องกรอก "${W_LABEL}" / "${L_LABEL}" อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
