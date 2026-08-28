import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { getProduct, type Product } from "./products";
import { resolveOptions, type OptionPreset } from "./option-presets";
import { sortTemplates, templateReady, type DesignTemplate } from "./design-templates";

/**
 * ดึงสินค้ารายตัวฝั่งเซิร์ฟเวอร์ (สำหรับ generateMetadata + หน้าสินค้า)
 * — ลอง Supabase ก่อน (อ่านสาธารณะผ่าน RLS) เพื่อให้เห็นสินค้าที่นำเข้า/แก้ไขในฐานข้อมูล
 *   (สินค้าที่ไม่ได้อยู่ใน static PRODUCTS เช่นที่ import มา จะ 404 ถ้าไม่ทำตรงนี้)
 * — ไม่มีคีย์/หาไม่เจอ → fallback static array
 * — คลี่ตัวเลือกที่ลิงก์คลัง (presetId) ให้เป็นค่าจริงก่อนส่งให้หน้าร้าน
 */
function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export const getProductServer = cache(async (rawId: string): Promise<Product | undefined> => {
  // ลิงก์ภาษาไทย (slug) มาถึงแบบ percent-encoded — ถอดก่อนค้น (id อังกฤษเดิมไม่กระทบ)
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {}
  const sb = serverClient();
  let product: Product | undefined;
  if (sb) {
    const { data } = await sb.from("products").select("data").eq("id", id).maybeSingle();
    product = (data?.data as Product | undefined) ?? undefined;
    if (!product) {
      // ไม่เจอด้วย id → ลองค้นด้วยลิงก์ตามชื่อ (slug) ที่ตั้งจากหลังบ้าน
      const { data: bySlug } = await sb.from("products").select("data").eq("data->>slug", id).limit(1);
      product = (bySlug?.[0]?.data as Product | undefined) ?? undefined;
    }
  }
  if (!product) product = getProduct(id);
  if (!product) return undefined;
  if (sb && product.options?.some((o) => o.presetId)) {
    // คลังตัวเลือกเก็บเป็นแถวพิเศษ category "__presets__" ในตาราง products
    const { data } = await sb.from("products").select("data").eq("category", "__presets__");
    const presets = (data ?? []).map((r) => r.data as OptionPreset).filter((p) => p?.id);
    if (presets.length) product = { ...product, options: resolveOptions(product.options, presets) };
  }
  return product;
});

/**
 * เทมเพลตไฟล์งานที่สินค้าตัวนี้ผูกไว้ (สำหรับหน้าสินค้า — เรนเดอร์ฝั่งเซิร์ฟเวอร์ Google เห็นด้วย)
 * เก็บเป็นแถวพิเศษ category "__templates__" ในตาราง products แบบเดียวกับคลังตัวเลือก
 * เอาเฉพาะอันที่พร้อมโหลดจริง (ไม่ซ่อน + มีไฟล์หรือลิงก์) · เรียงตามที่ผูกไว้ในสินค้า
 */
export const getProductTemplates = cache(async (ids: string[]): Promise<DesignTemplate[]> => {
  if (!ids.length) return [];
  const sb = serverClient();
  if (!sb) return [];
  const { data } = await sb.from("products").select("data").eq("category", "__templates__");
  const all = (data ?? []).map((r) => r.data as DesignTemplate).filter((t) => t?.id && t.name);
  const picked = all.filter((t) => ids.includes(t.id) && templateReady(t));
  return sortTemplates(picked);
});

/**
 * สินค้าอื่นในหมวดเดียวกัน (ท้ายหน้าสินค้า)
 * เดิมหยิบจาก static PRODUCTS ในโค้ด → ได้สินค้าตัวอย่างที่ไม่มีรูป การ์ดเลยขึ้นเป็นอีโมจิ
 * ตอนนี้ดึงของจริงจากฐานข้อมูล (เฉพาะฟิลด์ที่การ์ดใช้ แบบเดียวกับหน้ารายการ)
 * — ตัดสินค้าที่ปิดการมองเห็น/แถวตั้งค่าร้าน (__…) ออก
 * — เอาตัวที่ "มีรูปจริง" ขึ้นก่อน แล้วค่อยเติมด้วยตัวที่ยังไม่มีรูปให้ครบ
 */
export const getRelatedProducts = cache(
  async (category: string, excludeId: string, limit = 4): Promise<Product[]> => {
    const sb = serverClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("products")
      .select(
        "id,name,category,price,sold,featured,badge,sort,slug:data->>slug,hidden:data->hidden," +
          "emoji:data->>emoji,gradient:data->>gradient,imageSrc:data->>imageSrc," +
          "rating:data->rating,oldPrice:data->oldPrice,priceMin:data->priceMin,priceMax:data->priceMax," +
          "quoteOption:data->quoteOption"
      )
      .eq("category", category)
      .neq("id", excludeId)
      .order("sort", { ascending: true })
      .limit(60);
    if (error || !data) return [];
    const rows = (data as unknown as Record<string, unknown>[]).filter(
      (r) => !String(r.id).startsWith("__") && !r.hidden
    );
    const list = rows.map(
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
          emoji: (r.emoji as string | null) ?? "🦆",
          gradient: (r.gradient as string | null) ?? "from-amber-100 to-amber-200",
          imageSrc: (r.imageSrc as string | null) ?? undefined,
          rating: r.rating ?? 5,
          oldPrice: (r.oldPrice as number | null) ?? undefined,
          priceMin: (r.priceMin as number | null) ?? undefined,
          priceMax: (r.priceMax as number | null) ?? undefined,
          quoteOption: (r.quoteOption as boolean | null) ?? undefined,
          // ฟิลด์หนักที่การ์ดไม่ใช้ (priceRange อ่าน priceMin/priceMax ที่บันทึกไว้แล้ว)
          options: [],
          rules: [],
          images: [],
          body: [],
          description: "",
        }) as unknown as Product
    );
    const withImage = list.filter((p) => p.imageSrc);
    const noImage = list.filter((p) => !p.imageSrc);
    return [...withImage, ...noImage].slice(0, limit);
  }
);
