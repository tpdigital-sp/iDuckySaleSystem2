import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { seoOf, SETTINGS_ID, type SeoConfig } from "@/lib/settings-shared";

/** ตั้งค่าร้านเท่าที่ฝั่งเซิร์ฟเวอร์ต้องใช้ (ไม่ผูกกับชนิดฝั่ง client) */
type ShopSettingsRow = { seo?: SeoConfig };

/**
 * อ่านตั้งค่าร้านฝั่งเซิร์ฟเวอร์ (เมตาแท็ก · sitemap · robots)
 * ใช้ anon key — แถวตั้งค่าอ่านสาธารณะผ่าน RLS อยู่แล้ว (เก็บเฉพาะข้อมูลที่ลูกค้าเห็นได้)
 */
function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export const getShopSettingsServer = cache(async (): Promise<ShopSettingsRow | null> => {
  const sb = serverClient();
  if (!sb) return null;
  const { data } = await sb.from("products").select("data").eq("id", SETTINGS_ID).maybeSingle();
  return (data?.data as ShopSettingsRow | undefined) ?? null;
});

/** ค่าเชื่อม Google/SEO ที่ใช้จริง (ยังไม่ตั้ง = ว่างหมด) */
export const getSeoServer = cache(async (): Promise<SeoConfig> => seoOf(await getShopSettingsServer()));
