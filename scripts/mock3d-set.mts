/**
 * ☕🧊 ตั้ง/ถอดพรีวิว 3D ในจอออกแบบของสินค้า (Product.calendarStudio.mock3d) — เจ้าของร้านสั่ง 16 ต.ค. 69 "ฉันต้องการให้มี 3D ด้วย" (แก้วมัค mug-11oz)
 *
 *   npx tsx scripts/mock3d-set.mts <productId> mug     # เปิดพรีวิวแก้วมัค 11 oz
 *   npx tsx scripts/mock3d-set.mts <productId> stand360|stand3   # ที่ตั้งโทรศัพท์ 360° / 3 step (21 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> cushion   # ปลอกหมอนอิง หน้า+หลังกางออก (22 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> folder    # แฟ้มจิ๋ว ปกใส + โซ่ไข่ปลา (22 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> xstand|rollup   # ป้ายขาตั้ง X-Stand / Roll UP (22 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> bag     # กระเป๋าโฮโลแกรม ถุงซิปล็อก (22 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> canvas  # กรอบรูปแคนวาส ผ้าใบขึงโครงไม้ ลายอ้อมขอบ (23 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> bandana  # ปลอกคอสัตว์เลี้ยง ผ้าพันคอสามเหลี่ยมพันรอบคอ (23 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> doorhanger  # ป้ายแขวนประตู แขวนบนมือจับ หนา/ใสตามวัสดุ (23 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> pouch  # กระเป๋าต๊อบแต๊บ ผ้าปากคลิปสปริง (23 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> scarf|scrunchy  # ผ้าผูกผมพับครึ่ง / ยางรัดผมผ้าจีบ (23 ต.ค. 69)
 *   npx tsx scripts/mock3d-set.mts <productId> none    # ถอดออก
 *
 * ตั้งได้ที่หน้าแก้ไขสินค้าหลังบ้าน (กล่อง 🧊 ปุ่ม "ดูแบบ 3D") เหมือนกัน — สคริปต์นี้ไว้ตั้งจากเครื่องตอนทดสอบ
 * อ่านสินค้าล่าสุดก่อนเขียน แตะเฉพาะ calendarStudio.mock3d + savedAt · สินค้าที่ยังไม่เปิดจอออกแบบบนเว็บ (ไม่มี calendarStudio) = หยุดบอกเหตุ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const [PRODUCT, MODE] = process.argv.slice(2);
const MODES = ["mug", "stand360", "stand3", "cushion", "folder", "xstand", "rollup", "bag", "canvas", "bandana", "doorhanger", "pouch", "scarf", "scrunchy", "none"] as const;
if (!PRODUCT || !MODES.includes((MODE ?? "") as (typeof MODES)[number])) {
  console.error("ใช้: npx tsx scripts/mock3d-set.mts <productId> mug|stand360|stand3|cushion|folder|xstand|rollup|bag|canvas|bandana|doorhanger|pouch|scarf|scrunchy|none");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
) as Record<string, string>;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", PRODUCT).single();
if (error || !row) throw new Error(`โหลดสินค้า ${PRODUCT} ไม่ได้: ${error?.message}`);
const cur = row.data as Product;
if (!cur.calendarStudio) {
  console.error(`⛔ ${row.name} ยังไม่เปิดจอออกแบบบนเว็บ (ไม่มี calendarStudio) — ผูกเทมเพลตด้วย scripts/template-link-by-size.mts ก่อน`);
  process.exit(1);
}
const { mock3d: before, ...rest } = cur.calendarStudio;
// 📱 21 ต.ค. 69: stand360 / stand3 (ที่ตั้งโทรศัพท์ · lib/stand-mock)
const after = MODE === "none" ? undefined : (MODE as NonNullable<NonNullable<Product["calendarStudio"]>["mock3d"]>);
if (before === after) {
  console.log(`= ${row.name}: mock3d ${before ?? "ไม่มี"} อยู่แล้ว ไม่เปลี่ยน`);
  process.exit(0);
}
const next: Product = { ...cur, calendarStudio: after ? { ...rest, mock3d: after } : rest, savedAt: new Date().toISOString() };
const { error: e2 } = await sb.from("products").update({ data: next }).eq("id", PRODUCT);
if (e2) throw new Error(`บันทึก: ${e2.message}`);
console.log(`✅ ${row.name}: mock3d ${before ?? "ไม่มี"} → ${after ?? "ไม่มี"}`);
await revalidateLive(env, { productIds: [PRODUCT] });
