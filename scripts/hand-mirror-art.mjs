#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "กระจกถือ" (mirror-hand)
 *
 *   node scripts/hand-mirror-art.mjs [--out=<dir>]
 *
 * ได้ 11 ไฟล์ ลง .cache/hand-mirror/upload — ที่มาแยกเป็น 3 ทาง:
 *
 * 1) ภาพเรนเดอร์สีของร้านเอง (แกลเลอรีบล็อก "กระจกถือ" หน้า pricelists)
 *    ชื่อไฟล์บนเว็บบอกแบบตรง ๆ ว่าอันไหนคือสีอะไร:
 *      mirroSBด้าน / mirroSWด้าน   = ทรงสี่เหลี่ยม ดำ/ขาว "ผิวด้าน" → สีสแตนดาร์ด
 *      mirrorSB / mirrorSW-01       = ทรงสี่เหลี่ยม ดำ/ขาว ประกายมุก → สีพรีเมี่ยม
 *      mirroHBด้าน / mirroHWด้าน   = ทรงหัวใจ ดำ/ขาว ผิวด้าน → สีสแตนดาร์ด
 *      mirrorHB-01 / mirrorHW-01    = ทรงหัวใจ ดำ/ขาว ประกายมุก → สีพรีเมี่ยม
 *    การ์ดสีหนึ่งใบ = วางเรนเดอร์ทั้งสองทรงคู่กัน ลูกค้าเห็นทันทีว่าสีนั้นมีทรงไหนบ้าง
 *
 * 2) ครอปรูปงานจริงในบล็อกเดียวกัน
 *    shape-square / shape-heart   ภาพประจำ "ทรง"
 *    color-pink                    กระจกหัวใจสีชมพู (สีนี้ร้านมีแต่รูปงานจริง ไม่มีเรนเดอร์)
 *    howto-file                    อินโฟกราฟิก "HOW TO วิธีการทำไฟล์" ของกระจกถือ (ใช้ในแท็บ)
 *
 * 3) ประกอบเอง โดยยึด "เงา" (silhouette) ที่ตัดจากภาพเรนเดอร์จริง — รูปทรงจึงตรงของจริง ไม่ใช่วาดมั่ว
 *    color-blue   ⚠️ "สีฟ้า" ร้านไม่มีทั้งรูปงานจริงและเรนเดอร์บนหน้าเว็บ — ใช้เงาทรงสี่เหลี่ยมจริง
 *                 เติมเฉดฟ้าที่ดูดจากจุดสี "ฟ้า" ในอินโฟกราฟิกราคาของร้านเอง
 *                 (การ์ดเขียนกำกับไว้ว่าเป็นภาพจำลองสี ไม่ใช่รูปถ่ายงานจริง)
 *    size-chart   การ์ดเทียบขนาด 2 ทรงตามสเกลจริง (9x16 · 13x18.5 ซม.)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/hand-mirror/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const PAPER = "#f8fafc";
