/**
 * ภาพการ์ด "สีพิเศษ" ของพวงกุญแจอะคริลิค — ต่อสวอตช์จริง 4 ใบเป็นตาราง 2×2
 * (กลิตเตอร์-รุ้ง · โฮโลแกรม-รุ้ง · กระจก · สีชมพูทึบ) ให้เห็นในใบเดียวว่ากลุ่มนี้มีอะไรบ้าง
 *
 *   npx tsx scripts/keyring-special-color-art.mts            # เรนเดอร์ไว้ดูก่อน (.cache/)
 *   npx tsx scripts/keyring-special-color-art.mts --upload   # อัปขึ้น Supabase Storage
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const REV = "v1";
const BUCKET = "product-images";
const DIR = "products/acrylic-colors";
const OUT_NAME = `special-mix-${REV}.jpg`;
const BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/acrylic-colors";
/**
 * 4 ใบให้เห็นครบว่ากลุ่ม "สีพิเศษ" มีอะไร: กลิตเตอร์ · โฮโลแกรม · กากเพชร · อะคริลิคสีทึบ
 * (เลี่ยง mirror-v2 — สวอตช์กระจกถ่ายมาขาวโพลน ย่อแล้วดูเหมือนช่องว่าง)
 */
const TILES = ["glitter-rainbow-v2.jpg", "holo-star-v2.jpg", "g-rosegold-v2.jpg", "626-v2.jpg"];
const CELL = 320;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const cells = await Promise.all(
  TILES.map(async (f) => {
    const res = await fetch(`${BASE}/${f}`);
    if (!res.ok) throw new Error(`โหลด ${f} ไม่ได้ — ${res.status}`);
    return sharp(Buffer.from(await res.arrayBuffer())).resize(CELL, CELL, { fit: "cover" }).toBuffer();
  })
);

const img = await sharp({ create: { width: CELL * 2, height: CELL * 2, channels: 3, background: "#fff" } })
  .composite([
    { input: cells[0], top: 0, left: 0 },
    { input: cells[1], top: 0, left: CELL },
    { input: cells[2], top: CELL, left: 0 },
    { input: cells[3], top: CELL, left: CELL },
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { error } = await sb.storage.from(BUCKET).upload(`${DIR}/${OUT_NAME}`, img, { contentType: "image/jpeg", upsert: false });
if (error) throw new Error(`อัปไม่สำเร็จ — ${error.message}`);
console.log(`✅ ${BASE}/${OUT_NAME}`);
