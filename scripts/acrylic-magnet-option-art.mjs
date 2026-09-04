#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "แม่เหล็กอะคริลิค" (acrylicmagnet-1 · /products/แม่เหล็กอะคริลิค)
 *
 *   node scripts/acrylic-magnet-option-art.mjs           วาดภาพลง .cache/acrylicmagnet-1/upload (ยังไม่แตะ DB)
 *   node scripts/acrylic-magnet-option-art.mjs --write   + อัปโหลด storage + ตั้ง imageSrc/desc + อ่านกลับเทียบ
 *
 * 4 กลุ่มตัวเลือกใน DB (ห้ามแก้ชื่อกลุ่ม/ชื่อตัวเลือก — "ขนาดด้านยาวที่สุด" กับ "ชนิดอะคริลิค"
 * เป็นแกนตารางราคา driverLabels และ "สีอะคริลิค" เป็นตัวคุมกฎ rules ของชนิดอะคริลิค):
 *   ขนาดด้านยาวที่สุด  3-8 ซม.  → การ์ด 6 ใบ สเกลเดียวกัน (1 ซม. = 52 px) เห็นว่าใหญ่ต่างกันจริง
 *   ชนิดอะคริลิค      3 แบบ    → การ์ดใส / ขาวขุ่น C-02 / พิเศษ (เนื้อจริงจากชาร์ตสีของร้าน)
 *   สีอะคริลิค        45 เฉด   → มีภาพครบแล้ว 44 เฉด ขาดแต่ "อะคริลิคใส" → ครอปจากรูปงานจริงในแกลเลอรี
 *   แม่เหล็ก          ช่องจำนวน → ภาพด้านหลัง 1 จุด / 2 จุด / 3 จุด (จุดเพิ่มละ ฿10)
 *
 * ตัวชิ้นงานในภาพวาดแบบ "ไดคัทจริง": เอา alpha ของมาสคอตมาเบลอ+threshold = ขอบอะคริลิคล้อมลาย
 *   ⚠️ ต่อ .blur().threshold() ในไพป์ไลน์เดียวไม่ทำงาน ต้องคั่น toBuffer() (ดู memory sharp-blur-threshold)
 * ราคาบนการ์ดอ่านสดจาก data.pricing.cells ตอนรัน — ตารางเปลี่ยนเมื่อไหร่รันใหม่แล้วเลขตามทันที
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ขึ้น VER ใหม่
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { assetPath, MASCOTS } from "./iducky-assets.mjs";

const PRODUCT_ID = "acrylicmagnet-1";
const EXPECT_NAME = "แม่เหล็กอะคริลิค";
const VER = "v1";
/** การ์ดชนิดอะคริลิควาดใหม่ให้ชิ้นงานเต็มกรอบกว่าเดิม (ผู้ใช้ทัก 4 ก.ย. 69 ว่าภาพเล็กไป) — ขึ้นรุ่นใหม่เพราะ CDN แคชชื่อไฟล์เดิม */
const MAT_VER = "v4";
const OUT = ".cache/acrylicmagnet-1/upload";
const SRC = ".cache/acrylicmagnet-1/src";
mkdirSync(OUT, { recursive: true });
mkdirSync(SRC, { recursive: true });

const STORAGE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";

const W = 900;
const H = 900;
const CX = W / 2;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const EDGE = "#e2e8f0";

const SIZE_GROUP = "ขนาดด้านยาวที่สุด";
const TYPE_GROUP = "ชนิดอะคริลิค";
const COLOR_GROUP = "สีอะคริลิค";
const MAGNET_GROUP = "แม่เหล็ก";
const SIZES = ["3cm", "4cm", "5cm", "6cm", "7cm", "8cm"];
/** สเกลร่วมของการ์ดขนาดทั้ง 6 ใบ — 8 ซม. = 416 px พอดีแผงพื้นหลัง */
const PX_CM = 52;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** เขียนราคาเป็นคำว่า "บาท" — สัญลักษณ์ ฿ ในฟอนต์ไทยของเครื่องนี้ซ้อนทับตัวเลข */
const baht = (n) => `${n} บาท`;
const bahtRange = (a, b) => `${a}-${b} บาท`;
const uri = (buf, mime = "image/png") => `data:${mime};base64,${buf.toString("base64")}`;

