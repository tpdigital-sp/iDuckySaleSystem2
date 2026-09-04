#!/usr/bin/env node
/**
 * ที่ใส่ยาดม (otherbag-7) — ภาพประกอบกลุ่ม "รูปแบบ" (พวงกุญแจ/ที่ห้อยคอ) และ "เทคนิค" (ปัก/สกรีน)
 *
 *   node scripts/yadom-case-option-art.mjs           (วาดภาพลง .cache/otherbag-7/upload ดูก่อน)
 *   node scripts/yadom-case-option-art.mjs --write   (+ อัปโหลด storage + เขียน imageSrc + อ่านกลับเทียบ)
 *
 * ทั้งสองกลุ่มเป็น **pills** (ไม่ใช่การ์ด) — บนหน้าเว็บรูปจะไปโผล่ 2 ที่:
 *   1) รูปกลมเล็ก 28×28 ในตัวปุ่ม (h-7 w-7 rounded-full object-cover) → ต้นฉบับจัตุรัสจะถูก "ย่อทั้งใบ"
 *      ไม่ได้ครอป ตัวแบบจึงต้องใหญ่-อยู่กลาง และมีตัวหนังสือแค่บรรทัดเดียวบน-ล่าง ([[iducky-option-thumb-crop]])
 *   2) กดปุ่มแล้ว jumpToImage() เด้งไปโชว์รูปนี้เต็มในแกลเลอรีสินค้า → รายละเอียดในภาพจึงมีประโยชน์จริง
 *
 * จุดที่ต้องต่างกันให้เห็นตั้งแต่ 28px:
 *   รูปแบบ  → ตัวชิ้นงานเหมือนกัน ต่างที่ "อะไหล่ด้านบน" — ห่วง+ตะขอ+ลูกกุญแจ vs สายคล้องคอเป็นห่วงกว้าง
 *   เทคนิค  → ตัวชิ้นงานเหมือนกัน ต่างที่ "ผิวลาย" — ปัก = เส้นไหมทแยงเป็นร่อง + เข็ม/หลอดไหม
 *              สกรีน = ผิวเรียบเงา ขอบคม + ยางปาดหมึก
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 * ⚠️ ฟอนต์ไทยเบียด: อย่าเขียน "+฿10" ติดกัน (฿ ทับ +) ให้เว้นเป็น "สีละ ฿10"
 * รันซ้ำได้: เขียนทับ imageSrc ของตัวเลือกเดิม ไม่แตะกลุ่ม/ชื่อ/ราคา
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "otherbag-7";
const VER = "v1";
const SCREEN_VER = "v2";   // ภาพงานสกรีนวาดใหม่ (บล็อกสกรีน + ลายพิมพ์ไล่เฉด) — ต้องขึ้นชื่อไฟล์ใหม่ ไม่งั้นติดแคช
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

/** หัวเรื่อง + ท้ายภาพ อย่างละบรรทัดเดียว — ย่อเป็นรูปกลม 28px แล้วเนื้อที่ต้องเหลือให้ตัวสินค้า */
const caption = (t, foot) => `
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  <text x="${W / 2}" y="846" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${foot}</text>`;

// ── ตัวสินค้า: ที่ใส่ยาดมหนัง PU ทรงอุ้งเท้าแมว (เรขาคณิตชุดเดียวกับ scripts/yadom-case-size-option.mjs) ──
const LEATHER = "#f3e08a", LEATHER_DK = "#e6cf6d", EDGE = "#41527d";
const PAD = "#f7bcd0", PAD_DK = "#eb9cb8";
const STEEL = "#c3cbd6", STEEL_DK = "#98a3b2";

/**
 * ที่ใส่ยาดม 1 ชิ้น — วาดในสเปซ "มิลลิเมตร" (ตัวจริง 60 × 100 มม.) แล้ว scale
 * mode: "stitch" = ลายปักมีร่องไหม · "print" = ลายสกรีนผิวเรียบเงา
 * id   = คำต่อท้าย clipPath (ห้ามซ้ำในไฟล์เดียวกัน)
 */
