"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * ขยายดูรูปเต็มจอในหน้าเดิม (ไม่เปิดแท็บใหม่)
 * ปิดได้ด้วย: กดพื้นหลัง · ปุ่ม ✕ · ปุ่ม Esc
 * เลื่อนรูป (ถ้ามี onPrev/onNext): ลูกศรซ้าย/ขวา · ปัดนิ้ว · ปุ่มลูกศรคีย์บอร์ด
 */
export default function ImageLightbox({
  src,
  alt,
  caption,
  footer,
  counter,
  onPrev,
  onNext,
  onClose,
}: {
  src: string;
  alt: string;
  caption?: string;
  /** แถบปุ่มใต้รูป เช่น ปุ่มยืนยันการตรวจนับของพนักงานแพ็ค */
  footer?: ReactNode;
  /** ป้ายบอกตำแหน่ง เช่น "2 / 3" — แสดงเมื่อมีหลายรูป */
  counter?: string;
  /** ไปรูปก่อนหน้า (ไม่ส่ง = ไม่มีรูปก่อนหน้า ปุ่มจะไม่ขึ้น) */
  onPrev?: () => void;
  /** ไปรูปถัดไป */
  onNext?: () => void;
  onClose: () => void;
}) {
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    document.addEventListener("keydown", onKey);
    // ล็อกไม่ให้หน้าหลังเลื่อนตอนเปิดรูป
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-slate-900/85 p-4 backdrop-blur-sm sm:p-8"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (dx > 50) onPrev?.();
          else if (dx < -50) onNext?.();
        }}
        className={`max-w-full rounded-xl object-contain shadow-2xl ${footer ? "max-h-[58vh]" : "max-h-[82vh]"}`}
      />

      {/* ปุ่มลูกศรซ้าย/ขวา (แสดงเมื่อมีรูปให้เลื่อน) */}
      {onPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="รูปก่อนหน้า"
          className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl text-white transition hover:bg-white/30 sm:left-4"
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="รูปถัดไป"
          className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl text-white transition hover:bg-white/30 sm:right-4"
        >
          ›
        </button>
      )}

      {counter && <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white">{counter}</span>}
      {caption && <p className="max-w-lg text-center text-sm text-white/80">{caption}</p>}
      {footer && (
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
          {footer}
        </div>
      )}
      <p className="text-xs text-white/40">แตะพื้นหลัง หรือกด Esc เพื่อปิด</p>

      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-lg text-white transition hover:bg-white/25"
      >
        ✕
      </button>
    </div>
  );
}