// ── ข้อมูลจริงจากฐานข้อมูล (ราคา + ชื่อตัวเลือก) ─────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error: readErr } = await sb.from("products").select("name,data").eq("id", PRODUCT_ID).single();
if (readErr) throw readErr;
if (row.name !== EXPECT_NAME) throw new Error(`id "${PRODUCT_ID}" ตอนนี้ชื่อ "${row.name}" ไม่ใช่ "${EXPECT_NAME}" — หยุดก่อน`);
const P = row.data;
const cells = P.pricing?.cells ?? {};
const tiers = P.pricing?.tiers ?? [];
/** ราคาต่อชิ้นของ (ขนาด × ชนิด) ตามช่วงจำนวน — index 0 = 1-10 ชิ้น, ตัวสุดท้าย = 5000 ชิ้นขึ้นไป */
const price = (size, type) => cells[`${size}│${type}`] ?? null;
const retailOf = (size, type) => price(size, type)?.[0] ?? null;
const bulkOf = (size, type) => price(size, type)?.slice(-1)[0] ?? null;
for (const s of SIZES) for (const t of ["อะคริลิคใส", "อะคริลิคขาวขุ่น C-02", "อะคริลิคพิเศษ"]) {
  if (!price(s, t)) throw new Error(`ไม่เจอราคาในตาราง: ${s}│${t} — ตารางราคาเปลี่ยนไปแล้ว หยุดก่อน`);
}
const TIER_FIRST = tiers[0]?.label ?? "1-10 ชิ้น";
const TIER_LAST = tiers.at(-1)?.label ?? "5000 ชิ้นขึ้นไป";
/** ส่วนต่างของอะคริลิคพิเศษเทียบเนื้อใส (คิดทุกช่อง) — ใช้เขียนบนการ์ดให้ตรงตาราง */
const specialGap = (() => {
  const diffs = SIZES.flatMap((s) => price(s, "อะคริลิคพิเศษ").map((v, i) => v - price(s, "อะคริลิคใส")[i]));
  return { min: Math.min(...diffs), max: Math.max(...diffs) };
})();

// ── ภาพต้นทาง: มาสคอตเป็ด + สวอตช์เนื้ออะคริลิคจากชาร์ตสีของร้าน ────────
const grab = async (url, file) => {
  const path = `${SRC}/${file}`;
  if (!existsSync(path)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`โหลดไม่ได้ ${url} (${res.status})`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(path);
};
const swatch = (name) => grab(`${STORAGE}/acrylic-colors/${name}.jpg`, `${name}.jpg`);
/**
 * ⚠️ สวอตช์ในชาร์ตสีของร้านถ่ายเป็น "แผ่นวางบนพื้นขาว" — เอามาเทเป็นเนื้อชิ้นงานทั้งใบตรง ๆ
 * แล้วจะเห็นพื้นขาวของรูปโผล่เป็นแถบหัว-ท้ายในวงกลม (ผู้ใช้ทัก 4 ก.ย. 69)
 * แก้ 2 ชั้น: เล็มขอบขาวรอบรูปก่อน (trimWhite) แล้วค่อยเลือกช่วงที่เป็นเนื้อล้วน (bestPatch)
 */
async function trimWhite(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y, c) => data[(y * width + x) * channels + c];
  const white = (x, y) => at(x, y, 0) > 243 && at(x, y, 1) > 243 && at(x, y, 2) > 243;
  const sample = (n, max) => Array.from({ length: n }, (_, i) => Math.min(max - 1, Math.round(((i + 0.5) / n) * max)));
  const xs = sample(24, width);
  const ys = sample(24, height);
  let top = 0, bottom = height - 1, left = 0, right = width - 1;
  while (top < bottom && xs.every((x) => white(x, top))) top++;
  while (bottom > top && xs.every((x) => white(x, bottom))) bottom--;
  while (left < right && ys.every((y) => white(left, y))) left++;
  while (right > left && ys.every((y) => white(right, y))) right--;
  if (top === 0 && left === 0 && bottom === height - 1 && right === width - 1) return buf;
  return sharp(buf).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();
}
/**
 * เลือก "ช่วงที่เป็นเนื้อวัสดุจริง" จากรูปสวอตช์ — ไล่หน้าต่างจัตุรัสที่ขาว/เทาน้อยที่สุด
 * ชาร์ตสีของร้านถ่ายเป็นแผ่นวางบนพื้นขาว มักมีแถบกระดาษพาดทแยง เล็มแค่ขอบไม่พอ
 * (ผู้ใช้ทัก 4 ก.ย. 69 ว่าในวงกลมมีสีขาวหัว-ท้าย)
 */
async function bestPatch(buf, frac = 0.62) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const side = Math.round(Math.min(width, height) * frac);
  const step = Math.max(8, Math.round(side / 8));
  const paper = (x, y) => {
    const i = (y * width + x) * channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.max(r, g, b) > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 26;
  };
  let best = { x: 0, y: 0, score: Infinity };
  for (let y = 0; y + side <= height; y += step) {
    for (let x = 0; x + side <= width; x += step) {
      let bad = 0, n = 0;
      for (let dy = 0; dy < side; dy += 6) for (let dx = 0; dx < side; dx += 6) { n++; if (paper(x + dx, y + dy)) bad++; }
      if (bad / n < best.score) best = { x, y, score: bad / n };
    }
  }
  return sharp(buf).extract({ left: best.x, top: best.y, width: side, height: side }).png().toBuffer();
}
/** เนื้อวัสดุสำหรับเทเป็นพื้นชิ้นงาน = สวอตช์จริง → เล็มขอบขาว → ครอปช่วงที่เป็นเนื้อล้วน */
const texture = async (name) => bestPatch(await trimWhite(await swatch(name)));

/** รูปงานจริงใบแรกในแกลเลอรี — ใช้ครอปทำสวอตช์ "อะคริลิคใส" ของกลุ่มสีอะคริลิค */
const galleryPhoto = await grab(P.images?.[0]?.src ?? P.imageSrc, "gallery-1.jpg");

const MASCOT = await sharp(assetPath(MASCOTS.heart)).trim({ threshold: 1 }).png().toBuffer();
const MASCOT_META = await sharp(MASCOT).metadata();
const MASCOT_RATIO = MASCOT_META.width / MASCOT_META.height;

