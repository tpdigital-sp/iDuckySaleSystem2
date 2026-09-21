import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS } from "@/lib/products";
import { getProductServer, getProductTemplates, getRelatedProducts } from "@/lib/products-server";
import { productAutoSeo } from "@/lib/auto-seo";
import { withImageVersion } from "@/lib/img";
import { fetchProductReviewStats } from "@/lib/server/reviews-db";
import { getCategoryServer } from "@/lib/server/categories-server";
import ProductDetail from "./ProductDetail";
import ProductReviews from "@/components/ProductReviews";

/**
 * ให้ CDN เก็บหน้าไว้ 5 นาที แล้วค่อยสร้างใหม่เบื้องหลัง (ISR)
 * วัดจากเว็บจริง: หน้าที่ CDN ยังไม่มีสำเนา ใช้ 0.8-1.3 วิ · ถ้ามีสำเนาแล้วเหลือ 0.12 วิ
 * ราคา/ตัวเลือกไม่ค้าง เพราะหน้าสินค้าดึงข้อมูลล่าสุดจากฐานข้อมูลซ้ำอีกรอบฝั่งเบราว์เซอร์อยู่แล้ว
 * ⚠️ ห้ามอ่านคุกกี้ในหน้านี้ — หน้า ISR บนเว็บจริงเจอ cookies() กลางทางจะกลายเป็น 500
 *    (DYNAMIC_SERVER_USAGE — เคยพังกับสินค้าฉบับร่างทุกตัว 2 ก.ย. 69) ทีมงานพรีวิวร่างที่ /preview/[id] แทน
 *
 * ⏱️ 21 ก.ย. 69 ขยาย 5 นาที → 1 ชั่วโมง เพราะสินค้ามี ~430 ตัว ตัวที่คนเข้าไม่บ่อยจะหมดอายุก่อนมีคนเข้าซ้ำเสมอ
 *    = ลูกค้าเจอหน้าสร้างสดทุกครั้ง (วัดจริง 3.34 วิ เทียบกับ 0.43 วิ ตอนมีสำเนาแล้ว)
 *    ความสดไม่เสีย เพราะแอดมินกดบันทึกสินค้าแล้วล้างแคชหน้านั้นให้ทันที (revalidatePath ใน api/admin/products)
 */
export const revalidate = 3600;

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductServer(id);
  if (!product) return { title: "ไม่พบสินค้า" };
  // แอดมินยังไม่เขียน SEO เอง → ระบบเขียนให้อัตโนมัติจากข้อมูลสินค้า (ทุกสินค้ามี meta ครบเสมอ)
  const auto = productAutoSeo(product);
  const title = product.seo?.title || auto.title;
  const description = product.seo?.description || product.description || auto.description;
  return {
    title,
    description,
    // ปิดการมองเห็นไว้ = ไม่ให้ Google เก็บ (เผื่อเคยถูกเก็บไว้ตอนยังเปิดอยู่)
    ...(product.hidden ? { robots: { index: false, follow: false } } : {}),
    keywords: product.seo?.keywords?.length ? product.seo.keywords : auto.keywords,
    openGraph: {
      title,
      description,
      type: "website",
      ...(product.imageSrc ? { images: [{ url: product.imageSrc }] } : {}),
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductServer(id);
  // ปิดการมองเห็นไว้ = 404 สำหรับทุกคน — ทีมงานพรีวิวผ่าน /preview/[id] (หน้า force-dynamic แยกต่างหาก)
  if (!product || product.hidden) notFound();
  /**
   * ⚡ 4 อย่างนี้ไม่ได้รอกัน (ใช้แค่ product ที่ได้มาแล้ว) — ยิงพร้อมกันเสมอ
   * เดิมเขียนเรียงต่อกัน = เสียเวลาไป-กลับฐาน 4 รอบซ้อน ~0.5-1 วิ ต่อการสร้างหน้า 1 ครั้ง
   * ซึ่งลูกค้าคนแรกของสินค้าตัวนั้นเป็นคนจ่ายทุกครั้งที่แคชหมดอายุ/หลัง deploy (วัดจริง 21 ก.ย. 69: 3.34 วิ)
   * ⚠️ ห้ามแยกกลับเป็น await ทีละบรรทัด
   */
  const [templates, reviewStats, related, category] = await Promise.all([
    // 📐 เทมเพลตไฟล์งานที่ผูกไว้ — ดึงฝั่งเซิร์ฟเวอร์ให้ลิงก์โหลดติดมากับหน้าเลย
    getProductTemplates(product.templateIds ?? []),
    // ⭐ สรุปคะแนนรีวิวจริง — ให้ aggregateRating ติดไปกับ JSON-LD ตั้งแต่ HTML แรก (Google เห็นดาว)
    fetchProductReviewStats(product.id),
    // 🧩 "สินค้าอื่นในหมวด…" — ดึงของจริงจากฐานข้อมูล (การ์ดจะได้ขึ้นรูปสินค้า ไม่ใช่อีโมจิของชุดตัวอย่าง)
    getRelatedProducts(product.category, product.id),
    // 🗂️ ชื่อ/อีโมจิหมวดต้องเป็นชุดที่แอดมินจัดไว้ในฐาน ไม่ใช่ CATEGORIES ชุดเก่าในโค้ด
    getCategoryServer(product.category),
  ]);
  return (
    <>
      <ProductDetail
        // ติดรหัสรุ่นท้าย URL รูป (?v=savedAt) — เปลี่ยนรูปทับพาธเดิมแล้วต้องเห็นของใหม่ ไม่ใช่ของที่ค้างในแคชตัวย่อรูป
        product={withImageVersion(product)}
        templates={templates}
        preview={false}
        reviewStats={reviewStats}
        related={related}
        category={category}
      />
      <ProductReviews productId={product.id} />
    </>
  );
}
