import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS } from "@/lib/products";
import { getProductServer, getProductTemplates, getRelatedProducts } from "@/lib/products-server";
import { productAutoSeo } from "@/lib/auto-seo";
import { withImageVersion } from "@/lib/img";
import { fetchProductReviewStats } from "@/lib/server/reviews-db";
import ProductDetail from "./ProductDetail";
import ProductReviews from "@/components/ProductReviews";

/**
 * ให้ CDN เก็บหน้าไว้ 5 นาที แล้วค่อยสร้างใหม่เบื้องหลัง (ISR)
 * วัดจากเว็บจริง: หน้าที่ CDN ยังไม่มีสำเนา ใช้ 0.8-1.3 วิ · ถ้ามีสำเนาแล้วเหลือ 0.12 วิ
 * ราคา/ตัวเลือกไม่ค้าง เพราะหน้าสินค้าดึงข้อมูลล่าสุดจากฐานข้อมูลซ้ำอีกรอบฝั่งเบราว์เซอร์อยู่แล้ว
 * ⚠️ ห้ามอ่านคุกกี้ในหน้านี้ — หน้า ISR บนเว็บจริงเจอ cookies() กลางทางจะกลายเป็น 500
 *    (DYNAMIC_SERVER_USAGE — เคยพังกับสินค้าฉบับร่างทุกตัว 2 ก.ย. 69) ทีมงานพรีวิวร่างที่ /preview/[id] แทน
 */
export const revalidate = 300;

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
  // 📐 เทมเพลตไฟล์งานที่ผูกไว้ — ดึงฝั่งเซิร์ฟเวอร์ให้ลิงก์โหลดติดมากับหน้าเลย
  const templates = await getProductTemplates(product.templateIds ?? []);
  // ⭐ สรุปคะแนนรีวิวจริง — ดึงฝั่งเซิร์ฟเวอร์เพื่อให้ aggregateRating ติดไปกับ JSON-LD ตั้งแต่ HTML แรก (Google เห็นดาว)
  const reviewStats = await fetchProductReviewStats(product.id);
  // 🧩 "สินค้าอื่นในหมวด…" — ดึงของจริงจากฐานข้อมูล (การ์ดจะได้ขึ้นรูปสินค้า ไม่ใช่อีโมจิของชุดตัวอย่าง)
  const related = await getRelatedProducts(product.category, product.id);
  return (
    <>
      <ProductDetail
        // ติดรหัสรุ่นท้าย URL รูป (?v=savedAt) — เปลี่ยนรูปทับพาธเดิมแล้วต้องเห็นของใหม่ ไม่ใช่ของที่ค้างในแคชตัวย่อรูป
        product={withImageVersion(product)}
        templates={templates}
        preview={false}
        reviewStats={reviewStats}
        related={related}
      />
      <ProductReviews productId={product.id} />
    </>
  );
}
