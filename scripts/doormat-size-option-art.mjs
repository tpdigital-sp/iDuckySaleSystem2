#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่ม "ขนาด" ของ DOORMAT / พรมเช็ดเท้า
 * (doormat · /products/DOORMAT-พรมเช็ดเท้า)
 *
 *   node scripts/doormat-size-option-art.mjs           (วาดภาพ + ครอปกลางลง .cache/doormat/upload)
 *   node scripts/doormat-size-option-art.mjs --write   (+ อัปโหลด storage + ตั้ง imageSrc/desc + display cards + อ่านกลับเทียบ)
 *
 * 7 ตัวเลือกจาก DB (ห้ามแก้ชื่อ — เป็นแกนตารางราคา driverLabels ["ขนาด"]):
 *   40x60cm · 50x80cm · 60x90cm · ทรงกลม 60/80/100/120cm
 *
 * ตามใบสเปค 40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/18_ผ้าขนหนู…พรมเช็ดเท้า…/P-nผ้ารองจาน+พรม-01.jpg
 *   ผ้าขนกำมะหยี่ ขนนุ่ม · ใต้พรมมีแผ่นกันลื่น + เย็บริมขอบ · พิมพ์ซับลิเมชั่นเต็มผืน
 *   สี่เหลี่ยมวางแนวนอน (ด้านยาวคือเลขหลัง: 40×60 = สูง 40 กว้าง 60)
 *
 * ดีไซน์: ทุกใบ "สเกลเดียวกัน" (1 ซม. = 4 px) → กลม 120 เต็มกรอบ / สี่เหลี่ยม 40×60 เหลือขอบขาวเยอะ
 *   ⚠️ ปุ่ม/การ์ดตัวเลือกครอป "กลางภาพ" (พิกัด 300–600 ของ 900×900) → ป้ายเลขขนาดตัวใหญ่ต้องอยู่ที่ y≈555
 *      แถบเทียบขนาด 7 แบบด้านล่าง + ลูกศรวัด = เห็นเต็ม ๆ ตอนภาพเด้งขึ้นแกลเลอรี
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const PRODUCT_ID = "doormat";
const SIZE_GROUP = "ขนาด";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/doormat/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลจริงของทุกใบ — 1 ซม. = 4 px (กลม 120 ซม. = 480 px) */
const CM = 4.4;
const CX = W / 2;
/** จุดกึ่งกลางผืนพรม — ดันขึ้นจากกลางภาพ เว้นที่ลูกศรวัด + แถบเทียบขนาด */
const CY = 412;
/** ป้ายเลขขนาด — y คงที่ทุกใบ ให้ตกในกรอบครอปกลาง 300–600 เสมอ */
const TAG_Y = 555;
/** ลูกศรวัดด้านกว้าง — y คงที่ ใต้ผืนใหญ่สุด (กลม 120 ก้นอยู่ที่ 660) */
const DIM_Y = 708;
/** แถบเทียบขนาด — เส้นพื้นที่ชิ้นทุกอันยืนเสมอกัน */
const STRIP_Y = 798;

