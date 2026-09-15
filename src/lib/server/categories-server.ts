import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { categoriesOf, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";

/**
 * หมวดหมู่จริงของร้าน (แถว __categories__) ฝั่งเซิร์ฟเวอร์
 *
 * ทำไมต้องมี: หน้าสินค้าเรนเดอร์ชื่อหมวดจาก CATEGORIES ในโค้ด (getCategory) ซึ่งเป็นชุดออกแบบเก่า
 * แอดมินจัดหมวดใหม่ในหลังบ้านแล้วชื่อไม่ตาม → breadcrumb/ป้ายหมวดบนหน้าสินค้าเขียนคนละชื่อกับ
 * เมนู/หน้ารายการสินค้าที่อ่านจากฐาน (เช่น fabric = "ผ้า / หมอน / ผ้าห่ม" แต่ของจริงคือ
 * "Home & Living — เครื่องนอน / ของตกแต่งงานผ้า" — เจ้าของร้านทัก 15 ก.ย. 69)
 *
 * ใช้ anon key เหมือน settings-server: แถวตั้งค่าเป็นข้อมูลที่ลูกค้าเห็นได้อยู่แล้ว
 * cache() = ยิงครั้งเดียวต่อการเรนเดอร์หนึ่งหน้า · ฐานล่ม/ยังไม่ตั้งค่า = ถอยไปชุดค่าเริ่มต้นในโค้ด
 */
const ROW_ID = "__categories__";

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export const getCategoriesServer = cache(async (): Promise<ShopCategory[]> => {
  const sb = serverClient();
  if (!sb) return DEFAULT_CATEGORIES;
  try {
    const { data, error } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
    if (error || !data) return DEFAULT_CATEGORIES;
    return categoriesOf((data.data as { categories?: ShopCategory[] } | null)?.categories);
  } catch {
    return DEFAULT_CATEGORIES;
  }
});

/** หมวดของสินค้าหนึ่งตัว — ไม่เจอในฐาน (หมวดถูกลบ) = undefined ให้ผู้เรียกถอยไป getCategory เอง */
export async function getCategoryServer(id: string): Promise<ShopCategory | undefined> {
  return (await getCategoriesServer()).find((c) => c.id === id);
}
