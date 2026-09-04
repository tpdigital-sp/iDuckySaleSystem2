#!/usr/bin/env node
/**
 * แผ่นป้ายอะคริลิคใส่ พรบ. (prb-acrylic) — ผู้ใช้สั่ง 4 ก.ย. 69
 *
 *   node scripts/prb-acrylic-size-screen.mjs            (วาดภาพลง .cache/prb-acrylic/upload ดูก่อน)
 *   node scripts/prb-acrylic-size-screen.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ทำ 2 อย่าง:
 * 1. เพิ่มกลุ่ม "ขนาด" เป็นกลุ่มแรก แบบการ์ด (display:"cards") — ตัวเลือกเดียว "12 × 13 ซม." ไม่บวกราคา
 * 2. กลุ่ม "สกรีนกี่ด้าน" — เปลี่ยนชื่อตัวเลือกเป็น "สกรีน 1 ด้าน" / "สกรีน 2 ด้าน" (+30 เท่าเดิม)
 *    ทำเป็นการ์ด + ภาพวาดประจำตัวเลือก
 *
 * ── ขนาดมาจากไหน ───────────────────────────────────────────────────
 * ใบสเปคร้าน `10_อะคริลิค/งานอะคริลิคทั่วไป/11_แผ่นป้ายอคลใส่พรบ/P-nพรบ-01.jpg` เขียนว่า:
 *   แผ่นอะคริลิคใส หนา 1.5 mm (ประกบกัน 2 ชิ้น) · **ขนาด 12 x 13cm** ·
 *   เรทส่งขั้นต่ำ 5 ชิ้นต่อ 1 ลาย · ใส่ป้าย พรบ. หรือป้ายอื่นๆ · จุ๊บสูญญากาศ 4 มุม · กาวสองหน้า 3M
 * เทมเพลตอาร์ตเวิร์กจริง `/Volumes/iDuckyShop/All Template/1.0 งานอะคริลิค/4.พรบ/พรบ.ai`
 * วัดด้วย `node scripts/ai-template-bbox.mjs` ได้ **362.835 × 342.992 pt = 128.0 × 121.0 มม.**
 * (+ วงกลม 8.5 มม. = รูจุ๊บสูญญากาศ 4 มุม) → แผ่น **แนวนอน กว้าง ~13 × สูง ~12 ซม.**
 * ⚠️ ใบสเปคเขียน "12 x 13" สลับกับที่วัดได้ (เป็น สูง × กว้าง) — ชื่อตัวเลือกใช้ตามใบสเปค
 *    ส่วนภาพวาดสัดส่วนตามเทมเพลตจริง และเขียนกำกับไว้ในภาพว่ากว้าง 12.8 × สูง 12.1 ซม.
 *
 * ── ทำไม 1 ด้านยังมองเห็นลายจากอีกฝั่ง ───────────────────────────────
 * แผ่นเป็นอะคริลิค "ใส" ประกบ 2 ชิ้น — รูปงานจริง DSC06899.jpg ถ่ายจากด้านหลัง
 * เห็นคำว่า Bon voyage กลับด้าน = สกรีน 1 ด้าน มองทะลุจากอีกฝั่งได้ แต่ลายกลับซ้าย-ขวา
 * สกรีน 2 ด้าน (+30) = พิมพ์แยกสองแผ่น อ่านถูกด้านทั้งในรถและนอกรถ · คนละลายก็ได้
 *
 * กลุ่ม "สกรีนกี่ด้าน" **ไม่ใช่แกนตารางราคา** (pricing.driverLabels = [] · cells คีย์ "")
 * เปลี่ยนชื่อตัวเลือกจึงไม่กระทบราคา — สคริปต์เก็บ pricing เดิมไว้เทียบตอนอ่านกลับ
 * ([[iducky-price-driver-trap]] · สินค้านี้ไม่มี rules ผูกชื่อตัวเลือกไว้)
 *
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ (พิกัด 300–600) — ป้าย/วงเลขจึงวางไว้กลางภาพ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * รันซ้ำได้: เจอกลุ่มเดิม = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("peace", 420);

const PRODUCT_ID = "prb-acrylic";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "12 × 13 ซม.";
const SIZE_DESC = "ขนาดเดียว · แผ่นแนวนอน (กว้าง 13 × สูง 12 ซม.) · อะคริลิคใส 1.5 มม. ประกบ 2 ชิ้น · จุ๊บสูญญากาศ 4 มุม + กาวสองหน้า 3M";

const SCREEN_GROUP = "สกรีนกี่ด้าน";
const ONE_SIDE = "สกรีน 1 ด้าน";
const TWO_SIDE = "สกรีน 2 ด้าน";
const TWO_EXTRA = 30; // ของเดิมในระบบ "2 ด้าน (ในรถ&นอกรถ)" +30 — คงราคาเดิม
const ONE_DESC = "พิมพ์ลายแผ่นเดียว · มองจากอีกฝั่งเห็นลายกลับซ้าย-ขวา (แผ่นใส)";
const TWO_DESC = "พิมพ์ทั้งสองแผ่น อ่านถูกด้านทั้งในรถและนอกรถ · ใช้คนละลายได้";

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

/** ขนาดชิ้นงานจริงจากเทมเพลต พรบ.ai (มม.) */
const PLATE_W_CM = 12.8, PLATE_H_CM = 12.1;
const CUP_D_CM = 0.85; // รูจุ๊บสูญญากาศ 8.5 มม.

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลขบนพื้นขาว */
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

