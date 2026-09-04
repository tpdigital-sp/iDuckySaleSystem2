#!/usr/bin/env node
/**
 * SHAWL / ผ้าคลุมไหล่ (shawl) — ภาพประกอบ 2 กลุ่มตัวเลือก + ทำเป็นการ์ด
 *
 *   node scripts/shawl-size-fabric-art.mjs           (วาดลง .cache/shawl/upload ดูก่อน)
 *   node scripts/shawl-size-fabric-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: กลุ่ม "ขนาด" (3 ตัวเลือก) กับ "ผ้า" (2 ตัวเลือก) เป็นปุ่มเปล่า ไม่มีภาพ ไม่มีคำอธิบาย
 *   กลุ่ม "สีไหมเย็บชิ้นงาน" มีภาพครบอยู่แล้ว — ไม่แตะ
 *
 * ⚠️ "ขนาด" คือแกนตารางราคา (pricing.driverLabels = ["ขนาด"] และ priceRates[0] ด้วย)
 *    ห้ามเปลี่ยนชื่อกลุ่ม/ชื่อตัวเลือกเด็ดขาด — cells ผูกกับ "70x70cm" / "100x100cm" / "140x140cm"
 *    สคริปต์นี้จึงเติมแค่ display/note/imageSrc/desc ([[iducky-price-driver-trap]])
 *
 * ภาพขนาด 3 ใบ วาด "สเกลเดียวกัน" (2.4 px = 1 ซม.) มีคนสูง 165 ซม. ยืนเทียบทุกใบ
 *   ผืนวางแบนขอบบนตรงกันทุกใบ (ใบใหญ่จึงยาวลงล่างจริง) + คนสวมผ้าผืนนั้นตามการใช้งานจริง
 * ภาพเนื้อผ้า 2 ใบ ใช้ "ภาพถ่ายผ้าตัวอย่างจริง" จากใบเทียบเนื้อผ้าในไดรฟ์ ครอปเฉพาะเนื้อผ้า
 *   /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ/{6.Satin Peach,7.Satin Silk}.jpg
 *   (พิมพ์ลายเดียวกันทั้งสองเนื้อ เทียบกันได้ตรง ๆ — ใบนี้เขียนเองว่า "เหมาะสำหรับการทำผ้าคลุมไหล่")
 * ⚠️ ปุ่ม/การ์ดตัวเลือกครอปกลางภาพ (object-cover) — ป้ายชื่อกับตัวเลขจึงวางคาบกลาง 300-600 ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ + savedAt ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: เขียนทับกลุ่มเดิมที่ตำแหน่งเดิม ไม่ย้ายลำดับ ไม่เพิ่มกลุ่ม
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "shawl";
const VER = "v2";   // v2 = แก้ผ้าบนตัวคน: 70 = ผ้าพันคอผูกปม · 100/140 = พาดบ่าชายห้อย 2 ข้าง เปิดกลางลำตัว (v1 วาดปิดหน้าอกทั้งผืน ดูเป็นผ้าให้นม)
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", PINK = "#db2777";

const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

const pill = (cx, y, text, tone = "ok") => {
  const w = text.length * 14.5 + 56;
  const c = tone === "pink" ? PINK : tone === "mute" ? SUB : OK;
  const bg = tone === "pink" ? "#fdf2f8" : tone === "mute" ? "#f8fafc" : "#ecfeff";
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${c}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${c}">${text}</text>`;
};

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const right = vertical && side === "right";   // ป้ายอยู่ขวาเส้น (กันทับป้ายตัวเลขกลางผืน)
  const lx = vertical ? x1 + (right ? 14 : -14) : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 32 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? (right ? 0 : label.length * 12.5) : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? (right ? "start" : "end") : "middle"}" fill="${SUB}">${label}</text>`;
};

// ════════════════════════════════════════════════════════════════════
// 1) กลุ่ม "ขนาด" — การ์ด 3 ใบ สเกลเดียวกัน + คนสูง 165 ซม. ยืนเทียบ
// ════════════════════════════════════════════════════════════════════
const S = 2.4;          // px ต่อ 1 ซม. — ใช้ร่วมกันทั้ง 3 ใบ ห้ามแยกสเกล ไม่งั้นเทียบขนาดไม่ได้
const TOP_Y = 250;      // ขอบบนผืนผ้าที่วางแบน + หัวคน ตรงกันทุกใบ
const SQ_CX = 470;      // กลางผืนที่วางแบน (ให้กลางผืนตกในกรอบครอป 300-600)
const MAN_CX = 180;     // กลางตัวคนเทียบขนาด
const MAN_CM = 165;     // ส่วนสูงคนอ้างอิง

const CLOTH_DEFS = `
  <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#dff5ee"/><stop offset="0.45" stop-color="#fdeef4"/><stop offset="1" stop-color="#e4f0fd"/>
  </linearGradient>
  <pattern id="print" width="64" height="64" patternUnits="userSpaceOnUse">
    <rect width="64" height="64" fill="url(#cloth)"/>
    <g fill="#f7b6cd">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${16 + 5.5 * Math.cos((i * 72 * Math.PI) / 180)}" cy="${17 + 5.5 * Math.sin((i * 72 * Math.PI) / 180)}" r="4.2"/>`).join("")}</g>
    <circle cx="16" cy="17" r="3.2" fill="#fbd97a"/>
    <path d="M 46 34 c -5 -6 -13 -1 -9 5 l 9 10 l 9 -10 c 4 -6 -4 -11 -9 -5 z" fill="#f59db5" opacity="0.85"/>
    <g fill="#8fd4bd">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${52 + 5 * Math.cos((i * 72 * Math.PI) / 180)}" cy="${12 + 5 * Math.sin((i * 72 * Math.PI) / 180)}" r="3.6"/>`).join("")}</g>
    <circle cx="52" cy="12" r="2.6" fill="#ffffff"/>
    <circle cx="10" cy="48" r="3" fill="#f6c9a0"/>
    <circle cx="30" cy="56" r="2.4" fill="#a9d8f2"/>
    <circle cx="34" cy="8" r="2.2" fill="#f7b6cd"/>
  </pattern>`;

/**
 * คนยืนเทียบขนาด — วาดในหน่วย "ซม." แล้ว scale ด้วย S (สูง 165 ซม. เท่ากันทุกใบ)
 * cm = ขนาดผ้า (ด้านละกี่ ซม.) ใช้กำหนดว่าผ้าคลุมลงมาถึงไหน:
 *   70 = ผูกคอ/พันคอ · 100 = คลุมไหล่ · 140 = คลุมทั้งตัว (ยาวเลยสะโพก)
 */
