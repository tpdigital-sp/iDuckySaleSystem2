"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* eslint-disable @next/next/no-img-element */

export interface GalleryImage {
  src: string;
  href?: string;
}

/**
 * 🧩 แกลเลอรีรูปบนหน้าแรก — 2 โหมด
 * grid   = เรียงตาราง 2-4 คอลัมน์
 * slider = สไลด์เลื่อนแบบเว็บหลักของร้าน (ลูกศร · จุด · ปัดบนมือถือ · เลื่อนเองทุก 3 วิ)
 * จำนวนคอลัมน์ที่ตั้ง = ที่เห็นบนจอใหญ่ · แท็บเล็ตลดเหลือ 2 · มือถือ 1 (โหมดสไลด์)
 */
export default function HomeGallery({
  heading,
  images,
  cols = 3,
  display = "grid",
  fit = "cover",
  ratio = "16/12",
}: {
  heading?: string;
  images: GalleryImage[];
  cols?: number;
  display?: "grid" | "slider";
  /** cover = ครอปให้เต็มกรอบ (เดิม) · contain = เห็นเต็มภาพไม่ครอป */
  fit?: "cover" | "contain";
  /** สัดส่วนกรอบภาพ เช่น "16/9" */
  ratio?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // จำนวนที่เห็นพร้อมกัน ปรับตามจอ (เฉพาะโหมดสไลด์)
  const [visible, setVisible] = useState(Math.min(cols, 4));
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setVisible(w < 640 ? 1 : w < 1024 ? Math.min(2, cols) : Math.min(cols, 4));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [cols]);

  const maxIndex = Math.max(0, images.length - visible);
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, images.length - visible)));
  }, [visible, images.length]);

  // เลื่อนเองทุก 3 วิ (หยุดตอนชี้เมาส์/แตะ)
  useEffect(() => {
    if (display !== "slider" || paused || maxIndex === 0) return;
    const t = setInterval(() => setIndex((i) => (i >= maxIndex ? 0 : i + 1)), 3000);
    return () => clearInterval(t);
  }, [display, paused, maxIndex]);

  if (!images.length) return null;

  const cell = (im: GalleryImage, i: number, className: string) => {
    const img = (
      <img
        src={im.src}
        alt=""
        loading="lazy"
        decoding="async"
        className={`h-full w-full rounded-2xl ${fit === "contain" ? "object-contain" : "object-cover"}`}
      />
    );
    // โหมดเห็นเต็มภาพ: พื้นขาวหลังภาพ (ภาพที่สัดส่วนไม่พอดีกรอบจะมีขอบ ไม่โดนครอป)
    const cls = `${className} ${fit === "contain" ? "bg-white" : ""}`;
    const style = { aspectRatio: ratio };
    return im.href ? (
      <Link key={i} href={im.href} style={style} className={`${cls} transition hover:brightness-95`}>
        {img}
      </Link>
    ) : (
      <span key={i} style={style} className={cls}>
        {img}
      </span>
    );
  };

  if (display !== "slider") {
    const colCls = cols <= 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-2 md:grid-cols-3" : "sm:grid-cols-2 md:grid-cols-4";
    return (
      <div>
        {heading && <h2 className="mb-5 text-center text-2xl font-extrabold tracking-wide text-stone-700 md:text-4xl">{heading}</h2>}
        <div className={`grid grid-cols-2 gap-3 md:gap-4 ${colCls}`}>
          {images.map((im, i) => cell(im, i, "block overflow-hidden rounded-2xl"))}
        </div>
      </div>
    );
  }

  const step = 100 / visible;
  return (
    <div
      className="relative rounded-[2rem] bg-stone-50 p-5 md:p-9"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {heading && (
        <h2 className="mb-6 text-center text-2xl font-medium uppercase tracking-[0.1em] text-stone-700 md:mb-9 md:text-4xl">
          {heading}
        </h2>
      )}

      <div
        className="overflow-hidden rounded-2xl"
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          setPaused(true);
        }}
        onTouchEnd={(e) => {
          const t0 = touch.current;
          touch.current = null;
          setPaused(false);
          if (!t0) return;
          const dx = t0.x - e.changedTouches[0].clientX;
          const dy = t0.y - e.changedTouches[0].clientY;
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50)
            setIndex((i) => (dx > 0 ? (i >= maxIndex ? 0 : i + 1) : i <= 0 ? maxIndex : i - 1));
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${index * step}%)` }}
        >
          {images.map((im, i) => (
            <div key={i} className="shrink-0 px-1.5 md:px-2.5" style={{ flexBasis: `${step}%` }}>
              {cell(im, i, "block overflow-hidden rounded-2xl")}
            </div>
          ))}
        </div>
      </div>

      {/* ลูกศร (ซ่อนบนมือถือ — ใช้ปัดแทน) */}
      {maxIndex > 0 && (
        <>
          <button
            type="button"
            onClick={() => setIndex((i) => (i <= 0 ? maxIndex : i - 1))}
            className="absolute left-1 top-1/2 hidden h-12 w-12 -translate-y-1/2 rounded-full bg-white/90 text-lg text-stone-600 shadow-lg backdrop-blur transition hover:scale-110 hover:bg-white md:block"
            aria-label="เลื่อนไปก่อนหน้า"
          >
            ❮
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i >= maxIndex ? 0 : i + 1))}
            className="absolute right-1 top-1/2 hidden h-12 w-12 -translate-y-1/2 rounded-full bg-white/90 text-lg text-stone-600 shadow-lg backdrop-blur transition hover:scale-110 hover:bg-white md:block"
            aria-label="เลื่อนไปถัดไป"
          >
            ❯
          </button>

          {/* จุดบอกตำแหน่ง */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {Array.from({ length: maxIndex + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`ไปสไลด์ที่ ${i + 1}`}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  i === index ? "scale-125 bg-sky-500" : "bg-stone-300 hover:scale-110 hover:bg-stone-400"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
