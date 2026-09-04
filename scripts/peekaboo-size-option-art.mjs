#!/usr/bin/env node
/**
 * PEEK-A-BOO ACRYLIC / อะคริลิคจ๊ะเอ๋ (peek-a-boo-acrylic) — กลุ่ม "ขนาด" แบบการ์ด + ภาพประกอบตัวเลือก
 *
 *   node scripts/peekaboo-size-option-art.mjs           (วาดลง .cache/peek-a-boo-acrylic/upload ดูก่อน)
 *   node scripts/peekaboo-size-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69: "เพิ่มกลุ่มตัวเลือกขนาด เป็นแบบการ์ด + สร้างภาพตัวอย่างที่กลุ่มตัวเลือก"
 * ของเดิมในหน้าสินค้าไม่มีกลุ่มขนาดเลย มีแค่ "เพิ่มขนาด" (ช่องติ๊ก บวกเพิ่มเซนละ ฿15 สูงสุด 5 ซม.)
 * ลูกค้าจึงไม่รู้ว่าขนาดมาตรฐานที่ได้คือเท่าไหร่ — สคริปต์นี้เพิ่มการ์ด "6 – 8 ซม." ไว้หน้าสุด
 *
 * แหล่งข้อมูล = ใบสเปคของร้าน `10_อะคริลิค/งานอะคริลิคทั่วไป/24_PeekaBoo อคลจ๊ะเอ๋/P-nPeekaboo-01.jpg`
 *   • เริ่มต้นขนาด 6-8 cm · เพิ่มขนาดบวกเพิ่ม cm ละ 15 บาท (ตรงกับกลุ่ม "เพิ่มขนาด" ใน DB เป๊ะ)
 *   • อะคริลิคใส(เท่านั้น) ความหนารวมหลังประกบแล้ว 6 mm
 *   • ตัวหลัก สกรีน 1 ด้าน (แผ่นหน้า-แผ่นหลัง) · ตัวก้าน สกรีน 2 ด้าน ขนาดรวมทั้งหมด 4-5 cm
 *   • terms ของสินค้า: "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด" + "งานจะไม่ล็อคติดกัน ใช้งานจริงจะโผลให้เห็นตัวกลาง"
 *
 * ⚠️ จงใจ **ไม่แตะ** กลุ่ม "เพิ่มขนาด" ที่มีอยู่ (qty:true extra:15 qtyMax:5) — ถ้าแปลงเป็นการ์ดด้วย
 *    จะกลายเป็น 6 ใบ = โหมดกระชับ ไม่โชว์ desc และเสี่ยงคิดเงินซ้ำ 2 ทาง กับดักเดียวกับ [[iducky-keycover]]
 *    การ์ดขนาดใบเดียวจึงเป็นแค่ "ป้ายบอกขนาดมาตรฐาน" ราคาไม่บวกอะไร (extra ไม่ตั้ง)
 *
 * ราคา: กลุ่มใหม่ "ขนาด" ไม่ใช่แกนตารางราคา (driverLabels = ["ตะขอโซ่ไข่ปลา"]) — เช็คตอนอ่านกลับ
 *   ([[iducky-price-driver-trap]]) · กลุ่ม "ตะขอโซ่ไข่ปลา" **เป็น** แกนราคา ห้ามแก้ชื่อกลุ่ม/ชื่อตัวเลือก
 *   แตะได้แค่ display/imageSrc/desc — และก่อนเขียนมีด่านตรวจว่าส่วนต่าง "แบบสีๆ" ยังเป็น +3 ตามที่เขียนบนภาพ
 *   (ช่วง 1-10 ชิ้นเท่ากันทั้งคู่ที่ 350 — ภาพจึงเขียนกำกับว่าเริ่มบวกตั้งแต่ 11 ชิ้นขึ้นไป)
 *
 * ภาพ 4 ใบ 900×900 วาดชิ้นงานเต็มเฟรม (การ์ดโชว์รูป 80×80 จัตุรัส = ย่อทั้งใบ ไม่ครอป [[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: กลุ่ม "ขนาด" ถ้ามีอยู่แล้วจะถูกแทนที่ ไม่เพิ่มซ้ำ · กลุ่มตะขอแก้แบบ read-modify-write
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "peek-a-boo-acrylic";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const HOOK_GROUP = "ตะขอโซ่ไข่ปลา"; // แกนตารางราคา — ห้ามเปลี่ยนชื่อ
const ADD_GROUP = "เพิ่มขนาด";
const SIZE_CHOICE = "6 – 8 ซม.";
const PER_CM = 15; // ใบสเปค: เพิ่มขนาด cm ละ 15 บาท

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="126" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${esc(t)}</text>`)
    .join("");

const pill = (cx, y, text, on = true) => {
  const w = text.length * 14 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${on ? OK : SUB}">${esc(text)}</text>`;
};

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว (ทรงเดียวกับสคริปต์ขนาดตัวอื่นทั้งร้าน) */
const dim = (x1, y1, x2, y2, label, opt = {}) => {
  const { color = SUB, size = 24, dash = "", labelPos = "side" } = opt;
  const vertical = x1 === x2;
  const top = labelPos === "top";
  const lx = top ? x1 : vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = top ? Math.min(y1, y2) - 18 : vertical ? (y1 + y2) / 2 + 8 : y2 + 32;
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${color}" stroke-width="3"/>`;
  const lw = label.length * (size * 0.53);
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" ${dash ? `stroke-dasharray="${dash}"` : ""}/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical && !top ? lw : lw / 2)}" y="${ly - size}" width="${lw}" height="${size * 1.3}" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="${size}" font-weight="700"
      text-anchor="${vertical && !top ? "end" : "middle"}" fill="${color}">${esc(label)}</text>`;
};

// ── ตัวสินค้า: อะคริลิคจ๊ะเอ๋ทรงกล่องของขวัญ (ตามรูปงานจริงบนใบสเปค) ──
// วาดในสเปซ 1 หน่วย = 1/100 ของด้านยาวสุด · จุด (0,0) = กลาง-บนสุดของชิ้นงาน
//   ฝากล่อง (ตัวหลัก แผ่นบน)  y 0..22   ← รูร้อยโซ่อยู่ตรงนี้
//   ลูกเจี๊ยบ (ตัวก้าน)        y 20..62  ← เลื่อนขึ้น-ลงได้ ส่วนก้านซ่อนอยู่หลังกล่อง
//   ตัวกล่อง (ตัวหลัก แผ่นล่าง) y 52..100
const BOX = "#3b6fe3", BOX_DK = "#2a55b8", BOX_LT = "#5f8cf2", RIBBON = "#dbe1fa";
const CHICK = "#ffd23f", CHICK_DK = "#f2b21c", BEAK = "#f08c1a", EYE = "#3f2a12";
const CLEAR = "#e2f0fb", CLEAR_EDGE = "#a8cbe4";

/** ระยะขอบอะคริลิคใสรอบลายไดคัท (หน่วยเดียวกับสเปซชิ้นงาน) */
const M = 6;
/** ยอด/ก้นของชิ้นงานจริง (รวมขอบใส) เทียบกับจุดอ้างอิง — ใช้วางลูกศรวัดขนาด */
const PIECE_TOP = -M, PIECE_BOT = 100 + M;

const LID_D = "M -40 5 Q -40 0 -35 0 L 35 0 Q 40 0 40 5 L 40 25 Q 40 30 35 30 L -35 30 Q -40 30 -40 25 Z";
const BOX_D = "M -34 56 L 0 70 L 34 56 L 34 95 Q 34 100 29 100 L -29 100 Q -34 100 -34 95 Z";

/** ขอบใสรอบชิ้นไดคัท = ตีเส้นหนารอบ path เดิม (วาดใต้ลายพิมพ์) ไม่ใช่กรอบสี่เหลี่ยม */
const clearEdge = (d) => `
  <path d="${d}" fill="${CLEAR}" stroke="${CLEAR}" stroke-width="${M * 2}" stroke-linejoin="round" opacity="0.95"/>
  <path d="${d}" fill="none" stroke="${CLEAR_EDGE}" stroke-width="${M * 2 + 2.4}" stroke-linejoin="round" opacity="0.55"/>
  <path d="${d}" fill="${CLEAR}" stroke="${CLEAR}" stroke-width="${M * 2 - 1.4}" stroke-linejoin="round"/>`;

/** โบว์ผูกกล่อง — ห่วงสองข้าง + ปมกลาง (วาดบนฝากล่อง) */
const bow = (cy) => `
  <path d="M -4 ${cy + 1} C -11 ${cy - 8} -23 ${cy - 7} -21 ${cy} C -19 ${cy + 7} -10 ${cy + 6} -4 ${cy + 3} Z" fill="${RIBBON}" stroke="#c7cff3" stroke-width="1.2"/>
  <path d="M 4 ${cy + 1} C 11 ${cy - 8} 23 ${cy - 7} 21 ${cy} C 19 ${cy + 7} 10 ${cy + 6} 4 ${cy + 3} Z" fill="${RIBBON}" stroke="#c7cff3" stroke-width="1.2"/>
  <path d="M -3 ${cy + 3} C -6 ${cy + 9} -9 ${cy + 11} -12 ${cy + 12} L -4 ${cy + 12} Z" fill="#c7cff3"/>
  <path d="M 3 ${cy + 3} C 6 ${cy + 9} 9 ${cy + 11} 12 ${cy + 12} L 4 ${cy + 12} Z" fill="#c7cff3"/>
  <ellipse cx="0" cy="${cy + 2}" rx="5.2" ry="4.4" fill="#eef1fb" stroke="#c7cff3" stroke-width="1.2"/>`;

/** ลูกเจี๊ยบ = "ตัวก้าน" — หัวโผล่พ้นกล่อง ก้านใสสอดลงไประหว่างแผ่นหน้า-หลัง */
const chick = () => `
  <rect x="-7" y="50" width="14" height="36" rx="5" fill="${CLEAR}" stroke="${CLEAR_EDGE}" stroke-width="1.6"/>
  <path d="M -3 30 L 0 24 L 3 30 Z" fill="${CHICK_DK}"/>
  <circle cx="0" cy="45" r="16" fill="${CHICK}"/>
  <path d="M -16 45 A 16 16 0 0 0 16 45 Z" fill="${CHICK_DK}" opacity="0.22"/>
  <ellipse cx="-5.6" cy="42" rx="2.4" ry="3.2" fill="${EYE}"/>
  <ellipse cx="5.6" cy="42" rx="2.4" ry="3.2" fill="${EYE}"/>
  <path d="M -3 47.4 L 0 50.8 L 3 47.4 Z" fill="${BEAK}"/>
  <ellipse cx="-10.5" cy="47" rx="3.4" ry="2.2" fill="#ff8f9c" opacity="0.7"/>
  <ellipse cx="10.5" cy="47" rx="3.4" ry="2.2" fill="#ff8f9c" opacity="0.7"/>
  <path d="M -15 50 C -20 52 -20 58 -14 57 Z" fill="${CHICK_DK}"/>
  <path d="M 15 50 C 20 52 20 58 14 57 Z" fill="${CHICK_DK}"/>`;

/**
 * ชิ้นงาน 1 ชิ้น — cx,cy = กลาง/ยอดของ "ลายพิมพ์" (ขอบใสล้นออกไปอีก M หน่วย)
 * opts.stick = โชว์กรอบประของตัวก้านที่ซ่อนอยู่หลังกล่อง (ใช้เฉพาะการ์ดขนาด)
 */
const peekaboo = (cx, cy, s, { stick = false } = {}) => `
  <g transform="translate(${cx} ${cy}) scale(${s})">
    <ellipse cx="0" cy="${PIECE_BOT + 4}" rx="30" ry="3.6" fill="#0f172a" opacity="0.07"/>

    <!-- ตัวก้าน (สกรีน 2 ด้าน) วาดก่อน = อยู่ระหว่างแผ่นหน้า-หลัง จึงโดนกล่องบังครึ่งตัว -->
    ${chick()}

    <!-- ตัวหลัก แผ่นบน: ฝากล่อง + โบว์ + รูร้อยโซ่ -->
    ${clearEdge(LID_D)}
    <path d="${LID_D}" fill="${BOX}"/>
    <path d="M -40 5 Q -40 0 -35 0 L 35 0 Q 40 0 40 5 L 40 11 L -40 11 Z" fill="${BOX_LT}"/>
    <rect x="-7" y="0" width="14" height="30" fill="${RIBBON}"/>
    ${bow(17)}
    <circle cx="0" cy="-0.5" r="3.2" fill="#ffffff" stroke="#8fb6d2" stroke-width="1.5"/>

    <!-- ตัวหลัก แผ่นล่าง: ตัวกล่อง (บังตัวก้านครึ่งตัว = ท่าจ๊ะเอ๋) -->
    ${clearEdge(BOX_D)}
    <path d="${BOX_D}" fill="${BOX}"/>
    <path d="M -34 56 L 0 70 L 34 56 L 34 64 L 0 78 L -34 64 Z" fill="${BOX_DK}" opacity="0.5"/>
    <path d="M -7 73 L 7 73 L 7 100 L -7 100 Z" fill="${RIBBON}"/>

    <!-- เอกซเรย์ตัวก้าน: กรอบประวาดทับกล่อง ให้เห็นว่าก้านยาวต่อลงไปข้างใน -->
    ${stick ? `
      <rect x="-9" y="60" width="18" height="28" rx="6" fill="#ffffff" opacity="0.42"/>
      <rect x="-15" y="26" width="30" height="62" rx="13" fill="none" stroke="${OK}" stroke-width="2" stroke-dasharray="9 8" opacity="0.75"/>` : ""}
  </g>`;

// ── โซ่ไข่ปลา (ยกวิธีวาดมาจาก scripts/frame-card-option-art.mjs) ──────
function beadsOn(p0, p1, p2, p3, step) {
  const at = (t) => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  const out = [at(0)];
  let prev = out[0], acc = 0;
  for (let i = 1; i <= 1200; i++) {
    const p = at(i / 1200);
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    if (acc >= step) { out.push(p); acc = 0; }
    prev = p;
  }
  return out;
}

const ballChain = (beads, id, r = 10) =>
  beads.slice(1).map(([bx, by], i) => {
    const [ax, ay] = beads[i];
    return `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="url(#${id}-bar)" stroke-width="${r * 0.5}" stroke-linecap="round"/>`;
  }).join("") +
  beads.map(([cx, cy]) => `
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="url(#${id}-ball)"/>
    <circle cx="${(cx - r * 0.3).toFixed(1)}" cy="${(cy - r * 0.34).toFixed(1)}" r="${r * 0.27}" fill="#ffffff" opacity="0.75"/>`).join("");

const clasp = (cx, cy, rot, id, len = 58, wdt = 24) => `<g transform="translate(${cx} ${cy}) rotate(${rot})">
  <rect x="${-len / 2}" y="${-wdt / 2}" width="${len}" height="${wdt}" rx="${wdt / 2}" fill="url(#${id}-ball)" stroke="#ffffff" stroke-width="2" stroke-opacity="0.5"/>
  <line x1="${-len * 0.1}" y1="${-wdt * 0.34}" x2="${-len * 0.1}" y2="${wdt * 0.34}" stroke="#ffffff" stroke-width="2" stroke-opacity="0.55"/>
</g>`;

const chainDefs = (id, c) => `
  <radialGradient id="${id}-ball" cx="0.34" cy="0.3" r="0.78">
    <stop offset="0" stop-color="${c.light}"/><stop offset="0.55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.dark}"/>
  </radialGradient>
  <linearGradient id="${id}-bar" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.dark}"/>
  </linearGradient>`;

const SILVER = { light: "#ffffff", mid: "#cbd5e1", dark: "#8194a8" };
const COLOR = { light: "#ffe3ee", mid: "#f472a4", dark: "#bd4c7c" };
/** เฉดตัวอย่างจากกลุ่ม "สีตะขอ C (โซ่ไข่ปลา)" ของสินค้านี้ (มีจริง 23 สี) */
const SWATCHES = ["#111827", "#6b7280", "#ffffff", "#8b5a2b", "#f0863c", "#f6d43a", "#7cc242", "#3fb59a", "#4aa8e8", "#3f57b5", "#8b6ee0", "#f06fa8", "#e0343a"];

// ── ภาพที่ 1: การ์ดกลุ่ม "ขนาด" ──────────────────────────────────────
const S1 = 4.2;              // px ต่อหน่วย → ลายพิมพ์สูง 100 หน่วย = 420 px
const CX1 = 430;             // เว้นที่ซ้ายให้ลูกศรวัด เว้นขวาให้ป้ายตัวก้าน
const TOP = 192;             // ยอดของ "ลายพิมพ์" (ขอบใสล้นขึ้นไปอีก M หน่วย)

function sizeArt() {
  const label = SIZE_CHOICE;
  const lw = label.length * 27 + 76;
  const outTop = TOP + PIECE_TOP * S1, outBot = TOP + PIECE_BOT * S1;
  const stickTop = TOP + 26 * S1, stickBot = TOP + 88 * S1;
  return frame(`
    ${title("ขนาดมาตรฐาน 6 – 8 ซม.", "วัดจากด้านที่ยาวที่สุด — ทั้งช่วงราคาเท่ากัน")}

    ${peekaboo(CX1, TOP, S1, { stick: true })}

    <!-- ด้านยาวสุดของตัวหลัก = ตัวเลขที่ลูกค้าสั่ง -->
    ${dim(190, outTop, 190, outBot, "6 – 8 ซม.", { size: 27, color: INK })}
    <!-- ตัวก้านที่สอดอยู่ข้างใน (ครึ่งล่างซ่อนหลังกล่อง) -->
    ${dim(716, stickTop, 716, stickBot, "ตัวก้าน 4 – 5 ซม.", { size: 22, color: OK, dash: "10 7", labelPos: "top" })}
    <text x="716" y="${stickBot + 36}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${OK}">สกรีน 2 ด้าน</text>
    <text x="716" y="${stickBot + 62}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">เลื่อนขึ้น-ลงได้</text>

    <!-- ป้ายขนาดตัวใหญ่ ให้ยังอ่านออกตอนย่อเป็นรูปบนการ์ด 80×80 -->
    <rect x="${(W - lw) / 2}" y="${H - 226}" width="${lw}" height="72" rx="36" fill="#ffffff" opacity="0.94" stroke="${OK}" stroke-width="3"/>
    <text x="${W / 2}" y="${H - 173}" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="${INK}">${esc(label)}</text>
    ${pill(W / 2, H - 116, `ใหญ่กว่านี้เพิ่ม ซม. ละ ฿${PER_CM}`)}
    ${foot([
      "อะคริลิคใสประกบ 2 แผ่น หนารวม 6 มม. · ตัวหลักสกรีน 1 ด้าน (แผ่นหน้า-แผ่นหลัง)",
      "งานจ๊ะเอ๋ไม่ล็อคติดกัน ใช้งานจริงตัวก้านจะโผล่ให้เห็นตัวกลางเสมอ",
    ])}`);
}

// ── ภาพที่ 2-4: กลุ่ม "ตะขอโซ่ไข่ปลา" ────────────────────────────────
const S2 = 3.2;
const K_TOP = 312;
const K_CX = 500;
const HOLE = [K_CX, K_TOP - 0.5 * S2]; // รูร้อยโซ่บนขอบใสด้านบนของฝากล่อง

function hookArt(kind, colorDiff) {
  const id = kind === "color" ? "cch" : "sch";
  const clip = [K_CX - 158, 218];
  const chain = kind === "none" ? "" : `
    ${ballChain(beadsOn(HOLE, [HOLE[0] - 22, HOLE[1] - 108], [clip[0] + 118, clip[1] - 30], clip, 21), id)}
    ${ballChain(beadsOn(HOLE, [HOLE[0] - 130, HOLE[1] - 6], [clip[0] - 6, clip[1] + 96], clip, 21), id)}
    ${clasp(clip[0] + 14, clip[1] + 4, 32, id)}`;

  const swatchRow = kind !== "color" ? "" : SWATCHES.map((c, i) => `
    <circle cx="${132 + i * 17}" cy="472" r="8" fill="${c}" stroke="#cbd5e1" stroke-width="1.4"/>`).join("") + `
    <text x="${132 + ((SWATCHES.length - 1) / 2) * 17}" y="512" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${SUB}">มีให้เลือก 23 เฉด</text>`;

  const noneMark = kind !== "none" ? "" : `
    <circle cx="292" cy="336" r="56" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="4"/>
    <line x1="261" y1="305" x2="323" y2="367" stroke="#94a3b8" stroke-width="9" stroke-linecap="round"/>
    <line x1="323" y1="305" x2="261" y2="367" stroke="#94a3b8" stroke-width="9" stroke-linecap="round"/>
    <text x="292" y="434" font-family="${TH}" font-size="22" font-weight="600" text-anchor="middle" fill="${SUB}">ไม่ใส่โซ่/ตะขอ</text>`;

  const head = {
    silver: ["ตะขอโซ่ไข่ปลา ธรรมดาสีเงิน", "โซ่ไข่ปลาสีเงิน ร้อยรูบนฝากล่อง — รวมในราคาแล้ว"],
    color: ["ตะขอโซ่ไข่ปลา แบบสีๆ", "โซ่ทั้งเส้นเป็นสีที่เลือก — เลือกเฉดในกลุ่ม “สีตะขอ C”"],
    none: ["ไม่รับตะขอ", "ได้เฉพาะตัวชิ้นงานที่เจาะรูไว้ ไม่แถมโซ่/ตะขอ"],
  }[kind];

  const statusPill = {
    silver: ["ฟรี ไม่บวกเพิ่ม", true],
    color: [`บวกชิ้นละ ฿${colorDiff} (11 ชิ้นขึ้นไป)`, true],
    none: ["ราคาเท่าแบบสีเงิน", false],
  }[kind];

  const notes = {
    silver: ["โซ่ไข่ปลาสีเงินมาตรฐานของร้าน ห้อยกระเป๋า/เป้ หรือทำเป็นพวงกุญแจได้", "รูร้อยโซ่เจาะไว้บนตัวหลัก (แผ่นที่ไม่เลื่อน)"],
    color: ["เลือกเฉดต่อในกลุ่ม “สีตะขอ C (โซ่ไข่ปลา)” ที่จะโผล่ขึ้นมาให้เลือก", "สีจริงอาจเข้ม-อ่อนต่างจากชาร์ตราว 5% ตามล็อตของโรงงาน"],
    none: ["เอาไปร้อยห่วง/สายคล้องเองได้ตามใจ — รูเจาะไว้ให้แล้ว", "ราคาเท่ากับแบบโซ่สีเงินทุกช่วงจำนวน"],
  }[kind];

  return frame(`
    ${title(head[0], head[1])}
    ${peekaboo(K_CX, K_TOP, S2)}
    ${chain}
    ${noneMark}
    ${swatchRow}
    ${pill(W / 2, H - 176, statusPill[0], statusPill[1])}
    ${foot(notes)}`,
    chainDefs("sch", SILVER) + chainDefs("cch", COLOR));
}

