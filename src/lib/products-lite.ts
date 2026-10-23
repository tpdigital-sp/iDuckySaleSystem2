import type { Product } from "./products";
import { withImageVersion } from "./img";

/**
 * สินค้าแบบเบา (เฉพาะฟิลด์ที่การ์ดใช้) — ใช้ร่วมกันทั้งเบราว์เซอร์ (product-repo) และเซิร์ฟเวอร์ (public-products)
 * แยกไฟล์ออกมาเพราะ product-repo เป็น "use client" เซิร์ฟเวอร์เรียกฟังก์ชันในนั้นไม่ได้
 */
export const LITE_SELECT =
  "id,name,category,price,sold,featured,badge,sort,slug:data->>slug,hidden:data->hidden,savedAt:data->>savedAt," +
  "emoji:data->>emoji,gradient:data->>gradient,imageSrc:data->>imageSrc," +
  "rating:data->rating,oldPrice:data->oldPrice,priceMin:data->priceMin,priceMax:data->priceMax," +
  "quoteOption:data->quoteOption,altSrc:data->images->1->>src";

/** แถวจาก LITE_SELECT → Product (ตัดแถวตั้งค่าร้าน __xxx__ ออก) */
export function liteRowsToProducts(rows: Record<string, unknown>[]): Product[] {
  return rows
    .filter((r) => !String(r.id).startsWith("__")) // ตัดแถวตั้งค่าร้านออก
    .map(
      (r) =>
        ({
          id: r.id,
          slug: (r.slug as string | null) ?? undefined,
          name: r.name,
          category: r.category,
          price: r.price ?? 0,
          sold: r.sold ?? 0,
          featured: r.featured ?? false,
          badge: (r.badge as string | null) ?? undefined,
          hidden: (r.hidden as boolean | null) ?? undefined,
          // เวลาบันทึกล่าสุด — หน้าแรกใช้เรียง "สินค้ามาใหม่" (ตัวที่เพิ่งเพิ่ม/แก้ขึ้นก่อน)
          savedAt: (r.savedAt as string | null) ?? undefined,
          emoji: (r.emoji as string | null) ?? "🦆",
          gradient: (r.gradient as string | null) ?? "from-amber-100 to-amber-200",
          // ติดรหัสรุ่นท้าย URL รูป (?v=savedAt) — เปลี่ยนรูปทับพาธเดิมแล้วการ์ดขึ้นของใหม่ทันที
          imageSrc: withImageVersion({
            savedAt: (r.savedAt as string | null) ?? undefined,
            imageSrc: (r.imageSrc as string | null) ?? undefined,
          }).imageSrc,
          // รูปพรีวิวที่สองของการ์ด (แกลเลอรีช่องที่ 2) — ซ้ำกับรูปปกก็ไม่เอา จะได้ไม่ครอสเฟดไปรูปเดิม
          altSrc:
            r.altSrc && r.altSrc !== r.imageSrc
              ? withImageVersion({ savedAt: (r.savedAt as string | null) ?? undefined, imageSrc: r.altSrc as string }).imageSrc
              : undefined,
          rating: r.rating ?? 5,
          oldPrice: (r.oldPrice as number | null) ?? undefined,
          priceMin: (r.priceMin as number | null) ?? undefined,
          priceMax: (r.priceMax as number | null) ?? undefined,
          quoteOption: (r.quoteOption as boolean | null) ?? undefined,
          // ฟิลด์หนักที่การ์ดไม่ใช้ — เว้นว่างไว้ (priceRange ใช้ pricing/price ได้อยู่แล้ว)
          options: [],
          rules: [],
          images: [],
          body: [],
          description: "",
        }) as unknown as Product
    );
}
