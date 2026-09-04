#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่มตัวเลือกของ "กรอบรูป+จิ๊กซอว์ งานซับลิเมชั่น"
 * (photoframe-8 · /products/กรอบรูป-จิ๊กซอว์-งานซับลิเมชั่น)
 *
 *   node scripts/jigsaw-frame-option-art.mjs            (วาดภาพลง .cache/photoframe-8/upload ดูก่อน)
 *   node scripts/jigsaw-frame-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง imageSrc/desc/cards + อ่านกลับเทียบ)
 *
 * 2 กลุ่ม 4 ใบ:
 *   1. "ตัวเลือก"  แผ่นจิ๊กซอว์ / กรอบรูป + แผ่นจิ๊กซอว์
 *      ต่างกันที่ "มีกรอบไหม" — กรอบอยู่ริมภาพ ถ้าวาดใหญ่จะโดนครอปทิ้งหมด
 *      จึงย่อชิ้นงานทั้งใบให้อยู่ในกรอบกลาง 300–600 ([[iducky-option-thumb-crop]])
 *   2. "ขนาด"      A5 (14.8×21) / 19.8×29 ซม. — สเกลเดียวกันทั้งสองใบ
 *      + เงาโครงประของอีกขนาดซ้อนไว้เทียบ + ป้ายเลขตัวใหญ่กลางแผ่น
 *
 * อ้างรูปงานจริงในแกลเลอรีสินค้า: แผ่นจิ๊กซอว์ CardBoard ผิวเงามีกลิตเตอร์ประกายมุก
 * ใส่กรอบรูป **สีขาว** (เจ้าของร้านยืนยัน 3 ก.ย. 69: กรอบมีสีขาวสีเดียว — รูปเก่าในแกลเลอรี
 * แสงสะท้อนจนดูเป็นโลหะเงิน แต่ของจริงขาวล้วน) — กรอบมีเฉพาะ A5 ตาม rules ของสินค้า
 *
 * ⚠️ ภาพเป็นจัตุรัส 900×900 และกล่องบนการ์ดก็จัตุรัส (48px, object-cover) → **ไม่โดนครอป**
 *    ทั้งใบถูกย่อลงกล่องเล็ก ถ้าใส่หัวเรื่อง/บรรทัดท้ายเยอะ ชิ้นงานจะเหลือนิดเดียว
 *    (เจ้าของร้านทัก 4 ก.ย. 69 ว่า "ขยายภาพให้ใหญ่ขึ้นหน่อย") — v2 จึงวาดชิ้นงานเต็มเฟรม
 *    หัวเรื่องเหลือบรรทัดเดียวตัวเล็ก ท้ายภาพบรรทัดเดียว (ชื่อ+คำอธิบายมีเป็นข้อความบนการ์ดอยู่แล้ว)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "photoframe-8";
const VER = "v2";
/** ใบ "กรอบรูป + แผ่นจิ๊กซอว์" ขึ้นรุ่นเร็วกว่าเพื่อน — v1 วาดกรอบเป็นโลหะสีเงิน (ผิด) v2 แก้เป็นกรอบขาว */
const VER_FRAMED = "v3";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/photoframe-8/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- ผิวแผ่นจิ๊กซอว์ CardBoard เคลือบเงา -->
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.3"/>
    </linearGradient>
    <!-- ท้องฟ้า/พื้นลายที่พิมพ์บนแผ่น (แทนลายของลูกค้า) -->
    <linearGradient id="art" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe9f5"/>
      <stop offset="0.62" stop-color="#e8f7fb"/>
      <stop offset="1" stop-color="#ffe6c7"/>
    </linearGradient>
    <!-- กรอบรูปสีขาว — ไล่เฉดอ่อน ๆ พอให้เห็นมิติขอบ ไม่ใช่สีเงิน -->
    <linearGradient id="frameWhite" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#fbfcfd"/>
      <stop offset="1" stop-color="#eef1f4"/>
    </linearGradient>
    <!-- กลิตเตอร์ประกายมุกบนผิวเคลือบ -->
    <pattern id="glitter" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="5" r="1.1" fill="#ffffff" opacity="0.55"/>
      <circle cx="13" cy="11" r="0.9" fill="#ffffff" opacity="0.45"/>
      <circle cx="8" cy="15" r="0.7" fill="#ffffff" opacity="0.4"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

/** หัวเรื่องบรรทัดเดียว ตัวเล็ก ชิดขอบบน — กินที่น้อยที่สุด ชิ้นงานจะได้ใหญ่ */
const title = (t) => `
  <text x="${W / 2}" y="64" font-family="${TH}" font-size="34" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>`;

