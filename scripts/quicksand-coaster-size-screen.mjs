#!/usr/bin/env node
/**
 * Quicksand Coaster (coasters-glitter) — ผู้ใช้สั่ง 3 ก.ย. 69
 *
 *   node scripts/quicksand-coaster-size-screen.mjs            (วาดภาพลง .cache/coasters-glitter/upload ดูก่อน)
 *   node scripts/quicksand-coaster-size-screen.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค COASTER (50_ของใช้และของที่ระลึก/แผ่นรองแก้วน้ำ/P-nCoaster-01.jpg):
 * แผ่นกลิตเตอร์รองแก้วน้ำ (Quicksand coaster) 200.- · ทรงกลม ขนาด 10 cm (ขอบเป็นยาง) ·
 * สกรีน 2 ด้าน / 2 layer บวกเพิ่ม 10 บาท · ข้างในเป็นน้ำ+กลิตเตอร์ ถอด/เติมไม่ได้ ·
 * มีรูที่แผ่นเป็นปกติ · กำหนดจุดสกรีนไม่ได้
 *
 * ทำ 3 อย่าง:
 * 1. เพิ่มกลุ่ม "ขนาด" เป็นกลุ่มแรก แบบการ์ด — ตัวเลือกเดียว "10×10 ซม. (ทรงกลม)" ไม่บวกราคา
 *    พร้อมภาพวาด (แผ่นกลมขอบยางขาว หน้ากลิตเตอร์ทอง + ลูกศรวัด 10 ซม. สองแกน)
 * 2. เปลี่ยนตัวเลือกกลุ่ม "เทคนิคสกรีน" เป็น "สกรีน 1 ด้าน" / "สกรีน 2 ด้าน" (+10) / "สกรีน 2 เลเยอร์" (+10)
 *    ตามที่ผู้ใช้สั่ง (ของเดิม ด้านบน/ด้านใต้/2 เลเยอร์ — ใบสเปคไม่ให้กำหนดจุดสกรีนอยู่แล้ว)
 *    พร้อมภาพวาดผ่าชั้น (exploded view) ของแต่ละแบบ
 *    ⚠️ ศัพท์ร้าน (iducky-screen-2layer): 2 ด้าน = ลายคนละฝั่ง มองจากคนละด้าน ·
 *       2 เลเยอร์ = ลายบน+ใต้หันฝั่งเดียวกัน ซ้อนกันดูมีมิติ — อย่าเขียนคำอธิบายปนกัน
 *       (ภาพ 2 ด้านรุ่น v1 เคยติดคำว่า 2 Layer ในหัวข้อ → ขึ้นรุ่น v2)
 * 3. ภาพประจำตัวเลือก "สีกลิตเตอร์" 4 สี — ครอปเนื้อกลิตเตอร์เต็มกรอบจากภาพถ่ายจริง
 *    ต้นฉบับความละเอียดเต็มบนไดรฟ์ (DSC00008.jpg 5371×3581) ไม่ใช่ตัวย่อ 1200px ในเว็บ
 *
 * รันซ้ำได้: เจอกลุ่มเดิม = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * ⚠️ ห้ามลืม data.savedAt เป็น ISO string (ไม่ใช่ Date.now() ตัวเลข)
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "coasters-glitter";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/coasters-glitter/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "10×10 ซม. (ทรงกลม)";
const COLOR_GROUP = "สีกลิตเตอร์";
const SCREEN_GROUP = "เทคนิคสกรีน";
const ONE_SIDE = "สกรีน 1 ด้าน";
const TWO_SIDE = "สกรีน 2 ด้าน";
const TWO_LAYER = "สกรีน 2 เลเยอร์";
const TWO_EXTRA = 10; // ใบสเปค: สกรีน 2 ด้าน / 2 layer บวกเพิ่ม 10 บาท (ราคาเดียวกันทั้งคู่)
const SCREEN2_VER = "v2"; // ภาพ 2 ด้านแก้หัวข้อ/คำบรรยาย — อัปทับชื่อเดิมไม่ได้ (CDN แคช 30 วัน)
const COLOR_VER = "v2"; // สวอตช์สีกลิตเตอร์ครอปใหม่จากต้นฉบับความละเอียดเต็ม (v1 เละตอนย่อ)

/**
 * ต้นฉบับภาพ 4 แผ่นเรียง 2×2 ที่ความละเอียดเต็ม (5371×3581) จากไดรฟ์รูปงานจริง
 * — ภาพเดียวกับที่อยู่ใน body ของสินค้า แต่ในเว็บถูกย่อเหลือ 1200×750 (แผ่นละ ~334px)
 * ครอปจากตัวย่อแล้วสวอตช์เละตอนย่อเป็นวงกลม 36px ในหน้าสินค้า ("ปรับภาพให้ชัดขึ้น" 3 ก.ย. 69)
 */
