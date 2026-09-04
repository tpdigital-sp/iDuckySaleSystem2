#!/usr/bin/env node
/**
 * TOWEL / ผ้าขนหนู (id "towel") — ภาพประกอบ "ทุกกลุ่มตัวเลือก" + เปลี่ยนเป็นการ์ด
 *
 *   node scripts/towel-option-art.mjs           (วาดภาพลง .cache/towel/upload ดูก่อน)
 *   node scripts/towel-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: 3 กลุ่ม ไม่มีภาพเลยสักใบ
 *   1) ตำแหน่งงาน  — ไม่เน้นตำแหน่ง / เน้นตำแหน่ง        (pills)
 *   2) ขนาด        — 7 ขนาด                              (dropdown)
 *   3) พิมพ์กี่ด้าน — 1 ด้าน / 2 ด้าน                      (pills)
 *
 * ที่มาของเนื้อหา = ใบสเปคร้าน
 *   `/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/
 *    18_ผ้าขนหนู ผ้าห่ม ฮู้ด พรมเช็ดเท้า ที่รองจาน หมอนผ้าห่ม/P-nผ้าเช็ดหน้า+ขนหนู-01.jpg`
 *   - ไม่เน้นตำแหน่ง = ผ้า Micro Fiber หนา 280 GSM · 30x60 / 38x76 / 50x100 / 70x150 / 78x180 · พิมพ์ 1 ด้าน
 *     ราคาเริ่มต้น 250 / 300 / 380 / 500 / 700
 *   - เน้นตำแหน่ง   = ผ้า Nano Fiber หนา 340 GSM (เนื้อยืด) · 30x60 / 40x80 / 50x100 / 70x150 / 80x180
 *     ราคาเริ่มต้น 250 / 300 / 400 / 550 / 750 · สกรีน 2 ด้าน +50 / +60 / +80 / +100 / +120
 *   - ทุกผืนคลาดเคลื่อนได้ ±1.5-3 นิ้ว · ส่วนสำคัญไม่ควรอยู่ชิดขอบ
 *   ตรงกับ rules + pricing.cells ใน DB เป๊ะ (ตรวจซ้ำก่อนเขียน)
 *
 * ⚠️ ทั้ง 3 กลุ่มเป็น "แกนตารางราคา" (pricing.driverLabels = ขนาด/ตำแหน่งงาน/พิมพ์กี่ด้าน)
 *    สคริปต์นี้จึง **ไม่แตะชื่อกลุ่มและชื่อตัวเลือกเลย** เติมแค่ imageSrc / desc / display / note
 *    ([[iducky-price-driver-trap]]) — ตอนอ่านกลับมีข้อตรวจว่า cells กับ driverLabels ต้องเหมือนเดิมทุกตัวอักษร
 *
 * การ์ดขนาด 7 ใบ = "ผังกรอบขนาดซ้อนกัน" แบบใบสเปคของร้าน (3.0 px = 1 ซม. ทุกใบ)
 *   ทุกกรอบยึดมุมบนซ้ายจุดเดียวกัน · ขนาดอื่นเป็นเส้นประเทา ขนาดที่เลือกวาดเป็นผืนผ้าจริง
 *   (v1 เคยใช้เงาคนสูง 165 ซม. เทียบ — ร้านสั่งเอาออก 4 ก.ย. 69 เพราะเส้นวัด "180 ซม."
 *    ของผืนผ้าไปทับเงาคน อ่านแล้วสับสนว่าคนสูง 165 หรือ 180)
 * ⚠️ การ์ด display "cards" โชว์รูปที่ **80×80 px** (h-20 w-20 object-cover) — ภาพจัตุรัสจึงเห็น "ทั้งใบ"
 *    ไม่ได้โดนครอปกลางแบบปุ่ม 62×62 ของแถบแกลเลอรี ([[iducky-option-thumb-crop]] ใช้กับแถบแกลเลอรี)
 *    ⇒ v3 (4 ก.ย. 69 ร้านสั่ง): จัดองค์ประกอบให้ **อยู่กลางเฟรมและใหญ่เต็มพื้นที่** ย่อแล้วยังอ่านรูปทรงออก
 *    ผังขนาดจึงซ้อนแบบ "ศูนย์กลางร่วม" (concentric) ไม่ใช่ยึดมุมบนซ้ายแบบ v2 ที่ภาพเทไปทางขวาล่าง
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/next-image แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 *
 * รันซ้ำได้: เขียนทับ imageSrc/desc/display ของกลุ่มเดิมในที่เดิม ไม่เพิ่ม/ไม่สลับลำดับกลุ่ม
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "towel";
const VER = "v3";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", AMBER = "#b45309", GOOD = "#0f766e";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${esc(t)}</text>`)
    .join("");

const pill = (cx, y, text, tone = "ok") => {
  const w = Math.min(830, text.length * 13.2 + 52);
  const c = tone === "warn" ? AMBER : tone === "mute" ? SUB : tone === "good" ? GOOD : OK;
  const bg = tone === "warn" ? "#fffbeb" : tone === "mute" ? "#f8fafc" : tone === "good" ? "#f0fdfa" : "#ecfeff";
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${c}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${c}">${esc(text)}</text>`;
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
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${esc(label)}</text>`;
};

// ── ตัวสินค้า: ผ้าขนหนูพิมพ์ซับลิเมชั่นเต็มผืน ───────────────────────
/** เป็ดในลายพิมพ์ — cx,cy = กลางตัว, s = ความกว้างลำตัว */
const duck = (cx, cy, s) => `
  <g>
    <ellipse cx="${cx}" cy="${cy + s * 0.10}" rx="${s * 0.50}" ry="${s * 0.37}" fill="#ffd84d"/>
    <path d="M ${cx - s * 0.34} ${cy + s * 0.05} q ${s * 0.28} ${s * 0.30} ${s * 0.58} ${s * 0.02}" fill="none" stroke="#f0b32c" stroke-width="${Math.max(1.2, s * 0.05)}" stroke-linecap="round"/>
    <circle cx="${cx + s * 0.30}" cy="${cy - s * 0.26}" r="${s * 0.26}" fill="#ffd84d"/>
    <path d="M ${cx + s * 0.52} ${cy - s * 0.28} l ${s * 0.24} ${s * 0.06} l ${-s * 0.22} ${s * 0.11} Z" fill="#f2913a"/>
    <circle cx="${cx + s * 0.36}" cy="${cy - s * 0.32}" r="${Math.max(1.3, s * 0.045)}" fill="#4a3a1a"/>
  </g>`;

