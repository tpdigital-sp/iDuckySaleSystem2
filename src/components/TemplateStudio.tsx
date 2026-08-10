"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * 🖼 วางลายบนเทมเพลต — ลูกค้าเอารูปมาวางในกรอบงานจริงได้เลยบนหน้าเว็บ
 *
 * ทำไมต้องมี: เดิมลูกค้าต้องโหลดไฟล์ .ai ไปวางเองใน Illustrator (คนทั่วไปทำไม่ได้)
 * ตัวนี้ทำให้วาง/ซูม/หมุนบนเว็บ แล้วกดใส่ตะกร้าได้เลย
 *
 * หน่วยภายในเป็น "มิลลิเมตรของงานจริง" ทั้งหมด (ไม่ใช่พิกเซลบนจอ)
 * → ตัวเลขที่ส่งให้ทีมผลิตเอาไปวางในไฟล์จริงได้ตรงเป๊ะ ไม่ต้องเดาสเกล
 *
 * ผืนผ้าใบ = ขนาดงาน + ตัดตกรอบด้าน · ลายต้องคลุมเต็มถึงขอบตัดตก
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TemplateFrame } from "@/lib/design-templates";

export interface Placement {
  /** จุดกึ่งกลางของลาย นับจากมุมซ้ายบนของพื้นที่ตัดตก (มม.) */
  cxMm: number;
  cyMm: number;
  /** ขนาดลายที่วางจริง (มม.) */
  wMm: number;
  hMm: number;
  /** หมุนตามเข็ม (องศา) */
  rotDeg: number;
}

export interface StudioResult {
  /** ภาพงานที่ประกอบเสร็จ (ขนาดเท่าพื้นที่ตัดตก) — ใช้เป็นลายที่แนบไปกับออเดอร์ */
  composite: File;
  /** ไฟล์ต้นฉบับที่ลูกค้าเลือก — เก็บไว้ให้ทีมผลิตใช้ตอนทำไฟล์พิมพ์จริง */
  source: File;
  placement: Placement;
  /** ความละเอียดของลาย ณ ขนาดที่วาง (จุดต่อนิ้ว) */
  dpi: number;
  /** สรุปสั้น ๆ ให้ลูกค้าอ่านในตะกร้า */
  summary: string;
  /** บรรทัดตัวเลขให้ทีมผลิตวางในไฟล์จริง */
  spec: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** ชื่องานที่โชว์บนหัว เช่น "MousePad 30x60 cm" */
  title: string;
  /** กรอบงานจริง (ผืนผ้าใบ + เส้นตัด + เขตปลอดภัย) — มาจาก templateFrame() */
  frame: TemplateFrame;
  /** รูปเทมเพลตจาก .ai — วางเป็นไกด์จาง ๆ ทับลาย (ถ้ามี) */
  guideUrl?: string;
  onApply: (r: StudioResult) => void | Promise<void>;
}