/** ท้ายภาพบรรทัดเดียว — ชื่อ/คำอธิบายเต็ม ๆ มีเป็นข้อความบนการ์ดอยู่แล้ว ไม่ต้องซ้ำในภาพ */
const foot = (t) => `<text x="${W / 2}" y="${H - 38}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${t}</text>`;

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  const body = `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}" width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
  return vertical ? `<g transform="rotate(-90 ${lx} ${(y1 + y2) / 2})">${body.replace(/rotate/g, "rotate")}</g>` : body;
};

/** ลูกศรวัดแนวตั้ง — ป้ายตัวเลขหมุน 90° แนบเส้น */
const dimV = (x, y1, y2, label, dx = 28) => {
  const lw = label.length * 13;
  const cy = (y1 + y2) / 2;
  const lx = x + dx;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x - 8}" y1="${y1}" x2="${x + 8}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x - 8}" y1="${y2}" x2="${x + 8}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
    <g transform="rotate(-90 ${lx} ${cy})">
      <rect x="${lx - lw / 2}" y="${cy - 16}" width="${lw}" height="32" rx="7" fill="#ffffff" opacity="0.94"/>
      <text x="${lx}" y="${cy + 9}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>
    </g>`;
};

/* ── แผ่นจิ๊กซอว์ ────────────────────────────────────────────────────
 * เส้นตัดจิ๊กซอว์ = เส้นตรงตามตาราง + เดือย (knob) นูนสลับข้างที่กึ่งกลางช่อง
 * วาดเป็น path เส้นเดียวต่อแถว/คอลัมน์ ให้ได้ลายหยักแบบจิ๊กซอว์จริง
 */
const knobPath = (a, b, along, k) => {
  /** along: "h" = เส้นแนวนอน (ตัดตาม x) · "v" = เส้นแนวตั้ง · k = ทิศเดือย (+1/-1) */
  const mid = (a.t + b.t) / 2;
  const r = Math.abs(b.t - a.t) * 0.16;
  const at = (t, off) => (along === "h" ? `${t} ${a.c + off * k}` : `${a.c + off * k} ${t}`);
  return `M ${at(a.t, 0)} L ${at(mid - r * 1.5, 0)} C ${at(mid - r * 1.5, r * 1.6)} ${at(mid + r * 1.5, r * 1.6)} ${at(mid + r * 1.5, 0)} L ${at(b.t, 0)}`;
};

/** ตารางเส้นตัดจิ๊กซอว์บนพื้นที่ (x,y,w,h) — cols × rows ชิ้น */
const puzzleLines = (x, y, w, h, cols, rows, stroke = "#ffffff", sw = 2.4) => {
  const cw = w / cols;
  const ch = h / rows;
  const out = [];
  for (let r = 1; r < rows; r++) {
    const cy = y + r * ch;
    for (let c = 0; c < cols; c++) {
      const k = (r + c) % 2 ? 1 : -1;
      out.push(`<path d="${knobPath({ t: x + c * cw, c: cy }, { t: x + (c + 1) * cw, c: cy }, "h", k)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="0.9"/>`);
    }
  }
  for (let c = 1; c < cols; c++) {
    const cx = x + c * cw;
    for (let r = 0; r < rows; r++) {
      const k = (r + c) % 2 ? -1 : 1;
      out.push(`<path d="${knobPath({ t: y + r * ch, c: cx }, { t: y + (r + 1) * ch, c: cx }, "v", k)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="0.9"/>`);
    }
  }
  return out.join("");
};

/** ลายที่พิมพ์บนแผ่น — ฟ้า/ทราย + มาสคอตแทนลายของลูกค้า (คุมให้อยู่ในกรอบแผ่น) */
const printedArt = (x, y, w, h, id) => {
  const r = MASCOT.ratio;
  const mh = h * 0.52;
  const mw = mh * r;
  return `
  <clipPath id="clip${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath>
  <g clip-path="url(#clip${id})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#art)"/>
    <path d="M ${x} ${y + h} L ${x} ${y + h * 0.68} Q ${x + w * 0.5} ${y + h * 0.56} ${x + w} ${y + h * 0.66} L ${x + w} ${y + h} Z" fill="#f6d9ab"/>
    <path d="M ${x} ${y + h * 0.7} Q ${x + w * 0.5} ${y + h * 0.62} ${x + w} ${y + h * 0.68}" fill="none" stroke="#7fd6e6" stroke-width="${h * 0.03}" opacity="0.75"/>
    ${[[0.14, 0.88, 6], [0.3, 0.92, 4], [0.78, 0.9, 5], [0.9, 0.84, 4]]
      .map(([fx, fy, rr]) => `<circle cx="${x + w * fx}" cy="${y + h * fy}" r="${rr}" fill="#f2b8a0" opacity="0.8"/>`).join("")}
    <image href="${MASCOT.uri}" x="${x + w / 2 - mw / 2}" y="${y + h * 0.2}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#glitter)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#gloss)"/>
  </g>`;
};

