#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่มตัวเลือกของ 2 พี่น้อง "ของติดรองเท้า"
 *   • jibbitz-shoe   Jibbitz (อะคริลิคติดรองเท้า)          /products/Jibbitz-อะคริลิคติดรองเท้า
 *   • gibbitz-lace   Gibbitz กิ๊บอะคริลิคติดเชือกรองเท้า   /products/Gibbitz-กิ๊บอะคริลิคติดเชือกรองเท้า
 *
 *   node scripts/jibbitz-gibbitz-option-art.mjs           (วาดลง .cache/jibbitz/upload เฉย ๆ)
 *   node scripts/jibbitz-gibbitz-option-art.mjs --write   (+ อัปโหลด storage + ตั้ง imageSrc/display/desc + อ่านกลับเทียบ)
 *
 * ทั้งคู่เป็นแผ่นอะคริลิคใสไดคัทตามลาย พิมพ์ UV — ต่างกันที่ "ตัวยึด" ด้านหลัง (ดูรูปงานจริงในแกลเลอรี):
 *   Jibbitz = จุกกลม (หมุดเห็ด) กดเข้ารูรองเท้าหัวโต · จุกมี 2 สี ใส/ดำ ← กลุ่ม "สีฐาน"
 *   Gibbitz = แถบคลิปดำแนวตั้งหลังชิ้นงาน ร้อยเชือกรองเท้าผ่าน (เห็นแถบดำโผล่ข้างชิ้นงานในรูป)
 *
 * กลุ่มที่ครอบ:
 *   1. "ขนาด" 2/3/4 cm — การ์ด 3 ใบ **สเกลจริงเดียวกันทุกใบ** (1 ซม. = 118 px) วางบนพื้นรองเท้าจริง ๆ
 *      (Jibbitz = ผิวรองเท้าหัวโตมีรู · Gibbitz = เชือกรองเท้าไขว้) + ไม้บรรทัด 0-5 ซม. + เลขตัวใหญ่
 *      → ย่อเหลือ 80 px บนการ์ดแล้วยังบอกได้ว่า "ใบไหนใหญ่กว่า" เพราะชิ้นงานโตขึ้นในกรอบเดิม
 *   2. "สีฐาน" ใส/ดำ (เฉพาะ Jibbitz) — การ์ด 2 ใบ มองจาก **ด้านหลัง** ให้จุกอยู่กลางเฟรมตัวใหญ่
 *      จุดต่างคือสีจุก ต้องใหญ่พอที่ 80 px ([[iducky-option-thumb-crop]])
 *   3. "เพิ่มขนาดมากกว่า 4 cm" — กลุ่มติ๊ก ปุ่มย่อรูปเหลือ **28 px กลม** จึงวาดเป็นสัญลักษณ์ล้วน
 *      (ชิ้นงาน 4 ซม. จาง + ชิ้นงานที่โตขึ้น + ลูกศรบานออก) ไม่ใส่ตัวหนังสือเล็ก ๆ
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri, assetPath, MASCOTS } from "./iducky-assets.mjs";

const VER = "v1";
const OUT = ".cache/jibbitz/upload";
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("peace", 520);

/**
 * ชิ้นงานจริงคือ "ไดคัทตามลาย" — เลยสร้างแผ่นอะคริลิคจาก **เงาของลายเอง** ไม่วาดทรงเรขาคณิต
 * (วาดหกเหลี่ยม/ก้อนเมฆแล้วดูเป็นเหรียญ ไม่เหมือนงานจริงที่ขอบใสวิ่งตามตัวเป็ด)
 *   alpha ของลาย → เบลอ → threshold = เงาที่ "อ้วนขึ้น" = แผ่นอะคริลิคพร้อมขอบใสรอบลาย
 * ⚠️ ต่อ .blur().threshold() ในไพป์ไลน์เดียวไม่ทำงาน ต้องคั่น toBuffer() ([[iducky-sharp-blur-threshold]])
 */