/**
 * ลายพิมพ์ซับลิเมชั่น 1 ลาย — วาดในกรอบ (px,py,pw,ph) แต่ตัดให้เห็นเฉพาะในกรอบผ้า (cx,cy,cw,ch)
 * แยก 2 กรอบเพราะการ์ด "ไม่เน้นตำแหน่ง" ต้องวาดลายเลื่อนออกจากผืนผ้าให้เห็นกับตา
 */
const printArt = ({ px, py, pw, ph, cx, cy, cw, ch, id, variant = "front" }) => {
  const back = variant === "back";
  const c1 = back ? "#ffe1ec" : "#c8e9f7", c2 = back ? "#fff4d9" : "#dbf5e6";
  const band = back ? "#f7a8c4" : "#7fc8e8";
  const defs = `
    <linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <clipPath id="k${id}"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${Math.min(12, cw * 0.06)}"/></clipPath>`;
  const m = Math.min(pw, ph);          // อ้างอิงด้านสั้น — ผืนนอนกับผืนตั้งลายจะได้สัดส่วนเดียวกัน
  const wide = pw > ph;                 // ผืนนอน (ผังขนาด) vs ผืนตั้ง (การ์ดตำแหน่งงาน/จำนวนด้าน)
  const inset = m * 0.075;
  const body = `
  <g clip-path="url(#k${id})">
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="url(#g${id})"/>
    <!-- คลื่นน้ำท้ายผืน -->
    <path d="M ${px} ${py + ph * 0.70}
             q ${pw * 0.25} ${-ph * 0.045} ${pw * 0.50} 0
             q ${pw * 0.25} ${ph * 0.045} ${pw * 0.50} 0
             L ${px + pw} ${py + ph} L ${px} ${py + ph} Z" fill="${band}" opacity="0.55"/>
    <path d="M ${px} ${py + ph * 0.78}
             q ${pw * 0.25} ${-ph * 0.04} ${pw * 0.50} 0
             q ${pw * 0.25} ${ph * 0.04} ${pw * 0.50} 0
             L ${px + pw} ${py + ph} L ${px} ${py + ph} Z" fill="${band}" opacity="0.45"/>
    ${back
      ? `<g fill="#ffffff" opacity="0.85">${[[0.28, 0.24], [0.62, 0.17], [0.44, 0.36], [0.74, 0.44], [0.24, 0.48]]
          .map(([fx, fy]) => {
            const s = m * 0.055, sx = px + pw * fx, sy = py + ph * fy;
            return `<path d="M ${sx} ${sy - s} L ${sx + s * 0.30} ${sy - s * 0.30} L ${sx + s} ${sy - s * 0.22} L ${sx + s * 0.42} ${sy + s * 0.22} L ${sx + s * 0.60} ${sy + s} L ${sx} ${sy + s * 0.52} L ${sx - s * 0.60} ${sy + s} L ${sx - s * 0.42} ${sy + s * 0.22} L ${sx - s} ${sy - s * 0.22} L ${sx - s * 0.30} ${sy - s * 0.30} Z"/>`;
          }).join("")}</g>`
      : `<g fill="#ffffff" opacity="0.75">
           <ellipse cx="${px + pw * (wide ? 0.22 : 0.26)}" cy="${py + ph * 0.115}" rx="${m * 0.15}" ry="${m * 0.075}"/>
           <ellipse cx="${px + pw * (wide ? 0.90 : 0.72)}" cy="${py + ph * 0.20}" rx="${m * 0.11}" ry="${m * 0.055}"/>
         </g>
         ${duck(px + pw * (wide ? 0.72 : 0.48), py + ph * (wide ? 0.44 : 0.28), m * 0.46)}`}
    <!-- กรอบลายรอบผืน (ของจริงลูกค้ามักวางกรอบไว้ — ใช้ดูว่าลายเข้าที่หรือเลื่อน) -->
    <rect x="${px + inset}" y="${py + inset}" width="${pw - inset * 2}" height="${ph - inset * 2}"
      rx="${m * 0.03}" fill="none" stroke="${back ? "#e2739b" : "#3f8fb8"}" stroke-width="${Math.max(2, m * 0.016)}" opacity="0.8"/>
  </g>`;
  return { defs, body };
};

