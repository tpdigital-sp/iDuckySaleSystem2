import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTS, type Product } from "@/lib/products";

/**
 * สินค้าที่ "ลูกค้าเห็นได้" ทั้งร้าน (ฝั่งเซิร์ฟเวอร์) — ใช้ร่วมกันระหว่าง
 * sitemap.xml · ฟีด Google Merchant Center · (ต่อไป) หน้าอื่นที่ต้องไล่สินค้าทุกตัวให้บอท
 *
 * ตัดแถวตั้งค่า (id ขึ้นต้น __) และสินค้าที่ปิดการมองเห็น (hidden) ออกเสมอ
 * ฐานล่ม/ยังไม่ตั้งค่า = ถอยไปชุดตัวอย่างในโค้ด จะได้ไม่ส่งไฟล์เปล่าให้ Google
 */
function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export const listPublicProductsServer = cache(async (): Promise<Product[]> => {
  const sb = serverClient();
  if (!sb) return PRODUCTS;
  const { data, error } = await sb.from("products").select("id,data").order("sort", { ascending: true });
  if (error || !data) return PRODUCTS;
  return (data as Array<{ id: string; data: Product }>)
    .filter((r) => !String(r.id).startsWith("__"))
    .map((r) => r.data)
    .filter((p) => p?.id && p?.name && !p.hidden);
});
