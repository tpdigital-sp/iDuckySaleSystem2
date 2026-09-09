"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CATEGORIES, fetchCategories, type ShopCategory } from "@/lib/categories";
import { cachedProductsLite, fetchProductsLite } from "@/lib/product-repo";
import { productPath, type Product } from "@/lib/products";
import { fallbackToOriginal, imgProps } from "@/lib/img";
import { accentOf, CAT_ICON, groupOf, TAB_GROUPS } from "@/lib/cat-groups";
import Portal from "@/components/Portal";
import PreviewTip, { tipPositionFor, type TipState } from "@/components/PreviewTip";
import { startPriceLabel } from "@/lib/site-search";

/* eslint-disable @next/next/no-img-element */

/**
 * ชิป "สินค้าและบริการ" แถวล่างของแถบเมนู — ดรอปดาวน์เมกะเมนูตามต้นแบบ LADNDING PAGE.html
 *
 * เดสก์ท็อป (>1000px + มีเมาส์): ชี้ค้างเพื่อเปิดแผง (คลิก = ไปโซนหมวดบนหน้าแรก) — แผงกางเต็มความกว้างแถบเมนู
 *   แท็บ "ทั้งหมด" (ค่าเริ่มต้น) กางทุกหมวดพร้อมกัน · อีก 4 แท็บกรองเฉพาะกลุ่ม (ชี้ก็สลับ)
 *   ชี้รายการสินค้าย่อย = การ์ดพรีวิวลอยข้างๆ (รูป + ชื่อ + ราคาเริ่มต้น) · เปิดแผงแล้วมีม่านเบลอฉากหลัง (.nav-scrim)
 *   ระหว่างที่ dropdown ค้นหาบนแถบเมนูเปิดอยู่ ห้ามเปิดจากการชี้ผ่าน (เมาส์ที่กวาดลงหาผลลัพธ์ต้องผ่านชิปนี้พอดี)
 * มือถือ/แท็บเล็ต: CSS ซ่อนชิปนี้ — หมวดทั้งหมดอยู่ในเมนู ☰ (MobileNav) แทน
 *
 * เนื้อหาเป็นของจริงทั้งหมด (ไม่พิมพ์ตายตัวแบบไฟล์ต้นแบบ):
 * หมวดจากหลังบ้าน + สินค้า 5 ตัวแรกของแต่ละหมวด พร้อมป้าย ใหม่/ฮิต จากป้ายสินค้า
 * — โหลดข้อมูลตอนเปิดเมนูครั้งแรกเท่านั้น (ชุดเดียวกับหน้ารายการสินค้า จึงใช้คำขอร่วมกันได้)
 */

/** เดสก์ท็อปที่ hover ได้จริง — จุดเดียวกับ breakpoint ที่เมนูสลับเป็นปุ่ม ☰ */
const desktop = () => window.matchMedia("(hover:hover) and (min-width:1001px)").matches;

/** แท็บ "ทั้งหมด" — กางทุกหมวดพร้อมกัน (ชุดเดียวกับแท็บกรองหมวดบนหน้าแรก) */
const ALL = "all";

