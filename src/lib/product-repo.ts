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
 * ดึงสินค้าเฉพาะ id ที่ต้องใช้ (เต็มก้อน) — สำหรับตะกร้า/ออเดอร์ที่ต้องคิดราคาใหม่
 * ก่อนหน้านี้ตะกร้าดึงสินค้า "ทั้งร้าน" (~1.4 MB) ทุกครั้งที่เปิดหน้า ทั้งที่ใช้แค่ไม่กี่ตัว
 */
export async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  const want = [...new Set(ids.filter(Boolean))];
  if (want.length === 0) return [];
  const sb = getSupabase();
  if (!sb) return mergedProducts().filter((p) => want.includes(p.id));
  const { data, error } = await sb.from("products").select("id,data").in("id", want);
  if (error || !data) return mergedProducts().filter((p) => want.includes(p.id));
  const products = (data as Array<{ id: string; data: Product }>).map((r) => r.data as Product);
  if (!products.some((p) => p.options?.some((o) => o.presetId))) return products;
  const presets = await fetchPresets();
  return products.map((p) => resolveProduct(p, presets));
}

/**
 * "คลังไหนถูกสินค้าไหนใช้อยู่บ้าง" สำหรับหน้าคลังตัวเลือก — ดึงแค่ id/ชื่อ/กลุ่มตัวเลือก
 * (เดิมดึงสินค้าทั้งร้านเต็มก้อนเพื่อนับ ทั้งที่ใช้แค่ presetId)
 */
export async function fetchPresetUsage(): Promise<{ id: string; name: string; presetIds: string[] }[]> {
  const sb = getSupabase();
  const fromList = (list: Product[]) =>
    list.map((p) => ({
      id: p.id,
      name: p.name,
      presetIds: (p.options ?? []).map((o) => o.presetId).filter((x): x is string => !!x),
    }));
  if (!sb) return fromList(mergedProducts());
  const { data, error } = await sb.from("products").select("id,name,options:data->options");
  if (error || !data) return fromList(mergedProducts());
  return (data as unknown as Array<{ id: string; name: string; options: Product["options"] | null }>)
    .filter((r) => !String(r.id).startsWith("__"))
    .map((r) => ({
      id: r.id,
      name: r.name,
      presetIds: (r.options ?? []).map((o) => o.presetId).filter((x): x is string => !!x),
    }));
}

/**
 * ดึงเฉพาะฟิลด์ที่การ์ดหน้ารายการ/หน้าแรกต้องใช้ (เบา) — ไม่ดึงก้อน options/rules/body ที่หนัก
 * ใช้ JSON projection ของ Supabase เพื่อลดข้อมูลที่โหลดเมื่อสินค้าเยอะ · ดึงเต็มเฉพาะตอนเปิดหน้ารายละเอียด
 */
/**
 * รายชื่อสินค้าอย่างเดียว (id / ชื่อ / หมวด / ป้าย) — สำหรับเมนูดรอปดาวน์และลิสต์ชื่อ
 * ไม่ดึงรูป+ตารางราคา จึงเร็วกว่า fetchProductsLite ~5 เท่า (345 สินค้า: ~35KB vs ~200KB)
 */
export async function fetchProductNamesLite(): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return mergedProducts();
  const { data, error } = await sb
    .from("products")
    .select("id,name,category,badge,sort,slug:data->>slug,hidden:data->hidden,templateIds:data->templateIds")
    .order("sort", { ascending: true });
  if (error || !data) return mergedProducts();
  return (data as unknown as Record<string, unknown>[])
    .filter((r) => !String(r.id).startsWith("__"))
    .map((r) => ({ ...r, badge: (r.badge ?? undefined) as Product["badge"] }) as unknown as Product);
}

/**
 * รายการสินค้าสำหรับ "หน้ารายการหลังบ้าน" — เอาเฉพาะฟิลด์ที่ลิสต์ใช้จริง
 * ของหนักที่ลิสต์ไม่ได้ใช้ (tabs · seo · rules · body ยาว ๆ · description) ไม่ต้องโหลด
 * ก้อนเดิม (id,data ทั้งแถว) = ~1.4 MB / 364 สินค้า · แบบนี้เหลือราวครึ่งเดียว
 */
