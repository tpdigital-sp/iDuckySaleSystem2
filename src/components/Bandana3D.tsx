"use client";

/**
 * 🐶🧸 พรีวิว "ดูแบบ 3D" ปลอกคอสัตว์เลี้ยง — วางลายของลูกค้าลงบนผ้าพันคอขาวในรูปตุ๊กตาพุดเดิ้ลของร้าน หมุนดูได้ครบรอบ 360°
 * (23 ต.ค. 69 เจ้าของร้าน: "นำภาพนี้ไปแทนที่ 3D เดิม" → "ทำให้มันหมุนได้รอบให้หน่อย" → ส่งชุดรูป 5 มุม "เพิ่มภาพเข้าไปให้หน่อย")
 *
 * รูปชุด 5 มุม (แถวบนของรูปที่เจ้าของร้านส่ง · ตัดทีละตัว จัดกึ่งกลางลำตัว ขยาย ×2 = 720×1200) อยู่ใน public/mock/collar-animal:
 *   poodle360-<front|q-left|side|back|q-right>.webp  · -mask.png = ผ้าส่วนที่วางลาย (convex hull ของผ้าขาว — ฝั่งเงาไม่แหว่ง)
 *   -knot.png = ปม/ชายผ้า/แถบผ้าท้ายทอย (ย้อมสีมุมผ้าของลาย ไม่แปะลาย) · มุม back มีแต่ knot
 * มุมหมุน (องศา · หมุนรอบตัวน้อง): หน้า 0 · เฉียงซ้าย 45 · ข้าง (จมูกชี้ซ้าย) 90 · หลัง 180 · ข้างกลับด้าน 270 (รูปข้างกลับซ้าย-ขวา) · เฉียงขวา 315
 *   ระหว่างมุมผสมภาพสองรูปข้างเคียง + บีบแนวนอนนิดหน่อย ให้รู้สึกหมุน
 * การวางลาย: แบ่งผ้าในรูปเป็นตาราง (u,v) → Coons patch จากโครงร่าง (ขอบบน T · ขอบซ้าย L · ขอบขวา R · ยอด) → วาดลายทีละสามเหลี่ยมด้วย affine
 *   v ↔ t (ความลึก 0 = ขอบคอ · 1 = ยอด) · u ↔ มุมรอบตัว θ ที่เห็นจากมุมนั้น (ขอบรูป = ขอบผ้าหรือเส้นโค้งคอ) ฉายแบบ sin → s ตำแหน่งตามความกว้างผืน
 *   ผสมแบบ multiply ทับผ้าขาว = เห็นเงา/รอยพับ/ตะเข็บของรูปจริงทะลุลาย · ส่วนโปร่ง/ขาวของลาย = ผ้าขาวตามรูป
 * tie: ลายทั้งอาร์ตบอร์ด · button/strap: ชั้นหน้า = ครึ่งล่างของอาร์ตบอร์ด · ปุ่ม "ดูลายชั้นหลัง" = ครึ่งบน (กลับหัวตามการพับ) วางแทน
 * ⚠️ รูปมีปมผูกท้ายทอย (ตรงกับแบบผูก) · แบบติดกระดุม/ใส่กับสาย ใช้รูปเดียวกัน — ปมในรูปเป็นแค่ภาพประกอบ
 */

import { useEffect, useRef, useState } from "react";
import { BANDANA_STYLE_TH, BANDANA_VIEW_TH, type BandanaMock, type BandanaView } from "@/lib/bandana-mock";
import BandanaFabric3D from "@/components/BandanaFabric3D";
import { ASSET, FRAMES, PH, PW, VIEW_DEG, loadImg, renderBandanaFrame } from "@/lib/bandana-photo";

type Props = {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: BandanaMock;
  title: string;
  onClose: () => void;
};

/**
 * แบบผูก = รูปพุดเดิ้ลใส่ผ้าพันคอผูกปม (หน้านี้) · แบบติดกระดุม / ใส่กับสาย = 3D ตัวผ้าอย่างเดียว (components/BandanaFabric3D)
 * (23 ต.ค. 69 เจ้าของร้าน "อันนี้ไม่ใช่แบบผูก แต่เป็นแบบกระดุม ฉันอยากให้มี 3D ผ้า ที่ไม่ใช่อยู่บนโมเดลหมา")
 */
export default function Bandana3D(props: Props) {
  return props.mock.style === "tie" ? <BandanaPhoto3D {...props} /> : <BandanaFabric3D {...props} />;
}

