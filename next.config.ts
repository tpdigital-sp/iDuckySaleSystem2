import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * โฟลเดอร์ผลคอมไพล์ — ปกติ .next
   * ตั้ง NEXT_DIST_DIR ได้เมื่อต้องรัน dev หลายตัวพร้อมกัน (คนละพอร์ต) จะได้ไม่เขียนทับกันจนพัง
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    /**
     * รูปสินค้ามาจาก 2 ที่: Supabase Storage (อัปเองหลังบ้าน) และ static.wixstatic.com (นำเข้าจากเว็บเดิม)
     * เปิดให้ตัวย่อรูปของ Next ดึงไปย่อ + แปลงเป็น webp ให้ — ต้นฉบับเฉลี่ย 86 KB/รูป ย่อแล้วเหลือหลักสิบ KB
     */
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "static.wixstatic.com" },
    ],
    // ขนาดที่หน้าจริงใช้ (การ์ด ~256-384px · รูปหลัก ~640-1200px) — ไม่ต้องสร้างครบทุกขนาดให้เปลืองแคช
    imageSizes: [96, 160, 256, 384],
    deviceSizes: [640, 828, 1080, 1200],
    minimumCacheTTL: 2592000,
  },
};

export default nextConfig;
