/* eslint-disable @next/next/no-img-element */
/**
 * ภาพสินค้า — ถ้ามี `src` (รูปจริงที่อัปโหลด) จะแสดงรูปนั้น
 * ถ้าไม่มีจะ fallback เป็น placeholder (ไล่เฉดสี + อีโมจิ)
 */
export default function ProductVisual({
  emoji,
  gradient,
  src,
  alt = "",
  size = "text-6xl",
  className = "",
  eager = false,
}: {
  emoji: string;
  gradient: string;
  src?: string;
  alt?: string;
  size?: string;
  className?: string;
  /** true = โหลดทันที (รูปหลักหน้ารายละเอียด เพื่อ LCP) · false = lazy (การ์ดหน้ารายการ) */
  eager?: boolean;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
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