const yadomCase = ({ cx, topY, px, mode = "stitch", id }) => {
  const s = px / 10;
  const HEAD = 40, bottom = 100;
  const armTop = HEAD - 14, armH = bottom - HEAD;
  const pocketTop = HEAD + 2;
  const TUBE_W = 14, tubeTop = pocketTop - 14;

  const body = (grow, fill) => `
    <g fill="${fill}">
      <rect x="${-20 - grow}" y="${armTop}" width="${40 + grow * 2}" height="${armH + 14 + grow}" rx="${6 + grow}"/>
      <ellipse cx="0" cy="${16 + grow * 0.2}" rx="${29 + grow}" ry="${17 + grow}"/>
      <circle cx="-21.5" cy="8" r="${8.5 + grow}"/>
      <circle cx="-7.5" cy="0" r="${9 + grow}"/>
      <circle cx="7.5" cy="0" r="${9 + grow}"/>
      <circle cx="21.5" cy="8" r="${8.5 + grow}"/>
    </g>`;

  /** ร่องไหมปัก — เส้นสั้นทแยงถี่ ๆ ในกรอบที่กำหนด (ใช้ clip ให้อยู่ในรูปทรง) */
  const satin = (x0, y0, x1, y1, color, gap = 2.4, angle = 26) => {
    const out = [];
    const t = Math.tan((angle * Math.PI) / 180);
    for (let x = x0 - (y1 - y0) * t; x < x1 + (y1 - y0) * t; x += gap) {
      out.push(`<line x1="${x.toFixed(1)}" y1="${y0}" x2="${(x + (y1 - y0) * t).toFixed(1)}" y2="${y1}"
        stroke="${color}" stroke-width="${gap * 0.62}" stroke-linecap="round"/>`);
    }
    return out.join("");
  };

  const stitched = mode === "stitch";
  return `
  <g transform="translate(${cx} ${topY}) scale(${s})">
    <ellipse cx="3" cy="${bottom + 5}" rx="26" ry="5.5" fill="#0f172a" opacity="0.12"/>
    <!-- ชิ้นหนังไดคัท: ขอบปักน้ำเงิน แล้วทับด้วยเนื้อหนัง -->
    ${body(2.8, EDGE)}
    ${stitched ? `<clipPath id="edge-${id}">${body(2.8, "#000")}</clipPath>
    <g clip-path="url(#edge-${id})">${satin(-34, -12, 34, bottom + 4, "#4f639a", 2.2, 20)}</g>` : ""}
    ${body(0, LEATHER)}
    <ellipse cx="-12" cy="12" rx="13" ry="9" fill="#fbf0bd" opacity="0.55"/>
    <!-- อุ้งเท้า: ปัก = ร่องไหม / สกรีน = ผิวเรียบมีไฮไลต์หมึกเงา -->
    <clipPath id="pad-${id}">
      <ellipse cx="0" cy="20" rx="12.5" ry="9"/>
      ${[[-21.5, 8, 4.6], [-7.5, 0.5, 5], [7.5, 0.5, 5], [21.5, 8, 4.6]]
        .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.85}"/>`).join("")}
    </clipPath>
    <defs>
      <!-- สกรีนไล่เฉดสีได้ (งานปักทำไม่ได้) — เอาไว้บอกความต่างของสองเทคนิค -->
      <linearGradient id="ink-${id}" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#ffd2e2"/>
        <stop offset="0.5" stop-color="${PAD}"/>
        <stop offset="1" stop-color="#f0857f"/>
      </linearGradient>
      <!-- ลายพิมพ์บนแผ่นหน้า: ไล่เฉด 3 สีในลายเดียว -->
      <linearGradient id="art-${id}" x1="0" y1="0" x2="0.55" y2="1">
        <stop offset="0" stop-color="#7dd3e0"/>
        <stop offset="0.52" stop-color="#a78bfa"/>
        <stop offset="1" stop-color="#fb7185"/>
      </linearGradient>
    </defs>
    <g clip-path="url(#pad-${id})">
      <rect x="-30" y="-8" width="60" height="42" fill="${stitched ? PAD : `url(#ink-${id})`}"/>
      ${stitched
        ? satin(-30, -8, 30, 34, PAD_DK, 2.1, 24)
        : `<rect x="-30" y="-8" width="60" height="16" fill="#ffffff" opacity="0.22"/>
           ${[[-5, 15, 1.6], [3, 13, 1.0]]
             .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity="0.5"/>`).join("")}`}
    </g>
    ${stitched
      ? `<ellipse cx="0" cy="20" rx="12.5" ry="9" fill="none" stroke="${PAD_DK}" stroke-width="1.6" opacity="0.9"/>`
      : `<ellipse cx="0" cy="20" rx="12.5" ry="9" fill="none" stroke="#d9647a" stroke-width="0.8"/>`}
    <!-- ตาไก่ร้อยห่วง -->
    <circle cx="0" cy="4.5" r="3.4" fill="#eef2f7" stroke="#9aa5b4" stroke-width="2"/>
    <!-- หลอดยาดมโผล่พ้นปากช่อง -->
    <rect x="${-TUBE_W / 2}" y="${tubeTop}" width="${TUBE_W}" height="24" rx="5" fill="#f7fbff" stroke="#c8d6e5" stroke-width="1.2"/>
    <rect x="${-TUBE_W / 2 + 1.6}" y="${tubeTop + 7}" width="${TUBE_W - 3.2}" height="15" rx="2.5" fill="#7cc5e8" opacity="0.7"/>
    <rect x="${-TUBE_W / 2}" y="${tubeTop}" width="${TUBE_W}" height="7" rx="3.5" fill="#e2ecf6"/>
    <!-- แผ่นหน้า = ช่องใส่ยาดม + ลายวัว -->
    <rect x="-20" y="${pocketTop}" width="40" height="${bottom - pocketTop}" rx="6" fill="${LEATHER_DK}"/>
    <clipPath id="pk-${id}"><rect x="-20" y="${pocketTop}" width="40" height="${bottom - pocketTop}" rx="6"/></clipPath>
    <clipPath id="cow-${id}">
      <path d="M -24 ${pocketTop + 16} c 12 -9 22 0 19 11 c -3 12 -9 14 -6 22 c 3 8 -6 14 -16 11 l -8 -2 Z"/>
      <path d="M 22 ${bottom - 30} c -10 -6 -16 3 -12 11 c 3 7 8 9 6 15 l 8 0 Z"/>
    </clipPath>
    <g clip-path="url(#pk-${id})">
      ${stitched
        ? /* ปัก = ลายวัวไหมทึบ มีร่องไหมเฉพาะบนลาย (เนื้อหนังรอบ ๆ ต้องเรียบ) */ `
        <path d="M -24 ${pocketTop + 16} c 12 -9 22 0 19 11 c -3 12 -9 14 -6 22 c 3 8 -6 14 -16 11 l -8 -2 Z" fill="${EDGE}" opacity="0.9"/>
        <path d="M 22 ${bottom - 30} c -10 -6 -16 3 -12 11 c 3 7 8 9 6 15 l 8 0 Z" fill="${EDGE}" opacity="0.75"/>
        <g clip-path="url(#cow-${id})">${satin(-24, pocketTop, 24, bottom, "#5b6fa8", 2, 24)}</g>`
        : /* สกรีน = ลายพิมพ์เต็มพื้นที่ ไล่เฉดสี + รายละเอียดเล็ก ๆ ที่งานปักทำไม่ได้ */ `
        <rect x="-17" y="${pocketTop + 4}" width="34" height="${bottom - pocketTop - 8}" rx="4" fill="url(#art-${id})"/>
        <g fill="#ffffff">
          ${[[-11, 12, 1.5], [11, 20, 1.9], [-9, 40, 1.3], [12, 46, 1.1]]
            .map(([x, dy, r]) => `<path d="M ${x} ${pocketTop + dy - r * 2.6} l ${r} ${r * 1.6} l ${r * 1.6} ${r} l ${-r * 1.6} ${r} l ${-r} ${r * 1.6}
              l ${-r} ${-r * 1.6} l ${-r * 1.6} ${-r} l ${r * 1.6} ${-r} Z" opacity="0.9"/>`).join("")}
          <!-- แมวลายพิมพ์ (ทรงเดียวกับลายลูกค้า) -->
          <path d="M -7.5 ${pocketTop + 26} L -6 ${pocketTop + 18} L -0.6 ${pocketTop + 23} Z"/>
          <path d="M 7.5 ${pocketTop + 26} L 6 ${pocketTop + 18} L 0.6 ${pocketTop + 23} Z"/>
          <circle cx="0" cy="${pocketTop + 30}" r="7.6"/>
          <rect x="-11" y="${bottom - 17}" width="22" height="2.6" rx="1.3" opacity="0.85"/>
          <rect x="-7" y="${bottom - 12}" width="14" height="2.2" rx="1.1" opacity="0.7"/>
        </g>
        <g fill="#6d3f8f">
          <circle cx="-3" cy="${pocketTop + 29}" r="1.1"/><circle cx="3" cy="${pocketTop + 29}" r="1.1"/>
          <path d="M -1.6 ${pocketTop + 32.4} h 3.2 l -1.6 1.8 Z"/>
        </g>
        <!-- เม็ดสกรีนไล่โทน (halftone) — พิมพ์ได้ ปักไม่ได้ -->
        ${[0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5].map((c) =>
          `<circle cx="${-14 + c * 5.6}" cy="${bottom - 26 + r * 4}" r="${1.5 - r * 0.42 - c * 0.12}" fill="#ffffff" opacity="0.7"/>`).join("")).join("")}
        <rect x="-20" y="${pocketTop}" width="40" height="9" fill="#ffffff" opacity="0.16"/>`}
    </g>
    <rect x="-20" y="${pocketTop}" width="40" height="${bottom - pocketTop}" rx="6" fill="none" stroke="${EDGE}" stroke-width="2.6"/>
    <rect x="-16.5" y="${pocketTop + 3.5}" width="33" height="${bottom - pocketTop - 7}" rx="4" fill="none"
      stroke="#ffffff" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"/>
  </g>`;
};

