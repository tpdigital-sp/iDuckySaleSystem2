#!/usr/bin/env node
/**
 * MINI STANDEE + สปริง (mini-standee-2 · /products/MINI-STANDEE-สปริง)
 *
 *   node scripts/mini-standee-spring-option-art.mjs           (วาดลง .cache/mini-standee-2/upload ดูก่อน)
 *   node scripts/mini-standee-spring-option-art.mjs --write    (+ อัปโหลด storage + เขียน DB + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69 — 3 ข้อ:
 *   1. กลุ่ม "ขนาด" (dropdown 6 ไซซ์ 2–2.5 ซม.) → เป็นการ์ด
 *   2. ทำภาพตัวอย่างให้กลุ่มตัวเลือก
 *   3. กลุ่มสกรีนกี่ด้าน ให้เขียนว่า "สกรีน 1 ด้าน" / "สกรีน 2 ด้าน"
 *      (ของเดิมชื่อกลุ่มสะกดผิด "สรีนลาย" ตัวเลือกเป็น "1 ด้าน"/"2 ด้าน" — เปลี่ยนชื่อกลุ่มเป็น
 *       "สกรีนกี่ด้าน" ตามที่ผู้ใช้เรียก · ตรวจแล้วปลอดภัย ดูหมายเหตุราคาข้างล่าง)
 *
 * ตัวสินค้า (จากรูปงานจริงในแกลเลอรี): ชิ้นอะคริลิคไดคัทจิ๋ว พิมพ์ UV เสียบลงหัวจับใสบนสปริงเหล็ก
 *   ก้นสปริงมีกาว 2 หน้า ติดขอบจอ/โต๊ะได้ · โยกเด้งไปมา · ขนาดนับจากด้านที่ยาวที่สุด (terms ของสินค้า)
 *
 * ราคา: ตารางราคาไม่มีแกน (`pricing.cells = {"": [...]}` · driverLabels = []) →
 *   ทุกไซซ์ราคาเท่ากัน และเปลี่ยนชื่อกลุ่ม/ชื่อตัวเลือกได้ ไม่ชนแกนตารางราคา ([[iducky-price-driver-trap]])
 *   สคริปต์เช็คซ้ำก่อนเขียนว่า driverLabels ว่างจริงทั้ง pricing และ priceRates ทุกเรท ไม่งั้นหยุด
 *   "2 ด้าน" บวกเพิ่ม 5 บาท (choice.extra) — ยกมาทั้งค่าเดิม ไม่แตะ
 *
 * ภาพชิ้นงาน: ทำขอบไดคัทจากอัลฟาของมาสคอต (blur → threshold 2 ชั้น = ขอบอะคริลิคใส + เส้นขอบ)
 *   ⚠️ ต้องคั่น toBuffer() ระหว่าง .blur() กับ .threshold() ไม่งั้น threshold ไม่ทำงาน ([[iducky-sharp-blur-threshold]])
 *
 * ⚠️ 6 ตัวเลือก = การ์ดโหมดกระชับ (รูป 48px · ไม่โชว์ desc) → ต่างกันแค่ 0.1 ซม. ดูด้วยตาไม่ออก
 *    ทุกใบจึงมีป้ายเลขไซซ์ตัวใหญ่กลางภาพ + แถบเทียบ 6 ไซซ์สเกลเดียวกันด้านล่าง ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: read-modify-write กลุ่มเดิม ไม่ย้ายลำดับกลุ่ม ไม่แตะ pricing/priceRates
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { assetPath, MASCOTS } from "./iducky-assets.mjs";

const PRODUCT_ID = "mini-standee-2";
const VER = "v1";
const SIZE_GROUP = "ขนาด";
const SCREEN_GROUP_OLD = "สรีนลาย";      // ชื่อเดิมใน DB (สะกดตก ก)
const SCREEN_GROUP = "สกรีนกี่ด้าน";
const ONE_SIDE = "สกรีน 1 ด้าน";
const TWO_SIDE = "สกรีน 2 ด้าน";
const TWO_EXTRA = 5;                      // ค่าเดิมใน DB — ยกมาเท่าเดิม

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mini-standee-2/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", LINE = "#cbd5e1";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** สเกลชิ้นงานหลัก — 1 ซม. = 118 px (2.5 ซม. = 295 px) */
const S = 118;
/** ก้นกาว 2 หน้า (ทุกใบเสมอกัน) → สปริง/หัวจับสูงเท่ากันหมด ต่างกันแค่ตัวชิ้นงาน */
const FOOT = 676;
const PAD_H = 14;                          // แผ่นกาว 2 หน้า
const SPRING_H = 166;                      // สปริง ~1.4 ซม.
const HOLD_H = 40;                         // หัวจับอะคริลิคใส
const HOLD_TOP = FOOT - PAD_H - SPRING_H - HOLD_H;   // = 456
const PIECE_BOTTOM = HOLD_TOP + 12;        // ชิ้นงานเสียบลงในหัวจับ 12 px

