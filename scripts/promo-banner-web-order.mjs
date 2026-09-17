/**
 * 📣 ลงป้ายประชาสัมพันธ์ "สั่งเองผ่านเว็บ ได้ตลอด 24 ชม." เข้าระบบป้ายหน้าแรก (/admin/banners)
 * เจ้าของร้านสั่ง 17 ก.ย. 69 — อัปรูป 2 ไฟล์ (จอคอม 2320×640 + มือถือ 1200×800) ขึ้น Storage
 * แล้วเพิ่มเข้าแถว __promo_banners__ (มีป้ายอื่นอยู่แล้ว = ต่อท้าย ไม่ทับ · รันซ้ำ = อัปเดตใบเดิมตาม id)
 *
 * v2 (17 ก.ย. 69): เจ้าของร้านทักว่าใบ 2320×320 "แคบไป" → ทำใหม่สูง 500 · ชื่อไฟล์ใหม่ทุกครั้งที่เปลี่ยนเนื้อรูป (กันแคช CDN)
 *
 * รัน: node --env-file=.env.local scripts/promo-banner-web-order.mjs [โฟลเดอร์รูป]
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DIR = process.argv[2] ?? path.join(os.homedir(), "Desktop", "ป้ายประชาสัมพันธ์-iDucky");
const ROW_ID = "__promo_banners__";
const BANNER_ID = "web-order-24h";
const BUCKET = "product-images";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function upload(file, name) {
  const bytes = await readFile(path.join(DIR, file));
  const dest = `products/banners/${name}`;
  const { error } = await sb.storage.from(BUCKET).upload(dest, bytes, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`อัปโหลด ${file} ไม่สำเร็จ: ${error.message}`);
  return sb.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl;
}

// v4 (17 ก.ย. 69): ป้ายขยับ — รูปหลักเป็น "พื้นหลัง+ข้อความ" ส่วนเป็ด/ดาว/เมฆ/การ์ดขั้นตอน/ลูกศร เป็นชิ้นลูกเล่น (layers) ลอยทับ
// ตำแหน่งทุกชิ้นอยู่ใน .layers.json · src ที่ขึ้นต้น "@" = ไฟล์ในโฟลเดอร์ "ชิ้นส่วนป้ายขยับ" ที่ต้องอัปขึ้น Storage ก่อน
// ⚠️ ต้อง deploy โค้ดที่รู้จัก layers ก่อนรัน ไม่งั้นเว็บจริงจะโชว์ป้ายไม่มีเป็ด/ไม่มีการ์ด
const PARTS = "ชิ้นส่วนป้ายขยับ";
const FX = JSON.parse(await readFile(new URL("./promo-banner-web-order.layers.json", import.meta.url), "utf8"));
const uploaded = new Map();
async function resolve(list) {
  for (const l of list) {
    if (l.src?.startsWith("@")) {
      const name = l.src.slice(1);
      if (!uploaded.has(name)) uploaded.set(name, await upload(`${PARTS}/${name}`, name));
      l.src = uploaded.get(name);
    }
  }
}
await resolve(FX.layers);
await resolve(FX.layersMobile);
// v5 (17 ก.ย. 69 ค่ำ): เจ้าของร้านขอ "สูงกว่านี้หน่อย" อีกรอบ → จอคอม 2320×640 (แสดงจริง 1160×320) · การ์ด/ลูกศรจอคอมเป็นชุด -v2
const image = await upload(`${PARTS}/web-order-24h-desktop-v5-base.webp`, "web-order-24h-desktop-v5-base.webp");
const imageMobile = await upload(`${PARTS}/web-order-24h-mobile-v3-base.webp`, "web-order-24h-mobile-v3-base.webp");

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
if (readErr) throw new Error(`อ่านแถวป้ายไม่สำเร็จ: ${readErr.message}`);

const cur = row?.data?.banners ?? { on: true, seconds: 6, items: [] };
const banner = { id: BANNER_ID, title: "สั่งเองผ่านเว็บ ได้ตลอด 24 ชม.", image, imageMobile, href: "/products", shine: true, ...FX };
const items = (cur.items ?? []).some((b) => b.id === BANNER_ID)
  ? cur.items.map((b) => (b.id === BANNER_ID ? { ...b, ...banner } : b))
  : [...(cur.items ?? []), banner];
const banners = { ...cur, items };

const { error } = await sb
  .from("products")
  .upsert(
    { id: ROW_ID, name: "(ตั้งค่าร้าน — ป้ายประชาสัมพันธ์)", category: "__settings__", price: 0, data: { banners } },
    { onConflict: "id" }
  );
if (error) throw new Error(`บันทึกแถวป้ายไม่สำเร็จ: ${error.message}`);

console.log(`✅ ป้ายในระบบ ${items.length} ใบ`);
console.log(image);
console.log(imageMobile);