// ── กลุ่ม "รูปแบบ" ───────────────────────────────────────────────────
/** พวงกุญแจ: ห่วงเหล็ก + ตะขอสปริง + ลูกกุญแจ 2 ดอก — ย่อ 28px แล้วยังอ่านออกว่าเป็นพวงกุญแจ */
function artKeyring() {
  const px = 32;                       // 1 ซม. = 32 px → ชิ้นงาน 192 × 320
  const cx = W / 2, top = 440;
  const ringY = 384, ringR = 54;
  /** ลูกกุญแจคล้องห่วง — หมุนรอบจุดกลางห่วงให้บานออกข้าง ๆ ตัวเรือน จะได้ไม่ถูกบัง */
  const key = (deg) => `
    <g transform="translate(${cx} ${ringY}) rotate(${deg}) translate(0 ${ringR})">
      <circle cx="0" cy="6" r="24" fill="${STEEL}" stroke="${STEEL_DK}" stroke-width="4"/>
      <circle cx="0" cy="6" r="9" fill="#ffffff"/>
      <rect x="-8" y="26" width="16" height="112" rx="5" fill="${STEEL}" stroke="${STEEL_DK}" stroke-width="3"/>
      <rect x="-8" y="26" width="6" height="112" fill="#eaeff5"/>
      <path d="M 8 92 h 18 v 14 H 8 M 8 112 h 15 v 14 H 8" fill="${STEEL_DK}"/>
    </g>`;
  return frame(`
    ${caption("แบบพวงกุญแจ", "ห่วงเหล็ก + ตะขอสปริง เกี่ยวกระเป๋า พวงกุญแจ หรือห่วงกางเกงได้เลย")}
    <!-- ลูกกุญแจคล้องห่วงเดียวกัน — ตัวบอกว่า "พวงกุญแจ" ที่อ่านออกแม้ย่อจิ๋ว -->
    ${key(-58)}${key(58)}
    <!-- ตะขอสปริง (lobster) เกี่ยวห่วงไว้ -->
    <g>
      <path d="M ${cx} 196 a 20 20 0 1 1 0.01 0" fill="none" stroke="${STEEL_DK}" stroke-width="8"/>
      <rect x="${cx - 21}" y="212" width="42" height="128" rx="21" fill="${STEEL}" stroke="${STEEL_DK}" stroke-width="4"/>
      <path d="M ${cx + 4} 236 c 22 14 22 62 -2 78" fill="none" stroke="${STEEL_DK}" stroke-width="7" stroke-linecap="round"/>
      <rect x="${cx - 11}" y="230" width="8" height="96" rx="4" fill="#eef2f7" opacity="0.95"/>
    </g>
    <!-- ห่วงกลม -->
    <circle cx="${cx}" cy="${ringY}" r="${ringR}" fill="none" stroke="${STEEL}" stroke-width="13"/>
    <circle cx="${cx}" cy="${ringY}" r="${ringR}" fill="none" stroke="${STEEL_DK}" stroke-width="3.5" stroke-dasharray="86 250" transform="rotate(-40 ${cx} ${ringY})"/>
    ${yadomCase({ cx, topY: top, px, mode: "stitch", id: "kr" })}`);
}

