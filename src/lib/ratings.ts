/**
 * ระบบประเมินความพึงพอใจแบบนิรนาม
 * — คะแนน 1-5 (อีโมจิ) + แท็กหมวดที่ประทับใจ/ควรปรับ + คอมเมนต์
 * — ไม่เก็บ orderId/ชื่อ/เวลาแบบละเอียด (เก็บแค่เดือน) ดู supabase/ratings.sql
 */

export interface Rating {
  /** 1 (แย่) → 5 (ประทับใจมาก) */
  score: number;
  /** แท็กหมวด เช่น "คุณภาพงานพิมพ์" */
  tags: string[];
  comment?: string;
  /** เดือนที่ประเมิน yyyy-mm (เวลาแบบหยาบ กันเดาตัวตนจากเวลา) */
  month: string;
}

/** ระดับคะแนน → อีโมจิ + ป้าย */
export const SCORE_FACES: { score: number; emoji: string; label: string }[] = [
  { score: 1, emoji: "😞", label: "แย่" },
  { score: 2, emoji: "😕", label: "พอใช้" },
  { score: 3, emoji: "😐", label: "เฉย ๆ" },
  { score: 4, emoji: "😊", label: "ดี" },
  { score: 5, emoji: "😍", label: "ประทับใจมาก" },
];

/** แท็กให้ลูกค้าเลือก (แตะได้หลายอัน) */
export const RATING_TAGS = ["คุณภาพงานพิมพ์", "ความเร็ว", "การบริการ/แชท", "การแพ็คของ", "ความคุ้มราคา"];

/** เดือนปัจจุบันแบบ yyyy-mm */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