/** ประกอบชิ้นงานจาก mask (ขาว = เนื้ออะคริลิค) + เนื้อวัสดุ + ลายพิมพ์ */
async function buildPiece({ mask, w, h, artBuf, artLeft, artTop, fill }) {
  const maskAlpha = await sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } })
    .joinChannel(mask)
    .png()
    .toBuffer();
  const base = fill.texture
    ? await sharp(fill.texture).resize(w, h, { fit: "cover" }).ensureAlpha().png().toBuffer()
    : await sharp({ create: { width: w, height: h, channels: 4, background: fill.color } }).png().toBuffer();
  const shape = await sharp(base).composite([{ input: maskAlpha, blend: "dest-in" }]).png().toBuffer();
  const piece = artBuf
    ? await sharp(shape).composite([{ input: artBuf, left: artLeft, top: artTop }]).png().toBuffer()
    : shape;
  return { piece, mask, w, h };
}

/**
 * ชิ้นงานไดคัทตามทรงลาย — ขอบอะคริลิคได้จากการเบลอ alpha ของลายแล้ว threshold (เหมือนเส้นไดคัทจริง)
 *   longestCm = ด้านที่ยาวที่สุด (ตามที่ร้านวัดราคา) · pxCm = สเกล px ต่อ ซม.
 *   fill = { texture: Buffer } เนื้อวัสดุจริง หรือ { color: {r,g,b,alpha} } เนื้อโปร่ง/สีเรียบ
 * คืน { piece, mask, w, h } — piece = PNG ชิ้นงานพร้อมลาย · mask = ขาว-ดำ ไว้ทำไฮไลต์ผิวใน SVG
 */
async function diecut({ longestCm, pxCm, fill, borderMm = 2, art = true }) {
  const artH = Math.round(longestCm * pxCm);
  const artW = Math.round(artH * MASCOT_RATIO);
  const border = Math.max(3, Math.round((borderMm / 10) * pxCm));
  const pad = border * 3;
  const w = artW + pad * 2;
  const h = artH + pad * 2;

  const artBuf = await sharp(MASCOT).resize({ height: artH }).png().toBuffer();
  const alpha = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: artBuf, left: pad, top: pad }])
    .extractChannel("alpha")
    .png()
    .toBuffer();
  /* ⚠️ ต้องคั่น toBuffer() ระหว่าง blur กับ threshold ไม่งั้น threshold ไม่ทำงาน */
  const blurred = await sharp(alpha).blur(border / 1.7).png().toBuffer();
  const mask = await sharp(blurred).threshold(30).png().toBuffer();
  return buildPiece({ mask, w, h, artBuf: art ? artBuf : null, artLeft: pad, artTop: pad, fill });
}

/**
 * ชิ้นงานทรงกลม — ใช้กับการ์ด "ชนิดอะคริลิค" เพราะเหลือเนื้อรอบลายเยอะ เห็นวัสดุจริงชัดกว่าทรงไดคัท
 * (ของจริงในแกลเลอรีก็มีทั้งทรงกลมและไดคัทตามลาย)
 */
async function roundPiece({ diameterPx, fill, artScale = 0.66 }) {
  const d = Math.round(diameterPx);
  const mask = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><rect width="${d}" height="${d}" fill="#000"/><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 1}" fill="#fff"/></svg>`
    )
  )
    .greyscale()
    .toColourspace("b-w")
    .png()
    .toBuffer();
  const artH = Math.round(d * artScale);
  const artBuf = await sharp(MASCOT).resize({ height: artH }).png().toBuffer();
  const artW = Math.round(artH * MASCOT_RATIO);
  return buildPiece({
    mask,
    w: d,
    h: d,
    artBuf,
    artLeft: Math.round((d - artW) / 2),
    artTop: Math.round((d - artH) / 2),
    fill,
  });
}