const person = (cx, topY, cm) => {
  const drop = cm * 0.5;                       // ความยาวชายผ้าที่ห้อยลงมาจากไหล่ (พับครึ่งทแยง)
  const hw = Math.min(18 + cm * 0.09, 30);     // ครึ่งความกว้างที่ผ้าคลุมคลุมไหล่+แขน
  const sh = 28;                               // ระดับไหล่ (ซม. จากกลางกระหม่อม)
  const petal = (x, y, r, c) => `<g fill="${c}">${[0, 1, 2, 3, 4]
    .map((i) => `<circle cx="${x + r * Math.cos((i * 72 * Math.PI) / 180)}" cy="${y + r * Math.sin((i * 72 * Math.PI) / 180)}" r="${r * 0.72}"/>`).join("")}<circle cx="${x}" cy="${y}" r="${r * 0.5}" fill="#fbd97a"/></g>`;
  /**
   * ผืนเล็ก (70 ซม.) ใช้ "ผูกคอ" ไม่ใช่พาดบ่า — วาดเป็นผ้าพันคอพับทแยงผูกปมหน้าอก
   * (ถ้าวาดพาดบ่าเหมือนผืนใหญ่ ผ้าจะกางออกข้างเป็นปีก ดูเป็นผ้ากันเปื้อน ไม่ใช่ผ้าคลุมไหล่)
   */
  const scarf = `
    <!-- แถบพันรอบคอ (ส่วนที่อ้อมหลังคออยู่หลังตัว) -->
    <path d="M -10 ${sh - 4} q 10 -6 20 0 l 0 5 q -10 -5 -20 0 z" fill="#e9d3de"/>
    <path d="M -10.5 ${sh - 3} q 10.5 6 21 0 l -1.5 6.5 q -9 4.5 -18 0 z" fill="url(#cloth)" stroke="#e3c9d6" stroke-width="0.7"/>
    <!-- ชายผ้าสามเหลี่ยมห้อยหน้าอก ยาว ${(drop * 0.62).toFixed(0)} ซม. -->
    <path d="M -8 ${sh + 4} q 8 4 16 0 l 1.5 ${drop * 0.2}
             q -1 ${drop * 0.3} -9.5 ${drop * 0.42} q -8.5 ${-drop * 0.12} -9.5 ${-drop * 0.42} z"
      fill="url(#cloth)" stroke="#e3c9d6" stroke-width="0.7" stroke-linejoin="round"/>
    ${petal(-2.5, sh + drop * 0.3, 2.4, "#f7b6cd")}
    ${petal(3.5, sh + drop * 0.48, 2.1, "#8fd4bd")}
    <!-- ปมผูกใต้คอ -->
    <path d="M -5 ${sh + 1} q 5 5 10 0 q 1 5 -5 5.5 q -6 -0.5 -5 -5.5 z" fill="#f3dde7" stroke="#dcc3d1" stroke-width="0.7"/>`;
  return `
  <g transform="translate(${cx} ${topY}) scale(${S})">
    <!-- ตัวคน (เงาเรียบ ๆ ไว้เทียบสัดส่วนอย่างเดียว) -->
    <g fill="#cbd5e1">
      <rect x="-16" y="84" width="13" height="81" rx="5"/><rect x="3" y="84" width="13" height="81" rx="5"/>
      <rect x="-25.5" y="28" width="6" height="54" rx="3"/><rect x="19.5" y="28" width="6" height="54" rx="3"/>
      <path d="M -20 26 q 20 -5 40 0 l -3 58 l -34 0 z"/>
      <rect x="-3.5" y="18" width="7" height="10" rx="3"/>
    </g>
    <ellipse cx="0" cy="11" rx="9" ry="11.5" fill="#e2e8f0"/>
    <path d="M -9.6 9 q 2 -13 9.6 -13 q 7.6 0 9.6 13 q -4 -6 -9.6 -6 q -5.6 0 -9.6 6 z" fill="#b9c4d2"/>
    ${cm <= 70 ? scarf : `
    <!-- ผ้าคลุมไหล่: พาดบ่า ชายผ้าห้อยลงมา 2 ข้างด้านหน้า "เปิดกลางลำตัว" ยาว ${drop} ซม.
         (ห้ามวาดเป็นแผ่นปิดหน้าอกทั้งผืน — แบบนั้นกลายเป็นผ้าให้นม/ผ้ากันเปื้อน) -->
    <!-- ผืนที่พาดหลังคอ (อยู่หลังตัว เห็นแค่แถบบาง ๆ เหนือบ่า) -->
    <path d="M -8 ${sh - 3} q 8 -4 16 0 l 1 7 q -9 -3 -18 0 z" fill="#e9d3de"/>
    ${[-1, 1].map((k) => `
      <!-- ชายผ้าฝั่ง${k < 0 ? "ซ้าย" : "ขวา"}: พาดบ่า → ห้อยลงด้านหน้า ขอบในเฉียงเปิดกลางตัว -->
      <path d="M ${k * 5} ${sh - 3}
               Q ${k * hw * 0.55} ${sh - 6} ${k * hw} ${sh + 5}
               L ${k * hw * 0.66} ${sh + drop * 0.72}
               Q ${k * hw * 0.52} ${sh + drop} ${k * hw * 0.34} ${sh + drop}
               L ${k * 8} ${sh + drop * 0.55}
               L ${k * 4.5} ${sh + 9} Z"
        fill="url(#cloth)" stroke="#e3c9d6" stroke-width="0.8" stroke-linejoin="round"/>
      <!-- รอยพับตามแนวชายผ้า -->
      <path d="M ${k * (hw * 0.62)} ${sh + 10} q ${k * -1} ${drop * 0.32} ${k * -3.5} ${drop * 0.66}"
        fill="none" stroke="#ffffff" stroke-width="1" opacity="0.8"/>`).join("")}
    ${petal(-hw * 0.72, sh + drop * 0.34, 2.8, "#f7b6cd")}
    ${petal(hw * 0.74, sh + drop * 0.46, 2.6, "#8fd4bd")}
    ${petal(hw * 0.68, sh + drop * 0.16, 2.3, "#f7b6cd")}
    <path d="M ${-hw * 0.62} ${sh + drop * 0.6} c -2.2 -2.6 -5.8 -0.4 -4 2.2 l 4 4.6 l 4 -4.6 c 1.8 -2.6 -1.8 -4.8 -4 -2.2 z" fill="#f59db5" opacity="0.85"/>`}
    <!-- เส้นบอกส่วนสูงคน -->
    <line x1="${-hw - 14}" y1="0" x2="${-hw - 14}" y2="${MAN_CM}" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="4 3"/>
  </g>
  <text x="${cx}" y="${topY + MAN_CM * S + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">คนสูง 165 ซม.</text>
  <text x="${cx}" y="${topY + MAN_CM * S + 60}" font-family="${TH}" font-size="19" text-anchor="middle" fill="#94a3b8">(ไว้เทียบขนาด)</text>`;
};

