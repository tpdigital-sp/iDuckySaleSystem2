/**
 * origin สำหรับสร้าง redirect_uri ของ LINE Login — ต้อง "คงที่" และตรงกับที่ลงทะเบียนใน LINE Developers
 *
 * ปัญหา: บน Netlify การเปิดผ่านลิงก์ deploy-preview (เช่น 6a63...--iduckysalesystem.netlify.app)
 *        ทำให้ host เปลี่ยนทุก deploy → redirect_uri ไม่ตรงที่ลงทะเบียน → LINE 400
 * แก้:   localhost ใช้ตามจริง · ที่เหลือ (production/preview) บังคับใช้โดเมนจริง (SITE_URL) เสมอ
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://iduckystore.netlify.app").replace(/\/+$/, "");

export function requestOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) return `http://${host}`;
  return SITE_URL; // โดเมนจริงที่ลงทะเบียน LINE ไว้ (กัน host ชั่วคราวของ deploy-preview)
}