async function buildPlate() {
  // ⚠️ ต้องอ่านไฟล์ต้นฉบับเอง — data URI จาก mascotDataUri เข้ารหัสเป็น palette PNG แล้ว alpha หาย
  // ใช้ท่า "peace" ไม่ใช่ "heart" — เงาท่า heart เป็นก้อนกลมเต็มกรอบ ไดคัทออกมาดูเป็นสี่เหลี่ยม
  // ส่วนท่านี้มีคอคอด แขนชู ขา = เห็นได้ชัดว่าไดคัทตามลาย
  const PAD = 70;
  const art = await sharp(assetPath(MASCOTS.peace))
    .trim({ threshold: 1 })
    .resize({ width: 520 })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = art.info;

  /**
   * เงาไดคัท: อัลฟาของลาย → ทำให้ทึบ 0/255 ก่อน → เบลอ → threshold = เงาที่อ้วนขึ้น = ขอบใสรอบลาย
   * ⚠️ ห้าม blur().threshold() ติดกันในไพป์ไลน์เดียว ต้องคั่น toBuffer() ([[iducky-sharp-blur-threshold]])
   * ⚠️ ห้าม threshold จากอัลฟาดิบ — ลาย 3D มีขอบฟุ้งจาง ๆ เงาจะพองเต็มกรอบกลายเป็นแผ่นสี่เหลี่ยม
   * ⚠️ ค่า threshold ต่ำกว่า ~90 ก็พองเต็มกรอบเหมือนกัน · 96 = อ้วนขึ้นราว 12 px ≈ ขอบใส 0.7 มม.
   */
  const alphaOnly = await sharp(Buffer.from(art.data), { raw: { width, height, channels: 4 } })
    .extractChannel(3).toColourspace("b-w").png().toBuffer();
  const maskOf = async (buf, th) =>
    (await sharp(await sharp(buf).toBuffer()).threshold(th).toColourspace("b-w").raw().toBuffer());
  const hard = await sharp(await maskOf(alphaOnly, 128), { raw: { width, height, channels: 1 } }).png().toBuffer();
  const blurred = await sharp(hard).blur(22).toBuffer();
  const outer = await maskOf(blurred, 96);
  const inner = await maskOf(blurred, 122);

  /**
   * ประกอบ RGBA เองทีละพิกเซล — sharp joinChannel/composite ทำอัลฟาหายมาแล้วหลายรอบ
   * (ได้แผ่นสี่เหลี่ยมทึบ) เขียนเองแบบนี้คุมได้แน่นอนว่าอะไรโปร่ง อะไรทึบ
   *   แผ่นอะคริลิคใส = สีฟ้าอ่อนอัลฟา 140 (โปร่ง เห็นพื้นหลังทะลุ) · ขอบแผ่น = เส้นเทาทึบ
   */
  const PLATE_RGB = [233, 244, 250];
  const PLATE_A = 140;
  const RIM_RGB = [150, 176, 194];
  const out = Buffer.alloc(width * height * 4);
  const ghostBuf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const inPlate = outer[i] > 127;
    const inRim = inPlate && inner[i] <= 127;
    // ชั้นล่าง = เนื้อแผ่น/ขอบแผ่น
    let br = 0, bg = 0, bb = 0, ba = 0;
    if (inRim) { [br, bg, bb] = RIM_RGB; ba = 255; }
    else if (inPlate) { [br, bg, bb] = PLATE_RGB; ba = PLATE_A; }
    // ชั้นบน = ลายที่พิมพ์
    const sr = art.data[i * 4], sg = art.data[i * 4 + 1], sb = art.data[i * 4 + 2], sa = art.data[i * 4 + 3];
    const oa = sa + (ba * (255 - sa)) / 255;
    out[i * 4 + 3] = Math.round(oa);
    if (oa > 0) {
      out[i * 4] = Math.round((sr * sa + br * ba * (255 - sa) / 255) / oa);
      out[i * 4 + 1] = Math.round((sg * sa + bg * ba * (255 - sa) / 255) / oa);
      out[i * 4 + 2] = Math.round((sb * sa + bb * ba * (255 - sa) / 255) / oa);
    }
    ghostBuf[i * 4] = 148; ghostBuf[i * 4 + 1] = 163; ghostBuf[i * 4 + 2] = 184;
    ghostBuf[i * 4 + 3] = inPlate ? 255 : 0;
  }
  const png = (buf) => sharp(buf, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();

  return {
    uri: `data:image/png;base64,${(await png(out)).toString("base64")}`,
    ghostUri: `data:image/png;base64,${(await png(ghostBuf)).toString("base64")}`,
    w: width,
    h: height,
  };
}
const PLATE = await buildPlate();

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลจริง — 1 ซม. = 118 px ทุกใบเท่ากัน (5 ซม. = 590 px พอดีความกว้างไม้บรรทัด) */
const CM = 118;