/** ขนผ้าเทอร์รี่ — เส้นหยักบาง ๆ ทับผืน (ตัดในกรอบผ้าแล้วจากผู้เรียก) */
const terry = (x, y, w, h, id) => {
  const rows = Math.max(6, Math.round(h / 14));
  let d = "";
  for (let i = 1; i < rows; i++) {
    const yy = y + (h * i) / rows;
    d += `M ${x} ${yy} q ${w * 0.06} -3 ${w * 0.12} 0 t ${w * 0.12} 0 t ${w * 0.12} 0 t ${w * 0.12} 0 t ${w * 0.12} 0 t ${w * 0.12} 0 t ${w * 0.12} 0 t ${w * 0.12} 0 `;
  }
  return `<g clip-path="url(#k${id})"><path d="${d}" fill="none" stroke="#0f172a" stroke-width="1.1" opacity="0.10"/></g>`;
};

/**
 * ผ้าขนหนู 1 ผืน — (x,y) มุมบนซ้าย, (w,h) ขนาดเป็นพิกเซล
 * plain = ผ้าเปล่าไม่พิมพ์ (ด้านหลังของงานพิมพ์ 1 ด้าน) · shift = เลื่อนลายออกจากผืน (แบบไม่เน้นตำแหน่ง)
 */
const towel = ({ x, y, w, h, id, variant = "front", plain = false, shift = [0, 0] }) => {
  const r = Math.min(12, w * 0.06);
  const art = printArt({
    px: x + shift[0], py: y + shift[1], pw: w, ph: h,
    cx: x, cy: y, cw: w, ch: h, id, variant,
  });
  // ริมทอ (dobby) อยู่ปลายด้านยาวเสมอ — ผืนนอนจึงเป็นเส้นตั้ง ผืนตั้งเป็นเส้นนอน
  const wide = w > h;
  const hem = (f) => {
    const a = wide ? x + w * f : y + h * f;
    const ln = (o) => wide
      ? `<line x1="${a + o}" y1="${y}" x2="${a + o}" y2="${y + h}" stroke="#0f172a" stroke-width="1.6" opacity="0.13"/>`
      : `<line x1="${x}" y1="${a + o}" x2="${x + w}" y2="${a + o}" stroke="#0f172a" stroke-width="1.6" opacity="0.13"/>`;
    return `<g clip-path="url(#k${id})">${ln(0)}${ln(6)}</g>`;
  };
  return {
    defs: art.defs,
    body: `
  <g>
    <ellipse cx="${x + w / 2 + 4}" cy="${y + h + 7}" rx="${w * 0.46}" ry="7" fill="#0f172a" opacity="0.10"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fdfdfb"/>
    ${plain ? "" : art.body}
    ${terry(x, y, w, h, id)}
    ${hem(0.055)}${hem(0.905)}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#cbd5e1" stroke-width="2"/>
  </g>`,
  };
};

