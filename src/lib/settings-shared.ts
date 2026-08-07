/**
 * ส่วนของ "ตั้งค่าร้าน" ที่ฝั่งเซิร์ฟเวอร์ต้องใช้ด้วย (sitemap · robots · เมตาแท็ก)
 *
 * แยกออกมาจาก shop-settings.ts เพราะไฟล์นั้นเป็น "use client" —
 * ไฟล์ที่ import "server-only" จะดึงเข้าไปไม่ได้ (พังตอนรันเป็น 500)
 */

/** id ของแถวตั้งค่าร้านในตาราง products */
export const SETTINGS_ID = "__shop_payment__";

/**
 * ตั้งค่าเชื่อมต่อ Google & การค้นหา — แอดมินกรอกรหัสเองที่ /admin/settings?tab=google
 * ทุกช่องเว้นว่างได้ · ว่าง = ไม่ใส่แท็ก/ไม่โหลดสคริปต์นั้นเลย (เว็บไม่ช้าโดยไม่จำเป็น)
 */
export interface SeoConfig {
  /** โค้ดยืนยันของ Google Search Console (เฉพาะค่า content ของ meta google-site-verification) */
  googleVerification?: string;
  /** โค้ดยืนยันของ Bing Webmaster (meta msvalidate.01) */
  bingVerification?: string;
  /** รหัสวัดผล Google Analytics 4 เช่น G-XXXXXXX */
  ga4Id?: string;
  /** รหัส Google Tag Manager เช่น GTM-XXXXXXX */
  gtmId?: string;
  /** ปิดไม่ให้ Google เก็บทั้งเว็บ (ใช้ตอนเว็บยังไม่พร้อมเปิดจริง) */
  noindex?: boolean;
}

/** ตั้งค่า Google/SEO ที่ใช้จริง — ตัดช่องว่างและตัดค่าที่ไม่ถูกรูปแบบทิ้ง */
export function seoOf(s: { seo?: SeoConfig } | null | undefined): SeoConfig {
  const c = s?.seo ?? {};
  const t = (v?: string) => (typeof v === "string" ? v.trim() : "");
  // เผลอวางทั้งแท็ก <meta ...> มา → ดึงเฉพาะค่า content ให้เอง
  const contentOf = (v: string) => v.match(/content=["']([^"']+)["']/i)?.[1] ?? v;
  const ga = t(c.ga4Id).toUpperCase();
  const gtm = t(c.gtmId).toUpperCase();
  return {
    googleVerification: contentOf(t(c.googleVerification)) || undefined,
    bingVerification: contentOf(t(c.bingVerification)) || undefined,
    ga4Id: /^G-[A-Z0-9]+$/.test(ga) ? ga : undefined,
    gtmId: /^GTM-[A-Z0-9]+$/.test(gtm) ? gtm : undefined,
    noindex: !!c.noindex,
  };
}