// ── ราคา: อ่านส่วนต่าง "แบบสีๆ" จาก DB ก่อน แล้วค่อยวาด (ภาพจะได้ไม่โกหก) ─
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (...m) => { console.error("✖", ...m); process.exit(1); };

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) die(readErr);
const data = row.data;

const matrices = [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)].filter(Boolean);
if (!matrices.length) die("ไม่มีตารางราคา");
let colorDiff = null;
for (const m of matrices) {
  if ((m.driverLabels ?? []).join("│") !== HOOK_GROUP) die("แกนตารางราคาเปลี่ยนไปแล้ว:", (m.driverLabels ?? []).join("│"));
  const silver = m.cells["ธรรมดาสีเงิน"], color = m.cells["แบบสีๆ"], none = m.cells["❌ ไม่รับตะขอ"];
  if (!silver || !color || !none) die("หาช่องราคาของกลุ่มตะขอไม่ครบ");
  silver.forEach((v, i) => {
    if (none[i] !== v) die(`"ไม่รับตะขอ" ไม่เท่ากับสีเงิน (ช่วงที่ ${i + 1}: ${v} vs ${none[i]})`);
    const d = color[i] - v;
    if (i === 0 ? d !== 0 : d !== 3) die(`ส่วนต่างโซ่แบบสีไม่ตรงที่ภาพเขียนไว้ (ช่วงที่ ${i + 1}: +${d})`);
    if (i > 0) colorDiff = d;
  });
}
const addGroup = (data.options ?? []).find((o) => o.label === ADD_GROUP);
if ((addGroup?.choices?.[0]?.extra ?? 0) !== PER_CM) die(`กลุ่ม "${ADD_GROUP}" ไม่ได้คิดเซนละ ฿${PER_CM} แล้ว — ภาพเขียนตัวเลขนี้ไว้`);
const nColors = (data.options ?? []).find((o) => o.label.startsWith("สีตะขอ C"))?.choices?.length ?? 0;
if (nColors !== 23) die(`กลุ่มสีตะขอมี ${nColors} เฉด — ภาพเขียนไว้ 23 เฉด`);