/** ขนาด 3 ตัวเลือกจาก DB — key = choice.name เป๊ะ ๆ */
const SIZES = [
  { choice: "2 cm", cm: 2, file: "size-2", desc: "ชิ้นเล็ก ติดเรียงหลายตัวได้" },
  { choice: "3 cm", cm: 3, file: "size-3", desc: "ขนาดกลาง ลายชัดกำลังดี" },
  { choice: "4 cm", cm: 4, file: "size-4", desc: "ชิ้นใหญ่ เห็นลายเต็มตา" },
];

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="stage"><rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, size = 42) =>
  `<text x="${W / 2}" y="84" font-family="${TH}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>`;

/** ลูกศรวัดแนวนอน — ขีดปลายสองข้าง + ป้ายกลางเส้น */
const dimH = (y, x1, x2, label) => {
  const lw = Math.max(110, label.length * 15);
  const mx = (x1 + x2) / 2;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${SUB}" stroke-width="3.5"/>
    <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${SUB}" stroke-width="3.5"/>
    <rect x="${mx - lw / 2}" y="${y - 20}" width="${lw}" height="40" rx="10" fill="#ffffff" opacity="0.94"/>
    <text x="${mx}" y="${y + 11}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;
};

/** ไม้บรรทัด 0-5 ซม. สเกลเดียวกับชิ้นงาน + ไฮไลต์ช่วง 0→ขนาดที่เลือก */
const ruler = (y, selCm) => {
  const x0 = 155;
  const len = 5 * CM;
  let ticks = "";
  for (let mm = 0; mm <= 50; mm += 1) {
    const x = x0 + (mm / 10) * CM;
    const big = mm % 10 === 0;
    const mid = mm % 5 === 0;
    ticks += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + (big ? 26 : mid ? 18 : 10)}" stroke="${big ? INK : "#94a3b8"}" stroke-width="${big ? 3 : 1.5}"/>`;
    if (big) ticks += `<text x="${x}" y="${y + 54}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${mm / 10}</text>`;
  }
  const selX = x0 + selCm * CM;
  return `
    <rect x="${x0}" y="${y - 13}" width="${selCm * CM}" height="13" rx="4" fill="${OK}" opacity="0.28"/>
    <line x1="${x0}" y1="${y}" x2="${x0 + len}" y2="${y}" stroke="${INK}" stroke-width="3"/>
    ${ticks}
    <line x1="${selX}" y1="${y - 36}" x2="${selX}" y2="${y + 26}" stroke="${OK}" stroke-width="3.5"/>
    <circle cx="${selX}" cy="${y - 36}" r="8" fill="${OK}"/>
    <text x="${x0 + len + 32}" y="${y + 30}" font-family="${TH}" font-size="21" fill="${SUB}">ซม.</text>`;
};

/** กล่องของแผ่นไดคัทเมื่อ "ด้านที่ยาวที่สุด" = size px */
const plateBox = (cx, cy, size) => {
  const s = size / Math.max(PLATE.w, PLATE.h);
  const w = PLATE.w * s;
  const h = PLATE.h * s;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
};