const MASCOT = await mascotDataUri("heart", 300);

/** การ์ดขนาด 1 ใบ — ผืนวางแบน (สเกลจริง) + คนสวมผ้าผืนนั้น + ป้ายตัวเลขกลางภาพ */
function sizeArt({ cm, use, prices }) {
  const side = cm * S;
  const left = SQ_CX - side / 2, right = SQ_CX + side / 2;
  const top = TOP_Y, bottom = TOP_Y + side;
  const cy = top + side / 2;
  const fs = cm <= 70 ? 44 : 58;
  const bw = Math.max(fs * 4.4, 196), bh = fs + 62;
  const labelCY = bottom - 18;                 // ป้ายคาบขอบล่างผืน — กลางป้ายยังอยู่ในกรอบครอป 300-600
  const mw = side * 0.44, mh = mw / MASCOT.ratio;
  return frame(`
    ${title(`ขนาด ${cm} × ${cm} ซม.`, `ผืนละ ฿${prices[0]} (1-10 ผืน) · สั่ง 5,000 ผืนขึ้นไป ฿${prices[1]}`)}
    ${person(MAN_CX, TOP_Y, cm)}
    <!-- ผืนผ้าวางแบน ขนาดจริงตามสเกล 1 ซม. = ${S} px -->
    <rect x="${left + 5}" y="${top + 7}" width="${side}" height="${side}" rx="10" fill="#0f172a" opacity="0.07"/>
    <rect x="${left}" y="${top}" width="${side}" height="${side}" rx="10" fill="url(#print)" stroke="#dbe3ec" stroke-width="2"/>
    <image href="${MASCOT.uri}" x="${SQ_CX - mw / 2}" y="${top + side * 0.05}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    ${dim(left, bottom + 46, right, bottom + 46, `${cm} ซม.`, "below")}
    ${dim(right + 42, top, right + 42, bottom, `${cm} ซม.`, "right")}
    <!-- ป้ายตัวเลขกลางผืน — ต้องอ่านออกตอนย่อเป็นปุ่ม/การ์ด ([[iducky-option-thumb-crop]]) -->
    <rect x="${SQ_CX - bw / 2}" y="${labelCY - bh / 2}" width="${bw}" height="${bh}" rx="20" fill="#ffffff" opacity="0.94" stroke="#e2e8f0" stroke-width="2"/>
    <text x="${SQ_CX}" y="${labelCY + 4}" font-family="${TH}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${INK}">${cm} × ${cm}</text>
    <text x="${SQ_CX}" y="${labelCY + 38}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${SUB}">เซนติเมตร</text>
    ${pill(W / 2, 762, use, "pink")}
    ${foot([
      "ภาพทั้ง 3 ขนาดวาดสเกลเดียวกัน · คนในภาพสูง 165 ซม. เท่ากันทุกใบ",
      "ขนาดจริงอาจคลาดเคลื่อน 2-5 ซม. เพราะผ้าแต่ละผืนตัดมาไม่เท่ากันเป๊ะ",
    ])}`, CLOTH_DEFS);
}