/** ที่ห้อยคอ: สายคล้องคอเป็นห่วงกว้าง — เงาห่วงใหญ่ทำให้ต่างจากแบบพวงกุญแจตั้งแต่ 28px */
function artNeck() {
  const px = 31;
  const cx = W / 2, top = 470;
  const cord = (dx) => `M ${cx + dx * 8} 452 C ${cx + dx * 150} 392 ${cx + dx * 176} 236 ${cx} 168`;
  return frame(`
    ${caption("แบบที่ห้อยคอ", "สายคล้องคอยาว มีตัวปรับ ถอด-สวมได้ พกยาดมติดตัวทั้งวัน")}
    <!-- สายคล้องคอ 2 ข้าง + ตัวล็อกกลาง -->
    ${[-1, 1].map((d) => `
      <path d="${cord(d)}" fill="none" stroke="#33405c" stroke-width="15" stroke-linecap="round"/>
      <path d="${cord(d)}" fill="none" stroke="#5a6b8c" stroke-width="4" stroke-dasharray="10 12" stroke-linecap="round"/>`).join("")}
    <rect x="${cx - 26}" y="164" width="52" height="26" rx="9" fill="#e9edf3" stroke="#b8c0cc" stroke-width="3"/>
    <!-- ตัวปรับความยาว + ห่วงต่อตัวเรือน -->
    <rect x="${cx - 22}" y="404" width="44" height="30" rx="10" fill="#e9edf3" stroke="#b8c0cc" stroke-width="3"/>
    <path d="M ${cx - 14} 434 v 12 h 28 v -12" fill="none" stroke="#33405c" stroke-width="9" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${top - 12}" r="15" fill="none" stroke="${STEEL}" stroke-width="7"/>
    ${yadomCase({ cx, topY: top, px, mode: "stitch", id: "nk" })}`);
}