function BandanaPhoto3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: BandanaMock;
  title: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<BandanaView | "between">("front");
  const [spin, setSpin] = useState(false);
  /** 🔄 ดูลายชั้นหลัง (ผ้า 2 ชั้นพับ) — เอาครึ่งบนของแบบ (กลับหัวตามการพับ) มาวางแทนชั้นหน้า */
  const [inner, setInner] = useState(false);
  const imgs = useRef<Record<string, HTMLImageElement> | null>(null);
  /** ภาพสำเร็จต่อเฟรม (รูป + ลาย) — วาดใหม่เมื่อลาย/ชั้นเปลี่ยน */
  const frames = useRef<HTMLCanvasElement[] | null>(null);
  /** มุมหมุนปัจจุบัน (องศา 0–360) · target = กำลังเลื่อนไปมุมปุ่ม · spin = หมุนโชว์ต่อเนื่อง */
  const ang = useRef({ a: 0, target: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; a: number } | null>(null);
  const goView = (v: BandanaView) => {
    const cur = ang.current.a;
    let t = VIEW_DEG[v];
    while (t - cur > 180) t -= 360;
    while (t - cur < -180) t += 360;
    ang.current.target = t;
    ang.current.spin = false;
    setSpin(false);
  };
  useEffect(() => {
    ang.current.spin = spin;
  }, [spin]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  useEffect(() => {
    let dead = false;
    const keys = ["front", "front-mask", "q-left", "q-left-mask", "q-left-knot", "side", "side-mask", "side-knot", "back", "back-knot", "q-right", "q-right-mask"];
    Promise.all(keys.map((k) => loadImg(`${ASSET}/poodle360-${k}.${/mask|knot/.test(k) ? "png" : "webp"}`)))
      .then((list) => {
        if (dead) return;
        imgs.current = Object.fromEntries(keys.map((k, i) => [k, list[i]]));
        setStatus("ready");
      })
      .catch((e) => {
        console.error("Bandana3D", e);
        if (!dead) setStatus("error");
      });
    return () => {
      dead = true;
    };
  }, []);

  // 🎨 วาดภาพสำเร็จทุกเฟรม (รูป + ลายบนผ้า + ย้อมปม)
  useEffect(() => {
    const im = imgs.current;
    if (status !== "ready" || !im) return;
    frames.current = FRAMES.map((f) => renderBandanaFrame(f, im, sheet, sheetMm, mock.style, inner));
  }, [status, inner, sheet, sheetMm, mock.style]);

  // 🔁 วาดจอตามมุม: ผสมสองเฟรมข้างเคียง + บีบแนวนอนช่วงกลาง (ให้รู้สึกหมุน) · หมุนโชว์ = หมุนวนต่อเนื่อง
  useEffect(() => {
    const cv = canvasRef.current;
    if (status !== "ready" || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    cv.width = PW;
    cv.height = PH;
    let raf = 0;
    let last = performance.now();
    let shown: BandanaView | "between" = "front";
    const smooth = (x: number) => x * x * (3 - 2 * x);
    const norm = (d: number) => ((d % 360) + 360) % 360;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = ang.current;
      if (g.target != null) {
        const d = g.target - g.a;
        if (Math.abs(d) < 0.3) {
          g.a = g.target;
          g.target = null;
        } else g.a += d * Math.min(1, dt * 6);
      } else if (g.spin && !g.dragging) g.a += dt * 50;
      const f = frames.current;
      if (!f) return;
      const a = norm(g.a);
      // หาเฟรมก่อน/หลังมุมปัจจุบัน
      let i = FRAMES.length - 1;
      for (let j = 0; j < FRAMES.length; j++) if (FRAMES[j].deg <= a) i = j;
      const j = (i + 1) % FRAMES.length;
      const d0 = FRAMES[i].deg;
      const d1 = j === 0 ? 360 : FRAMES[j].deg;
      const p = (a - d0) / (d1 - d0);
      // ผสมช่วงกลาง (ปลายทั้งสองเป็นรูปจริงล้วน ไม่ซ้อนเงา)
      const w = smooth(Math.max(0, Math.min(1, (p - 0.2) / 0.6)));
      const sq = 1 - 0.1 * Math.sin(Math.PI * p);
      ctx.clearRect(0, 0, PW, PH);
      const put = (img: HTMLCanvasElement, alpha: number) => {
        if (alpha <= 0.001) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(PW / 2, 0);
        ctx.scale(sq, 1);
        ctx.drawImage(img, -PW / 2, 0);
        ctx.restore();
      };
      put(f[i], 1 - w);
      put(f[j], w);
      const near = (Object.entries(VIEW_DEG) as [BandanaView, number][]).find(([, d]) => Math.min(norm(a - d), norm(d - a)) < 12)?.[0] ?? "between";
      if (near !== shown) {
        shown = near;
        setView(near);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const styleTh = BANDANA_STYLE_TH[mock.style];
  const folded = mock.style !== "tie";
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">
            🐶
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">ปลอกคอ {styleTh}</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · {mock.style === "tie" ? "ผ้าชั้นเดียว ผูกปมท้ายทอย" : mock.style === "button" ? "ผ้า 2 ชั้นพับครึ่ง ติดกระดุมแป๊กท้ายทอย" : "ผ้า 2 ชั้นพับครึ่ง สอดกับสายปลอกคอเดิม"}
            </p>
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
          className="relative mx-3 h-[min(62vh,560px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#f1f5f9_55%,#e2e8f0_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
          onPointerDown={(e) => {
            try {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            } catch {
              // pointer จำลอง/หลุดไปแล้ว — ลากต่อได้โดยไม่ capture
            }
            drag.current = { x: e.clientX, a: ang.current.a };
            ang.current.target = null;
            ang.current.dragging = true;
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            // ลากขวา = น้องหันไปทางขวา (มุมลดลง)
            ang.current.a = d.a - (e.clientX - d.x) * 0.5;
          }}
          onPointerUp={() => {
            drag.current = null;
            ang.current.dragging = false;
          }}
          onPointerCancel={() => {
            drag.current = null;
            ang.current.dragging = false;
          }}
        >
          <canvas ref={canvasRef} className="h-full w-full object-contain" />
          {status !== "ready" && (
            <div className="absolute inset-0 z-20 grid place-items-center">
              {status === "loading" ? (
                <div className="flex flex-col items-center gap-2 text-stone-500">
                  <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
                  <span className="text-xs font-bold">กำลังวางลายบนผ้า…</span>
                </div>
              ) : (
                <p className="max-w-xs rounded-2xl bg-white/90 p-4 text-center text-xs font-bold text-rose-600 ring-1 ring-rose-200">โหลดรูปตัวอย่างไม่ได้ — ลองใหม่อีกครั้ง</p>
              )}
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full bg-white/90 py-1.5 pl-1.5 pr-3.5 shadow-sm ring-1 ring-stone-200 backdrop-blur">
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">🐶 {styleTh}</span>
            <span className="truncate text-xs font-bold text-stone-700">
              {spin ? "หมุนโชว์รอบตัว" : view === "between" ? "มุมเฉียง" : BANDANA_VIEW_TH[view]}
              {inner && folded ? " · ชั้นหลัง" : ""}
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-900/70 px-3.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            ↔ ลากซ้าย-ขวา = หมุนดูรอบตัว
          </div>
        </div>

        <div className="space-y-2.5 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="มุมมอง">
              {(["left", "front", "right", "back"] as BandanaView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : v === "left" ? "⬅ หันซ้าย" : v === "right" ? "หันขวา ➡" : "↩ ด้านหลัง"}
                </button>
              ))}
            </span>
            <button
              type="button"
              aria-pressed={spin}
              onClick={() => {
                ang.current.target = null;
                setSpin((s) => !s);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold ring-1 transition ${spin ? "bg-violet-600 text-white ring-violet-600 shadow-sm" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50"}`}
            >
              {spin ? "⏸ หยุดหมุน" : "🔄 หมุนโชว์รอบตัว"}
            </button>
            {folded && (
              <button
                type="button"
                aria-pressed={inner}
                onClick={() => setInner((v) => !v)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold ring-1 transition ${inner ? "bg-amber-500 text-white ring-amber-500 shadow-sm" : "bg-white text-amber-700 ring-amber-200 hover:bg-amber-50"}`}
              >
                {inner ? "👁 กลับเป็นชั้นหน้า" : "🔁 ดูลายชั้นหลัง"}
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-stone-400">
            {mock.style === "tie"
              ? "ภาพจำลองโดยประมาณ — ลายวางบนผ้าในรูปตัวอย่าง ผ้าชั้นเดียวพิมพ์ด้านหน้า หมุนดูได้รอบตัว · สีจริงอาจต่างจากหน้าจอเล็กน้อย"
              : inner
                ? "กำลังดูชั้นหลัง = ครึ่งบนของแบบ (กลับหัวตามการพับ) วางบนผ้าในรูปแทนชั้นหน้า · สีจริงอาจต่างจากหน้าจอเล็กน้อย"
                : "ภาพจำลองโดยประมาณ — ผืนพับครึ่งตามเส้นประ ครึ่งล่างของแบบอยู่ด้านหน้า กด “ดูลายชั้นหลัง” เพื่อดูครึ่งบน · ปมในรูปเป็นภาพประกอบ · สีจริงอาจต่างจากหน้าจอเล็กน้อย"}
          </p>
        </div>
      </div>
    </div>
  );
}
