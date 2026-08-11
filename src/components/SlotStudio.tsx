"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * 🧩 วางรูปลง "ช่อง" บนเทมเพลต (Theme)
 *
 * ใช้กับงานที่แผ่นเดียวมีหลายรูป — สติกเกอร์ 4 ดวง · photobooth strip · การ์ดหลายช่อง
 * ต่างจากจอวางลายปกติ (TemplateStudio) ตรงที่นั่นวางลายเดียวเต็มกรอบ ส่วนตัวนี้แบ่งเป็นช่อง
 *
 * ทุกช่องกำหนดมาจากหลังบ้านเป็น % ของกรอบงาน — ลูกค้าแค่กด "＋ เพิ่มรูป" ทีละช่อง
 * รูปจะถูกย่อ-ขยายให้เต็มช่องอัตโนมัติ (cover) แล้วเลื่อน/ซูมต่อได้
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { printFrameToken, type TemplateFrame, type TemplateSlot } from "@/lib/design-templates";

/** ความละเอียดตอนส่งออก และเพดานด้านยาว (กันไฟล์ใหญ่เกิน) */
const EXPORT_DPI = 300;
const EXPORT_MAX_EDGE = 4500;
/** ต่ำกว่านี้เตือนว่าจะเบลอ */
const DPI_WARN = 150;

/** รูปที่วางอยู่ในช่องหนึ่ง */
export interface SlotShot {
  file?: File;
  url: string;
  /** ขนาดจริงของไฟล์ (พิกเซล) — ใช้คิด DPI */
  natW: number;
  natH: number;
  /** ซูมเทียบกับ "พอดีเต็มช่อง" (1 = พอดี) */
  zoom: number;
  /** เลื่อนรูปในช่อง เป็นสัดส่วนของขนาดช่อง (-0.5..0.5) */
  offX: number;
  offY: number;
}

export interface SlotResult {
  composite: File;
  /** รูปที่ลูกค้าใส่ในแต่ละช่อง (ไว้กลับมาแก้ในหน้าเดิม) */
  shots: (SlotShot | null)[];
  summary: string;
  head: string;
  spec: string;
  /** DPI ต่ำสุดในบรรดาช่องที่มีรูป */
  dpi: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  frame: TemplateFrame;
  slots: TemplateSlot[];
  /** รูปเทมเพลตจาก .ai — วางเป็นไกด์จาง ๆ ใต้ช่อง */
  guideUrl?: string;
  /** ที่อยู่ไฟล์ .ai ต้นฉบับ + จำนวนชิ้นต่อแผ่น — จดติดไปกับออเดอร์ */
  tplUrl?: string;
  perSheet?: number;
  /** กลับมาแก้ของเดิม (ในหน้าเดียวกัน) */
  initial?: (SlotShot | null)[];
  onApply: (r: SlotResult) => void | Promise<void>;
}

