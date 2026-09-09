"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Portal from "@/components/Portal";
import { AiModeButton, Marked } from "@/components/NavSearchBar";
import { useShopCatalog } from "@/lib/use-shop-catalog";
import {
  clearRecentSearches,
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
 * ค้นหาแบบเต็มจอ (มือถือ/แท็บเล็ต) — สไตล์เดียวกับเมนูหมวดหมู่ (ต้นแบบ .msearch-overlay)
 * ยังไม่พิมพ์ = ค้นหาล่าสุด (ลบได้) + คำค้นยอดฮิต + ลิงก์ด่วนหมวดหมู่ · พิมพ์ = ผลค้นหา (สูงสุด 20 + ลิงก์ดูทั้งหมด)
 * ส่งฟอร์ม = เข้าผลแรกทันที ไม่มีผล = ไปหน้ารายการสินค้าพร้อมคำค้น
 */
const MAX = 20;

export default function MobileSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { index } = useShopCatalog(open);
  const term = q.trim();
  const results = useMemo(() => querySearch(index, term), [index, term]);
  const quick = useMemo(() => index.filter((h) => h.kind === "category"), [index]);

  useEffect(() => {
    if (!open) {
      setQ("");
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const go = (href: string) => {
    pushRecentSearch(term);
    onClose();
    router.push(href);
  };
  const recent = tick >= 0 ? recentSearches() : [];

  const Row = ({ h }: { h: SearchHit }) => (
    <Link
      href={h.href}
      style={h.accent ? ({ "--accent": h.accent } as React.CSSProperties) : undefined}
      onClick={(e) => {
        e.preventDefault();
        go(h.href);
      }}
    >
      <i>{h.img ? <img className="mnav-real-ico" src={h.img} alt="" loading="lazy" /> : h.icon}</i>
      <b>
        <Marked name={h.name} term={term} />
      </b>
      <span>→</span>
    </Link>
  );

  return (
    <Portal>
      <div className="dl dl-contents">
        <div
          className={`mnav-overlay msearch-overlay${open ? " open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="ค้นหาสินค้า"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="mnav-panel">
            <button type="button" className="mnav-close" aria-label="ปิดค้นหา" onClick={onClose}>
              ✕
            </button>
            <form
              className="msearch-bar"
              onSubmit={(e) => {
                e.preventDefault();
                if (results[0]) go(results[0].href);
                else if (term) go(searchHref(term));
              }}
            >
              <span className="msearch-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="6.5" />
                  <line x1="16" y1="16" x2="20.5" y2="20.5" />
                </svg>
              </span>
              <input
                ref={inputRef}
                type="text"
                placeholder="ค้นหาสินค้า เช่น พวงกุญแจ, สติกเกอร์..."
                autoComplete="off"
                aria-label="ค้นหาสินค้า"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <AiModeButton type="submit" />
            </form>

            {!term ? (
              <nav className="mnav-list" aria-label="ลิงก์ด่วน">
                {recent.length > 0 && (
                  <>
                    <div className="msearch-head">
                      ค้นหาล่าสุด
                      <button
                        type="button"
                        className="msearch-clear-all"
                        onClick={() => {
                          clearRecentSearches();
                          setTick((t) => t + 1);
                        }}
                      >
                        ล้างทั้งหมด
                      </button>
                    </div>
                    <div className="msearch-chips">
                      {recent.map((s) => (
                        <span key={s} className="msearch-chip" onClick={() => setQ(s)}>
                          {s}
                          <button
                            type="button"
                            className="msearch-chip-x"
                            aria-label="ลบ"
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
                <div className="msearch-head">คำค้นยอดฮิต</div>
                <div className="msearch-chips">
                  {POPULAR_SEARCHES.map((s) => (
                    <span key={s} className="msearch-chip" onClick={() => setQ(s)}>
                      {s}
                    </span>
                  ))}
                </div>
                <div className="msearch-head">ลิงก์ด่วน</div>
                {quick.map((h) => (
                  <Row key={h.href} h={h} />
                ))}
              </nav>
            ) : results.length > 0 ? (
              <>
                <div className="msearch-label">ผลการค้นหา ({results.length})</div>
                <nav className="mnav-list" aria-label="ผลการค้นหา">
                  {results.slice(0, MAX).map((h) => (
                    <Row key={h.kind + h.href + h.name} h={h} />
                  ))}
                  {results.length > MAX && (
                    <Link
                      className="msearch-more"
                      href={searchHref(term)}
                      onClick={(e) => {
                        e.preventDefault();
                        go(searchHref(term));
                      }}
                    >
                      ดูผลทั้งหมด {results.length} รายการ →
                    </Link>
                  )}
                </nav>
              </>
            ) : (
              <p className="msearch-empty show">ไม่พบสินค้าที่ตรงกับคำค้นหา ลองคำอื่นดูนะ</p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
