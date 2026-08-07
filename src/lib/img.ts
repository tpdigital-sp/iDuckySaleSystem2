import type React from "react";

/**
 * ตัวช่วยส่งรูปผ่าน "ตัวย่อรูปของ Next" (/_next/image)
 * — ย่อตามขนาดที่จอใช้จริง + แปลงเป็น webp ให้อัตโนมัติ (รูปสินค้าเฉลี่ย 86 KB → ~13 KB)
 * — ใช้ได้เฉพาะรูปจากโฮสต์ที่อนุญาตไว้ใน next.config.ts (Supabase Storage / static.wixstatic.com)
 * — ไฟล์ในโปรเจกต์ (/landing/*.webp) เล็กอยู่แล้ว ไม่ต้องย่อซ้ำ
 */

/** ความกว้างที่เตรียมไว้ให้เบราว์เซอร์เลือก — ต้องตรงกับ imageSizes/deviceSizes ใน next.config.ts */
export const IMG_WIDTHS = [96, 160, 256, 384, 640, 828, 1080, 1200];

/** รูปนี้ส่งผ่านตัวย่อได้ไหม */
export function canOptimize(src?: string): src is string {
  return typeof src === "string" && /^https?:\/\//.test(src);
}

/** ลิงก์รูปที่ย่อแล้วตามความกว้างที่ขอ */
export function optimizedSrc(src: string, width: number, quality = 70): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

/** ชุดขนาดให้เบราว์เซอร์เลือกเอง (srcset) */
export function optimizedSrcSet(src: string, quality = 70): string {
  return IMG_WIDTHS.map((w) => `${optimizedSrc(src, w, quality)} ${w}w`).join(", ");
}

/**
 * props พร้อมใช้กับ <img> — รูปนอกได้ srcset/sizes, รูปในโปรเจกต์ผ่านไปตามเดิม
 * เช่น <img {...imgProps(p.imageSrc, "(max-width: 768px) 50vw, 320px")} alt={p.name} />
 */
export function imgProps(
  src: string | undefined,
  sizes = "(max-width: 768px) 50vw, 320px",
  fallbackWidth = 384
): { src?: string; srcSet?: string; sizes?: string } {
  if (!canOptimize(src)) return { src };
  return { src: optimizedSrc(src, fallbackWidth), srcSet: optimizedSrcSet(src), sizes };
}

/**
 * ถ้ารูปที่ผ่านตัวย่อโหลดไม่ขึ้น ให้สลับกลับไปใช้ต้นฉบับทันที
 * (กันกรณีแพลตฟอร์มปลายทางไม่รองรับ /_next/image — รูปต้องไม่หายจากหน้าเว็บ)
 */
export function fallbackToOriginal(original?: string) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (!original || el.dataset.fellBack === "1") return;
    el.dataset.fellBack = "1";
    el.removeAttribute("srcset");
    el.removeAttribute("sizes");
    el.src = original;
  };
}
