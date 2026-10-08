import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/shop-info";
import { productPath } from "@/lib/products";
import { getCategoriesServer } from "@/lib/server/categories-server";
import { listPublicProductsServer } from "@/lib/server/public-products";
import { listArticlesServer } from "@/lib/server/articles-server";
import { getSeoServer } from "@/lib/server/settings-server";

/**
 * sitemap.xml — บอก Google ว่ามีหน้าอะไรบ้าง (เปิดได้ที่ /sitemap.xml)
 * สร้างสดจากฐานข้อมูลทุกครั้งที่ Google มาดึง → เพิ่มสินค้า/บทความใหม่ไม่ต้องมาแก้อะไร
 * ปิดการเก็บข้อมูล (noindex) ไว้ = ส่ง sitemap เปล่า จะได้ไม่ชวนให้มาเก็บ
 */
export const revalidate = 3600; // ทำใหม่ทุก 1 ชม. พอ — ไม่ต้องยิงฐานข้อมูลทุกคำขอ

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getSeoServer();
  if (seo.noindex) return [];

  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/how-to-order`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/articles`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
  ];

  // 🗂️ หมวดจากฐาน (ชุดที่แอดมินจัด) ไม่ใช่ CATEGORIES ชุดเก่าในโค้ด · หมวดที่ซ่อนไม่ส่ง
  const [products, articles, categories] = await Promise.all([
    listPublicProductsServer(),
    listArticlesServer().catch(() => []),
    getCategoriesServer(),
  ]);

  const categoryPages: MetadataRoute.Sitemap = categories.filter((c) => !c.hidden).map((c) => ({
    url: `${SITE_URL}/products?category=${c.id}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const productPages: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${SITE_URL}${productPath(p)}`,
    lastModified: p.savedAt ? new Date(p.savedAt) : now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const articlePages: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE_URL}/articles/${encodeURIComponent(a.slug)}`,
    lastModified: a.updatedAt ? new Date(a.updatedAt) : now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticPages, ...categoryPages, ...productPages, ...articlePages];
}
