#!/usr/bin/env node
/**
 * กระดาษเย็บบน (package-staple-top · /products/กระดาษเย็บบน) — ภาพประกอบกลุ่ม "การตัด" 2 ใบ
 *
 *   node scripts/staple-top-cut-option-art.mjs            (วาดลง .cache/package-staple-top/upload ดูก่อน)
 *   node scripts/staple-top-cut-option-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * เล่าเรื่องเดียวกันทั้ง 2 ใบ 2 ช่อง — ต่างกันแค่ "เส้นตัดวิ่งยังไง":
 *   ช่องซ้าย  แผ่น A3 ก่อนพับ: ใบการ์ดวางเรียงบนแผ่น + เส้นตัดชมพู + เส้นพับกลางใบ
 *             (การ์ดสมมาตรบน-ล่างเพราะพับครึ่ง — หน้า/หลังต้องเป็นทรงเดียวกัน)
 *   ช่องขวา   ของจริงหลังพับครอบปากถุงแล้วเย็บลวด — เห็นว่าขอบการ์ดที่ได้หน้าตายังไง
 *   ไดคัทตามขนาด    เส้นตัดตรงเป็นสี่เหลี่ยม (ฟรี รวมในราคาแล้ว)
 *   ไดคัทตามทรง     เส้นตัดโค้งตามทรงลาย อยู่ในกรอบขนาดใบที่เลือก (+฿20 / แผ่น A3)
 *
 * ที่มาของตัวเลข: products.package-staple-top ใน DB (4 ก.ย. 69)
 *   กลุ่ม "การตัด" 2 ตัวเลือก — "ไดคัทตามขนาด (ฟรี)" ไม่มี extra · "ไดคัทตามทรงที่ต้องการ" extra 20
 *   หน่วยขาย pricing.unit = "แผ่น A3" (แผ่นละ 45) → extra 20 คือต่อแผ่น A3 ไม่ใช่ต่อใบ
 *   กลุ่มนี้ไม่ใช่แกนตารางราคา (driverLabels = ["ขนาดแบบที่ยังไม่พับ"]) จึงเติมได้แค่ imageSrc/desc
 *   ไม่ต้องขยับคีย์ cells (กับดัก [[iducky-price-driver-trap]])
 *
 * + เปลี่ยน display ของกลุ่มเป็น "cards"
 *   ค่าว่าง = ปุ่มเม็ดยา รูปเหลือวงกลม 28px ดูไม่ออกว่าเส้นตัดต่างกันตรงไหน
 *   การ์ดได้รูป 80px เต็มใบ (ไม่ครอป) + มีที่ให้ desc — กลุ่มมี 2 ตัวเลือก ไม่ยาวขึ้นมาก
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "package-staple-top";
const GROUP = "การตัด";
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const CUT = "#e11d48";        // เส้นตัด — ต้องไม่ใช่โทนม่วงของงานพิมพ์ ไม่งั้นจมหาย
const FOLD = "#94a3b8";       // เส้นพับ — เทา ไม่ให้แข่งกับเส้นตัด
const SHEET = "#eef1f5";      // แผ่น A3 เปล่า
const CARD_FRONT = "#6b5aa6"; // ม่วงเข้ม = ด้านหน้าการ์ด (โทนเดียวกับรูปขนาดใบที่มีอยู่)
const CARD_BACK = "#8d7fc0";  // ม่วงกลาง = ด้านหลัง (ครึ่งล่างของแผ่นก่อนพับ)
const BAG = "#d9d0f2";        // ถุงใส + งานพิมพ์ข้างใน

const HEART = await mascotDataUri("heart", 320);

/* ── ทรงการ์ด ───────────────────────────────────────────────────────
 * ใบการ์ดพับครึ่ง: เส้นพับอยู่กลาง ครึ่งบน = หน้า ครึ่งล่าง = หลัง
 * ทรงทั้งสองครึ่ง "ต้องเหมือนกัน" ไม่งั้นพับแล้วขอบไม่ทับกัน — วาดครึ่งเดียวแล้วมิเรอร์
 * half(x0, x1, H2, kind)(fold, sign) = ขอบนอกของครึ่งหนึ่ง (ไม่รวมเส้นพับ)
 *   sign -1 = ครึ่งบน (ไล่ซ้าย→ขวา) · +1 = ครึ่งล่าง
 */