/** แผ่นจิ๊กซอว์ทั้งใบ (ไม่มีกรอบ) */
const puzzleSheet = (x, y, w, h, id, cols = 5, rows = 7) => `
  <rect x="${x + 5}" y="${y + 8}" width="${w}" height="${h}" rx="4" fill="#0f172a" opacity="0.10"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#ffffff"/>
  ${printedArt(x, y, w, h, id)}
  ${puzzleLines(x, y, w, h, cols, rows)}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="#cbd5e1" stroke-width="2"/>`;

/** กรอบรูปสีขาว (สีเดียวที่มี) — ครอบแผ่นจิ๊กซอว์ */
const photoFrame = (x, y, w, h, id, cols = 5, rows = 7) => {
  const B = 26; // ความหนาขอบโลหะ
  const M = 13; // ขอบในขาว
  const ix = x + B + M;
  const iy = y + B + M;
  const iw = w - (B + M) * 2;
  const ih = h - (B + M) * 2;
  return `
  <rect x="${x + 7}" y="${y + 11}" width="${w}" height="${h}" rx="8" fill="#0f172a" opacity="0.13"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="url(#frameWhite)" stroke="#d7dde4" stroke-width="1.5"/>
  <!-- ร่องขอบกรอบ (เงาบาง ๆ) — บอกความหนาโดยไม่ต้องใช้สีเงิน -->
  <rect x="${x + B * 0.34}" y="${y + B * 0.34}" width="${w - B * 0.68}" height="${h - B * 0.68}" rx="5" fill="none" stroke="#e4e9ee" stroke-width="2.5"/>
  <rect x="${x + B}" y="${y + B}" width="${w - B * 2}" height="${h - B * 2}" rx="3" fill="#ffffff" stroke="#dbe2ea" stroke-width="1.5"/>
  ${printedArt(ix, iy, iw, ih, id)}
  ${puzzleLines(ix, iy, iw, ih, cols, rows)}
  <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>
  <!-- เงาด้านในขอบกรอบ ให้ขอบขาวไม่จมไปกับพื้นขาว -->
  <rect x="${x + B - 1}" y="${y + B - 1}" width="${w - B * 2 + 2}" height="${h - B * 2 + 2}" rx="3" fill="none" stroke="#c9d2db" stroke-width="1"/>`;
};

/** ชิ้นจิ๊กซอว์เดี่ยว ๆ วางข้างแผ่น (เล่าว่าถอดต่อได้) */
const loosePiece = (cx, cy, s, rot, fill = "#fdf0d5") => `
  <g transform="translate(${cx} ${cy}) rotate(${rot})">
    <g transform="translate(${-s / 2} ${-s / 2})">
      <path d="M 0 0 H ${s * 0.34} C ${s * 0.3} ${-s * 0.16} ${s * 0.7} ${-s * 0.16} ${s * 0.66} 0 H ${s}
        V ${s * 0.34} C ${s * 1.16} ${s * 0.3} ${s * 1.16} ${s * 0.7} ${s} ${s * 0.66} V ${s}
        H ${s * 0.66} C ${s * 0.7} ${s * 1.16} ${s * 0.3} ${s * 1.16} ${s * 0.34} ${s} H 0 Z"
        transform="translate(3 5)" fill="#0f172a" opacity="0.12"/>
      <path d="M 0 0 H ${s * 0.34} C ${s * 0.3} ${-s * 0.16} ${s * 0.7} ${-s * 0.16} ${s * 0.66} 0 H ${s}
        V ${s * 0.34} C ${s * 1.16} ${s * 0.3} ${s * 1.16} ${s * 0.7} ${s} ${s * 0.66} V ${s}
        H ${s * 0.66} C ${s * 0.7} ${s * 1.16} ${s * 0.3} ${s * 1.16} ${s * 0.34} ${s} H 0 Z"
        fill="${fill}" stroke="#cbb894" stroke-width="1.6"/>
    </g>
  </g>`;

/* ── ใบที่ 1-2: กลุ่ม "ตัวเลือก" ─────────────────────────────────────
 * ทั้งชิ้นงานต้องอยู่ในกรอบกลาง 300–600 (ปุ่มตัวเลือกครอปแค่ตรงนั้น)
 * ใบ "แผ่นจิ๊กซอว์" = แผ่นเปล่า ๆ + ชิ้นหลุด 2 ชิ้น · ใบ "กรอบรูป+แผ่น" = แผ่นเดียวกันในกรอบขาว
 */
