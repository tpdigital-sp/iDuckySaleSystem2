#!/usr/bin/env node
/**
 * Case Frame Card — ภาพประจำตัวเลือกกลุ่ม "ประเภทเคส" (ธรรมดา / Magsafe)
 *
 *   node scripts/case-frame-card-type-art.mjs                     # วาดภาพลง .cache (ไม่อัป ไม่เขียน)
 *   node scripts/case-frame-card-type-art.mjs --upload --write    # อัป Storage + ผูก imageSrc
 *
 * การ์ดตัวเลือกโชว์ภาพแค่ 48×48 px (ดู ProductDetail display "cards") ภาพจึงต้อง "อ่านออกที่ขนาดเล็ก"
 * → วาดเป็นภาพแบนเรียบ มองหลังเคสตรง ๆ ทั้งสองใบใช้ตัวเคสชุดเดียวกันเป๊ะ
 *   ต่างกันแค่ "วงแม่เหล็ก" ของ Magsafe — สายตาจึงจับความต่างได้ทันทีโดยไม่ต้องอ่านชื่อ
 *
 *   เครื่องต้นแบบ = iPhone 17 Pro Max — วาดตามสัดส่วนจริงทุกชิ้น (หน่วยในโค้ดเป็น "มม." จริง)
 *     ตัวเครื่อง 163.4 × 78.0 × 8.75 มม. (สเปค Apple)
 *     กล้องเป็น "camera plateau" แถบยาวเกือบเต็มความกว้าง เลนส์ 3 ตัวเรียงสามเหลี่ยมชิดซ้าย
 *     แฟลช + LiDAR อยู่ขวา (คนละทรงกับ iPhone 16 ที่เป็นก้อนสี่เหลี่ยมมุมซ้ายบน)
 *
 *   ⚠️ ชิ้นที่ "เจาะช่องกล้อง" คือ **แผ่นหลังใสที่ถอดออกมา** ไม่ใช่ตัวเคส
 *      (แผ่นนี้ครอบทับหลังเครื่อง จึงต้องมีรูให้กล้องโผล่ · ตัวเคสยังเห็นกล้องเต็ม ๆ ตามเดิม)
 *      เจาะด้วย fill-rule="evenodd" 2 subpath → เห็นของที่อยู่ข้างหลังลอดผ่านรูจริง
 *
 *   ทรงภาพ = มุมเอียง "แผ่นหลังใสถอดออกมา" ตามรูปตัวอย่างที่ผู้ใช้ส่งมา
 *            เห็นครบว่าสินค้าทำงานยังไง: ลายอยู่ใต้แผ่น · แผ่นใสครอบทับ · วง MagSafe อยู่บนแผ่น
 *   ธรรมดา  = ตัวเคส + ลาย (มาสคอตเป็ด) + แผ่นหลังใส
 *   Magsafe = ตัวเดียวกัน + วงแม่เหล็กขาว + ขีดกลมเล็กใต้วง บนแผ่นหลัง
 *             (ทรงเดียวกับของจริงจากรูปโรงงาน ไม่ใช่วงสีแบรนด์ที่เดาเอง)
 *   พื้นหลังเทาอ่อนแบบรูปโรงงาน — วงขาวถึงจะมองเห็นบนพลาสติกใส
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพแล้วต้องขยับเลข v
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
const OUT = ".cache/case-frame-card/upload";
const ID = "case-frame-card";
const EXPECT_NAME = "Case Frame Card"; // กันเผลอรันทับสินค้าตัวอื่น
const TYPE_LABEL = "ประเภทเคส";
const V = "v7"; // v7 = ตัวเคสมีกล้อง · ช่องเจาะอยู่บน "แผ่นหลังใส" ที่ถอดออกมา (v6 เจาะผิดชิ้น)

const S = 900; // จัตุรัส — การ์ดครอปเป็นจัตุรัส (object-cover)
const INK = "#33454e";
const EDGE = "#b9cad3";

/**
 * ลายที่อยู่ใต้แผ่นหลัง = มาสคอตเป็ด iDucky (ฝ่าย Content ทำไว้ ดูเป็นของร้านจริง ๆ)
 */
