#!/usr/bin/env node
/**
 * ภาพสินค้า + ภาพประกอบตัวเลือกของ "ตะขอแขวนสูญญากาศ"
 *
 *   node scripts/vacuum-hook-art.mjs [--out=<dir>]
 *   → .cache/vacuum-hook/upload/*.jpg   (ย่อ 1200px ตามนโยบายภาพสินค้า)
 *
 * แบ่งเป็นสองชุด:
 *
 *  A) รูปงานจริง — ครอปจากไดรฟ์ร้าน 60_ตกแต่งและงานแสดง/จัดของติดผนัง/ภาพตะขอแขวนผนัง/
 *     hero        Artboard 09  ตะขอ 5 ชิ้นเรียงกัน มีตัวพลิกหลังให้เห็นจุกสูญญากาศ
 *     back        ครอปตัวที่พลิกหลังจากภาพเดียวกัน — เห็นจุกยางกับก้านตะขอชัด
 *     closeup     Artboard 7   ตะขอตัวเดียวระยะใกล้ (ผิวเคลือบกลิสเตอร์เห็นประกาย)
 *     real-set    DSC05091 จากหน้า pricelists — งานลูกค้า 3 ลาย + ตัวพลิกหลัง
 *
 *     ⚠️ ไม่ใช้ Artboard 1 / Artboard 2 ในโฟลเดอร์เดียวกัน — เป็นภาพ mockup ที่ตะขอเป็น
 *        "สองง่าม" และมีจานซ้อนหลอนอยู่ข้างหลัง ไม่ตรงกับตัวสินค้าจริงที่เป็นตะของ่ามเดียว
 *
 *  B) ภาพวาด — สิ่งที่รูปถ่ายบอกไม่ได้
 *     size-58     จานขนาด 58 มม. วาดตามสเกลจริง พร้อมก้านตะขอ
 *     set-5       1 เซ็ต = 5 ชิ้น (ขายเป็นเซ็ต ราคาในตารางเป็นราคาต่อเซ็ต)
 *     coat-*      ผิวเคลือบ 5 แบบ (เงา · ด้าน · เนื้อทราย · กลิสเตอร์ · โฮโลแกรม)
 *                 วาดบนทรงตะขอจริงทุกใบ สเกลเดียวกัน เทียบกันได้ตรง ๆ
 *
 * ที่มาของตัวเลข: iduckyofficial-pricelists.com/otheracrylicproducts3 หัวข้อ "ตะขอแขวน สูญญากาศ"
 *   จำหน่ายเป็นเซ็ต 1 เซ็ต 5 ชิ้น · ขนาด 58mm · ฟรี เคลือบเงา/เคลือบด้าน
 *   เคลือบพิเศษ [เนื้อทราย | กลิสเตอร์ | โฮโลแกรม] บวกเพิ่มชุดละ 40 บาท · 1 ชุดเลือกผิวได้ 1 แบบ
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV ใน add-vacuum-hook.ts
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/vacuum-hook/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("heart", 520);

// ────────────────────────────── A) รูปงานจริง ──────────────────────────────

const PHOTO_DIR = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/60_ตกแต่งและงานแสดง/จัดของติดผนัง/ภาพตะขอแขวนผนัง";
const CACHE = ".cache/vacuum-hook/source";
mkdirSync(CACHE, { recursive: true });

/** ต้นฉบับจากไดรฟ์ ถ้าไดรฟ์ไม่ได้ต่อก็ใช้สำเนาที่แคชไว้รอบก่อน */
async function source(file) {
  const cached = `${CACHE}/${file}`;
  if (existsSync(`${PHOTO_DIR}/${file}`)) {
    const buf = await sharp(`${PHOTO_DIR}/${file}`).toBuffer();
    writeFileSync(cached, buf);
    return buf;
  }
  if (existsSync(cached)) return sharp(cached).toBuffer();
  throw new Error(`หาไฟล์ไม่เจอ: ${file} (ต่อไดรฟ์ iDuckyShop ก่อน)`);
}

/** DSC05091 บนหน้า pricelists — งานลูกค้าจริง 3 ลาย เห็นจุกสูญญากาศด้วย */
const WEB_PHOTO = "https://static.wixstatic.com/media/959b83_d322541eb66c40dd99729a6f5b7cde0b~mv2.jpg/v1/fill/w_1400,h_1400,al_c,q_90/file.jpg";

