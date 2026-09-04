"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CATEGORIES, fetchCategories, type ShopCategory } from "@/lib/categories";
import { cachedProductsLite, fetchProductsLite } from "@/lib/product-repo";
import { formatPrice, priceRange, productPath, type Product } from "@/lib/products";
import { fallbackToOriginal, imgProps } from "@/lib/img";
import { accentOf, CAT_ICON, groupOf, TAB_GROUPS } from "@/lib/cat-groups";
import Portal from "@/components/Portal";

/* eslint-disable @next/next/no-img-element */

/**
 * เมนู "สินค้าและบริการ" บนแถบเมนู — ดรอปดาวน์เมกะเมนูตามต้นแบบ MEGAMENU_02
 *
 * จอใหญ่ (>1000px + มีเมาส์): ชี้ค้างเพื่อเปิดแผง — แผงกางเต็มความกว้างแถบเมนู
 *   แท็บ "ทั้งหมด" (ค่าเริ่มต้น) กางทุกหมวดพร้อมกัน · อีก 4 แท็บกรองเฉพาะกลุ่ม (ชี้ก็สลับ)
 *   ชี้รายการสินค้าย่อย = การ์ดพรีวิวลอยข้างๆ (รูป + ชื่อ + ราคาเริ่มต้น)
 *   ท้ายแผงมีช่องค้นหาสินค้าไวๆ (พิมพ์แล้วมีตัวเลือกโผล่ · ↑↓ Enter Esc)
 *   คลิกที่ตัวเมนู = ไปโซนหมวดบนหน้าแรกตามเดิม
 * มือถือ: อยู่ในเมนู ☰ — แตะครั้งแรกกางหมวดก่อน แตะซ้ำถึงไปหน้าโซนหมวด
 *
 * เนื้อหาเป็นของจริงทั้งหมด (ไม่พิมพ์ตายตัวแบบไฟล์ต้นแบบ):
 * หมวดจากหลังบ้าน + สินค้า 5 ตัวแรกของแต่ละหมวด พร้อมป้าย ใหม่/ฮิต จากป้ายสินค้า
 * — โหลดข้อมูลตอนเปิดเมนูครั้งแรกเท่านั้น (ชุดเดียวกับหน้ารายการสินค้า จึงใช้คำขอร่วมกันได้)
 */

/** เดสก์ท็อปที่ hover ได้จริง — จุดเดียวกับ breakpoint ที่เมนูสลับเป็นปุ่ม ☰ */
const desktop = () => window.matchMedia("(hover:hover) and (min-width:1001px)").matches;

/** แท็บ "ทั้งหมด" — กางทุกหมวดพร้อมกัน (ชุดเดียวกับแท็บกรองหมวดบนหน้าแรก) */
const ALL = "all";

/** ราคาเริ่มต้นของสินค้าแบบสั้น ๆ พอใส่การ์ดพรีวิว 172px — ไม่มีราคา (งานขอใบเสนอ) = ไม่โชว์ */
function startPrice(p: Product): string {
  const { min, max } = priceRange(p);
  if (!(min > 0)) return "";
  return max > min ? `เริ่มต้น ${formatPrice(min)}` : formatPrice(min);
}

/** ขนาดการ์ดพรีวิว (ตรงกับ .nav-mega-tip ใน landing.css) — ใช้คำนวณตำแหน่งก่อนการ์ดถูกวาด */
const TIP_W = 172;
const TIP_H = 210;
const TIP_GAP = 14;

