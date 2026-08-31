#!/usr/bin/env node
/**
 * ภาพจำลองตัวเลือกของ Photo card Digital — กลุ่ม "พิมพ์กี่ด้าน" และ "ไม่เคลือบฟอยล์"
 *
 *   node scripts/photocard-digital-option-art.mjs        # วาดลง scripts/assets/photocard-digital/
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69: กลุ่มพวกนี้ยังเป็น dropdown เปล่า ๆ ไม่มีภาพให้ดูว่าได้อะไร
 * วาดสไตล์เดียวกับภาพฟอยล์ของสินค้าตัวนี้ (foil-1layer-info.jpg): พื้นฟ้าอ่อน · การ์ดขาว ·
 * หัวข้อสีน้ำเงิน + คำอธิบายเทาใต้ภาพ
 *
 * ที่เหลือของสินค้าใช้ภาพที่ร้านมีอยู่แล้ว ไม่ต้องวาดใหม่:
 *   เคลือบเงา/ด้าน/พิเศษ + ผิวฟิล์ม 10 แบบ = คลังฟิล์มกลาง products/preset-coating/*
 *   ไม่เคลือบ = products/paper-art-pet/coat-none.jpg (รูปงานจริง ใช้ร่วมกับงานกระดาษตัวอื่น)
 *   ฟอยล์ 1/2 เลเยอร์ + สีฟอยล์ = ภาพเดิมของสินค้าตัวนี้
 * ตัวเป็ดในภาพยืมจากแผ่น HOW TO PRINT ของร้าน (scripts/assets/photocard-pvc/duck.png)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = "scripts/assets/photocard-digital";
const DUCK = "scripts/assets/photocard-pvc/duck.png";

const W = 800;
const H = 800;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const BG = "#eff6fe";          // พื้นหลัง — ดูดสีจาก foil-1layer-info.jpg ของสินค้าตัวนี้
const BLUE = "#2f7fd4";        // สีหัวข้อ
const SUB = "#767d85";         // คำอธิบายใต้หัวข้อ
const LABEL = "#5b6673";       // ป้ายใต้การ์ดแต่ละใบ
const EDGE = "#d8e3f2";
const BLANK = "#fcfcfa";       // กระดาษเปล่า (ด้านที่ไม่พิมพ์ลาย)

/** การ์ด 5.5 × 8.5 ซม. ตามสัดส่วนจริงของสินค้า */
const CW = 176;
const CH = 272;
const TOP = 132;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ลายบนการ์ด — ไล่สีอ่อน ๆ พอให้เห็นว่า "ด้านนี้มีลาย" (ไม่ใช่ลายจริงของลูกค้า) */
const art = (id, from, to) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient>`;

/** การ์ด 1 ใบ + ป้ายใต้ใบ (ใบเดี่ยววาดใหญ่ขึ้น ไม่ให้ภาพโล่ง) */
const card = (x, fill, label, note, box = { w: CW, h: CH, top: TOP }) => `
  <rect x="${x + 5}" y="${box.top + 7}" width="${box.w}" height="${box.h}" rx="14" fill="#000" opacity="0.07"/>
  <rect x="${x}" y="${box.top}" width="${box.w}" height="${box.h}" rx="14" fill="${fill}" stroke="${EDGE}" stroke-width="2"/>
  <text x="${x + box.w / 2}" y="${box.top + box.h + 40}" font-family="${TH}" font-size="23" font-weight="600"
        text-anchor="middle" fill="${LABEL}">${esc(label)}</text>
  ${note ? `<text x="${x + box.w / 2}" y="${box.top + box.h + 70}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">${esc(note)}</text>` : ""}`;

const caption = (title, lines) => `
  <text x="${W / 2}" y="606" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${BLUE}">${esc(title)}</text>
  ${lines
    .map(
      (l, i) =>
        `<text x="${W / 2}" y="${656 + i * 38}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`
    )
    .join("")}`;

const duckBuf = readFileSync(DUCK);
/** เป็ดวางกลางการ์ด — สลับซ้าย-ขวาได้ ให้ดูเป็นคนละลาย */
async function duck(x, flip, box = { w: CW, h: CH, top: TOP }) {
  const h = Math.round(box.h * 0.5);
  let img = sharp(duckBuf).resize({ height: h });
  if (flip) img = img.flop();
  const buf = await img.toBuffer();
  const { width } = await sharp(buf).metadata();
  return { input: buf, left: Math.round(x + (box.w - width) / 2), top: Math.round(box.top + (box.h - h) / 2) };
}

async function render(name, svg, ducks) {
  const base = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG}"/>${svg}</svg>`));
  const buf = await base.composite(ducks).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`✓ ${OUT}/${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
}

mkdirSync(OUT, { recursive: true });

const GAP = 76;
const X1 = (W - (CW * 2 + GAP)) / 2;
const X2 = X1 + CW + GAP;
/** ใบเดี่ยว (ไม่เคลือบฟอยล์) — ใหญ่กว่าใบคู่ 1.25 เท่า วางกลางภาพ */
const SOLO = { w: Math.round(CW * 1.25), h: Math.round(CH * 1.25), top: TOP - 8 };
const XC = (W - SOLO.w) / 2;

// พิมพ์ 1 ด้าน — หน้ามีลาย หลังเป็นกระดาษเปล่า
await render(
  "sides-1",
  `<defs>${art("g1", "#cfe6ff", "#ffe1ef")}</defs>
   ${card(X1, "url(#g1)", "ด้านหน้า", "พิมพ์ลาย")}
   ${card(X2, BLANK, "ด้านหลัง", "กระดาษเปล่า")}
   ${caption("พิมพ์ 1 ด้าน", ["พิมพ์ลายเฉพาะด้านหน้า", "ด้านหลังเป็นเนื้อกระดาษเปล่า ไม่มีลาย"])}`,
  [await duck(X1, false)]
);

// พิมพ์ 2 ด้าน — มีลายทั้งสองด้าน และคนละลายได้
await render(
  "sides-2",
  `<defs>${art("g1", "#cfe6ff", "#ffe1ef")}${art("g2", "#d8f3e4", "#ffeccc")}</defs>
   ${card(X1, "url(#g1)", "ด้านหน้า", "พิมพ์ลาย")}
   ${card(X2, "url(#g2)", "ด้านหลัง", "คนละลายได้")}
   ${caption("พิมพ์ 2 ด้าน", ["พิมพ์ลายทั้งด้านหน้าและด้านหลัง", "ด้านหลังใช้คนละลายกับด้านหน้าได้"])}`,
  [await duck(X1, false), await duck(X2, true)]
);

// ไม่เคลือบฟอยล์ — การ์ดพิมพ์สีธรรมดา ไม่มีแผ่นฟอยล์เงาทับ
await render(
  "foil-none",
  `<defs>${art("g1", "#cfe6ff", "#ffe1ef")}</defs>
   ${card(XC, "url(#g1)", "พิมพ์สีอย่างเดียว", "", SOLO)}
   ${caption("ไม่เคลือบฟอยล์", ["งานพิมพ์สีปกติ ไม่มีฟอยล์เงาปั๊มทับ", "อยากได้ลายเงาวิบวับ เลือกฟอยล์ 1 หรือ 2 เลเยอร์"])}`,
  [await duck(XC, false, SOLO)]
);