const star = (cx, cy, r, fill, op = 1) => {
  const p = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${p}" fill="${fill}" opacity="${op}"/>`;
};
const heart = (cx, cy, s, fill, op = 1) => `<path d="M ${cx} ${cy + s * 0.75}
  C ${cx - s * 1.2} ${cy - s * 0.1} ${cx - s * 0.5} ${cy - s * 0.95} ${cx} ${cy - s * 0.25}
  C ${cx + s * 0.5} ${cy - s * 0.95} ${cx + s * 1.2} ${cy - s * 0.1} ${cx} ${cy + s * 0.75} Z"
  fill="${fill}" opacity="${op}"/>`;

/**
 * เอกสาร พรบ./ป้ายภาษี ที่สอดอยู่ระหว่างแผ่นอะคริลิค 2 ชิ้น
 * (ป้ายจริงเป็นกระดาษพื้นชมพู-ฟ้ามีลายน้ำ + แถบหัวสีน้ำเงิน + บาร์โค้ดข้าง)
 */
function paper(px, py, pw, ph) {
  const rows = Math.max(3, Math.round(ph / 26));
  return `
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="4" fill="#fdf2f6" stroke="#e6c9d6" stroke-width="1.5"/>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph * 0.17}" fill="#3b6fd4" opacity="0.85"/>
    <rect x="${px + pw * 0.06}" y="${py + ph * 0.24}" width="${pw * 0.46}" height="${ph * 0.34}" rx="3" fill="#f7d7e4"/>
    ${Array.from({ length: 5 }, (_, i) => `<rect x="${px + pw * 0.09}" y="${py + ph * (0.29 + i * 0.055)}" width="${pw * 0.4}" height="2.4" fill="#d79ab5" opacity="0.7"/>`).join("")}
    ${Array.from({ length: rows }, (_, i) => `<rect x="${px + pw * 0.57}" y="${py + ph * 0.26 + i * 13}" width="${pw * 0.35 * (i % 3 === 0 ? 1 : 0.72)}" height="3" rx="1.5" fill="#c3b6bd" opacity="${py + ph * 0.26 + i * 13 < py + ph - 18 ? 0.8 : 0}"/>`).join("")}
    <g>${Array.from({ length: 16 }, (_, i) => `<rect x="${px + pw * 0.07 + i * (pw * 0.036)}" y="${py + ph * 0.72}" width="${i % 3 === 0 ? 3.4 : 1.7}" height="${ph * 0.14}" fill="#8b8b93"/>`).join("")}</g>
    <text x="${px + pw / 2}" y="${py + ph * 0.135}" font-family="${TH}" font-size="${Math.round(ph * 0.085)}" font-weight="700" text-anchor="middle" fill="#ffffff">พ.ร.บ. / ป้ายภาษี</text>`;
}

