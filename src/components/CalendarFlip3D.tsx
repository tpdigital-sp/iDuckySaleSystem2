"use client";

/**
 * 🧊 โมเดล 3D ปฏิทินตั้งโต๊ะ — พลิกหน้าข้ามสันห่วงด้านบนให้ลูกค้าเห็นว่าแต่ละแผ่นด้านหน้า/หลังเป็นอะไร
 * (ผู้ใช้สั่ง 14 ต.ค. 69 "เพิ่มโมเดล 3D การเปิดหน้า ลูกค้าจะได้เข้าใจเพิ่มขึ้น")
 *
 * CSS 3D ล้วน (ไม่ใช้ไลบรารี): แผ่นห้อยจากสันห่วง (transform-origin บน) · ยังไม่พลิก = เอียงมาด้านหน้า (rotateX +α)
 * พลิกแล้ว = หมุนต่อข้ามด้านบนไปพาดด้านหลัง (rotateX 360−α) → transition หมุนผ่าน 180° = เห็นแผ่นลอยข้ามสัน
 * ด้านหลังของแผ่น = หน้า rotateY(180) (มองจากด้านหลังแล้วตั้งตรง) · ลากซ้าย-ขวาเพื่อหมุนดูรอบ ๆ
 */

import { useEffect, useRef, useState } from "react";

export interface FlipSheet {
  /** รูปด้านหน้า (dataURL) · ไม่มี = แผ่นขาว */
  front?: string;
  back?: string;
  frontName: string;
  backName: string;
}

const ALPHA = 17; // มุมเอียงของแต่ละฝั่งของขาตั้ง (องศาจากแนวดิ่ง)

