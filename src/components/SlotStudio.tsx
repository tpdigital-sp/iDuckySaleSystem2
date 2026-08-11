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
  /** 👕 สกินสินค้า (PNG โปร่งใส) — วางทับให้เห็นเป็นสินค้าจริง (ไม่ติดไปกับไฟล์พิมพ์) */
  skinUrl?: string;
  /** ต้องใส่รูปครบทุกช่องถึงจะกดใช้ลายได้ */
  requireAll?: boolean;
  /** ที่อยู่ไฟล์ .ai ต้นฉบับ + จำนวนชิ้นต่อแผ่น — จดติดไปกับออเดอร์ */
  tplUrl?: string;
  perSheet?: number;
  /** กลับมาแก้ของเดิม (ในหน้าเดียวกัน) */
  initial?: (SlotShot | null)[];
  /**
   * อัปโหลดไฟล์ต้นฉบับของแต่ละช่องขึ้นเซิร์ฟเวอร์ (คืน URL)
   * ทำตอนกด "ใช้ลายนี้" ครั้งเดียว — จะได้ไม่เปลืองโควตากับรูปที่ลูกค้าลองแล้วเปลี่ยนใจ
   */
  uploadSource?: (f: File) => Promise<string>;
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
  skinUrl,
  requireAll,
  tplUrl,
  perSheet,
  initial,
  uploadSource,
  onApply,
}: Props) {
  const [shots, setShots] = useState<(SlotShot | null)[]>(() => slots.map((_, i) => initial?.[i] ?? null));
  const [sel, setSel] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const drag = useRef<{ i: number; pointerId: number; x: number; y: number; s: SlotShot } | null>(null);
  /** นิ้วที่แตะกระดานอยู่ตอนนี้ (id → ตำแหน่ง) — ใช้จับท่าบีบสองนิ้ว */
  const pts = useRef<Map<number, { x: number; y: number }>>(new Map());
  /** ท่าบีบที่กำลังทำอยู่ — ผูกกับนิ้วสองนิ้วที่เริ่มท่า (a/b) ไม่ใช่ "สองนิ้วแรกใน map" */
  const pinch = useRef<{ i: number; a: number; b: number; dist: number; zoom: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  /** ความกว้างจริงของกระดานบนจอ — ใช้ตัดสินว่าช่องเล็กเกินจะใส่ปุ่มเต็ม ๆ ไหม */
  const [stageW, setStageW] = useState(0);
  /** โชว์สกินสินค้าทับช่องอยู่ไหม */
  const [showSkin, setShowSkin] = useState(true);
  /** จอสัมผัส — ลากไฟล์มาวางไม่ได้ ต้องบอกให้ "แตะ" แทน (เช็คหลัง mount กัน hydration ไม่ตรง) */
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  }, []);

  const W = frame.canvasWMm;
  const H = frame.canvasHMm;

  // วัดความกว้างกระดานไว้ย่อปุ่มในช่องเล็ก (มือถือ/ตารางหลายช่อง ปุ่มเต็มจะล้นกรอบ)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setStageW(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

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
    setSel(i);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // จับนิ้วไว้กับช่องนี้ เผื่อนิ้วเลื่อนออกนอกช่องตอนลาก (บางเบราว์เซอร์โยน error — ไม่เป็นไร)
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {}

    const other = drag.current?.i === i ? drag.current.pointerId : null;
    if (other !== null) {
      // นิ้วที่สองแตะช่องเดียวกัน → เลิกลาก เข้าโหมดบีบซูมแทน
      drag.current = null;
      pinch.current = { i, a: other, b: e.pointerId, dist: spread(other, e.pointerId), zoom: s.zoom };
      return;
    }
    drag.current = { i, pointerId: e.pointerId, x: e.clientX, y: e.clientY, s };
  }

  /** ระยะห่างระหว่างนิ้วสองนิ้วที่ระบุ */
  function spread(a: number, b: number): number {
    const p = pts.current.get(a);
    const q = pts.current.get(b);
    if (!p || !q) return 0;
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  function onMove(e: React.PointerEvent) {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const p = pinch.current;
    if (p) {
      const now = spread(p.a, p.b);
      if (p.dist > 0 && now > 0) setZoom(p.i, (p.zoom * now) / p.dist);
      return;
    }

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
      const { mx, my } = panLimit(s, sl);
      next[d.i] = {
        ...s,
        offX: clamp(d.s.offX + (e.clientX - d.x) / slotW, -mx, mx),
        offY: clamp(d.s.offY + (e.clientY - d.y) / slotH, -my, my),
      };
      return next;
    });
  }
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    const p = pinch.current;
    if (p && (p.a === e.pointerId || p.b === e.pointerId)) pinch.current = null;
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  /**
   * ขนาดรูปแบบ cover เทียบกับช่อง (% ของช่อง — อย่างน้อยด้านละ 100)
   * ใช้ร่วมกันทั้งตอนวาดบนจอ ตอนจำกัดระยะเลื่อน และตอนส่งออก จะได้ตรงกันเป๊ะ
   */
  function coverPct(s: SlotShot, sl: TemplateSlot) {
    const ratio = s.natW / s.natH;
    const slotRatio = (sl.wPct * W) / (sl.hPct * H);
    return {
      wPct: ratio > slotRatio ? (ratio / slotRatio) * 100 : 100,
      hPct: ratio > slotRatio ? 100 : (slotRatio / ratio) * 100,
    };
  }

  /**
   * เลื่อนได้ไกลสุดเท่าไรถึงจะยังไม่เห็นพื้นขาว — คิดจากส่วนที่รูป "ล้น" ออกนอกช่อง
   * รูปที่พอดีช่องเป๊ะ (เช่น ซูม 1 และสัดส่วนเท่าช่อง) เลื่อนไม่ได้เลย
   */
  function panLimit(s: SlotShot, sl: TemplateSlot) {
    const { wPct, hPct } = coverPct(s, sl);
    return {
      mx: Math.max(0, ((wPct * s.zoom) / 100 - 1) / 2),
      my: Math.max(0, ((hPct * s.zoom) / 100 - 1) / 2),
    };
  }

  /** เปลี่ยนซูมแล้วดึงรูปกลับเข้าขอบเขต (ซูมออกทีหลังไม่งั้นจะเหลือขอบขาว) */
  function setZoom(i: number, z: number) {
    setShots((cur) =>
      cur.map((s, k) => {
        const sl = slots[k];
        if (k !== i || !s || !sl) return s;
        const next = { ...s, zoom: clamp(z, 1, 3) };
        const { mx, my } = panLimit(next, sl);
        return { ...next, offX: clamp(next.offX, -mx, mx), offY: clamp(next.offY, -my, my) };
      }),
    );
  }

  /** DPI ของรูปในช่อง i ณ ขนาดที่วาง */
  function dpiOf(i: number): number | null {
    const s = shots[i];
    const sl = slots[i];
    if (!s || !sl) return null;
    const slotWmm = (W * sl.wPct) / 100;
    const slotHmm = (H * sl.hPct) / 100;
    // เต็มช่องแบบ cover → ด้านที่ "คับ" กำหนดสเกล
    // ซูมเข้า = รูปถูกขยาย ใช้พิกเซลต้นฉบับน้อยลงบนพื้นที่เท่าเดิม → มม.ต่อพิกเซลมากขึ้น
    const k = Math.max(slotWmm / s.natW, slotHmm / s.natH) * s.zoom;
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

      /**
       * อัปไฟล์ต้นฉบับของแต่ละช่องขึ้นเซิร์ฟเวอร์
       * — กราฟฟิกจะได้ไฟล์เต็มรายช่อง ไม่ใช่แค่ภาพรวมที่แบนแล้ว
       * — และกดกลับมาแก้ได้แม้ลิงก์ชั่วคราวในเบราว์เซอร์หมดอายุไปแล้ว
       * อัปไม่ขึ้นก็ยังสั่งได้ (ภาพที่ประกอบแล้วพอผลิตได้) แค่ไม่มีลิงก์ต้นฉบับ
       */
      const saved: (SlotShot | null)[] = [...shots];
      if (uploadSource) {
        for (let i = 0; i < saved.length; i++) {
          const sh = saved[i];
          if (!sh?.file || /^https?:/.test(sh.url)) continue;
          try {
            saved[i] = { ...sh, url: await uploadSource(sh.file) };
          } catch {
            /* ปล่อยให้ใช้ลิงก์ในเครื่องต่อไป */
          }
        }
        setShots(saved);
      }

      const n = (v: number) => Math.round(v * 10) / 10;
      const parts = slots.map((sl, i) => {
        const s = saved[i];
        const wmm = n((W * sl.wPct) / 100);
        const hmm = n((H * sl.hPct) / 100);
        const src = s && /^https?:/.test(s.url) ? ` · ต้นฉบับ: ${s.url}` : "";
        return `ช่อง ${i + 1} ${wmm}×${hmm}mm ที่ ${n((W * sl.xPct) / 100)},${n((H * sl.yPct) / 100)}mm${
          sl.shape === "circle" ? " (วงกลม)" : ""
        } — ${s ? `${dpiOf(i)} DPI${src}` : "ว่าง"}`;
      });
      await onApply({
        composite,
        shots: saved,
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
                        const { wPct, hPct } = coverPct(s, sl);
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
                      className={`absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden text-center ${
                        isOver ? "bg-sky-200" : "bg-[#c4c4c4]"
                      }`}
                    >
                      {/* ช่องเล็กเหลือแค่ไอคอน ＋ · ช่องกลางเอาปุ่มไม่มีข้อความช่วย · ช่องใหญ่เต็มรูปแบบ */}
                      {(() => {
                        const px = (stageW * sl.wPct) / 100;
                        if (px < 64)
                          return (
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e2653c] text-sm font-bold text-white shadow-sm">
                              ＋
                            </span>
                          );
                        return (
                          <>
                            <span
                              className={`max-w-[92%] truncate rounded-md bg-[#e2653c] font-bold text-white shadow-sm ${
                                px < 120 ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-[11px] sm:text-xs"
                              }`}
                            >
                              🖼 เพิ่มรูป
                            </span>
                            {px >= 120 && (
                              <span className="px-1 text-[10px] font-semibold text-white/95 sm:text-[11px]">
                                {touch ? "แตะตรงไหนก็ได้ในช่อง" : "หรือลากรูปมาวางตรงนี้"}
                              </span>
                            )}
                          </>
                        );
                      })()}
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

            {/*
              👕 สกินสินค้า — ทับบนช่องทั้งหมด ให้เห็นเป็นของจริง
              ⚠️ พรีวิวเท่านั้น ตอนประกอบไฟล์ (build) ไม่ได้วาดสกินลงไป
            */}
            {skinUrl && showSkin && (
              <img src={skinUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
            )}
          </div>
        </div>

        {/* ── แถบปรับรูปในช่องที่เลือก ── */}
        {selShot && sel !== null && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
            <span className="text-[11px] font-bold text-stone-600">ช่อง {sel + 1}</span>
            <button
              type="button"
              onClick={() => selShot && sel !== null && setZoom(sel, selShot.zoom - 0.1)}
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
                if (sel !== null) setZoom(sel, Number(e.target.value) / 100);
              }}
              className="h-1.5 w-40 accent-sky-500"
              aria-label="ซูมรูปในช่อง"
            />
            <button
              type="button"
              onClick={() => selShot && sel !== null && setZoom(sel, selShot.zoom + 0.1)}
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

        {skinUrl && (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setShowSkin((v) => !v)}
              className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-600 transition hover:bg-stone-200"
              title="สกินคือภาพสินค้าที่วางทับให้ดูเหมือนของจริง — ไม่ติดไปกับไฟล์ที่ส่งพิมพ์"
            >
              {showSkin ? "👕 ซ่อนสกิน" : "👕 แสดงสกิน"}
            </button>
          </div>
        )}

        <p className="mt-2 text-center text-[11px] text-stone-400">
          กดที่ช่องเพื่อเพิ่มรูป · {touch ? "ลากด้วยนิ้วเพื่อเลื่อน · บีบสองนิ้วเพื่อซูม" : "ลากรูปในช่องเพื่อเลื่อน"} ·{" "}
          {requireAll ? "ต้องใส่รูปให้ครบทุกช่อง" : "ช่องที่เว้นไว้จะเป็นพื้นขาว"}
        </p>
        {err && <p className="mt-2 text-center text-xs font-semibold text-rose-600">{err}</p>}

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!filled || busy || (!!requireAll && filled < slots.length)}
            className="flex-1 rounded-full bg-sky-500 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-40"
          >
            {busy
              ? "กำลังบันทึก…"
              : requireAll && filled < slots.length
                ? `ยังขาดอีก ${slots.length - filled} ช่อง`
                : `✓ ใช้ลายนี้ (${filled}/${slots.length} ช่อง)`}
          </button>
        </div>
      </div>
    </div>
  );
}