// ── กลุ่ม "เทคนิค" ───────────────────────────────────────────────────
/** งานปัก: ผิวลายเป็นร่องไหม + เข็มร้อยไหม + หลอดไหม 3 สี (ราคารวมไหม 3 สี) */
function artEmbroidery() {
  const px = 44;
  const cx = 430, top = 226;
  const spool = (x, y, c) => `
    <g transform="translate(${x} ${y})">
      <rect x="-19" y="-38" width="38" height="76" rx="7" fill="${c}"/>
      <rect x="-19" y="-38" width="12" height="76" fill="#ffffff" opacity="0.22"/>
      <rect x="-23" y="-46" width="46" height="12" rx="5" fill="#e8ebf0" stroke="#c3cbd6" stroke-width="2"/>
      <rect x="-23" y="34" width="46" height="12" rx="5" fill="#e8ebf0" stroke="#c3cbd6" stroke-width="2"/>
    </g>`;
  return frame(`
    ${caption("งานปัก", "ปักด้วยจักรคอมพิวเตอร์ ไหม Madeira · ราคานี้รวมไหม 3 สี เกินคิดสีละ ฿10")}
    ${yadomCase({ cx, topY: top, px, mode: "stitch", id: "em" })}
    <!-- เข็มร้อยไหม พุ่งเข้าหาลายปัก -->
    <path d="M 764 214 C 700 262 664 292 626 330" fill="none" stroke="${PAD_DK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M 764 214 C 806 250 792 300 742 300" fill="none" stroke="${PAD_DK}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
    <g transform="translate(700 292) rotate(38)">
      <path d="M -9 -104 L 9 -104 L 5 96 L 0 112 L -5 96 Z" fill="${STEEL}" stroke="${STEEL_DK}" stroke-width="3"/>
      <ellipse cx="0" cy="-84" rx="3.6" ry="11" fill="#ffffff" stroke="${STEEL_DK}" stroke-width="2"/>
    </g>
    <!-- หลอดไหม 3 สี (สีไหมไม่เกิน 3 สีรวมในราคา) -->
    ${spool(196, 700, "#f06a9a")}${spool(268, 706, "#41527d")}${spool(340, 700, "#f2c744")}`);
}

