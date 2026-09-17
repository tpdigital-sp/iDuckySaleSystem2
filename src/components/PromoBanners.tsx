"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPromoBanners,
  liveBanners,
  type PromoBanner,
} from "@/lib/promo-banners";
import { canOptimize, optimizedSrcSet } from "@/lib/img";

/**
 * 📣 ป้ายประชาสัมพันธ์หน้าแรก — คั่นระหว่างแบนเนอร์ใหญ่กับ "สินค้ามาใหม่"
 * แอดมินตั้งที่ /admin/banners · ไม่มีป้ายที่แสดงได้ = ไม่วาดอะไรเลย (หน้าแรกเหมือนเดิมทุกอย่าง)
 *
 * หลายใบ = รางเลื่อนแนวนอนแบบ scroll-snap (มือถือปัดนิ้วได้เองโดยไม่ต้องเขียน touch)
 * + สลับเองตามเวลาที่ตั้ง · หยุดสลับตอนชี้เมาส์/โฟกัส/แตะ และตอนลูกค้าตั้งเครื่องให้ลดการเคลื่อนไหว
 * สไตล์อยู่ท้าย landing.css (ชุด .promo-*)
 */
export default function PromoBanners() {
  const [items, setItems] = useState<PromoBanner[]>([]);
  const [seconds, setSeconds] = useState(6);
  const [at, setAt] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const hold = useRef(false);
  const jump = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let alive = true;
    void fetchPromoBanners().then((s) => {
      if (!alive) return;
      setItems(liveBanners(s));
      setSeconds(s.seconds);
    });
    return () => {
      alive = false;
    };
  }, []);

  const go = useCallback((i: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const left = rail.clientWidth * i;
    rail.scrollTo({ left, behavior: "smooth" });
    // บางเบราว์เซอร์/แท็บเบื้องหลังไม่เล่น smooth scroll เลย (ค้างที่เดิม) → ครบ 0.8 วิยังไม่ถึงให้กระโดดไปตรง ๆ
    clearTimeout(jump.current);
    jump.current = setTimeout(() => {
      if (Math.abs(rail.scrollLeft - left) > 2) rail.scrollTo({ left });
    }, 800);
  }, []);
  useEffect(() => () => clearTimeout(jump.current), []);

  /** ลูกศร ‹ › — นับจากตำแหน่งรางจริง (ไม่พึ่ง state ที่อาจตามไม่ทัน) · สุดแล้ววนกลับ */
  const step = (d: -1 | 1) => {
    const rail = railRef.current;
    if (!rail?.clientWidth) return;
    const now = Math.round(rail.scrollLeft / rail.clientWidth);
    go((now + d + items.length) % items.length);
  };

  // จุดบอกตำแหน่งตามการเลื่อนจริง (ทั้งปัดนิ้ว ทั้งสลับเอง)
  const onScroll = () => {
    const rail = railRef.current;
    if (!rail || !rail.clientWidth) return;
    setAt(Math.round(rail.scrollLeft / rail.clientWidth));
  };

  const many = items.length > 1;
  useEffect(() => {
    if (!many) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      const rail = railRef.current;
      if (hold.current || document.hidden || !rail?.clientWidth) return;
      const now = Math.round(rail.scrollLeft / rail.clientWidth);
      go((now + 1) % items.length);
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [many, items.length, seconds, go]);

  if (!items.length) return null;

  return (
    <section className="promo-band" aria-label="ประชาสัมพันธ์จากร้าน">
      <div className="wrap">
        <div className="promo-wrap">
          <div
            className="promo-rail"
            ref={railRef}
            onScroll={onScroll}
            onMouseEnter={() => (hold.current = true)}
            onMouseLeave={() => (hold.current = false)}
            onFocusCapture={() => (hold.current = true)}
            onBlurCapture={() => (hold.current = false)}
            onTouchStart={() => {
              hold.current = true;
              clearTimeout(jump.current); // ลูกค้าปัดเองแล้ว อย่าดึงกลับ
            }}
            onWheel={() => clearTimeout(jump.current)}
          >
            {items.map((b, i) => (
              <div
                className="promo-slide"
                key={b.id}
                aria-hidden={many && i !== at ? true : undefined}
              >
                <Slide b={b} eager={i === 0} />
              </div>
            ))}
          </div>
          {/* ลูกศรเลื่อน — จอคอมเท่านั้น (ชุดเดียวกับแถว "สินค้ามาใหม่") จอเล็กปัดนิ้วเอา · วนรอบได้ */}
          {many && (
            <>
              <button
                type="button"
                className="fresh-nav prev"
                aria-label="ป้ายก่อนหน้า"
                onClick={() => step(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="fresh-nav next"
                aria-label="ป้ายถัดไป"
                onClick={() => step(1)}
              >
                ›
              </button>
            </>
          )}
        </div>
        {many && (
          <div className="promo-dots">
            {items.map((b, i) => (
              <button
                key={b.id}
                type="button"
                className={i === at ? "on" : undefined}
                aria-label={`ป้ายที่ ${i + 1} จาก ${items.length}${b.title ? ` — ${b.title}` : ""}`}
                aria-current={i === at ? "true" : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** ครอบด้วยลิงก์เมื่อมีปลายทาง — ลิงก์ในเว็บใช้ <Link> · ลิงก์นอกเปิดแท็บใหม่ */
function Wrap({
  href,
  className,
  label,
  children,
}: {
  href?: string;
  className: string;
  label?: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className} aria-label={label}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      aria-label={label}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

function Slide({ b, eager }: { b: PromoBanner; eager: boolean }) {
  // ตัวย่อรูปโหลดไม่ขึ้น → ถอด <source> ทิ้ง ใช้ไฟล์ต้นฉบับ (ป้ายต้องไม่หายจากหน้าเว็บ)
  const [raw, setRaw] = useState(false);

  if (!b.image) {
    return (
      <Wrap href={b.href} className="promo-text">
        <span className="promo-ico" aria-hidden="true">
          📣
        </span>
        <span className="promo-msg">
          <b>{b.title}</b>
          {b.body && <span>{b.body}</span>}
        </span>
        {b.href && (
          <span className="promo-cta">{b.btnLabel || "ดูรายละเอียด"} →</span>
        )}
      </Wrap>
    );
  }

  const small = b.imageMobile ?? b.image;
  return (
    <Wrap href={b.href} className="promo-img" label={b.title || undefined}>
      <picture>
        {/* มือถือ: รูปแนวมือถือ (ถ้ามี) ผ่านตัวย่อ · จอกว้างใช้ไฟล์ต้นฉบับ — ตัวย่อสูงสุด 1200px ตัวหนังสือในป้ายจะเบลอบนจอ retina */}
        {!raw && canOptimize(small) ? (
          <source
            media="(max-width: 640px)"
            srcSet={optimizedSrcSet(small, 82)}
            sizes="100vw"
          />
        ) : (
          b.imageMobile && (
            <source media="(max-width: 640px)" srcSet={b.imageMobile} />
          )
        )}
        <img
          src={b.image}
          alt={b.title}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => setRaw(true)}
        />
      </picture>
    </Wrap>
  );
}