// ══ 1) กลุ่ม "ขนาด" — การ์ด 7 ใบ สเกลเดียวกัน ═══════════════════════
// สเกลเดียวกันทั้ง 7 ใบ · เพดานคือ 3.4 — กว้างกว่านี้ป้าย "80 ซม." ข้างซ้ายจะล้นออกนอกกรอบการ์ด
const PX_PER_CM = 3.4;
const CH_CX = 450, CH_CY = 432;  // ศูนย์กลางร่วมของทุกกรอบ — ผังจึงอยู่กลางเฟรมทุกใบ
const CH_MAXH = 80 * PX_PER_CM;  // ความสูงผังสูงสุด (ด้านสั้น 80 ซม.) ไว้วางคำบรรยายใต้ผัง

const NO_FOCUS = "ไม่เน้นตำแหน่ง", FOCUS = "เน้นตำแหน่ง";
const SIZES = [
  { name: "30x60cm", w: 30, h: 60, styles: [NO_FOCUS, FOCUS], start: { [NO_FOCUS]: 250, [FOCUS]: 250 }, popular: true, use: "ผ้าเช็ดผม · ผ้าเช็ดหน้า-เช็ดมือ · ของชำร่วย" },
  { name: "38x76cm", w: 38, h: 76, styles: [NO_FOCUS], start: { [NO_FOCUS]: 300 }, use: "ผ้าเช็ดตัวเด็ก · ผ้าเช็ดผมผืนยาว" },
  { name: "40x80cm", w: 40, h: 80, styles: [FOCUS], start: { [FOCUS]: 300 }, use: "ผ้าเช็ดตัวเด็ก · พาดคอ เชียร์กีฬา" },
  { name: "50x100cm", w: 50, h: 100, styles: [NO_FOCUS, FOCUS], start: { [NO_FOCUS]: 380, [FOCUS]: 400 }, use: "ผ้าเช็ดตัวขนาดกลาง · ผ้าพาดคอฟิตเนส" },
  { name: "70x150cm", w: 70, h: 150, styles: [NO_FOCUS, FOCUS], start: { [NO_FOCUS]: 500, [FOCUS]: 550 }, popular: true, use: "ผ้าเช็ดตัวผู้ใหญ่ · ผ้าปูชายหาด" },
  { name: "78x180cm", w: 78, h: 180, styles: [NO_FOCUS], start: { [NO_FOCUS]: 700 }, use: "ผืนใหญ่สุดแบบไม่เน้นตำแหน่ง · ปูชายหาด ห่มได้" },
  { name: "80x180cm", w: 80, h: 180, styles: [FOCUS], start: { [FOCUS]: 750 }, use: "ผืนใหญ่สุด · ลายเต็มผืนแบบวางตำแหน่งได้" },
];

const styleText = (s) =>
  s.styles.length === 2 ? "สั่งได้ทั้ง 2 แบบ" : s.styles[0] === FOCUS ? "เฉพาะแบบเน้นตำแหน่ง" : "เฉพาะแบบไม่เน้นตำแหน่ง";

const startText = (s) =>
  s.styles.length === 2 && s.start[NO_FOCUS] !== s.start[FOCUS]
    ? `เริ่มต้น ${s.start[NO_FOCUS]} บาท (ไม่เน้น) / ${s.start[FOCUS]} บาท (เน้น)`
    : `เริ่มต้นผืนละ ${s.start[s.styles[0]]} บาท`;

/**
 * การ์ดขนาด 1 ใบ = ผังกรอบขนาดซ้อนกันแบบใบสเปคร้าน
 * ผ้าวางนอน (ด้านยาวเป็นแนวนอน) · ทุกกรอบใช้ "ศูนย์กลางร่วม" จุดเดียวกัน = ภาพอยู่กลางเฟรมทุกใบ
 * ขนาดที่เลือก = วาดเป็นผืนผ้าจริงมีลายพิมพ์ · ขนาดอื่น = เส้นประเทา ไม่ติดป้าย (ไม่งั้นรก)
 * เลขขนาดเป็นตัวอักษร "มีขอบขาว" ไม่ใช่กล่องทึบ — กล่องทึบกว้างกว่าผืน 30×60 จนบังผ้าทั้งผืน
 */
