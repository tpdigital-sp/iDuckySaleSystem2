"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Marked } from "@/components/NavSearchBar";
import { useShopCatalog } from "@/lib/use-shop-catalog";
import { pushRecentSearch, querySearch, searchHref, type SearchHit } from "@/lib/site-search";

/**
 * ช่องค้นหาในจอแรกของหน้าแรก (มือถือ — จอคอมซ่อน ใช้ช่องบนแถบเมนู) · 17 ต.ค. 69
 * เจ้าของร้านสั่ง "เวลาพิมพ์ข้อความ แล้วมีรายชื่อสินค้าขึ้นแสดงขึ้นมา"
 * → พิมพ์แล้วรายการสินค้า/หมวดที่ตรงเด้งใต้ช่อง (ดัชนีเดียวกับค้นหาบนแถบเมนู: lib/site-search)
 * แตะรายการ = เข้าหน้านั้นเลย · กดค้นหา/Enter = หน้ารวมสินค้า ?q= (ถ้าเลื่อนลูกศรเลือกไว้ = เข้ารายการนั้น)
 * แตะช่องบนมือถือ = เลื่อนช่องขึ้นไปชิดใต้แถบเมนู ไม่งั้นแป้นพิมพ์บังรายการที่เด้งลงมา
 */
const MAX = 6;

export default function HeroSearch() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // โหลดดัชนีสินค้าตอนแตะช่องครั้งแรก (หน้าแรกโหลดสินค้าชุด lite อยู่แล้ว คำขอแชร์กัน)
  const [used, setUsed] = useState(false);
  const { index } = useShopCatalog(used);
  const formRef = useRef<HTMLFormElement>(null);

  const term = q.trim();
  const all = useMemo(() => querySearch(index, term), [index, term]);
  const hits = all.slice(0, MAX);
  const show = open && term.length > 0;

  // ส่วนถัดไป (หมวดสินค้า .shop-band z-index:5) วาดทับรายการที่ห้อยลงมา → ยก .hero ขึ้นเฉพาะตอนรายการเปิด
  // (ยกถาวรไม่ได้ เมฆประดับของ hero จะไปทับการ์ดหมวด)
  useEffect(() => {
    const hero = formRef.current?.closest(".hero");
    hero?.classList.toggle("hs-open", show);
    return () => hero?.classList.remove("hs-open");
  }, [show]);

  const go = (href: string) => {
    if (term) pushRecentSearch(term);
    setOpen(false);
    router.push(href);
  };

  return (
    <form
      ref={formRef}
      className="hero-search"
      role="search"
      action="/products"
      onSubmit={(e) => {
        e.preventDefault();
        go(active >= 0 && hits[active] ? hits[active].href : searchHref(term));
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          setUsed(true);
          setOpen(true);
          // เลื่อนช่องขึ้นชิดใต้แถบเมนู (scroll-margin-top ใน landing.css) — รอแป้นพิมพ์เด้งก่อน
          if (window.matchMedia("(max-width: 700px)").matches)
            setTimeout(() => formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
        }}
        // แตะรายการ = onMouseDown กันไว้แล้ว (ไม่ blur) · แตะที่อื่น = หุบ
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, -1));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="ค้นหา เช่น พวงกุญแจ, แก้วมัค"
        enterKeyHint="search"
        autoComplete="off"
        aria-label="ค้นหาสินค้า"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />
      <button type="submit">ค้นหา</button>

      {show && (
        // mousedown preventDefault = ช่องพิมพ์ไม่ blur ก่อน click ทำงาน (ไม่งั้นรายการหายก่อนแตะติด)
        <div className="hs-drop" onMouseDown={(e) => e.preventDefault()}>
          {hits.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="สินค้าที่ตรงกับคำค้น">
              {hits.map((h: SearchHit, i) => (
                <li key={h.href} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <a
                    href={h.href}
                    className={i === active ? "on" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      go(h.href);
                    }}
                  >
                    <span className="hs-pic">
                      {h.photo || h.img ? <img src={h.photo || h.img} alt="" loading="lazy" decoding="async" /> : <em>{h.icon}</em>}
                    </span>
                    <span className="hs-txt">
                      <b>
                        <Marked name={h.name} term={term} />
                      </b>
                      {/* ป้ายหมวดในดัชนีเป็นครึ่งอังกฤษ ("Keychain & Acrylic") ลูกค้าอ่านยาก → โชว์แค่ราคาเริ่มต้น */}
                      <small>{h.kind === "category" ? "หมวดหมู่สินค้า" : h.price}</small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hs-none">{index.length ? `ไม่พบสินค้าที่ตรงกับ “${term}”` : "กำลังโหลดรายการสินค้า…"}</p>
          )}
          <a
            className="hs-all"
            href={searchHref(term)}
            onClick={(e) => {
              e.preventDefault();
              go(searchHref(term));
            }}
          >
            {all.length > MAX ? `ดูผลค้นหาทั้งหมด ${all.length} รายการ →` : `ค้นหา “${term}” ในสินค้าทั้งหมด →`}
          </a>
        </div>
      )}
    </form>
  );
}
