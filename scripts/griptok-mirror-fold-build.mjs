#!/usr/bin/env node
/**
 * เติมข้อมูลสินค้า "GRIPTOK  กระจกพับ" (id new-mt8fg70f-8328 — ร่างที่ผู้ใช้สร้างจากปุ่ม ＋ เพิ่มสินค้า)
 *
 *   node scripts/griptok-mirror-fold-build.mjs           # ดาวน์โหลด+ประมวลผลภาพลง .cache (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-mirror-fold-build.mjs --write   # อัปไฟล์ขึ้น storage + เขียนสินค้า
 *
 * ที่มา (ผู้ใช้สั่ง 25 ส.ค. 69): ตาราง "GRIPTOK กระจกพับ UV Printing" หน้า pricelists /griptok
 *   ราคา: 1-10=120 · 11-29=90 · 30-49=70 · 50-99=65 · 100-499=55 · 500-999=50 · 1000+=45
 *   กติกาคละ: 1-10 ชิ้นคละลายได้อิสระ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย/คละแบบ ขั้นต่ำลายละ 5 ชิ้น
 *     → freeMixBelowQty 11 + minPerDesign 5 + tierByDesign (แบบเดียวกับ griptok-th)
 *   แบบ: ทรงกลม | ทรงสี่เหลี่ยม — ราคาเท่ากัน แต่คงแกน "แบบ" ใน driverLabels
 *     (⚠️ กับดัก driver: ตัดกลุ่มนี้เมื่อไหร่ราคาหล่นไป product.price เงียบ ๆ)
 *
 * สื่อจากหน้า pricelists (wixstatic):
 *   ภาพหลัก = งานทรงสี่เหลี่ยมบนมือถือ (SONY A7M2, มีลายน้ำ iDucky) · ภาพทรงกลม = โปสเตอร์คลิปร้าน
 *   คลิป 3 ตัว (720p): ทรงสี่เหลี่ยม UV mirror · กระจกพับ งาน UV · ฐานพับ (โชว์กลไกพับ)
 *   การ์ดตัวเลือก 900×900 ครอปจากภาพจริง: ทรงกลม (ครอปล่างภาพ round) · ทรงสี่เหลี่ยม (ครอปจากภาพหลัก)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mt8fg70f-8328";
const DIR = ".cache/griptok-mirror-fold";
const SRC = `${DIR}/src`;
const OUT = `${DIR}/upload`;
mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}`;

/* ---------- 1) ดาวน์โหลดต้นฉบับจากหน้า pricelists ---------- */
const SOURCES = {
  "square-photo.jpg": "https://static.wixstatic.com/media/959b83_e0742de6feb84f7a946d2326f3c17a93~mv2.jpg",
  "round-photo.jpg": "https://static.wixstatic.com/media/959b83_be8c81a392274ca9a70105bc66a9f97b~mv2.jpg",
  "poster-uv-square.jpg": "https://static.wixstatic.com/media/959b83_8571bc7ff12d4e238f724c67164bc69af003.jpg",
  "poster-uv-print.jpg": "https://static.wixstatic.com/media/959b83_d7e313f27bf74b76b914987cf002cecaf003.jpg",
  "poster-fold-base.jpg": "https://static.wixstatic.com/media/959b83_9a962234d29e4e10af707f17d010a0f3f003.jpg",
  "clip-uv-square.mp4": "https://video.wixstatic.com/video/959b83_8571bc7ff12d4e238f724c67164bc69a/720p/mp4/file.mp4",
  "clip-uv-print.mp4": "https://video.wixstatic.com/video/959b83_d7e313f27bf74b76b914987cf002ceca/720p/mp4/file.mp4",
  "clip-fold-base.mp4": "https://video.wixstatic.com/video/959b83_9a962234d29e4e10af707f17d010a0f3/720p/mp4/file.mp4",
};
for (const [file, url] of Object.entries(SOURCES)) {
  const path = `${SRC}/${file}`;
  if (existsSync(path)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลด ${file} ไม่ได้: HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  console.log(`⬇️  ${file}`);
}

/* ---------- 2) ประมวลผลภาพ ---------- */
const JPEG = { quality: 88 };
// ภาพหลัก: ย่อ ≤1600px ตามนโยบายรูปสินค้า
await sharp(`${SRC}/square-photo.jpg`).resize(1600, null, { withoutEnlargement: true }).jpeg(JPEG).toFile(`${OUT}/main-square-v1.jpg`);
// ภาพทรงกลม (โปสเตอร์คลิป 360×639 — ใช้ทั้งใบในแกลเลอรี)
await sharp(`${SRC}/round-photo.jpg`).jpeg(JPEG).toFile(`${OUT}/round-mirror-v1.jpg`);
// โปสเตอร์คลิป (720×1280)
for (const f of ["poster-uv-square", "poster-uv-print", "poster-fold-base"]) {
  await sharp(`${SRC}/${f}.jpg`).jpeg(JPEG).toFile(`${OUT}/${f}-v1.jpg`);
}
// การ์ดตัวเลือก 900×900 (แกลเลอรี/การ์ดครอปจัตุรัส object-cover)
// ทรงกลม: ครอปส่วนล่างของภาพ round (เลี่ยงตัวหนังสือ "Griptok Mirror" กลางภาพ)
await sharp(`${SRC}/round-photo.jpg`)
  .extract({ left: 20, top: 322, width: 317, height: 317 })
  .resize(900, 900)
  .jpeg(JPEG)
  .toFile(`${OUT}/shape-round-v1.jpg`);
// ทรงสี่เหลี่ยม: ครอปรอบชิ้นงานจากภาพหลัก (ต้นฉบับ 3879×2866)
await sharp(`${SRC}/square-photo.jpg`)
  .extract({ left: 1300, top: 1000, width: 1500, height: 1500 })
  .resize(900, 900)
  .jpeg(JPEG)
  .toFile(`${OUT}/shape-square-v1.jpg`);
console.log("🖼  ประมวลผลภาพลง", OUT);

/* ---------- 3) ข้อมูลสินค้า ---------- */
const TIERS = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 29, label: "11-29 ชิ้น" },
  { upTo: 49, label: "30-49 ชิ้น" },
  { upTo: 99, label: "50-99 ชิ้น" },
  { upTo: 499, label: "100-499 ชิ้น" },
  { upTo: 999, label: "500-999 ชิ้น" },
  { upTo: null, label: "1000 ชิ้นขึ้นไป" },
];
const PRICES = [120, 90, 70, 65, 55, 50, 45];
const PRICING = {
  unit: "ชิ้น",
  cells: { ทรงกลม: PRICES, ทรงสี่เหลี่ยม: PRICES },
  tiers: TIERS,
  driverLabels: ["แบบ"],
};

