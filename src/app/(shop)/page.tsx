"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PRODUCTS, type Product } from "@/lib/products";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import { fetchProductsLite } from "@/lib/product-repo";
import ProductCard from "@/components/ProductCard";
import NavTiles from "@/components/NavTiles";
import { fetchSiteNav, visiblePerks, visibleTiles, DEFAULT_SITE_NAV, type NavPerk, type NavTile, type SiteNav } from "@/lib/home-nav";
import { defaultHomeBlocks, videoEmbedUrl, visibleBlocks, type HomeBlock } from "@/lib/home-layout";
import HomeGallery from "@/components/HomeGallery";

export default function HomePage() {
  // โหลดสินค้า (Supabase หรือ localStorage) หลัง mount
  const [all, setAll] = useState<Product[]>(PRODUCTS);
  // หมวดหมู่ที่แอดมินตั้งไว้ในหลังบ้าน (ยังไม่เคยตั้ง = ค่าเริ่มต้นในโค้ด)
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  // การ์ดนำทาง (แอดมินตั้งเองได้ที่ /admin/nav)
  const [tiles, setTiles] = useState<NavTile[]>(visibleTiles(DEFAULT_SITE_NAV));
  const [navStyle, setNavStyle] = useState<Pick<SiteNav, "tilesBg" | "tilesWave" | "tilesPos" | "hero" | "home">>(DEFAULT_SITE_NAV);
  // จุดเด่นร้าน (แก้ได้ที่หลังบ้าน → เมนูหน้าร้าน)
  const [perks, setPerks] = useState<NavPerk[]>(visiblePerks(DEFAULT_SITE_NAV));
  useEffect(() => {
    fetchCategories().then((list) => setCats(list.filter((c) => !c.hidden)));
  }, []);
  useEffect(() => {
    fetchSiteNav().then((n) => {
      setTiles(visibleTiles(n));
      setPerks(visiblePerks(n));
      setNavStyle({ tilesBg: n.tilesBg, tilesWave: n.tilesWave, tilesPos: n.tilesPos, hero: n.hero, home: n.home });
    });
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

  const hero = navStyle.hero ?? DEFAULT_SITE_NAV.hero;
  const featured = all.filter((p) => p.featured);
  const bestSellers = [...all].sort((a, b) => b.sold - a.sold).slice(0, 4);

  // ── เรนเดอร์ทีละบล็อกตามผังที่แอดมินจัด (ไม่เคยจัด = ผังมาตรฐานเดิม) ──
  const blocks = navStyle.home?.length
    ? visibleBlocks(navStyle.home)
    : visibleBlocks(defaultHomeBlocks(navStyle.tilesPos ?? "hero"));

  function renderBlock(blk: HomeBlock) {
    switch (blk.kind) {
      case "image":
        if (!blk.image) return null;
        return (
          <section key={blk.id} className="mt-6">
            <Link
              href={blk.href ?? "/products"}
              className="block overflow-hidden rounded-[2rem] shadow-[0_10px_40px_rgba(63,161,182,0.18)] transition hover:brightness-[0.97]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={blk.image} alt="" className="w-full" />
            </Link>
          </section>
        );

      case "hero":
        if (!hero.on) return null;
        if (hero.bgImage)
          return (
            <section key={blk.id} className="mt-6">
              <Link
                href={hero.btn1Href}
                className="block overflow-hidden rounded-[2rem] shadow-[0_10px_40px_rgba(63,161,182,0.22)] transition hover:brightness-[0.97]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hero.bgImage} alt={hero.title} className="w-full" />
              </Link>
            </section>
          );
        return (
          <section
            key={blk.id}
            className="mt-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-200 via-amber-100 to-ducky shadow-[0_10px_40px_rgba(63,161,182,0.22)]"
          >
            <div className="flex flex-col items-center gap-6 px-6 py-10 text-center md:flex-row md:px-12 md:py-14 md:text-left">
              <div className="flex-1">
                {hero.badge && (
                  <span className="inline-block rounded-full bg-white/70 px-4 py-1.5 text-xs font-bold text-amber-800">
                    {hero.badge}
                  </span>
                )}
                <h1 className="mt-4 whitespace-pre-line text-3xl font-extrabold leading-tight text-amber-950 md:text-5xl">
                  {hero.title}
                </h1>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-amber-900/80 md:text-base">
                  {hero.subtitle}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                  {hero.btn1Label && (
                    <Link
                      href={hero.btn1Href}
                      className="rounded-full bg-amber-400 px-7 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:bg-amber-500"
                    >
                      {hero.btn1Label}
                    </Link>
                  )}
                  {hero.btn2Label && (
                    <Link
                      href={hero.btn2Href}
                      className="rounded-full bg-white/80 px-7 py-3.5 text-sm font-bold text-amber-900 shadow transition hover:scale-105 hover:bg-white"
                    >
                      {hero.btn2Label}
                    </Link>
                  )}
                </div>
              </div>
              <div className="relative hidden h-52 w-52 shrink-0 md:block">
                {hero.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hero.image} alt="" className="h-52 w-52 rounded-3xl object-contain drop-shadow" />
                ) : (
                  <>
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/40 text-[7rem] shadow-inner">
                      🦆
                    </span>
                    <span className="absolute -left-4 top-2 animate-bounce text-4xl">✨</span>
                    <span className="absolute -right-2 bottom-4 text-4xl">🎨</span>
                  </>
                )}
              </div>
            </div>
          </section>
        );

      case "tiles":
        if (!tiles.length) return null;
        return (
          <section key={blk.id} className="mt-8">
            <NavTiles tiles={tiles} bg={navStyle.tilesBg} wave={navStyle.tilesWave} />
          </section>
        );

      case "perks":
        if (!perks.length) return null;
        return (
          <section
            key={blk.id}
            className={`mt-8 grid grid-cols-2 gap-3 ${
              perks.length <= 2 ? "md:grid-cols-2" : perks.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"
            }`}
          >
            {perks.map((f) => (
              <div key={f.id} className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-amber-100">
                <span className="text-3xl">{f.emoji}</span>
                <h3 className="mt-1.5 text-sm font-bold text-stone-800">{f.title}</h3>
                {f.desc && <p className="mt-0.5 text-xs text-stone-500">{f.desc}</p>}
              </div>
            ))}
          </section>
        );

      case "categories":
        return (
          <section key={blk.id} className="mt-12">
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-xl font-extrabold text-amber-950 md:text-2xl">{blk.heading || "🗂️ หมวดหมู่สินค้า"}</h2>
              <Link href="/products" className="text-sm font-semibold text-amber-600 hover:text-amber-700">
                ดูทั้งหมด →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {cats.map((c) => (
                <Link
                  key={c.id}
                  href={`/products?category=${c.id}`}
                  className="group overflow-hidden rounded-3xl bg-white text-center shadow-sm ring-1 ring-amber-100 transition hover:-translate-y-1 hover:shadow-md"
                >
                  <span
                    className={`relative block aspect-[4/3] overflow-hidden ${c.image ? "" : `bg-gradient-to-br ${c.gradient}`}`}
                  >
                    {c.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={c.image}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-5xl transition-transform group-hover:scale-110">
                        {c.emoji}
                      </span>
                    )}
                  </span>
                  <span className="block px-2 py-2.5">
                    <span className="block text-sm font-bold leading-tight text-stone-800">{c.name}</span>
                    {c.nameEn && <span className="mt-0.5 block text-[11px] text-stone-500">{c.nameEn}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );

      case "products": {
        const limit = blk.limit ?? 4;
        const list =
          blk.source === "featured"
            ? featured.slice(0, limit)
            : blk.source === "category"
              ? all.filter((x) => x.category === blk.category).slice(0, limit)
              : bestSellers.slice(0, limit);
        if (!list.length) return null;
        const moreHref =
          blk.source === "category" && blk.category
            ? `/products?category=${blk.category}`
            : blk.source === "best"
              ? "/products?sort=popular"
              : "/products";
        return (
          <section key={blk.id} className="mt-12">
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-xl font-extrabold text-amber-950 md:text-2xl">
                {blk.heading || (blk.source === "featured" ? "💛 สินค้าแนะนำ" : "🔥 สินค้าขายดี")}
              </h2>
              <Link href={moreHref} className="text-sm font-semibold text-amber-600 hover:text-amber-700">
                ดูทั้งหมด →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {list.map((x) => (
                <ProductCard key={x.id} product={x} />
              ))}
            </div>
          </section>
        );
      }

      case "imagetext":
        if (!blk.image && !blk.heading) return null;
        return (
          <section key={blk.id} className="mt-12">
            <div className={`grid items-center gap-6 md:grid-cols-2 md:gap-10`}>
              {blk.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={blk.image}
                  alt={blk.heading ?? ""}
                  className={`w-full rounded-[2rem] shadow-sm ${blk.align === "right" ? "md:order-2" : ""}`}
                />
              )}
              <div className={`text-center ${blk.align === "right" ? "md:order-1" : ""}`}>
                {blk.heading && <h2 className="text-xl font-extrabold text-amber-950 md:text-2xl">{blk.heading}</h2>}
                {blk.body && (
                  <p className="mx-auto mt-3 max-w-lg whitespace-pre-line text-sm leading-relaxed text-stone-600">{blk.body}</p>
                )}
                {blk.btnLabel && (
                  <Link
                    href={blk.btnHref || "/products"}
                    className="mt-5 inline-block rounded-full bg-amber-400 px-7 py-3 text-sm font-bold text-white shadow transition hover:scale-105 hover:bg-amber-500"
                  >
                    {blk.btnLabel}
                  </Link>
                )}
              </div>
            </div>
          </section>
        );

      case "gallery":
        if (!blk.images?.length) return null;
        return (
          <section key={blk.id} className="mt-12">
            <HomeGallery
              heading={blk.heading}
              images={blk.images}
              cols={blk.cols ?? 3}
              display={blk.display ?? "grid"}
              fit={blk.fit ?? "cover"}
              ratio={blk.ratio ?? "16/12"}
            />
          </section>
        );

      case "video": {
        const src = videoEmbedUrl(blk.videoUrl);
        if (!src) return null;
        return (
          <section key={blk.id} className="mt-12">
            {blk.heading && (
              <h2 className="mb-5 text-center text-xl font-extrabold text-amber-950 md:text-2xl">{blk.heading}</h2>
            )}
            <div className="overflow-hidden rounded-[2rem] bg-black shadow-[0_10px_40px_rgba(63,161,182,0.18)]">
              <iframe
                src={src}
                title={blk.heading || "วิดีโอ"}
                className="aspect-video w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </section>
        );
      }

      case "cards": {
        const cards = (blk.cards ?? []).filter((c) => c.title || c.image);
        if (!cards.length) return null;
        const colCls = cards.length === 2 ? "md:grid-cols-2" : cards.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3";
        return (
          <section key={blk.id} className="mt-12">
            {blk.heading && (
              <h2 className="mb-5 text-center text-xl font-extrabold text-amber-950 md:text-2xl">{blk.heading}</h2>
            )}
            <div className={`grid gap-4 sm:grid-cols-2 ${colCls}`}>
              {cards.map((c, i) => (
                <div key={i} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-amber-100">
                  {c.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt={c.title} className="aspect-[16/11] w-full object-cover" />
                  )}
                  <div className="flex flex-1 flex-col p-4 text-center">
                    {c.title && <h3 className="text-sm font-bold text-stone-800">{c.title}</h3>}
                    {c.body && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-stone-500">{c.body}</p>}
                    {c.btnLabel && (
                      <Link
                        href={c.btnHref || "/products"}
                        className="mx-auto mt-auto inline-block pt-3"
                      >
                        <span className="inline-block rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-white shadow transition hover:scale-105 hover:bg-amber-500">
                          {c.btnLabel}
                        </span>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      }

      case "html":
        if (!blk.html) return null;
        return (
          <section
            key={blk.id}
            className="mt-12 overflow-x-auto"
            // โค้ดผ่านการกรองฝั่งเซิร์ฟเวอร์ตอนบันทึกแล้ว (ตัด script/on*)
            dangerouslySetInnerHTML={{ __html: blk.html }}
          />
        );

      case "text":
        if (!blk.heading && !blk.body) return null;
        return (
          <section key={blk.id} className="mt-12 text-center">
            {blk.heading && <h2 className="text-xl font-extrabold text-amber-950 md:text-2xl">{blk.heading}</h2>}
            {blk.body && (
              <p className="mx-auto mt-2 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-stone-600">
                {blk.body}
              </p>
            )}
          </section>
        );

      case "cta":
        return (
          <section
            key={blk.id}
            className="mt-14 rounded-[2rem] bg-gradient-to-r from-pink-200 via-rose-100 to-amber-100 p-8 text-center md:p-12"
          >
            <span className="text-4xl">🎁</span>
            <h2 className="mt-3 text-2xl font-extrabold text-stone-800">
              {blk.heading || "มีลายในใจแล้วใช่ไหม? มาเริ่มกันเลย!"}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm text-stone-600">
              {blk.body || "เลือกสินค้าที่ชอบ แล้วอัปโหลดลายของคุณ เดี๋ยวเราจัดการที่เหลือให้เอง"}
            </p>
            <Link
              href={blk.btnHref || "/products"}
              className="mt-5 inline-block rounded-full bg-rose-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:bg-rose-600"
            >
              {blk.btnLabel || "เริ่มออกแบบสินค้าของฉัน →"}
            </Link>
          </section>
        );
    }
  }

  return <div className="mx-auto max-w-6xl px-4">{blocks.map(renderBlock)}</div>;
}