// ── ชิ้นอะคริลิคไดคัท (สร้างจากอัลฟาของมาสคอต) ──────────────────────
const MASCOT_PATH = assetPath(MASCOTS.heart);

/** อัลฟา → หน้ากากขยาย (ขอบไดคัท) — คั่น toBuffer() ทุกขั้น ไม่งั้น threshold ไม่ทำงาน */
const dilate = async (png, blurPx) => {
  const a = await sharp(png).extractChannel("alpha").png().toBuffer();
  const b = await sharp(a).blur(blurPx).png().toBuffer();
  return sharp(b).threshold(40).blur(0.6).png().toBuffer();
};

/**
 * ชิ้นงาน 1 ชิ้น สูง hPx (= ขนาดที่สั่ง เพราะนับจากด้านที่ยาวที่สุด)
 *   art=false → เนื้อใสเปล่า ๆ ไม่มีลาย (ใช้เป็นด้านหลังของงานสกรีน 1 ด้าน)
 *   flip=true → พลิกลาย (ด้านหลังของงานสกรีน 2 ด้าน)
 */
async function piece(hPx, { art = true, flip = false } = {}) {
  const pad = Math.max(6, Math.round(hPx * 0.075));
  let m = sharp(MASCOT_PATH).trim({ threshold: 1 }).resize({ height: Math.round(hPx - pad * 2) });
  if (flip) m = m.flop();
  const mascot = await m.png().toBuffer();
  const meta = await sharp(mascot).metadata();
  const pw = meta.width + pad * 2, ph = meta.height + pad * 2;
  const padded = await sharp(mascot)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const outer = await dilate(padded, pad * 0.8);
  const inner = await dilate(padded, pad * 0.5);
  const edge = await sharp({ create: { width: pw, height: ph, channels: 3, background: "#8fc4e6" } }).joinChannel(outer).png().toBuffer();
  const face = await sharp({ create: { width: pw, height: ph, channels: 3, background: "#e7f4fd" } }).joinChannel(inner).png().toBuffer();
  const layers = [{ input: face }];
  if (art) layers.push({ input: padded });
  const buf = await sharp(edge).composite(layers).png().toBuffer();
  return { uri: `data:image/png;base64,${buf.toString("base64")}`, w: pw, h: ph };
}

// ── ชิ้นส่วนภาพ ─────────────────────────────────────────────────────
/** สปริงเหล็ก — ขดเป็นวงรีซ้อนกันจากล่างขึ้นบน */
const spring = (cx, top, h, rx = 33) => {
  const loops = 7;
  const step = (h - 16) / (loops - 1);
  const coils = [];
  for (let i = 0; i < loops; i++) {
    const y = top + 8 + i * step;
    coils.push(`<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="10" fill="none" stroke="#9aa6b2" stroke-width="8" stroke-linecap="round"/>`);
    coils.push(`<path d="M ${cx - rx} ${y} A ${rx} 10 0 0 0 ${cx + rx} ${y}" fill="none" stroke="#e2e8f0" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>`);
  }
  return coils.join("");
};

/** หัวจับอะคริลิคใส (ชิ้นงานเสียบลงในร่อง) */
const holder = (cx, top, h = HOLD_H) => `
  <rect x="${cx - 48}" y="${top + 4}" width="96" height="${h}" rx="9" fill="#0f172a" opacity="0.07"/>
  <rect x="${cx - 48}" y="${top}" width="96" height="${h}" rx="9" fill="#e7f4fd" stroke="#8fc4e6" stroke-width="2.5"/>
  <rect x="${cx - 30}" y="${top + 5}" width="60" height="9" rx="4.5" fill="#8fc4e6" opacity="0.75"/>
  <rect x="${cx - 42}" y="${top + h * 0.55}" width="84" height="6" rx="3" fill="#ffffff" opacity="0.85"/>`;