/** วาง <image> ชิ้นงานให้กึ่งกลางอยู่ที่ (cx,cy) + เงา + ไฮไลต์ผิวเงาที่คลิปตามทรงไดคัท */
const pieceSvg = (d, cx, cy, id, { shadow = true, gloss = true } = {}) => {
  const x = cx - d.w / 2;
  const y = cy - d.h / 2;
  return `
  <defs>
    <mask id="pm${id}"><image href="${uri(d.mask)}" x="${x}" y="${y}" width="${d.w}" height="${d.h}"/></mask>
    ${shadow ? `<filter id="sh${id}" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#0f172a" flood-opacity="0.22"/></filter>` : ""}
    ${gloss ? `<linearGradient id="gl${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.45" stop-color="#0f172a" stop-opacity="0"/><stop offset="1" stop-color="#0f172a" stop-opacity="0.07"/>
    </linearGradient>` : ""}
  </defs>
  <image href="${uri(d.piece)}" x="${x}" y="${y}" width="${d.w}" height="${d.h}" ${shadow ? `filter="url(#sh${id})"` : ""}/>
  ${
    gloss
      ? `<g mask="url(#pm${id})">
      <ellipse cx="${cx - d.w * 0.2}" cy="${cy - d.h * 0.24}" rx="${d.w * 0.34}" ry="${d.h * 0.16}"
        fill="#ffffff" opacity="0.28" transform="rotate(-28 ${cx - d.w * 0.2} ${cy - d.h * 0.24})"/>
      <rect x="${x}" y="${y}" width="${d.w}" height="${d.h}" fill="url(#gl${id})"/>
    </g>`
      : ""
  }`;
};

// ── ชิ้นส่วนการ์ดที่ใช้ร่วมกัน ────────────────────────────────────────────
const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="${EDGE}" stroke-width="2"/>
  ${inner}
</svg>`;

const title = (t, sub) => `
  <text x="${CX}" y="84" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  <text x="${CX}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>`;

/** แผงพื้นหลัง "ผิวตู้เย็น" — ชิ้นงานติดอยู่บนแผ่นโลหะอ่อน ๆ ให้รู้ว่าเป็นแม่เหล็ก */
const fridge = (x, y, w, h) => `
  <defs>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1f5f9"/><stop offset="0.5" stop-color="#e8eef4"/><stop offset="1" stop-color="#dfe7ee"/>
    </linearGradient>
  </defs>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="url(#steel)" stroke="#cfd9e3" stroke-width="2"/>
  ${Array.from({ length: Math.floor(w / 26) }, (_, i) => `<line x1="${x + 13 + i * 26}" y1="${y + 6}" x2="${x + 13 + i * 26}" y2="${y + h - 6}" stroke="#ffffff" stroke-width="3" opacity="0.5"/>`).join("")}`;

/** ลูกศรวัดแนวตั้ง (ด้านยาวที่สุดของชิ้นงานคือแนวตั้ง) */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
  <line x1="${x - 11}" y1="${y1}" x2="${x + 11}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
  <line x1="${x - 11}" y1="${y2}" x2="${x + 11}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
  <rect x="${x - 52}" y="${(y1 + y2) / 2 - 19}" width="104" height="38" rx="9" fill="#ffffff" opacity="0.96"/>
  <text x="${x}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${SUB}">${esc(label)}</text>`;

const foot = (lines, y) =>
  lines
    .map(
      (t, i) =>
        `<text x="${CX}" y="${y + i * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${esc(t)}</text>`
    )
    .join("");

