#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ 3D Acrylic — "ตัวเลือกไหนหน้าตาเป็นแบบไหน"
 *
 *   node scripts/3d-acrylic-art.mjs [--out=<dir>]
 *
 * ได้ 8 ไฟล์ ลง .cache/3d-acrylic/upload — ใช้ของจริงของร้านทั้งหมด ไม่ได้วาดเดาเอง:
 *
 *   size-2 … size-6      ขนาดอะคริลิค 2-6 cm (ใช้ทั้งกลุ่ม "ขนาดชิ้นที่ 1" และ "ขนาดชิ้นที่ 2")
 *       ครอปจากรูปเทียบขนาดจริงของร้าน (academy-assets/acrylic/size-compare.jpg — วางเรียง 2-10 cm
 *       บนพื้นเดียวกัน) แล้วหรี่ขนาดอื่นลง เหลือขนาดที่เลือกสว่าง — ลูกค้าเห็นทั้งของจริงและเทียบขนาดได้
 *       ⚠️ ครอปเป็น "แถบเดียว" ไม่ได้ตัดทีละชิ้นมาแปะ ภาพจึงไม่มีรอยต่อ และสเกลระหว่างขนาดตรงของจริง
 *       ราคาบนการ์ดดึงสดจากเว็บตารางราคา (3d-acrylic-prices.mjs) — ตัวเลขไม่มีวันหลุดจากหน้าเว็บจริง
 *
 *   acrylic-clear        อะคริลิคใส        ← รูปงานจริงของสินค้านี้ (แกลเลอรีใบที่ 5 "งานอะคริลิคใสล้วน")
 *   acrylic-c02          อะคริลิคขาวขุ่น C-02 ← สวอตช์จากชาร์ตสีทางการของร้าน (acrylic-colors/c02)
 *   acrylic-special      อะคริลิคพิเศษ      ← รูปงานจริงใบที่ 1 (ฐานโฮโลแกรม) + สวอตช์จริงอีก 4 ลาย
 *
 * งานสกรีน 6 แบบมีภาพจากชุด acrylic-howto อยู่แล้ว จึงไม่แตะ
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { fetch3dAcrylicPrices } from "./3d-acrylic-prices.mjs";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/3d-acrylic/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const V = "v1";
const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";
const EDGE = "#e2e8f0";

const STORAGE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
/** รูปเทียบขนาดจริง — ไล่จากไดรฟ์ร้าน (คมกว่า) ลงมาที่ชุดใน AdminBuddy */
const SIZE_PHOTOS = [
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/size-compare.jpg",
  `${process.env.HOME}/Desktop/AdminBuddy/academy-assets/acrylic/size-compare.jpg`,
];
const SIZE_PHOTO = SIZE_PHOTOS.find((f) => existsSync(f));
if (!SIZE_PHOTO) throw new Error(`ไม่เจอรูปเทียบขนาด — หาที่:\n  ${SIZE_PHOTOS.join("\n  ")}`);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── โครงการ์ด ────────────────────────────────────────────────────────────
const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="${EDGE}" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="132" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

/** บรรทัดท้ายการ์ด — เรียงลงมาจาก y ที่กำหนด */
const foot = (lines, y0) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${y0 + i * 36}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

/** ป้ายราคา — กล่องฟ้าอ่อนกลางการ์ด */
const priceChip = (text, y, w = 560) => `
  <rect x="${(W - w) / 2}" y="${y}" width="${w}" height="66" rx="20" fill="#ecfeff" stroke="#a5f3fc" stroke-width="2"/>
  <text x="${W / 2}" y="${y + 44}" font-family="${TH}" font-size="31" font-weight="700" text-anchor="middle" fill="${CYAN}">${esc(text)}</text>`;

const uri = (buf, mime = "image/jpeg") => `data:${mime};base64,${buf.toString("base64")}`;

