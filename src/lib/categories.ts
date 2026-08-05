/**
 * หมวดหมู่สินค้าที่แอดมินแก้เองได้จากหลังบ้าน
 *
 * เก็บเป็นแถวพิเศษ id "__categories__" ในตาราง products (วิธีเดียวกับ __shop_payment__)
 * — ไม่ต้องสร้างตารางใหม่/รัน SQL และ fetchProducts กรอง id ที่ขึ้นต้น "__" ออกอยู่แล้ว
 *
 * ยังไม่เคยแก้ในหลังบ้าน = ใช้ CATEGORIES ในโค้ดเป็นค่าเริ่มต้น (หน้าเว็บจึงไม่มีวันว่าง)
 */
import { CATEGORIES, type Category } from "./products";

export interface ShopCategory {
  id: string;
  name: string;
  nameEn: string;
  emoji: string;
  gradient: string;
  description: string;
  /** รูปหมวด (URL) — มีแล้วการ์ดหมวดบนหน้าแรกโชว์รูปนี้แทนอีโมจิ */
  image?: string;
  /** ซ่อนจากหน้าร้าน (ยังอยู่ในระบบ สินค้าเดิมไม่หาย) */
  hidden?: boolean;
}

export const DEFAULT_CATEGORIES: ShopCategory[] = CATEGORIES.map((c: Category) => ({
  id: c.id,
  name: c.name,
  nameEn: c.nameEn,
  emoji: c.emoji,
  gradient: c.gradient,
  description: c.description,
}));

/** ค่าที่ใช้จริง — ไม่มีในฐาน/ว่าง = ค่าเริ่มต้นจากโค้ด */
export function categoriesOf(rows: ShopCategory[] | null | undefined): ShopCategory[] {
  if (!rows || rows.length === 0) return DEFAULT_CATEGORIES;
  return rows
    .filter((c) => c?.id && c?.name)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name),
      nameEn: String(c.nameEn ?? ""),
      emoji: String(c.emoji ?? "🏷️"),
      gradient: String(c.gradient ?? "from-amber-100 to-amber-200"),
      description: String(c.description ?? ""),
      image: typeof c.image === "string" && c.image.trim() ? c.image.trim() : undefined,
      hidden: Boolean(c.hidden),
    }));
}

/** อ่านหมวดหมู่ (ฝั่งเบราว์เซอร์) — ใช้ในหน้าร้านและหลังบ้าน */
export async function fetchCategories(): Promise<ShopCategory[]> {
  try {
    const res = await fetch("/api/categories", { cache: "no-store" });
    if (!res.ok) return DEFAULT_CATEGORIES;
    const j = (await res.json()) as { list?: ShopCategory[] };
    return categoriesOf(j.list);
  } catch {
    return DEFAULT_CATEGORIES;
  }
}