const gallery = (file, label, extra = {}) => ({
  src: `${BASE}/${file}`,
  emoji: "🪞",
  label,
  gradient: "from-sky-200 to-cyan-300",
  ...extra,
});

const patch = {
  emoji: "🪞",
  price: PRICES[0],
  priceMin: PRICES.at(-1),
  priceMax: PRICES[0],
  rating: 4.8,
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: `${BASE}/main-square-v1.jpg`,
  description:
    "กริ๊บต๊อกกระจกพับ พิมพ์ลาย UV ของคุณเองบนฝาหน้า เปิดฝาเป็นกระจกส่องหน้า พับเก็บได้ ใช้เป็นที่จับ/ขาตั้งมือถือ มีทรงกลมและทรงสี่เหลี่ยม",
  highlights: ["มีกระจกส่องหน้าในตัว", "ฐานพับเก็บได้ ใช้เป็นขาตั้ง", "พิมพ์ลาย UV คมชัด"],
  images: [
    gallery("main-square-v1.jpg", "GRIPTOK กระจกพับ ทรงสี่เหลี่ยม งานพิมพ์ UV"),
    gallery("round-mirror-v1.jpg", "GRIPTOK กระจกพับ ทรงกลม เปิดฝาเป็นกระจก"),
    gallery("poster-uv-square-v1.jpg", "งานจริง — ทรงสี่เหลี่ยม พิมพ์ UV + กระจกพับ", {
      emoji: "🎬",
      videoSrc: `${BASE}/clip-uv-square-v1.mp4`,
    }),
    gallery("poster-fold-base-v1.jpg", "งานจริง — ฐานพับเก็บได้ กางเป็นที่จับ/ขาตั้ง", {
      emoji: "🎬",
      videoSrc: `${BASE}/clip-fold-base-v1.mp4`,
    }),
    gallery("poster-uv-print-v1.jpg", "งานจริง — กระจกพับ งานพิมพ์ UV", {
      emoji: "🎬",
      videoSrc: `${BASE}/clip-uv-print-v1.mp4`,
    }),
  ],
  options: [
    {
      label: "แบบ",
      display: "cards",
      choices: [
        { name: "ทรงกลม", imageSrc: `${BASE}/shape-round-v1.jpg` },
        { name: "ทรงสี่เหลี่ยม", imageSrc: `${BASE}/shape-square-v1.jpg` },
      ],
    },
  ],
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1",
      minQty: 11,
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing: PRICING,
    },
  ],
  tierByDesign: true,
  terms:
    "*1-10 ชิ้น สามารถคละลายได้อิสระ\n*ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละแบบ ขั้นต่ำลายละ 5 ชิ้น\n*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: "• กริ๊บต๊อกกระจกพับ งานพิมพ์ UV บนฝาหน้า เปิดฝาด้านในเป็นกระจกส่องหน้า\n• มี 2 แบบ: ทรงกลม | ทรงสี่เหลี่ยม (ราคาเท่ากัน)\n• ฐานพับเก็บได้ — กางออกใช้เป็นที่จับกันเครื่องตก หรือตั้งวางดูหนัง\n• 1-10 ชิ้น สามารถคละลายได้อิสระ\n• ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละแบบ ขั้นต่ำลายละ 5 ชิ้น\n• ไฟล์ นามสกุล .Ai .Psd .Png หรือพื้นหลังใส\n• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% มีโอกาสที่สีแต่ละรอบไม่เหมือนกันหากผลิตคนละเครื่อง\n• ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
    },
    {
      title: "วิธีสั่งงาน",
      text: 'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกจำนวนและตัวเลือกที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น แบบ/ลายที่ต้องการ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: สินค้า/แบบที่เลือก · รายละเอียดเพิ่มเติม (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การเตรียมไฟล์",
      text: "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: "รับทำ กริ๊บต๊อกกระจกพับ พิมพ์ลายตามสั่ง เริ่มต้น 120 บาท",
    description:
      "รับทำ/รับผลิต กริ๊บต๊อกกระจกพับ (Griptok Mirror) งานพิมพ์ UV ใส่ลาย/รูปของคุณเอง เปิดฝาเป็นกระจกส่องหน้า มีทรงกลมและทรงสี่เหลี่ยม เริ่มต้น 120 บาท สั่งเยอะลดตามขั้น · สั่งง่าย ส่งไวทั่วไทย ตรวจแบบก่อนผลิตทุกชิ้น",
    keywords: [
      "รับทำกริ๊บต๊อก",
      "กริ๊บต๊อกกระจก",
      "กริ๊บต๊อกกระจกพับ",
      "griptok mirror",
      "กริ๊บต๊อก",
      "ที่จับมือถือ",
      "รับทำ",
      "รับผลิต",
      "รับสกรีน",
      "งานสั่งทำ",
      "ทรงกลม",
      "ทรงสี่เหลี่ยม",
      "พิมพ์ลายตามสั่ง",
    ],
    faqs: [
      {
        q: "กริ๊บต๊อกกระจกพับ ราคาเท่าไหร่?",
        a: "เริ่มต้นชิ้นละ 120 บาท — สั่งเยอะลดตามขั้น (11-29 ชิ้น ชิ้นละ 90 · 100-499 ชิ้น ชิ้นละ 55 · 1000 ชิ้นขึ้นไป ชิ้นละ 45) ดูตารางราคาเต็มได้ในหน้าสินค้า",
      },
      {
        q: "กริ๊บต๊อกกระจกพับ มีแบบอะไรให้เลือกบ้าง?",
        a: "มี 2 แบบ: ทรงกลม และ ทรงสี่เหลี่ยม ราคาเท่ากันทั้งสองแบบ ฝาหน้าพิมพ์ลาย UV เปิดออกเป็นกระจกส่องหน้า",
      },
      {
        q: "สั่งคละลายได้ไหม?",
        a: "1-10 ชิ้น คละลายได้อิสระ ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย/คละแบบได้ ขั้นต่ำลายละ 5 ชิ้น",
      },
      {
        q: "รับทำเป็นลายของตัวเองได้ไหม?",
        a: "ได้ครับ ส่งไฟล์ลาย/รูปที่ต้องการมาตอนสั่งซื้อ ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกครั้ง",
      },
    ],
  },
};