/** ขนาดจาก DB — key `choice` ต้องตรงชื่อตัวเลือกเป๊ะ ๆ (w = ด้านกว้าง, h = ด้านลึก) */
const SIZES = [
  {
    choice: "40x60cm",
    file: "size-40x60",
    shape: "rect", w: 60, h: 40,
    title: "สี่เหลี่ยม 40 × 60 ซม.", tag: "40×60", strip: "40×60",
    use: "ไซซ์เล็กสุด — หน้าห้องน้ำ หน้าห้องนอน",
    desc: "ผืนสี่เหลี่ยม 40 × 60 ซม. · ไซซ์เล็กสุด ราคาถูกที่สุด เหมาะหน้าห้องน้ำ/หน้าห้องนอน",
  },
  {
    choice: "50x80cm",
    file: "size-50x80",
    shape: "rect", w: 80, h: 50,
    title: "สี่เหลี่ยม 50 × 80 ซม.", tag: "50×80", strip: "50×80",
    use: "ไซซ์กลาง — หน้าประตูบ้าน ข้างเตียง",
    desc: "ผืนสี่เหลี่ยม 50 × 80 ซม. · ไซซ์ยอดนิยม วางหน้าประตูบ้านหรือข้างเตียงได้พอดี",
  },
  {
    choice: "60x90cm",
    file: "size-60x90",
    shape: "rect", w: 90, h: 60,
    title: "สี่เหลี่ยม 60 × 90 ซม.", tag: "60×90", strip: "60×90",
    use: "สี่เหลี่ยมใหญ่สุด — หน้าร้าน คาเฟ่",
    desc: "ผืนสี่เหลี่ยม 60 × 90 ซม. · สี่เหลี่ยมใหญ่สุด ใส่ลายเต็ม ๆ ได้ เหมาะหน้าร้าน/คาเฟ่",
  },
  {
    choice: "ทรงกลม 60cm",
    file: "size-round-60",
    shape: "round", w: 60, h: 60,
    title: "ทรงกลม ⌀ 60 ซม.", tag: "⌀ 60", strip: "⌀60",
    use: "กลมเล็ก — มุมเก้าอี้ ข้างเตียง",
    desc: "ทรงกลมเส้นผ่านศูนย์กลาง 60 ซม. · กลมเล็กสุด วางมุมเก้าอี้/ข้างเตียง ลายวงกลมน่ารัก",
  },
  {
    choice: "ทรงกลม 80cm",
    file: "size-round-80",
    shape: "round", w: 80, h: 80,
    title: "ทรงกลม ⌀ 80 ซม.", tag: "⌀ 80", strip: "⌀80",
    use: "กลมกลาง — หน้าประตู มุมแต่งห้อง",
    desc: "ทรงกลมเส้นผ่านศูนย์กลาง 80 ซม. · ไซซ์กลม ยอดนิยม วางหน้าประตูหรือมุมแต่งห้อง",
  },
  {
    choice: "ทรงกลม 100cm",
    file: "size-round-100",
    shape: "round", w: 100, h: 100,
    title: "ทรงกลม ⌀ 100 ซม.", tag: "⌀ 100", strip: "⌀100",
    use: "กลมใหญ่ — ปูใต้โต๊ะกลาง นั่งเล่นได้",
    desc: "ทรงกลมเส้นผ่านศูนย์กลาง 100 ซม. · ผืนใหญ่ ปูใต้โต๊ะกลางหรือนั่งเล่นได้",
  },
  {
    choice: "ทรงกลม 120cm",
    file: "size-round-120",
    shape: "round", w: 120, h: 120,
    title: "ทรงกลม ⌀ 120 ซม.", tag: "⌀ 120", strip: "⌀120",
    use: "ใหญ่สุดทุกแบบ — พรมกลางห้อง",
    desc: "ทรงกลมเส้นผ่านศูนย์กลาง 120 ซม. · ใหญ่สุดในรุ่นนี้ ใช้เป็นพรมกลางห้อง/มุมถ่ายรูป",
  },
];

