import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS } from "@/lib/products";
import { getProductServer } from "@/lib/products-server";
import { productAutoSeo } from "@/lib/auto-seo";
import ProductDetail from "./ProductDetail";

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
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
