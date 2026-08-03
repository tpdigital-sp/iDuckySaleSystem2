/**
 * นโยบายล้างรูปออเดอร์เก่า — แยกไฟล์จาก shop-settings.ts เพราะไฟล์นั้นเป็น "use client"
 * (route ฝั่งเซิร์ฟเวอร์ import เข้าไปไม่ได้) ที่นี่เป็น type/ค่าคงที่ล้วน ใช้ได้ทั้งสองฝั่ง
 */
export interface ImageCleanupConfig {
  enabled: boolean;
  /** อายุออเดอร์ (วัน) ที่ถือว่าเก่าพอจะล้างรูป */
  days: number;
  /** ล้างเฉพาะออเดอร์ที่ปิดงานแล้ว (เสร็จสิ้น/ยกเลิก) — ปิดสวิตช์นี้ = ล้างทุกออเดอร์ที่ครบอายุ */
  onlyClosed: boolean;
  /** เลือกว่าจะล้างไฟล์ชนิดไหนบ้าง */
  targets: { proofs: boolean; artwork: boolean; packPhotos: boolean; slips: boolean };
  /** ผลการรันล่าสุด (ระบบเขียนเอง) */
  lastRunAt?: string;
  lastDeleted?: number;
}

export const DEFAULT_IMAGE_CLEANUP: ImageCleanupConfig = {
  enabled: false,
  days: 30,
  onlyClosed: true,
  targets: { proofs: true, artwork: true, packPhotos: false, slips: false },
};

/** ค่าที่ใช้จริง (ยังไม่ตั้ง = ค่าเริ่มต้น) */
export function imageCleanupOf(s: { imageCleanup?: ImageCleanupConfig } | null | undefined): ImageCleanupConfig {
  const c = s?.imageCleanup;
  if (!c) return DEFAULT_IMAGE_CLEANUP;
  return {
    enabled: Boolean(c.enabled),
    days: Number.isFinite(c.days) && c.days > 0 ? Math.floor(c.days) : DEFAULT_IMAGE_CLEANUP.days,
    onlyClosed: c.onlyClosed ?? true,
    targets: { ...DEFAULT_IMAGE_CLEANUP.targets, ...(c.targets ?? {}) },
    lastRunAt: c.lastRunAt,
    lastDeleted: c.lastDeleted,
  };
}