/* ---------- 4) เขียนจริง ---------- */
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/กระจกพับ/.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = { ...structuredClone(row.data), ...patch };
d.hidden = true; // คงเป็นฉบับร่าง — ผู้ใช้กดเผยแพร่เองตามขั้นตอนปกติ

console.log(`\nสินค้า: ${row.name} (${ID})`);
console.log(`ราคา ${PRICES[0]} → ${PRICES.at(-1)} บาท · ${TIERS.length} ขั้น · แบบ: ทรงกลม | ทรงสี่เหลี่ยม`);
if (!WRITE) {
  console.log("(ยังไม่อัป/ไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

const UPLOADS = [
  ["main-square-v1.jpg", "image/jpeg", OUT],
  ["round-mirror-v1.jpg", "image/jpeg", OUT],
  ["poster-uv-square-v1.jpg", "image/jpeg", OUT],
  ["poster-uv-print-v1.jpg", "image/jpeg", OUT],
  ["poster-fold-base-v1.jpg", "image/jpeg", OUT],
  ["shape-round-v1.jpg", "image/jpeg", OUT],
  ["shape-square-v1.jpg", "image/jpeg", OUT],
  ["clip-uv-square-v1.mp4", "video/mp4", SRC, "clip-uv-square.mp4"],
  ["clip-uv-print-v1.mp4", "video/mp4", SRC, "clip-uv-print.mp4"],
  ["clip-fold-base-v1.mp4", "video/mp4", SRC, "clip-fold-base.mp4"],
];
for (const [name, contentType, dir, srcName] of UPLOADS) {
  const buf = readFileSync(`${dir}/${srcName ?? name}`);
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${name}`, buf, { contentType, upsert: true });
  if (upErr) throw upErr;
  console.log(`⬆️  ${name} (${Math.round(buf.length / 1024)} KB)`);
}

// อัปคอลัมน์กระจก name/category/price ด้วย (คงชื่อ/หมวดที่ผู้ใช้ตั้งไว้ อัปเดตแค่ราคา)
const { error: saveErr } = await sb.from("products").update({ data: d, price: PRICES[0] }).eq("id", ID);
if (saveErr) throw saveErr;
console.log("\n✅ บันทึกแล้ว — GRIPTOK กระจกพับ พร้อมตาราง 7 ขั้น + การ์ดแบบ 2 ทรง + คลิป 3 ตัว (ยังเป็นฉบับร่าง)");
