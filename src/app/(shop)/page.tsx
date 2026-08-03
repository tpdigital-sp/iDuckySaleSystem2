"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PRODUCTS, type Product } from "@/lib/products";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import { fetchProductsLite } from "@/lib/product-repo";
import ProductCard from "@/components/ProductCard";

export default function HomePage() {
  // โหลดสินค้า (Supabase หรือ localStorage) หลัง mount
  const [all, setAll] = useState<Product[]>(PRODUCTS);
  // หมวดหมู่ที่แอดมินตั้งไว้ในหลังบ้าน (ยังไม่เคยตั้ง = ค่าเริ่มต้นในโค้ด)
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    fetchCategories().then((list) => setCats(list.filter((c) => !c.hidden)));
  }, []);
  useEffect(() => {
    let active = true;
    fetchProductsLite().then((ps) => {
      if (active) setAll(ps);
    });
    return () => {
      active = false;
    };
  }, []);

  const featured = all.filter((p) => p.featured);
  const bestSellers = [...all].sort((a, b) => b.sold - a.sold).slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* แบนเนอร์โปรโมชัน */}
      <section className="mt-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-200 via-amber-100 to-ducky shadow-[0_10px_40px_rgba(63,161,182,0.22)]">
        <div className="flex flex-col items-center gap-6 px-6 py-10 text-center md:flex-row md:px-12 md:py-14 md:text-left">
          <div className="flex-1">
            <span className="inline-block rounded-full bg-white/70 px-4 py-1.5 text-xs font-bold text-amber-800">
              🎉 โปรเปิดร้าน ลดสูงสุด 25%
            </span>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight text-amber-950 md:text-5xl">
              พิมพ์ลายของคุณ
              <br />
              ลงบนของที่คุณรัก 💛
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-amber-900/80 md:text-base">
              แก้วน้ำ เสื้อยืด เคสมือถือ กรอบผ้าใบ และอีกมากมาย
              <br className="hidden md:block" />
              อัปโหลดลาย → เลือกสินค้า → รอรับที่บ้าน ง่ายแค่นี้!
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
              <Link
                href="/products"
                className="rounded-full bg-amber-400 px-7 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:bg-amber-500"
              >
                🛍️ ช้อปเลย
              </Link>
              <Link
                href="/how-to-order"
                className="rounded-full bg-white/80 px-7 py-3.5 text-sm font-bold text-amber-900 shadow transition hover:scale-105 hover:bg-white"
              >
                📖 วิธีสั่งซื้อ
              </Link>
            </div>
          </div>
          <div className="relative hidden h-52 w-52 shrink-0 md:block">
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/40 text-[7rem] shadow-inner">
              🦆
            </span>
            <span className="absolute -left-4 top-2 animate-bounce text-4xl">✨</span>
            <span className="absolute -right-2 bottom-4 text-4xl">🎨</span>
          </div>
        </div>
      </section>

      {/* จุดเด่นร้าน */}
      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { emoji: "🎨", title: "ลายของคุณเอง", desc: "อัปโหลดรูป/โลโก้ได้เลย" },
          { emoji: "🚚", title: "ส่งไวทั่วไทย", desc: "ส่งฟรีเมื่อครบ ฿999" },
          { emoji: "💎", title: "งานพิมพ์คุณภาพ", desc: "สีสด คมชัด ทนทาน" },
          { emoji: "💬", title: "แอดมินใจดี", desc: "ปรึกษาลายฟรีทาง LINE" },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-amber-100"
          >
            <span className="text-3xl">{f.emoji}</span>
            <h3 className="mt-1.5 text-sm font-bold text-stone-800">{f.title}</h3>
            <p className="mt-0.5 text-xs text-stone-500">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* หมวดหมู่สินค้า */}
      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-xl font-extrabold text-amber-950 md:text-2xl">🗂️ หมวดหมู่สินค้า</h2>
          <Link href="/products" className="text-sm font-semibold text-amber-600 hover:text-amber-700">
            ดูทั้งหมด →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cats.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${c.id}`}
              className={`group flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-br ${c.gradient} p-5 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md`}
            >
              <span className="text-4xl transition-transform group-hover:scale-110">{c.emoji}</span>
              <span className="text-sm font-bold text-stone-800">{c.name}</span>
              <span className="text-[11px] text-stone-600/80">{c.nameEn}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* สินค้าขายดี */}
      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-xl font-extrabold text-amber-950 md:text-2xl">🔥 สินค้าขายดี</h2>
          <Link
            href="/products?sort=popular"
            className="text-sm font-semibold text-amber-600 hover:text-amber-700"
          >
            ดูทั้งหมด →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {bestSellers.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* สินค้าแนะนำ */}
      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-xl font-extrabold text-amber-950 md:text-2xl">💛 สินค้าแนะนำ</h2>
          <Link href="/products" className="text-sm font-semibold text-amber-600 hover:text-amber-700">
            ดูทั้งหมด →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {featured.slice(0, 8).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* CTA ท้ายหน้า */}
      <section className="mt-14 rounded-[2rem] bg-gradient-to-r from-pink-200 via-rose-100 to-amber-100 p-8 text-center md:p-12">
        <span className="text-4xl">🎁</span>
        <h2 className="mt-3 text-2xl font-extrabold text-stone-800">
          มีลายในใจแล้วใช่ไหม? มาเริ่มกันเลย!
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          เลือกสินค้าที่ชอบ แล้วอัปโหลดลายของคุณ เดี๋ยวเราจัดการที่เหลือให้เอง
        </p>
        <Link
          href="/products"
          className="mt-5 inline-block rounded-full bg-rose-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:bg-rose-600"
        >
          เริ่มออกแบบสินค้าของฉัน →
        </Link>
      </section>
    </div>
  );
}