const sheetOnly = () => {
  const w = 372;
  const h = 528;
  const x = W / 2 - w / 2;
  const y = 178;
  return frame(`
  ${title("แผ่นจิ๊กซอว์ (ไม่รวมกรอบ)")}
  ${puzzleSheet(x, y, w, h, "a", 6, 8)}
  <!-- ชิ้นที่ถอดออกมาวางข้าง ๆ — บอกว่าเป็นจิ๊กซอว์ที่ต่อเล่นได้จริง ไม่ใช่ภาพพิมพ์เฉย ๆ -->
  ${loosePiece(x - 68, y + h - 56, 78, -16)}
  ${loosePiece(x + w + 70, y + h - 128, 70, 24, "#e8f4fa")}
  ${loosePiece(x + w + 50, y + h - 34, 66, -8)}
  <ellipse cx="${W / 2}" cy="${y + h + 34}" rx="${w * 0.56}" ry="15" fill="#0f172a" opacity="0.07"/>
  ${foot("CardBoard ตัดเป็นชิ้นจิ๊กซอว์ · ผิวเคลือบเงากลิตเตอร์")}`);
};

const framedSheet = () => {
  const w = 424;
  const h = 566;
  const x = W / 2 - w / 2;
  const y = 152;
  return frame(`
  ${title("กรอบรูป + แผ่นจิ๊กซอว์")}
  <!-- ขาตั้งด้านหลังกรอบ -->
  <path d="M ${x + w * 0.62} ${y + h - 26} L ${x + w + 74} ${y + h + 52} L ${x + w * 0.72} ${y + h + 52} Z" fill="#eef2f6" stroke="#c6cfd8" stroke-width="2"/>
  ${photoFrame(x, y, w, h, "b", 5, 7)}
  <ellipse cx="${W / 2}" cy="${y + h + 62}" rx="${w * 0.6}" ry="17" fill="#0f172a" opacity="0.07"/>
  ${foot("กรอบรูปสีขาว (มีสีเดียว) · เฉพาะขนาด A5")}`);
};

/* ── ใบที่ 3-4: กลุ่ม "ขนาด" ─────────────────────────────────────────
 * สเกลเดียวกันทั้งสองใบ (1 ซม. = 15.5 px) + โครงประของอีกขนาดซ้อนเทียบ
 * ป้ายเลขตัวใหญ่ทับกลางแผ่น — ย่อเป็นปุ่ม 62px แล้วยังอ่านออก
 */
const CM = 21.4;
const SIZES = [
  { choice: "A5", w: 14.8, h: 21, label: "A5", big: "A5", note: "เท่ากระดาษ A5 · ขนาดเดียวที่สั่งพร้อมกรอบรูปได้", other: { w: 19.8, h: 29, name: "19.8 × 29" } },
  { choice: "ขนาด 19.8*29 cm", w: 19.8, h: 29, label: "19.8 × 29 ซม.", big: "19.8×29", note: "ใหญ่กว่า A5 · ใกล้เคียง A4 (มีเฉพาะแบบแผ่นจิ๊กซอว์)", other: { w: 14.8, h: 21, name: "A5" } },
];