/** งานสกรีน: ผิวลายเรียบเงา + ยางปาดหมึกพาดเฉียง — ต่างจากงานปักชัดตั้งแต่ย่อจิ๋ว */
function artScreen() {
  const px = 44;
  const cx = 430, top = 226;
  return frame(`
    <defs>
      <!-- ผ้าสกรีน (mesh) ในบล็อก -->
      <pattern id="mesh" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M 0 4.5 H 9 M 4.5 0 V 9" stroke="#c7d2de" stroke-width="1.4" opacity="0.85"/>
      </pattern>
      <linearGradient id="stencilInk" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stop-color="#7dd3e0"/>
        <stop offset="0.52" stop-color="#a78bfa"/>
        <stop offset="1" stop-color="#fb7185"/>
      </linearGradient>
    </defs>
    ${caption("งานสกรีน", "พิมพ์หมึก Solvent ผ่านบล็อกสกรีน · ไล่เฉดสีได้ ผิวลายเรียบเสมอเนื้อหนัง")}
    <!-- บล็อกสกรีน: กรอบ + ผ้ามุ้ง + ลายที่เปิดให้หมึกผ่าน + ยางปาดกำลังปาดหมึก (วางไว้หลังตัวสินค้า) -->
    <g transform="translate(672 396) rotate(-12)">
      <rect x="-166" y="-150" width="332" height="300" rx="14" fill="#e7edf4" stroke="#9aa8bb" stroke-width="4"/>
      <rect x="-138" y="-122" width="276" height="244" fill="#ffffff"/>
      <rect x="-138" y="-122" width="276" height="244" fill="url(#mesh)"/>
      <rect x="-138" y="-122" width="276" height="244" fill="none" stroke="#b9c4d2" stroke-width="3"/>
      <!-- ลายอุ้งเท้าที่เปิดช่องไว้บนบล็อก (หมึกจะทะลุเฉพาะตรงนี้) -->
      <g fill="url(#stencilInk)" transform="translate(0 -6) scale(1.5)">
        <ellipse cx="0" cy="14" rx="30" ry="18"/>
        <circle cx="-23" cy="-6" r="9.5"/><circle cx="-8" cy="-14" r="10"/>
        <circle cx="8" cy="-14" r="10"/><circle cx="23" cy="-6" r="9.5"/>
      </g>
      <!-- ยางปาดหมึก (ด้ามไม้ + ใบยาง) + กองหมึกหน้าใบยาง -->
      <g transform="translate(0 -88)">
        <path d="M -126 24 h 252 v 15 h -252 Z" fill="#a78bfa" opacity="0.55"/>
        <rect x="-126" y="2" width="252" height="24" rx="8" fill="#38455e"/>
        <rect x="-126" y="21" width="252" height="11" rx="5" fill="#1f2937"/>
        <rect x="-112" y="-58" width="224" height="64" rx="12" fill="#c98b4b"/>
        <rect x="-112" y="-58" width="224" height="21" rx="10" fill="#e2ab68"/>
      </g>
    </g>
    ${yadomCase({ cx, topY: top, px, mode: "print", id: "sc" })}
    <!-- หมึกที่ปาดล้นออกมาข้างงาน -->
    <ellipse cx="246" cy="726" rx="48" ry="14" fill="#a78bfa" opacity="0.35"/>
    <ellipse cx="306" cy="748" rx="20" ry="7" fill="#7dd3e0" opacity="0.35"/>`);
}

