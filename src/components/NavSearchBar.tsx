"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import PreviewTip, { tipPositionFor, type TipState } from "@/components/PreviewTip";
import { useShopCatalog } from "@/lib/use-shop-catalog";
import {
  clearRecentSearches,
  markParts,
  POPULAR_SEARCHES,
  pushRecentSearch,
  querySearch,
  recentSearches,
  removeRecentSearch,
  searchHref,
  type SearchHit,
} from "@/lib/site-search";

/* eslint-disable @next/next/no-img-element */

/**
 * แถบค้นหาบนแถบเมนู (ต้นแบบ .tablet-search-bar + ปุ่ม "AI Mode")
 *  - เดสก์ท็อป (≥1001px): พิมพ์ค้นหาได้เลย มี dropdown ผลลัพธ์ · ยังไม่พิมพ์ = ค้นหาล่าสุด + คำค้นยอดฮิต
 *    เลื่อนเลือกด้วยลูกศร · Enter = เข้าแถวที่เลือก / ไปหน้าค้นหารวม · Esc = ล้าง · ชี้แถวสินค้า = การ์ดพรีวิวลอย
 *  - แท็บเล็ต/มือถือ: กดแล้วเปิดหน้าค้นหาเต็มจอ (MobileSearch) แทน
 *  ระหว่างที่ dropdown เปิด ใส่คลาส search-open ให้ <body> + ยิง event "id-search-open"
 *  ให้เมกะเมนู "สินค้าและบริการ" ปิดตัว/ไม่เปิดจากการชี้ผ่าน (เมาส์ที่กวาดลงมาหาผลลัพธ์ต้องผ่านปุ่มนั้นพอดี)
 */

const MAX = 8;
const desktop = () => window.matchMedia("(min-width:1001px)").matches;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <line x1="16" y1="16" x2="20.5" y2="20.5" />
    </svg>
  );
}

/** ปุ่ม "AI Mode" (แว่นขยาย + ประกาย) — ใช้ร่วมกับหน้าค้นหาเต็มจอ */
export function AiModeButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="tsb-btn" {...props}>
      <svg className="tsb-btn-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6" />
        <line x1="15" y1="15" x2="19.5" y2="19.5" />
        <path d="M17.4 3.2l.75 1.85 1.85.75-1.85.75-.75 1.85-.75-1.85L14.8 5.8l1.85-.75z" fill="currentColor" stroke="none" />
      </svg>
      AI Mode
    </button>
  );
}

/** ชื่อสินค้าโดยทำตัวหนาเฉพาะช่วงที่ตรงกับคำที่พิมพ์ */
export function Marked({ name, term }: { name: string; term: string }) {
  const [a, b, c] = markParts(name, term);
  return (
    <>
      {a}
      {b && <mark>{b}</mark>}
      {c}
    </>
  );
}