export async function fetchProductsAdminLite(): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return mergedProducts();
  const { data, error } = await sb
    .from("products")
    .select(
      "id,name,category,price,sold,featured,badge,sort,slug:data->>slug," +
        "emoji:data->>emoji,gradient:data->>gradient,imageSrc:data->>imageSrc," +
        "rating:data->rating,oldPrice:data->oldPrice,pricing:data->pricing,priceRates:data->priceRates," +
        "hidden:data->hidden,reviewed:data->reviewed,bulkAskQty:data->bulkAskQty,custom:data->custom," +
        "options:data->options,images:data->images,highlights:data->highlights,body:data->body"
    )
    .order("sort", { ascending: true });
  if (error || !data) return mergedProducts();
  const rows = (data as unknown as Record<string, unknown>[]).filter((r) => !String(r.id).startsWith("__"));
  const products = rows.map(
    (r) =>
      ({
        ...r,
        slug: (r.slug as string | null) ?? undefined,
        badge: (r.badge as string | null) ?? undefined,
        emoji: (r.emoji as string | null) ?? "🦆",
        gradient: (r.gradient as string | null) ?? "from-amber-100 to-amber-200",
        imageSrc: (r.imageSrc as string | null) ?? undefined,
        rating: r.rating ?? 5,
        oldPrice: (r.oldPrice as number | null) ?? undefined,
        hidden: (r.hidden as boolean | null) ?? undefined,
        options: (r.options as Product["options"]) ?? [],
        images: (r.images as Product["images"]) ?? [],
        highlights: (r.highlights as Product["highlights"]) ?? [],
        body: (r.body as Product["body"]) ?? [],
        rules: [],
        description: "",
      }) as unknown as Product
  );
  // คลี่ตัวเลือกที่ลิงก์คลัง เพื่อให้สรุป "ชื่อกลุ่ม (จำนวนตัวเลือก)" ตรงกับของจริง
  if (!products.some((p) => p.options?.some((o) => o.presetId))) return products;
  const presets = await fetchPresets();
  return products.map((p) => resolveProduct(p, presets));
}

export async function fetchProductsLite(): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return mergedProducts();
  const { data, error } = await sb
    .from("products")
    .select(
      "id,name,category,price,sold,featured,badge,sort,slug:data->>slug,hidden:data->hidden," +
        "emoji:data->>emoji,gradient:data->>gradient,imageSrc:data->>imageSrc," +
        "rating:data->rating,oldPrice:data->oldPrice,priceMin:data->priceMin,priceMax:data->priceMax"
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
        slug: (r.slug as string | null) ?? undefined,
        name: r.name,
        category: r.category,
        price: r.price ?? 0,
        sold: r.sold ?? 0,
        featured: r.featured ?? false,
        badge: (r.badge as string | null) ?? undefined,
        hidden: (r.hidden as boolean | null) ?? undefined,
        emoji: (r.emoji as string | null) ?? "🦆",
        gradient: (r.gradient as string | null) ?? "from-amber-100 to-amber-200",
        imageSrc: (r.imageSrc as string | null) ?? undefined,
        rating: r.rating ?? 5,
        oldPrice: (r.oldPrice as number | null) ?? undefined,
        priceMin: (r.priceMin as number | null) ?? undefined,
        priceMax: (r.priceMax as number | null) ?? undefined,
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

/** ลำดับในลิสต์ของสินค้าตัวนี้ (คอลัมน์ sort) — ใช้ตอนทำซ้ำ ให้สำเนาไปอยู่ติดตัวต้นฉบับ */
export async function fetchProductSort(id: string): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("products").select("sort").eq("id", id).maybeSingle();
  return (data?.sort as number | null) ?? null;
}

/** บันทึกสินค้า (แอดมิน) — ผ่าน API route ฝั่งเซิร์ฟเวอร์ (ตรวจสิทธิ์+เขียน Supabase); ยังไม่ตั้งค่า → localStorage */
export async function persistProduct(
  p: Product,
  /** savedAt ของข้อมูลที่โหลดมาตอนเปิดหน้า — ส่งมาด้วยเพื่อให้เซิร์ฟเวอร์กันแท็บเก่าบันทึกทับ */
  baseSavedAt?: string,
  /** ตั้งลำดับในลิสต์ด้วย (ไม่ส่ง = ไม่แตะลำดับเดิม) */
  sort?: number
): Promise<{ ok: boolean; error?: string; savedAt?: string }> {
  try {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // ส่งเสมอเมื่อมาจากหน้าแก้ไข — ค่าว่าง = ยังไม่เคยบันทึกด้วยระบบใหม่ (ผ่านได้)
        ...(baseSavedAt !== undefined ? { "x-base-saved-at": baseSavedAt || "new" } : {}),
      },
      body: JSON.stringify(typeof sort === "number" ? { ...p, sort } : p),
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
    const data = (await res.json().catch(() => ({}))) as { error?: string; savedAt?: string };
    return res.ok ? { ok: true, savedAt: data.savedAt } : { ok: false, error: data.error ?? "บันทึกไม่สำเร็จ" };
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
