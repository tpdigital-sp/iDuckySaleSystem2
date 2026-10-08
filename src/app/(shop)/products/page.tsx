import { Suspense } from "react";
import type { Metadata } from "next";
import { catShortName } from "@/lib/categories";
import { getCategoryServer } from "@/lib/server/categories-server";
import ProductListing from "./ProductListing";

type Search = Promise<{ category?: string | string[]; q?: string | string[] }>;
const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)?.trim() || "";

/**
 * หน้า "สินค้าทั้งหมด" มีลิงก์หมวดเป็น ?category=… (sitemap ส่งทุกหมวดให้ Google)
 * เดิมทุกหมวดใช้ชื่อ/คำอธิบายเดียวกันหมด + canonical ตัด query → Google เห็นเป็นหน้าเดียวซ้ำ 18 ครั้ง
 * ตอนนี้แต่ละหมวดมีชื่อ/คำอธิบาย/ที่อยู่ทางการของตัวเอง ค้นชื่อหมวดแล้วเจอหน้าหมวดตรง ๆ
 * ผลค้นหา ?q= เป็นหน้าชั่วคราว ไม่ให้เก็บ (noindex) กันผลค้นหาขยะไปโผล่บน Google
 */
export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const sp = await searchParams;
  const catId = one(sp.category);
  const q = one(sp.q);
  if (q) return { title: `ค้นหา "${q}"`, robots: { index: false, follow: true } };
  const cat = catId && catId !== "all" ? await getCategoryServer(catId) : undefined;
  if (cat && !cat.hidden) {
    const name = catShortName(cat.name);
    const title = `${name} พิมพ์ลายตามสั่ง`;
    const description =
      (cat.description || "").trim() ||
      `รวมสินค้า${name}พิมพ์ลายของคุณเอง สั่งขั้นต่ำน้อย ราคาต่อชิ้นลดตามจำนวน ส่งทั่วไทย`;
    const canonical = `/products?category=${encodeURIComponent(cat.id)}`;
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: { title, description, url: canonical, ...(cat.image ? { images: [{ url: cat.image }] } : {}) },
    };
  }
  const title = "สินค้าทั้งหมด";
  const description = "เลือกชมสินค้าพิมพ์ลายตามสั่งทุกหมวดหมู่ — แก้วน้ำ เสื้อยืด เคสมือถือ กรอบผ้าใบ และอีกมากมาย";
  return { title, description, alternates: { canonical: "/products" }, openGraph: { title, description, url: "/products" } };
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductListing />
    </Suspense>
  );
}