const GLITTER_PHOTO =
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/50_ของใช้และของที่ระลึก/แผ่นรองแก้วน้ำ/DSC00008.jpg";
/**
 * ศูนย์กลาง + ครึ่งด้านของกรอบครอปในภาพต้นฉบับ (วัดมือ) — เลือกโซนที่กลิตเตอร์แน่น
 * และไม่ติดขอบยางขาว/ผ้าปูฉากหลัง เพราะสวอตช์เป็นเนื้อกลิตเตอร์เต็มกรอบ ไม่มีขอบ
 * ลำดับแผ่นตามใบสเปค: ทอง ซ้ายบน · ชมพู ขวาบน · ซากุระ ซ้ายล่าง · ม่วง ขวาล่าง
 */
const COLORS = [
  { name: "ทอง", file: `glitter-gold-${COLOR_VER}.jpg`, cx: 1905, cy: 900, half: 540 },
  { name: "ชมพู", file: `glitter-pink-${COLOR_VER}.jpg`, cx: 3540, cy: 1050, half: 520 },
  { name: "ซากุระ", file: `glitter-sakura-${COLOR_VER}.jpg`, cx: 1905, cy: 2600, half: 540 },
  { name: "ม่วง", file: `glitter-purple-${COLOR_VER}.jpg`, cx: 3650, cy: 2760, half: 520 },
];

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ silicone-coaster-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** กากเพชรวิ้ง ๆ — ดาว 4 แฉกเล็ก ๆ */
const spark = (x, y, s, color = "#fff7d6", op = 0.9) =>
  `<path d="M ${x} ${y - s} Q ${x + s * 0.22} ${y - s * 0.22} ${x + s} ${y} Q ${x + s * 0.22} ${y + s * 0.22} ${x} ${y + s} Q ${x - s * 0.22} ${y + s * 0.22} ${x - s} ${y} Q ${x - s * 0.22} ${y - s * 0.22} ${x} ${y - s} Z" fill="${color}" opacity="${op}"/>`;

const glitterDefs = `
  <radialGradient id="gold" cx="0.4" cy="0.35" r="0.95">
    <stop offset="0" stop-color="#f6e2a0"/>
    <stop offset="0.55" stop-color="#e7c65a"/>
    <stop offset="1" stop-color="#c9a437"/>
  </radialGradient>
  <pattern id="gdots" width="46" height="46" patternUnits="userSpaceOnUse">
    <circle cx="9" cy="10" r="3.2" fill="#fff3c2" opacity="0.9"/>
    <circle cx="30" cy="26" r="2.2" fill="#b8912b" opacity="0.7"/>
    <circle cx="20" cy="38" r="1.6" fill="#ffffff" opacity="0.8"/>
    <circle cx="40" cy="8" r="1.8" fill="#f9dc8e" opacity="0.85"/>
  </pattern>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#dde4ec"/>
  </linearGradient>`;

/**
 * ภาพกลุ่ม "ขนาด" — แผ่นกลมขอบยางขาว หน้ากลิตเตอร์ทอง มาสคอตแทนลายสกรีน
 * ลูกศรวัด 10 ซม. สองแกน (วัดคลุมทั้งแผ่นรวมขอบยาง ตามใบสเปค "ทรงกลม ขนาด 10 cm")
 */