/** แผ่นกาว 2 หน้า ที่ก้นสปริง */
const gluePad = (cx, top, label = true) => `
  <rect x="${cx - 46}" y="${top}" width="92" height="${PAD_H}" rx="5" fill="#f1f5f9" stroke="${LINE}" stroke-width="2" stroke-dasharray="7 5"/>
  ${label ? `<text x="${cx - 58}" y="${top + PAD_H - 1}" font-family="${TH}" font-size="20" text-anchor="end" fill="${SUB}">กาว 2 หน้า</text>` : ""}`;

/** ลูกศรวัดแนวตั้ง + ป้ายตัวเลข */
const dimV = (x, y1, y2, label) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
  <line x1="${x - 10}" y1="${y1}" x2="${x + 10}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
  <line x1="${x - 10}" y1="${y2}" x2="${x + 10}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
  <text x="${x - 16}" y="${(y1 + y2) / 2 + 9}" font-family="${TH}" font-size="25" font-weight="700"
    text-anchor="end" fill="${SUB}">${esc(label)}</text>`;

const pill = (cx, y, text, tone = OK, bg = "#ecfeff", fs = 24) => {
  const w = text.length * (fs * 0.62) + 52;
  return `
    <rect x="${cx - w / 2}" y="${y - fs - 4}" width="${w}" height="${fs * 2 + 8}" rx="${fs + 4}" fill="${bg}" stroke="${tone}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + fs * 0.42}" font-family="${TH}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${tone}">${esc(text)}</text>`;
};

// ── กลุ่ม "ขนาด" ────────────────────────────────────────────────────
/** ชื่อ choice ต้องตรง DB เป๊ะ ๆ */
const SIZES = [
  { choice: "2 cm",   cm: 2.0, tag: "2 ซม.",   strip: "2",   desc: "ไซซ์เล็กสุด · ลายเดี่ยว ตัวคาแรกเตอร์ล้วน ๆ ชัดกว่า" },
  { choice: "2.1 cm", cm: 2.1, tag: "2.1 ซม.", strip: "2.1", desc: "ใหญ่กว่าไซซ์เล็กสุดนิดเดียว" },
  { choice: "2.2 cm", cm: 2.2, tag: "2.2 ซม.", strip: "2.2", desc: "ขนาดกลาง ๆ ของช่วง 2–2.5 ซม." },
  { choice: "2.3 cm", cm: 2.3, tag: "2.3 ซม.", strip: "2.3", desc: "ขนาดกลางค่อนใหญ่" },
  { choice: "2.4 cm", cm: 2.4, tag: "2.4 ซม.", strip: "2.4", desc: "เกือบใหญ่สุด" },
  { choice: "2.5 cm", cm: 2.5, tag: "2.5 ซม.", strip: "2.5", desc: "ไซซ์ใหญ่สุด · ใส่รายละเอียดลายได้มากที่สุด" },
];

/** แถบเทียบ 6 ไซซ์ สเกลเดียวกัน ก้นเสมอกัน — ไฮไลต์ไซซ์ที่เลือก */
const compareStrip = (cur, shapes) => {
  const S2 = 40;               // px ต่อ 1 ซม. (ย่อจากสเกลหลัก)
  const gap = 26;
  const base = 858;
  const ws = SIZES.map((s) => s.cm * S2 * 0.78);
  const total = ws.reduce((a, b) => a + b, 0) + gap * (SIZES.length - 1);
  let x = W / 2 - total / 2;
  const parts = SIZES.map((s, i) => {
    const w = ws[i], h = s.cm * S2;
    const on = s.choice === cur.choice;
    const cx = x + w / 2;
    const out = `
      <image href="${shapes[i]}" x="${cx - w / 2}" y="${base - h}" width="${w}" height="${h}" opacity="${on ? 1 : 0.5}"/>
      ${on ? `<rect x="${cx - w / 2 - 7}" y="${base - h - 7}" width="${w + 14}" height="${h + 14}" rx="10" fill="none" stroke="${OK}" stroke-width="3"/>` : ""}
      <text x="${cx}" y="${base + 28}" font-family="${TH}" font-size="20" font-weight="${on ? 700 : 400}"
        text-anchor="middle" fill="${on ? OK : SUB}">${s.strip}</text>`;
    x += w + gap;
    return out;
  });
  return `
    <line x1="${W / 2 - total / 2 - 16}" y1="${base}" x2="${W / 2 + total / 2 + 16}" y2="${base}" stroke="#e2e8f0" stroke-width="2"/>
    ${parts.join("")}
    <text x="${W / 2}" y="${722}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เทียบ 6 ไซซ์ สเกลเดียวกัน · ทุกไซซ์ราคาเท่ากัน</text>`;
};