function sizeArt(s) {
  const L = s.h * PX_PER_CM, Sh = s.w * PX_PER_CM;   // ยาว = แนวนอน · สั้น = แนวตั้ง
  const x = CH_CX - L / 2, y = CH_CY - Sh / 2;
  const t = towel({ x, y, w: L, h: Sh, id: `s${s.w}x${s.h}` });
  const bigText = (tx, ty, size, text) => `
    <text x="${tx}" y="${ty}" font-family="${TH}" font-size="${size}" font-weight="700" text-anchor="middle"
      stroke="#ffffff" stroke-width="9" stroke-linejoin="round" fill="none">${esc(text)}</text>
    <text x="${tx}" y="${ty}" font-family="${TH}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${INK}">${esc(text)}</text>`;
  return frame(`
    ${title(`ผ้าขนหนู ${s.w} × ${s.h} ซม.`, s.use)}
    ${SIZES.filter((g) => g.name !== s.name).map((g) => {
      const gw = g.h * PX_PER_CM, gh = g.w * PX_PER_CM;
      return `<rect x="${CH_CX - gw / 2}" y="${CH_CY - gh / 2}" width="${gw}" height="${gh}" rx="10"
        fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-dasharray="8 7"/>`;
    }).join("")}
    ${t.body}
    <rect x="${x}" y="${y}" width="${L}" height="${Sh}" rx="10" fill="none" stroke="${OK}" stroke-width="4"/>
    ${dim(x, y - 24, x + L, y - 24, `${s.h} ซม.`, "above")}
    ${dim(x - 28, y, x - 28, y + Sh, `${s.w} ซม.`)}
    ${bigText(CH_CX, CH_CY + 18, 56, `${s.w}×${s.h}`)}
    <text x="${W / 2}" y="${CH_CY + CH_MAXH / 2 + 56}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เส้นประ = อีก 6 ขนาดที่มีให้เลือก · ทุกกรอบวาดสเกลเดียวกัน</text>
    ${pill(W / 2, 726, `${styleText(s)} · ${startText(s)}`, s.styles.length === 2 ? "ok" : "warn")}
    ${foot([
      "ผ้าแต่ละผืนขนาดคลาดเคลื่อนได้ ±1.5-3 นิ้ว · ส่วนสำคัญของลายไม่ควรวางชิดขอบผ้า",
      "ราคาเริ่มต้นคือช่วง 1-10 ชิ้น ยิ่งสั่งเยอะยิ่งถูก",
    ])}`, t.defs);
}

// ══ 2) กลุ่ม "ตำแหน่งงาน" — การ์ด 2 ใบ ═════════════════════════════
const POS_TW = 244, POS_TH = 488, POS_X = 104, POS_Y = 190;