/**
 * แผ่นป้ายอะคริลิคใส 1 แผ่น (มองตรง ๆ)
 *   art: "print" ลายอ่านถูกด้าน · "mirror" ลายกลับซ้าย-ขวา (มองทะลุแผ่นใสจากอีกฝั่ง) · "none" ใสเปล่า
 */
function plate(x, y, cm, { art = "print", mascot = true, label = "", alt = false } = {}) {
  const w = PLATE_W_CM * cm, h = PLATE_H_CM * cm;
  const r = 0.35 * cm;                     // มุมโค้ง ~3.5 มม.
  const cupR = (CUP_D_CM / 2) * cm;
  const inset = 0.95 * cm;                 // ระยะกรอบลายจากขอบแผ่น
  const band = 0.85 * cm;                  // ความกว้างแถบลายรอบขอบ
  const px = x + inset + band * 0.35, py = y + inset + band * 0.35;
  const pw = w - (inset + band * 0.35) * 2, ph = h - (inset + band * 0.35) * 2;
  const uid = `${Math.round(x)}_${Math.round(y)}_${art}${alt ? "_alt" : ""}`;
  const cups = [[x + inset * 0.62, y + inset * 0.62], [x + w - inset * 0.62, y + inset * 0.62],
                [x + inset * 0.62, y + h - inset * 0.62], [x + w - inset * 0.62, y + h - inset * 0.62]];

  const mirrored = art === "mirror";
  const op = mirrored ? 0.55 : 1;          // มองทะลุแผ่นใส = ลายจางลงเล็กน้อย
  const motifs = [
    [0.16, 0.055, "s", 0.36], [0.34, 0.045, "h", 0.3], [0.5, 0.06, "d", 0.16],
    [0.66, 0.045, "s", 0.32], [0.84, 0.055, "h", 0.28],
    [0.16, 0.945, "h", 0.3], [0.34, 0.955, "s", 0.34], [0.5, 0.94, "d", 0.16],
    [0.66, 0.955, "h", 0.28], [0.84, 0.945, "s", 0.32],
    [0.055, 0.24, "s", 0.32], [0.05, 0.5, "h", 0.28], [0.06, 0.76, "d", 0.16],
    [0.945, 0.24, "h", 0.28], [0.95, 0.5, "s", 0.34], [0.94, 0.76, "d", 0.16],
  ];
  const COLORS = alt ? ["#7fd0ea", "#ffffff", "#ffd166", "#ff9ec2"] : ["#ffd166", "#ff9ec2", "#7fd0ea", "#ffffff"];
  const artLayer = art === "none" ? "" : `
    <rect x="${x + inset}" y="${y + inset}" width="${w - inset * 2}" height="${h - inset * 2}" rx="${r * 0.7}"
      fill="none" stroke="url(#printBand${uid})" stroke-width="${band}" opacity="${op}"/>
    ${motifs.map(([fx, fy, k, s], i) => {
      const mx = x + inset + (w - inset * 2) * fx, my = y + inset + (h - inset * 2) * fy, ss = s * cm, c = COLORS[i % COLORS.length];
      return k === "s" ? star(mx, my, ss, c, 0.92 * op) : k === "h" ? heart(mx, my, ss, c, 0.9 * op)
        : `<circle cx="${mx}" cy="${my}" r="${ss}" fill="${c}" opacity="${0.85 * op}"/>`;
    }).join("")}`;

  const scriptText = `
    <text x="${x + w / 2}" y="${y + h - inset * 0.52}" font-family="${TH}" font-size="${0.62 * cm}"
      font-weight="700" text-anchor="middle" fill="#ffffff" opacity="${op}"
      style="paint-order:stroke" stroke="#f08fb4" stroke-width="${0.06 * cm}">Bon voyage</text>`;

  let duck = "";
  if (mascot && art !== "none") {
    const dh = 2.3 * cm, dw = dh * MASCOT.ratio;
    const dx = alt ? x + inset - 0.25 * cm : x + w - inset - dw + 0.25 * cm;
    duck = `<image href="${MASCOT.uri}" x="${dx}" y="${y + h - inset - dh + 0.2 * cm}"
      width="${dw}" height="${dh}" opacity="${op}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  return `
  <defs>
    <linearGradient id="printBand${uid}" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#ffc3dc"/><stop offset="0.45" stop-color="#bfe3fb"/><stop offset="1" stop-color="#77cfe8"/>
    </linearGradient>
    <linearGradient id="acryl${uid}" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#f4fbff"/><stop offset="1" stop-color="#e4f1f7"/>
    </linearGradient>
    <clipPath id="clip${uid}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  </defs>
  <!-- เงาใต้แผ่น -->
  <rect x="${x + 5}" y="${y + 10}" width="${w}" height="${h}" rx="${r}" fill="#0f172a" opacity="0.07"/>
  <!-- เนื้ออะคริลิคใส -->
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#acryl${uid})" stroke="#a9cbd8" stroke-width="2.5"/>
  <!-- เอกสาร พรบ. ที่สอดอยู่ข้างใน -->
  ${paper(px, py, pw, ph)}
  <g clip-path="url(#clip${uid})" ${mirrored ? `transform="translate(${2 * x + w} 0) scale(-1 1)"` : ""}>
    ${artLayer}${scriptText}${duck}
  </g>
  <!-- จุ๊บสูญญากาศ 4 มุม -->
  ${cups.map(([cx, cy]) => `
    <circle cx="${cx}" cy="${cy}" r="${cupR}" fill="#ffffff" opacity="0.55"/>
    <circle cx="${cx}" cy="${cy}" r="${cupR}" fill="none" stroke="#9fc3d1" stroke-width="1.8"/>
    <circle cx="${cx}" cy="${cy}" r="${cupR * 0.45}" fill="none" stroke="#9fc3d1" stroke-width="1.4" opacity="0.8"/>`).join("")}
  <!-- แสงสะท้อนผิวใส -->
  <g clip-path="url(#clip${uid})">
    <path d="M ${x - 0.3 * cm} ${y + h} L ${x + 1.9 * cm} ${y - 0.3 * cm} L ${x + 3.0 * cm} ${y - 0.3 * cm} L ${x + 0.8 * cm} ${y + h} Z" fill="#ffffff" opacity="0.16"/>
  </g>
  ${label ? `<text x="${x + w / 2}" y="${y - 22}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>` : ""}`;
}

const frame = (title, sub) => `
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>`;

// ── ภาพกลุ่ม "ขนาด" ──────────────────────────────────────────────────
function sizeArt() {
  const cm = 34;                                   // 1 ซม. = 34 px
  const w = PLATE_W_CM * cm, h = PLATE_H_CM * cm;  // 435.2 × 411.4
  const x = (W - w) / 2, y = 222;
  const B = y + h;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${frame("ขนาด 12 × 13 ซม.", "แผ่นป้ายอะคริลิคใส่ พรบ. — มีขนาดเดียว")}
  ${plate(x, y, cm, { art: "print" })}

  <!-- ป้ายขนาดกลางภาพ (ให้ตกในกรอบครอปปุ่มตัวเลือก 300–600) -->
  <rect x="${W / 2 - 108}" y="418" width="216" height="52" rx="26" fill="#ecfeff" stroke="${OK}" stroke-width="2.5" opacity="0.97"/>
  <text x="${W / 2}" y="454" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${OK}">12 × 13 ซม.</text>

  ${dim(x, B + 34, x + w, B + 34, "กว้าง 12.8 ซม.")}
  ${dim(x - 48, y, x - 48, B, "สูง 12.1 ซม.")}

  <text x="${W / 2}" y="${H - 100}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">อะคริลิคใส หนา 1.5 มม. ประกบกัน 2 ชิ้น · สอดป้าย พรบ. หรือป้ายอื่น ๆ เข้าไปได้</text>
  <text x="${W / 2}" y="${H - 68}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">จุ๊บสูญญากาศ 4 มุม + กาวสองหน้า 3M ติดกระจกรถได้เลย</text>
  <text x="${W / 2}" y="${H - 36}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#94a3b8">ขนาดตามเทมเพลตร้าน 12.8 × 12.1 ซม. (ใบสเปคเขียน 12 × 13 ซม.)</text>
</svg>`;
}

// ── ภาพกลุ่ม "สกรีนกี่ด้าน" — เทียบ 2 ฝั่ง ในรถ / นอกรถ ─────────────────
function screenArt(sides) {
  const cm = 21.5;                                  // แผ่นเล็กลง วาง 2 ใบเทียบกัน
  const w = PLATE_W_CM * cm, h = PLATE_H_CM * cm;   // 262.4 × 248.1
  const y = 352;
  const xL = 38, xR = W - 38 - w;
  const two = sides === 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${frame(two ? TWO_SIDE : ONE_SIDE, two ? "พิมพ์ลายทั้งสองแผ่น — เห็นลายถูกด้านทั้งในรถและนอกรถ" : "พิมพ์ลายแผ่นเดียว — อีกฝั่งมองทะลุแผ่นใสเห็นลายกลับด้าน")}

  ${plate(xL, y, cm, { art: "print", label: "มองจากในรถ" })}
  ${plate(xR, y, cm, { art: two ? "print" : "mirror", alt: two, label: "มองจากนอกรถ" })}

  <!-- วงเลขกลางภาพ = สิ่งที่ปุ่มตัวเลือกครอปเห็น -->
  <circle cx="${W / 2}" cy="${y + h / 2}" r="82" fill="#ffffff" opacity="0.97"/>
  <circle cx="${W / 2}" cy="${y + h / 2}" r="82" fill="#ecfeff" stroke="${OK}" stroke-width="4"/>
  <text x="${W / 2}" y="${y + h / 2 - 6}" font-family="${TH}" font-size="62" font-weight="700" text-anchor="middle" fill="${OK}">${sides}</text>
  <text x="${W / 2}" y="${y + h / 2 + 38}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${OK}">ด้าน</text>

  <!-- ป้ายกำกับใต้แผ่น -->
  <text x="${xL + w / 2}" y="${y + h + 44}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ลายที่พิมพ์</text>
  <text x="${xR + w / 2}" y="${y + h + 44}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${two ? SUB : "#f97316"}">${two ? "ลายที่พิมพ์ (คนละลายได้)" : "ลายเดิมกลับซ้าย-ขวา"}</text>

  <text x="${W / 2}" y="${H - 100}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${two ? `พิมพ์แยกทั้งแผ่นหน้าและแผ่นหลัง อ่านถูกด้านทั้งสองฝั่ง · บวกเพิ่ม ${TWO_EXTRA} บาท/ชิ้น` : "พิมพ์ลายลงแผ่นเดียว · ราคาปกติ ไม่บวกเพิ่ม"}</text>
  <text x="${W / 2}" y="${H - 68}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${two ? "ใช้ลายเดียวกันทั้งสองด้าน หรือแยกลายในรถ/นอกรถ ก็ได้" : "แผ่นเป็นอะคริลิคใส จึงมองทะลุเห็นลายจากอีกฝั่ง แต่ภาพจะกลับซ้าย-ขวา"}</text>
  <text x="${W / 2}" y="${H - 36}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#94a3b8">งานพิมพ์ UV บนอะคริลิคใส · ลายในภาพเป็นตัวอย่าง</text>
</svg>`;
}

// ── วาดทุกภาพ + ครอปกลางไว้เช็คหน้าตาปุ่ม ─────────────────────────────
const jpeg = (svg) => sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

const files = {};
files[`size-12x13-${VER}.jpg`] = await jpeg(sizeArt());
files[`screen-1side-${VER}.jpg`] = await jpeg(screenArt(1));
files[`screen-2side-${VER}.jpg`] = await jpeg(screenArt(2));

for (const [f, buf] of Object.entries(files)) {
  writeFileSync(`${OUT}/${f}`, buf);
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${f}`);
  console.log(`🖼  ${OUT}/${f}  ${Math.round(buf.length / 1024)} KB  (+ _thumb-${f} = กรอบที่ปุ่มตัวเลือกเห็นจริง)`);
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
const priceBefore = JSON.stringify({ pricing: data.pricing, priceRates: data.priceRates });

// 1) กลุ่ม "ขนาด" การ์ด — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกเป็นกลุ่มแรก
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: urlOf[`size-12x13-${VER}.jpg`] }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.splice(0, 0, sizeGroup);

