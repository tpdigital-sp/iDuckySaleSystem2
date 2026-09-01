"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import Portal from "@/components/Portal";

/** ซูมได้สูงสุดกี่เท่า · ก้าวละเท่าไหร่ (ปุ่ม/คีย์บอร์ด) · ดับเบิลคลิกทีเดียวไปกี่เท่า */
const MAX_ZOOM = 6;
const STEP = 0.5;
const DOUBLE_TAP_ZOOM = 3;

/**
 * ขยายดูรูปเต็มจอในหน้าเดิม (ไม่เปิดแท็บใหม่)
 *
 * โครงหน้า: แถบเครื่องมือบน (ซูม/เลขรูป/ปิด) — รูปเต็มพื้นที่กลาง — คำอธิบาย/ปุ่มด้านล่าง
 * ทุกส่วนอยู่ในคอลัมน์เดียวที่สูงเท่าจอพอดี รูปจึงล้นจอไม่ได้ ต่อให้ไฟล์ใหญ่แค่ไหน
 *
 * ปิด: กดพื้นหลัง · ปุ่ม ✕ · Esc
 * เลื่อนรูป (ถ้ามี onPrev/onNext): ปุ่มลูกศร · ปัดนิ้ว (ตอนยังไม่ซูม) · ลูกศรคีย์บอร์ด
 * ซูมดูลายเส้นเล็ก ๆ: ล้อเมาส์ · บีบสองนิ้ว · ดับเบิลคลิก · ปุ่ม − ＋ · คีย์ + − 0
 *   ซูมแล้วลากรูปไปดูส่วนที่ต้องการได้ (กราฟฟิก/ลูกค้าตรวจแบบได้โดยไม่ต้องโหลดไฟล์)
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
  /**
   * เก็บ element เป็น state ไม่ใช่ ref ล้วน — เพราะ <Portal> เรนเดอร์ลูกหลัง useEffect รอบแรก
   * ถ้าผูก event ตอน ref ยังว่าง จะไม่ได้ผูกอะไรเลย (ล้อเมาส์/นิ้วสัมผัสจะเงียบสนิท)
   */
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const setBox = useCallback((el: HTMLDivElement | null) => {
    boxRef.current = el;
    setBoxEl(el);
  }, []);
  const imgRef = useRef<HTMLImageElement>(null);
  /**
   * สถานะการดู: z = ซูมกี่เท่า · x,y = เลื่อนรูปไปเท่าไหร่ (ก้อนเดียวกัน เพราะซูมกับเลื่อนต้องอัปเดตพร้อมกัน)
   * smooth = ให้ค่อย ๆ ไหลไปค่าใหม่ไหม — กดปุ่ม/ดับเบิลคลิก/ล้อเมาส์ = ไหล · ทัชแพด/บีบนิ้ว/ลาก = ตามนิ้วทันที
   */
  const [view, setView] = useState({ z: 1, x: 0, y: 0, smooth: false });
  /** กำลังลากรูปอยู่ — ใช้กันไม่ให้ปล่อยเมาส์แล้วนับเป็น "กดพื้นหลังเพื่อปิด" */
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const touchX = useRef<number | null>(null);

  /** เปลี่ยนรูป = เริ่มซูมใหม่ ไม่งั้นรูปถัดไปจะเปิดมาค้างอยู่ที่มุมเดิม */
  useEffect(() => setView({ z: 1, x: 0, y: 0, smooth: false }), [src]);

  /**
   * ขนาดรูปที่เห็นจริงในกรอบ (object-contain ย่อรูปให้พอดีกรอบก่อน แล้วค่อยคูณด้วยซูม)
   * ต้องคิดจาก naturalWidth/Height เอง เพราะ <img> กินเต็มกรอบ ขนาด element จึงไม่ใช่ขนาดรูปที่เห็น
   */
  const fitted = useCallback(() => {
    const box = boxRef.current?.getBoundingClientRect();
    const img = imgRef.current;
    if (!box || !img?.naturalWidth) return null;
    // หักขอบใน (padding) ของ <img> ออกก่อน ไม่งั้นจะคิดว่ารูปใหญ่กว่าที่เห็นจริงแล้วลากเลยขอบได้นิดหน่อย
    const cs = getComputedStyle(img);
    const availW = Math.max(1, box.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
    const availH = Math.max(1, box.height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0));
    const k = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
    return { w: img.naturalWidth * k, h: img.naturalHeight * k, box };
  }, []);

  /** ห้ามลากรูปหลุดกรอบจนหาไม่เจอ — เลื่อนได้เท่าที่รูปล้นกรอบจริง ๆ */
  const clampPan = useCallback(
    (p: { x: number; y: number }, z: number) => {
      const f = fitted();
      if (!f) return p;
      const mx = Math.max(0, (f.w * z - f.box.width) / 2);
      const my = Math.max(0, (f.h * z - f.box.height) / 2);
      return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
    },
    [fitted]
  );

  /** เลื่อนรูปไปตำแหน่งใหม่ (ลากดู) */
  const panTo = useCallback(
    (x: number, y: number) => setView((v) => ({ z: v.z, ...clampPan({ x, y }, v.z), smooth: false })),
    [clampPan]
  );

  /**
   * ซูมโดยตรึงจุดที่ชี้ไว้กับที่ (ชี้ตรงไหน ซูมเข้าตรงนั้น) — ไม่ส่ง at = ซูมจากกลางรูป
   * next รับเป็นฟังก์ชันได้ กดปุ่มรัว ๆ จะได้คิดต่อจากค่าล่าสุดจริง ไม่ใช่ค่าที่ค้างอยู่ตอนเรนเดอร์
   */
  const zoomTo = useCallback(
    (next: number | ((z: number) => number), at?: { x: number; y: number }, smooth = true) => {
      setView((v) => {
        const z2 = Math.min(MAX_ZOOM, Math.max(1, Number((typeof next === "function" ? next(v.z) : next).toFixed(3))));
        if (z2 === v.z) return v;
        if (z2 === 1) return { z: 1, x: 0, y: 0, smooth };
        const box = boxRef.current?.getBoundingClientRect();
        if (!box || !at) return { z: z2, ...clampPan(v, z2), smooth };
        const d = { x: at.x - (box.left + box.width / 2), y: at.y - (box.top + box.height / 2) };
        return {
          z: z2,
          ...clampPan({ x: v.x + ((v.z - z2) * (d.x - v.x)) / v.z, y: v.y + ((v.z - z2) * (d.y - v.y)) / v.z }, z2),
          smooth,
        };
      });
    },
    [clampPan]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
      else if (e.key === "+" || e.key === "=") zoomTo((z) => z + STEP);
      else if (e.key === "-" || e.key === "_") zoomTo((z) => z - STEP);
      else if (e.key === "0") zoomTo(1);
    };
    document.addEventListener("keydown", onKey);
    // ล็อกไม่ให้หน้าหลังเลื่อนตอนเปิดรูป
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext, zoomTo]);

  /**
   * ล้อเมาส์/ทัชแพด = ซูม (ผูกเองแบบ passive:false ไม่งั้นกันหน้าเลื่อนไม่ได้)
   * ผูกที่ทั้งกล่อง ไม่ใช่เฉพาะรูป — เลื่อนตรงไหนของไลท์บ็อกซ์ก็ซูมได้ ยกเว้นแถบล่างที่เลื่อนอ่านเองได้
   */
  useEffect(() => {
    const el = rootEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // แถบล่างที่มีเนื้อหายาวจนเลื่อนได้ ปล่อยให้เลื่อนอ่านตามปกติ
      const f = footerRef.current;
      if (f?.contains(e.target as Node) && f.scrollHeight > f.clientHeight) return;
      e.preventDefault();
      // แปลงหน่วยเป็นพิกเซลก่อน — Firefox ส่งมาเป็น "บรรทัด" (deltaMode 1 ล้อละ ~3) ไม่ใช่พิกเซลเหมือน Chrome
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      // ล้อเมาส์มาเป็นก้อนใหญ่ = ก้าวทีละขั้นแล้วให้ไหลนุ่ม ๆ · ทัชแพด/พินช์มาถี่ทีละนิด = เกาะนิ้วทันที
      const notched = e.deltaMode !== 0 || Math.abs(px) >= 50;
      zoomTo((z) => z * Math.exp(-px / (notched ? 520 : 300)), { x: e.clientX, y: e.clientY }, notched);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [rootEl, zoomTo]);

  /** บีบสองนิ้วซูม · ลากนิ้วเดียวเลื่อนรูปตอนซูมอยู่ · ปัดเปลี่ยนรูปตอนยังไม่ซูม */
  useEffect(() => {
    const el = boxEl;
    if (!el) return;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch.current = { dist: dist(e.touches), zoom: view.z };
        touchX.current = null;
      } else if (e.touches.length === 1) {
        touchX.current = view.z === 1 ? e.touches[0].clientX : null;
        if (view.z > 1) {
          drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: view.x, panY: view.y, moved: false };
          setDragging(true);
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch.current) {
        e.preventDefault();
        const p = pinch.current;
        const mid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
        zoomTo((p.zoom * dist(e.touches)) / p.dist, mid, false);
      } else if (e.touches.length === 1 && drag.current) {
        e.preventDefault();
        const d = drag.current;
        d.moved = true;
        panTo(d.panX + (e.touches[0].clientX - d.x), d.panY + (e.touches[0].clientY - d.y));
      }
    };
    const onEnd = (e: TouchEvent) => {
      pinch.current = null;
      if (drag.current) {
        drag.current = null;
        setDragging(false);
        return;
      }
      if (touchX.current == null || view.z > 1) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      touchX.current = null;
      if (dx > 50) onPrev?.();
      else if (dx < -50) onNext?.();
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [boxEl, view, zoomTo, panTo, onPrev, onNext]);

  const { z: zoom, x: panX, y: panY, smooth } = view;
  const zoomed = zoom > 1;
  const btn = "grid h-9 w-9 place-items-center rounded-full text-white/90 transition hover:bg-white/20 disabled:opacity-30";

  return (
    <Portal>
      <div
        ref={setRootEl}
        role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-3 backdrop-blur-sm sm:p-6"
    >
      {/*
        การ์ดกลางจอ — สูง clamp(420px, 88dvh, 1100px)
        ใช้ clamp เพื่อให้มีความสูงขั้นต่ำเป็น px เสมอ ต่อให้เบราว์เซอร์รายงานความสูงจอเพี้ยน (0/สูงเวอร์)
        รูปก็ยังอยู่ในกรอบ ไม่ยืดทะลุจอ
      */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ height: "clamp(420px, 88dvh, 1100px)" }}
        className="flex w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-slate-900/70 shadow-2xl ring-1 ring-white/10"
      >
        {/* ── หัวการ์ด: เลขรูป · ซูม · ปิด ── */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2 sm:px-3">
          <span className="min-w-[3.5rem] px-1 text-xs font-bold text-white/60">{counter ?? ""}</span>
          <div className="flex items-center gap-0.5 rounded-full bg-white/10 p-0.5">
            <button type="button" onClick={() => zoomTo((z) => z - STEP)} disabled={zoom <= 1} aria-label="ซูมออก" className={btn}>
              −
            </button>
            <button
              type="button"
              onClick={() => zoomTo(zoomed ? 1 : DOUBLE_TAP_ZOOM)}
              title={zoomed ? "กลับไปขนาดพอดีกรอบ" : `ซูม ${DOUBLE_TAP_ZOOM}×`}
              className="min-w-[3.25rem] rounded-full px-2 py-1 text-xs font-bold text-white/90 transition hover:bg-white/20"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => zoomTo((z) => z + STEP)} disabled={zoom >= MAX_ZOOM} aria-label="ซูมเข้า" className={btn}>
              ＋
            </button>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className={`${btn} min-w-[3.5rem] bg-white/10 text-lg`}>
            ✕
          </button>
        </div>

        {/* ── เวทีรูป: กินพื้นที่ที่เหลือของการ์ด · พื้นตารางหมากรุกไว้ดูลายที่พื้นหลังโปร่ง ── */}
        <div
          ref={setBox}
          onMouseDown={(e) => {
            if (!zoomed) return;
            e.preventDefault();
            drag.current = { x: e.clientX, y: e.clientY, panX, panY, moved: false };
            setDragging(true);
          }}
          onMouseMove={(e) => {
            const d = drag.current;
            if (!d) return;
            d.moved = true;
            panTo(d.panX + (e.clientX - d.x), d.panY + (e.clientY - d.y));
          }}
          onMouseUp={() => {
            if (!drag.current) return;
            setDragging(false);
            drag.current = null;
          }}
          onMouseLeave={() => {
            drag.current = null;
            setDragging(false);
          }}
          onDoubleClick={(e) => zoomTo(zoomed ? 1 : DOUBLE_TAP_ZOOM, { x: e.clientX, y: e.clientY })}
          style={{
            backgroundImage:
              "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)",
            backgroundSize: "22px 22px",
            backgroundPosition: "0 0,0 11px,11px -11px,-11px 0",
            backgroundColor: "#f8fafc",
          }}
          className={`relative min-h-0 flex-1 touch-none overflow-hidden ${
            zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: "center",
              willChange: "transform",
              transition: smooth && !dragging ? "transform 200ms cubic-bezier(.22,.61,.36,1)" : "none",
            }}
            className="absolute inset-0 h-full w-full select-none object-contain p-3 sm:p-5"
          />

          {/* ปุ่มลูกศรซ้าย/ขวา — ลอยบนเวที */}
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              aria-label="รูปก่อนหน้า"
              className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-slate-900/45 text-2xl text-white shadow-lg backdrop-blur-sm transition hover:bg-slate-900/70 sm:left-3"
            >
              ‹
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              aria-label="รูปถัดไป"
              className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-slate-900/45 text-2xl text-white shadow-lg backdrop-blur-sm transition hover:bg-slate-900/70 sm:right-3"
            >
              ›
            </button>
          )}
        </div>

        {/* ── ท้ายการ์ด: คำอธิบาย · ปุ่มของหน้าที่เรียกใช้ · วิธีใช้ (ยาวแค่ไหนก็เลื่อนในแถบนี้ ไม่ดันรูป) ── */}
        <div
          ref={footerRef}
          className="flex max-h-[40%] shrink-0 flex-col items-center gap-2 overflow-y-auto border-t border-white/10 px-4 py-2.5"
        >
          {caption && <p className="max-w-2xl text-center text-sm text-white/85">{caption}</p>}
          {footer && <div className="w-full max-w-md">{footer}</div>}
          <p className="text-center text-[11px] leading-relaxed text-white/35">
            {zoomed ? "ลากรูปเพื่อเลื่อนดู · ดับเบิลคลิก = กลับขนาดเดิม" : "ล้อเมาส์ / บีบสองนิ้ว / ดับเบิลคลิก = ซูม"} · กดนอกกรอบ
            หรือ Esc เพื่อปิด
          </p>
        </div>
      </div>
      </div>
    </Portal>
  );
}