/** ชิ้นงานไดคัทตามลาย (แผ่นอะคริลิค + ลาย) + เงาตกพื้นให้ลอยขึ้นจากพื้นรองเท้าสีอ่อน */
const charm = (cx, cy, size, { shadow = true } = {}) => {
  const b = plateBox(cx, cy, size);
  return `
    ${shadow ? `<ellipse cx="${cx}" cy="${cy + b.h * 0.47}" rx="${b.w * 0.36}" ry="${b.h * 0.05}" fill="#0f172a" opacity="0.16"/>` : ""}
    ${shadow ? `<image href="${PLATE.ghostUri}" x="${b.x + 6}" y="${b.y + 8}" width="${b.w}" height="${b.h}" opacity="0.16"/>` : ""}
    <image href="${PLATE.uri}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
};

// ── ฉากหลัง: ผิวรองเท้าหัวโต (Jibbitz) ────────────────────────────────
/**
 * ผิวรองเท้าหัวโต — รูกลม ø ~1.3 ซม. ห่างกันราว 2.3 ซม. (สเกลเดียวกับชิ้นงาน)
 * เว้นรูตรงที่ชิ้นงานทับไว้ให้ว่าง แล้ววาดชิ้นงานทับ = "จุกหลังชิ้นงานเสียบอยู่ในรูนั้น"
 */
const crocsGround = (topY, skip) => {
  const holeR = CM * 0.65;
  const gapX = CM * 2.3;
  const gapY = CM * 2.1;
  let holes = "";
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const x = 110 + col * gapX + (row % 2 ? gapX / 2 : 0);
      const y = topY + 96 + row * gapY;
      if (skip && Math.hypot(x - skip.x, y - skip.y) < skip.r) continue;
      holes += `
        <ellipse cx="${x}" cy="${y}" rx="${holeR}" ry="${holeR * 0.94}" fill="#c3ccd6"/>
        <ellipse cx="${x}" cy="${y + 3}" rx="${holeR * 0.88}" ry="${holeR * 0.82}" fill="#4b5b6d"/>`;
    }
  }
  return `
    <g clip-path="url(#stage)">
      <rect x="18" y="${topY}" width="${W - 36}" height="${H}" fill="#eef2f6"/>
      <rect x="18" y="${topY}" width="${W - 36}" height="76" fill="#e3e9ef"/>
      ${holes}
    </g>`;
};

// ── ฉากหลัง: เชือกรองเท้าไขว้ (Gibbitz) ───────────────────────────────
/** เชือกแบน กว้าง ~0.8 ซม. ไขว้กันสองเส้น สเกลเดียวกับชิ้นงาน (เส้นถักจาง ๆ พอให้รู้ว่าเป็นเชือก) */
const laceGround = (topY, laceY) => {
  const lw = CM * 0.82;
  const band = (y, tilt) => `
    <g transform="rotate(${tilt} ${W / 2} ${y})">
      <rect x="-140" y="${y - lw / 2}" width="${W + 280}" height="${lw}" rx="${lw * 0.32}" fill="#fbfcfd" stroke="#cdd6e0" stroke-width="3"/>
      ${Array.from({ length: 40 }, (_, i) => {
        const x = -120 + i * 30;
        return `<line x1="${x}" y1="${y - lw / 2 + 9}" x2="${x + 10}" y2="${y + lw / 2 - 9}" stroke="#e7ecf2" stroke-width="5" stroke-linecap="round"/>`;
      }).join("")}
    </g>`;
  return `
    <g clip-path="url(#stage)">
      <rect x="18" y="${topY}" width="${W - 36}" height="${H}" fill="#dfe6ee"/>
      ${Array.from({ length: 14 }, (_, i) =>
        `<line x1="${-40 + i * 82}" y1="${topY}" x2="${-110 + i * 82}" y2="${H}" stroke="#d5dde7" stroke-width="10"/>`
      ).join("")}
      ${band(laceY + CM * 1.9, -12)}
      ${band(laceY, 8)}
    </g>`;
};

/** แถบคลิปดำหลังชิ้นงาน — เชือกลอดผ่าน โผล่ให้เห็นข้างชิ้นงานเหมือนรูปงานจริง */
const laceClip = (cx, cy, size) => {
  const b = plateBox(cx, cy, size);
  const cw = Math.max(16, size * 0.15);
  const ch = b.h * 0.55;
  const x = b.x + b.w * 0.74;
  return `
    <rect x="${x}" y="${cy - ch / 2}" width="${cw}" height="${ch}" rx="${cw * 0.28}" fill="#111827"/>
    <rect x="${x + cw * 0.3}" y="${cy - ch / 2 + ch * 0.16}" width="${cw * 0.4}" height="${ch * 0.68}" rx="${cw * 0.18}" fill="#3f4855"/>`;
};

// ── การ์ดขนาด ─────────────────────────────────────────────────────────
function sizeArt(kind, sel) {
  const size = sel.cm * CM;
  const cx = 320;
  const cy = 410;
  const b = plateBox(cx, cy, size);
  const scene =
    kind === "jibbitz"
      ? `
        ${crocsGround(120, { x: cx, y: cy, r: Math.max(b.w, b.h) * 0.62 })}
        ${charm(cx, cy, size)}`
      : `
        ${laceGround(120, cy - CM * 0.15)}
        ${laceClip(cx, cy, size)}
        ${charm(cx, cy, size)}`;
  return frame(`
    ${scene}
    ${dimH(cy + b.h / 2 + 52, cx - b.w / 2, cx + b.w / 2, `${sel.cm} ซม.`)}
    <rect x="620" y="188" width="228" height="238" rx="26" fill="#ffffff" opacity="0.94"/>
    <text x="734" y="352" font-family="${TH}" font-size="168" font-weight="800" text-anchor="middle" fill="${OK}">${sel.cm}</text>
    <text x="734" y="404" font-family="${TH}" font-size="38" font-weight="700" text-anchor="middle" fill="${SUB}">ซม.</text>
    <rect x="18" y="18" width="${W - 36}" height="112" rx="28" fill="#ffffff" opacity="0.94"/>
    ${title(`ขนาด ${sel.cm} ซม. · วัดด้านที่ยาวที่สุด`, 38)}
    <rect x="18" y="742" width="${W - 36}" height="140" rx="20" fill="#ffffff" opacity="0.94"/>
    ${ruler(806, sel.cm)}`);
}

// ── การ์ดสีฐาน (Jibbitz) — มองจากด้านหลัง จุกอยู่กลางเฟรม ────────────
function baseColorArt(dark) {
  const cx = W / 2;
  const cy = 470;
  const size = 540;
  const b = plateBox(cx, cy, size);
  const plugR = 104;
  const face = dark ? "#242a33" : "#d3e4ef";
  const ring = dark ? "#39414d" : "#eef7fc";
  const edge = dark ? "#0c1117" : "#7f9cb0";
  /** จุกอยู่กลาง "ตัวชิ้นงาน" ไม่ใช่กลางกรอบ — ลายเป็ดมีหัวสูง จุดกึ่งกลางเนื้อจึงต่ำกว่ากลางกรอบนิดหน่อย */
  const py = cy + b.h * 0.06;
  return frame(`
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#eef2f6"/>
    <!-- ด้านหลังชิ้นงาน — แผ่นอะคริลิคใส เห็นลายด้านหน้าทะลุมาจาง ๆ (กลับซ้าย-ขวาเพราะมองจากหลัง) -->
    <ellipse cx="${cx}" cy="${cy + b.h * 0.47}" rx="${b.w * 0.28}" ry="${b.h * 0.04}" fill="#0f172a" opacity="0.12"/>
    <g transform="translate(${2 * cx} 0) scale(-1 1)">
      <image href="${PLATE.ghostUri}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" opacity="0.22"/>
      <image href="${PLATE.uri}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" opacity="0.28"/>
    </g>
    <!-- จุกยึด (หมุดพลาสติก) กลางหลังชิ้นงาน — จุดต่างของกลุ่มนี้คือ "สี" ต้องใหญ่พอให้เห็นตอนย่อ 80 px -->
    <ellipse cx="${cx}" cy="${py + plugR * 0.5}" rx="${plugR * 0.98}" ry="${plugR * 0.26}" fill="#0f172a" opacity="0.16"/>
    <circle cx="${cx}" cy="${py}" r="${plugR}" fill="${face}" stroke="${edge}" stroke-width="5"/>
    <circle cx="${cx}" cy="${py - plugR * 0.06}" r="${plugR * 0.6}" fill="${ring}" stroke="${edge}" stroke-width="4"/>
    <ellipse cx="${cx - plugR * 0.3}" cy="${py - plugR * 0.42}" rx="${plugR * 0.3}" ry="${plugR * 0.13}"
      fill="#ffffff" opacity="${dark ? 0.28 : 0.9}" transform="rotate(-30 ${cx - plugR * 0.3} ${py - plugR * 0.42})"/>
    <rect x="18" y="18" width="${W - 36}" height="112" rx="28" fill="#ffffff" opacity="0.94"/>
    ${title(dark ? "ฐาน (จุกยึด) สีดำ" : "ฐาน (จุกยึด) สีใส")}
    <text x="${W / 2}" y="${H - 62}" font-family="${TH}" font-size="27" text-anchor="middle" fill="${SUB}">มองจากด้านหลัง · กดจุกเข้ารูรองเท้า</text>`);
}

// ── ภาพกลุ่ม "เพิ่มขนาดมากกว่า 4 cm" — ปุ่มติ๊กย่อเหลือ 28 px กลม ────
function biggerArt() {
  const cx = W / 2;
  const cy = 468;
  const base = 4 * CM;
  const big = 5.7 * CM;
  const bb = plateBox(cx, cy, big);
  const gb = plateBox(cx, cy, base);
  /** ลูกศรบานออก 4 มุม — เขียนในแกนที่หมุนแล้ว ทั้งก้านและหัวจึงชี้ทางเดียวกันเสมอ */
  const arrow = (a) => {
    const r1 = Math.max(gb.w, gb.h) * 0.52 + 22;
    const r2 = Math.max(bb.w, bb.h) * 0.5 + 74;
    return `
      <g transform="rotate(${a} ${cx} ${cy})">
        <line x1="${cx + r1}" y1="${cy}" x2="${cx + r2 - 26}" y2="${cy}" stroke="${OK}" stroke-width="16" stroke-linecap="round"/>
        <path d="M ${cx + r2 - 34} ${cy - 27} L ${cx + r2} ${cy} L ${cx + r2 - 34} ${cy + 27} Z" fill="${OK}"/>
      </g>`;
  };
  return frame(`
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#eef2f6"/>
    ${charm(cx, cy, big)}
    ${[45, 135, 225, 315].map(arrow).join("")}
    <rect x="18" y="18" width="${W - 36}" height="112" rx="28" fill="#ffffff" opacity="0.94"/>
    ${title("ใหญ่กว่า 4 ซม. — เซนละ 8 บาท", 40)}
    <text x="${W / 2}" y="${H - 62}" font-family="${TH}" font-size="27" text-anchor="middle" fill="${SUB}">ขยายเกิน 4 ซม. คิดเพิ่มตามจำนวนเซนติเมตรที่เกิน</text>`);
}

// ── เรนเดอร์ทั้งหมด ───────────────────────────────────────────────────
const jpg = async (svg, q = 90) => sharp(Buffer.from(svg)).jpeg({ quality: q, mozjpeg: true }).toBuffer();

/** งานที่จะทำต่อสินค้าแต่ละตัว — file ชื่อตาม "รูปอะไร" ไม่ใช่ลำดับ */
const JOBS = [
  {
    id: "jibbitz-shoe",
    kind: "jibbitz",
    prefix: "jibbitz",
    cards: ["สีฐาน", "ขนาด"],
    extra: [
      { group: "สีฐาน", choice: "สีใส", file: "base-clear", desc: "จุกใส กลืนไปกับรองเท้าทุกสี", svg: () => baseColorArt(false) },
      { group: "สีฐาน", choice: "สีดำ", file: "base-black", desc: "จุกดำ ตัดกับรองเท้าสีอ่อน", svg: () => baseColorArt(true) },
    ],
  },
  { id: "gibbitz-lace", kind: "gibbitz", prefix: "gibbitz", cards: ["ขนาด"], extra: [] },
];

const plan = [];
for (const job of JOBS) {
  for (const s of SIZES) {
    plan.push({
      job,
      group: "ขนาด",
      choice: s.choice,
      desc: s.desc,
      file: `${job.prefix}-${s.file}-${VER}.jpg`,
      buf: await jpg(sizeArt(job.kind, s)),
    });
  }
  for (const e of job.extra) {
    plan.push({ job, group: e.group, choice: e.choice, desc: e.desc, file: `${job.prefix}-${e.file}-${VER}.jpg`, buf: await jpg(e.svg()) });
  }
  plan.push({
    job,
    group: "เพิ่มขนาดมากกว่า 4 cm",
    choice: "มากกว่า 4 cm เซนละ",
    file: `${job.prefix}-bigger-than-4-${VER}.jpg`,
    buf: await jpg(biggerArt()),
  });
}

for (const p of plan) {
  writeFileSync(`${OUT}/${p.file}`, p.buf);
  console.log(`🖼  ${p.file}  ${Math.round(p.buf.length / 1024)} KB — ${p.job.id} · ${p.group} · ${p.choice}`);
}

// ตรวจว่าย่อเหลือขนาดจริงบนหน้าเว็บแล้วยังแยกออก (การ์ด 80 px · ปุ่มติ๊ก 28 px)
mkdirSync(`${OUT}/preview`, { recursive: true });
for (const p of plan) {
  const px = p.group === "เพิ่มขนาดมากกว่า 4 cm" ? 28 : 80;
  await sharp(p.buf).resize(px, px).resize(px * 5, px * 5, { kernel: "nearest" }).jpeg().toFile(`${OUT}/preview/${px}-${p.file}`);
}
console.log(`\n(ภาพย่อจำลองขนาดจริงบนหน้าเว็บอยู่ที่ ${OUT}/preview)`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ตั้ง imageSrc / display:"cards" / desc ──────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const p of plan) {
  const key = `products/${p.job.id}/${p.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, p.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  p.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", p.url);
}

for (const job of JOBS) {
  const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", job.id).single();
  if (readErr) { console.error(readErr); process.exit(1); }
  const data = row.data;
  const mine = plan.filter((p) => p.job.id === job.id);

  for (const p of mine) {
    const grp = (data.options ?? []).find((o) => o.label === p.group);
    if (!grp) { console.error(`${job.id}: ไม่เจอกลุ่ม "${p.group}"`); process.exit(1); }
    const c = grp.choices?.find((c) => c.name === p.choice);
    if (!c) { console.error(`${job.id}: ไม่เจอตัวเลือก "${p.choice}" ในกลุ่ม "${p.group}"`); process.exit(1); }
    c.imageSrc = p.url;
    if (p.desc) c.desc = p.desc;
  }
  // กลุ่มที่เปลี่ยนเป็นการ์ด — รูป 80 px เห็นชัดกว่าเมนูเลื่อน/ปุ่มกลม (ชื่อกลุ่ม/ตัวเลือกคงเดิม = แกนราคาไม่พัง)
  for (const label of job.cards) {
    const grp = data.options.find((o) => o.label === label);
    if (!grp) { console.error(`${job.id}: ไม่เจอกลุ่ม "${label}"`); process.exit(1); }
    grp.display = "cards";
  }
  data.savedAt = new Date().toISOString();

  const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", job.id).select("data");
  if (updErr || !upd?.length) { console.error("update พัง/0 แถว", job.id, updErr); process.exit(1); }

  // อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ([[iducky-script-write-product]])
  const { data: back } = await sb.from("products").select("data").eq("id", job.id).single();
  for (const p of mine) {
    const c = back.data.options.find((o) => o.label === p.group)?.choices?.find((c) => c.name === p.choice);
    if (c?.imageSrc !== p.url) { console.error("อ่านกลับไม่ตรง!", job.id, p.group, p.choice, c?.imageSrc); process.exit(1); }
    if (p.desc && c?.desc !== p.desc) { console.error("desc อ่านกลับไม่ตรง!", job.id, p.choice); process.exit(1); }
  }
  for (const label of job.cards) {
    if (back.data.options.find((o) => o.label === label)?.display !== "cards") { console.error("display อ่านกลับไม่ตรง!", job.id, label); process.exit(1); }
  }
  console.log(`✓ ${job.id} — ตั้งภาพ ${mine.length} ตัวเลือก · การ์ด ${job.cards.join("/")} · savedAt =`, back.data.savedAt);
}