function sizeCard(s, art, shapes) {
  const ph = s.cm * S;
  const pw = ph * (art.w / art.h);
  const cx = 400;
  const top = PIECE_BOTTOM - ph;
  const tagW = s.tag.length * 25 + 52;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="86" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด ${esc(s.tag)}</text>
  <text x="${W / 2}" y="126" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">วัดจากด้านที่ยาวที่สุดของชิ้นอะคริลิค</text>

  <!-- ตัวสินค้า: ชิ้นไดคัท + หัวจับใส + สปริง + กาว 2 หน้า -->
  <ellipse cx="${cx}" cy="${FOOT + 12}" rx="78" ry="12" fill="#0f172a" opacity="0.07"/>
  ${gluePad(cx, FOOT - PAD_H)}
  ${spring(cx, FOOT - PAD_H - SPRING_H, SPRING_H)}
  ${holder(cx, HOLD_TOP)}
  <image href="${art.uri}" x="${cx - pw / 2}" y="${top}" width="${pw}" height="${ph}"/>

  ${dimV(cx - pw / 2 - 34, top, PIECE_BOTTOM - 12, s.tag)}

  <!-- ป้ายไซซ์ตัวใหญ่ — สิ่งเดียวที่ยังอ่านออกตอนย่อเป็นการ์ด 48px -->
  <rect x="${700 - tagW / 2}" y="${384}" width="${tagW}" height="70" rx="18" fill="#0f172a" opacity="0.10"/>
  <rect x="${700 - tagW / 2}" y="${380}" width="${tagW}" height="70" rx="18" fill="#ffffff" stroke="#a5f3fc" stroke-width="3"/>
  <text x="700" y="${428}" font-family="${TH}" font-size="44" font-weight="800" text-anchor="middle" fill="${INK}">${esc(s.tag)}</text>
  <text x="700" y="${486}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">สปริง + กาว 2 หน้า</text>
  <text x="700" y="${516}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เท่ากันทุกไซซ์</text>

  ${compareStrip(s, shapes)}
</svg>`;
}

// ── กลุ่ม "สกรีนกี่ด้าน" ─────────────────────────────────────────────
function screenCard({ title, sub, front, back, backLabel, note }) {
  const ph = 2.5 * S;                       // ใช้ไซซ์ใหญ่สุดเป็นตัวแสดง
  const fw = ph * (front.w / front.h);
  const bw = ph * (back.w / back.h);
  const L = 255, R = 645;
  const top = PIECE_BOTTOM - ph;
  const view = (cx, w, uri, label) => `
    <ellipse cx="${cx}" cy="${FOOT + 12}" rx="105" ry="13" fill="#0f172a" opacity="0.07"/>
    ${gluePad(cx, FOOT - PAD_H, false)}
    ${spring(cx, FOOT - PAD_H - SPRING_H, SPRING_H, 29)}
    ${holder(cx, HOLD_TOP)}
    <image href="${uri}" x="${cx - w / 2}" y="${top}" width="${w}" height="${ph}"/>
    <text x="${cx}" y="${FOOT + 62}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${esc(label)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="86" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${esc(title)}</text>
  <text x="${W / 2}" y="126" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>

  ${view(L, fw, front.uri, "ด้านหน้า")}
  ${view(R, bw, back.uri, backLabel)}

  <!-- ป้ายจำนวนด้าน กลางเฟรม — จุดต่างที่ยังอ่านออกตอนย่อ -->
  <circle cx="${W / 2}" cy="${372}" r="60" fill="#ffffff" stroke="#a5f3fc" stroke-width="4"/>
  <text x="${W / 2}" y="${374}" font-family="${TH}" font-size="58" font-weight="800" text-anchor="middle" fill="${INK}">${title.includes("2") ? "2" : "1"}</text>
  <text x="${W / 2}" y="${404}" font-family="${TH}" font-size="20" font-weight="700" text-anchor="middle" fill="${OK}">ด้าน</text>

  ${pill(W / 2, 810, note, OK, "#ecfeff", 24)}
  <text x="${W / 2}" y="${868}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">พิมพ์ UV ลายของคุณเอง · เนื้ออะคริลิคใส ไดคัทตามลาย</text>
</svg>`;
}

// ── วาดภาพทั้งหมด ───────────────────────────────────────────────────
const jpg = (svg) => sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const built = [];

/* เงาชิ้นงานสำหรับแถบเทียบ (เนื้อใส ไม่มีลาย — ให้ดูที่ "ขนาด" อย่างเดียว) */
const stripShape = (await piece(300, { art: false })).uri;
const shapes = SIZES.map(() => stripShape);

for (const s of SIZES) {
  const art = await piece(Math.round(s.cm * S));
  const file = `size-${String(s.cm).replace(".", "-")}cm-${VER}.jpg`;
  const buf = await jpg(sizeCard(s, art, shapes));
  writeFileSync(`${OUT}/${file}`, buf);
  built.push({ key: `size:${s.choice}`, file, buf });
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ขนาด ${s.tag}`);
}

