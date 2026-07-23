"use client";

import { useEffect } from "react";

/**
 * ขยายดูรูปเต็มจอในหน้าเดิม (ไม่เปิดแท็บใหม่)
 * ปิดได้ด้วย: กดพื้นหลัง · ปุ่ม ✕ · ปุ่ม Esc
 */
export default function ImageLightbox({
  src,
  alt,
  caption,
  onClose,
}: {
  src: string;
  alt: string;
  caption?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // ล็อกไม่ให้หน้าหลังเลื่อนตอนเปิดรูป
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

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
        className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-2xl"
      />
      {caption && <p className="max-w-lg text-center text-sm text-white/80">{caption}</p>}
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
