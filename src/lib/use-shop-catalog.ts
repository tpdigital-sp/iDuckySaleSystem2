"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CATEGORIES, fetchCategories, type ShopCategory } from "@/lib/categories";
import { cachedProductsLite, fetchProductsLite } from "@/lib/product-repo";
import type { Product } from "@/lib/products";
import { buildSearchIndex, type SearchHit } from "@/lib/site-search";

/**
 * หมวด + สินค้า (ชุด lite) สำหรับเมนู/ค้นหาบนแถบเมนู — โหลดครั้งเดียวตอนถูกใช้งานจริง (active = true)
 * ไม่ถ่วงทุกหน้าตอนโหลด · fetchProductsLite แชร์คำขอกับหน้าแรก/เมนูอื่นที่ขอพร้อมกัน
 * คืนดัชนีค้นหา (buildSearchIndex) + สินค้า 5 ตัวแรกของแต่ละหมวด (ใช้ในเมนูสามขีด)
 */
export function useShopCatalog(active: boolean) {
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  const [products, setProducts] = useState<Product[]>(() => cachedProductsLite() ?? []);
  const asked = useRef(false);
  useEffect(() => {
    if (!active || asked.current) return;
    asked.current = true;
    void fetchCategories().then((list) => setCats(list));
    void fetchProductsLite().then((ps) => setProducts(ps.filter((p) => !p.hidden)));
  }, [active]);

  const visibleCats = useMemo(() => cats.filter((c) => !c.hidden), [cats]);
  const index: SearchHit[] = useMemo(() => buildSearchIndex(cats, products), [cats, products]);
  /** สินค้า 5 ตัวแรกของแต่ละหมวด (เรียงตามลำดับจริงในร้าน) */
  const byCat = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of products) {
      const list = m.get(p.category) ?? [];
      if (list.length < 5) list.push(p);
      m.set(p.category, list);
    }
    return m;
  }, [products]);

  return { cats: visibleCats, products, index, byCat };
}