const frontArt = await piece(Math.round(2.5 * S));
const backClear = await piece(Math.round(2.5 * S), { art: false });
const backArt = await piece(Math.round(2.5 * S), { flip: true });

const screens = [
  {
    key: `screen:${ONE_SIDE}`,
    file: `screen-1side-${VER}.jpg`,
    svg: screenCard({
      title: ONE_SIDE,
      sub: "พิมพ์ลายด้านเดียว — ราคาปกติ ไม่บวกเพิ่ม",
      front: frontArt, back: backClear,
      backLabel: "ด้านหลัง",
      note: "ด้านหลังไม่พิมพ์ทับ · มองทะลุเห็นลายจาง ๆ",
    }),
  },
  {
    key: `screen:${TWO_SIDE}`,
    file: `screen-2side-${VER}.jpg`,
    svg: screenCard({
      title: TWO_SIDE,
      sub: "พิมพ์ลายทั้งหน้าและหลัง — หันด้านไหนก็เห็นลาย",
      front: frontArt, back: backArt,
      backLabel: "ด้านหลัง",
      note: `บวกเพิ่ม ${TWO_EXTRA} บาท/ชิ้น`,
    }),
  },
];
for (const sc of screens) {
  const buf = await jpg(sc.svg);
  writeFileSync(`${OUT}/${sc.file}`, buf);
  built.push({ key: sc.key, file: sc.file, buf });
  console.log(`🖼  ${OUT}/${sc.file}  ${Math.round(buf.length / 1024)} KB — ${sc.key}`);
}

/* แผ่นตรวจ: ย่อทุกใบเหลือ 48px (ขนาดจริงบนการ์ดโหมดกระชับ) แล้วขยายกลับมาเรียงเทียบ */
const thumbs = [];
for (const b of built) thumbs.push(await sharp(b.buf).resize(48, 48).resize(200, 200, { kernel: "nearest" }).png().toBuffer());
await sharp({ create: { width: 200 * thumbs.length, height: 200, channels: 3, background: "#ffffff" } })
  .composite(thumbs.map((t, i) => ({ input: t, left: i * 200, top: 0 })))
  .jpeg({ quality: 90 })
  .toFile(`${OUT}/_thumbs-48.jpg`);