/** แม่เหล็กกลมด้านหลัง — จานสีเทาเข้ม มีขอบกาวจาง ๆ (ของจริงเป็นแม่เหล็กกลมสีเทา) */
const magnetDot = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r * 1.16}" fill="#94a3b8" opacity="0.28"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#6b7686"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#475569" stroke-width="${Math.max(1.5, r * 0.09)}"/>
  <ellipse cx="${cx - r * 0.3}" cy="${cy - r * 0.34}" rx="${r * 0.42}" ry="${r * 0.26}" fill="#ffffff" opacity="0.3" transform="rotate(-25 ${cx - r * 0.3} ${cy - r * 0.34})"/>`;

// ══ การ์ดขนาด 6 ใบ ═══════════════════════════════════════════════════════
const PANEL = { x: 96, y: 150, w: 708, h: 440 };
const PIECE_CY = PANEL.y + PANEL.h / 2;
const TAG_Y = 666; // จุดกึ่งกลางป้ายเลขขนาด (สูง 104) → 614-718

/** แถบเทียบขนาดทั้ง 6 ใบ (สเกลย่อร่วมกัน) — ก้นเสมอกัน ไฮไลต์ใบที่เลือกอยู่ */
const compareStrip = (curCm) => {
  const CM = 10; // px ต่อ ซม. ในแถบเทียบ (8 ซม. = 80 px)
  const gap = 26;
  const nums = SIZES.map((s) => Number(s.replace("cm", "")));
  const total = nums.reduce((a, n) => a + n * CM * MASCOT_RATIO, 0) + gap * (nums.length - 1);
  const footY = 822;
  let x = CX - total / 2;
  const parts = nums.map((n) => {
    const bw = n * CM * MASCOT_RATIO;
    const bh = n * CM;
    const on = n === curCm;
    const out = `<rect x="${x}" y="${footY - bh}" width="${bw}" height="${bh}" rx="${bw * 0.22}"
        fill="${on ? "#cffafe" : "#eef2f7"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="${on ? 3 : 2}"/>
      <text x="${x + bw / 2}" y="${footY + 26}" font-family="${TH}" font-size="19" font-weight="${on ? 700 : 400}"
        text-anchor="middle" fill="${on ? OK : SUB}">${n}</text>`;
    x += bw + gap;
    return out;
  });
  return `<line x1="${CX - total / 2 - 16}" y1="${footY}" x2="${CX + total / 2 + 16}" y2="${footY}" stroke="#e2e8f0" stroke-width="2"/>
    ${parts.join("")}`;
};

async function sizeCard(size) {
  const cm = Number(size.replace("cm", ""));
  const d = await diecut({ longestCm: cm, pxCm: PX_CM, fill: { color: { r: 255, g: 255, b: 255, alpha: 0.62 } } });
  const pieceH = cm * PX_CM;
  const retail = retailOf(size, "อะคริลิคใส");
  const bulk = bulkOf(size, "อะคริลิคใส");
  const tag = `${cm} ซม.`;
  const tagW = 300;
  const dimX = CX + d.w / 2 + 46;
  return frame(`
    ${title(`ขนาด ${cm} ซม.`, "วัดจากด้านที่ยาวที่สุดของลาย (ไม่วัดแนวทแยง)")}
    ${fridge(PANEL.x, PANEL.y, PANEL.w, PANEL.h)}
    ${pieceSvg(d, CX, PIECE_CY, `s${cm}`)}
    ${dimV(dimX, PIECE_CY - pieceH / 2, PIECE_CY + pieceH / 2, tag)}

    <!-- ป้ายราคาเนื้อใส/ขาวขุ่น (อ่านสดจากตารางราคา) -->
    <rect x="${PANEL.x + 14}" y="${PANEL.y + 14}" width="236" height="78" rx="18" fill="#ffffff" opacity="0.94" stroke="#a5f3fc" stroke-width="2"/>
    <text x="${PANEL.x + 132}" y="${PANEL.y + 45}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ชิ้นละ</text>
    <text x="${PANEL.x + 132}" y="${PANEL.y + 77}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${OK}">${bahtRange(bulk, retail)}</text>

    <!-- ป้ายเลขขนาดตัวใหญ่ — ปุ่มตัวเลือกย่อเหลือ 48px ต้องยังอ่านออก -->
    <rect x="${CX - tagW / 2}" y="${TAG_Y - 52}" width="${tagW}" height="104" rx="26" fill="#ffffff" stroke="${OK}" stroke-width="3"/>
    <text x="${CX}" y="${TAG_Y + 24}" font-family="${TH}" font-size="72" font-weight="800" text-anchor="middle" fill="${INK}">${esc(tag)}</text>

    ${compareStrip(cm)}
    ${foot([`ทุกใบสเกลเดียวกัน · ${baht(retail)} ที่ ${TIER_FIRST} → ${baht(bulk)} ที่ ${TIER_LAST}`], 880)}`);
}

// ══ การ์ดชนิดอะคริลิค 3 ใบ ═══════════════════════════════════════════════
const TYPE_PANEL = { x: 60, y: 138, w: 780, h: 486 };
/** เส้นผ่านศูนย์กลางชิ้นตัวอย่าง — เต็มความสูงแผงเกือบหมด (ผู้ใช้ทัก 4 ก.ย. 69 ว่าเดิมภาพเล็กไป) */
const TYPE_D = 452;

/** ค่าประจำแต่ละชนิด — texture = สวอตช์เนื้อจริงจากชาร์ตสีของร้าน */
const TYPES = {
  clear: {
    choice: "อะคริลิคใส",
    title: "อะคริลิคใส",
    sub: "เนื้อใสมองทะลุ — ชนิดมาตรฐาน",
    short: "ใส",
    fill: { color: { r: 255, g: 255, b: 255, alpha: 0.42 } },
  },
  c02: {
    choice: "อะคริลิคขาวขุ่น C-02",
    title: "อะคริลิคขาวขุ่น C-02",
    sub: "เนื้อขาวทึบ ผิวเงา 2 ด้าน",
    short: "ขาวขุ่น",
    /* เนื้อ C-02 คือแผ่นขาวล้วน — สวอตช์จริงในชาร์ตมีตัวหนังสือกำกับ เอามาเป็นพื้นชิ้นงานไม่ได้ */
    fill: { color: { r: 255, g: 255, b: 255, alpha: 1 } },
  },
  special: {
    choice: "อะคริลิคพิเศษ",
    title: "อะคริลิคพิเศษ",
    sub: "สี / กลิตเตอร์ / โฮโลแกรม / กระจก — เลือกเฉดในกลุ่ม “สีอะคริลิค”",
    short: "พิเศษ",
    /* ผู้ใช้เลือกลายนี้เอง 4 ก.ย. 69 (เทียบ 12 ลายในคลังสีกลางแล้ว) */
    texture: "glitter-gold-v2",
  },
};
const typeFill = async (t) => (t.texture ? { texture: await texture(t.texture) } : t.fill);

/** แถบเทียบ 3 ชนิดด้านล่างการ์ด — ชิ้นเดียวกันคนละเนื้อ ไฮไลต์ใบที่กำลังดู */
async function typeStrip(curKey) {
  const keys = Object.keys(TYPES);
  const D = 92;
  const gap = 104;
  const total = keys.length * D + (keys.length - 1) * gap;
  const y = 712;
  let x = CX - total / 2;
  const parts = [];
  for (const k of keys) {
    const on = k === curKey;
    const p = await roundPiece({ diameterPx: D, fill: await typeFill(TYPES[k]), artScale: 0.6 });
    const cx = x + D / 2;
    parts.push(`
      <circle cx="${cx}" cy="${y}" r="${D / 2 + 9}" fill="${on ? "#cffafe" : "#f1f5f9"}" stroke="${on ? OK : "#e2e8f0"}" stroke-width="${on ? 3 : 2}"/>
      ${pieceSvg(p, cx, y, `ts${k}`, { shadow: false, gloss: false })}
      <text x="${cx}" y="${y + D / 2 + 42}" font-family="${TH}" font-size="20" font-weight="${on ? 700 : 400}"
        text-anchor="middle" fill="${on ? OK : SUB}">${esc(TYPES[k].short)}</text>`);
    x += D + gap;
  }
  return parts.join("");
}

async function typeCard(key) {
  const t = TYPES[key];
  const foots = {
    clear: [
      "ส่วนที่ไม่มีลายจะใส — เห็นแถบสีที่อยู่ข้างหลังทะลุขึ้นมา",
      `ราคามาตรฐาน · ${TIER_FIRST} ${bahtRange(retailOf("3cm", "อะคริลิคใส"), retailOf("8cm", "อะคริลิคใส"))} ตามขนาด`,
    ],
    c02: ["เนื้อขาวทึบหนุนหลัง สีลายจึงจัดกว่าเนื้อใส (มองไม่ทะลุ)", "ราคาเท่าอะคริลิคใส — ไม่บวกเพิ่ม"],
    special: [
      `บวกเพิ่มชิ้นละ ${bahtRange(specialGap.min, specialGap.max)} จากเนื้อใส (แล้วแต่ขนาด/จำนวน)`,
      "เลือกได้ 44 เฉดในกลุ่ม “สีอะคริลิค” — ส่วนที่ไม่มีลายจะเป็นเนื้อเฉดนั้น",
    ],
  }[key];

  const d = await roundPiece({ diameterPx: TYPE_D, fill: await typeFill(t) });
  /* ชิ้นงานเป็นพระเอก — กินความสูงแผงเกือบหมด เยื้องซ้ายพอให้สวอตช์เนื้อจริงเรียงเป็นคอลัมน์ขวา */
  const pcx = 372;
  const pcy = TYPE_PANEL.y + TYPE_PANEL.h / 2;
  /* แถบสีทึบพาดหลังชิ้นงาน — เนื้อใสจะเห็นทะลุ ส่วนขาวขุ่น/พิเศษบังมิด (บอกความโปร่งโดยไม่ต้องอธิบาย) */
  const bandRight = 660;
  const band = `
    <rect x="${TYPE_PANEL.x + 24}" y="${pcy - 34}" width="${bandRight - TYPE_PANEL.x - 24}" height="68" rx="34" fill="#0e7490" opacity="0.9"/>
    <text x="${TYPE_PANEL.x + 26}" y="${TYPE_PANEL.y + 32}" font-family="${TH}" font-size="18" fill="${SUB}">แถบสีนี้อยู่ “หลัง” ชิ้นงาน</text>`;

  /* คอลัมน์ขวาของแผง: สวอตช์เนื้อจริงจากชาร์ตสีของร้าน (เนื้อใสไม่มีสวอตช์ — เขียนกำกับแทน) */
  const COL = { x: 686, w: 132 };
  const swatchRow =
    key === "special"
      ? await (async () => {
          const list = ["holo-rainbow-v2", "glitter-gold-v2", "mirror-v2", "p-v2"];
          const S = 96;
          const gap = 10;
          const x = COL.x + (COL.w - S) / 2;
          const y0 = TYPE_PANEL.y + 22;
          const cells = await Promise.all(
            list.map(async (f, i) => {
              const y = y0 + i * (S + gap);
              return `
        <defs><clipPath id="sw${key}${i}"><rect x="${x}" y="${y}" width="${S}" height="${S}" rx="16"/></clipPath></defs>
        <image href="${uri(await swatch(f), "image/jpeg")}" x="${x}" y="${y}" width="${S}" height="${S}"
          clip-path="url(#sw${key}${i})" preserveAspectRatio="xMidYMid slice"/>
        <rect x="${x}" y="${y}" width="${S}" height="${S}" rx="16" fill="none" stroke="${EDGE}" stroke-width="2"/>`;
            })
          );
          return `${cells.join("")}
        <text x="${COL.x + COL.w / 2}" y="${TYPE_PANEL.y + TYPE_PANEL.h - 24}" font-family="${TH}" font-size="18"
          text-anchor="middle" fill="${SUB}">4 จาก 44 เฉด</text>`;
        })()
      : key === "c02"
        ? await (async () => {
            const S = 132;
            const x = COL.x;
            const y = pcy - S / 2 - 12;
            return `
        <defs><clipPath id="swc02"><rect x="${x}" y="${y}" width="${S}" height="${S}" rx="18"/></clipPath></defs>
        <image href="${uri(await swatch("c02-v2"), "image/jpeg")}" x="${x}" y="${y}" width="${S}" height="${S}"
          clip-path="url(#swc02)" preserveAspectRatio="xMidYMid slice"/>
        <rect x="${x}" y="${y}" width="${S}" height="${S}" rx="18" fill="none" stroke="${EDGE}" stroke-width="2"/>
        <text x="${x + S / 2}" y="${y + S + 26}" font-family="${TH}" font-size="17" text-anchor="middle" fill="${SUB}">สวอตช์เนื้อจริง</text>`;
          })()
        : `<text x="${COL.x + COL.w / 2}" y="${pcy - 4}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ไม่มีพื้นสี</text>
       <text x="${COL.x + COL.w / 2}" y="${pcy + 26}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">หนุนหลัง</text>`;

  return frame(`
    ${title(t.title, t.sub)}
    ${fridge(TYPE_PANEL.x, TYPE_PANEL.y, TYPE_PANEL.w, TYPE_PANEL.h)}
    ${band}
    ${pieceSvg(d, pcx, pcy, `t${key}`)}
    ${swatchRow}
    <text x="${CX}" y="${656}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ชิ้นเดียวกัน เทียบ 3 ชนิดเนื้อ</text>
    ${await typeStrip(key)}
    ${foot(foots, 838)}`);
}

// ══ ภาพกลุ่มแม่เหล็ก (จุดติดแม่เหล็ก) ════════════════════════════════════
async function magnetCard(extra) {
  const cms = [4, 6, 8];
  const dots = [1, 2, 3];
  const PX = 34;
  const FOOT_Y = 520; // ก้นชิ้นงานเสมอกันทั้ง 3 ใบ
  const pieces = await Promise.all(
    cms.map((cm) => diecut({ longestCm: cm, pxCm: PX, fill: { color: { r: 246, g: 249, b: 252, alpha: 1 } }, art: false }))
  );
  const xs = [230, 450, 676];
  const bodies = pieces
    .map((d, i) => {
      const n = dots[i];
      const h = cms[i] * PX;
      const cy = FOOT_Y - h / 2;
      const spread = h / (n + 1);
      const ds = Array.from({ length: n }, (_, k) =>
        magnetDot(xs[i], cy - h / 2 + spread * (k + 1), Math.min(22, 9 + cms[i] * 1.6))
      ).join("");
      return `${pieceSvg(d, xs[i], cy, `m${i}`, { gloss: false })}${ds}
        <text x="${xs[i]}" y="${584}" font-family="${TH}" font-size="27" font-weight="700"
          text-anchor="middle" fill="${INK}">${n} จุด</text>
        <text x="${xs[i]}" y="${616}" font-family="${TH}" font-size="20"
          text-anchor="middle" fill="${n === 1 ? OK : SUB}">${n === 1 ? "รวมในราคาแล้ว" : `+${baht(extra * (n - 1))}`}</text>
        <text x="${xs[i]}" y="${646}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ชิ้น ${cms[i]} ซม.</text>`;
    })
    .join("");
  return frame(`
    ${title("แม่เหล็กด้านหลัง", `ทุกชิ้นติดแม่เหล็กให้ 1 จุด — เพิ่มได้จุดละ ${baht(extra)} (สูงสุด 3 จุด)`)}
    ${fridge(110, 156, 680, 386)}
    ${bodies}
    <rect x="150" y="676" width="600" height="88" rx="20" fill="#ecfeff" stroke="#a5f3fc" stroke-width="2"/>
    <text x="${CX}" y="${711}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${INK}">ชิ้นยาว ๆ หรือชิ้นใหญ่ ควรเพิ่มเป็น 2-3 จุด</text>
    <text x="${CX}" y="${743}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ไม่งั้นชิ้นงานจะหมุนตกลงมาเวลาติดตู้เย็น</text>
    ${foot(["ภาพนี้คือ “ด้านหลัง” ของชิ้นงาน — ด้านหน้าเป็นลายพิมพ์ UV เต็มชิ้น", "แม่เหล็กอาจมีคราบกาวเล็กน้อยตามเงื่อนไขร้าน"], 812)}`);
}