async function webSource() {
  const cached = `${CACHE}/DSC05091.jpg`;
  if (existsSync(cached)) return sharp(cached).toBuffer();
  const res = await fetch(WEB_PHOTO, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.iduckyofficial-pricelists.com/" },
  });
  if (!res.ok) throw new Error(`ดึงรูปจากเว็บไม่ได้: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(cached, buf);
  return buf;
}

/** ครอปด้วยอัตราส่วนของภาพต้นฉบับ (0-1) แล้วย่อลง 1200px */
async function photo(name, buf, box) {
  const img = sharp(buf);
  const { width, height } = await img.metadata();
  const pipe = box
    ? sharp(buf).extract({
        left: Math.round(width * box.x),
        top: Math.round(height * box.y),
        width: Math.round(width * box.w),
        height: Math.round(height * box.h),
      })
    : sharp(buf);
  const out = await pipe
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, out);
  console.log(`📷 ${name}.jpg  ${Math.round(out.length / 1024)} KB`);
}

const ab09 = await source("Artboard 09.png");
const ab07 = await source("Artboard 7.jpg");
const web = await webSource();

await photo("hero", ab09);
await photo("back", ab09, { x: 0.38, y: 0.16, w: 0.28, h: 0.62 });
await photo("closeup", ab07);
await photo("real-set", web);

// ────────────────────────────── B) ภาพวาด ──────────────────────────────

const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปภาพเป็นสี่เหลี่ยมจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
/** ตัวเรือนของจริงเป็นพลาสติกขาว จานหน้าเป็นลายที่ลูกค้าสั่งพิมพ์ */
const SHELL = "#ffffff";
const SHELL_EDGE = "#a9b6c4";

const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#fbfdff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** เส้นบอกขนาดแนวนอน ป้ายอยู่เหนือเส้น */
const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 11}" x2="${x1}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 11}" x2="${x2}" y2="${y + 11}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y - 20}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

const callout = (x1, y1, x2, y2, text, anchor = "start") => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="#94a3b8"/>
  <text x="${x2 + (anchor === "end" ? -8 : 8)}" y="${y2 + 6}" font-family="${TH}" font-size="20" text-anchor="${anchor}" fill="${SUB}">${text}</text>`;

/**
 * ทรงตะขอสูญญากาศตามของจริง (มองจากด้านหน้า)
 *   จานกลม r → ก้านตรงลงมา → ปลายงอขึ้นเป็นตะของ่ามเดียว
 * สัดส่วนอิงรูปถ่าย Artboard 09: ก้าน ≈ 0.85r · ปลายงอ ≈ 0.45r
 */
const hookGeom = (cx, cy, r) => ({
  cx,
  cy,
  r,
  stemW: r * 0.32,
  stemLen: r * 0.85,
  tipLen: r * 0.45,
  bottom: cy + r + r * 0.85 + r * 0.45,
});

/** ก้าน+ปลายตะขอ (วาดก่อนจาน จานจะได้ทับโคนก้านพอดี) */
const hookStem = (g) => {
  const top = g.cy + g.r * 0.55;
  const endY = g.cy + g.r + g.stemLen;
  return `
    <path d="M${g.cx - g.stemW / 2} ${top}
             L${g.cx - g.stemW / 2} ${endY}
             a${g.stemW / 2} ${g.stemW / 2} 0 0 0 ${g.stemW} 0
             L${g.cx + g.stemW / 2} ${top} Z"
      fill="${SHELL}" stroke="${SHELL_EDGE}" stroke-width="3"/>
    <path d="M${g.cx + g.stemW / 2} ${endY - g.stemW * 0.1}
             q${g.tipLen} ${g.stemW * 0.1} ${g.tipLen} ${-g.tipLen * 0.9}"
      fill="none" stroke="${SHELL}" stroke-width="${g.stemW}" stroke-linecap="round"/>
    <path d="M${g.cx + g.stemW / 2} ${endY - g.stemW * 0.1}
             q${g.tipLen} ${g.stemW * 0.1} ${g.tipLen} ${-g.tipLen * 0.9}"
      fill="none" stroke="${SHELL_EDGE}" stroke-width="2" opacity="0.55"/>`;
};

/** ขอบตัวเรือนสีขาวที่ล้อมจานลายอยู่ (ของจริงเห็นเป็นวงขาวบาง ๆ รอบลาย) */
const hookShell = (g) => `
  <circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="${SHELL}" stroke="${SHELL_EDGE}" stroke-width="3"/>`;

/** ลายที่พิมพ์บนจาน — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) */
const discArt = (g, clipId) => {
  const box = g.r * 1.5;
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `
    <circle cx="${g.cx}" cy="${g.cy}" r="${g.r * 0.9}" fill="#e0f2fe"/>
    <g clip-path="url(#${clipId})">
      <rect x="${g.cx - g.r}" y="${g.cy - g.r}" width="${g.r * 2}" height="${g.r * 2}" fill="#e0f2fe"/>
      <image href="${MASCOT.uri}" x="${g.cx - aw / 2}" y="${g.cy - ah / 2}" width="${aw}" height="${ah}"
        preserveAspectRatio="xMidYMid meet"/>
    </g>`;
};

const discClip = (id, g) => `<clipPath id="${id}"><circle cx="${g.cx}" cy="${g.cy}" r="${g.r * 0.9}"/></clipPath>`;

// ── ผิวเคลือบ 5 แบบ — overlay ที่วาดทับจานลาย ────────────────────────────
/** ประกายเงาแบบวงรีเฉียง ใช้กับผิวเงา/โฮโลแกรม */
const gloss = (g, opacity) => `
  <ellipse cx="${g.cx - g.r * 0.3}" cy="${g.cy - g.r * 0.38}" rx="${g.r * 0.44}" ry="${g.r * 0.24}"
    fill="#ffffff" opacity="${opacity}" transform="rotate(-28 ${g.cx - g.r * 0.3} ${g.cy - g.r * 0.38})"/>
  <ellipse cx="${g.cx + g.r * 0.34}" cy="${g.cy + g.r * 0.4}" rx="${g.r * 0.2}" ry="${g.r * 0.09}"
    fill="#ffffff" opacity="${opacity * 0.7}" transform="rotate(-28 ${g.cx + g.r * 0.34} ${g.cy + g.r * 0.4})"/>`;

/** จุดเล็กกระจายทั่วจาน — สุ่มแบบคงที่ (seed) ให้ภาพออกเหมือนเดิมทุกครั้งที่รัน */
function speckles(g, clipId, { count, size, colors, opacity }) {
  let seed = 20260821;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const dots = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * g.r * 0.88;
    const rr = size * (0.5 + rnd());
    dots.push(
      `<circle cx="${(g.cx + Math.cos(a) * d).toFixed(1)}" cy="${(g.cy + Math.sin(a) * d).toFixed(1)}" r="${rr.toFixed(1)}" fill="${colors[i % colors.length]}" opacity="${opacity}"/>`
    );
  }
  return `<g clip-path="url(#${clipId})">${dots.join("")}</g>`;
}