// ── เรนเดอร์ ────────────────────────────────────────────────────────
const JOBS = [
  {
    file: `size-6-8cm-${VER}.jpg`, svg: sizeArt,
    newGroup: true,
    desc: `ขนาดมาตรฐานของร้าน วัดจากด้านที่ยาวที่สุด — สั่งได้ทุกขนาดในช่วง 6-8 ซม. ราคาเท่ากัน · ใหญ่กว่านี้ติ๊กกลุ่ม “${ADD_GROUP}” เพิ่ม ซม. ละ ฿${PER_CM}`,
  },
  {
    file: `hook-silver-${VER}.jpg`, svg: () => hookArt("silver", colorDiff),
    choice: "ธรรมดาสีเงิน", desc: "โซ่ไข่ปลาสีเงินมาตรฐาน ร้อยรูบนตัวหลัก — รวมในราคาแล้ว",
  },
  {
    file: `hook-color-${VER}.jpg`, svg: () => hookArt("color", colorDiff),
    choice: "แบบสีๆ", desc: `โซ่ทั้งเส้นเป็นสีที่เลือก — เลือกเฉดได้ 23 สีในกลุ่มถัดไป (11 ชิ้นขึ้นไปบวกชิ้นละ ฿${colorDiff})`,
  },
  {
    file: `hook-none-${VER}.jpg`, svg: () => hookArt("none", colorDiff),
    choice: "❌ ไม่รับตะขอ", desc: "รับเฉพาะตัวชิ้นงานที่เจาะรูไว้ ไม่ใส่โซ่/ตะขอ — ราคาเท่าแบบสีเงิน",
  },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  // ย่อเท่าที่ลูกค้าเห็นบนการ์ดจริง (80×80) แล้วขยายกลับ — ตรวจว่ายังแยกออก ([[iducky-option-thumb-crop]])
  await sharp(j.buf).resize(80, 80).resize(240, 240, { kernel: "nearest" }).toFile(`${OUT}/_thumb80-${j.file}`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB (+ _thumb80)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log(`\n(ยังไม่เขียน DB — เปิดดูที่ ${OUT} แล้วรันด้วย --write เมื่อภาพผ่านตา)`); process.exit(0); }

// ── อัปโหลด storage + เขียน options + อ่านกลับเทียบ ──────────────────
for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (error) die("อัปโหลดพัง", key, error);
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", j.url);
}

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const sizeJob = JOBS.find((j) => j.newGroup);
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: `ขนาดมาตรฐาน 6-8 ซม. นับจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง) · อยากใหญ่กว่านี้ติ๊ก "${ADD_GROUP}" ด้านล่าง เพิ่ม ซม. ละ ฿${PER_CM} (สูงสุด 5 ซม.)`,
  choices: [{ name: SIZE_CHOICE, popular: true, imageSrc: sizeJob.url, desc: sizeJob.desc }],
};

