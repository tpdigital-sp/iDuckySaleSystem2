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

/* ─────────────────────────────────────────────────────────────────────────────
 * วิธีส่ง + คูปองต้อนรับ — ย้ายมาจาก shop-settings.ts (11 ก.ย. 69)
 * เพราะ API ฝั่งเซิร์ฟเวอร์ (quotes/accept · coupons/welcome) เรียก shippingOf()/welcomeCouponOf()
 * แล้ว Next โยน "Attempted to call shippingOf() from the server but shippingOf is on the client"
 * → ตอบ 500 ตัวเปล่า หน้าใบเสนอราคาค้าง "กำลังสร้างออเดอร์…" ไม่จบ (พังตั้งแต่ 10 ก.ย. 69)
 * shop-settings.ts ยัง re-export ชื่อเดิมให้ฝั่งหน้าเว็บใช้ต่อได้
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ShippingMethod {
  id: string;
  name: string;   // เช่น "ส่งธรรมดา (3-5 วัน)"
  price: number;  // ค่าส่ง (บาท)
  /** สั่งตั้งแต่กี่ชิ้นขึ้นไป ให้ระบบเด้งมาใช้วิธีนี้เอง (ไม่ตั้ง = ไม่เด้ง) */
  minQty?: number;
  /** ยอดสั่งซื้อถึงเท่าไหร่ ให้ระบบเด้งมาใช้วิธีนี้เอง (ไม่ตั้ง = ไม่เด้ง) */
  minSubtotal?: number;
}

/** ค่าเริ่มต้นถ้าแอดมินยังไม่ได้ตั้งค่าจัดส่ง */
export const DEFAULT_SHIPPING: ShippingMethod[] = [
  { id: "standard", name: "ส่งธรรมดา (3-5 วัน)", price: 50 },
  { id: "express", name: "ส่งด่วน (1-2 วัน)", price: 90 },
];

/** รูปแบบจัดส่งที่ใช้จริง (ตกไปใช้ค่าเริ่มต้นถ้ายังไม่ตั้ง/ตั้งไว้ว่าง) */
export function shippingOf(s: { shipping?: ShippingMethod[] } | null | undefined): ShippingMethod[] {
  const list = (s?.shipping ?? []).filter((m) => m.name?.trim());
  return list.length ? list : DEFAULT_SHIPPING;
}

/** ตั้งค่าคูปองต้อนรับ — คิด/ออกฝั่งเซิร์ฟเวอร์ตอนสมาชิกใหม่ล็อกอินครั้งแรก */
export interface WelcomeCouponConfig {
  enabled: boolean;
  type: "percent" | "fixed";
  value: number;
  minSpend?: number;
  maxDiscount?: number; // เพดาน (เฉพาะ percent)
  expiryDays?: number; // อายุคูปองนับจากวันออก — 0/ไม่ตั้ง = ไม่หมดอายุ
}

export const DEFAULT_WELCOME_COUPON: WelcomeCouponConfig = {
  enabled: false, // ปิดไว้ก่อน — แอดมินเปิดเองที่ /admin/settings
  type: "percent",
  value: 10,
  minSpend: 0,
  maxDiscount: 200,
  expiryDays: 30,
};

/** ตั้งค่าคูปองต้อนรับที่ใช้จริง (ตกไปใช้ค่าเริ่มต้นถ้ายังไม่ตั้ง) */
export function welcomeCouponOf(s: { welcomeCoupon?: Partial<WelcomeCouponConfig> } | null | undefined): WelcomeCouponConfig {
  return { ...DEFAULT_WELCOME_COUPON, ...(s?.welcomeCoupon ?? {}) };
}