/** ประกายดาว 4 แฉก — กลิสเตอร์ */
function sparkles(g, clipId, count) {
  let seed = 777001;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * g.r * 0.85;
    const x = g.cx + Math.cos(a) * d;
    const y = g.cy + Math.sin(a) * d;
    const s = g.r * (0.018 + rnd() * 0.026);
    out.push(
      `<path d="M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z" fill="#ffffff" opacity="${(0.35 + rnd() * 0.45).toFixed(2)}"/>`
    );
  }
  return `<g clip-path="url(#${clipId})">${out.join("")}</g>`;
}

/** แถบรุ้งเฉียงจาง ๆ — โฮโลแกรม */
const holo = (g, clipId, gradId) => `
  <g clip-path="url(#${clipId})">
    <rect x="${g.cx - g.r}" y="${g.cy - g.r}" width="${g.r * 2}" height="${g.r * 2}" fill="url(#${gradId})" opacity="0.3"/>
  </g>`;

const HOLO_GRAD = (id) => `<linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0%" stop-color="#f472b6"/><stop offset="22%" stop-color="#fbbf24"/>
  <stop offset="44%" stop-color="#4ade80"/><stop offset="66%" stop-color="#22d3ee"/>
  <stop offset="86%" stop-color="#818cf8"/><stop offset="100%" stop-color="#f472b6"/>
</linearGradient>`;

