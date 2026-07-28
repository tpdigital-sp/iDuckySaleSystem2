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

/** Rating พร้อม id (uuid สุ่ม ไม่โยงถึงลูกค้า) — ใช้นับรายการที่แอดมินยังไม่ได้เปิดดู */
export type RatingRow = Rating & { id: string };

const SEEN_KEY = "ducky-ratings-seen-v1";

/** id ประเมินที่แอดมินเครื่องนี้เปิดดูแล้ว (localStorage ต่อเครื่อง) */
export function seenRatingIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** บันทึกว่าเปิดดูรายการเหล่านี้แล้ว (เก็บล่าสุดไม่เกิน 2000 id) */
export function markRatingsSeen(ids: string[]): void {
  if (typeof window === "undefined") return;
  const merged = [...new Set([...seenRatingIds(), ...ids])].slice(-2000);
  localStorage.setItem(SEEN_KEY, JSON.stringify(merged));
}

/** จำนวนประเมินที่ยังไม่ได้เปิดดู */
export function unseenRatingCount(rows: { id: string }[]): number {
  const seen = seenRatingIds();
  return rows.filter((r) => !seen.has(r.id)).length;
}