function posArt(kind) {
  const focus = kind === FOCUS;
  const id = focus ? "pf" : "pn";
  const shift = focus ? [0, 0] : [POS_TW * 0.14, POS_TH * 0.055];
  const t = towel({ x: POS_X, y: POS_Y, w: POS_TW, h: POS_TH, id, shift });
  const bx = 566, by = 396, br = 116;   // เหรียญกลมฝั่งขวา — คู่กับผืนผ้าฝั่งซ้ายแล้วภาพรวมสมดุลกลางเฟรม
  const lines = focus
    ? ["ผ้า Nano Fiber หนา 340 GSM", "เนื้อผ้ามีความยืด สีคมกว่า", "สกรีนได้ทั้ง 1 และ 2 ด้าน"]
    : ["ผ้า Micro Fiber หนา 280 GSM", "ผ้านุ่ม ซับน้ำดี ราคาประหยัดกว่า", "พิมพ์ได้ 1 ด้านเท่านั้น"];
  return frame(`
    ${title(focus ? "เน้นตำแหน่ง" : "ไม่เน้นตำแหน่ง",
      focus ? "วางลายตรงจุดที่ออกแบบไว้ — ลายมีกรอบ มีตัวหนังสือ ต้องใช้แบบนี้" : "ลายเต็มผืนแบบไม่เจาะจงจุด — ลายกระจายทั้งผืน คุ้มกว่า")}
    ${t.body}
    <!-- เส้นประ = ตำแหน่งที่ออกแบบไว้ (วาดทับผืน ไม่งั้นลายบัง) · ลายจริงจะตรงกรอบนี้หรือเลื่อน ขึ้นกับแบบที่เลือก -->
    <rect x="${POS_X + POS_TW * 0.075}" y="${POS_Y + POS_TW * 0.075}"
      width="${POS_TW * 0.85}" height="${POS_TH - POS_TW * 0.15}" rx="${POS_TW * 0.03}"
      fill="none" stroke="${focus ? GOOD : "#92400e"}" stroke-width="3" stroke-dasharray="10 8"/>
    ${focus ? "" : `
    <!-- ลูกศรบอกระยะเลื่อนจริง -->
    <line x1="${POS_X + POS_TW * 0.075}" y1="${POS_Y + POS_TH * 0.30}" x2="${POS_X + POS_TW * 0.215}" y2="${POS_Y + POS_TH * 0.30}" stroke="${AMBER}" stroke-width="4"/>
    <path d="M ${POS_X + POS_TW * 0.215} ${POS_Y + POS_TH * 0.30} l -13 -8 v 16 Z" fill="${AMBER}"/>`}
    <text x="${POS_X + POS_TW / 2}" y="${POS_Y + POS_TH + 38}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">เส้นประ = ตำแหน่งที่วางไว้</text>
    <circle cx="${bx}" cy="${by}" r="${br}" fill="${focus ? "#f0fdfa" : "#fffbeb"}" stroke="${focus ? GOOD : AMBER}" stroke-width="5"/>
    ${focus
      ? `<path d="M ${bx - 52} ${by - 4} l 35 38 l 68 -72" fill="none" stroke="${GOOD}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
         <text x="${bx}" y="${by + 86}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${GOOD}">ตรงตำแหน่ง</text>`
      : `<text x="${bx}" y="${by - 6}" font-family="${TH}" font-size="68" font-weight="700" text-anchor="middle" fill="${AMBER}">± 3</text>
         <text x="${bx}" y="${by + 40}" font-family="${TH}" font-size="34" font-weight="700" text-anchor="middle" fill="${AMBER}">นิ้ว</text>
         <text x="${bx}" y="${by + 86}" font-family="${TH}" font-size="26" text-anchor="middle" fill="${AMBER}">ลายเลื่อนได้</text>`}
    ${lines.map((l, i) =>
      `<circle cx="${bx - 176}" cy="${592 + i * 46 - 7}" r="5.5" fill="${focus ? GOOD : AMBER}"/>
       <text x="${bx - 158}" y="${592 + i * 46}" font-family="${TH}" font-size="25" fill="${INK}">${esc(l)}</text>`).join("")}
    ${pill(W / 2, 772, focus ? "ขนาด 30x60 · 40x80 · 50x100 · 70x150 · 80x180 ซม." : "ขนาด 30x60 · 38x76 · 50x100 · 70x150 · 78x180 ซม.", focus ? "good" : "warn")}
    ${foot([
      focus
        ? "ราคาเริ่มต้น 250 / 300 / 400 / 550 / 750 บาท ตามขนาด"
        : "ราคาเริ่มต้น 250 / 300 / 380 / 500 / 700 บาท ตามขนาด — ถูกกว่าแบบเน้นตำแหน่ง",
      "ส่วนสำคัญของลายไม่ควรวางชิดขอบผ้า · เข้าเครื่องสกรีนคุมทิศทางผ้าไม่ได้",
    ])}`, t.defs);
}

// ══ 3) กลุ่ม "พิมพ์กี่ด้าน" — การ์ด 2 ใบ ════════════════════════════
const SD_TW = 230, SD_TH = 460, SD_Y = 186;