/** ผิวด้าน — ฟิล์มขุ่นบาง ๆ ทับลาย ทำให้สีดรอปลงนิดหน่อยและไม่มีเงาสะท้อน */
const matte = (g, clipId) => `
  <g clip-path="url(#${clipId})">
    <rect x="${g.cx - g.r}" y="${g.cy - g.r}" width="${g.r * 2}" height="${g.r * 2}" fill="#f1f5f9" opacity="0.34"/>
  </g>`;

const COATS = {
  "coat-gloss": {
    name: "เคลือบเงา",
    sub: "ผิวมันวาว สีสด สะท้อนแสง — ฟรี ไม่คิดเพิ่ม",
    foot: ["ผิวมาตรฐานของทางร้าน · ลายคมชัด สีจัดที่สุดในบรรดาผิวเคลือบ", "1 ชุด เลือกชนิดผิวเคลือบได้ 1 แบบ"],
    layer: (g) => gloss(g, 0.62),
  },
  "coat-matte": {
    name: "เคลือบด้าน",
    sub: "ผิวด้านนวล ไม่สะท้อนแสง ไม่เห็นรอยนิ้วมือ — ฟรี ไม่คิดเพิ่ม",
    foot: ["ฟิล์มด้านจะทำให้สีดรอปลงจากเคลือบเงาเล็กน้อย", "1 ชุด เลือกชนิดผิวเคลือบได้ 1 แบบ"],
    layer: (g, clip) => matte(g, clip),
  },
  "coat-sand": {
    name: "เคลือบพิเศษ · เนื้อทราย",
    sub: "ผิวสากละเอียดเหมือนเม็ดทราย จับแล้วรู้สึกได้",
    foot: ["บวกเพิ่มชุดละ 40 บาท", "1 ชุด เลือกชนิดผิวเคลือบได้ 1 แบบ"],
    layer: (g, clip) => `${matte(g, clip)}${speckles(g, clip, { count: 900, size: 2.1, colors: ["#ffffff", "#e2e8f0", "#94a3b8"], opacity: 0.5 })}`,
  },
  "coat-glitter": {
    name: "เคลือบพิเศษ · กลิสเตอร์",
    sub: "ฟิล์มกากเพชร มีประกายวิบวับเวลาโดนแสง",
    foot: ["บวกเพิ่มชุดละ 40 บาท", "1 ชุด เลือกชนิดผิวเคลือบได้ 1 แบบ"],
    layer: (g, clip) => `${gloss(g, 0.4)}${sparkles(g, clip, 150)}`,
  },
  "coat-holo": {
    name: "เคลือบพิเศษ · โฮโลแกรม",
    sub: "ฟิล์มเหลือบรุ้ง เปลี่ยนสีตามมุมมอง",
    foot: ["บวกเพิ่มชุดละ 40 บาท", "1 ชุด เลือกชนิดผิวเคลือบได้ 1 แบบ"],
    layer: (g, clip, grad) => `${holo(g, clip, grad)}${gloss(g, 0.45)}`,
  },
};

function coatArt(key) {
  const c = COATS[key];
  const g = hookGeom(W / 2, 418, 196);
  const clip = "d";
  const grad = "holo";
  return frame(
    `
    ${title(c.name, c.sub)}
    ${hookStem(g)}
    ${hookShell(g)}
    ${discArt(g, clip)}
    ${c.layer(g, clip, grad)}
    <circle cx="${g.cx}" cy="${g.cy}" r="${g.r * 0.9}" fill="none" stroke="#ffffff" stroke-width="6" opacity="0.85"/>
    <circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="none" stroke="${SHELL_EDGE}" stroke-width="3"/>
    ${callout(g.cx + g.r * 0.7, g.cy - g.r * 0.7, W - 108, 206, "ผิวเคลือบอยู่บนหน้าจานลาย", "end")}
    ${foot(c.foot)}`,
    `${discClip(clip, g)}${HOLO_GRAD(grad)}`
  );
}

