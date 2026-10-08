import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * โฟลเดอร์ผลคอมไพล์ — ปกติ .next
   * ตั้ง NEXT_DIST_DIR ได้เมื่อต้องรัน dev หลายตัวพร้อมกัน (คนละพอร์ต) จะได้ไม่เขียนทับกันจนพัง
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /**
   * 🔒 Security headers ทุกหน้า (ตรวจความปลอดภัย 8 ต.ค. 69 — เดิมไม่มีเลย)
   *  - X-Frame-Options SAMEORIGIN: กันเว็บอื่นฝังหน้าแอดมิน/หน้าชำระเงินของเราใน iframe (clickjacking)
   *    หน้าเราเองฝังกันเอง (พรีวิววิดีโอใน /admin/nav ฝัง YouTube = ขาออก ไม่กระทบ)
   *  - X-Content-Type-Options nosniff: เบราว์เซอร์ห้ามเดาชนิดไฟล์ (รูปที่อัปโหลดจะไม่ถูกตีความเป็นสคริปต์)
   *  - Referrer-Policy: ลิงก์ออเดอร์ /order/[id]?key=… กดลิงก์ออกนอกเว็บแล้ว key ไม่ติดไปใน Referer
   *  - Permissions-Policy: ปิด API เบราว์เซอร์ที่เว็บไม่ใช้ (กล้อง/ไมค์/ตำแหน่ง) ไม่ให้สคริปต์ฝังเรียก
   *  - HSTS: เปิดแล้วเบราว์เซอร์จะไม่ยอมคุย http กับโดเมนนี้อีก (Netlify บังคับ https อยู่แล้ว)
   *  ยังไม่ใส่ Content-Security-Policy — ต้องไล่ทุก script/iframe ภายนอก (GTM/GA/LINE/YouTube) ก่อน ไม่งั้นหน้าเว็บพังเงียบ
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  /**
   * pdf.js ฝั่งเซิร์ฟเวอร์ (อ่านเอกสารจากลิงก์ FlowAccount — src/lib/server/flowaccount.ts)
   * ต้องโหลดจาก node_modules ตรง ๆ ไม่ให้ Turbopack/webpack มัดรวม ไม่งั้น fake worker ของมันหาไฟล์ไม่เจอ
   */
  serverExternalPackages: ["pdfjs-dist"],
  /**
   * ไฟล์ฟอนต์ไทยของใบเสร็จ PDF (/api/orders/receipt อ่านจาก public/fonts ตอนรัน)
   * — ต้องสั่งให้แพ็คไปกับฟังก์ชันด้วย ไม่งั้นบนเว็บจริงหาไฟล์ไม่เจอแล้วออกใบเสร็จพัง
   */
  outputFileTracingIncludes: {
    "/api/orders/receipt": ["./public/fonts/Mitr-*.ttf"],
  },
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