const sizeArt = (s) => {
  const pw = s.w * CM;
  const ph = s.h * CM;
  const cx = W / 2;
  /** วางฐานแผ่นเท่ากันทั้งสองใบ (y ล่าง = 762) ขนาดต่างกันจึงเทียบกันได้ด้วยตา */
  const bottom = 762;
  const y = bottom - ph;
  const x = cx - pw / 2;
  const ow = s.other.w * CM;
  const oh = s.other.h * CM;
  /** โครงประเทียบขนาด — จัดชิดมุมล่างซ้ายร่วมกับแผ่นจริง จะได้เห็นส่วนต่างชัด ๆ */
  const ox = x;
  const oy = bottom - oh;
  const smaller = ow < pw;
  const ghost = `
  <rect x="${ox}" y="${oy}" width="${ow}" height="${oh}" rx="4" fill="none" stroke="#64748b" stroke-width="3" stroke-dasharray="12 8" opacity="${smaller ? 0.95 : 0.7}"/>
  <text x="${ox + ow - 8}" y="${oy - 12}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="end" fill="${SUB}">${s.other.name}</text>`;
  const cols = s.w > 17 ? 6 : 5;
  const rows = s.h > 24 ? 8 : 7;
  const bw = s.big.length * 34 + 52;
  const badgeY = y + ph / 2;
  return frame(`
  ${title(`ขนาด ${s.label}`)}
  ${smaller ? "" : ghost}
  ${puzzleSheet(x, y, pw, ph, "s" + s.w, cols, rows)}
  ${smaller ? ghost : ""}
  <!-- ป้ายขนาดกลางแผ่น ตัวใหญ่ — ย่อลงกล่อง 48px แล้วยังพอเดาออกว่าใบไหนใหญ่กว่า -->
  <rect x="${cx - bw / 2}" y="${badgeY - 41}" width="${bw}" height="86" rx="21" fill="#0f172a" opacity="0.10"/>
  <rect x="${cx - bw / 2}" y="${badgeY - 45}" width="${bw}" height="86" rx="21" fill="#ffffff" opacity="0.96" stroke="#cbd5e1" stroke-width="2"/>
  <text x="${cx}" y="${badgeY + 17}" font-family="${TH}" font-size="56" font-weight="700" text-anchor="middle" fill="${INK}">${s.big}</text>
  ${dim(x, bottom + 40, x + pw, bottom + 40, `${s.w} ซม.`)}
  ${dimV(x - 42, y, bottom, `${s.h} ซม.`)}
  ${foot("เส้นประ = อีกขนาดที่เลือกได้ (สเกลเดียวกัน)")}`);
};

/* ── เรนเดอร์ ────────────────────────────────────────────────────── */
const JOBS = [
  { group: "ตัวเลือก", choice: "แผ่นจิ๊กซอว์", file: `option-sheet-${VER}.jpg`, svg: sheetOnly(), desc: "เฉพาะแผ่นจิ๊กซอว์ CardBoard พิมพ์ลายเต็มแผ่น ผิวเคลือบเงากลิตเตอร์" },
  { group: "ตัวเลือก", choice: "กรอบรูป + แผ่นจิ๊กซอว์", file: `option-framed-${VER_FRAMED}.jpg`, svg: framedSheet(), desc: "แผ่นจิ๊กซอว์ + กรอบรูปสีขาว ต่อเสร็จตั้งโชว์ได้เลย (เฉพาะ A5)" },
  ...SIZES.map((s) => ({ group: "ขนาด", choice: s.choice, file: `size-${String(s.w).replace(".", "-")}x${s.h}-${VER}.jpg`, svg: sizeArt(s), desc: `${s.w} × ${s.h} ซม. — ${s.note}` })),
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  /* ภาพจัตุรัสลงกล่องจัตุรัส = ย่อทั้งใบ ไม่โดนครอป — ตรวจด้วยการย่อเหลือ 48px จริง ๆ แล้วขยายกลับมาดู */
  await sharp(j.buf).resize(48, 48).resize(288, 288, { kernel: "nearest" }).toFile(`${OUT}/_thumb-${j.file}`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group} › ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", j.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

/**
 * เขียนเฉพาะ imageSrc/desc/display — ⚠️ ห้ามแตะชื่อกลุ่มหรือชื่อตัวเลือก
 * เพราะเป็นแกนตารางราคา (pricing.driverLabels + cells key) และเป้า rules
 */
for (const j of JOBS) {
  const g = (data.options ?? []).find((o) => o.label === j.group);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${j.group}"`); process.exit(1); }
  const c = (g.choices ?? []).find((x) => x.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}" ในกลุ่ม "${j.group}"`); process.exit(1); }
  c.imageSrc = j.url;
  c.desc = j.desc;
  g.display = "cards";
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of JOBS) {
  const g = back.data.options.find((o) => o.label === j.group);
  const c = g?.choices?.find((x) => x.name === j.choice);
  if (g?.display !== "cards" || c?.imageSrc !== j.url || c?.desc !== j.desc) { console.error("อ่านกลับไม่ตรง!", j.group, j.choice, c); process.exit(1); }
}
/* ราคาต้องไม่ขยับ — เช็คว่าคีย์ cells ยังตรงกับชื่อตัวเลือกเดิม */
const keys = Object.keys(back.data.pricing?.cells ?? {});
const names = back.data.options.map((o) => o.choices.map((c) => c.name));
for (const k of keys) {
  const parts = k.split("│");
  if (!names[0].includes(parts[0]) || !names[1].includes(parts[1])) { console.error("คีย์ตารางราคาไม่ตรงชื่อตัวเลือก!", k); process.exit(1); }
}
console.log(`✓ ภาพ ${JOBS.length} ใบ + desc + display cards อ่านกลับตรง · คีย์ราคา ${keys.length} คีย์ยังตรง · savedAt =`, back.data.savedAt);
