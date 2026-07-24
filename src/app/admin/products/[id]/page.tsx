import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS } from "@/lib/products";
import { getProductServer } from "@/lib/products-server";
import ProductEditor from "./ProductEditor";
import RequirePerm from "@/components/RequirePerm";

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
  return { title: product ? `แก้ไข: ${product.name}` : "ไม่พบสินค้า" };
}

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductServer(id);
  if (!product) notFound();
  return (
    <RequirePerm perm="products.manage">
      <ProductEditor product={product} />
    </RequirePerm>
  );
}