// กลุ่มตะขอ: แตะแค่ display/imageSrc/desc — ชื่อกลุ่ม/ชื่อตัวเลือกเป็นคีย์ตารางราคา ห้ามยุ่ง
const hookGroups = (data.options ?? []).filter((o) => o.label === HOOK_GROUP);
if (hookGroups.length !== 1) die(`กลุ่ม "${HOOK_GROUP}" เจอ ${hookGroups.length} กลุ่ม — ต้องมีกลุ่มเดียว`);
hookGroups[0].display = "cards";
for (const j of JOBS.filter((j) => j.choice)) {
  const c = (hookGroups[0].choices || []).find((c) => c.name === j.choice);
  if (!c) die(`ไม่เจอตัวเลือก "${j.choice}" ในกลุ่ม "${HOOK_GROUP}"`);
  c.imageSrc = j.url;
  c.desc = j.desc;
}

// รันซ้ำได้: ตัดกลุ่มขนาดเดิม (ถ้ามี) ทิ้งก่อน แล้ววางไว้หน้าสุด
data.options = [sizeGroup, ...(data.options ?? []).filter((o) => o.label !== SIZE_GROUP)];
data.savedAt = new Date().toISOString(); // ⏱ กันแคชรูป (?v=savedAt)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr);

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ([[iducky-script-write-product]])
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const sg = got.find((o) => o.label === SIZE_GROUP);
const hg = got.find((o) => o.label === HOOK_GROUP);
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [got[0]?.label === SIZE_GROUP, "กลุ่มขนาดไม่ได้อยู่บนสุด"],
  [sg?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [sg?.choices?.length === 1 && sg.choices[0].name === SIZE_CHOICE, "การ์ดขนาดไม่ตรง"],
  [sg?.choices?.[0]?.imageSrc === sizeJob.url && !!sg.choices[0].desc, "การ์ดขนาดขาดภาพ/คำอธิบาย"],
  [!sg?.choices?.[0]?.extra, "การ์ดขนาดมาตรฐานต้องไม่บวกราคา"],
  [got.some((o) => o.label === ADD_GROUP), `กลุ่ม "${ADD_GROUP}" หายไป`],
  [hg?.display === "cards", "กลุ่มตะขอไม่ใช่การ์ด"],
  [hg?.choices?.length === 3, "ตัวเลือกตะขอไม่ครบ 3"],
  ...JOBS.filter((j) => j.choice).map((j) => {
    const c = hg?.choices?.find((c) => c.name === j.choice);
    return [c?.imageSrc === j.url && c?.desc === j.desc, `ตัวเลือกตะขอ "${j.choice}" ไม่ตรง`];
  }),
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปชนแกนตารางราคา ไม่งั้นราคาหล่นไป product.price เงียบ ๆ
  [!(back.data.pricing?.driverLabels ?? []).includes(SIZE_GROUP), "ชื่อกลุ่มขนาดไปชนแกนตารางราคา"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(SIZE_GROUP)), "ชื่อกลุ่มขนาดไปชนแกนตารางราคาของเรท"],
  [JSON.stringify(back.data.pricing?.cells) === JSON.stringify(data.pricing?.cells), "ตารางราคาเปลี่ยนไป"],
  [back.data.priceMin === 250 && back.data.priceMax === 350, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) die("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · "));

console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" การ์ด 1 ใบ (${SIZE_CHOICE}) + กลุ่ม "${HOOK_GROUP}" การ์ด 3 ใบพร้อมภาพ`);
console.log("  ลำดับกลุ่มตอนนี้:", got.map((o) => o.label).join(" → "));
console.log("  savedAt =", back.data.savedAt);