console.log(`🔎 ${OUT}/_thumbs-48.jpg — ย่อ 48px ทุกใบเรียงเทียบ (ขนาดจริงบนการ์ด)`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด + เขียน DB ──────────────────────────────────────────────
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
  url[b.key] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", key);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

/* ด่านกันพลาด: ถ้าตารางราคามีแกน = ห้ามเปลี่ยนชื่อกลุ่ม/ตัวเลือก ([[iducky-price-driver-trap]]) */
const drivers = [data.pricing?.driverLabels ?? [], ...(data.priceRates ?? []).map((r) => r.pricing?.driverLabels ?? [])];
if (drivers.some((d) => d.length)) { console.error("ตารางราคามีแกน (driverLabels) — หยุดก่อน:", JSON.stringify(drivers)); process.exit(1); }

// 1) กลุ่ม "ขนาด" → การ์ด + ภาพ + desc (ไม่แตะชื่อกลุ่ม/ชื่อตัวเลือก/ลำดับ)
const sizeOpt = options.find((o) => o.label === SIZE_GROUP);
if (!sizeOpt) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
if ((sizeOpt.choices ?? []).length !== SIZES.length) { console.error("จำนวนตัวเลือกขนาดใน DB ไม่ตรงกับสคริปต์:", sizeOpt.choices); process.exit(1); }
sizeOpt.display = "cards";
for (const c of sizeOpt.choices) {
  const s = SIZES.find((x) => x.choice === c.name);
  if (!s) { console.error("ตัวเลือกขนาดใน DB ไม่มีในสคริปต์:", c.name); process.exit(1); }
  c.imageSrc = url[`size:${s.choice}`];
  c.desc = s.desc;
}

// 2) กลุ่มสกรีน → เปลี่ยนชื่อกลุ่ม/ตัวเลือก + การ์ด + ภาพ (รันซ้ำได้: รับทั้งชื่อเก่าและใหม่)
const screenOpt = options.find((o) => o.label === SCREEN_GROUP || o.label === SCREEN_GROUP_OLD);
if (!screenOpt) { console.error(`ไม่เจอกลุ่ม "${SCREEN_GROUP_OLD}"/"${SCREEN_GROUP}"`); process.exit(1); }
const old = screenOpt.choices ?? [];
const oldTwo = old.find((c) => c.name === TWO_SIDE || c.name === "2 ด้าน");
if (oldTwo && oldTwo.extra !== TWO_EXTRA) { console.error("ค่าบวกเพิ่มของ 2 ด้าน ใน DB ไม่ใช่", TWO_EXTRA, "→", oldTwo.extra); process.exit(1); }
screenOpt.label = SCREEN_GROUP;
screenOpt.display = "cards";
screenOpt.choices = [
  { name: ONE_SIDE, desc: "พิมพ์ลายด้านเดียว · ด้านหลังไม่พิมพ์ทับ", imageSrc: url[`screen:${ONE_SIDE}`] },
  { name: TWO_SIDE, desc: "พิมพ์ลายทั้ง 2 ด้าน หันด้านไหนก็เห็นลาย", extra: TWO_EXTRA, imageSrc: url[`screen:${TWO_SIDE}`] },
];

data.options = options;
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ([[iducky-script-write-product]] ข้อ 4)
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bOpts = back.data.options ?? [];
const bSize = bOpts.find((o) => o.label === SIZE_GROUP);
const bScreen = bOpts.find((o) => o.label === SCREEN_GROUP);
const bad =
  bSize?.display !== "cards" ||
  SIZES.some((s) => {
    const c = bSize.choices.find((x) => x.name === s.choice);
    return !c || c.imageSrc !== url[`size:${s.choice}`] || c.desc !== s.desc;
  }) ||
  bOpts.some((o) => o.label === SCREEN_GROUP_OLD) ||
  bScreen?.display !== "cards" ||
  bScreen?.choices?.length !== 2 ||
  bScreen?.choices?.[0]?.name !== ONE_SIDE || bScreen?.choices?.[0]?.imageSrc !== url[`screen:${ONE_SIDE}`] ||
  bScreen?.choices?.[1]?.name !== TWO_SIDE || bScreen?.choices?.[1]?.extra !== TWO_EXTRA ||
  bScreen?.choices?.[1]?.imageSrc !== url[`screen:${TWO_SIDE}`];
if (bad) { console.error("อ่านกลับไม่ตรง!", JSON.stringify(bOpts, null, 1)); process.exit(1); }
console.log(`✓ "${SIZE_GROUP}" การ์ด 6 ภาพ + "${SCREEN_GROUP}" การ์ด 2 ภาพ (สกรีน 1/2 ด้าน) อ่านกลับตรง · savedAt =`, back.data.savedAt);