function sidesArt(n) {
  const two = n === 2;
  const front = towel({ x: 225 - SD_TW / 2, y: SD_Y, w: SD_TW, h: SD_TH, id: `sd${n}a` });
  const back = towel({ x: 675 - SD_TW / 2, y: SD_Y, w: SD_TW, h: SD_TH, id: `sd${n}b`, variant: "back", plain: !two });
  return frame(`
    ${title(two ? "พิมพ์ 2 ด้าน" : "พิมพ์ 1 ด้าน",
      two ? "ลายคนละแบบหน้า-หลังก็ได้ — เฉพาะแบบเน้นตำแหน่ง (ผ้า Nano Fiber)" : "พิมพ์ลายด้านหน้า ด้านหลังเป็นผ้าสีขาวเปล่า")}
    ${front.body}
    ${back.body}
    <text x="225" y="${SD_Y + SD_TH + 42}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
    <text x="225" y="${SD_Y + SD_TH + 74}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">พิมพ์ลาย</text>
    <text x="675" y="${SD_Y + SD_TH + 42}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหลัง</text>
    <text x="675" y="${SD_Y + SD_TH + 74}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${two ? GOOD : SUB}">${two ? "พิมพ์ลาย" : "ผ้าขาวเปล่า ไม่พิมพ์"}</text>
    <!-- วงกลมเลขกลางภาพ = สิ่งที่ต่างกันตอนย่อเป็นปุ่ม -->
    <circle cx="${W / 2}" cy="410" r="102" fill="#ffffff" stroke="${two ? GOOD : OK}" stroke-width="5"/>
    <text x="${W / 2}" y="416" font-family="${TH}" font-size="100" font-weight="700" text-anchor="middle" fill="${two ? GOOD : OK}">${n}</text>
    <text x="${W / 2}" y="462" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${two ? GOOD : OK}">ด้าน</text>
    ${pill(W / 2, 772,
      two ? "ราคาต่อผืนเพิ่มตามขนาด +50 / +60 / +80 / +100 / +120 บาท" : "ราคานี้คือราคามาตรฐานในตารางแล้ว", two ? "good" : "ok")}
    ${foot([
      two
        ? "สั่งได้เฉพาะ \"เน้นตำแหน่ง\" · ขนาด 30x60 / 40x80 / 50x100 / 70x150 / 80x180 ซม."
        : "สั่งได้ทุกแบบและทุกขนาด — แบบไม่เน้นตำแหน่งพิมพ์ได้ 1 ด้านเท่านั้น",
      "งานผ้าจะมีจุดดำจากฝุ่นเล็กน้อยและรอยยับบ้าง ไม่กระทบการใช้งาน",
    ])}`, front.defs + back.defs);
}

// ── เรนเดอร์ทุกใบ ────────────────────────────────────────────────────
const CARDS = [
  ...SIZES.map((s) => ({ group: "ขนาด", choice: s.name, file: `size-${s.w}x${s.h}-${VER}.jpg`, svg: sizeArt(s), meta: s })),
  { group: "ตำแหน่งงาน", choice: NO_FOCUS, file: `pos-nofocus-${VER}.jpg`, svg: posArt(NO_FOCUS) },
  { group: "ตำแหน่งงาน", choice: FOCUS, file: `pos-focus-${VER}.jpg`, svg: posArt(FOCUS) },
  { group: "พิมพ์กี่ด้าน", choice: "1 ด้าน", file: `sides-1-${VER}.jpg`, svg: sidesArt(1) },
  { group: "พิมพ์กี่ด้าน", choice: "2 ด้าน", file: `sides-2-${VER}.jpg`, svg: sidesArt(2) },
];