const duck = await mascotDataUri("heart", 560);

/* ═══ สัดส่วนจริงของ iPhone 17 Pro Max (มม.) ═══
   ตัวเลขทุกตัวข้างล่างเป็นมิลลิเมตรจริง แล้วคูณ MM ทีเดียวตอนวาด
   → เปลี่ยนรุ่นเครื่องทีหลังแค่แก้ 3 บรรทัดแรก ไม่ต้องรื้อทั้งภาพ */
const PH_W = 78.0;   // กว้าง (สเปค Apple)
const PH_H = 163.4;  // สูง
const PH_R = 13.0;   // รัศมีมุม (ประมาณจากรูปเครื่องจริง)
const WALL = 1.8;    // ความหนาขอบเคสที่หุ้มรอบเครื่อง
const MM = 4.3;      // px ต่อ 1 มม. (ตัวคูณเฉย ๆ — ภาพถูกย่อ/ขยายให้พอดีกรอบทีหลังอยู่แล้ว)
const mm = (v) => +(v * MM).toFixed(2);

/** วาดในระบบพิกัด "มม." โดยมุมซ้ายบนของ *หลังเครื่อง* = (0,0) — ขอบเคสยื่นออกไปทางลบ */
const P = {
  // camera plateau — แถบยาวเกือบเต็มความกว้าง
  plateau: { x: 3.5, y: 8, w: PH_W - 7, h: 34, r: 12 },
  // เลนส์ 3 ตัวเรียงสามเหลี่ยมชิดซ้ายของ plateau
  lenses: [
    { x: 17, y: 16.5 },
    { x: 17, y: 33.5 },
    { x: 32, y: 25 },
  ],
  lensR: 7.5,
  // ฝั่งขวาของ plateau: แฟลช + LiDAR + ไมค์
  flash: { x: 64, y: 17, r: 5 },
  lidar: { x: 64, y: 31, r: 4 },
  mic: { x: 52, y: 25, r: 1.6 },
  // พื้นที่วางลาย (ใต้ plateau ลงมาจนเกือบสุดเครื่อง)
  art: { x: 4, y: 48, w: PH_W - 8, h: 110 },
  // วง MagSafe: วงแม่เหล็กจริงโตราว 56 มม. · จุดศูนย์กลางอยู่กลางพื้นที่ใต้ plateau
  mag: { x: PH_W / 2, y: 102, r: 25, w: 6 },
};

/** เอียงเล็กน้อยให้ดูเป็นมุม 3/4 แบบรูปตัวอย่าง */
const TILT = `rotate(-9 ${mm(PH_W / 2)} ${mm(PH_H / 2)})`;
/** ระยะที่ "แผ่นหลัง" ถูกถอดออกมาวางเหลื่อมทางขวา (มม.) */
const PLATE_DX = 44;
const PLATE_DY = -4;

/** สี่เหลี่ยมมุมมนเป็น path (ต้องเป็น path ถึงจะเอามาเจาะรูด้วย fill-rule="evenodd" ได้) */
const rr = (x, y, w, h, r) => {
  const [X, Y, W2, H2, R] = [mm(x), mm(y), mm(w), mm(h), mm(r)];
  return `M${X + R},${Y} H${X + W2 - R} A${R},${R} 0 0 1 ${X + W2},${Y + R} V${Y + H2 - R} ` +
    `A${R},${R} 0 0 1 ${X + W2 - R},${Y + H2} H${X + R} A${R},${R} 0 0 1 ${X},${Y + H2 - R} ` +
    `V${Y + R} A${R},${R} 0 0 1 ${X + R},${Y} Z`;
};
/** ช่องเจาะบนแผ่นหลัง — เผื่อขอบรอบ plateau เล็กน้อยเหมือนรูเจาะของจริง */
const HOLE = { x: P.plateau.x - 1.2, y: P.plateau.y - 1.2, w: P.plateau.w + 2.4, h: P.plateau.h + 2.4, r: P.plateau.r + 1.2 };