// 2) "สกรีนกี่ด้าน" — ชื่อตัวเลือกใหม่ + การ์ด + ภาพ (คง extra 30 ของ 2 ด้าน)
const screenOpt = options.find((o) => o.label === SCREEN_GROUP);
if (!screenOpt) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP}"`); process.exit(1); }
screenOpt.display = "cards";
screenOpt.choices = [
  { name: ONE_SIDE, desc: ONE_DESC, imageSrc: urlOf[`screen-1side-${VER}.jpg`] },
  { name: TWO_SIDE, desc: TWO_DESC, extra: TWO_EXTRA, imageSrc: urlOf[`screen-2side-${VER}.jpg`] },
];

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const b = back.data.options;
const bSize = b.find((o) => o.label === SIZE_GROUP);
const bScreen = b.find((o) => o.label === SCREEN_GROUP);
const priceAfter = JSON.stringify({ pricing: back.data.pricing, priceRates: back.data.priceRates });
const bad =
  b[0]?.label !== SIZE_GROUP ||
  bSize?.display !== "cards" || bSize?.choices?.length !== 1 ||
  bSize?.choices?.[0]?.name !== SIZE_CHOICE || bSize?.choices?.[0]?.desc !== SIZE_DESC ||
  bSize?.choices?.[0]?.imageSrc !== urlOf[`size-12x13-${VER}.jpg`] ||
  bScreen?.display !== "cards" || bScreen?.choices?.length !== 2 ||
  bScreen?.choices?.[0]?.name !== ONE_SIDE || bScreen?.choices?.[0]?.imageSrc !== urlOf[`screen-1side-${VER}.jpg`] ||
  bScreen?.choices?.[1]?.name !== TWO_SIDE || bScreen?.choices?.[1]?.extra !== TWO_EXTRA ||
  bScreen?.choices?.[1]?.imageSrc !== urlOf[`screen-2side-${VER}.jpg`] ||
  priceAfter !== priceBefore;
if (bad) {
  console.error("อ่านกลับไม่ตรง!", JSON.stringify(b, null, 1));
  if (priceAfter !== priceBefore) console.error("⚠️ ราคาเปลี่ยน!\nก่อน", priceBefore, "\nหลัง", priceAfter);
  process.exit(1);
}
console.log(`✓ ขนาด(การ์ด 12 × 13 ซม.) + ${ONE_SIDE}/${TWO_SIDE}(+${TWO_EXTRA}) การ์ด+ภาพ อ่านกลับตรง · ราคาเท่าเดิมเป๊ะ · savedAt =`, back.data.savedAt);
