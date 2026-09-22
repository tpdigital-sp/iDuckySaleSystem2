/**
 * 📣 เปลี่ยนรูปป้ายประชาสัมพันธ์หน้าแรกเป็นชุดโทนฟ้า-ขาว — เจ้าของร้านสั่ง 22 ก.ย. 69
 *   ("ของเดิมสีจัดจ้านไป ไม่ค่อยเข้ากับเว็บ")
 *
 * เตรียมไฟล์ก่อนด้วย: node scripts/promo-banner-owner.mjs   (ภาพชุดเจ้าของร้าน — ที่ใช้อยู่จริง)
 *   ทางเลือก: node scripts/promo-banner-art/build.mjs       (ชุดที่วาดจาก HTML/CSS ของเว็บ)
 * แล้วค่อยอัปขึ้นเว็บ: node --env-file=.env.local scripts/promo-banners-calm.mjs [--dry] [id ...]
 *
 * แตะเฉพาะรูป/ชิ้นลูกเล่นของป้าย 5 ใบเดิม (image · imageMobile · layers · layersMobile · shine · motion)
 * ชื่อป้าย / ลิงก์ / วันเริ่ม-สิ้นสุด / การซ่อน ของเดิมไม่ยุ่ง — และไม่ยุ่งกับป้ายใบอื่นในระบบ
 * ตำแหน่งวงแหวนเรียกกด (tap) มาจาก layers-<VER>.json ที่สคริปต์เตรียมไฟล์วัดจากปุ่มในรูปให้เอง
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ART = path.join(HERE, "assets", "promo-banners");
const ROW_ID = "__promo_banners__";
const BUCKET = "product-images";
const VER = "v23"; // ต้องตรงกับ VER ในสคริปต์ที่เตรียมไฟล์ (promo-banner-owner.mjs)
const DRY = process.argv.includes("--dry");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/**
 * ท่าขยับของ "ทั้งใบ" — ให้แต่ละใบไม่ซ้ำกัน (เจ้าของร้าน 22 ก.ย. 69: "เพิ่มจุดขยับ ๆ ให้หน่อย")
 * ทุกท่าขยับเบามาก (เลื่อน ~1% เอียงไม่ถึง 1°) ต่างกันที่จังหวะ ไม่ใช่ระยะ — ดู .promo-mo-* ท้าย landing.css
 */
const IDS = [
  { id: "web-order-24h", motion: "float" }, // ลอยขึ้นลง
  { id: "early-pay", motion: "hop" }, // เด้งดึ๋ง เร่งให้รีบโอน
  { id: "member-tier", motion: "breathe" }, // หายใจเข้าออกนุ่ม ๆ
  { id: "dealer", motion: "sway" }, // โยกซ้ายขวา
  { id: "line-consult", motion: "wiggle" }, // สะบัดตัวเรียกให้ทัก
].filter((b) => !ONLY.length || ONLY.includes(b.id));

const FX = JSON.parse(await readFile(path.join(ART, `layers-${VER}.json`), "utf8"));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function upload(file) {
  const bytes = await readFile(path.join(ART, file));
  const dest = `products/banners/${file}`;
  if (DRY) return `(dry) ${dest} ${Math.round(bytes.length / 1024)}KB`;
  const { error } = await sb.storage.from(BUCKET).upload(dest, bytes, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`อัปโหลด ${file} ไม่สำเร็จ: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl;
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
if (readErr) throw new Error(`อ่านแถวป้ายไม่สำเร็จ: ${readErr.message}`);
const cur = row?.data?.banners ?? { on: true, seconds: 6, items: [] };
let items = [...(cur.items ?? [])];

for (const { id, motion } of IDS) {
  const old = items.find((x) => x.id === id);
  if (!old) throw new Error(`ไม่มีป้าย ${id} ในระบบ — สคริปต์นี้เปลี่ยนแค่รูปของป้ายเดิม`);
  const fx = FX[id];
  if (!fx?.d || !fx?.m) throw new Error(`ไม่มีตำแหน่งปุ่มของ ${id} ใน assets/promo-banners/layers-${VER}.json (รันสคริปต์เตรียมไฟล์ก่อน)`);
  const image = await upload(`${id}-d-${VER}.webp`);
  const imageMobile = await upload(`${id}-m-${VER}.webp`);
  items = items.map((x) =>
    x.id === id ? { ...x, image, imageMobile, layers: fx.d, layersMobile: fx.m, shine: true, motion, still: undefined } : x
  );
  console.log(`• ${id} — ${image}`);
}

if (DRY) {
  console.log(`(dry) เปลี่ยนรูป ${IDS.length} ใบ จากทั้งหมด ${items.length} ใบ`);
  process.exit(0);
}

const { error } = await sb
  .from("products")
  .upsert(
    {
      id: ROW_ID,
      name: "(ตั้งค่าร้าน — ป้ายประชาสัมพันธ์)",
      category: "__settings__",
      price: 0,
      data: { ...(row?.data ?? {}), banners: { ...cur, items } },
    },
    { onConflict: "id" }
  );
if (error) throw new Error(`บันทึกแถวป้ายไม่สำเร็จ: ${error.message}`);

const { data: back } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
console.log(`✅ ป้ายในระบบ ${back?.data?.banners?.items?.length} ใบ — เปลี่ยนรูปแล้ว ${IDS.length} ใบ`);
