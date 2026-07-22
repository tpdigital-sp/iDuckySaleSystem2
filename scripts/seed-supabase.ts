/**
 * นำเข้าสินค้าทั้งหมดจาก src/lib/products.ts เข้าตาราง products ใน Supabase
 *
 * วิธีรัน (หลังตั้งค่า .env.local ครบ + รัน schema.sql แล้ว):
 *   npm run seed
 *
 * ใช้ service_role key (ข้าม RLS) — รันฝั่งเซิร์ฟเวอร์/เครื่องคุณเท่านั้น
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTS } from "../src/lib/products";

// โหลด .env.local เอง (Node ไม่โหลดให้อัตโนมัติ)
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  try {
    const raw = readFileSync(join(root, name), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // ไม่มีไฟล์ก็ข้าม
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("❌ ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local ก่อน");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const rows = PRODUCTS.map((p, i) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price: p.price,
  sold: p.sold,
  featured: p.featured ?? false,
  badge: p.badge ?? null,
  sort: i,
  data: p,
}));

const { error } = await supabase.from("products").upsert(rows, { onConflict: "id" });
if (error) {
  console.error("❌ นำเข้าไม่สำเร็จ:", error.message);
  process.exit(1);
}
console.log(`✅ นำเข้าสินค้า ${rows.length} รายการเข้า Supabase สำเร็จ`);