// ── ขนาด 58 มม. ──────────────────────────────────────────────────────────
/** 1 มม. = 5.2 px — จานเส้นผ่านศูนย์กลาง 58 มม. กินพื้นที่กำลังดีในกรอบ 900px */
const PX_PER_MM = 5.2;

function sizeArt() {
  const r = (58 / 2) * PX_PER_MM;
  const g = hookGeom(W / 2, 402, r);
  const clip = "d";
  return frame(
    `
    ${title("ขนาดจาน 58 มม.", "มีขนาดเดียว · วาดตามสเกลจริง")}
    ${hookStem(g)}
    ${hookShell(g)}
    ${discArt(g, clip)}
    ${gloss(g, 0.5)}
    <circle cx="${g.cx}" cy="${g.cy}" r="${g.r * 0.9}" fill="none" stroke="#ffffff" stroke-width="6" opacity="0.85"/>
    ${dimH(g.cy - g.r - 34, g.cx - g.r, g.cx + g.r, "58 มม.")}
    ${callout(g.cx + g.stemW * 0.5 + g.tipLen * 0.8, g.bottom - g.tipLen * 0.5, W - 130, g.bottom + 4, "ก้านตะของ่ามเดียว", "end")}
    ${callout(g.cx - g.r * 0.7, g.cy + g.r * 0.7, 130, g.cy + g.r + 40, "จานพิมพ์ลายเต็มหน้า")}
    ${foot(["ตัวเรือนพลาสติกสีขาว ด้านหลังเป็นจุกยางสูญญากาศ", "ติดได้กับผิวเรียบมันเท่านั้น เช่น กระจก กระเบื้อง โลหะ"])}`,
    discClip(clip, g)
  );
}

// ── 1 เซ็ต = 5 ชิ้น ───────────────────────────────────────────────────────
function setArt() {
  const r = 64;
  const cols = [0, 1, 2, 3, 4].map((i) => W / 2 + (i - 2) * (r * 2 + 22));
  const rowY = 356;
  const pieces = cols
    .map((cx, i) => {
      const g = hookGeom(cx, rowY, r);
      return `${hookStem(g)}${hookShell(g)}${discArt(g, `d${i}`)}${gloss(g, 0.5)}
        <circle cx="${g.cx}" cy="${g.cy}" r="${g.r * 0.9}" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.85"/>
        <text x="${cx}" y="${g.bottom + 46}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ชิ้นที่ ${i + 1}</text>`;
    })
    .join("");
  const clips = cols.map((cx, i) => discClip(`d${i}`, hookGeom(cx, rowY, r))).join("");
  return frame(
    `
    ${title("1 เซ็ต = 5 ชิ้น", "ราคาในตารางเป็นราคาต่อเซ็ต")}
    <rect x="${cols[0] - r - 24}" y="${rowY - r - 30}" width="${cols[4] - cols[0] + r * 2 + 48}" height="${hookGeom(0, rowY, r).bottom - rowY + r + 92}"
      rx="26" fill="#f0f9ff" stroke="${CYAN}" stroke-width="3" stroke-dasharray="12 9"/>
    ${pieces}
    ${foot([
      "สั่ง 1-10 เซ็ต เซ็ตละ 230 · 11-30 เซ็ต 180 · 31-50 เซ็ต 150 · 51 เซ็ตขึ้นไป 140",
      "5 ชิ้นในเซ็ตใช้ลายเดียวกัน · จำนวน 1-5 เซ็ต คละลายได้",
    ])}`,
    clips
  );
}

const DRAWN = {
  "size-58": { svg: sizeArt(), note: "จาน 58 มม. ตามสเกลจริง" },
  "set-5": { svg: setArt(), note: "1 เซ็ต 5 ชิ้น + ราคาต่อเซ็ต" },
  ...Object.fromEntries(Object.keys(COATS).map((k) => [k, { svg: coatArt(k), note: COATS[k].name }])),
};

for (const [name, art] of Object.entries(DRAWN)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🖼  ${name}.jpg  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

console.log(`\n✅ รูปงานจริง 4 · ภาพวาด ${Object.keys(DRAWN).length} → ${OUT}`);