function sizeArt() {
  const CM = 46;
  const R = (10 * CM) / 2; // 230
  const cx = W / 2;
  const cy = 436;
  const RIM = 26; // ขอบยางสีขาว
  const r = MASCOT.ratio;
  let ah = (R - RIM) * 1.16;
  let aw = ah * r;
  if (aw > (R - RIM) * 1.45) { aw = (R - RIM) * 1.45; ah = aw / r; }

  const sparks = [
    [cx - 120, cy - 110, 13], [cx + 130, cy - 60, 10], [cx - 100, cy + 120, 10],
    [cx + 95, cy + 130, 13], [cx + 20, cy - 160, 9], [cx - 40, cy + 165, 9],
  ].map(([x, y, s]) => spark(x, y, s)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${glitterDefs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 10 × 10 ซม. (ทรงกลม)</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ขอบยางกันลื่น · ข้างในเป็นน้ำ + กลิตเตอร์ — ขนาดเดียว</text>

  <!-- เงา + ขอบยางขาวหนา -->
  <ellipse cx="${cx}" cy="${cy + 18}" rx="${R * 1.02}" ry="${R * 0.98}" fill="#0f172a" opacity="0.07"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#rim)" stroke="#c8d2dd" stroke-width="3"/>
  <!-- หน้ากลิตเตอร์ทอง + มาสคอตแทนลายสกรีนของลูกค้า -->
  <circle cx="${cx}" cy="${cy}" r="${R - RIM}" fill="url(#gold)" stroke="#b8912b" stroke-width="2"/>
  <clipPath id="face"><circle cx="${cx}" cy="${cy}" r="${R - RIM - 1}"/></clipPath>
  <g clip-path="url(#face)">
    <circle cx="${cx}" cy="${cy}" r="${R - RIM}" fill="url(#gdots)" opacity="0.75"/>
    ${sparks}
  </g>
  <image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  <!-- ไฮไลต์โค้งด้านบน (แผ่นหน้าเป็นผิวเรียบมัน) -->
  <path d="M ${cx - R * 0.58} ${cy - R * 0.6} A ${R * 0.84} ${R * 0.84} 0 0 1 ${cx + R * 0.58} ${cy - R * 0.6}"
    fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.5"/>

  ${dim(cx - R, cy + R + 40, cx + R, cy + R + 40, "10 ซม.")}
  ${dim(cx - R - 42, cy - R, cx - R - 42, cy + R, "10 ซม.")}

  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายตามสั่งด้วยระบบ UV · กลิตเตอร์ข้างในเขย่าไหลได้ ถอด/เติมไม่ได้</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">มีรูที่แผ่นเป็นปกติ · ไม่สามารถกำหนดจุดสกรีนได้</text>
</svg>`;
}

/**
 * ภาพกลุ่ม "เทคนิคสกรีน" — ผ่าชั้นแบบ exploded view:
 * แผ่นใส (บน) / ชั้นน้ำ+กลิตเตอร์ / แผ่นใส (ล่าง) · ลายสกรีนเป็นมาสคอตลอยเหนือแผ่น
 * mode: "1side" ลายบนอย่างเดียว · "2side" ลายที่ 2 กลับหัวหันลง (มองจากใต้แผ่น) ·
 *       "2layer" ลายที่ 2 หันขึ้นฝั่งเดียวกับลายบน (ซ้อนกันดูมีมิติ)
 */
function screenArt(mode) {
  const twoSide = mode !== "1side";
  const flip2 = mode === "2side"; // 2 ด้าน = ลายใต้กลับหัว (มองจากอีกฝั่ง) · 2 เลเยอร์ = หันขึ้นเหมือนลายบน
  const cx = 340; // เขยิบซ้ายเผื่อที่ป้ายชื่อชั้นด้านขวา (ป้ายยาวสุด ~12 ตัวอักษร)
  const RX = 235;
  const RY = 64;
  const gap = 96;
  const top = twoSide ? 268 : 316;
  const y = (i) => top + i * gap; // 0=ลายบน 1=แผ่นบน 2=กลิตเตอร์ 3=แผ่นล่าง 4=ลายใต้
  const r = MASCOT.ratio;
  const mh = 130;
  const mw = mh * r;

  const plate = (yy) => `
    <ellipse cx="${cx}" cy="${yy + 10}" rx="${RX}" ry="${RY}" fill="#c7d6e4"/>
    <ellipse cx="${cx}" cy="${yy}" rx="${RX}" ry="${RY}" fill="#e8f3fb" stroke="#9cc3e0" stroke-width="2.5" opacity="0.92"/>
    <path d="M ${cx - RX * 0.52} ${yy - RY * 0.44} A ${RX * 0.72} ${RY * 0.72} 0 0 1 ${cx + RX * 0.5} ${yy - RY * 0.42}"
      fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.75"/>`;

  const glitter = (yy) => `
    <ellipse cx="${cx}" cy="${yy + 12}" rx="${RX * 0.94}" ry="${RY * 0.94}" fill="#b8912b" opacity="0.5"/>
    <ellipse cx="${cx}" cy="${yy}" rx="${RX * 0.94}" ry="${RY * 0.94}" fill="url(#gold)" stroke="#b8912b" stroke-width="2"/>
    <clipPath id="gl${yy}"><ellipse cx="${cx}" cy="${yy}" rx="${RX * 0.92}" ry="${RY * 0.9}"/></clipPath>
    <g clip-path="url(#gl${yy})">
      <ellipse cx="${cx}" cy="${yy}" rx="${RX}" ry="${RY}" fill="url(#gdots)" opacity="0.75"/>
      ${spark(cx - 120, yy - 8, 10)}${spark(cx + 96, yy + 10, 12)}${spark(cx + 10, yy - 22, 8)}
    </g>`;

  const mascotLayer = (yy, flip = false) => `
    <g ${flip ? `transform="translate(${cx} ${yy}) scale(1 -1) translate(${-cx} ${-yy})" opacity="0.88"` : ""}>
      <ellipse cx="${cx}" cy="${yy + mh * 0.36}" rx="${mw * 0.6}" ry="${mh * 0.16}" fill="#0f172a" opacity="0.06"/>
      <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${yy - mh / 2}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    </g>`;

  const tag = (yy, text, strong = false) => `
    <line x1="${cx + RX + 12}" y1="${yy}" x2="${cx + RX + 44}" y2="${yy}" stroke="${SUB}" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="${cx + RX + 52}" y="${yy + 8}" font-family="${TH}" font-size="23" font-weight="${strong ? 700 : 400}"
      fill="${strong ? INK : SUB}">${text}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${glitterDefs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${mode === "1side" ? "สกรีน 1 ด้าน" : mode === "2side" ? "สกรีน 2 ด้าน" : "สกรีน 2 เลเยอร์"}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${mode === "1side" ? "พิมพ์ลายบนผิวหน้าแผ่นด้านบน" : mode === "2side" ? "ลายบน + ลายใต้ คนละฝั่ง — มองได้จากทั้งสองด้าน" : "ลายบน + ลายใต้ หันขึ้นฝั่งเดียวกัน — ซ้อนกันดูมีมิติความลึก"}</text>

  ${twoSide ? `${mascotLayer(y(4) + 34, flip2)}${tag(y(4) + 34, flip2 ? "ลายสกรีน (ใต้ · หันลง)" : "ลายสกรีน (ใต้ · หันขึ้น)", true)}` : ""}
  ${plate(y(3))}${tag(y(3), "แผ่นใส (ล่าง)")}
  ${glitter(y(2))}${tag(y(2), "น้ำ + กลิตเตอร์")}
  ${plate(y(1))}${tag(y(1), "แผ่นใส (บน)")}
  ${mascotLayer(y(0) - 34)}${tag(y(0) - 34, "ลายสกรีน (ด้านบน)", true)}

  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${twoSide ? "บวกเพิ่ม 10 บาท/อัน" : "ราคาปกติ ไม่บวกเพิ่ม"} · งานสกรีน UV ลายของคุณเอง</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ไม่สามารถกำหนดจุดสกรีนได้ (ข้างในเป็นน้ำ+กลิตเตอร์)</text>
</svg>`;
}

// ── วาด + ครอปทุกภาพ ─────────────────────────────────────────────────
const jpeg = (buf) => sharp(buf).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

const files = {}; // file → buffer
files[`size-round10-${VER}.jpg`] = await jpeg(Buffer.from(sizeArt()));
files[`screen-1side-${VER}.jpg`] = await jpeg(Buffer.from(screenArt("1side")));
files[`screen-2side-${SCREEN2_VER}.jpg`] = await jpeg(Buffer.from(screenArt("2side")));
files[`screen-2layer-${VER}.jpg`] = await jpeg(Buffer.from(screenArt("2layer")));

/**
 * สวอตช์สีกลิตเตอร์ — เนื้อกลิตเตอร์เต็มกรอบจากภาพถ่ายจริง ไม่มีการ์ดขาว/ตัวหนังสือ
 * หน้าสินค้าย่อสวอตช์เป็นวงกลม ~36px และพิมพ์ชื่อสีข้าง ๆ ให้อยู่แล้ว
 * การ์ดขาว+หัวข้อรุ่นแรกจึงเหลือแต่ขอบขาวกับวงจิ๋ว มองไม่ออกว่าสีไหน
 */
if (!existsSync(GLITTER_PHOTO)) {
  console.error(`ไม่เจอภาพต้นฉบับ (ไดรฟ์ยังไม่ได้เมาต์?)\n  ${GLITTER_PHOTO}`);
  process.exit(1);
}
for (const c of COLORS) {
  files[c.file] = await sharp(GLITTER_PHOTO)
    .extract({ left: c.cx - c.half, top: c.cy - c.half, width: c.half * 2, height: c.half * 2 })
    .resize(W, H)
    .sharpen({ sigma: 0.8 }) // ชดเชยความคมที่หายตอนย่อ — ไม่แตะสี/ความอิ่มตัว ให้ตรงงานจริง
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

for (const [f, buf] of Object.entries(files)) {
  writeFileSync(`${OUT}/${f}`, buf);
  console.log(`🖼  ${OUT}/${f}  ${Math.round(buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urlOf = {};
for (const [f, buf] of Object.entries(files)) {
  const key = `products/${PRODUCT_ID}/${f}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urlOf[f] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urlOf[f]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// 1) กลุ่ม "ขนาด" การ์ด — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกเป็นกลุ่มแรก
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  choices: [{ name: SIZE_CHOICE, desc: "ขอบยางกันลื่น · ขนาดเดียว", imageSrc: urlOf[`size-round10-${VER}.jpg`] }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.splice(0, 0, sizeGroup);

// 2) "สีกลิตเตอร์" — เติมภาพครอปจากงานจริงลงตัวเลือกเดิม (ไม่แตะชื่อ/ลำดับ)
const colorOpt = options.find((o) => o.label === COLOR_GROUP);
if (!colorOpt) { console.error(`ไม่เจอกลุ่ม "${COLOR_GROUP}"`); process.exit(1); }
for (const ch of colorOpt.choices) {
  const src = COLORS.find((c) => c.name === ch.name);
  if (!src) { console.error(`สีแปลกหน้าในกลุ่ม "${COLOR_GROUP}":`, ch.name); process.exit(1); }
  ch.imageSrc = urlOf[src.file];
}

// 3) "เทคนิคสกรีน" — เปลี่ยนตัวเลือกเป็น สกรีน 1 ด้าน / สกรีน 2 ด้าน (+10) ตามใบสเปค
const screenOpt = options.find((o) => o.label === SCREEN_GROUP);
if (!screenOpt) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP}"`); process.exit(1); }
screenOpt.display = "cards";
screenOpt.choices = [
  { name: ONE_SIDE, desc: "พิมพ์ลายบนผิวหน้าแผ่นด้านบน", imageSrc: urlOf[`screen-1side-${VER}.jpg`] },
  { name: TWO_SIDE, desc: "ลายบน + ลายใต้ คนละฝั่ง มองได้จากทั้งสองด้าน", extra: TWO_EXTRA, imageSrc: urlOf[`screen-2side-${SCREEN2_VER}.jpg`] },
  { name: TWO_LAYER, desc: "ลายบน + ลายใต้ หันขึ้นฝั่งเดียวกัน ซ้อนกันดูมีมิติความลึก", extra: TWO_EXTRA, imageSrc: urlOf[`screen-2layer-${VER}.jpg`] },
];

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const b = back.data.options;
const bSize = b.find((o) => o.label === SIZE_GROUP);
const bColor = b.find((o) => o.label === COLOR_GROUP);
const bScreen = b.find((o) => o.label === SCREEN_GROUP);
const bad =
  bSize?.display !== "cards" || bSize?.choices?.[0]?.name !== SIZE_CHOICE || bSize?.choices?.[0]?.imageSrc !== urlOf[`size-round10-${VER}.jpg`] ||
  bColor?.choices?.some((ch) => !ch.imageSrc) ||
  bScreen?.choices?.length !== 3 || bScreen?.choices?.[0]?.name !== ONE_SIDE ||
  bScreen?.choices?.[1]?.name !== TWO_SIDE || bScreen?.choices?.[1]?.extra !== TWO_EXTRA ||
  bScreen?.choices?.[1]?.imageSrc !== urlOf[`screen-2side-${SCREEN2_VER}.jpg`] ||
  bScreen?.choices?.[2]?.name !== TWO_LAYER || bScreen?.choices?.[2]?.extra !== TWO_EXTRA ||
  b[0]?.label !== SIZE_GROUP;
if (bad) { console.error("อ่านกลับไม่ตรง!", JSON.stringify(b, null, 1)); process.exit(1); }
console.log(`✓ ขนาด(การ์ด) + สีกลิตเตอร์ 4 ภาพ + สกรีน 1 ด้าน/2 ด้าน/2 เลเยอร์ อ่านกลับตรง · savedAt =`, back.data.savedAt);
