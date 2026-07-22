"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, PRODUCTS, type CategoryId, type Product } from "@/lib/products";
import { fetchProductsLite } from "@/lib/product-repo";
import ProductCard from "@/components/ProductCard";

type SortKey = "popular" | "price-asc" | "price-desc" | "rating";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "popular", label: "ยอดนิยม" },
  { id: "price-asc", label: "ราคา: ต่ำ → สูง" },
  { id: "price-desc", label: "ราคา: สูง → ต่ำ" },
  { id: "rating", label: "คะแนนรีวิว" },
];

export default function ProductListing() {
  const router = useRouter();
  const params = useSearchParams();
  const category = (params.get("category") as CategoryId | null) ?? "all";
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>(
    (params.get("sort") as SortKey | null) ?? "popular"
  );

  // โหลดสินค้า (Supabase หรือ localStorage) หลัง mount
  const [all, setAll] = useState<Product[]>(PRODUCTS);
  useEffect(() => {
    let active = true;
    fetchProductsLite().then((ps) => {
      if (active) setAll(ps);
    });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = all;
    if (category !== "all") list = list.filter((p) => p.category === category);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    switch (sort) {
      case "popular":
        sorted.sort((a, b) => b.sold - a.sold);
        break;
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        sorted.sort((a, b) => b.rating - a.rating);
        break;
    }
    return sorted;
  }, [all, category, search, sort]);

  function selectCategory(id: string) {
    router.replace(id === "all" ? "/products" : `/products?category=${id}`, {
      scroll: false,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <h1 className="text-2xl font-extrabold text-amber-950 md:text-3xl">🛍️ สินค้าทั้งหมด</h1>
      <p className="mt-1 text-sm text-stone-500">
        ทุกชิ้นพิมพ์ลายของคุณเองได้ — เลือกหมวด ค้นหา หรือเรียงราคาได้เลย
      </p>

      {/* ค้นหา + เรียงลำดับ */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาสินค้า เช่น แก้ว, เสื้อยืด, เคส..."
            className="w-full rounded-full border-0 bg-white py-3 pl-12 pr-4 text-sm shadow-sm ring-1 ring-amber-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-ducky"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-700 shadow-sm ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-ducky"
          aria-label="เรียงลำดับสินค้า"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              เรียงตาม: {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* แท็บหมวดหมู่ */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => selectCategory("all")}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
            category === "all"
              ? "bg-amber-400 text-white shadow"
              : "bg-white text-stone-600 ring-1 ring-amber-200 hover:bg-amber-50"
          }`}
        >
          ✨ ทั้งหมด
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => selectCategory(c.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              category === c.id
                ? "bg-amber-400 text-white shadow"
                : "bg-white text-stone-600 ring-1 ring-amber-200 hover:bg-amber-50"
            }`}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      {/* ผลลัพธ์ */}
      <p className="mt-3 text-xs text-stone-400">พบ {filtered.length} รายการ</p>
      {filtered.length === 0 ? (
        <div className="mt-8 rounded-3xl bg-white p-12 text-center ring-1 ring-amber-100">
          <span className="text-5xl">🐥</span>
          <p className="mt-3 font-bold text-stone-700">ไม่พบสินค้าที่ค้นหา</p>
          <p className="mt-1 text-sm text-stone-500">ลองเปลี่ยนคำค้นหรือเลือกหมวดอื่นดูนะ</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
