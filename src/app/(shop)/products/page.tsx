import { Suspense } from "react";
import type { Metadata } from "next";
import ProductListing from "./ProductListing";

export const metadata: Metadata = {
  title: "สินค้าทั้งหมด",
  description: "เลือกชมสินค้าพิมพ์ลายตามสั่งทุกหมวดหมู่ — แก้วน้ำ เสื้อยืด เคสมือถือ กรอบผ้าใบ และอีกมากมาย",
};

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductListing />
    </Suspense>
  );
}