function half(x0, x1, H2, kind) {
  return (fold, sign) => {
    const y = (dy) => fold + sign * dy;
    if (kind === "rect") {
      const r = 10;
      return `M ${x0} ${y(0)} L ${x0} ${y(H2 - r)} Q ${x0} ${y(H2)} ${x0 + r} ${y(H2)}`
        + ` L ${x1 - r} ${y(H2)} Q ${x1} ${y(H2)} ${x1} ${y(H2 - r)} L ${x1} ${y(0)}`;
    }
    // ทรง: ข้างเว้าเล็กน้อย + ขอบนอกเป็นหยัก 3 ลอน (อ่านออกว่า "ไม่ใช่สี่เหลี่ยม" ตั้งแต่รูป 80px)
    const waist = 14;
    const base = H2 * 0.68;             // ระดับที่หยักเริ่ม — ตื้น ๆ พอให้เห็นว่าโค้ง ตัวการ์ดยังเป็นผืนเดียว
    const w3 = (x1 - x0) / 3;
    // ลอนใช้ cubic คุมยอด: จุดคุม y ต้องเลย H2 ไป 4/3 เท่า ยอดจริงถึงแตะ H2 พอดี
    const peak = base + (H2 - base) * (4 / 3);
    const bump = (a, b) => `C ${a + w3 * 0.22} ${y(peak)} ${b - w3 * 0.22} ${y(peak)} ${b} ${y(base)}`;
    return `M ${x0} ${y(0)}`
      + ` C ${x0 + waist} ${y(H2 * 0.16)} ${x0 + waist} ${y(H2 * 0.3)} ${x0} ${y(base)}`
      + ` ${bump(x0, x0 + w3)} ${bump(x0 + w3, x0 + w3 * 2)} ${bump(x0 + w3 * 2, x1)}`
      + ` C ${x1 - waist} ${y(H2 * 0.3)} ${x1 - waist} ${y(H2 * 0.16)} ${x1} ${y(0)}`;
  };
}

/** ครึ่งใบแบบปิดรูป (ต่อเส้นพับกลับมา) — ไว้ fill / clip */
const closed = (h, fold, sign) => `${h(fold, sign)} Z`;

/** ลายที่พิมพ์บนด้านหน้าการ์ด: มาสคอต + คำว่า iducky (ตามการ์ดจริงในรูปสินค้า) */
const frontArt = (cx, top, w, hh) => {
  const mh = hh * 0.5;
  const mw = mh * HEART.ratio;
  return `
  <image href="${HEART.uri}" x="${cx - mw / 2}" y="${top + hh * 0.16}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${cx}" y="${top + hh * 0.85}" font-family="${TH}" font-size="${Math.round(hh * 0.17)}" font-weight="700" text-anchor="middle" fill="#ffffff" opacity="0.95">iducky</text>`;
};

/**
 * รูเย็บลวด 2 รู — อยู่ "ริมนอก" ของแต่ละครึ่ง (ไกลจากเส้นพับ) ตามของจริงในรูป 05-staple-open
 * พับครึ่งแล้วขอบนอกของสองครึ่งมาชนกันพอดี ลวดเย็บจึงทะลุทั้งคู่ที่ตำแหน่งเดียวกัน
 */
const staples = (cx, fold, sign, H2, gap = 62) =>
  [-gap, gap].map((dx) => `
  <rect x="${cx + dx - 13}" y="${fold + sign * H2 * 0.8 - 3}" width="26" height="6" rx="3" fill="#334155" opacity="0.55"/>`).join("");