const lens = (l) => `
    <circle cx="${mm(l.x)}" cy="${mm(l.y)}" r="${mm(P.lensR)}" fill="#e8eef1" stroke="#c4d3da" stroke-width="${mm(0.5)}"/>
    <circle cx="${mm(l.x)}" cy="${mm(l.y)}" r="${mm(P.lensR - 1.6)}" fill="${INK}"/>
    <circle cx="${mm(l.x)}" cy="${mm(l.y)}" r="${mm(P.lensR - 3.6)}" fill="#5c7986"/>
    <circle cx="${mm(l.x - 1.7)}" cy="${mm(l.y - 1.7)}" r="${mm(1.3)}" fill="#ffffff" opacity="0.6"/>`;

/**
 * ตัวเคส + กล้อง + ลายใต้แผ่น — ชุดเดียวกันทั้งสองใบ (ความต่างต้องมาจากวงแม่เหล็กอย่างเดียว)
 * เงาใต้เคสเป็นวงรีจาง ๆ ไม่ใช่ฟิลเตอร์ SVG — ตัวเรนเดอร์ของ sharp รองรับฟิลเตอร์ไม่ครบ
 */
const caseBody = `
  <ellipse cx="${mm(PH_W / 2)}" cy="${mm(PH_H + 9)}" rx="${mm(PH_W * 0.72)}" ry="${mm(6)}" fill="#9fb3bd" opacity="0.2"/>
  <g transform="${TILT}">
    <!-- ขอบเคสที่หุ้มรอบเครื่อง -->
    <rect x="${mm(-WALL)}" y="${mm(-WALL)}" width="${mm(PH_W + WALL * 2)}" height="${mm(PH_H + WALL * 2)}"
          rx="${mm(PH_R + WALL)}" fill="#fafdfe" fill-opacity="0.9" stroke="${EDGE}" stroke-width="${mm(0.9)}"/>
    <rect x="0" y="0" width="${mm(PH_W)}" height="${mm(PH_H)}" rx="${mm(PH_R)}"
          fill="none" stroke="#e2ebef" stroke-width="${mm(0.7)}"/>

    <!-- camera plateau ของเครื่อง (ทรง 17 Pro — ยาวเกือบเต็มความกว้าง) -->
    <rect x="${mm(P.plateau.x)}" y="${mm(P.plateau.y)}" width="${mm(P.plateau.w)}" height="${mm(P.plateau.h)}"
          rx="${mm(P.plateau.r)}" fill="#eef4f7" stroke="#cfdde4" stroke-width="${mm(0.7)}"/>
    ${P.lenses.map(lens).join("")}
    <circle cx="${mm(P.flash.x)}" cy="${mm(P.flash.y)}" r="${mm(P.flash.r)}" fill="#f6ead2" stroke="#d8c9ac" stroke-width="${mm(0.5)}"/>
    <circle cx="${mm(P.lidar.x)}" cy="${mm(P.lidar.y)}" r="${mm(P.lidar.r)}" fill="#33454e" opacity="0.75"/>
    <circle cx="${mm(P.mic.x)}" cy="${mm(P.mic.y)}" r="${mm(P.mic.r)}" fill="#9fb4bf"/>

    <!-- ลายที่วางไว้ "ใต้" แผ่นหลัง -->
    <rect x="${mm(P.art.x)}" y="${mm(P.art.y)}" width="${mm(P.art.w)}" height="${mm(P.art.h)}" rx="${mm(3)}" fill="url(#card)"/>
    <image href="${duck.uri}" x="${mm(P.art.x + 8)}" y="${mm(P.art.y + 14)}"
           width="${mm(P.art.w - 16)}" height="${mm(P.art.h - 28)}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;

/**
 * แผ่นหลังใสที่ถอดออกมา — วาดทับทีหลังด้วยความทึบต่ำ ลายใต้แผ่นจึงมองทะลุเห็นตรงที่ซ้อนกัน
 * (นี่คือจุดที่รูปตัวอย่างสื่อ: แผ่นถอดได้ เปลี่ยนลายเองได้)
 */
const backPlate = (extra) => `
  <g transform="${TILT}"><g transform="translate(${mm(PLATE_DX)} ${mm(PLATE_DY)})">
    <!-- แผ่นใส "เจาะ" ช่องกล้องออก (2 subpath + evenodd → ของที่อยู่หลังแผ่นลอดผ่านรูจริง) -->
    <path d="${rr(0, 0, PH_W, PH_H, PH_R)} ${rr(HOLE.x, HOLE.y, HOLE.w, HOLE.h, HOLE.r)}"
          fill-rule="evenodd" fill="#ffffff" fill-opacity="0.26" stroke="#adc2cd" stroke-width="${mm(1.0)}"/>
    <!-- ขอบปากช่องเจาะ + เส้นขอบในของแผ่น -->
    <path d="${rr(HOLE.x, HOLE.y, HOLE.w, HOLE.h, HOLE.r)}"
          fill="none" stroke="#adc2cd" stroke-width="${mm(1.0)}"/>
    <path d="${rr(1.6, 1.6, PH_W - 3.2, PH_H - 3.2, PH_R - 1.6)} ${rr(HOLE.x + 1.2, HOLE.y + 1.2, HOLE.w - 2.4, HOLE.h - 2.4, HOLE.r - 1.2)}"
          fill-rule="evenodd" fill="none" stroke="#ffffff" stroke-width="${mm(0.5)}" opacity="0.55"/>
    ${extra}
  </g></g>`;

/**
 * วง MagSafe บนแผ่นหลัง — เส้นวงขาว + ขีดกลมเล็กใต้วง (ทรงมาตรฐานตามรูปของจริง)
 * ขนาดอิงวงแม่เหล็กจริง ~56 มม. · เส้นขอบเทาบาง ๆ กันเส้นขาวจมหายตรงที่แผ่นซ้อนทับลาย
 */
const magRing = `
    <circle cx="${mm(P.mag.x)}" cy="${mm(P.mag.y)}" r="${mm(P.mag.r)}" fill="none" stroke="#ffffff" stroke-width="${mm(P.mag.w)}" opacity="0.97"/>
    <circle cx="${mm(P.mag.x)}" cy="${mm(P.mag.y)}" r="${mm(P.mag.r + P.mag.w / 2)}" fill="none" stroke="#8fa7b3" stroke-width="${mm(0.6)}" opacity="0.5"/>
    <circle cx="${mm(P.mag.x)}" cy="${mm(P.mag.y)}" r="${mm(P.mag.r - P.mag.w / 2)}" fill="none" stroke="#8fa7b3" stroke-width="${mm(0.6)}" opacity="0.5"/>
    <rect x="${mm(P.mag.x - 4)}" y="${mm(P.mag.y + P.mag.r + P.mag.w / 2 + 4)}" width="${mm(8)}" height="${mm(14)}" rx="${mm(4)}"
          fill="#ffffff" opacity="0.97"/>
    <rect x="${mm(P.mag.x - 4)}" y="${mm(P.mag.y + P.mag.r + P.mag.w / 2 + 4)}" width="${mm(8)}" height="${mm(14)}" rx="${mm(4)}"
          fill="none" stroke="#8fa7b3" stroke-width="${mm(0.6)}" opacity="0.5"/>`;

const DEFS = `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eef2f5"/><stop offset="1" stop-color="#dde4e9"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffeccf"/><stop offset="1" stop-color="#ffd7e2"/>
    </linearGradient>
  </defs>`;

/**
 * ภาพเปล่า ๆ (พื้นหลังใส) ไว้วัดขอบงานจริง — วาดบนผืน 3 เท่าแล้วเลื่อนงานมาไว้กลาง
 * ⚠️ ห้ามวัดบนผืน 900 เท่าขนาดจริง: งานดิบล้นออกนอกผืน (มุมบนขวาติดลบ) แล้วโดนตัดตั้งแต่ตอนวัด
 *    ได้ bbox เล็กกว่าจริง → คำนวณย่อผิด → ภาพจริงล้นขอบ (เคสนี้เว้นขอบบนเหลือ 47px จาก 104px)
 */
const PROBE_PAD = S;
const artOnly = (extra) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S * 3}" height="${S * 3}">${DEFS}
   <g transform="translate(${PROBE_PAD} ${PROBE_PAD})">${caseBody}${backPlate(extra)}</g></svg>`;

