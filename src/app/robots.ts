import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/shop-info";
import { getSeoServer } from "@/lib/server/settings-server";

/**
 * robots.txt — บอกบอทว่าเก็บหน้าไหนได้/ไม่ได้ (เปิดได้ที่ /robots.txt)
 * ปิดหน้าหลังบ้าน/ระบบ/ของส่วนตัวลูกค้าเสมอ · ติ๊ก "ปิดไม่ให้ Google เก็บ" = ห้ามทั้งเว็บ
 */
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getSeoServer();
  if (seo.noindex) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // หน้าที่ไม่ควรอยู่ในผลค้นหา: หลังบ้าน · API · ของส่วนตัวลูกค้า · ตะกร้า/ชำระเงิน
        disallow: ["/admin", "/api", "/account", "/order", "/cart", "/checkout", "/coupon"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
