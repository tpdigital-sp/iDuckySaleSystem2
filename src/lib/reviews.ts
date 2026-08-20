/**
 * รีวิว/ให้คะแนนสินค้า — ชนิดข้อมูลและค่าคงที่ใช้ร่วมทุกฝั่ง
 *
 * ⚠️ คนละระบบกับ ratings (แบบสำรวจความพึงพอใจนิรนาม — ห้ามผูกตัวตน ห้ามแตะ)
 * รีวิวนี้ระบุตัวตน + ตรวจจากออเดอร์จริง (verified purchase) + แอดมินตรวจก่อนขึ้นหน้าสินค้า
 * กติกา: 1 รีวิว / สินค้า / ออเดอร์ · เฉพาะออเดอร์ "เสร็จสิ้น"
 */

export type ReviewStatus = "รอตรวจ" | "แสดง" | "ซ่อน";

export const REVIEW_STATUSES: ReviewStatus[] = ["รอตรวจ", "แสดง", "ซ่อน"];

export interface Review {
  id: string;
  productId: string;
  /** สแนปช็อตชื่อสินค้า ณ ตอนรีวิว (กันสินค้าเปลี่ยนชื่อ/ถูกลบ) */
  productName?: string;
  orderId: string;
  customerId: string;
  /** ชื่อที่โชว์บนหน้าสินค้า — ค่าเริ่มต้นเป็นชื่อย่อ ลูกค้าแก้ได้ตอนรีวิว */
  displayName: string;
  score: 1 | 2 | 3 | 4 | 5;
  text?: string;
  /** รูปงานจริงจากลูกค้า (public URL — ใช้ bucket ภาพลายเดิม) */
  photoUrls?: string[];
  status: ReviewStatus;
  /** ร้านตอบกลับ (โชว์ใต้รีวิวบนหน้าสินค้า) */
  reply?: { text: string; at: string; name?: string };
  createdAt: string;
  updatedAt?: string;
}

/** รีวิวเวอร์ชันสาธารณะ (ตัดข้อมูลส่วนตัวก่อนส่งขึ้นหน้าสินค้า) */
export type PublicReview = Pick<Review, "id" | "productId" | "displayName" | "score" | "text" | "photoUrls" | "reply" | "createdAt">;

export interface ReviewStats {
  count: number;
  /** คะแนนเฉลี่ย ปัด 1 ตำแหน่ง */
  avg: number;
}

/** สีป้ายสถานะฝั่งหลังบ้าน (Tailwind) */
export const REVIEW_STATUS_STYLES: Record<ReviewStatus, string> = {
  รอตรวจ: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  แสดง: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  ซ่อน: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
};

/**
 * ชื่อย่อสำหรับโชว์สาธารณะ — "ดวงใจ ศรีสุข" → "คุณดวงใจ ศ."
 * ชื่อเดี่ยว/ชื่ออังกฤษก็ใช้ได้ ("Beam" → "คุณBeam")
 */
export function abbrevName(name: string): string {
  const clean = name.trim().replace(/^คุณ\s*/, "");
  if (!clean) return "ลูกค้า iDucky";
  const [first, ...rest] = clean.split(/\s+/);
  const lastInitial = rest.length ? ` ${rest[rest.length - 1].slice(0, 1)}.` : "";
  return `คุณ${first}${lastInitial}`;
}

/** ดาว ★★★★☆ สำหรับโชว์แบบข้อความ (a11y ใช้ aria-label ประกบ) */
export function starsOf(score: number): string {
  return "★★★★★".slice(0, score) + "☆☆☆☆☆".slice(0, 5 - score);
}