// ── เรนเดอร์ + ตรวจว่าย่อเป็นรูปกลม 28px แล้วยังต่างกัน ─────────────────
const SHOTS = [
  { group: "รูปแบบ", choice: "พวงกุญแจ", file: `form-keyring-${VER}.jpg`, svg: artKeyring() },
  { group: "รูปแบบ", choice: "ที่ห้อยคอ", file: `form-neck-${VER}.jpg`, svg: artNeck() },
  { group: "เทคนิค", choice: "ราคางานปัก", file: `tech-embroidery-${VER}.jpg`, svg: artEmbroidery() },
  { group: "เทคนิค", choice: "ราคางานสกรีน", file: `tech-screen-${SCREEN_VER}.jpg`, svg: artScreen() },
];

for (const s of SHOTS) {
  s.buf = await sharp(Buffer.from(s.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${s.file}`, s.buf);
  // ย่อ 28px เท่าที่ปุ่มจริงใช้ แล้วขยายกลับมาดูว่ายังแยกออกไหม
  await sharp(s.buf).resize(28, 28).resize(224, 224, { kernel: "nearest" }).toFile(`${OUT}/pill28-${s.file}`);
  console.log(`🖼  ${OUT}/${s.file}  ${Math.round(s.buf.length / 1024)} KB — ${s.group}: ${s.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน imageSrc ────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const s of SHOTS) {
  const key = `products/${PRODUCT_ID}/${s.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, s.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  s.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", s.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

const dump = `${OUT}/../before-option-art-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

// เขียนเฉพาะ imageSrc ของตัวเลือกที่ระบุ — ไม่แตะกลุ่ม/ชื่อ/ราคา/ลำดับ
for (const s of SHOTS) {
  const g = (data.options ?? []).find((o) => o.label === s.group);
  const c = g?.choices?.find((x) => x.name === s.choice);
  if (!c) { console.error(`หาไม่เจอ: ${s.group} / ${s.choice}`); process.exit(1); }
  c.imageSrc = s.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const fails = [
  ...SHOTS.map((s) => [
    got.find((o) => o.label === s.group)?.choices?.find((c) => c.name === s.choice)?.imageSrc === s.url,
    `${s.group}/${s.choice} ภาพไม่ตรง`,
  ]),
  // กลุ่มเดิมต้องอยู่ครบ ([[iducky-option-group-loss-guard]])
  ...["ขนาด", "รูปแบบ", "เทคนิค", "สีหนัง", "สีไหมไม่เกิน 3 สี"].map((l) => [got.some((o) => o.label === l), `กลุ่ม "${l}" หาย`]),
  [got.find((o) => o.label === "ขนาด")?.choices?.length === 3, "การ์ดขนาดหาย/ไม่ครบ"],
  [back.data.priceMin === 140 && back.data.priceMax === 189, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ ภาพตัวเลือก 4 ใบ (รูปแบบ 2 · เทคนิค 2) อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
