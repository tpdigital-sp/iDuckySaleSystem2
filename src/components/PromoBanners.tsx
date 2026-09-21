"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { bannerMotion, fetchPromoBanners, liveBanners, type BannerLayer, type PromoBanner } from "@/lib/promo-banners";

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

  // 🐣 ท่าขยับทั้งใบ (ลอย/โยก/หายใจ/สะบัด) — ป้ายนิ่งสนิทดูเป็นรูปติดผนัง · ไม่ได้ตั้ง = ท่าเริ่มต้น
  const mo = bannerMotion(b);

  return (
    <Wrap href={b.href} className={`promo-img${mo ? ` promo-mo-${mo}` : ""}`} label={b.title || undefined}>
      <picture>
        {/* ใช้ไฟล์ต้นฉบับทั้งมือถือและจอกว้าง (เจ้าของร้านสั่ง 21 ก.ย. 69 "ต้องการให้ภาพคมชัด")
            — ตัวย่อ /_next/image สูงสุด 1200px + q82 ทำให้ตัวหนังสือในป้ายเบลอบนจอ retina/มือถือ 3x
            ป้ายมีไม่กี่ใบและใบที่ไม่ได้อยู่บนจอโหลดแบบ lazy จึงยอมจ่ายขนาดไฟล์เต็ม (~200–350 KB/ใบ) */}
        {b.imageMobile && <source media="(max-width: 640px)" srcSet={b.imageMobile} />}
        <img
          src={b.image}
          alt={b.title}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
      </picture>
      {/* ✨ ชิ้นลูกเล่นขยับ — รูปมือถือเป็นคนละเลย์เอาต์ จึงมีชุดของตัวเอง สลับตามจอที่ 640px จุดเดียวกับ <source> */}
      <Layers list={b.layers} still={b.still} scope={b.imageMobile ? "d" : undefined} />
      {b.imageMobile && <Layers list={b.layersMobile} still={b.still} scope="m" />}
      {b.shine && !b.still && <span className="promo-fx-shine" aria-hidden="true" />}
    </Wrap>
  );
}

/** ชิ้นลูกเล่นทับป้าย (ตกแต่งล้วน — ซ่อนจากตัวอ่านหน้าจอ · กดทะลุไปที่ลิงก์ของป้าย) */
function Layers({ list, still, scope }: { list?: BannerLayer[]; still?: boolean; scope?: "d" | "m" }) {
  if (!list?.length) return null;
  return (
    <span className={`promo-fx${scope ? ` promo-fx-${scope}` : ""}${still ? " still" : ""}`} aria-hidden="true">
      {list.map((l, i) => (
        <Layer key={i} l={l} />
      ))}
    </span>
  );
}

const SHAPES = new Set(["ping", "blink", "tap"]);

function Layer({ l }: { l: BannerLayer }) {
  const style = {
    left: `${l.x}%`,
    top: `${l.y}%`,
    width: `${l.w}%`,
    // ชิ้นทรงแคปซูล (tap) กำหนดสูงเอง — ชิ้นที่เป็นรูปปล่อยสูงตามสัดส่วนรูป
    height: l.h ? `${l.h}%` : undefined,
    opacity: l.opacity,
    rotate: l.rot ? `${l.rot}deg` : undefined,
    animationDuration: l.dur ? `${l.dur}s` : undefined,
    animationDelay: l.delay ? `-${l.delay}s` : undefined,
    ["--fx-color" as string]: l.color,
  } as CSSProperties;
  if (SHAPES.has(l.anim)) return <i className={`promo-fx-${l.anim}`} style={style} />;
  const img = <img src={l.src} alt="" draggable={false} loading="lazy" decoding="async" />;
  // มีชิ้นลูก = ห่อเป็นกล่องเท่ารูปแม่ ลูกวางเป็น % ของกล่องนี้ แล้วทั้งกล่องขยับไปด้วยกัน
  return (
    <span className={`promo-fx-${l.anim}`} style={style}>
      {img}
      {l.kids?.map((k, i) => <Layer key={i} l={k} />)}
    </span>
  );
}