export default function CalendarFlip3D({ sheets, aspect, title, onClose }: { sheets: FlipSheet[]; aspect: number; title: string; onClose: () => void }) {
  /** จำนวนแผ่นที่พลิกไปด้านหลังแล้ว (0 = เห็นแผ่นแรก) */
  const [cur, setCurRaw] = useState(0);
  /**
   * ✋ ยกแผ่นถัดไปค้างไว้ (0 = วางอยู่ · 1 = พลิกครบ) — เลื่อนแถบหยุดตรงไหนก็ได้ เพื่อดูหลังแผ่น (ผู้ใช้ขอ 14 ต.ค. 69)
   * ยกถึงกลาง (0.5) = แผ่นตั้งตรงเหนือสันห่วง หันหลังแผ่นมาทางคนดู
   */
  const [lift, setLift] = useState(0);
  const [liftDrag, setLiftDrag] = useState(false);
  const setCur = (fn: (c: number) => number) => {
    setLift(0);
    setCurRaw(fn);
  };
  const [ry, setRy] = useState(-28);
  const [rx] = useState(-14);
  /**
   * 🖱 ลากบนภาพ: แนวตั้ง = จับแผ่นพลิก (ขึ้น = เปิดแผ่นถัดไป · ลง = ดึงแผ่นที่พลิกแล้วกลับมา) · แนวนอน = หมุนดูรอบ ๆ
   * (ผู้ใช้ขอ 14 ต.ค. 69 "ใช้เมาส์ลากเปิดได้") — ตัดสินทิศหลังลากเกิน 6px · ปล่อยกลางทาง = ค้างไว้ดูหลังแผ่น
   */
  const drag = useRef<{ x: number; y: number; ry: number; rx: number; mode: "" | "view" | "page"; base: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /**
   * 🔍 ซูม (ผู้ใช้ขอ 14 ต.ค. 69 "ขยายภาพได้") — ล้อเมาส์ · หยิก 2 นิ้ว · ปุ่ม − / + · ดับเบิลคลิก
   */
  const [zoom, setZoom] = useState(1);
  const clampZ = (z: number) => Math.max(0.7, Math.min(3, z));
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const [boxW, setBoxW] = useState(640);
  const [boxH, setBoxH] = useState(480);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBoxW(el.clientWidth);
      setBoxH(el.clientHeight);
    });
    ro.observe(el);
    setBoxW(el.clientWidth);
    setBoxH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        setLift(0);
        setCurRaw((c) => Math.min(sheets.length, c + 1));
      }
      if (e.key === "ArrowLeft") {
        setLift(0);
        setCurRaw((c) => Math.max(0, c - 1));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, sheets.length]);

  // ขนาดแผ่นบนจอ — พอดีกล่อง (แนวนอนกว้างกว่า)
  // สันห่วงอยู่กลางกล่อง — แผ่นที่ยกขึ้น (เหนือสัน) กับแผ่นที่ห้อยลง (ใต้สัน) อยู่ในกรอบทั้งคู่
  const w = Math.min(aspect >= 1 ? 340 : 250, boxW * 0.62, boxH * 0.42 * aspect);
  const h = w / aspect;
  /** ส่วนของแผ่นที่ยกอยู่ที่โผล่เหนือสันห่วง → เลื่อนทั้งตัวลงให้อยู่กลางกล่องเสมอ (ผู้ใช้ขอให้ปฏิทินอยู่กลาง 14 ต.ค. 69) */
  const liftAng = ((ALPHA + lift * (360 - 2 * ALPHA)) * Math.PI) / 180;
  const above = lift > 0 && cur < sheets.length ? Math.max(0, -h * Math.cos(liftAng)) : 0;
  const below = h * Math.cos((ALPHA * Math.PI) / 180);
  const ridgeTop = (boxH - below + above) / 2;
  const showingBack = Math.abs((((ry % 360) + 360) % 360) - 180) < 90; // หมุนดูจากด้านหลังอยู่
  const viewSheet = showingBack ? cur - 1 : cur;
  const lifting = lift > 0.02 && cur < sheets.length;
  /** สีป้ายตามสิ่งที่เห็นอยู่: หน้า = ฟ้า · หลัง = ส้ม */
  const capBack = lifting ? lift > 0.3 && lift < 0.85 : showingBack;
  const caption = lifting
    ? `ยกแผ่น ${cur + 1} · ${lift > 0.3 && lift < 0.85 ? `เห็นหลังแผ่น: ${sheets[cur].backName}` : `ด้านหน้า: ${sheets[cur].frontName}`}`
    : viewSheet >= 0 && viewSheet < sheets.length
      ? `แผ่น ${viewSheet + 1} · ${showingBack ? `ด้านหลัง: ${sheets[viewSheet].backName}` : `ด้านหน้า: ${sheets[viewSheet].frontName}`}`
      : showingBack
        ? "ด้านหลังขาตั้ง (ยังไม่ได้พลิกแผ่นไหน)"
        : "พลิกครบทุกแผ่นแล้ว";

  const face = (src: string | undefined, back: boolean) => (
    <div
      className="absolute inset-0 overflow-hidden bg-white"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
        boxShadow: "inset 0 0 0 1px rgba(15,23,42,.08)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" draggable={false} className="h-full w-full select-none object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[11px] font-semibold text-stone-300">หน้าว่าง</div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 🎨 หัวกรอบ (ออกแบบใหม่ 14 ต.ค. 69) — ชื่อสั้น · รูปแบบงานบรรทัดรอง · คำแนะนำย้ายไปป้ายบนภาพ */}
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">
            🧊
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold leading-tight text-stone-800">ดูแบบ 3D</p>
            <p className="truncate text-xs text-stone-500">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div
          ref={boxRef}
          className="relative mx-3 h-[min(60vh,500px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#f1f5f9_55%,#e2e8f0_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
          style={{ perspective: 1500 }}
          onWheel={(e) => {
            setZoom((z) => clampZ(z * Math.exp(-e.deltaY * 0.0015)));
          }}
          onDoubleClick={(e) => {
            setZoom((z) => (z > 1.05 ? 1 : 2));
          }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pts.current.size === 2) {
              // หยิก 2 นิ้ว = ซูม (ยกเลิกการลากพลิก/หมุนที่เริ่มไว้)
              const [a, b] = [...pts.current.values()];
              pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
              drag.current = null;
              setLiftDrag(false);
              return;
            }
            drag.current = { x: e.clientX, y: e.clientY, ry, rx, mode: "", base: lift };
          }}
          onPointerMove={(e) => {
            if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch.current && pts.current.size === 2) {
              const [a, b] = [...pts.current.values()];
              setZoom(clampZ((pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch.current.d)));
              return;
            }
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.mode) {
              if (Math.hypot(dx, dy) < 6) return;
              if (Math.abs(dy) > Math.abs(dx)) {
                // ลากลงตอนไม่มีแผ่นยกอยู่ = ดึงแผ่นที่พลิกล่าสุดกลับมา (เริ่มจากพลิกครบ)
                if (dy > 0 && d.base === 0) {
                  if (cur === 0) return;
                  setCurRaw(cur - 1);
                  d.base = 1;
                  setLift(1);
                } else if (cur >= sheets.length) return;
                d.mode = "page";
                setLiftDrag(true);
              } else d.mode = "view";
            }
            if (d.mode === "view") setRy(d.ry + dx * 0.45);
            else setLift(Math.max(0, Math.min(1, d.base - dy / (h * 1.4))));
          }}
          onPointerUp={(e) => {
            pts.current.delete(e.pointerId);
            if (pts.current.size < 2) pinch.current = null;
            const d = drag.current;
            drag.current = null;
            if (d?.mode !== "page") return;
            setLiftDrag(false);
            // ปล่อยใกล้สุดทาง = พลิกไปเลย/วางกลับ · กลางทาง = ค้างไว้ (ดูหลังแผ่น)
            if (lift >= 0.88) {
              setCurRaw((c) => Math.min(sheets.length, c + 1));
              setLift(0);
            } else if (lift <= 0.12) setLift(0);
          }}
          onPointerCancel={(e) => {
            pts.current.delete(e.pointerId);
            pinch.current = null;
            drag.current = null;
            setLiftDrag(false);
          }}
        >
          {/* 🏷 ป้ายบอกสิ่งที่เห็น (มุมซ้ายบน) · คำแนะนำการลาก (ล่างกลาง) */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full bg-white/90 py-1.5 pl-1.5 pr-3.5 shadow-sm ring-1 ring-stone-200 backdrop-blur">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${capBack ? "bg-amber-500" : "bg-sky-600"}`}>
              {capBack ? "หลัง" : "หน้า"}
            </span>
            <span className="truncate text-xs font-bold text-stone-700">{caption}</span>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-stone-900/70 px-3.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            <span>↕ ลากขึ้น-ลง = พลิกแผ่น</span>
            <span className="h-3 w-px bg-white/30" />
            <span>↔ ลากซ้าย-ขวา = หมุนดู</span>
            <span className="h-3 w-px bg-white/30" />
            <span>🔍 ล้อเมาส์/หยิก = ซูม</span>
          </div>
          {/* 🔍 ปุ่มซูม (มุมขวาบน) */}
          <div
            className="absolute right-3 top-3 z-10 flex items-center rounded-full bg-white/90 p-0.5 shadow-sm ring-1 ring-stone-200 backdrop-blur"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoom((z) => clampZ(z / 1.25))}
              className="grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-stone-600 hover:bg-stone-100"
              aria-label="ซูมออก"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-w-[52px] rounded-full px-1 text-xs font-extrabold text-stone-700 hover:bg-stone-100"
              title="กลับขนาดปกติ"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZ(z * 1.25))}
              className="grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-stone-600 hover:bg-stone-100"
              aria-label="ซูมเข้า"
            >
              +
            </button>
          </div>
          <div
            className="absolute inset-0"
            style={{
              transformStyle: "preserve-3d",
              transform: `scale(${zoom})`,
              // ซูมรอบจุดกลางกล่องเสมอ — ปฏิทินถูกจัดกลางกล่องอยู่แล้ว (เดิมซูมเข้าหาเมาส์ ภาพหลุดไปข้าง · ผู้ใช้แจ้ง 14 ต.ค. 69)
              transformOrigin: "50% 50%",
              transition: pinch.current ? "none" : "transform .25s ease-out",
            }}
          >
            {/* เงาบนโต๊ะ */}
            <div
              className="pointer-events-none absolute left-1/2 rounded-[50%] bg-stone-900/15 blur-xl"
              style={{
                width: w * 1.1,
                height: 40,
                top: ridgeTop + below + 10,
                transform: "translateX(-50%)",
                transition: liftDrag ? "none" : "top .9s cubic-bezier(.45,.05,.25,1)",
              }}
            />
            <div
              className="absolute left-1/2"
              style={{
                top: ridgeTop,
                transformStyle: "preserve-3d",
                transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
                transition:
                  drag.current?.mode === "view" ? "none" : liftDrag ? "transform .5s ease" : "transform .5s ease, top .9s cubic-bezier(.45,.05,.25,1)",
              }}
            >
              {/* ขาตั้งด้านหลัง (กระดาษแข็ง) — อยู่ด้านในของแผ่นที่พลิกไปแล้ว */}
              <div
                className="absolute"
                style={{
                  left: -w / 2,
                  top: 0,
                  width: w,
                  height: h,
                  transformOrigin: "top center",
                  transform: `rotateX(${360 - ALPHA + 0.6}deg)`,
                  transformStyle: "preserve-3d",
                }}
              >
                <div className="absolute inset-0" style={{ background: "linear-gradient(#cdb89a,#b9a17e)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.1)" }} />
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(#bfa784,#a88f6b)", transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
                />
              </div>
              {sheets.map((s, i) => {
                const flipped = i < cur;
                // ซ้อนกันเล็กน้อย กันภาพกระพริบ: ยังไม่พลิก = ลึกเข้าไปทีละนิด · พลิกแล้ว = แผ่นล่าสุดอยู่นอกสุด
                const ang = flipped ? 360 - ALPHA - i * 0.35 : i === cur && lift > 0 ? ALPHA + lift * (360 - 2 * ALPHA) : ALPHA - (i - cur) * 0.35;
                return (
                  <div
                    key={i}
                    className="absolute"
                    style={{
                      left: -w / 2,
                      top: 0,
                      width: w,
                      height: h,
                      transformOrigin: "top center",
                      transformStyle: "preserve-3d",
                      transform: `rotateX(${ang}deg)`,
                      transition: liftDrag && i === cur ? "none" : "transform .9s cubic-bezier(.45,.05,.25,1)",
                    }}
                  >
                    {face(s.front, false)}
                    {face(s.back, true)}
                  </div>
                );
              })}
              {/* ห่วงลวดที่สัน */}
              <div
                className="absolute"
                style={{
                  left: -w / 2 + w * 0.06,
                  top: -6,
                  width: w * 0.88,
                  height: 12,
                  transform: "rotateX(90deg)",
                  background: "repeating-linear-gradient(90deg, #475569 0 3px, transparent 3px 9px)",
                  borderRadius: 6,
                }}
              />
              <div
                className="absolute"
                style={{
                  left: -w / 2 + w * 0.06,
                  top: -5,
                  width: w * 0.88,
                  height: 10,
                  background: "repeating-linear-gradient(90deg, #334155 0 3px, transparent 3px 9px)",
                  borderRadius: 5,
                }}
              />
            </div>
          </div>
        </div>

        {/* 🎛 แผงควบคุม (ออกแบบใหม่ 14 ต.ค. 69): แถว 1 = ◀ จุดบอกแผ่น ▶ · แถว 2 = ดูด้านหน้า/หลัง + ยกแผ่นค้าง */}
        <div className="space-y-3 px-5 pb-4 pt-3">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={cur === 0 && !lifting}
              onClick={() => setCur((c) => Math.max(0, c - 1))}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-30"
              aria-label="ย้อนแผ่น"
              title="ย้อนแผ่น (←)"
            >
              ‹
            </button>
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-1.5" role="tablist" aria-label="แผ่น">
              {sheets.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === cur}
                  title={`แผ่น ${i + 1}`}
                  onClick={() => setCur(() => i)}
                  className={`h-2.5 rounded-full transition-all ${i === cur ? "w-7 bg-sky-600" : i < cur ? "w-2.5 bg-sky-300" : "w-2.5 bg-stone-300 hover:bg-stone-400"}`}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={cur >= sheets.length}
              onClick={() => setCur((c) => Math.min(sheets.length, c + 1))}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-600 text-lg text-white shadow-[0_4px_12px_rgba(2,132,199,.35)] transition hover:bg-sky-700 disabled:opacity-30"
              aria-label="พลิกแผ่น"
              title="พลิกแผ่น (→)"
            >
              ›
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="มุมมอง">
              {[
                { back: false, label: "ด้านหน้า" },
                { back: true, label: "ด้านหลัง" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={showingBack === o.back}
                  onClick={() => showingBack !== o.back && setRy((v) => v + 180)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    showingBack === o.back
                      ? o.back
                        ? "bg-amber-500 text-white shadow-sm"
                        : "bg-sky-600 text-white shadow-sm"
                      : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  👁 {o.label}
                </button>
              ))}
            </span>
            {cur < sheets.length && (
              <span className="flex items-center gap-2 rounded-full bg-stone-50 py-1 pl-3 pr-1 ring-1 ring-stone-200/70">
                <span className="text-xs font-bold text-stone-500">✋ ยกแผ่น</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(lift * 100)}
                  onChange={(e) => setLift(Number(e.target.value) / 100)}
                  onPointerDown={() => setLiftDrag(true)}
                  onPointerUp={() => {
                    setLiftDrag(false);
                    if (lift >= 0.95) setCur((c) => Math.min(sheets.length, c + 1));
                  }}
                  className="w-32 accent-sky-600 sm:w-40"
                  aria-label="ยกแผ่นขึ้น"
                />
                <button
                  type="button"
                  onClick={() => setLift((v) => (v > 0.3 && v < 0.85 ? 0 : 0.5))}
                  className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-50"
                >
                  {lift > 0.3 && lift < 0.85 ? "↓ วางลง" : "👀 ดูหลังแผ่น"}
                </button>
              </span>
            )}
          </div>
          {lift > 0.3 && lift < 0.85 && (
            <p className="text-center text-[11px] text-stone-400">หลังแผ่นกลับหัวตอนยกขึ้น — พิมพ์ให้อ่านตรงเมื่อพลิกไปพาดด้านหลังขาตั้ง</p>
          )}
        </div>
      </div>
    </div>
  );
}