async function grab(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
/** ครอปจัตุรัสจากรูป (พิกัดของไฟล์ต้นฉบับ) แล้วย่อให้พอดีช่องที่จะวาง */
const square = async (buf, left, top, size, out) =>
  sharp(buf).extract({ left, top, width: size, height: size }).resize(out, out).jpeg({ quality: 92 }).toBuffer();

// ── ขนาด 2-6 cm ──────────────────────────────────────────────────────────
/**
 * กรอบชิ้นงานแต่ละขนาดบนรูปเทียบขนาด (พิกัดจริงของ size-compare.jpg 1600×814)
 * วัดมาจากตัวรูปเอง (สแกนหาพิกเซลที่มีสี) — ชิ้นงานวางชิดพื้นเดียวกัน สเกลจึงเทียบกันได้ตรง ๆ
 */
const PIECE_BOX = {
  "2cm": [70, 111, 503],
  "3cm": [147, 212, 480],
  "4cm": [236, 326, 455],
  "5cm": [360, 472, 429],
  "6cm": [505, 642, 400],
};
/** แถบที่ครอปมาใช้ = ขนาด 2-6 cm พร้อมห่วงพวงกุญแจด้านบนและป้าย cm ด้านล่าง */
const STRIP = { x: 42, y: 230, w: 616, h: 382 };
const STRIP_W = 760; // ความกว้างตอนวางบนการ์ด
const STRIP_H = Math.round((STRIP_W * STRIP.h) / STRIP.w);
const STRIP_X = (W - STRIP_W) / 2;
const STRIP_Y = 176;
const k = STRIP_W / STRIP.w; // สเกลจากพิกัดรูปต้นฉบับ → พิกัดบนการ์ด
const onCard = (x, y) => [STRIP_X + (x - STRIP.x) * k, STRIP_Y + (y - STRIP.y) * k];

async function sizeArt(size, prices) {
  const strip = await sharp(SIZE_PHOTO)
    .extract({ left: STRIP.x, top: STRIP.y, width: STRIP.w, height: STRIP.h })
    .resize(STRIP_W * 2) // อัดความละเอียดไว้ 2 เท่า กันเบลอตอนย่อเป็น JPEG
    .jpeg({ quality: 94 })
    .toBuffer();

  const [x0, x1, top] = PIECE_BOX[size];
  const [wx, wy] = onCard(x0 - 14, top - 26);
  const [wx2, wy2] = onCard(x1 + 14, 606); // ล่างสุดเผื่อถึงป้าย "N cm" ใต้ชิ้นงาน
  const [ww, wh] = [wx2 - wx, wy2 - wy];

  const cm = Number(size.replace("cm", ""));
  const [first] = prices.base[size];

  return frame(`
    ${title(`ขนาด ${cm} cm`, "วัดจากด้านที่ยาวที่สุดของอะคริลิค")}
    <defs>
      <clipPath id="strip"><rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" rx="22"/></clipPath>
      <!-- หรี่ทั้งแถบ เว้นช่องขนาดที่เลือกไว้สว่าง -->
      <mask id="dim">
        <rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" fill="#ffffff"/>
        <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="16" fill="#000000"/>
      </mask>
    </defs>
    <g clip-path="url(#strip)">
      <image href="${uri(strip)}" x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" preserveAspectRatio="xMidYMid slice"/>
      <rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" fill="#ffffff" opacity="0.66" mask="url(#dim)"/>
    </g>
    <rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" rx="22" fill="none" stroke="${EDGE}" stroke-width="2"/>
    <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="16" fill="none" stroke="${CYAN}" stroke-width="4"/>
    <text x="${STRIP_X + 16}" y="${STRIP_Y + STRIP_H + 32}" font-family="${TH}" font-size="21" fill="${SUB}">รูปงานจริงของร้าน — วางเทียบขนาด 2-6 cm บนพื้นเดียวกัน</text>
    ${priceChip(`ราคาชุดละ ${first}.-`, 682)}
    ${foot(
      [
        `${prices.tiers[0]} · สกรีน 1 ด้าน/ชิ้น · อะคริลิคใส — คิดราคาจากชิ้นที่ใหญ่ที่สุด`,
        "1 ชุด = อะคริลิค 2 ชิ้น เลือกขนาดได้ทั้ง 2 ชิ้น (ชิ้นที่ 2 ไม่เกินชิ้นที่ 1)",
      ],
      790
    )}`);
}

// ── ชนิดอะคริลิค ─────────────────────────────────────────────────────────
/** การ์ดรูปเดี่ยว — รูปจัตุรัสใหญ่กลางการ์ด */
const heroCard = (t, sub, img, size, lines) => {
  const x = (W - size) / 2;
  const y = 172;
  return frame(`
    ${title(t, sub)}
    <defs><clipPath id="hero"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="26"/></clipPath></defs>
    <image href="${img}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#hero)" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="26" fill="none" stroke="${EDGE}" stroke-width="2"/>
    ${foot(lines, y + size + 52)}`);
};

async function clearArt() {
  // แกลเลอรีใบที่ 5 = "งานอะคริลิคใสล้วน" (576×1024) — ครอปจัตุรัสตรงตัวงาน
  const buf = await grab(`${STORAGE}/3d-acrylic/05.jpg`);
  return heroCard(
    "อะคริลิคใส",
    "เนื้อใสมองทะลุ หนา 3 มม. — ชนิดมาตรฐาน",
    uri(await square(buf, 0, 330, 576, 1120)),
    560,
    ["สีของงานมาจากหมึกที่พิมพ์ ส่วนที่ไม่มีลายจะใส มองทะลุได้", "ราคาตามตาราง — ไม่บวกเพิ่ม"]
  );
}

async function c02Art() {
  const buf = await grab(`${STORAGE}/acrylic-colors/c02-v2.jpg`);
  return heroCard(
    "อะคริลิคขาวขุ่น C-02",
    "เนื้อขาวทึบ ผิวเงา 2 ด้าน",
    uri(buf),
    560,
    ["ลายเด่นกว่าอะคริลิคใส เพราะมีพื้นขาวหนุนหลัง (มองไม่ทะลุ)", "ราคาเท่าอะคริลิคใส — ไม่บวกเพิ่ม"]
  );
}

async function specialArt(prices) {
  const hero = uri(await square(await grab(`${STORAGE}/3d-acrylic/01.jpg`), 200, 225, 615, 880));
  const swatches = await Promise.all(
    [
      ["holo-rainbow-v2", "hologram-รุ้ง"],
      ["holo-01-v2", "hologram-01"],
      ["glitter-gold-v2", "กลิตเตอร์-ทอง"],
      ["mirror-v2", "อะคริลิคกระจก"],
    ].map(async ([file, name]) => [uri(await grab(`${STORAGE}/acrylic-colors/${file}.jpg`)), name])
  );

  const S = 120;
  const GAP = 24;
  const rowW = swatches.length * S + (swatches.length - 1) * GAP;
  const sx = (W - rowW) / 2;
  const sy = 622;
  const heroSize = 400;
  const hx = (W - heroSize) / 2;

  const retail = prices.special.retail["2cm"];
  const lowWholesale = Math.min(...prices.sizes.map((s) => prices.special.wholesale[s]));
  const highWholesale = Math.max(...prices.sizes.map((s) => prices.special.wholesale[s]));

  return frame(`
    ${title("อะคริลิคพิเศษ", "สี / โฮโลแกรม / กลิตเตอร์ — หนาประมาณ 2.5-3 มม.")}
    <defs><clipPath id="hero"><rect x="${hx}" y="160" width="${heroSize}" height="${heroSize}" rx="26"/></clipPath></defs>
    <image href="${hero}" x="${hx}" y="160" width="${heroSize}" height="${heroSize}" clip-path="url(#hero)" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${hx}" y="160" width="${heroSize}" height="${heroSize}" rx="26" fill="none" stroke="${EDGE}" stroke-width="2"/>
    <text x="${W / 2}" y="${160 + heroSize + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">งานจริง — ฐานอะคริลิคโฮโลแกรม ประกบตัวการ์ตูนอีกชิ้น</text>
    ${swatches
      .map(
        ([img, name], i) => `
      <defs><clipPath id="sw${i}"><rect x="${sx + i * (S + GAP)}" y="${sy}" width="${S}" height="${S}" rx="18"/></clipPath></defs>
      <image href="${img}" x="${sx + i * (S + GAP)}" y="${sy}" width="${S}" height="${S}" clip-path="url(#sw${i})" preserveAspectRatio="xMidYMid slice"/>
      <rect x="${sx + i * (S + GAP)}" y="${sy}" width="${S}" height="${S}" rx="18" fill="none" stroke="${EDGE}" stroke-width="2"/>
      <text x="${sx + i * (S + GAP) + S / 2}" y="${sy + S + 28}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">${esc(name)}</text>`
      )
      .join("")}
    ${foot(
      [
        `บวกเพิ่มชิ้นละ ${retail}.- (${prices.tiers[0]}) = ชุดละ ${retail * 2}.- · เรทส่งชิ้นละ ${lowWholesale}-${highWholesale}.-`,
        "ยังมีสี/ลายอื่นอีกหลายสิบแบบ — เลือกได้ในช่อง “หมายเหตุถึงร้าน”",
      ],
      812
    )}`);
}

// ── เขียนไฟล์ ────────────────────────────────────────────────────────────
const save = async (name, svg) => {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
};

const prices = await fetch3dAcrylicPrices();
console.log(`📥 ราคาบนการ์ดดึงสดจากเว็บตารางราคา — ${prices.sizes.map((s) => `${s} ${prices.base[s][0]}.-`).join(" · ")}\n`);
console.log(`📷 รูปเทียบขนาด: ${SIZE_PHOTO}\n`);

for (const size of prices.sizes) await save(`size-${size.replace("cm", "")}-${V}`, await sizeArt(size, prices));
await save(`acrylic-clear-${V}`, await clearArt());
await save(`acrylic-c02-${V}`, await c02Art());
await save(`acrylic-special-${V}`, await specialArt(prices));

console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