type TipState = { p: Product; left: number; top: number; flip: boolean };

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string>(ALL);
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  const [products, setProducts] = useState<Product[]>(() => cachedProductsLite() ?? []);
  const asked = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const trigRef = useRef<HTMLAnchorElement>(null);

  /**
   * ลูกศรชี้ปุ่ม "สินค้าและบริการ" — แผงกางเต็มความกว้างแถบเมนูแล้ว (left:14px right:14px)
   * จัดกึ่งกลางแผงเฉย ๆ จะชี้ผิดจุด ต้องวัดตำแหน่งปุ่มเทียบขอบซ้ายแผงส่งให้ CSS ผ่าน --arrow-left
   * เรียกซ้ำทุกครั้งที่เปิด/ย่อขยายจอ
   *
   * ⚠️ วัดแผงด้วย offsetLeft/offsetWidth ไม่ใช่ getBoundingClientRect — ตอนถูกเรียกแผงยังวิ่ง
   * transition อยู่ (scale .98) rect จึงเป็นขนาดย่อ ทำให้ลูกศรเพี้ยนไปสิบกว่าพิกเซล
   */
  const positionArrow = () => {
    const panel = panelRef.current;
    const trig = trigRef.current;
    if (!panel || !trig || !desktop()) return;
    const host = panel.offsetParent as HTMLElement | null;
    if (!host) return;
    const panelLeft = host.getBoundingClientRect().left + host.clientLeft + panel.offsetLeft;
    const panelW = panel.offsetWidth;
    const tr = trig.getBoundingClientRect();
    const x = Math.max(24, Math.min(tr.left + tr.width / 2 - panelLeft, panelW - 24));
    panel.style.setProperty("--arrow-left", `${Math.round(x)}px`);
  };
  useEffect(() => {
    if (!open) return;
    positionArrow();
    window.addEventListener("resize", positionArrow);
    return () => window.removeEventListener("resize", positionArrow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // โหลดหมวดจริง + สินค้า ครั้งเดียวตอนเปิดเมนูครั้งแรก (ไม่ถ่วงหน้าอื่นทั้งเว็บ)
  // ใช้ fetchProductsLite ชุดเดียวกับหน้ารายการสินค้า — ได้รูป+ช่วงราคามาทำการ์ดพรีวิวและช่องค้นหา
  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    void fetchCategories().then((list) => setCats(list.filter((c) => !c.hidden)));
    void fetchProductsLite().then((ps) => setProducts(ps.filter((p) => !p.hidden)));
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
    positionArrow();
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

  /* ---------- การ์ดพรีวิวลอย ---------- */
  const [tip, setTip] = useState<TipState | null>(null);
  const showTip = (p: Product) => (e: React.MouseEvent | React.FocusEvent) => {
    if (!desktop()) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // ไม่มีที่ทางฝั่งขวาพอ = พลิกไปโผล่ฝั่งซ้ายของรายการแทน
    const flip = window.innerWidth - r.right < TIP_W + TIP_GAP + 16;
    const left = flip ? r.left - TIP_GAP - TIP_W : r.right + TIP_GAP;
    const top = Math.min(
      Math.max(r.top + r.height / 2, TIP_H / 2 + 10),
      window.innerHeight - TIP_H / 2 - 10
    );
    setTip({ p, left, top, flip });
  };
  const hideTip = () => setTip(null);
  // เลื่อนคอลัมน์ในแผง (แท็บ "ทั้งหมด" มีสกรอลล์) แล้วการ์ดจะค้างผิดตำแหน่ง — ซ่อนไปเลย
  useEffect(() => {
    if (!open) hideTip();
  }, [open]);

  /* ---------- ช่องค้นหาสินค้าไวๆ ท้ายแผง ---------- */
  const [q, setQ] = useState("");
  const [srOpen, setSrOpen] = useState(false);
  const [active, setActive] = useState(0);
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 8);
  }, [q, products]);
  // เคลียร์ช่องค้นหาทุกครั้งที่เมนูปิด ไม่ให้ค้างข้อความเดิมไว้ตอนเปิดใหม่
  useEffect(() => {
    if (!open) {
      setQ("");
      setSrOpen(false);
    }
  }, [open]);

  const goTo = (p: Product | undefined) => {
    if (!p) return;
    setSrOpen(false);
    setQ("");
    go();
    router.push(productPath(p));
  };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return setSrOpen(false);
    if (!srOpen || !matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`nav-drop${open ? " open" : ""}`}
      onMouseEnter={() => {
        if (desktop()) openNow();
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
        ref={trigRef}
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
          {/* แท็บกลุ่มหมวด — "ทั้งหมด" + 4 กลุ่ม ชุดเดียวกับแท็บกรองบนหน้าแรก */}
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

          <div className="nav-mega-cols" data-active={group} onScroll={hideTip}>
            {cats.map((c, i) => {
              const items = byCat.get(c.id) ?? [];
              const catHref = `/products?category=${c.id}`;
              return (
                <div
                  key={c.id}
                  className="nav-mega-col"
                  data-cat={c.id}
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
                          <Link
                            href={productPath(p)}
                            onClick={go}
                            onMouseEnter={showTip(p)}
                            onMouseLeave={hideTip}
                            onFocus={showTip(p)}
                            onBlur={hideTip}
                          >
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
            {/* ค้นหาสินค้าไวๆ — พิมพ์แล้วมีตัวเลือกโผล่ เลือกด้วย ↑↓ Enter หรือชี้ด้วยเมาส์ */}
            <form
              className="nav-mega-search"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                if (matches[active]) return goTo(matches[active]);
                const s = q.trim();
                if (!s) return;
                setQ("");
                setSrOpen(false);
                go();
                router.push(`/products?q=${encodeURIComponent(s)}`);
              }}
            >
              <span className="search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                name="q"
                value={q}
                placeholder="ค้นหาสินค้าไวๆ เช่น พวงกุญแจ, สติกเกอร์..."
                role="combobox"
                aria-expanded={srOpen}
                aria-controls="navMegaSearchResults"
                aria-autocomplete="list"
                aria-activedescendant={srOpen && matches.length ? `navMegaSrOpt${active}` : undefined}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                  setSrOpen(e.target.value.trim().length > 0);
                }}
                onFocus={() => setSrOpen(q.trim().length > 0)}
                // ออกจากช่องค้นหาเมื่อไหร่ก็เคลียร์ทิ้ง — ข้อความค้างครึ่ง ๆ กลาง ๆ ไม่มีประโยชน์
                onBlur={() => {
                  setQ("");
                  setSrOpen(false);
                }}
                onKeyDown={onSearchKey}
              />
              <div
                className={`nav-mega-search-results${srOpen && q.trim() ? " show" : ""}`}
                id="navMegaSearchResults"
                role="listbox"
                aria-label="ผลการค้นหาสินค้า"
                // กันคลิก/ลากในกล่อง (เช่น สโครลบาร์) ไปทำให้ช่องค้นหา blur ก่อนเวลาอันควร
                onMouseDown={(e) => {
                  if (!(e.target as HTMLElement).closest(".sr-item")) e.preventDefault();
                }}
              >
                {matches.length === 0 ? (
                  <div className="sr-empty" role="status">ไม่พบสินค้าที่ตรงกับคำค้นหา</div>
                ) : (
                  matches.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`sr-item${i === active ? " active" : ""}`}
                      role="option"
                      id={`navMegaSrOpt${i}`}
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        goTo(p);
                      }}
                    >
                      <span className="sr-emoji" aria-hidden="true">
                        {p.imageSrc ? (
                          <img {...imgProps(p.imageSrc, "30px", 96)} alt="" onError={fallbackToOriginal(p.imageSrc)} />
                        ) : (
                          p.emoji
                        )}
                      </span>
                      <span className="sr-text">
                        <span className="sr-name">{p.name}</span>
                        <span className="sr-cat">{catName.get(p.category) ?? ""}</span>
                      </span>
                      <span className="sr-price">{startPrice(p)}</span>
                    </button>
                  ))
                )}
              </div>
            </form>
            <Link href="/products" onClick={go}>
              ดูสินค้าทั้งหมด <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* การ์ดพรีวิวลอย — แขวนที่ <body> เพราะแผงมี transform (position:fixed จะอ้างอิงผิดจุด) */}
      <Portal>
        <div className={`dl-tip nav-mega-tip${tip ? " show" : ""}${tip?.flip ? " flip" : ""}`} aria-hidden="true"
          style={tip ? { left: tip.left, top: tip.top } : undefined}>
          <div className="tip-img-wrap">
            {tip?.p.imageSrc ? (
              <img {...imgProps(tip.p.imageSrc, "172px", 256)} alt="" onError={fallbackToOriginal(tip.p.imageSrc)} />
            ) : (
              <em className="tip-emoji">{tip?.p.emoji ?? "🦆"}</em>
            )}
          </div>
          <b className="tip-name">{tip?.p.name}</b>
          <span className="tip-price">{tip ? startPrice(tip.p) : ""}</span>
        </div>
      </Portal>
    </div>
  );
}
