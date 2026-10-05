/**
 * 🛍 ป้ายสินค้าแนะนำ 3 ใบ (สติ๊กเกอร์ Solvent · เสื้อ UNISEX · เสื้อ SPORT) — เจ้าของร้านสั่ง 5 ต.ค. 69
 *   ภาพจอคอมเจ้าของร้านทำเอง (2000×700) → ขยายเป็น 2320×810 · มือถือ = ครอปฝั่งซ้าย (ข้อความ+ปุ่ม) 1050×700 → 1536×1024
 *   ต้นฉบับอยู่ ~/Desktop/ป้ายประชาสัมพันธ์-iDucky-สินค้าแนะนำ/ภาพจากเจ้าของร้าน/
 *   ⚠️ ไม่ย้อมสีภาพเจ้าของร้าน (ดู memory iducky-promo-banners)
 *
 *   node --env-file=.env.local scripts/promo-banners-picks.mjs [--dry]
 *
 * ใส่/อัปเดต 3 ใบนี้ แล้วเรียงไว้ "หน้าสุด" ตามลำดับ (เจ้าของร้านสั่ง: สติ๊กเกอร์เป็นใบแรก ตามด้วยเสื้อ 2 ใบ)
 * ป้ายใบอื่นในระบบไม่แตะ แค่เลื่อนไปต่อท้าย · รันซ้ำได้
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ART = path.join(HERE, "assets", "promo-banners");
const ROW_ID = "__promo_banners__";
const BUCKET = "product-images";
const VER = "v1";
const DRY = process.argv.includes("--dry");

const PICKS = [
  { id: "pick-sticker-solvent", title: "สติ๊กเกอร์ Solvent Premium เริ่ม ฿130", href: "/products/sticker-solvent", motion: "float" },
  { id: "pick-unisex", title: "เสื้อยืด UNISEX พิมพ์ลายเต็มตัว เริ่ม ฿180", href: "/products/unisex", motion: "sway" },
  { id: "pick-sport", title: "เสื้อกีฬา SPORT พิมพ์ลายเต็มตัว เริ่ม ฿180", href: "/products/sport", motion: "hop" },
];

const FX = JSON.parse(await readFile(path.join(ART, `layers-picks-${VER}.json`), "utf8"));
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
const others = (cur.items ?? []).filter((x) => !PICKS.some((p) => p.id === x.id));

const front = [];
for (const p of PICKS) {
  const old = (cur.items ?? []).find((x) => x.id === p.id) ?? {};
  const image = await upload(`${p.id}-d-${VER}.webp`);
  const imageMobile = await upload(`${p.id}-m-${VER}.webp`);
  front.push({ ...old, ...p, image, imageMobile, layers: FX[p.id].d, layersMobile: FX[p.id].m, shine: true });
  console.log(`• ${p.id} — ${image}`);
}
const items = [...front, ...others];
console.log("ลำดับใหม่:", items.map((x) => x.id).join(" → "));
if (DRY) process.exit(0);

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
console.log(`✅ ป้ายในระบบ ${back?.data?.banners?.items?.length} ใบ`);