export default function NavSearchBar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [tip, setTip] = useState<TipState | null>(null);
  const [hasMore, setHasMore] = useState(false);
  /** นับใหม่ทุกครั้งที่ประวัติค้นหาเปลี่ยน (อ่านจาก sessionStorage ตอนวาด) */
  const [tick, setTick] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const [wanted, setWanted] = useState(false);
  const { index } = useShopCatalog(wanted);

  const term = q.trim();
  const all = useMemo(() => querySearch(index, term), [index, term]);
  const hits = all.slice(0, MAX);
  /** แถวที่เลื่อนเลือกด้วยลูกศรได้ = ผลลัพธ์ + ลิงก์ "ดูผลทั้งหมด" */
  const rowHrefs = useMemo(() => {
    const list = hits.map((h) => h.href);
    if (all.length > MAX) list.push(searchHref(term));
    return list;
  }, [hits, all.length, term]);

  const openDrop = () => {
    setWanted(true);
    if (!open) {
      setOpen(true);
      document.body.classList.add("search-open");
      document.dispatchEvent(new Event("id-search-open"));
    }
  };
  const closeDrop = () => {
    setOpen(false);
    setActive(-1);
    setTip(null);
    document.body.classList.remove("search-open");
  };
  // กดออกนอกช่องค้นหา = ล้างคำที่พิมพ์ค้างไว้ด้วย จะได้ไม่ค้างอยู่ในแถบตอนกลับมาดูใหม่
  const reset = () => {
    setQ("");
    closeDrop();
  };
  const goSearch = (s: string) => {
    pushRecentSearch(s);
    reset();
    router.push(searchHref(s));
  };
  const goRow = (href: string) => {
    pushRecentSearch(term);
    reset();
    router.push(href);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) reset();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => document.body.classList.remove("search-open"), []);

  /* ปุ่มลูกศรบอกว่ายังเลื่อนลงได้ — โผล่เฉพาะตอนเนื้อหายาวเกินกล่อง */
  const updateHint = () => {
    const d = dropRef.current;
    if (!d) return;
    const scrollable = d.scrollHeight > d.clientHeight + 4;
    const notEnd = d.scrollHeight - d.scrollTop - d.clientHeight > 8;
    setHasMore(scrollable && notEnd);
  };
  useEffect(() => {
    const id = requestAnimationFrame(updateHint);
    return () => cancelAnimationFrame(id);
  }, [open, hits.length, term]);

  const showTip = (h: SearchHit) => (e: React.MouseEvent<HTMLElement>) => {
    if (h.kind !== "product") return;
    setTip({ name: h.name, price: h.price, img: h.photo || h.img, emoji: h.icon, ...tipPositionFor(e.currentTarget) });
  };
  const hideTip = () => setTip(null);

  const setActiveIdx = (i: number) => {
    if (!rowHrefs.length) return;
    const n = (i + rowHrefs.length) % rowHrefs.length;
    setActive(n);
    const el = dropRef.current?.querySelectorAll<HTMLAnchorElement>("a")[n];
    el?.scrollIntoView({ block: "nearest" });
    // ให้การ์ดพรีวิวเด้งตามแถวที่เลือกด้วย
    const h = hits[n];
    if (el && h && h.kind === "product") setTip({ name: h.name, price: h.price, img: h.photo || h.img, emoji: h.icon, ...tipPositionFor(el) });
    else setTip(null);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      // เลือกแถวไว้อยู่ = เข้าหน้านั้นเลย ไม่ได้เลือก = ไปหน้าค้นหารวม
      if (active >= 0 && rowHrefs[active]) goRow(rowHrefs[active]);
      else goSearch(term);
    } else if (e.key === "Escape") {
      reset();
      inputRef.current?.blur();
    }
  };

  const recent = tick >= 0 ? recentSearches() : [];
  const pick = (s: string) => {
    setQ(s);
    setActive(-1);
    inputRef.current?.focus();
  };

  return (
    <>
      <div
        ref={barRef}
        className="tablet-search-bar"
        onClick={(e) => {
          if (!desktop()) {
            touched.current = true;
            onOpenMobile();
            return;
          }
          if (!(e.target as HTMLElement).closest(".tsb-btn")) inputRef.current?.focus();
        }}
      >
        <span className="tsb-ico" aria-hidden="true">
          <SearchIcon />
        </span>
        <span className="tsb-text">ค้นหาสินค้า เช่น สแตนดี้ พวงกุญแจ สติกเกอร์...</span>
        <input
          ref={inputRef}
          type="text"
          className="tsb-input"
          autoComplete="off"
          placeholder="ค้นหาสินค้า เช่น สแตนดี้ พวงกุญแจ สติกเกอร์..."
          aria-label="ค้นหาสินค้า"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            openDrop();
          }}
          onFocus={openDrop}
          onKeyDown={onKey}
        />
        <AiModeButton
          onClick={(e) => {
            if (!desktop()) return;
            e.stopPropagation();
            goSearch(term);
          }}
        />

        <div
          ref={dropRef}
          className={`tsb-drop${open ? " open" : ""}${hasMore ? " has-more" : ""}`}
          role="listbox"
          onScroll={updateHint}
          onMouseLeave={hideTip}
        >
          {!term ? (
            <>
              {recent.length > 0 && (
                <>
                  <div className="tsb-drop-head">
                    ค้นหาล่าสุด
                    <button
                      type="button"
                      className="tsb-clear-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearRecentSearches();
                        setTick((t) => t + 1);
                      }}
                    >
                      ล้างทั้งหมด
                    </button>
                  </div>
                  <div className="tsb-chips">
                    {recent.map((s) => (
                      <span key={s} className="tsb-chip tsb-chip-recent" onClick={() => pick(s)}>
                        {s}
                        <button
                          type="button"
                          className="tsb-chip-x"
                          aria-label={`ลบ ${s}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentSearch(s);
                            setTick((t) => t + 1);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </>
              )}
              <div className="tsb-drop-head">คำค้นยอดฮิต</div>
              <div className="tsb-chips">
                {POPULAR_SEARCHES.map((s) => (
                  <button key={s} type="button" className="tsb-chip" onClick={() => pick(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : hits.length === 0 ? (
            <div className="tsb-drop-empty">ไม่พบสินค้าที่ตรงกับคำค้นหา ลองคำอื่นดูนะ</div>
          ) : (
            <>
              {hits.map((h, i) => (
                <Link
                  key={h.kind + h.href + h.name}
                  href={h.href}
                  className={active === i ? "is-active" : undefined}
                  style={h.accent ? ({ "--accent": h.accent } as React.CSSProperties) : undefined}
                  onMouseEnter={showTip(h)}
                  onMouseLeave={hideTip}
                  onClick={(e) => {
                    e.preventDefault();
                    goRow(h.href);
                  }}
                >
                  <i>{h.img ? <img src={h.img} alt="" loading="lazy" /> : h.icon}</i>
                  <b>
                    <Marked name={h.name} term={term} />
                  </b>
                  <span>{h.type}</span>
                </Link>
              ))}
              {all.length > MAX && (
                <Link
                  href={searchHref(term)}
                  className={`tsb-drop-more${active === hits.length ? " is-active" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goSearch(term);
                  }}
                >
                  ดูผลทั้งหมด {all.length} รายการ →
                </Link>
              )}
              <div
                className="tsb-hint"
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  dropRef.current?.scrollBy({ top: (dropRef.current.clientHeight || 0) * 0.8, behavior: "smooth" });
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </>
          )}
        </div>
      </div>
      <PreviewTip tip={tip} />
    </>
  );
}
