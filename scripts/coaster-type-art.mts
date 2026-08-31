/**
 * ภาพการ์ด "ประเภท" ของ Acrylic Coaster (/products/acrylic-coaster)
 * ผู้ใช้ส่งภาพหน้าจอมา 31 ส.ค. 69: กลุ่ม "ประเภท" เป็นวิทยุเปล่า ๆ 2 บรรทัด ไม่มีอะไรให้ดูเลย
 * ("เพิ่มภาพให้หน่อย") — ทั้งที่ประเภทเป็นแกนราคาจริง (ธรรมดา ฿110 · พิเศษ ฿130 ที่ 1-10 อัน)
 *
 *   npx tsx scripts/coaster-type-art.mts            # เรนเดอร์ไว้ดูก่อน (.cache/)
 *   npx tsx scripts/coaster-type-art.mts --upload   # อัปขึ้น Supabase Storage
 *
 * "อะคริลิค ธรรมดา" = ใส + ขาวขุ่น C-02 (2 เนื้อที่กฎอนุญาต) → ต่อภาพจริงครึ่งต่อครึ่ง
 *   บน: ที่รองแก้วอะคริลิคใสของจริง (ครอปจากรูปสินค้าใบแรก) · ล่าง: สวอตช์ C-02 ของร้าน
 * "อะคริลิค พิเศษ" ใช้สวอตช์รวม 4 ใบชุดกลางที่มีอยู่แล้ว (special-mix-v1) — ไม่ต้องทำใหม่
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const REV = "v1";
const BUCKET = "product-images";
const DIR = "products/acrylic-coaster";
const OUT_NAME = `type-normal-${REV}.jpg`;

/** รูปสินค้าใบที่ 3 ของ acrylic-coaster — ที่รองแก้วอะคริลิคใสทรงเหลี่ยม เห็นขอบใสชัด */
const CLEAR_PHOTO =
  "https://static.wixstatic.com/media/959b83_d204fdf9337543749ab0b64ca702c9a4~mv2.jpg/v1/fill/w_900,h_675,al_c,q_85/file.jpg";
/** แถบกลางตัวที่รองแก้วในรูปนั้น (รูปต้นทาง 900×675) — อัตรา 2:1 พอดีครึ่งบนของการ์ด */
const CLEAR_BOX = { left: 185, top: 250, width: 605, height: 302 };
const C02 =
  "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/acrylic-colors/c02-v2.jpg";
/** สวอตช์ C-02 เฉพาะแถบที่มีตัวหนังสือ — เลี่ยงป้าย "ไม่บวกเพิ่ม" มุมบนที่จะโดนตัดครึ่ง */
const C02_BOX = { left: 0, top: 250, width: 640, height: 320 };

const SIZE = 700;
const HALF = SIZE / 2;

const grab = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

const top = await sharp(await grab(CLEAR_PHOTO)).extract(CLEAR_BOX).resize(SIZE, HALF, { fit: "cover" }).toBuffer();
const bottom = await sharp(await grab(C02)).extract(C02_BOX).resize(SIZE, HALF, { fit: "cover" }).toBuffer();
const img = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: "#fff" } })
  .composite([
    { input: top, top: 0, left: 0 },
    { input: bottom, top: HALF, left: 0 },
  ])
  .jpeg({ quality: 88 })
  .toBuffer();

mkdirSync(".cache", { recursive: true });
writeFileSync(`.cache/${OUT_NAME}`, img);
console.log(`เรนเดอร์แล้ว .cache/${OUT_NAME} — ${(img.length / 1024).toFixed(0)} KB`);

if (!UPLOAD) {
  console.log("(ยังไม่อัป — ใส่ --upload ถ้าต้องการขึ้น Storage)");
  process.exit(0);
}
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { error } = await sb.storage.from(BUCKET).upload(`${DIR}/${OUT_NAME}`, img, { contentType: "image/jpeg", upsert: false });
if (error) throw new Error(`อัปไม่สำเร็จ — ${error.message}`);
console.log(`✅ ${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${DIR}/${OUT_NAME}`);
