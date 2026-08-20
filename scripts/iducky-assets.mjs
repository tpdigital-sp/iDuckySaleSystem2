#!/usr/bin/env node
/**
 * อาร์ตเวิร์กชุดแบรนด์ iDucky (มาสคอตเป็ด + ไอคอน 3D) สำหรับใช้ในภาพประกอบตัวเลือกสินค้า
 *
 *   node scripts/iducky-assets.mjs            # แคชไฟล์จากไดรฟ์ลง .cache/iducky/ + สรุปรายการ
 *
 * ต้นทางอยู่ในไดรฟ์ร้าน (ฝ่าย Content ทำไว้ — น่ารักกว่าวาดเอง):
 *   /Volumes/iDuckyShop/- ตัวอย่าง เคสลูกค้าสั่งทำ/- รวมงานฝ่าย Content/WEB/iduckystore/
 *     iDUCKY/iDUCKY_00..04.png   มาสคอตเป็ด (พื้นหลังใส)
 *     ICON/01..29.png            ไอคอน 3D ตามหมวด/ฟีเจอร์
 *
 * ⚠️ ไดรฟ์ไม่ได้ต่อตลอด — สคริปต์นี้จึง "แคช" ไฟล์ที่ใช้จริงไว้ที่ .cache/iducky/
 *    ครั้งต่อไปถ้าไดรฟ์ไม่ได้ต่อ ก็ยังเรนเดอร์ภาพสินค้าใหม่ได้จากแคช
 *
 * ใช้ในสคริปต์ภาพ:
 *   import { mascotDataUri, iconDataUri } from "./iducky-assets.mjs";
 *   const art = await mascotDataUri("heart", 520);      // → data:image/png;base64,...
 *   `<image href="${art}" x=".." y=".." width=".." height=".." preserveAspectRatio="xMidYMid meet"/>`
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import sharp from "sharp";

const DRIVE = "/Volumes/iDuckyShop/- ตัวอย่าง เคสลูกค้าสั่งทำ/- รวมงานฝ่าย Content/WEB/iduckystore";
const CACHE = ".cache/iducky";

/** มาสคอตที่หยิบมาใช้บ่อย — ตั้งชื่อสั้น ๆ ให้เรียกง่าย */
export const MASCOTS = {
  /** เป็ดกอดหัวใจ ยืนเต็มตัว หันหน้าตรง — ใช้เป็น "ลายที่สกรีน" บนชิ้นงาน */
  heart: "iDUCKY/iDUCKY_02.png",
  /** เป็ดชูสองนิ้ว + หัวใจ ตัวเล็ก — ใช้กับชิ้นงานเล็ก/แนวนอน */
  peace: "iDUCKY/iDUCKY_04.png",
  /** เป็ดหน้าร้าน iDUCKY (มีของวางขาย) — ภาพประกอบเชิงเล่าเรื่อง */
  shop: "iDUCKY/iDUCKY_01.png",
  /** เป็ดโคลสอัพ ชูสองนิ้ว */
  hello: "iDUCKY/iDUCKY_00.png",
  /** เป็ดถือถุงช้อป + คูปอง */
  shopping: "iDUCKY/iDUCKY_03.png",
};

/** ไอคอน 3D ตามหมวดสินค้า/ฟีเจอร์ (ชื่อไฟล์ไทยจากฝ่าย Content) */
export const ICONS = {
  keyring: "ICON/01.พวงกุญแจ.png",
  standee: "ICON/02.สแตนดี้.png",
  paper: "ICON/03.กระดาษ.png",
  sticker: "ICON/04.สติ๊กเกอร์.png",
  gift: "ICON/05.ของขวัญ.png",
  lightbase: "ICON/06.สแตนดี้ฐานไฟ.png",
  phonecase: "ICON/07.เคสมือถือ.png",
  shirt: "ICON/08.เสื้อ.png",
  heart: "ICON/14.หัวใจ.png",
  star: "ICON/28.รีวิว.png",
  bell: "ICON/29.กระดิ่ง.png",
};

/** หาไฟล์จริง — ไดรฟ์ก่อน ถ้าไม่ได้ต่อค่อยใช้แคช (และแคชไว้ทุกครั้งที่อ่านจากไดรฟ์ได้) */
export function assetPath(rel) {
  const flat = rel.replace(/\//g, "__");
  const cached = `${CACHE}/${flat}`;
  const src = `${DRIVE}/${rel}`;
  if (existsSync(src)) {
    mkdirSync(CACHE, { recursive: true });
    if (!existsSync(cached) || readFileSync(src).length !== readFileSync(cached).length) copyFileSync(src, cached);
    return src;
  }
  if (existsSync(cached)) return cached;
  throw new Error(
    `หาไฟล์ ${rel} ไม่เจอ — ต่อไดรฟ์ iDuckyShop แล้วรัน "node scripts/iducky-assets.mjs" หนึ่งครั้งเพื่อแคชไว้`
  );
}

/** ตัดขอบโปร่งใสออก + ย่อให้พอดี แล้วคืนเป็น data URI สำหรับฝังใน SVG */
async function dataUri(rel, width) {
  const buf = await sharp(assetPath(rel))
    .trim({ threshold: 1 })
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** มาสคอตเป็ด (ชื่อจาก MASCOTS) เป็น data URI พร้อมสัดส่วนภาพ */
export async function mascotDataUri(name = "heart", width = 520) {
  const rel = MASCOTS[name] ?? name;
  const uri = await dataUri(rel, width);
  const meta = await sharp(assetPath(rel)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  return { uri, ratio: meta.info.width / meta.info.height };
}

/** ไอคอน 3D (ชื่อจาก ICONS) เป็น data URI */
export async function iconDataUri(name, width = 256) {
  const rel = ICONS[name] ?? name;
  return dataUri(rel, width);
}

// รันตรง ๆ = แคชไฟล์ที่ใช้บ่อยไว้ให้ครบ (เผื่อวันหลังไดรฟ์ไม่ได้ต่อ)
if (process.argv[1] && process.argv[1].endsWith("iducky-assets.mjs")) {
  mkdirSync(CACHE, { recursive: true });
  const all = [...Object.values(MASCOTS), ...Object.values(ICONS)];
  let ok = 0;
  for (const rel of all) {
    try {
      assetPath(rel);
      ok++;
    } catch (e) {
      console.log(`⚠️  ${rel}: ${e.message}`);
    }
  }
  console.log(`✅ แคชไว้ ${ok}/${all.length} ไฟล์ที่ ${CACHE}`);
  const { uri } = await mascotDataUri("heart", 520);
  writeFileSync(`${CACHE}/preview-mascot.txt`, `${uri.length} bytes data-uri`);
  console.log(`   มาสคอต heart → data URI ${Math.round(uri.length / 1024)} KB`);
}
