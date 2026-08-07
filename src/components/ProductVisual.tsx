/* eslint-disable @next/next/no-img-element */
/**
 * ภาพสินค้า — ถ้ามี `src` (รูปจริงที่อัปโหลด) จะแสดงรูปนั้น
 * ถ้าไม่มีจะ fallback เป็น placeholder (ไล่เฉดสี + อีโมจิ)
 *
 * รูปจากภายนอก (Supabase Storage / static.wixstatic.com) จะถูกส่งผ่าน "ตัวย่อรูปของ Next"
 * → ย่อตามขนาดที่จอใช้จริง + แปลงเป็น webp ให้อัตโนมัติ (ต้นฉบับ ~117 KB เหลือ ~13 KB)
 * ตั้งโฮสต์ที่อนุญาตไว้ใน next.config.ts (images.remotePatterns)
 */

import { canOptimize, fallbackToOriginal, optimizedSrc, optimizedSrcSet } from "@/lib/img";

export default function ProductVisual({
  emoji,
  gradient,
  src,
  alt = "",
  size = "text-6xl",
  className = "",
  eager = false,
  sizes,
}: {
  emoji: string;
  gradient: string;
  src?: string;
  alt?: string;
  size?: string;
  className?: string;
  /** true = โหลดทันที (รูปหลักหน้ารายละเอียด เพื่อ LCP) · false = lazy (การ์ดหน้ารายการ) */
  eager?: boolean;
  /** ขนาดที่รูปนี้กินจริงบนจอ — บอกเบราว์เซอร์ให้เลือกไฟล์ที่พอดี (ไม่ระบุ = ขนาดการ์ดทั่วไป) */
  sizes?: string;
}) {
  if (src) {
    const useOpt = canOptimize(src);
    // รูปหลักหน้าสินค้ากินพื้นที่ใหญ่กว่าการ์ด → ให้เลือกไฟล์ใหญ่ขึ้นได้
    const auto = eager ? "(max-width: 768px) 100vw, 640px" : "(max-width: 768px) 50vw, 320px";
    return (
      <img
        src={useOpt ? optimizedSrc(src, eager ? 1080 : 384) : src}
        {...(useOpt ? { srcSet: optimizedSrcSet(src), sizes: sizes ?? auto } : {})}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={useOpt ? fallbackToOriginal(src) : undefined}
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${gradient} ${className}`}
      aria-hidden="true"
    >
      <span className={`${size} drop-shadow-sm select-none`}>{emoji}</span>
    </div>
  );
}
