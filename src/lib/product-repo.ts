"use client";

/**
 * ชั้นเข้าถึงข้อมูลสินค้า — เลือกอัตโนมัติระหว่าง Supabase (เมื่อตั้งค่าคีย์แล้ว)
 * กับโหมดเดโม (localStorage) ให้คอมโพเนนต์เรียกใช้ผ่านนี้ที่เดียว
 */
import { getSupabase } from "./supabase";
import { type Product } from "./products";
import { resolveOptions, type OptionPreset } from "./option-presets";
import { fetchPresets } from "./preset-repo";
import {
  markDeleted,
  mergedProduct,
  mergedProducts,
  saveOverride,
} from "./product-store";

/** คลี่ตัวเลือกที่ลิงก์คลังของสินค้าให้เป็นค่าจริง (ใช้ก่อนส่งให้หน้าร้าน/ตะกร้า/ราคา) */
function resolveProduct(p: Product, presets: OptionPreset[]): Product {
  if (!p.options?.some((o) => o.presetId)) return p; // ไม่มีกลุ่มลิงก์ → ไม่ต้องแตะ
  return { ...p, options: resolveOptions(p.options, presets) };
}

/** ดึงสินค้าทั้งหมด (Supabase → เรียงตาม sort; ไม่มีคีย์ → localStorage/สแตติก) */
export async function fetchProducts(): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return mergedProducts();
  const { data, error } = await sb.from("products").select("id,data").order("sort", { ascending: true });
  if (error || !data) return mergedProducts();
  // กรองแถวตั้งค่าร้าน (row id ขึ้นต้น "__" เช่น __shop_payment__) ออก ไม่ให้โผล่เป็นสินค้า
  const products = (data as Array<{ id: string; data: Product }>)
    .filter((r) => !String(r.id).startsWith("__"))
    .map((r) => r.data as Product);
  // คลี่ตัวเลือกที่ลิงก์คลัง เฉพาะเมื่อมีสินค้าที่ลิงก์จริง (เลี่ยง fetch คลังโดยไม่จำเป็น)
  if (!products.some((p) => p.options?.some((o) => o.presetId))) return products;
  const presets = await fetchPresets();
  return products.map((p) => resolveProduct(p, presets));
}

/**
 * ดึงเฉพาะฟิลด์ที่การ์ดหน้ารายการ/หน้าแรกต้องใช้ (เบา) — ไม่ดึงก้อน options/rules/body ที่หนัก
 * ใช้ JSON projection ของ Supabase เพื่อลดข้อมูลที่โหลดเมื่อสินค้าเยอะ · ดึงเต็มเฉพาะตอนเปิดหน้ารายละเอียด
 */
export async function fetchProductsLite(): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return mergedProducts();
  const { data, error } = await sb
    .from("products")
    .select(
      "id,name,category,price,sold,featured,badge,sort," +
        "emoji:data->>emoji,gradient:data->>gradient,imageSrc:data->>imageSrc," +
        "rating:data->rating,oldPrice:data->oldPrice,pricing:data->pricing,priceRates:data->priceRates"
    )
    .order("sort", { ascending: true });
  if (error || !data) return mergedProducts();
  // Supabase อนุมานชนิดของ projection (data->>...) ไม่ได้ → cast เป็น record ก่อน map
  return (data as unknown as Record<string, unknown>[])
    .filter((r) => !String(r.id).startsWith("__")) // ตัดแถวตั้งค่าร้านออก
    .map(
    (r) =>
      ({
        id: r.id,
        name: r.name,
        category: r.category,
        price: r.price ?? 0,
        sold: r.sold ?? 0,
        featured: r.featured ?? false,
        badge: (r.badge as string | null) ?? undefined,
        emoji: (r.emoji as string | null) ?? "🦆",
        gradient: (r.gradient as string | null) ?? "from-amber-100 to-amber-200",
        imageSrc: (r.imageSrc as string | null) ?? undefined,
        rating: r.rating ?? 5,
        oldPrice: (r.oldPrice as number | null) ?? undefined,
        pricing: (r.pricing as Product["pricing"]) ?? undefined,
        priceRates: (r.priceRates as Product["priceRates"]) ?? undefined,
        // ฟิลด์หนักที่การ์ดไม่ใช้ — เว้นว่างไว้ (priceRange ใช้ pricing/price ได้อยู่แล้ว)
        options: [],
        rules: [],
        images: [],
        body: [],
        description: "",
      }) as unknown as Product
  );
}

/** ดึงสินค้ารายตัว */
export async function fetchProduct(id: string): Promise<Product | undefined> {
  const sb = getSupabase();
  let product: Product | undefined;
  if (!sb) {
    product = mergedProduct(id);
  } else {
    const { data, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
    product = error ? mergedProduct(id) : ((data?.data as Product | undefined) ?? undefined);
  }
  if (!product || !product.options?.some((o) => o.presetId)) return product;
  return resolveProduct(product, await fetchPresets());
}

/**
 * ดึงสินค้ารายตัวแบบ "ดิบ" (ไม่คลี่คลังตัวเลือก) — สำหรับหน้าแก้ไขที่ต้องรู้ว่ากลุ่มไหนลิงก์อยู่
 * ต่างจาก fetchProduct ตรงที่คงกลุ่มลิงก์ไว้ตามที่เก็บ (choices = สำเนาสำรอง)
 */
export async function fetchProductRaw(id: string): Promise<Product | undefined> {
  const sb = getSupabase();
  if (!sb) return mergedProduct(id);
  const { data, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error) return mergedProduct(id);
  return (data?.data as Product | undefined) ?? undefined;
}

/** บันทึกสินค้า (แอดมิน) — ผ่าน API route ฝั่งเซิร์ฟเวอร์ (ตรวจสิทธิ์+เขียน Supabase); ยังไม่ตั้งค่า → localStorage */
export async function persistProduct(p: Product): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (res.status === 503) {
      // ยังไม่ตั้งค่า Firebase/Supabase → โหมดเดโม
      try {
        saveOverride(p);
        return { ok: true };
      } catch {
        return { ok: false, error: "storage-full" };
      }
    }
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "บันทึกไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/** ลบสินค้า (แอดมิน) */
export async function deleteProductDb(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.status === 503) {
      markDeleted(id);
      return true;
    }
    return res.ok;
  } catch {
    return false;
  }
}