/** ป้ายเล็ก */
const tag = (cx, y, text, tone = "plain") => {
  const w = text.length * 11.5 + 44;
  const c = tone === "ok" ? OK : tone === "cut" ? CUT : SUB;
  const bg = tone === "ok" ? "#ecfeff" : tone === "cut" ? "#fff1f2" : "#f1f5f9";
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="40" rx="20" fill="${bg}" stroke="${tone === "plain" ? "#cbd5e1" : c}" stroke-width="2"/>
  <text x="${cx}" y="${y + 27}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${c}">${text}</text>`;
};

/** หัวช่องซ้าย/ขวา */
const panelHead = (cx, y, n, text) => `
  <circle cx="${cx - text.length * 6.2 - 18}" cy="${y - 8}" r="15" fill="${OK}"/>
  <text x="${cx - text.length * 6.2 - 18}" y="${y - 1}" font-family="${TH}" font-size="19" font-weight="800" text-anchor="middle" fill="#ffffff">${n}</text>
  <text x="${cx + 12}" y="${y}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${INK}">${text}</text>`;

/* ── พิกัดร่วมของทั้ง 2 ใบ — วางที่เดียวกันเป๊ะ ลูกค้าจึงเทียบเส้นตัดได้ทันที ── */
const AX = 248;              // กึ่งกลางช่องซ้าย (แผ่นก่อนพับ)
const BX = 652;              // กึ่งกลางช่องขวา (ของจริง)
const CARD_W = 288;
const H2 = 112;              // ครึ่งความสูงของใบ (ใบเต็ม 224)
const FOLD_Y = 501;          // เส้นพับของใบกลางแผ่น A3
const SH = { x: 64, y: 330, w: 368, h: 342 };   // แผ่น A3 ในช่องซ้าย
const BAG_TOP = 396;
const BAG_BOT = 672;
const BAG_W = 264;
const CARD_TOP = 372;        // เส้นพับของการ์ดที่พับครอบถุงแล้ว = ขอบบนสุด

/** ช่องซ้าย: แผ่น A3 + ใบกลาง (เส้นตัด+เส้นพับ) + ใบข้างเคียงโดนกรอบตัด บอกว่าเรียงหลายใบต่อแผ่น */
function sheetPanel(kind) {
  const x0 = AX - CARD_W / 2;
  const x1 = AX + CARD_W / 2;
  const h = half(x0, x1, H2, kind);
  const neighbour = (fold) => `
    <path d="${closed(h, fold, -1)}" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <path d="${closed(h, fold, 1)}" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <path d="${h(fold, -1)}" fill="none" stroke="${CUT}" stroke-width="3" stroke-dasharray="10 8" opacity="0.45"/>
    <path d="${h(fold, 1)}" fill="none" stroke="${CUT}" stroke-width="3" stroke-dasharray="10 8" opacity="0.45"/>`;
  return `
  <clipPath id="sheetClip"><rect x="${SH.x}" y="${SH.y}" width="${SH.w}" height="${SH.h}" rx="10"/></clipPath>
  <clipPath id="frontClip"><path d="${closed(h, FOLD_Y, 1)}"/></clipPath>
  <clipPath id="backClip"><path d="${closed(h, FOLD_Y, -1)}"/></clipPath>
  <rect x="${SH.x + 4}" y="${SH.y + 7}" width="${SH.w}" height="${SH.h}" rx="10" fill="#0f172a" opacity="0.08"/>
  <rect x="${SH.x}" y="${SH.y}" width="${SH.w}" height="${SH.h}" rx="10" fill="${SHEET}" stroke="#cbd5e1" stroke-width="2.5"/>
  <g clip-path="url(#sheetClip)">
    ${neighbour(FOLD_Y - 260)}
    ${neighbour(FOLD_Y + 260)}
    <!-- ใบกลาง: ครึ่งล่าง = ด้านหน้า (ลายหงาย) · ครึ่งบน = ด้านหลัง (ลายกลับหัว 180°
         เพราะพับเอาด้านพิมพ์ออกนอก ครึ่งบนไปอยู่หลังซอง — ดูของจริงในรูป 05-staple-open) -->
    <path d="${closed(h, FOLD_Y, -1)}" fill="${CARD_BACK}"/>
    <path d="${closed(h, FOLD_Y, 1)}" fill="${CARD_FRONT}"/>
    <g clip-path="url(#backClip)" transform="rotate(180 ${AX} ${FOLD_Y - H2 / 2})">${frontArt(AX, FOLD_Y - H2, CARD_W, H2)}</g>
    <g clip-path="url(#frontClip)">${frontArt(AX, FOLD_Y, CARD_W, H2)}</g>
    ${staples(AX, FOLD_Y, -1, H2)}
    ${staples(AX, FOLD_Y, 1, H2)}
    <!-- เส้นพับ: เทาเส้นประถี่ ต่างจากเส้นตัดชัดเจน -->
    <line x1="${x0}" y1="${FOLD_Y}" x2="${x1}" y2="${FOLD_Y}" stroke="#ffffff" stroke-width="5" opacity="0.5"/>
    <line x1="${x0}" y1="${FOLD_Y}" x2="${x1}" y2="${FOLD_Y}" stroke="${FOLD}" stroke-width="3" stroke-dasharray="6 6"/>
    <!-- เส้นตัดของใบกลาง วาดทับสุดท้าย ให้เด้งเหนือทุกอย่าง -->
    <path d="${h(FOLD_Y, -1)}" fill="none" stroke="${CUT}" stroke-width="4.5" stroke-dasharray="12 9"/>
    <path d="${h(FOLD_Y, 1)}" fill="none" stroke="${CUT}" stroke-width="4.5" stroke-dasharray="12 9"/>
  </g>
  <text x="${SH.x + 12}" y="${SH.y + 26}" font-family="${TH}" font-size="19" font-weight="600" fill="#94a3b8">แผ่น A3</text>
  <!-- ป้าย "เส้นพับ" เป็นเม็ดขาวคร่อมเส้นพับ — ขอบแผ่นเหลือข้างละ 40px วางนอกใบไม่พอ -->
  <rect x="${AX - 132}" y="${FOLD_Y - 14}" width="80" height="28" rx="14" fill="#ffffff" opacity="0.92"/>
  <text x="${AX - 92}" y="${FOLD_Y + 6}" font-family="${TH}" font-size="17" font-weight="700" text-anchor="middle" fill="${FOLD}">เส้นพับ</text>`;
}

/** ช่องขวา: ถุงใส + พวงกุญแจข้างใน + การ์ดพับครอบปากถุงเย็บลวด (เส้นพับอยู่ขอบบนสุด) */
function packPanel(kind) {
  const bx0 = BX - BAG_W / 2;
  const cx0 = BX - CARD_W / 2;
  const cx1 = BX + CARD_W / 2;
  const h = half(cx0, cx1, H2, kind);
  const mh = 150;
  const mw = mh * HEART.ratio;
  return `
  <clipPath id="packClip"><path d="${closed(h, CARD_TOP, 1)}"/></clipPath>
  <linearGradient id="bagG" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#efe9ff"/><stop offset="1" stop-color="${BAG}"/>
  </linearGradient>
  <!-- ถุงใส -->
  <rect x="${bx0 + 5}" y="${BAG_TOP + 8}" width="${BAG_W}" height="${BAG_BOT - BAG_TOP}" rx="10" fill="#0f172a" opacity="0.08"/>
  <rect x="${bx0}" y="${BAG_TOP}" width="${BAG_W}" height="${BAG_BOT - BAG_TOP}" rx="10" fill="url(#bagG)" stroke="#c4b5fd" stroke-width="2"/>
  <image href="${HEART.uri}" x="${BX - mw / 2}" y="${BAG_BOT - mh - 44}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${BX}" y="${BAG_BOT - 22}" font-family="${TH}" font-size="19" font-weight="700" text-anchor="middle" fill="#7c6bb5" opacity="0.8">iducky</text>
  <!-- แสงสะท้อนพลาสติก บอกว่าเป็นถุงใส -->
  <path d="M ${bx0 + 26} ${BAG_BOT - 6} L ${bx0 + 96} ${BAG_TOP + 6} L ${bx0 + 124} ${BAG_TOP + 6} L ${bx0 + 54} ${BAG_BOT - 6} Z" fill="#ffffff" opacity="0.35"/>
  <!-- การ์ดพับครอบปากถุง: เห็นเฉพาะครึ่งหน้า เส้นพับกลายเป็นขอบบนสุด -->
  <path d="${closed(h, CARD_TOP, 1)}" fill="${CARD_FRONT}"/>
  <g clip-path="url(#packClip)">${frontArt(BX, CARD_TOP, CARD_W, H2)}</g>
  ${staples(BX, CARD_TOP, 1, H2)}
  <path d="${h(CARD_TOP, 1)}" fill="none" stroke="${CUT}" stroke-width="4.5" stroke-dasharray="12 9"/>
  <line x1="${cx0}" y1="${CARD_TOP}" x2="${cx1}" y2="${CARD_TOP}" stroke="${FOLD}" stroke-width="3" stroke-dasharray="6 6"/>
  <text x="${cx1 + 6}" y="${CARD_TOP + 6}" font-family="${TH}" font-size="17" font-weight="600" fill="${FOLD}">พับ</text>`;
}

const card = (title, subtitle, headTag, kind, tagA, tagB, note1, note2) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="126" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${headTag}
  ${panelHead(AX, 246, "1", "แผ่นก่อนพับ")}
  ${panelHead(BX, 246, "2", "พับครอบถุงแล้ว")}
  ${sheetPanel(kind)}
  ${packPanel(kind)}
  ${tag(AX, 706, tagA, "cut")}
  ${tag(BX, 706, tagB, "ok")}
  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>
  <text x="${W / 2}" y="${H - 38}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>
</svg>`;

const sizeArt = () => card(
  "ไดคัทตามขนาด",
  "ตัดตรงเป็นสี่เหลี่ยม ตามขนาดใบที่เลือก",
  tag(W / 2, 158, "ฟรี — รวมอยู่ในราคาแผ่น A3 แล้ว", "ok"),
  "rect",
  "เส้นตัดตรง 4 ด้าน",
  "ขอบเรียบ พับครอบพอดี",
  "เลือกได้ 5 ขนาด หรือกำหนดขนาดเอง (ระบุ ก. × ส.)",
  "ใบสี่เหลี่ยมเรียงชิดกันได้ จึงได้จำนวนใบต่อแผ่นเยอะที่สุด",
);

const shapeArt = () => card(
  "ไดคัทตามทรงที่ต้องการ",
  "เส้นตัดวิ่งตามทรงลาย ไม่ใช่สี่เหลี่ยม",
  tag(W / 2, 158, "ค่าไดคัท 20 บาท ต่อแผ่น A3 (ไม่ใช่ต่อใบ)", "cut"),
  "shape",
  "เส้นตัดโค้งตามทรง",
  "ได้ขอบเป็นทรงลาย",
  "ส่งไฟล์ลายที่มีเส้นตัด (cut line) มาให้ — ทรงอยู่ในกรอบขนาดใบที่เลือก",
  "เส้นพับกลางใบยังต้องตรง หน้า-หลังเป็นทรงเดียวกัน ถึงพับครอบได้พอดี",
);

// ── วาดลงแคช ─────────────────────────────────────────────────────────
const DESC = {
  "ไดคัทตามขนาด (ฟรี)": "ตัดตรงเป็นสี่เหลี่ยมตามขนาดใบที่เลือก — ขอบเรียบทั้ง 4 ด้าน",
  "ไดคัทตามทรงที่ต้องการ": "เส้นตัดวิ่งตามทรงลาย (ส่งไฟล์ที่มี cut line มาให้) · ค่าไดคัทคิดต่อแผ่น A3 ไม่ใช่ต่อใบ",
};
const JOBS = [
  { choice: "ไดคัทตามขนาด (ฟรี)", file: `cut-size-${VER}.jpg`, svg: sizeArt() },
  { choice: "ไดคัทตามทรงที่ต้องการ", file: `cut-shape-${VER}.jpg`, svg: shapeArt() },
];
for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน DB ───────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${PRODUCT_ID}/`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const g = (data.options ?? []).find((o) => o.label === GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
if (g.choices?.length !== JOBS.length) { console.error("จำนวนตัวเลือกไม่ตรงที่วาดไว้", g.choices?.length); process.exit(1); }
for (const j of JOBS) {
  const c = g.choices.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
  c.desc = DESC[j.choice];
}
g.display = "cards";   // ปุ่มเม็ดยาโชว์รูปแค่วงกลม 28px — เส้นตัดที่ต่างกันดูไม่ออก

data.savedAt = new Date().toISOString();   // ?v=savedAt กันเบราว์เซอร์ค้างรูปเก่า
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ──────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
for (const j of JOBS) {
  const c = bg?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
  if (c.desc !== DESC[j.choice]) { console.error("desc ไม่ตรง", j.choice); process.exit(1); }
}
if (bg.display !== "cards") { console.error("display ไม่เปลี่ยน"); process.exit(1); }
// ค่าราคาในกลุ่มต้องไม่หายไปกับการเขียนรอบนี้
if (bg.choices.find((c) => c.name === "ไดคัทตามทรงที่ต้องการ")?.extra !== 20) { console.error("extra 20 หาย"); process.exit(1); }
const order = (a) => a.map((o) => o.label).join("│");
if (order(back.data.options) !== order(row.data.options)) { console.error("ลำดับกลุ่มเพี้ยน"); process.exit(1); }
const cellKeys = (d) => Object.keys(d.pricing?.cells ?? {}).sort().join("│");
if (cellKeys(back.data) !== cellKeys(row.data)) { console.error("คีย์ตารางราคาขยับ"); process.exit(1); }
console.log(`✓ ภาพ ${JOBS.length} ใบ + display cards + desc ครบ · savedAt =`, back.data.savedAt);