const MAX_MB = 15;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function SlotStudio({
  open,
  onClose,
  title,
  frame,
  slots,
  guideUrl,
  tplUrl,
  perSheet,
  initial,
  onApply,
}: Props) {
  const [shots, setShots] = useState<(SlotShot | null)[]>(() => slots.map((_, i) => initial?.[i] ?? null));
  const [sel, setSel] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const drag = useRef<{ i: number; x: number; y: number; s: SlotShot } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const W = frame.canvasWMm;
  const H = frame.canvasHMm;

  // ปิดด้วย Esc + กันเบราว์เซอร์เปิดไฟล์ทับหน้าเว็บเวลาลากพลาดออกนอกช่อง
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const swallow = (e: DragEvent) => e.dataTransfer?.types.includes("Files") && e.preventDefault();
    window.addEventListener("keydown", esc);
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, [open, onClose]);

  /** อ่านไฟล์ที่ลูกค้าเลือก → ใส่ลงช่อง i (ย่อ-ขยายให้เต็มช่องให้เลย) */
  const put = useCallback(async (i: number, f?: File | null) => {
    setErr("");
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setErr("รับเฉพาะไฟล์ JPG · PNG · WEBP");
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`ไฟล์ใหญ่เกิน ${MAX_MB}MB`);
    const url = URL.createObjectURL(f);
    const im = await new Promise<HTMLImageElement | null>((res) => {
      const x = new window.Image();
      x.onload = () => res(x);
      x.onerror = () => res(null);
      x.src = url;
    });
    if (!im) {
      URL.revokeObjectURL(url);
      return setErr("เปิดรูปนี้ไม่ได้ ลองไฟล์อื่น");
    }
    setShots((cur) => {
      const next = [...cur];
      next[i] = { file: f, url, natW: im.naturalWidth, natH: im.naturalHeight, zoom: 1, offX: 0, offY: 0 };
      return next;
    });
    setSel(i);
  }, []);

  /** ลากรูปในช่องเพื่อเลื่อน */
  function onDown(e: React.PointerEvent, i: number) {
    const s = shots[i];
    if (!s) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSel(i);
    drag.current = { i, x: e.clientX, y: e.clientY, s };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const box = stage.current?.getBoundingClientRect();
    const sl = slots[d.i];
    if (!box || !sl) return;
    const slotW = (box.width * sl.wPct) / 100;
    const slotH = (box.height * sl.hPct) / 100;
    if (slotW < 1 || slotH < 1) return;
    setShots((cur) => {
      const next = [...cur];
      const s = next[d.i];
      if (!s) return cur;
      next[d.i] = {
        ...s,
        offX: clamp(d.s.offX + (e.clientX - d.x) / slotW, -0.5, 0.5),
        offY: clamp(d.s.offY + (e.clientY - d.y) / slotH, -0.5, 0.5),
      };
      return next;
    });
  }
  const onUp = () => {
    drag.current = null;
  };

  /** DPI ของรูปในช่อง i ณ ขนาดที่วาง */
  function dpiOf(i: number): number | null {
    const s = shots[i];
    const sl = slots[i];
    if (!s || !sl) return null;
    const slotWmm = (W * sl.wPct) / 100;
    const slotHmm = (H * sl.hPct) / 100;
    // เต็มช่องแบบ cover → ด้านที่ "คับ" กำหนดสเกล
    const k = Math.max(slotWmm / s.natW, slotHmm / s.natH) / s.zoom;
    const usedW = slotWmm / (s.natW * k); // สัดส่วนพิกเซลที่ถูกใช้จริง
    void usedW;
    const pxPerMm = 1 / k;
    return Math.round(pxPerMm * 25.4);
  }

  const filled = shots.filter(Boolean).length;
  const minDpi = shots.reduce<number | null>((lo, s, i) => {
    if (!s) return lo;
    const d = dpiOf(i);
    return d === null ? lo : lo === null ? d : Math.min(lo, d);
  }, null);

  /** ประกอบทุกช่องเป็นภาพเดียวขนาดเท่ากรอบงาน */
  async function build(): Promise<File | null> {
    const scale = Math.min(EXPORT_DPI / 25.4, EXPORT_MAX_EDGE / Math.max(W, H));
    const cw = Math.max(1, Math.round(W * scale));
    const ch = Math.max(1, Math.round(H * scale));
    const cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = "high";

    for (let i = 0; i < slots.length; i++) {
      const s = shots[i];
      const sl = slots[i];
      if (!s || !sl) continue;
      const im = await new Promise<HTMLImageElement | null>((res) => {
        const x = new window.Image();
        x.onload = () => res(x);
        x.onerror = () => res(null);
        x.src = s.url;
      });
      if (!im) continue;
      const x = (sl.xPct / 100) * cw;
      const y = (sl.yPct / 100) * ch;
      const w = (sl.wPct / 100) * cw;
      const h = (sl.hPct / 100) * ch;
      ctx.save();
      ctx.beginPath();
      if (sl.shape === "circle") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(x, y, w, h);
      ctx.clip();
      // cover + ซูม + เลื่อน (เลื่อนคิดเป็นสัดส่วนของช่อง เหมือนตอนแสดงผล)
      const k = Math.max(w / im.naturalWidth, h / im.naturalHeight) * s.zoom;
      const dw = im.naturalWidth * k;
      const dh = im.naturalHeight * k;
      ctx.drawImage(im, x + (w - dw) / 2 + s.offX * w, y + (h - dh) / 2 + s.offY * h, dw, dh);
      ctx.restore();
    }

    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return null;
    return new File([blob], "ลายบนเทมเพลต.jpg", { type: "image/jpeg" });
  }

  async function apply() {
    if (busy || !filled) return;
    setBusy(true);
    setErr("");
    try {
      const composite = await build();
      if (!composite) throw new Error("ประกอบภาพไม่สำเร็จ");
      const n = (v: number) => Math.round(v * 10) / 10;
      const parts = slots.map((sl, i) => {
        const s = shots[i];
        const wmm = n((W * sl.wPct) / 100);
        const hmm = n((H * sl.hPct) / 100);
        return `ช่อง ${i + 1} ${wmm}×${hmm}mm ที่ ${n((W * sl.xPct) / 100)},${n((H * sl.yPct) / 100)}mm${
          sl.shape === "circle" ? " (วงกลม)" : ""
        } — ${s ? `${dpiOf(i)} DPI` : "ว่าง"}`;
      });
      await onApply({
        composite,
        shots,
        head: `${n(frame.trimWMm / 10)}×${n(frame.trimHMm / 10)} ซม. · ${slots.length} ช่อง`,
        summary: `${title} · ใส่รูป ${filled}/${slots.length} ช่อง`,
        spec: `กรอบ ${n(W)}×${n(H)}mm · ${parts.join(" · ")} ${printFrameToken(W, H, tplUrl, perSheet)}`,
        dpi: minDpi ?? 0,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const selShot = sel !== null ? shots[sel] : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-center bg-stone-900/70 backdrop-blur-sm">
      <div className="mx-auto flex max-h-full w-full max-w-3xl flex-col overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-stone-800">🧩 วางรูปบนเทมเพลต</p>
            <p className="mt-0.5 truncate text-xs text-stone-500">
              {title} · งานจริง {Math.round(frame.trimWMm) / 10}×{Math.round(frame.trimHMm) / 10} ซม. · {slots.length} ช่อง
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-stone-500 hover:bg-stone-100">
            ✕ ปิด
          </button>
        </div>

        {/* ── กระดานงาน ── */}
        <div className="mt-3 flex justify-center">
          <div
            ref={stage}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="relative touch-none select-none bg-white shadow-[0_2px_14px_rgba(28,25,23,.12)] ring-1 ring-stone-300"
            style={{ aspectRatio: `${W} / ${H}`, width: "100%", maxWidth: `min(100%, ${(W / H) * 46}vh)` }}
          >
            {guideUrl && (
              <img src={guideUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-20" />
            )}

            {slots.map((sl, i) => {
              const s = shots[i];
              const isOver = over === i;
              return (
                <div
                  key={sl.id}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setOver(i);
                  }}
                  onDragLeave={() => setOver((c) => (c === i ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOver(null);
                    void put(i, e.dataTransfer.files?.[0]);
                  }}
                  onPointerDown={(e) => onDown(e, i)}
                  style={{
                    left: `${sl.xPct}%`,
                    top: `${sl.yPct}%`,
                    width: `${sl.wPct}%`,
                    height: `${sl.hPct}%`,
                    borderRadius: sl.shape === "circle" ? "50%" : 0,
                  }}
                  className={`absolute overflow-hidden ${s ? "cursor-move" : ""} ${
                    isOver ? "ring-4 ring-sky-400" : sel === i ? "ring-2 ring-sky-500" : ""
                  }`}
                >
                  {s ? (
                    <img
                      src={s.url}
                      alt={`รูปช่อง ${i + 1}`}
                      draggable={false}
                      className="pointer-events-none absolute"
                      style={(() => {
                        // cover + ซูม + เลื่อน (คำนวณเป็น % ของช่อง ให้ตรงกับตอนส่งออก)
                        const kw = 100 / sl.wPct;
                        void kw;
                        const ratio = s.natW / s.natH;
                        const slotRatio = (sl.wPct * W) / (sl.hPct * H);
                        const wPct = ratio > slotRatio ? (ratio / slotRatio) * 100 : 100;
                        const hPct = ratio > slotRatio ? 100 : (slotRatio / ratio) * 100;
                        return {
                          width: `${wPct * s.zoom}%`,
                          height: `${hPct * s.zoom}%`,
                          left: `${50 - (wPct * s.zoom) / 2 + s.offX * 100}%`,
                          top: `${50 - (hPct * s.zoom) / 2 + s.offY * 100}%`,
                          maxWidth: "none",
                          maxHeight: "none",
                        };
                      })()}
                    />
                  ) : (
                    /* ช่องว่าง — กล่องเทาแบบเดียวกับตัวอย่าง มีปุ่มเพิ่มรูปตรงกลาง */
                    <label
                      className={`absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1.5 text-center ${
                        isOver ? "bg-sky-200" : "bg-[#c4c4c4]"
                      }`}
                    >
                      <span className="rounded-md bg-[#e2653c] px-3 py-2 text-[11px] font-bold text-white shadow-sm sm:text-xs">
                        🖼 เพิ่มรูป
                      </span>
                      <span className="px-1 text-[10px] font-semibold text-white/95 sm:text-[11px]">หรือลากรูปมาวางตรงนี้</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          void put(i, f);
                        }}
                      />
                    </label>
                  )}

                  {/* เลขช่อง + ปุ่มลบ (เห็นเมื่อมีรูป) */}
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-stone-900/60 px-1.5 text-[9px] font-bold text-white">
                    {i + 1}
                  </span>
                  {s && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShots((cur) => {
                          const next = [...cur];
                          next[i] = null;
                          return next;
                        });
                        setSel(null);
                      }}
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-stone-900/60 text-[10px] font-bold text-white hover:bg-rose-600"
                      title="เอารูปออกจากช่องนี้"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── แถบปรับรูปในช่องที่เลือก ── */}
        {selShot && sel !== null && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
            <span className="text-[11px] font-bold text-stone-600">ช่อง {sel + 1}</span>
            <button
              type="button"
              onClick={() => setShots((c) => c.map((s, i) => (i === sel && s ? { ...s, zoom: Math.max(1, s.zoom - 0.1) } : s)))}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-bold text-stone-600 ring-1 ring-stone-200"
            >
              −
            </button>
            <input
              type="range"
              min={100}
              max={300}
              value={Math.round(selShot.zoom * 100)}
              onChange={(e) => {
                const z = Number(e.target.value) / 100;
                setShots((c) => c.map((s, i) => (i === sel && s ? { ...s, zoom: z } : s)));
              }}
              className="h-1.5 w-40 accent-sky-500"
              aria-label="ซูมรูปในช่อง"
            />
            <button
              type="button"
              onClick={() => setShots((c) => c.map((s, i) => (i === sel && s ? { ...s, zoom: Math.min(3, s.zoom + 0.1) } : s)))}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-bold text-stone-600 ring-1 ring-stone-200"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={() => setShots((c) => c.map((s, i) => (i === sel && s ? { ...s, zoom: 1, offX: 0, offY: 0 } : s)))}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-stone-600 ring-1 ring-stone-200"
            >
              พอดีช่อง
            </button>
            {(() => {
              const d = dpiOf(sel);
              return d !== null && d < DPI_WARN ? (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">⚠️ อาจเบลอ · {d} DPI</span>
              ) : d !== null ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{d} DPI</span>
              ) : null;
            })()}
          </div>
        )}

        <p className="mt-2 text-center text-[11px] text-stone-400">
          กดที่ช่องเพื่อเพิ่มรูป · ลากรูปในช่องเพื่อเลื่อน · ช่องที่เว้นไว้จะเป็นพื้นขาว
        </p>
        {err && <p className="mt-2 text-center text-xs font-semibold text-rose-600">{err}</p>}

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!filled || busy}
            className="flex-1 rounded-full bg-sky-500 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-40"
          >
            {busy ? "กำลังบันทึก…" : `✓ ใช้ลายนี้ (${filled}/${slots.length} ช่อง)`}
          </button>
        </div>
      </div>
    </div>
  );
}