/** เฉด "ฟ้า" ของร้าน — ดูดจากจุดสีในอินโฟกราฟิกราคา (academy-assets/gifts/mirror.jpg) */
const SHOP_BLUE = "#65dbff";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="134" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${808 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

/** ป้ายชื่อทรงใต้ภาพย่อยในการ์ดสี */
const caption = (cx, y, text) =>
  `<text x="${cx}" y="${y}" font-family="${TH}" font-size="26" font-weight="600" text-anchor="middle" fill="${INK}">${esc(text)}</text>`;

const save = async (name, buf) => {
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`   ${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
};
const saveSvg = async (name, svg) =>
  save(name, await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer());

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** wix id → ภาพต้นฉบับ (ขอ fit ไม่ให้ Wix ครอปทิ้งเอง · png เพื่อรักษาพื้นโปร่งของภาพเรนเดอร์) */
const wix = (id, ext = "jpg") => `https://static.wixstatic.com/media/${id}/v1/fit/w_1600,h_1600/x.${ext}`;

/* ── 1. การ์ดสี — วางภาพเรนเดอร์ของร้าน 2 ทรงคู่กัน ───────────────── */

/** ภาพเรนเดอร์สีของร้าน (ชื่อไฟล์เดิมบนเว็บกำกับไว้ให้ตรวจย้อนได้) */
const RENDER = {
  "square-black": ["959b83_034d4031deec49de915977783fb23ae8~mv2.png", "mirroSBด้าน.png"],
  "square-white": ["959b83_348869f68a9240279bf19734be9c0059~mv2.png", "mirroSWด้าน-01.png"],
  "square-black-pearl": ["959b83_5dae04a81d5e4a4790d0247d4dae9e50~mv2.png", "mirrorSB.png"],
  "square-white-pearl": ["959b83_23ef7561e8dc40659bc7c703ae55f96c~mv2.png", "mirrorSW-01.png"],
  "heart-black": ["959b83_053d937204e5407b80b415b4cc028832~mv2.png", "mirroHBด้าน-01-01.png"],
  "heart-white": ["959b83_196ca92fbca842c2b8288f88179a8abc~mv2.png", "mirroHWด้าน.png"],
  "heart-black-pearl": ["959b83_6c8005cec326431eaf7f468e3a75fdc7~mv2.png", "mirrorHB-01.png"],
  "heart-white-pearl": ["959b83_83b1e3b0d2b6477185790409115ff14e~mv2.png", "mirrorHW-01.png"],
};

/** เรนเดอร์ 1 ใบ → กล่องขนาด box (พื้นขาว ไม่ยืด ไม่ครอป) */
async function tile(key, box) {
  const [id] = RENDER[key];
  return sharp(await get(wix(id, "png")))
    .flatten({ background: "#ffffff" })
    .resize({ width: box, height: box, fit: "inside" })
    .toBuffer();
}

/** สีที่มีทั้ง 2 ทรง — วางเรนเดอร์คู่กัน ซ้าย = สี่เหลี่ยม ขวา = หัวใจ */
async function colorPair(name, label, sub, squareKey, heartKey, notes) {
  const BOX = 330;
  const [sq, ht] = await Promise.all([tile(squareKey, BOX), tile(heartKey, BOX)]);
  const [sm, hm] = await Promise.all([sharp(sq).metadata(), sharp(ht).metadata()]);
  const top = 210;
  const svg = frame(
    `${title(label, sub)}
     ${caption(265, 660, "ทรงสี่เหลี่ยม 9x16 ซม.")}
     ${caption(635, 660, "ทรงหัวใจ 13x18.5 ซม.")}
     ${foot(notes)}`
  );
  const buf = await sharp(Buffer.from(svg))
    .composite([
      { input: sq, left: Math.round(265 - sm.width / 2), top: top + Math.round((BOX - sm.height) / 2) },
      { input: ht, left: Math.round(635 - hm.width / 2), top: top + Math.round((BOX - hm.height) / 2) },
    ])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await save(name, buf);
}

/* ── 2. ครอปรูปงานจริง ────────────────────────────────────────────── */

/** crop = [left, top, width, height] เป็นสัดส่วน 0-1 ของภาพต้นฉบับ */
const PHOTO = {
  "shape-square": {
    id: "959b83_4a2439c22d0c467b84bd2f2e0a5c70e1~mv2.jpg",
    file: "DSC02373.jpg",
    card: ["ทรงสี่เหลี่ยม", "ขนาด 9 x 16 ซม."],
    notes: ["สีสแตนดาร์ด ดำ | ขาว · สีฟ้า · สีพรีเมี่ยม ดำ | ขาว ประกายมุก"],
  },
  "shape-heart": {
    id: "959b83_e5398bbbca2b4ee99e6523dae2d7e0ef~mv2.jpg",
    file: "IMG_20240303_143840_628.jpg",
    card: ["ทรงหัวใจ", "ขนาด 13 x 18.5 ซม."],
    notes: ["สีสแตนดาร์ด ดำ | ขาว | ชมพู · สีพรีเมี่ยม ดำ | ขาว ประกายมุก"],
  },
  "color-pink": {
    id: "959b83_7f6c4a1cb21d48048ab8baeeb7725247~mv2.jpg",
    file: "DSC01889.jpg",
    card: ["สีชมพู", "สีสแตนดาร์ด — มีเฉพาะทรงหัวใจ"],
    notes: ["รูปงานจริงของร้าน (ทรงหัวใจ 13 x 18.5 ซม.)"],
  },
};

async function photoCards() {
  console.log("🖼  การ์ดจากรูปงานจริงในบล็อก \"กระจกถือ\"");
  for (const [name, a] of Object.entries(PHOTO)) {
    let img = sharp(await get(wix(a.id)));
    if (a.crop) {
      const meta = await img.metadata();
      const [l, t, w, h] = a.crop;
      img = img.extract({
        left: Math.round(meta.width * l),
        top: Math.round(meta.height * t),
        width: Math.round(meta.width * w),
        height: Math.round(meta.height * h),
      });
    }
    const fitted = await img.resize({ width: 760, height: 520, fit: "inside" }).toBuffer();
    const m = await sharp(fitted).metadata();
    const svg = frame(`${title(a.card[0], a.card[1])}${foot(a.notes)}`);
    const buf = await sharp(Buffer.from(svg))
      .composite([{ input: fitted, left: Math.round((W - m.width) / 2), top: 200 + Math.round((520 - m.height) / 2) }])
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    await save(name, buf);
  }
}

/** อินโฟกราฟิก "HOW TO วิธีการทำไฟล์" ของกระจกถือ — ใช้เป็นภาพในแท็บ (ไม่ตกแต่งเพิ่ม) */
async function howto() {
  const buf = await sharp(await get(wix("959b83_1165aaab668448e7973596de3db40404~mv2.jpg")))
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  await save("howto-file", buf);
}

/* ── 3. ของที่วาดเอง (ยึดเงาจากภาพเรนเดอร์จริงของร้าน) ───────────── */

/**
 * ตัด "เงา" (silhouette) ของกระจกออกจากภาพเรนเดอร์สีดำของร้าน แล้วเติมสีที่ต้องการ
 * ทำแบบนี้แทนการวาดเอง เพราะได้รูปทรง/สัดส่วนตรงกับของจริงเป๊ะ ๆ (มุมมน ความยาวด้าม)
 * คืนค่า PNG โปร่งใส + ขนาดกรอบพอดีตัวกระจก
 */
async function silhouette(key, fill) {
  const src = await sharp(await get(wix(RENDER[key][0], "png"))).flatten({ background: "#ffffff" }).toBuffer();
  const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(info.width * info.height);
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let i = 0; i < alpha.length; i++) {
    if (data[i] >= 150) continue; // พื้นหลังเทาอ่อน/ขาว = ไม่ใช่ตัวกระจก
    alpha[i] = 255;
    const x = i % info.width, y = (i / info.width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) throw new Error(`ตัดเงาจาก ${RENDER[key][1]} ไม่ได้ — ภาพต้นฉบับอาจเปลี่ยน`);
  const box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const mask = await sharp(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .extract(box)
    .toColourspace("b-w") // ไม่งั้น sharp คืน raw มา 3 ช่อง แล้ว joinChannel เพี้ยน
    .raw()
    .toBuffer();
  const png = await sharp({ create: { width: box.width, height: box.height, channels: 3, background: fill } })
    .joinChannel(mask, { raw: { width: box.width, height: box.height, channels: 1 } })
    .png()
    .toBuffer();
  return { png, width: box.width, height: box.height };
}

/** สีฟ้า — ร้านไม่มีทั้งรูปงานจริงและเรนเดอร์ จึงใช้เงาของทรงสี่เหลี่ยมจริงมาเติมเฉดฟ้าของร้าน */
async function blueCard() {
  const s = await silhouette("square-black", SHOP_BLUE);
  const fitted = await sharp(s.png).resize({ width: 330, height: 430, fit: "inside" }).toBuffer();
  const m = await sharp(fitted).metadata();
  const svg = frame(
    `${title("สีฟ้า", "มีเฉพาะทรงสี่เหลี่ยม 9x16 ซม.")}
     <text x="${W / 2}" y="722" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ภาพจำลองสี — ยังไม่มีรูปงานจริงของสีนี้บนเว็บตารางราคา</text>
     ${foot(["รูปทรงยึดจากภาพเรนเดอร์จริงของร้าน · เฉดฟ้าอ้างอิงตารางราคา สีจริงอาจต่างเล็กน้อย"])}`
  );
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: fitted, left: Math.round((W - m.width) / 2), top: 210 + Math.round((430 - m.height) / 2) }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await save("color-blue", buf);
}

/**
 * การ์ดเทียบขนาด 2 ทรง — ใช้เงาจริงของทั้งสองทรง ย่อด้วย "สเกลเดียวกัน"
 * สี่เหลี่ยมสูง 16 ซม. · หัวใจสูง 18.5 ซม. → px ต่อ ซม. เท่ากันทั้งคู่ ขนาดที่เห็นจึงเทียบกันได้จริง
 */
async function sizeChart() {
  const [sq, ht] = await Promise.all([silhouette("square-black", "#334155"), silhouette("heart-black", "#334155")]);
  const TALL = 440; // ความสูงบนการ์ดของทรงที่สูงที่สุด (หัวใจ 18.5 ซม.)
  const pxPerCm = TALL / 18.5;
  const fit = async (s, cmH) => {
    const h = Math.round(cmH * pxPerCm);
    const buf = await sharp(s.png).resize({ height: h }).toBuffer();
    return { buf, meta: await sharp(buf).metadata() };
  };
  const [a, b] = await Promise.all([fit(sq, 16), fit(ht, 18.5)]);
  const base = 245 + TALL; // เส้นฐานเดียวกัน — วางก้นด้ามเสมอกันถึงเทียบความสูงได้
  const svg = frame(
    `${title("เทียบขนาดจริง 2 ทรง", "หน่วยเป็นเซนติเมตร (รวมด้ามจับ)")}
     ${caption(280, 755, "สี่เหลี่ยม 9 x 16 ซม.")}
     ${caption(630, 755, "หัวใจ 13 x 18.5 ซม.")}
     ${foot(["วาดตามสเกลเดียวกันทั้งสองทรง — ทรงหัวใจใหญ่กว่าทรงสี่เหลี่ยม"])}`
  );
  const buf = await sharp(Buffer.from(svg))
    .composite([
      { input: a.buf, left: Math.round(280 - a.meta.width / 2), top: base - a.meta.height },
      { input: b.buf, left: Math.round(630 - b.meta.width / 2), top: base - b.meta.height },
    ])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await save("size-chart", buf);
}

/* ── รัน ──────────────────────────────────────────────────────────── */

console.log(`🎨 ภาพประกอบตัวเลือก "กระจกถือ" → ${OUT}`);

await photoCards();
await howto();

console.log("🖼  การ์ดสี — เรนเดอร์ของร้าน 2 ทรงคู่กัน");
await colorPair("color-black", "สีดำ", "สีสแตนดาร์ด (ผิวด้าน)", "square-black", "heart-black", [
  "ราคาสแตนดาร์ด · มีทั้งทรงสี่เหลี่ยมและทรงหัวใจ",
]);
await colorPair("color-white", "สีขาว", "สีสแตนดาร์ด (ผิวด้าน)", "square-white", "heart-white", [
  "ราคาสแตนดาร์ด · มีทั้งทรงสี่เหลี่ยมและทรงหัวใจ",
]);
await colorPair("color-black-pearl", "สีดำประกายมุก", "สีพรีเมี่ยม (ผิวประกายมุก)", "square-black-pearl", "heart-black-pearl", [
  "ราคาพรีเมี่ยม · ผิวมีประกายมุกวิบวับเวลาโดนแสง",
]);
await colorPair("color-white-pearl", "สีขาวประกายมุก", "สีพรีเมี่ยม (ผิวประกายมุก)", "square-white-pearl", "heart-white-pearl", [
  "ราคาพรีเมี่ยม · ผิวมีประกายมุกวิบวับเวลาโดนแสง",
]);

console.log("🖼  ของที่วาดเอง — เงาจากภาพเรนเดอร์จริง");
await blueCard();
await sizeChart();

console.log(`\n✅ เสร็จ — ต่อด้วย node scripts/hand-mirror-apply.mjs (--write เพื่ออัปจริง)`);
