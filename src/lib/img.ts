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

/**
 * ── รหัสรุ่นรูป (?v=…) กันเห็น "รูปเก่า" หลังอัปทับ ──
 * รูปสินค้าหลายตัวถูกอัปทับที่พาธเดิม (สคริปต์ตั้งรูปใช้ upsert: true) → URL ไม่เปลี่ยน
 * แต่ตัวย่อรูปของ Next แคชผลตาม URL ไว้ 30 วัน (images.minimumCacheTTL ใน next.config.ts)
 * = เปลี่ยนรูปแล้วรีเฟรชยังเห็นของเก่าไปอีกเป็นเดือน ทั้งหลังบ้านและหน้าร้าน
 * แก้ด้วยการต่อ ?v=<เวลาบันทึกล่าสุดของสินค้า> ท้าย URL — บันทึก/รันสคริปต์ทีไร URL เปลี่ยน
 * ได้รูปใหม่ทันที · ระหว่างที่ยังไม่แก้ก็ยังแคชยาวเหมือนเดิม (ไม่เสียความเร็ว)
 */

/** เฉพาะรูปในคลัง Supabase เท่านั้น (รูปจาก wixstatic เปลี่ยนชื่อไฟล์ทุกครั้งอยู่แล้ว) */
const STORAGE_URL = /\/storage\/v1\/object\/public\//;

/** ย่อเวลาบันทึก (savedAt) เป็นรหัสสั้น ๆ · ไม่มี/อ่านไม่ออก = ไม่ต้องต่อรหัส */
export function imgVersion(savedAt?: string): string | undefined {
  if (!savedAt) return undefined;
  const t = Date.parse(savedAt);
  return Number.isNaN(t) ? undefined : t.toString(36);
}

/** ต่อรหัสรุ่นท้าย URL รูป (ของเดิมมีอยู่แล้วให้ทับ ไม่ต่อซ้อน) */
export function versionedSrc(src?: string, ver?: string): string | undefined {
  if (!src || !ver || !STORAGE_URL.test(src)) return src;
  const [path, qs = ""] = src.split("#")[0].split("?");
  const params = new URLSearchParams(qs);
  params.set("v", ver);
  return `${path}?${params.toString()}`;
}

/** สินค้าพร้อมรูปที่ติดรหัสรุ่นแล้ว (ภาพปก + แกลเลอรี) — ใช้กับ "ข้อมูลที่เอาไปแสดง" เท่านั้น ไม่ใช่ก้อนที่จะบันทึกกลับ */
export function withImageVersion<T extends { savedAt?: string; imageSrc?: string; images?: { src?: string }[] }>(
  p: T
): T {
  const ver = imgVersion(p.savedAt);
  if (!ver) return p;
  return {
    ...p,
    imageSrc: versionedSrc(p.imageSrc, ver),
    images: p.images?.map((im) => (im.src ? { ...im, src: versionedSrc(im.src, ver) } : im)),
  };
}