/** ความละเอียดที่อยากได้ตอนส่งพิมพ์ และเพดานด้านยาวของภาพที่ประกอบ (กันไฟล์ใหญ่เกินไป) */
const EXPORT_DPI = 300;
const EXPORT_MAX_EDGE = 4500;
/** ต่ำกว่านี้เตือน (งานพิมพ์ทั่วไปควรได้ 150 ขึ้นไป) */
const DPI_WARN = 150;
const DPI_BAD = 100;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function TemplateStudio({ open, onClose, title, frame, guideUrl, onApply }: Props) {
  /**
   * สลับแนวงาน — ใช้เมื่อขนาดมาจากชื่อตัวเลือก ("30x60" ไม่บอกว่าด้านไหนกว้าง)
   * ถ้าขนาดมาจากไฟล์จริงแล้วก็ไม่ต้องสลับ (ไฟล์บอกแนวมาเองแล้ว)
   */
  const [swapped, setSwapped] = useState(false);
  const bleedW = swapped ? frame.canvasHMm : frame.canvasWMm;
  const bleedH = swapped ? frame.canvasWMm : frame.canvasHMm;
  const bleedX = swapped ? frame.bleedYMm : frame.bleedXMm;
  const bleedY = swapped ? frame.bleedXMm : frame.bleedYMm;
  /** ขนาดงานจริงหลังตัด (กรอบเส้นแดง) */
  const artW = bleedW - bleedX * 2;
  const artH = bleedH - bleedY * 2;
  const safeMm = frame.safeMm;

  const [src, setSrc] = useState<{ file: File; url: string; w: number; h: number } | null>(null);
  const [pl, setPl] = useState<Placement | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /** ตัวชี้ที่กดค้างอยู่ (รองรับสองนิ้ว = ซูม) */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ pl: Placement; dist: number; cx: number; cy: number } | null>(null);

  /** มม. ต่อพิกเซลบนจอ — แปลงระยะลากนิ้วเป็นระยะบนงานจริง */
  const mmPerPx = useCallback(() => {
    const el = stageRef.current;
    return el ? bleedW / el.clientWidth : 1;
  }, [bleedW]);

  /** วางลายให้คลุมเต็มพื้นที่ตัดตก (ค่าเริ่มต้น — งานแผ่นรองเมาส์/สติกเกอร์ต้องเต็มขอบ) */
  const fill = useCallback(
    (img?: { w: number; h: number }) => {
      const s = img ?? src;
      if (!s) return;
      const k = Math.max(bleedW / s.w, bleedH / s.h);
      setPl({ cxMm: bleedW / 2, cyMm: bleedH / 2, wMm: s.w * k, hMm: s.h * k, rotDeg: 0 });
    },
    [src, bleedW, bleedH],
  );

  /** วางทั้งรูปให้อยู่ในกรอบ (ไม่โดนตัด — เหลือขอบขาว) */
  const fit = useCallback(() => {
    if (!src) return;
    const k = Math.min(artW / src.w, artH / src.h);
    setPl({ cxMm: bleedW / 2, cyMm: bleedH / 2, wMm: src.w * k, hMm: src.h * k, rotDeg: 0 });
  }, [src, artW, artH, bleedW, bleedH]);

  // เปลี่ยนแนวงาน/ปิดจอ → จัดลายใหม่ให้พอดีเสมอ
  useEffect(() => {
    if (src) fill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapped]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    // กันหน้าเว็บด้านหลังเลื่อนตามตอนลากลายบนมือถือ
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // ล้าง object URL ทิ้งเมื่อเปลี่ยนรูป/ปิดจอ
  useEffect(() => () => { if (src) URL.revokeObjectURL(src.url); }, [src]);

  async function pick(file?: File | null) {
    if (!file) return;
    setErr("");
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return setErr("ใช้ได้เฉพาะไฟล์รูป JPG / PNG / WEBP");
    if (file.size > 15 * 1024 * 1024) return setErr("ไฟล์ใหญ่เกิน 15MB — ย่อขนาดก่อนแล้วลองใหม่");
    const url = URL.createObjectURL(file);
    const dim = await new Promise<{ w: number; h: number }>((res) => {
      const im = new window.Image();
      im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => res({ w: 0, h: 0 });
      im.src = url;
    });
    if (!dim.w) {
      URL.revokeObjectURL(url);
      return setErr("เปิดไฟล์รูปไม่ได้ — ลองบันทึกใหม่แล้วเลือกอีกครั้ง");
    }
    setSrc((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return { file, url, ...dim };
    });
    fill(dim);
  }

  // ── ลาก / ซูมด้วยนิ้วหรือเมาส์ ──
  function onPointerDown(e: React.PointerEvent) {
    if (!pl) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  }

  function startGesture() {
    if (!pl) return;
    const pts = [...pointers.current.values()];
    if (!pts.length) return;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { pl, dist, cx, cy };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    const k = mmPerPx();
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let next: Placement = {
      ...g.pl,
      cxMm: g.pl.cxMm + (cx - g.cx) * k,
      cyMm: g.pl.cyMm + (cy - g.cy) * k,
    };
    if (pts.length > 1 && g.dist > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const z = clamp(d / g.dist, 0.2, 8);
      next = { ...next, wMm: g.pl.wMm * z, hMm: g.pl.hMm * z };
    }
    setPl(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) startGesture();
    else gesture.current = null;
  }

  function zoomBy(f: number) {
    setPl((p) => (p ? { ...p, wMm: p.wMm * f, hMm: p.hMm * f } : p));
  }

  function rotate(deg: number) {
    setPl((p) => (p ? { ...p, rotDeg: (p.rotDeg + deg + 360) % 360 } : p));
  }

  /** ความละเอียดของลาย ณ ขนาดที่วางอยู่ */
  const dpi = src && pl ? Math.round(src.w / (pl.wMm / 25.4)) : 0;
  /** ลายคลุมถึงขอบตัดตกครบไหม (เช็คแบบกรอบสี่เหลี่ยม — พอสำหรับเตือน) */
  const covers = (() => {
    if (!pl) return false;
    const rad = (pl.rotDeg * Math.PI) / 180;
    const w = Math.abs(pl.wMm * Math.cos(rad)) + Math.abs(pl.hMm * Math.sin(rad));
    const h = Math.abs(pl.wMm * Math.sin(rad)) + Math.abs(pl.hMm * Math.cos(rad));
    return (
      pl.cxMm - w / 2 <= 0.5 && pl.cyMm - h / 2 <= 0.5 && pl.cxMm + w / 2 >= bleedW - 0.5 && pl.cyMm + h / 2 >= bleedH - 0.5
    );
  })();

  /** ประกอบภาพจริงตามตัวเลขที่วางไว้ (ขนาดเท่าพื้นที่ตัดตก) */
  async function buildComposite(): Promise<File | null> {
    if (!src || !pl) return null;
    const scale = Math.min(EXPORT_DPI / 25.4, EXPORT_MAX_EDGE / Math.max(bleedW, bleedH));
    const W = Math.max(1, Math.round(bleedW * scale));
    const H = Math.max(1, Math.round(bleedH * scale));
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const im = await new Promise<HTMLImageElement | null>((res) => {
      const i = new window.Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src.url;
    });
    if (!im) return null;
    ctx.save();
    ctx.translate(pl.cxMm * scale, pl.cyMm * scale);
    ctx.rotate((pl.rotDeg * Math.PI) / 180);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, (-pl.wMm / 2) * scale, (-pl.hMm / 2) * scale, pl.wMm * scale, pl.hMm * scale);
    ctx.restore();
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return null;
    const stem = src.file.name.replace(/\.[^.]+$/, "") || "artwork";
    return new File([blob], `${stem}-บนเทมเพลต.jpg`, { type: "image/jpeg" });
  }

  async function apply() {
    if (!src || !pl || busy) return;
    setBusy(true);
    setErr("");
    try {
      const composite = await buildComposite();
      if (!composite) {
        setErr("ประกอบภาพไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      const n = (v: number) => Math.round(v * 10) / 10;
      await onApply({
        composite,
        source: src.file,
        placement: pl,
        dpi,
        summary: `${title} · ${n(artW / 10)}×${n(artH / 10)} ซม. · ${dpi} DPI`,
        spec:
          `กรอบ ${n(bleedW)}×${n(bleedH)}mm (งานจริง ${n(artW)}×${n(artH)} + ตัดตก ${n(bleedX)}/${n(bleedY)}) · ` +
          `ลาย ${n(pl.wMm)}×${n(pl.hMm)}mm กึ่งกลางที่ ${n(pl.cxMm)},${n(pl.cyMm)}mm · หมุน ${n(pl.rotDeg)}° · ${dpi} DPI`,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  // เปอร์เซ็นต์ของกรอบตัดตก — ใช้วางเส้นไกด์/รูปด้วย CSS ให้ยืดตามจอเอง
  const pctW = (mm: number) => `${(mm / bleedW) * 100}%`;
  const pctH = (mm: number) => `${(mm / bleedH) * 100}%`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-stone-900/70 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col bg-white sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl sm:shadow-2xl">
        {/* หัว */}
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-stone-800">🖼 วางลายบนเทมเพลต</p>
            <p className="truncate text-[11px] text-stone-500">
              {title} · งานจริง {Math.round(artW) / 10}×{Math.round(artH) / 10} ซม. · ตัดตก{" "}
              {bleedX === bleedY ? `${bleedX} มม.` : `${bleedX}/${bleedY} มม.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ✕ ปิด
          </button>
        </div>

        {/* พื้นที่วางลาย */}
        <div className="flex-1 overflow-auto bg-stone-50 p-4">
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative mx-auto max-h-full touch-none select-none overflow-hidden rounded-lg bg-white shadow-[0_2px_14px_rgba(28,25,23,.12)]"
            style={{ aspectRatio: `${bleedW} / ${bleedH}`, width: "100%", maxWidth: `min(100%, ${bleedW / bleedH * 60}vh)`, cursor: pl ? "move" : "default" }}
          >
            {/* ลายของลูกค้า */}
            {src && pl && (
              <img
                ref={imgRef}
                src={src.url}
                alt="ลายที่กำลังวาง"
                draggable={false}
                className="pointer-events-none absolute origin-center"
                style={{
                  left: pctW(pl.cxMm - pl.wMm / 2),
                  top: pctH(pl.cyMm - pl.hMm / 2),
                  width: pctW(pl.wMm),
                  height: pctH(pl.hMm),
                  // ⚠️ ต้องปลดเพดานของ preflight (img{max-width:100%}) ไม่งั้นลายที่ซูมเกินกรอบ
                  // จะถูกบีบให้เท่ากรอบ → ที่เห็นบนจอไม่ตรงกับไฟล์ที่ประกอบออกมา
                  maxWidth: "none",
                  maxHeight: "none",
                  transform: `rotate(${pl.rotDeg}deg)`,
                }}
              />
            )}

            {/* รูปจากไฟล์เทมเพลตจริง — ไกด์จาง ๆ ให้เห็นว่างานหน้าตาแบบไหน */}
            {guideUrl && showGuide && (
              <img
                src={guideUrl}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-25 mix-blend-multiply"
              />
            )}

            {/* เส้นไกด์: ขอบงานจริง (ตัดตามนี้) + เขตปลอดภัย */}
            <div
              className="pointer-events-none absolute border-2 border-dashed border-rose-500/70"
              style={{ left: pctW(bleedX), top: pctH(bleedY), width: pctW(artW), height: pctH(artH) }}
            />
            {safeMm > 0 && (
              <div
                className="pointer-events-none absolute border border-dashed border-emerald-500/70"
                style={{
                  left: pctW(bleedX + safeMm),
                  top: pctH(bleedY + safeMm),
                  width: pctW(Math.max(0, artW - safeMm * 2)),
                  height: pctH(Math.max(0, artH - safeMm * 2)),
                }}
              />
            )}

            {!src && (
              <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 text-center">
                <span className="text-4xl">🖼</span>
                <span className="text-sm font-bold text-stone-700">เลือกรูปลายของคุณ</span>
                <span className="text-[11px] text-stone-400">JPG · PNG · WEBP (ไม่เกิน 15MB)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void pick(e.target.files?.[0])}
                />
              </label>
            )}
          </div>

          {/* ป้ายบอกเส้น */}
          <p className="mt-2 text-center text-[11px] text-stone-400">
            <span className="text-rose-500">▬</span> เส้นตัดจริง · <span className="text-emerald-500">▬</span> เขตปลอดภัย
            (อย่าให้ข้อความเลยออกไป) · ลากเพื่อเลื่อน · หุบ-กางสองนิ้วเพื่อย่อ-ขยาย
          </p>
        </div>

        {/* แถบเครื่องมือ + สถานะ */}
        <div className="border-t border-stone-100 px-4 py-3">
          {err && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{err}</p>}

          {src && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  dpi >= DPI_WARN
                    ? "bg-emerald-50 text-emerald-700"
                    : dpi >= DPI_BAD
                      ? "bg-amber-50 text-amber-800"
                      : "bg-rose-50 text-rose-700"
                }`}
              >
                {dpi >= DPI_WARN ? "✓ ความคมชัดดี" : dpi >= DPI_BAD ? "⚠️ ค่อนข้างเบลอ" : "⚠️ เบลอแน่นอน"} · {dpi} DPI
              </span>
              {!covers && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                  ⚠️ ลายไม่คลุมถึงขอบตัด — จะมีขอบขาว
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <label className="cursor-pointer rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-200">
              {src ? "🔄 เปลี่ยนรูป" : "🖼 เลือกรูป"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void pick(e.target.files?.[0])}
              />
            </label>
            <button type="button" onClick={() => fill()} disabled={!src} className={toolBtn}>
              ⤢ เต็มพื้นที่
            </button>
            <button type="button" onClick={fit} disabled={!src} className={toolBtn}>
              ⧉ พอดีกรอบ
            </button>
            <button type="button" onClick={() => zoomBy(1.1)} disabled={!src} className={toolBtn}>
              ＋
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.1)} disabled={!src} className={toolBtn}>
              −
            </button>
            <button type="button" onClick={() => rotate(90)} disabled={!src} className={toolBtn}>
              ↻ หมุน
            </button>
            <button type="button" onClick={() => setSwapped((v) => !v)} className={toolBtn}>
              ⇄ สลับแนว
            </button>
            {guideUrl && (
              <button type="button" onClick={() => setShowGuide((v) => !v)} className={toolBtn}>
                {showGuide ? "👁 ซ่อนไกด์" : "👁 แสดงไกด์"}
              </button>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!src || busy}
              className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "กำลังประกอบภาพ…" : "✓ ใช้ลายนี้"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const toolBtn =
  "rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-40";
