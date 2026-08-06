import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { getProduct, type Product } from "./products";
import { resolveOptions, type OptionPreset } from "./option-presets";

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
