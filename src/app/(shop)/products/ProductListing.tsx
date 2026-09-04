"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type CategoryId, type Product } from "@/lib/products";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import { cachedProductsLite, fetchProductsLite } from "@/lib/product-repo";
import ShopProductCard from "@/components/ShopProductCard";
import CardSkeleton from "@/components/CardSkeleton";

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
  // คำค้นเริ่มต้นจาก ?q= (ช่องค้นหาไวๆ ในเมกะเมนู "สินค้าและบริการ" ส่งมาแบบนี้)
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    fetchCategories().then((list) => setCats(list.filter((c) => !c.hidden)));
  }, []);
  const [sort, setSort] = useState<SortKey>(
    (params.get("sort") as SortKey | null) ?? "popular"
  );

  /**
   * โหลดสินค้า (Supabase หรือ localStorage) หลัง mount
   * ตั้งต้นจากแคชของแท็บถ้าเคยโหลดแล้ว · ยังไม่เคยโหลด = null แล้วโชว์โครงการ์ดรอ
   * (เดิมตั้งต้นด้วย PRODUCTS ซึ่งเป็นสินค้าชุดเก่าในโค้ด ทำให้เห็นของเก่าแวบหนึ่งทุกครั้งที่เปิดหน้า)
   */
  const [all, setAll] = useState<Product[] | null>(() => cachedProductsLite());
  const loading = all === null;
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
    let list = (all ?? []).filter((p) => !p.hidden);
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
   * ดูรวมทุกหมวด (ไม่ได้เลือกหมวด/ไม่ได้ค้นหา) = ซอยเป็นช่วง ๆ ตามหมวด
   * เลือกหมวดหรือพิมพ์ค้นหาเมื่อไหร่ = กลับเป็นกริดเรียงยาวเหมือนเดิม (ผลลัพธ์ชุดเดียวไม่ต้องซอย)
   */
  const grouped = category === "all" && !search.trim();

  /** สินค้าในแต่ละหมวด เรียงตามลำดับหมวดที่ตั้งไว้หลังบ้าน · หมวดที่ไม่มีของถูกข้าม */
  const groups = useMemo(() => {
    if (!grouped) return [];
    const byCat = new Map<string, Product[]>();
    for (const p of filtered) {
      const list = byCat.get(p.category);
      if (list) list.push(p);
      else byCat.set(p.category, [p]);
    }
    const out = cats
      .filter((c) => byCat.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, desc: c.description, items: byCat.get(c.id)! }));
    // สินค้าที่หมวดถูกลบ/ซ่อนไปแล้ว ยังต้องหาเจอ — รวมไว้ท้ายสุด
    const known = new Set(cats.map((c) => c.id));
    const rest = filtered.filter((p) => !known.has(p.category));
    if (rest.length) out.push({ id: "", name: "อื่น ๆ", emoji: "✨", desc: "", items: rest });
    return out;
  }, [grouped, filtered, cats]);

  /** จำนวนสินค้าที่ขายจริงในแต่ละหมวด — ใช้ทั้งในชิปสารบัญและหัวหมวด */
  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of all ?? []) if (!p.hidden) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [all]);

  /**
   * ทยอยวาดการ์ดทีละชุด — เดิมวาดทั้ง 400 ใบพร้อมกัน (DOM ~4,500 ชิ้น) มือถือกระตุกตั้งแต่เปิดหน้า
   * เลื่อนถึงท้ายลิสต์แล้วค่อยเติมชุดถัดไปให้เอง (ไม่ต้องกดปุ่ม · ของครบเหมือนเดิม)
   * แบบซอยหมวดนับเป็น "จำนวนหมวด" ที่วาดแล้ว · แบบกริดเรียบนับเป็น "จำนวนใบ"
   */
  const PAGE = 48;
  const CAT_PAGE = 3;
  const step = grouped ? CAT_PAGE : PAGE;
  const total = grouped ? groups.length : filtered.length;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(grouped ? CAT_PAGE : PAGE), [category, search, sort, grouped]);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown >= total) return;
    // วัดตำแหน่งตอนเลื่อนเอง — ไม่ใช้ IntersectionObserver (เคยเจอว่ามันไม่ยิงเมื่อแท็บไม่ได้อยู่หน้าสุด)
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = sentinel.current;
      if (!el) return;
      // เหลืออีกไม่ถึง 1 จอก็เติมชุดถัดไปเลย จะได้ไม่เห็นรอยต่อ
      if (el.getBoundingClientRect().top < window.innerHeight + 600) setShown((n) => n + step);
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
  }, [shown, total, step]);
  /**
   * เติมหมวดที่เหลือให้เองตอนเบราว์เซอร์ว่าง — สุดท้ายได้เห็นครบทุกชิ้นโดยไม่ต้องกดอะไร
   * (ยังทยอยเติมทีละชุด ไม่วาด 200+ ใบพร้อมกัน เพราะมือถือจะกระตุกตั้งแต่เปิดหน้า)
   */
  useEffect(() => {
    if (!grouped || shown >= groups.length) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const run = () => setShown((n) => (n >= groups.length ? n : n + CAT_PAGE));
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 1200 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(run, 500);
    return () => clearTimeout(id);
  }, [grouped, shown, groups.length]);

  /**
   * จอเล็กมีหมวดเยอะ ชิปตัดบรรทัดจนกลายเป็นกำแพงสูงกว่าจอ — จำกัดความสูงไว้ก่อน แล้วให้กดกางเอง
   * (เดสก์ท็อปไม่ถูกจำกัด จึงวัดได้ว่าไม่ล้น ปุ่มกางจะไม่โผล่)
   */
  const catsRef = useRef<HTMLDivElement>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [catsOverflow, setCatsOverflow] = useState(false);
  useEffect(() => {
    const el = catsRef.current;
    if (!el) return;
    const measure = () => {
      if (!catsOpen) setCatsOverflow(el.scrollHeight > el.clientHeight + 4);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [catsOpen, cats.length, loading]);

  /** เลื่อนไปหัวหมวด โดยเว้นที่ให้แถบเมนูที่ลอยอยู่ด้านบน */
  const scrollToCat = (id: string) => {
    const el = document.getElementById(`pcat-${id}`);
    if (!el) return false;
    const navH = document.querySelector("header.nav")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - navH - 14, behavior: "smooth" });
    return true;
  };

  /** หมวดที่กดค้างไว้รอวาดเสร็จก่อนค่อยเลื่อนไป */
  const pendingJump = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingJump.current;
    if (id !== null && scrollToCat(id)) pendingJump.current = null;
  }, [shown, groups.length]);

  /** หมวดที่กำลังอ่านอยู่ตอนนี้ — ใช้ไฮไลต์ชิปสารบัญ (โหมดดูทุกหมวดเท่านั้น) */
  const [activeCat, setActiveCat] = useState("");
  useEffect(() => {
    if (!grouped) {
      setActiveCat("");
      return;
    }
    let raf = 0;
    const check = () => {
      raf = 0;
      const navH = document.querySelector("header.nav")?.getBoundingClientRect().height ?? 0;
      let cur = "";
      for (const g of groups) {
        const el = document.getElementById(`pcat-${g.id}`);
        if (!el) break;
        if (el.getBoundingClientRect().top - navH - 40 > 0) break;
        cur = g.id;
      }
      setActiveCat(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [grouped, groups]);

  const visible = useMemo(() => filtered.slice(0, shown), [filtered, shown]);

  function selectCategory(id: string) {
    router.replace(id === "all" ? "/products" : `/products?category=${id}`, {
      scroll: false,
    });
  }

  /**
   * กดชิปหมวดบนแถบสารบัญ
   * — โหมดดูทุกหมวด: ของทุกหมวดอยู่บนหน้านี้อยู่แล้ว จึงเลื่อนไปหาแทนการกรองทิ้งหมวดอื่น
   *   (หมวดที่ยังไม่ถูกวาดจะสั่งวาดให้ถึงก่อน แล้วค่อยเลื่อน)
   * — โหมดกรอง (เลือกหมวด/ค้นหาอยู่): ทำงานแบบเดิมคือเปลี่ยนหมวดที่กรอง
   */
  function pickCategory(id: string) {
    if (!grouped || id === "all") return selectCategory(id);
    const idx = groups.findIndex((g) => g.id === id);
    if (idx < 0) return selectCategory(id);
    if (scrollToCat(id)) return;
    pendingJump.current = id;
    setShown((n) => Math.max(n, idx + 1));
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
            <span className={`plist-count${loading ? " sk-count" : ""}`}>
              {loading ? (
                "กำลังโหลดสินค้า…"
              ) : (
                <>
                  พบ <b>{filtered.length.toLocaleString("th-TH")}</b> รายการ
                  {grouped && groups.length > 0 && <> · {groups.length.toLocaleString("th-TH")} หมวด</>}
                </>
              )}
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
          <div
            ref={catsRef}
            className={`plist-cats${catsOpen ? "" : " is-clamped"}`}
            role="navigation"
            aria-label="หมวดสินค้า"
          >
            <button
              type="button"
              onClick={() => selectCategory("all")}
              className={`plist-cat${(grouped ? activeCat === "" : category === "all") ? " on" : ""}`}
            >
              <em>✨</em> ทั้งหมด
              {!loading && <i className="plist-n">{filtered.length.toLocaleString("th-TH")}</i>}
            </button>
            {cats
              .filter((c) => (countByCat.get(c.id) ?? 0) > 0)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCategory(c.id)}
                  className={`plist-cat${(grouped ? activeCat === c.id : category === c.id) ? " on" : ""}`}
                >
                  <em>{c.emoji}</em> {catShort(c.name)}
                  <i className="plist-n">{(countByCat.get(c.id) ?? 0).toLocaleString("th-TH")}</i>
                </button>
              ))}
          </div>
          {catsOverflow && (
            <div className="plist-cats-more">
              <button type="button" className="plist-cats-toggle" onClick={() => setCatsOpen((v) => !v)} aria-expanded={catsOpen}>
                {catsOpen ? "ย่อรายชื่อหมวด ▴" : `ดูหมวดทั้งหมด (${cats.filter((c) => (countByCat.get(c.id) ?? 0) > 0).length}) ▾`}
              </button>
            </div>
          )}

          {/* ผลลัพธ์ */}
          {loading ? (
            <div className="plist-grid">
              {Array.from({ length: 12 }, (_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="plist-empty">
              <span>🐥</span>
              <h2>ไม่พบสินค้าที่ค้นหา</h2>
              <p>ลองเปลี่ยนคำค้นหรือเลือกหมวดอื่นดูนะ</p>
            </div>
          ) : (
            <>
              {grouped ? (
                groups.slice(0, shown).map((g) => (
                  <section key={g.id || "__etc__"} id={`pcat-${g.id}`} className="pcat">
                    <div className="head pcat-head">
                      <span className="kicker pcat-kicker">
                        <i className="pcat-emo">{g.emoji}</i>
                        {g.items.length.toLocaleString("th-TH")} รายการในหมวดนี้
                      </span>
                      <h2>{catTitle(g.name)}</h2>
                      {g.desc && <p>{g.desc}</p>}
                    </div>
                    <div className="plist-grid">
                      {g.items.map((p) => (
                        <ShopProductCard key={p.id} product={p} />
                      ))}
                    </div>
                    {g.id && (
                      <div className="rv-more">
                        <Link className="rv-viewall" href={`/products?category=${g.id}`}>
                          ดูเฉพาะหมวดนี้ <span>→</span>
                        </Link>
                      </div>
                    )}
                  </section>
                ))
              ) : (
                <div className="plist-grid">
                  {visible.map((p) => (
                    <ShopProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
              {shown < total && (
                <div ref={sentinel} className="plist-more">
                  <button type="button" onClick={() => setShown((n) => n + step)} className="btn btn-ghost">
                    {grouped
                      ? `แสดงหมวดถัดไป (อีก ${(total - shown).toLocaleString("th-TH")} หมวด)`
                      : `แสดงเพิ่ม (${(total - shown).toLocaleString("th-TH")} รายการ)`}{" "}
                    <span className="dot">↓</span>
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

/**
 * ชื่อหมวดที่ตั้งไว้เป็น "English — ไทย" → ครึ่งหลังใส่ <em> ให้เป็นสีเหลืองเน้น
 * (รูปแบบเดียวกับหัวข้อหน้าแรก เช่น "สินค้าและบริการของเรา")
 */
function catTitle(name: string) {
  const i = name.indexOf("—");
  if (i < 0) return name;
  return (
    <>
      {name.slice(0, i).trim()} <em>{name.slice(i + 1).trim()}</em>
    </>
  );
}

/** ชื่อหมวดแบบสั้นสำหรับชิป — เอาเฉพาะครึ่งไทยหลังขีด ชิปจะได้ไม่ยาวจนล้นแถว */
function catShort(name: string) {
  const i = name.indexOf("—");
  return i < 0 ? name : name.slice(i + 1).trim() || name;
}