for (const c of CARDS) {
  c.buf = await sharp(Buffer.from(c.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${c.file}`, c.buf);
  // ครอปกลาง 300-600 เก็บไว้ดูด้วย — คือสิ่งที่ลูกค้าเห็นบนปุ่มตัวเลือกจริง
  await sharp(c.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${c.file}`);
  console.log(`🖼  ${OUT}/${c.file}  ${Math.round(c.buf.length / 1024)} KB — ${c.group} / ${c.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const c of CARDS) {
  const key = `products/${PRODUCT_ID}/${c.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, c.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  c.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${CARDS.length} ใบ → products/${PRODUCT_ID}/`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

// ของเดิมไว้เทียบตอนอ่านกลับ — แกนราคาห้ามขยับแม้แต่ตัวอักษรเดียว
const beforeCells = JSON.stringify(data.pricing?.cells ?? {});
const beforeDrivers = JSON.stringify(data.pricing?.driverLabels ?? []);
const beforeRules = JSON.stringify(data.rules ?? []);
const beforeNames = JSON.stringify((data.options ?? []).map((o) => [o.label, o.choices.map((c) => c.name)]));

const DESC = {
  ตำแหน่งงาน: {
    [NO_FOCUS]: "ผ้า Micro Fiber หนา 280 GSM — ลายเต็มผืนแบบไม่เจาะจงจุด ตำแหน่งลายเลื่อนได้ 1.5-3 นิ้ว · พิมพ์ได้ 1 ด้าน · ราคาประหยัดกว่า เริ่มต้นผืนละ ฿250",
    [FOCUS]: "ผ้า Nano Fiber หนา 340 GSM เนื้อยืด สีคมกว่า — วางลายตรงตำแหน่งที่ออกแบบไว้ เหมาะกับลายที่มีกรอบ มีตัวหนังสือ · สกรีนได้ทั้ง 1 และ 2 ด้าน · เริ่มต้นผืนละ ฿250",
  },
  ขนาด: Object.fromEntries(SIZES.map((s) => [s.name, `${s.w} × ${s.h} ซม. — ${s.use} · ${styleText(s)} · ${startText(s)}`])),
  พิมพ์กี่ด้าน: {
    "1 ด้าน": "พิมพ์ลายด้านหน้า ด้านหลังเป็นผ้าสีขาวเปล่า — สั่งได้ทุกแบบทุกขนาด ราคาตามตารางปกติ",
    "2 ด้าน": "พิมพ์ลายทั้งหน้าและหลัง (คนละลายก็ได้) — เฉพาะแบบเน้นตำแหน่ง ผ้า Nano Fiber · ราคาต่อผืนเพิ่มตามขนาด +฿50 ถึง +฿120",
  },
};
const NOTE = {
  ตำแหน่งงาน: "เลือกแบบนี้ก่อน — **ขนาด** และ **จำนวนด้าน** ที่สั่งได้จะเปลี่ยนตามแบบที่เลือก",
  ขนาด: "ผ้าแต่ละผืนขนาดคลาดเคลื่อนได้ **±1.5-3 นิ้ว** · ภาพในการ์ดเป็นผังเทียบขนาด วาดสเกลเดียวกันทุกใบ เส้นประคือขนาดอื่นที่มีให้เลือก",
  พิมพ์กี่ด้าน: "สกรีน 2 ด้านได้เฉพาะแบบ **เน้นตำแหน่ง** (ผ้า Nano Fiber เนื้อยืด) — ราคาต่อผืนเพิ่มตามขนาด",
};
const POPULAR = { ขนาด: ["30x60cm", "70x150cm"] };

// ⚠️ เขียนทับเฉพาะ imageSrc/desc/display/note — ชื่อกลุ่มและชื่อตัวเลือกคือแกนตารางราคา ห้ามแตะ
for (const opt of data.options ?? []) {
  if (!DESC[opt.label]) continue;
  opt.display = "cards";
  opt.note = NOTE[opt.label];
  for (const ch of opt.choices) {
    const card = CARDS.find((c) => c.group === opt.label && c.choice === ch.name);
    if (!card) { console.error(`ไม่มีภาพให้ตัวเลือก "${opt.label} / ${ch.name}"`); process.exit(1); }
    ch.imageSrc = card.url;
    ch.desc = DESC[opt.label][ch.name];
    if (POPULAR[opt.label]?.includes(ch.name)) ch.popular = true;
  }
}
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const fails = [
  [got.length === 3, "จำนวนกลุ่มไม่ใช่ 3"],
  // กันกับดักราคา: ชื่อกลุ่ม/ชื่อตัวเลือก/แกนราคา/เงื่อนไข ต้องเหมือนเดิมทุกตัวอักษร
  [JSON.stringify(got.map((o) => [o.label, o.choices.map((c) => c.name)])) === beforeNames, "ชื่อกลุ่ม/ชื่อตัวเลือกเปลี่ยน (แกนตารางราคา)"],
  [JSON.stringify(back.data.pricing?.cells ?? {}) === beforeCells, "ช่องตารางราคาเปลี่ยน"],
  [JSON.stringify(back.data.pricing?.driverLabels ?? []) === beforeDrivers, "แกนตารางราคา (driverLabels) เปลี่ยน"],
  [JSON.stringify(back.data.rules ?? []) === beforeRules, "เงื่อนไขตัวเลือก (rules) เปลี่ยน"],
  [back.data.priceMin === 120 && back.data.priceMax === 870, "ช่วงราคาสินค้าเปลี่ยนไป"],
  ...got.map((o) => [o.display === "cards", `กลุ่ม "${o.label}" ไม่ใช่การ์ด`]),
  ...got.map((o) => [!!o.note, `กลุ่ม "${o.label}" ไม่มีคำอธิบายกลุ่ม`]),
  ...CARDS.map((c) => {
    const ch = got.find((o) => o.label === c.group)?.choices?.find((x) => x.name === c.choice);
    return [ch?.imageSrc === c.url && !!ch?.desc, `"${c.group} / ${c.choice}" ภาพ/คำอธิบายไม่ตรง`];
  }),
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ ภาพครบ ${CARDS.length} ใบ ทั้ง 3 กลุ่มเป็นการ์ด · ตารางราคา/เงื่อนไข ไม่ขยับ · savedAt =`, back.data.savedAt);