/**
 * ย่อ/ขยายให้งานพอดีกรอบเอง — เรนเดอร์งานบนพื้นใสก่อน แล้วสแกนหาขอบจริงจาก alpha
 *
 * ⚠️ เคยใช้ sharp.trim() ตรงนี้แล้ววัดพลาด: แผ่นหลังใสทึบแค่ 0.26 ตรงมุมบนขวาเลยถูกมองว่าเป็นพื้นหลัง
 *    งานเลยล้นออกไปเกินขอบที่ตั้งไว้ 56px แล้วโดนมุมโค้งของกรอบรูปตัดหาย
 *    สแกน alpha เองแม่นกว่าและคุมเกณฑ์ได้ (นับทุกพิกเซลที่ทึบเกิน ALPHA_MIN)
 */
const MARGIN = 104;
const ALPHA_MIN = 3;

async function inkBox(svgText) {
  const { data, info } = await sharp(Buffer.from(svgText)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * channels;
    for (let x = 0; x < width; x++) {
      if (data[row + x * channels + 3] <= ALPHA_MIN) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("เรนเดอร์แล้วไม่เจอพิกเซลอะไรเลย — เช็ค SVG");
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function fitted(extra) {
  const box = S - MARGIN * 2;
  const raw = await inkBox(artOnly(extra));
  // ถอดระยะที่เลื่อนไว้ตอนวัดออก ให้กลับมาเป็นพิกัดของงานจริง
  const b = { x0: raw.x0 - PROBE_PAD, y0: raw.y0 - PROBE_PAD, w: raw.w, h: raw.h };
  if (raw.x0 < 4 || raw.y0 < 4 || raw.x0 + raw.w > S * 3 - 4 || raw.y0 + raw.h > S * 3 - 4)
    throw new Error("งานล้นผืนวัดขอบ — เพิ่ม PROBE_PAD");
  const k = Math.min(box / b.w, box / b.h);
  const tx = MARGIN - b.x0 * k + (box - b.w * k) / 2;
  const ty = MARGIN - b.y0 * k + (box - b.h * k) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${DEFS}
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(4)})">${caseBody}${backPlate(extra)}</g>
</svg>`;
}

const ARTS = { [`type-plain-${V}`]: await fitted(""), [`type-magsafe-${V}`]: await fitted(magRing) };

mkdirSync(OUT, { recursive: true });
const files = {};
for (const [name, src] of Object.entries(ARTS)) {
  const buf = await sharp(Buffer.from(src)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(`${OUT}/${name}.png`, buf);
  files[name] = buf;
  console.log(`🎨 ${OUT}/${name}.png (${Math.round(buf.length / 1024)} KB)`);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

if (UPLOAD) {
  for (const [name, buf] of Object.entries(files)) {
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}.png`, buf, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}.png`);
  }
} else {
  console.log("(ยังไม่อัปภาพ — ใส่ --upload ถ้าจะอัปจริง)");
}

const url = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.png`;

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (row.name !== EXPECT_NAME) throw new Error(`สินค้า ${ID} ชื่อ "${row.name}" ไม่ใช่ "${EXPECT_NAME}" — หยุดก่อน`);

const data = row.data;
const group = data.options?.find((o) => o.label === TYPE_LABEL);
if (!group) throw new Error(`ไม่เจอกลุ่ม "${TYPE_LABEL}" — รัน case-frame-card-type-magsafe.mjs ก่อน`);
const MAP = { ธรรมดา: `type-plain-${V}`, Magsafe: `type-magsafe-${V}` };
for (const c of group.choices) {
  const art = MAP[c.name];
  if (!art) throw new Error(`ตัวเลือก "${c.name}" ยังไม่มีภาพในตาราง MAP`);
  c.imageSrc = url(art);
  console.log(`🔗 ${c.name} → ${art}.png`);
}

if (WRITE) {
  const { error: e } = await sb.from("products").update({ data }).eq("id", ID);
  if (e) throw e;
  console.log("✅ เขียนเรียบร้อย");
} else {
  console.log("(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
}
