#!/usr/bin/env node
/**
 * เตรียมภาพสินค้า "ปลอกหมอนข้าง" (แบบบอดี้ / แบบกลม)
 *
 *   node scripts/pillowcase-bolster-art.mjs
 *   → .cache/pillowcase-bolster/upload/*.jpg  (ย่อ 1200px ตามนโยบายภาพสินค้า)
 *
 * ที่มา: รูปงานจริงจากหน้า iduckyofficial-pricelists.com/pillowcases
 *   แกลเลอรีของหน้าเว็บแยกเป็นบล็อกตามหัวข้อ — บล็อก "ปลอกหมอนข้าง แบบ บอดี้"
 *   (ทรงแบนสี่เหลี่ยม แบบดาคิมาคุระ) และบล็อก "ปลอกหมอนข้าง แบบ กลม" (ทรงกระบอกปลายจีบรูด)
 *   เลือกมาเฉพาะภาพที่ "เห็นทรงชัด" เพื่อใช้เป็นภาพประจำตัวเลือกให้ลูกค้าแยกสองแบบออก
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = new URL("../.cache/pillowcase-bolster/upload/", import.meta.url).pathname;
const MEDIA = (id) => `https://static.wixstatic.com/media/${id}/v1/fill/w_1400,h_1400,al_c,q_90/file.jpg`;

/** ชื่อไฟล์ → media id บนเว็บตารางราคา (บล็อกไหน กำกับไว้ในคอมเมนต์) */
const SHOTS = {
  // ── แบบบอดี้ (ทรงแบนสี่เหลี่ยม 20x50 นิ้ว) ──
  "body-hero": "959b83_9f80ca32236045389950bb985442397a~mv2.jpg", // เห็นทรงแบนเต็มใบชัดสุด → ภาพประจำตัวเลือก
  "body-print": "959b83_8429f63fd102428e9d8f3b4765a2985e~mv2.jpg", // พิมพ์เต็มใบ
  "body-face": "959b83_8ccd171aa8a04207be7d6c37ecdc8f7b~mv2.jpg", // งานพิมพ์คมชัด (ระยะใกล้)
  "body-fabric": "959b83_98b31f9b841a4025883658fe869b8ef5~mv2.jpg", // เนื้อผ้า/ตะเข็บ
  // ── แบบกลม (ทรงกระบอก 15x50 นิ้ว) ──
  "round-hero": "959b83_ef3dd2b952cc4b00a4518d232a5e3a05~mv2.jpg", // เห็นทรงกระบอกชัดสุด → ภาพประจำตัวเลือก
  "round-print": "959b83_9c3acac655c44d858832ffe345037460~mv2.jpg", // พิมพ์เต็มใบรอบตัว
  "round-body": "959b83_bb09601f75a84ecb967e74bfc7a1f99f~mv2.jpg", // เต็มใบ + ปลายจีบ
  "round-tie": "959b83_8691263fa2e14914af70fa2ed622e09a~mv2.jpg", // ปลายปลอกรูดเก็บ (ระยะใกล้)
};

mkdirSync(OUT, { recursive: true });
for (const [name, id] of Object.entries(SHOTS)) {
  const res = await fetch(MEDIA(id), {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.iduckyofficial-pricelists.com/" },
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  writeFileSync(`${OUT}${name}.jpg`, jpg);
  console.log(`🖼  ${name}.jpg (${Math.round(jpg.length / 1024)} KB)`);
}
console.log(`\nเสร็จ → ${OUT}`);