/** ลูกศรวัดแนวนอน — ขีดปลายสองข้าง + ป้ายตัวเลขบนเส้น */
const dimH = (x1, x2, y, label) => {
  const lw = label.length * 13 + 26;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${SUB}" stroke-width="3"/>
    <rect x="${(x1 + x2) / 2 - lw / 2}" y="${y - 19}" width="${lw}" height="38" rx="9" fill="#ffffff" opacity="0.95"/>
    <text x="${(x1 + x2) / 2}" y="${y + 9}" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** ลูกศรวัดแนวตั้ง — ป้ายคร่อมกลางเส้น */
const dimV = (x, y1, y2, label) => {
  const lw = label.length * 13 + 20;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
    <rect x="${x - lw / 2}" y="${(y1 + y2) / 2 - 19}" width="${lw}" height="38" rx="9" fill="#ffffff" opacity="0.95"/>
    <text x="${x}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/**
 * ลายพิมพ์ซับลิเมชั่นบนผืนพรม — ท้องฟ้า + ก้อนเมฆ + เนินหญ้า + มาสคอตแทนลายลูกค้า
 * (อ้างงานจริงในใบสเปค: ฟ้า-เมฆครีม-เนินเขียว มีตัวคาแรกเตอร์ยืนบนหญ้า + คำว่า WELCOME)
 */
const printArt = (x0, y0, w, h, clipId) => {
  const gy = y0 + h * 0.6;           // เส้นขอบหญ้า
  const mh = h * (w === h ? 0.4 : 0.46);  // มาสคอตยืนบนหญ้า
  const mw = mh * MASCOT.ratio;
  const flowers = [
    [0.16, 0.74], [0.26, 0.86], [0.72, 0.72], [0.82, 0.85], [0.62, 0.9], [0.36, 0.94],
  ]
    .map(([u, v]) => `<circle cx="${x0 + w * u}" cy="${y0 + h * v}" r="${Math.max(w * 0.012, 3)}" fill="#fb923c" opacity="0.85"/>`)
    .join("");
  return `
  <g clip-path="url(#${clipId})">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#sky)"/>
    <!-- ก้อนเมฆครีมพาดกลางผืน -->
    <ellipse cx="${x0 + w * 0.34}" cy="${gy - h * 0.1}" rx="${w * 0.3}" ry="${h * 0.16}" fill="#fdf9ec" opacity="0.95"/>
    <ellipse cx="${x0 + w * 0.62}" cy="${gy - h * 0.14}" rx="${w * 0.24}" ry="${h * 0.13}" fill="#fdf9ec" opacity="0.95"/>
    <!-- เนินหญ้า -->
    <path d="M ${x0} ${gy + h * 0.06}
             Q ${x0 + w * 0.3} ${gy - h * 0.08} ${x0 + w * 0.58} ${gy + h * 0.03}
             Q ${x0 + w * 0.82} ${gy + h * 0.11} ${x0 + w} ${gy - h * 0.02}
             L ${x0 + w} ${y0 + h} L ${x0} ${y0 + h} Z" fill="url(#grass)"/>
    ${flowers}
    <!-- มาสคอตแทนลายที่ลูกค้าส่งมา -->
    <image href="${MASCOT.uri}" x="${x0 + w / 2 - mw / 2}" y="${gy + h * 0.06 - mh}"
      width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${x0 + w * 0.5}" y="${y0 + h * 0.24}" font-family="${TH}" font-size="${Math.max(w * 0.075, 14)}"
      font-weight="700" letter-spacing="${w * 0.012}" text-anchor="middle" fill="#ffffff" opacity="0.92">WELCOME</text>
  </g>`;
};

/**
 * ผืนพรม 1 ผืน (มองจากด้านบน) — ขอบขนฟูนุ่ม + เย็บริมขอบ + ลายพิมพ์เต็มผืน
 * pw/ph = ขนาดจริงเป็น px, id = คีย์กัน defs ชนกันเวลาวาดหลายผืนในภาพเดียว
 */
const mat = (s, cx, cy, cmPx, id) => {
  const pw = s.w * cmPx;
  const ph = s.h * cmPx;
  const x0 = cx - pw / 2;
  const y0 = cy - ph / 2;
  const rx = s.shape === "round" ? pw / 2 : Math.min(18, pw * 0.05);
  const shape =
    s.shape === "round"
      ? `<circle cx="${cx}" cy="${cy}" r="${pw / 2}"/>`
      : `<rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" rx="${rx}"/>`;
  const shapeAt = (dx, dy, grow = 0) =>
    s.shape === "round"
      ? `<circle cx="${cx + dx}" cy="${cy + dy}" r="${pw / 2 + grow}"`
      : `<rect x="${x0 + dx - grow}" y="${y0 + dy - grow}" width="${pw + grow * 2}" height="${ph + grow * 2}" rx="${rx + grow}"`;
  /* ขอบขนกำมะหยี่ — ก๊อปทรงเดิมขยายนิดหน่อยแล้วเบลอ ได้ขอบฟูแบบขนพรม */
  return `
  <defs>
    <clipPath id="face${id}">${shape}</clipPath>
    <filter id="pile${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${Math.max(cmPx * 0.9, 3)}"/>
    </filter>
  </defs>
  <!-- เงาพรมบนพื้น -->
  ${shapeAt(3, 10, 2)} fill="#0f172a" opacity="0.10"/>
  <!-- ขนฟูรอบขอบ -->
  ${shapeAt(0, 0, Math.max(cmPx * 1.1, 4))} fill="#bfe3f2" filter="url(#pile${id})" opacity="0.95"/>
  ${shapeAt(0, 0)} fill="#e0f2fe"/>
  ${printArt(x0, y0, pw, ph, `face${id}`)}
  <!-- ผิวขนกำมะหยี่ (ลายเส้นบางเฉียง) + เย็บริมขอบ -->
  <g clip-path="url(#face${id})">
    <rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" fill="url(#velvet)" opacity="0.34"/>
  </g>
  ${shapeAt(0, 0, -Math.max(cmPx * 1.3, 5))} fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="9 7" opacity="0.75"/>`;
};

/** มุมมองด้านล่างพรม — จุดยางกันลื่น (ภาพเล็กมุมขวาบน) */
const backView = (cx, cy, d) => {
  const dots = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      dots.push(`<circle cx="${cx - d * 0.32 + c * d * 0.16}" cy="${cy - d * 0.32 + r * d * 0.16}" r="3" fill="#94a3b8" opacity="0.8"/>`);
  return `
  <rect x="${cx - d / 2}" y="${cy - d / 2 + 3}" width="${d}" height="${d}" rx="16" fill="#0f172a" opacity="0.08"/>
  <rect x="${cx - d / 2}" y="${cy - d / 2}" width="${d}" height="${d}" rx="16" fill="#eef2f7" stroke="#d8dee7" stroke-width="2"/>
  ${dots.join("")}
  <text x="${cx}" y="${cy + d / 2 + 26}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ใต้พรมกันลื่น</text>`;
};

/** แถบเทียบขนาดทั้ง 7 แบบ — สเกลย่อร่วมกัน ยืนเสมอกันบนเส้นเดียว ไฮไลต์ตัวที่เลือกอยู่ */
const compareStrip = (cur) => {
  const CM2 = 0.44;
  const gap = 32;
  const total = SIZES.reduce((a, s) => a + s.w * CM2, 0) + gap * (SIZES.length - 1);
  let x = CX - total / 2;
  const parts = SIZES.map((s) => {
    const pw = s.w * CM2;
    const ph = s.h * CM2;
    const cx = x + pw / 2;
    const on = s.choice === cur.choice;
    const fill = on ? "#cffafe" : "#eef2f7";
    const stroke = on ? OK : "#cbd5e1";
    const shape =
      s.shape === "round"
        ? `<circle cx="${cx}" cy="${STRIP_Y - ph / 2}" r="${pw / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${on ? 3 : 2}"/>`
        : `<rect x="${cx - pw / 2}" y="${STRIP_Y - ph}" width="${pw}" height="${ph}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${on ? 3 : 2}"/>`;
    const out = `${shape}
      <text x="${cx}" y="${STRIP_Y + 28}" font-family="${TH}" font-size="18" font-weight="${on ? 700 : 400}"
        text-anchor="middle" fill="${on ? OK : SUB}">${s.strip}</text>`;
    x += pw + gap;
    return out;
  });
  return `<line x1="${CX - total / 2 - 16}" y1="${STRIP_Y}" x2="${CX + total / 2 + 16}" y2="${STRIP_Y}" stroke="#e2e8f0" stroke-width="2"/>
    ${parts.join("")}
    <text x="${CX}" y="${STRIP_Y - 42}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เทียบขนาดจริงทั้ง 7 แบบ</text>`;
};

/** การ์ด 1 ใบ */
function card(s) {
  const pw = s.w * CM;
  const ph = s.h * CM;
  const x0 = CX - pw / 2;
  const y0 = CY - ph / 2;
  const tagTxt = `${s.tag} ซม.`;
  const tagW = tagTxt.length * 23 + 40;
  /* เส้นประโยงจากขอบผืนลงมาหาลูกศรวัด (ผืนเล็กอยู่สูงกว่าเส้นวัดมาก) */
  const guide = (x) => `<line x1="${x}" y1="${y0 + ph}" x2="${x}" y2="${DIM_Y - 14}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 6"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe6fb"/>
      <stop offset="1" stop-color="#e8f7ff"/>
    </linearGradient>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe3a4"/>
      <stop offset="1" stop-color="#8fce7b"/>
    </linearGradient>
    <!-- ผิวขนกำมะหยี่ — เส้นเฉียงบาง ๆ ถี่ ๆ -->
    <pattern id="velvet" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" stroke-width="1.6" opacity="0.5"/>
      <line x1="3.5" y1="0" x2="3.5" y2="7" stroke="#0f172a" stroke-width="1" opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${CX}" y="88" font-family="${TH}" font-size="41" font-weight="700" text-anchor="middle" fill="${INK}">${s.title}</text>
  <text x="${CX}" y="128" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${s.use}</text>

  ${backView(792, 214, 108)}
  ${mat(s, CX, CY, CM, "main")}

  <!-- ลูกศรวัด: ด้านกว้างใต้ผืน + ด้านลึกฝั่งซ้าย (ทรงกลมบอกเส้นผ่านศูนย์กลางพอ) -->
  ${guide(x0)}${guide(x0 + pw)}
  ${dimH(x0, x0 + pw, DIM_Y, s.shape === "round" ? `⌀ ${s.w} ซม.` : `${s.w} ซม.`)}
  ${s.shape === "rect" ? dimV(x0 - 44, y0, y0 + ph, `${s.h} ซม.`) : ""}

  <!-- ป้ายเลขขนาด — ตัวใหญ่กลางกรอบครอปของปุ่ม/การ์ดตัวเลือก -->
  <rect x="${CX - tagW / 2}" y="${TAG_Y - 30}" width="${tagW}" height="62" rx="16" fill="#0f172a" opacity="0.10"/>
  <rect x="${CX - tagW / 2}" y="${TAG_Y - 33}" width="${tagW}" height="62" rx="16" fill="#ffffff" opacity="0.97" stroke="#a5f3fc" stroke-width="2.5"/>
  <text x="${CX}" y="${TAG_Y + 11}" font-family="${TH}" font-size="42" font-weight="800" text-anchor="middle" fill="${INK}">${tagTxt}</text>

  ${compareStrip(s)}
  <text x="${CX}" y="${H - 36}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ทุกภาพสเกลเดียวกัน · ผ้าขนกำมะหยี่ พิมพ์ซับลิเมชั่นเต็มผืน มีกันลื่นใต้พรม</text>
</svg>`;
}

// ── วาดภาพ ─────────────────────────────────────────────────────────
const built = [];
for (const s of SIZES) {
  const file = `${s.file}-${VER}.jpg`;
  const buf = await sharp(Buffer.from(card(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  /* ครอปกลาง 300–600 = สิ่งที่เห็นจริงบนปุ่ม/การ์ดตัวเลือก */
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${file}`);
  built.push({ ...s, file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${s.title}`);
}
/* แผ่นรวมครอปกลาง 7 ใบ เรียงเทียบกัน ตรวจว่าปุ่มแยกออกจากกันจริง */
await sharp({ create: { width: 300 * built.length, height: 300, channels: 3, background: "#ffffff" } })
  .composite(built.map((b, i) => ({ input: `${OUT}/_thumb-${b.file}`, left: i * 300, top: 0 })))
  .jpeg({ quality: 88 })
  .toFile(`${OUT}/_thumbs-all.jpg`);
console.log(`🔎 ${OUT}/_thumbs-all.jpg — ครอปกลาง ${built.length} ใบเรียงเทียบ`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", key);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const group = (data.options ?? []).find((o) => o.label === SIZE_GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}" — หยุดก่อน`); process.exit(1); }

/* ห้ามแตะชื่อกลุ่ม/ชื่อตัวเลือก (แกนตารางราคา) — เติมแค่ imageSrc + desc แล้วเปลี่ยนโหมดเป็นการ์ด */
group.display = "cards";
for (const c of group.choices ?? []) {
  const s = SIZES.find((x) => x.choice === c.name);
  if (!s) { console.error("ตัวเลือกใน DB ไม่มีในสคริปต์:", c.name); process.exit(1); }
  c.imageSrc = url[c.name];
  c.desc = s.desc;
}
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
if (g?.display !== "cards") { console.error("display ไม่ใช่ cards", g?.display); process.exit(1); }
for (const s of SIZES) {
  const c = g.choices.find((x) => x.name === s.choice);
  if (c?.imageSrc !== url[s.choice] || c?.desc !== s.desc) { console.error("อ่านกลับไม่ตรง:", s.choice, c); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" การ์ด + ภาพครบ ${SIZES.length} ตัวเลือก อ่านกลับตรง · savedAt =`, back.data.savedAt);