// ══ สวอตช์ “อะคริลิคใส” ของกลุ่มสีอะคริลิค (ครอปจากรูปงานจริง) ═══════════
/** เฉดอื่นอีก 44 เฉดเป็นรูปถ่ายเนื้อวัสดุจริง — ใบนี้เลยครอปจากงานจริงในแกลเลอรี ไม่วาดเอง */
async function clearSwatch() {
  const meta = await sharp(galleryPhoto).metadata();
  /* ชิ้นกลมใสมุมซ้ายบนของรูปแกลเลอรี (1200×800) — เผื่อรูปเปลี่ยนขนาดให้คิดเป็นสัดส่วน */
  const left = Math.round(meta.width * 0.15);
  const top = Math.round(meta.height * 0.2);
  const side = Math.round(meta.width * 0.235);
  return sharp(galleryPhoto).extract({ left, top, width: side, height: side }).resize(640, 640).jpeg({ quality: 92 }).toBuffer();
}

// ── วาดทั้งชุด ────────────────────────────────────────────────────────────
const jpg = (svg) => sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
const built = [];
const add = async (file, buf, note) => {
  writeFileSync(`${OUT}/${file}`, buf);
  built.push({ file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${note}`);
};

for (const size of SIZES) await add(`size-${size.replace("cm", "")}-${VER}.jpg`, await jpg(await sizeCard(size)), `ขนาด ${size}`);
await add(`mat-clear-${MAT_VER}.jpg`, await jpg(await typeCard("clear")), "ชนิด: อะคริลิคใส");
await add(`mat-c02-${MAT_VER}.jpg`, await jpg(await typeCard("c02")), "ชนิด: ขาวขุ่น C-02");
await add(`mat-special-${MAT_VER}.jpg`, await jpg(await typeCard("special")), "ชนิด: อะคริลิคพิเศษ");

const magnetChoice = (P.options ?? []).find((o) => o.label === MAGNET_GROUP)?.choices?.[0];
const MAGNET_EXTRA = magnetChoice?.extra ?? 10;
await add(`magnet-points-${VER}.jpg`, await jpg(await magnetCard(MAGNET_EXTRA)), `แม่เหล็ก: จุดละ ฿${MAGNET_EXTRA}`);
await add(`shade-clear-${VER}.jpg`, await clearSwatch(), "สีอะคริลิค: อะคริลิคใส (ครอปงานจริง)");

/* แผ่นรวมย่อ 48px = สิ่งที่เห็นจริงบนการ์ดตัวเลือกทรงกระชับ — ตรวจว่าแยกออกจากกัน */
const thumbs = built.filter((b) => b.file.startsWith("size-"));
await sharp({ create: { width: 48 * thumbs.length, height: 48, channels: 3, background: "#ffffff" } })
  .composite(await Promise.all(thumbs.map(async (b, i) => ({ input: await sharp(b.buf).resize(48, 48).toBuffer(), left: i * 48, top: 0 }))))
  .png()
  .toFile(`${OUT}/_thumbs-48.png`);
console.log(`🔎 ${OUT}/_thumbs-48.png — การ์ดขนาดย่อ 48px เรียงเทียบ`);

const WRITE = process.argv.includes("--write");
if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)");
  process.exit(0);
}

// ── อัปโหลด + เขียน options ───────────────────────────────────────────────
const url = {};
for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.file] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("⬆️  ", key);
}

/** ตัวเลือก → { ภาพ, คำอธิบาย } — desc โชว์เฉพาะการ์ดทรงปกติ (กลุ่มขนาด 6 ใบเป็นทรงกระชับ ไม่โชว์) */
const PLAN = {
  [SIZE_GROUP]: Object.fromEntries(
    SIZES.map((s) => {
      const cm = Number(s.replace("cm", ""));
      return [
        s,
        {
          file: `size-${cm}-${VER}.jpg`,
          desc: `ด้านยาวที่สุด ${cm} ซม. · เนื้อใส/ขาวขุ่น ฿${bulkOf(s, "อะคริลิคใส")}-฿${retailOf(s, "อะคริลิคใส")} ต่อชิ้น`,
        },
      ];
    })
  ),
  [TYPE_GROUP]: {
    อะคริลิคใส: { file: `mat-clear-${MAT_VER}.jpg`, desc: "เนื้อใสมองทะลุ ส่วนที่ไม่มีลายจะโปร่ง — ราคามาตรฐาน" },
    "อะคริลิคขาวขุ่น C-02": { file: `mat-c02-${MAT_VER}.jpg`, desc: "เนื้อขาวทึบ ผิวเงา 2 ด้าน ลายสีจัดกว่าเนื้อใส — ราคาเท่าเนื้อใส" },
    อะคริลิคพิเศษ: {
      file: `mat-special-${MAT_VER}.jpg`,
      desc: `สี/กลิตเตอร์/โฮโลแกรม/กระจก 44 เฉด — บวกเพิ่มชิ้นละ ฿${specialGap.min}-฿${specialGap.max}`,
    },
  },
  [COLOR_GROUP]: { อะคริลิคใส: { file: `shade-clear-${VER}.jpg` } },
  [MAGNET_GROUP]: { [magnetChoice?.name]: { file: `magnet-points-${VER}.jpg` } },
};

const { data: fresh, error: freshErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (freshErr) throw freshErr;
const data = fresh.data;
for (const [label, plan] of Object.entries(PLAN)) {
  const group = (data.options ?? []).find((o) => o.label === label);
  if (!group) { console.error(`ไม่เจอกลุ่ม "${label}" — หยุดก่อน`); process.exit(1); }
  for (const [choiceName, spec] of Object.entries(plan)) {
    const c = (group.choices ?? []).find((x) => x.name === choiceName);
    if (!c) { console.error(`ไม่เจอตัวเลือก "${label} → ${choiceName}" — หยุดก่อน`); process.exit(1); }
    c.imageSrc = url[spec.file];
    if (spec.desc) c.desc = spec.desc;
  }
}
/* กลุ่มขนาด + ชนิด เปลี่ยนเป็นการ์ด (เห็นภาพทันทีไม่ต้องกางดรอปดาวน์) — กลุ่มสี 45 เฉดคงทรงสวอตช์เดิม */
for (const label of [SIZE_GROUP, TYPE_GROUP]) data.options.find((o) => o.label === label).display = "cards";
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — update ที่ไม่ error ไม่ได้แปลว่าค่าลงจริง
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const [label, plan] of Object.entries(PLAN)) {
  const g = back.data.options.find((o) => o.label === label);
  for (const [choiceName, spec] of Object.entries(plan)) {
    const c = g.choices.find((x) => x.name === choiceName);
    if (c?.imageSrc !== url[spec.file]) { console.error("อ่านกลับไม่ตรง:", label, choiceName, c?.imageSrc); process.exit(1); }
    if (spec.desc && c.desc !== spec.desc) { console.error("desc ไม่ตรง:", label, choiceName); process.exit(1); }
  }
}
for (const label of [SIZE_GROUP, TYPE_GROUP]) {
  const g = back.data.options.find((o) => o.label === label);
  if (g.display !== "cards") { console.error(`display ของ "${label}" ไม่ใช่ cards`, g.display); process.exit(1); }
}
console.log(`\n✓ ใส่ภาพครบ ${built.length} ใบ · กลุ่มขนาด+ชนิดเป็นการ์ด · อ่านกลับตรง · savedAt = ${back.data.savedAt}`);