const SIZES = [
  { name: "70x70cm", cm: 70, use: "ผูกคอ · พันผม · ผูกกระเป๋า", prices: [250, 170] },
  { name: "100x100cm", cm: 100, use: "คลุมไหล่ · คลุมกันแดด · แต่งลุค", prices: [400, 280] },
  { name: "140x140cm", cm: 140, use: "คลุมทั้งตัว · ห่มกันหนาว · ผ้าคลุมยาว", prices: [600, 540] },
];
for (const s of SIZES) {
  s.file = `size-${s.cm}-${VER}.jpg`;
  s.buf = await sharp(Buffer.from(sizeArt(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${s.file}`, s.buf);
  await sharp(s.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${s.file}`);
  console.log(`🖼  ${OUT}/${s.file}  ${Math.round(s.buf.length / 1024)} KB — ${s.name}`);
}

// ════════════════════════════════════════════════════════════════════
// 2) กลุ่ม "ผ้า" — การ์ด 2 ใบ จากภาพถ่ายผ้าตัวอย่างจริงในไดรฟ์
// ════════════════════════════════════════════════════════════════════
const SWATCH_DIR = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ";
const SWATCH_CACHE = `.cache/${PRODUCT_ID}/swatch`;
mkdirSync(SWATCH_CACHE, { recursive: true });

/** ครอปเฉพาะเนื้อผ้าจากใบเทียบเนื้อผ้า (ต้นฉบับ 1970×1970 · ครึ่งบนเป็นรูป ครึ่งล่างเป็นข้อความ) */
async function swatchUri(file) {
  const cached = `${SWATCH_CACHE}/${file}.jpg`;
  if (!existsSync(cached)) {
    const src = `${SWATCH_DIR}/${file}.jpg`;
    if (!existsSync(src)) throw new Error(`หาไฟล์ผ้าตัวอย่าง "${file}" ไม่เจอ — ต่อไดรฟ์ iDuckyShop ก่อน (แคชอยู่ที่ ${SWATCH_CACHE})`);
    await sharp(src).extract({ left: 420, top: 520, width: 760, height: 760 }).resize(560).jpeg({ quality: 92 }).toFile(cached);
  }
  return `data:image/jpeg;base64,${readFileSync(cached).toString("base64")}`;
}

const PHOTO = { x: 210, y: 158, s: 480 };

function fabricArt({ name, en, sub, uri, bullets }) {
  return frame(`
    ${title(`ผ้า${name}`, sub)}
    <clipPath id="ph"><rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.s}" height="${PHOTO.s}" rx="24"/></clipPath>
    <rect x="${PHOTO.x + 5}" y="${PHOTO.y + 8}" width="${PHOTO.s}" height="${PHOTO.s}" rx="24" fill="#0f172a" opacity="0.08"/>
    <image href="${uri}" x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.s}" height="${PHOTO.s}"
      preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/>
    <rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.s}" height="${PHOTO.s}" rx="24" fill="none" stroke="#e2e8f0" stroke-width="3"/>
    <!-- ป้ายชื่อเนื้อผ้าคาบกลางภาพ — ปุ่ม/การ์ดครอปกลาง ต้องเห็นว่าเนื้อไหน ([[iducky-option-thumb-crop]]) -->
    <rect x="${W / 2 - 155}" y="${536}" width="310" height="58" rx="29" fill="#ffffff" opacity="0.95" stroke="#e2e8f0" stroke-width="2"/>
    <text x="${W / 2}" y="${567}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">${name}</text>
    <text x="${W / 2}" y="${PHOTO.y + PHOTO.s + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#94a3b8">ภาพถ่ายผ้าตัวอย่างจริง (${en}) · ลายพิมพ์เดียวกันทั้ง 2 เนื้อ</text>
    ${bullets.map((b, i) => `
      <circle cx="176" cy="${712 + i * 38 - 7}" r="5" fill="${PINK}"/>
      <text x="196" y="${712 + i * 38}" font-family="${TH}" font-size="24" fill="${INK}">${b}</text>`).join("")}
    ${foot(["เลือกเนื้อผ้าได้ ราคาเท่ากันทุกเนื้อ · งานพิมพ์ซับลิเมชั่นสีอาจคลาดเคลื่อน 5-15%"])}`);
}

const FABRICS = [
  {
    name: "ซาตินซิลค์", en: "Satin Silk", file: "7.Satin Silk",
    sub: "ลายไหมทอละเอียด ผิวลื่นมันวาว พลิ้วไหว",
    bullets: ["เนื้อทอลายไหมละเอียด ผิวลื่น มันวาว", "พลิ้วไหว น้ำหนักเบา ผ้าทิ้งตัวสวย", "ซักง่าย แห้งเร็ว ไม่ต้องรีด"],
  },
  {
    name: "ซาตินพีช", en: "Satin Peach", file: "6.Satin Peach",
    sub: "ผิวเรียบเนียน ลื่นมันวาว ยืดหยุ่นดี",
    bullets: ["เนื้อเรียบเนียน ผิวลื่น มันวาว", "น้ำหนักเบา ทิ้งตัวดี ยืดหยุ่นได้ดี", "ซักง่าย แห้งเร็ว ไม่ต้องรีด"],
  },
];
for (const f of FABRICS) {
  f.uri = await swatchUri(f.file);
  f.out = `fabric-${f.en.toLowerCase().replace(/\s+/g, "-")}-${VER}.jpg`;
  f.buf = await sharp(Buffer.from(fabricArt(f))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${f.out}`, f.buf);
  await sharp(f.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${f.out}`);
  console.log(`🖼  ${OUT}/${f.out}  ${Math.round(f.buf.length / 1024)} KB — ${f.name}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const c of [...SIZES.map((s) => ({ file: s.file, buf: s.buf, ref: s })), ...FABRICS.map((f) => ({ file: f.out, buf: f.buf, ref: f }))]) {
  const key = `products/${PRODUCT_ID}/${c.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, c.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  c.ref.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", c.ref.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const SIZE_DESC = {
  "70x70cm": "ผืนเล็ก ผูกคอ พันผม ผูกกระเป๋า พกง่าย — เริ่มผืนละ ฿250 สั่งเยอะลดถึงผืนละ ฿170",
  "100x100cm": "คลุมไหล่ / คลุมกันแดดได้พอดีตัว — เริ่มผืนละ ฿400 สั่งเยอะลดถึงผืนละ ฿280",
  "140x140cm": "ผืนใหญ่ คลุมได้ทั้งตัว ห่มกันหนาวได้ — เริ่มผืนละ ฿600 สั่งเยอะลดถึงผืนละ ฿540",
};
const FABRIC_DESC = {
  "ซาตินซิลค์": "เนื้อทอลายไหมละเอียด ผิวลื่นมันวาว พลิ้วไหว น้ำหนักเบา ผ้าทิ้งตัวสวย ซักง่าย แห้งเร็วไม่ต้องรีด",
  "ซาตินพีช": "เนื้อเรียบเนียน ผิวลื่นมันวาว น้ำหนักเบา ผ้าทิ้งตัวดี ยืดหยุ่นได้ดี ซักง่าย แห้งเร็วไม่ต้องรีด",
};
const IMG = {
  ...Object.fromEntries(SIZES.map((s) => [s.name, s.url])),
  ...Object.fromEntries(FABRICS.map((f) => [f.name, f.url])),
};

// แก้เฉพาะ 2 กลุ่มนี้ "ที่ตำแหน่งเดิม" — กลุ่มอื่น (สีไหมเย็บชิ้นงาน) ไม่แตะ ([[iducky-option-group-loss-guard]])
let touched = 0;
data.options = (data.options ?? []).map((o) => {
  if (o.label === "ขนาด") {
    touched++;
    return {
      ...o, display: "cards",
      note: "ผืนสี่เหลี่ยมจัตุรัส วัดด้านละ ซม. — เลือกขนาดแล้วราคาต่อผืนเปลี่ยนตามตาราง · ขนาดจริงคลาดเคลื่อนได้ 2-5 ซม. เพราะผ้าแต่ละผืนตัดมาไม่เท่ากันเป๊ะ",
      choices: o.choices.map((c) => ({ ...c, imageSrc: IMG[c.name] ?? c.imageSrc, desc: SIZE_DESC[c.name] ?? c.desc })),
    };
  }
  if (o.label === "ผ้า") {
    touched++;
    return {
      ...o, display: "cards",
      note: "เลือกได้ 2 เนื้อ ราคาเท่ากัน — ทั้งคู่พิมพ์ซับลิเมชั่นเต็มผืน ผิวลื่นมันวาว น้ำหนักเบา ซักง่าย แห้งเร็ว · ภาพในการ์ดถ่ายจากผ้าตัวอย่างจริง ลายพิมพ์เดียวกันทั้งคู่",
      choices: o.choices.map((c) => ({ ...c, imageSrc: IMG[c.name] ?? c.imageSrc, desc: FABRIC_DESC[c.name] ?? c.desc })),
    };
  }
  return o;
});
if (touched !== 2) { console.error(`หากลุ่ม "ขนาด"/"ผ้า" ไม่ครบ (เจอ ${touched}) — ไม่เขียน`); process.exit(1); }
data.savedAt = new Date().toISOString();   // ให้ ?v=savedAt ล้างแคชรูป ([[iducky-image-cache-bust]])

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gSize = got.find((o) => o.label === "ขนาด");
const gFab = got.find((o) => o.label === "ผ้า");
const cells = back.data.pricing?.cells ?? {};
const fails = [
  [got.length === (row.data.options ?? []).length, "จำนวนกลุ่มตัวเลือกเปลี่ยน"],
  ...["ขนาด", "ผ้า", "สีไหมเย็บชิ้นงาน"].map((l) => [got.filter((o) => o.label === l).length === 1, `กลุ่ม "${l}" หาย/ซ้ำ`]),
  [got.find((o) => o.label === "สีไหมเย็บชิ้นงาน")?.choices?.length === 13, "สีไหม 13 สีไม่ครบ"],
  [gSize?.display === "cards" && gFab?.display === "cards", "ยังไม่เป็นการ์ด"],
  // ชื่อตัวเลือกขนาดคือ "คีย์" ของตารางราคา ห้ามเพี้ยน ([[iducky-price-driver-trap]])
  ...SIZES.map((s) => [gSize?.choices?.some((c) => c.name === s.name && c.imageSrc === s.url && c.desc), `ขนาด ${s.name} ไม่ตรง (ชื่อ/ภาพ/คำอธิบาย)`]),
  ...SIZES.map((s) => [Array.isArray(cells[s.name]) && cells[s.name].length === 8, `ตารางราคาไม่มีคีย์ ${s.name}`]),
  ...FABRICS.map((f) => [gFab?.choices?.some((c) => c.name === f.name && c.imageSrc === f.url && c.desc), `ผ้า ${f.name} ไม่ตรง (ชื่อ/ภาพ/คำอธิบาย)`]),
  [gSize?.choices?.every((c) => !c.extra) && gFab?.choices?.every((c) => !c.extra), "มีค่า extra โผล่มา (ราคาต้องมาจากตารางล้วน)"],
  [(back.data.pricing?.driverLabels ?? []).join() === "ขนาด", "แกนตารางราคาเปลี่ยน"],
  [(back.data.priceRates ?? []).every((r) => (r.pricing?.driverLabels ?? []).join() === "ขนาด"), "แกนตารางราคาของเรทเปลี่ยน"],
  [back.data.priceMin === 170 && back.data.priceMax === 600, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "ขนาด" 3 การ์ด + "ผ้า" 2 การ์ด พร้อมภาพ/คำอธิบาย อ่านกลับตรงทุกข้อ · savedAt = ${back.data.savedAt}`);
