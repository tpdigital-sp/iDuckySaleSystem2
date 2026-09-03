"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CATEGORIES, fetchCategories, type ShopCategory } from "@/lib/categories";
import { fetchProductNamesLite } from "@/lib/product-repo";
import { productPath, type Product } from "@/lib/products";
import { fallbackToOriginal, imgProps } from "@/lib/img";
import { accentOf, CAT_ICON, groupOf, TAB_GROUPS } from "@/lib/cat-groups";

/* eslint-disable @next/next/no-img-element */

/**
 * เมนู "สินค้าและบริการ" บนแถบเมนู — ดรอปดาวน์เมกะเมนูตามต้นแบบ MEGAMENU_01
 *
 * จอใหญ่ (>1000px + มีเมาส์): ชี้ค้างเพื่อเปิดแผง · แท็บ 4 กลุ่มสลับชุดหมวด (ชี้ก็สลับ)
 *   คลิกที่ตัวเมนู = ไปโซนหมวดบนหน้าแรกตามเดิม
 * มือถือ: อยู่ในเมนู ☰ — แตะครั้งแรกกางหมวดก่อน แตะซ้ำถึงไปหน้าโซนหมวด
 *
 * เนื้อหาเป็นของจริงทั้งหมด (ไม่พิมพ์ตายตัวแบบไฟล์ต้นแบบ):
 * หมวดจากหลังบ้าน + สินค้า 5 ตัวแรกของแต่ละหมวด พร้อมป้าย ใหม่/ฮิต จากป้ายสินค้า
 * — โหลดข้อมูลตอนเปิดเมนูครั้งแรกเท่านั้น ระหว่างนั้นใช้ snapshot หมวดในโค้ดไปก่อน
 */

/** เดสก์ท็อปที่ hover ได้จริง — จุดเดียวกับ breakpoint ที่เมนูสลับเป็นปุ่ม ☰ */
const desktop = () => window.matchMedia("(hover:hover) and (min-width:1001px)").matches;

export default function NavCatMenu({
  label,
  href,
  onNavigate,
}: {
  label: string;
  href: string;
  /** ปิดเมนู ☰ บนมือถือหลังเลือกลิงก์ */
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(TAB_GROUPS[0].id);
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  const [products, setProducts] = useState<Product[]>([]);
  const asked = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * กันแผงล้นขอบจอบนเดสก์ท็อปแคบ (เช่น 1024px ปุ่มอยู่ค่อนซ้าย แผง 800px จะโผล่พ้นจอ)
   * — คำนวณระยะขยับแล้วส่งผ่านตัวแปร --drop-shift ให้ CSS (ลูกศรขยับสวนทางใน CSS เอง)
   * เรียกซ้ำทุกครั้งที่เปิด (openNow) เผื่อจอถูกย่อ/ขยายระหว่างที่เมนูยังเปิดค้างจากรอบก่อน
   */
  const fixShift = () => {
    const el = panelRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const vw = window.innerWidth;
    if (vw <= 1000) {
      el.style.removeProperty("--drop-shift"); // มือถือ: แผงเป็นบล็อกในเมนู ไม่ต้องขยับ
      return;
    }
    const w = Math.min(800, vw * 0.92);
    const r = root.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const pad = 12;
    let shift = 0;
    if (center - w / 2 < pad) shift = pad - (center - w / 2);
    else if (center + w / 2 > vw - pad) shift = vw - pad - (center + w / 2);
    el.style.setProperty("--drop-shift", `${Math.round(shift)}px`);
  };
  useEffect(() => {
    if (!open) return;
    fixShift();
    window.addEventListener("resize", fixShift);
    return () => window.removeEventListener("resize", fixShift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // โหลดหมวดจริง + รายชื่อสินค้า ครั้งเดียวตอนเปิดเมนูครั้งแรก (ไม่ถ่วงหน้าอื่นทั้งเว็บ)
  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    void fetchCategories().then((list) => setCats(list.filter((c) => !c.hidden)));
    void fetchProductNamesLite().then((ps) => setProducts(ps.filter((p) => !p.hidden)));
  }, [open]);

  // ปิดเมื่อคลิกนอกแผง / กด Esc
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
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    fixShift();
  };
  // หน่วงปิดตอนเมาส์ออก — เผื่อลากผ่านช่องว่างระหว่างปุ่มกับแผง (ตามต้นแบบ 260ms)
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 260);
  };
  const go = () => {
    setOpen(false);
    onNavigate?.();
  };

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

  return (
    <div
      ref={rootRef}
      className={`nav-drop${open ? " open" : ""}`}
      onMouseEnter={() => {
        if (desktop()) openNow();
      }}
      onMouseLeave={() => {
        if (desktop()) scheduleClose();
      }}
    >
      <Link
        href={href}
        className="nav-drop-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          if (desktop()) return go(); // เดสก์ท็อป: คลิก = ไปโซนหมวดตามเดิม (hover เป็นคนเปิดแผง)
          if (!open) {
            // มือถือ: แตะครั้งแรกกางหมวดก่อน — กัน .menu ปิดตัวเองด้วย (มันปิดเมื่อคลิก <a>)
            e.preventDefault();
            e.stopPropagation();
            openNow();
          } else {
            go();
          }
        }}
      >
        {label} <span className="caret">▾</span>
      </Link>

      <div className="nav-drop-panel" ref={panelRef}>
        <div className="nav-mega-layout">
          {/* แท็บกลุ่มหมวด — แคปซูลพาสเทล ชุดเดียวกับแท็บกรองบนหน้าแรก */}
          <div className="nav-mega-tabs">
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

          <div className="nav-mega-cols" data-active={group}>
            {cats.map((c, i) => {
              const items = byCat.get(c.id) ?? [];
              const catHref = `/products?category=${c.id}`;
              return (
                <div
                  key={c.id}
                  className="nav-mega-col"
                  data-group={groupOf(c.id)}
                  style={{ "--accent": accentOf(c.id, i) } as React.CSSProperties}
                >
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
                    {c.name}
                  </Link>
                  {items.length > 0 && (
                    <ul>
                      {items.map((p) => (
                        <li key={p.id}>
                          <Link href={productPath(p)} onClick={go}>
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
            <span>
              ครบกว่า <b>{cats.length} หมวดหมู่</b> งานพิมพ์ตามสั่ง
            </span>
            <Link href="/products" onClick={go}>
              ดูสินค้าทั้งหมด <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
