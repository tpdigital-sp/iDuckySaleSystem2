import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductServer, getProductTemplates, getRelatedProducts } from "@/lib/products-server";
import { currentActor } from "@/lib/server/require-perm";
import { fetchProductReviewStats } from "@/lib/server/reviews-db";
import ProductDetail from "../../products/[id]/ProductDetail";
import ProductReviews from "@/components/ProductReviews";

/**
 * 👁 หน้าพรีวิวสินค้าสำหรับทีมงาน — ตัวเดียวที่เปิดสินค้า "ฉบับร่าง" ได้
 *
 * แยกออกมาจาก /products/[id] เพราะหน้านั้นเป็นหน้าแคช ISR: บนเว็บจริง Next ถือว่าหน้า
 * static แล้ว การอ่านคุกกี้ (เช็คว่าเป็นทีมงานไหม) กลางการเรนเดอร์จะโยน DYNAMIC_SERVER_USAGE
 * กลายเป็นหน้า 500 ทุกครั้งที่เปิดสินค้าร่าง (บน dev ไม่พังเพราะเรนเดอร์สดทุกครั้ง — เจอ 2 ก.ย. 69)
 * หน้านี้จึงประกาศ force-dynamic ตรง ๆ: อ่านคุกกี้ได้เต็มที่ ไม่มีแคช ไม่กระทบ ISR ของหน้าลูกค้า
 *
 * กติกาเข้าชม: สินค้า "ฉบับร่าง" ต้องล็อกอินหลังบ้านเท่านั้น (คนนอก = 404 ไม่ใบ้ว่ามีของซ่อนอยู่)
 * สินค้าที่เผยแพร่แล้วเปิดได้เสมอ — จำเป็นเพราะ middleware ส่งทีมงานทุกคน (เช็คแค่ว่ามีคุกกี้)
 * เข้าหน้านี้แทนหน้าแคช ถ้าคุกกี้ดันหมดอายุอยู่ สินค้าปกติต้องยังเปิดได้ ไม่ใช่ 404 ทั้งร้าน
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "พรีวิวสินค้า (ทีมงาน)",
  robots: { index: false, follow: false },
};

export default async function ProductPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductServer(id);
  if (!product) notFound();
  // ร่างเปิดได้เฉพาะทีมงานที่คุกกี้ยังใช้ได้จริง (verify ลายเซ็น) — ของเผยแพร่แล้วผ่านได้เลย
  if (product.hidden && !(await currentActor())) notFound();
  const templates = await getProductTemplates(product.templateIds ?? []);
  const reviewStats = await fetchProductReviewStats(product.id);
  const related = await getRelatedProducts(product.category, product.id);
  return (
    <>
      <ProductDetail
        product={product}
        templates={templates}
        preview={!!product.hidden}
        reviewStats={reviewStats}
        related={related}
      />
      <ProductReviews productId={product.id} />
    </>
  );
}