/** ชื่อหมวดใน DB เป็น "Keychain & Acrylic — พวงกุญแจ / งานอะคริลิค" → แยกเป็นบรรทัดหลัก (EN) + บรรทัดรอง (ไทย) ให้อ่านง่ายและไม่ล้นคอลัมน์ · ขีด — / – ตัดได้แม้ไม่มีช่องว่าง ("Banners— โปสเตอร์") ส่วนขีด - ต้องมีช่องว่างสองข้าง (กัน Die-Cut) */
function catNameParts(name: string): string[] {
  const parts = name.split(/\s*[—–]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [name];
}

export default function NavCatMenu({ label, href }: { label: string; href: string }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string>(ALL);
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  const [products, setProducts] = useState<Product[]>(() => cachedProductsLite() ?? []);
  const asked = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // โหลดหมวดจริง + สินค้า ครั้งเดียวตอนเปิดเมนูครั้งแรก (ไม่ถ่วงหน้าอื่นทั้งเว็บ)
  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    void fetchCategories().then((list) => setCats(list.filter((c) => !c.hidden)));
    void fetchProductsLite().then((ps) => setProducts(ps.filter((p) => !p.hidden)));
  }, [open]);

  // ปิดเมื่อคลิกนอกแผง / กด Esc / ช่องค้นหาบนแถบเมนูถูกเปิด
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (t && rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onSearch = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("id-search-open", onSearch);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("id-search-open", onSearch);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // หน่วงปิดตอนเมาส์ออก — เผื่อลากผ่านช่องว่างระหว่างปุ่มกับแผง (ตามต้นแบบ 260ms)
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 260);
  };
  const go = () => setOpen(false);

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

  /* ---------- การ์ดพรีวิวลอย ---------- */
  const [tip, setTip] = useState<TipState | null>(null);
  const showTip = (p: Product) => (e: React.MouseEvent | React.FocusEvent) => {
    if (!desktop()) return;
    setTip({ name: p.name, price: startPriceLabel(p), img: p.imageSrc || "", emoji: p.emoji, ...tipPositionFor(e.currentTarget as HTMLElement) });
  };
  const hideTip = () => setTip(null);
  useEffect(() => {
    if (!open) hideTip();
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`nav-drop nav-cat-block${open ? " open" : ""}`}
      onMouseEnter={() => {
        if (desktop() && !document.body.classList.contains("search-open")) openNow();
      }}
      onMouseLeave={() => {
        if (desktop()) {
          scheduleClose();
          hideTip();
        }
      }}
    >
      <Link
        href={href}
        className="nav-drop-trigger nav-cat-btn"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          if (desktop()) return go(); // เดสก์ท็อป: คลิก = ไปโซนหมวดตามเดิม (hover เป็นคนเปิดแผง)
          // จอสัมผัส: แตะครั้งแรกกางหมวดก่อน แตะซ้ำถึงไปหน้าโซนหมวด
          if (!open) {
            e.preventDefault();
            openNow();
          } else go();
        }}
      >
        <span className="nav-cat-grid" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        {label}
        <span className="caret">▾</span>
      </Link>

      <div className="nav-drop-panel">
        <div className="nav-mega-layout">
          {/* แถบบน: แท็บกลุ่มหมวด ("ทั้งหมด" + 4 กลุ่ม ชุดเดียวกับแท็บกรองบนหน้าแรก) */}
          <div className="nav-mega-topbar">
            <div className="nav-mega-tabs">
              <button
                type="button"
                className={`nav-mega-tab${group === ALL ? " active" : ""}`}
                data-group={ALL}
                onClick={(e) => {
                  e.stopPropagation();
                  setGroup(ALL);
                }}
                onMouseEnter={() => {
                  if (desktop()) setGroup(ALL);
                }}
              >
                ทั้งหมด
              </button>
              {TAB_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`nav-mega-tab${group === g.id ? " active" : ""}`}
                  data-group={g.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGroup(g.id);
                  }}
                  onMouseEnter={() => {
                    if (desktop()) setGroup(g.id);
                  }}
                >
                  <span className="emoji">{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="nav-mega-cols" data-active={group} onScroll={hideTip}>
            {cats.map((c, i) => {
              const items = byCat.get(c.id) ?? [];
              const catHref = `/products?category=${c.id}`;
              return (
                <div key={c.id} className="nav-mega-col" data-cat={c.id} data-group={groupOf(c.id)} style={{ "--accent": accentOf(c.id, i) } as React.CSSProperties}>
                  <Link className="nav-mega-thumb" href={catHref} onClick={go} aria-label={c.name}>
                    {c.image ? (
                      <img {...imgProps(c.image, "80px", 160)} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={fallbackToOriginal(c.image)} />
                    ) : CAT_ICON[c.id] ? (
                      <img src={CAT_ICON[c.id]} alt="" aria-hidden="true" loading="lazy" />
                    ) : (
                      <span className="nav-mega-emoji" aria-hidden="true">{c.emoji}</span>
                    )}
                  </Link>
                  <Link className="nav-mega-label" href={catHref} onClick={go}>
                    {catNameParts(c.name).map((part, k) => (
                      <span key={k} className={k === 0 ? undefined : "nav-mega-label-sub"}>{part}</span>
                    ))}
                  </Link>
                  {items.length > 0 && (
                    <ul>
                      {items.map((p) => (
                        <li key={p.id}>
                          <Link href={productPath(p)} onClick={go} onMouseEnter={showTip(p)} onMouseLeave={hideTip} onFocus={showTip(p)} onBlur={hideTip}>
                            {p.name}
                            {p.badge === "ใหม่" && <span className="nav-tag-new">ใหม่</span>}
                            {p.badge === "ขายดี" && <span className="nav-tag-hot">ฮิต</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="nav-mega-foot">
            <Link href="/products" onClick={go}>
              ดูสินค้าทั้งหมด <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ม่านเบลอฉากหลังตอนแผงเปิด — แขวนที่ body (แถบเมนูมี backdrop-filter จะกัก position:fixed ไว้) */}
      <Portal>
        <div className="dl dl-contents">
          <div className={`nav-scrim${open ? " show" : ""}`} aria-hidden="true" />
        </div>
      </Portal>
      <PreviewTip tip={tip} />
    </div>
  );
}
