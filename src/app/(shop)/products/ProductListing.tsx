"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PRODUCTS, type CategoryId, type Product } from "@/lib/products";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import { fetchProductsLite } from "@/lib/product-repo";
import ShopProductCard from "@/components/ShopProductCard";

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
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    fetchCategories().then((list) => setCats(list.filter((c) => !c.hidden)));
  }, []);
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
    // สินค้าที่ปิดการมองเห็นไว้ (หลังบ้าน) ไม่ต้องขึ้นในหน้ารายการ/ค้นหา
    let list = all.filter((p) => !p.hidden);
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

  /**
   * ทยอยวาดการ์ดทีละชุด — เดิมวาดทั้ง 400 ใบพร้อมกัน (DOM ~4,500 ชิ้น) มือถือกระตุกตั้งแต่เปิดหน้า
   * เลื่อนถึงท้ายลิสต์แล้วค่อยเติมชุดถัดไปให้เอง (ไม่ต้องกดปุ่ม · ของครบเหมือนเดิม)
   */
  const PAGE = 48;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [category, search, sort]);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown >= filtered.length) return;
    // วัดตำแหน่งตอนเลื่อนเอง — ไม่ใช้ IntersectionObserver (เคยเจอว่ามันไม่ยิงเมื่อแท็บไม่ได้อยู่หน้าสุด)
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = sentinel.current;
      if (!el) return;
      // เหลืออีกไม่ถึง 1 จอก็เติมชุดถัดไปเลย จะได้ไม่เห็นรอยต่อ
      if (el.getBoundingClientRect().top < window.innerHeight + 600) setShown((n) => n + PAGE);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [shown, filtered.length]);
  const visible = useMemo(() => filtered.slice(0, shown), [filtered, shown]);

  function selectCategory(id: string) {
    router.replace(id === "all" ? "/products" : `/products?category=${id}`, {
      scroll: false,
    });
  }

  return (
    <div className="dl dl-page">
      <div className="top-stack plist-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg-cloud plist-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg-cloud plist-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg-cloud plist-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <div className="plist-wrap">
          {/* หัวหน้า */}
          <div className="plist-head">
            <div>
              <span className="kicker kicker-yolk">
                <i className="folder">🛍️</i>เลือกซื้อสินค้า
              </span>
              <h1>
                สินค้า<em>ทั้งหมด</em>
              </h1>
              <p>ทุกชิ้นพิมพ์ลายของคุณเองได้ — เลือกหมวด ค้นหา หรือเรียงราคาได้เลย</p>
            </div>
            <span className="plist-count">
              พบ <b>{filtered.length.toLocaleString("th-TH")}</b> รายการ
            </span>
          </div>

          {/* ค้นหา + เรียงลำดับ */}
          <div className="plist-bar">
            <label className="plist-search">
              <i aria-hidden="true">🔍</i>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาสินค้า เช่น แก้ว, เสื้อยืด, เคส..."
                aria-label="ค้นหาสินค้า"
              />
            </label>
            <div className="plist-sort">
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="เรียงลำดับสินค้า">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    เรียงตาม: {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* แท็บหมวดหมู่ */}
          <div className="plist-cats">
            <button type="button" onClick={() => selectCategory("all")} className={`plist-cat${category === "all" ? " on" : ""}`}>
              <em>✨</em> ทั้งหมด
            </button>
            {cats.map((c) => (
              <button key={c.id} type="button" onClick={() => selectCategory(c.id)} className={`plist-cat${category === c.id ? " on" : ""}`}>
                <em>{c.emoji}</em> {c.name}
              </button>
            ))}
          </div>

          {/* ผลลัพธ์ */}
          {filtered.length === 0 ? (
            <div className="plist-empty">
              <span>🐥</span>
              <h2>ไม่พบสินค้าที่ค้นหา</h2>
              <p>ลองเปลี่ยนคำค้นหรือเลือกหมวดอื่นดูนะ</p>
            </div>
          ) : (
            <>
              <div className="plist-grid">
                {visible.map((p) => (
                  <ShopProductCard key={p.id} product={p} />
                ))}
              </div>
              {shown < filtered.length && (
                <div ref={sentinel} className="plist-more">
                  <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn btn-ghost">
                    แสดงเพิ่ม ({(filtered.length - shown).toLocaleString("th-TH")} รายการ) <span className="dot">↓</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
