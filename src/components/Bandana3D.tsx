"use client";

/**
 * 🐶🧸 พรีวิว "ดูแบบ 3D" ปลอกคอสัตว์เลี้ยง — วางลายของลูกค้าลงบนผ้าพันคอขาวในรูปตุ๊กตาพุดเดิ้ลของร้าน (ด้านหน้า / ด้านข้าง)
 * (23 ต.ค. 69 เจ้าของร้านส่งรูปพุดเดิ้ลใส่ผ้าพันคอขาว 2 มุม "นำภาพนี้ไปแทนที่ 3D เดิม" — แทนหุ่น three.js ที่ปั้นเองแล้วโดนทักว่า "ดูตลก/ไม่ได้สัดส่วน")
 *
 * หมุนได้ (23 ต.ค. 69 "ทำให้มันหมุนได้รอบให้หน่อย"): ลากซ้าย-ขวา / หมุนโชว์ ไล่ หันซ้าย (รูปข้าง) ↔ หน้า ↔ หันขวา (รูปข้างกลับด้าน วางลายอีกครึ่งผืน ตัวหนังสือไม่กลับ)
 *   ผสมภาพมุมข้างเคียง + บีบแนวนอน · ด้านหลังยังไม่มีรูป (ต้องมีรูปเพิ่มถึงจะหมุนครบรอบ)
 *
 * รูป + mask อยู่ใน public/mock/collar-animal (ครึ่งซ้าย/ขวาของรูปต้นฉบับ 768×1024 ต่อมุม):
 *   poodle-front.webp / poodle-front-mask.png   ผ้าขาวด้านหน้า (ขาว = ผ้า)
 *   poodle-side.webp  / poodle-side-mask.png    ผ้าขาวด้านข้าง · poodle-side-knot.png = ปม+ชายผ้าท้ายทอย (ย้อมสีมุมผ้าของลาย)
 *   (mask หาด้วย OpenCV: พิกเซลขาวไม่อมเหลือง r−b<16 ที่ต่อกับจุดกลางผ้า · โครงร่างด้านล่างคือ approxPolyDP ของ mask)
 * การวางลาย: แบ่งผ้าเป็นตาราง (u,v) → Coons patch จากโครงร่าง (ขอบบน T · ขอบซ้าย L · ขอบขวา R · ยอด A) → วาดลายทีละสามเหลี่ยมด้วย affine
 *   u ↔ s (ตำแหน่งตามความกว้างผืน): ด้านหน้าเห็นครึ่งหน้าของรอบคอ (asin ย่อปลาย) · ด้านข้างเห็น s 0.5 (กลาง = ขอบหน้าอก) → 0 (มุมผ้าที่ปม)
 *   v ↔ t (ความลึก 0 = ขอบคอ · 1 = ยอด) · ลึกลงไปผ้าห้อยแบน → ค่อย ๆ กลับเป็นเส้นตรง
 *   ผสมแบบ multiply ทับผ้าขาว = เห็นเงา/รอยพับ/ตะเข็บของรูปจริงทะลุลาย · ส่วนโปร่ง/ขาวของลาย = ผ้าขาวตามรูป
 * tie: ลายทั้งอาร์ตบอร์ด · button/strap: ชั้นหน้า = ครึ่งล่างของอาร์ตบอร์ด · ปุ่ม "ดูลายชั้นหลัง" = ครึ่งบน (กลับหัวตามการพับ) วางแทน
 * ⚠️ รูปมีปมผูกท้ายทอย (ตรงกับแบบผูก) · แบบติดกระดุม/ใส่กับสาย ใช้รูปเดียวกัน — ปมในรูปเป็นแค่ภาพประกอบ
 */

import { useEffect, useRef, useState } from "react";
import { BANDANA_STYLE_TH, BANDANA_VIEW_TH, type BandanaMock, type BandanaView } from "@/lib/bandana-mock";

type Pt = [number, number];
interface Patch {
  /** ขอบบน (ขอบคอ) ซ้าย→ขวา · ซ้าย = u 0 · ขวา = u 1 */
  T: Pt[];
  /** ขอบซ้าย (u 0) บน→ยอด */
  L: Pt[];
  /** ขอบขวา (u 1) บน→ยอด */
  R: Pt[];
}
const PW = 768;
const PH = 1024;
const ASSET = "/mock/collar-animal";
/** โครงร่างผ้าในรูป (พิกเซล) — จาก approxPolyDP ของ mask */
const PATCH: Record<"front" | "side", Patch> = {
  front: {
    T: [[268, 548], [299, 489], [446, 502], [516, 482], [553, 528]],
    L: [[268, 548], [312, 629], [406, 718]],
    R: [[553, 528], [544, 566], [487, 645], [406, 718]],
  },
  // ด้านข้าง: ขอบซ้าย = เส้นกลางผ้า (หน้าอก ตามขอบตัว) · ขอบขวา = ริมผ้าจากปมลงยอด
  side: {
    T: [[237, 489], [337, 489], [360, 520], [399, 524], [508, 476]],
    L: [[237, 489], [214, 616], [220, 739]],
    R: [[508, 476], [220, 739]],
  },
};

/** จุดบนโพลีไลน์ที่สัดส่วนความยาว k ∈ [0,1] */
function along(poly: Pt[], k: number): Pt {
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const d = Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
    segs.push(d);
    total += d;
  }
  let want = Math.max(0, Math.min(1, k)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? want / segs[i] : 0;
      return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * f, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * f];
    }
    want -= segs[i];
  }
  return poly[poly.length - 1];
}

/** Coons patch: (u,v) → พิกเซล · ขอบล่างยุบเป็นจุดยอด A */
function coons(p: Patch, u: number, v: number): Pt {
  const T = along(p.T, u);
  const Lv = along(p.L, v);
  const Rv = along(p.R, v);
  const TL = p.T[0];
  const TR = p.T[p.T.length - 1];
  const A = p.L[p.L.length - 1];
  const x = (1 - v) * T[0] + v * A[0] + (1 - u) * Lv[0] + u * Rv[0] - ((1 - u) * (1 - v) * TL[0] + u * (1 - v) * TR[0] + v * A[0]);
  const y = (1 - v) * T[1] + v * A[1] + (1 - u) * Lv[1] + u * Rv[1] - ((1 - u) * (1 - v) * TL[1] + u * (1 - v) * TR[1] + v * A[1]);
  return [x, y];
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`โหลดรูปไม่ได้: ${src}`));
    im.src = src;
  });
}

/** วาดรูป src จากสามเหลี่ยม s0-s2 (พิกเซลใน src) ไปสามเหลี่ยม d0-d2 ด้วย affine */
function drawTri(ctx: CanvasRenderingContext2D, src: CanvasImageSource, s: [Pt, Pt, Pt], d: [Pt, Pt, Pt]) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s;
  const [[u0, v0], [u1, v1], [u2, v2]] = d;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-6) return;
  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det;
  const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
  const c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
  const dd = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
  const e = u0 - a * x0 - c * y0;
  const f = v0 - b * x0 - dd * y0;
  ctx.save();
  // ขยายสามเหลี่ยมปลายทาง 0.6px กันเส้นขาวตามรอยต่อ
  const cx = (u0 + u1 + u2) / 3;
  const cy = (v0 + v1 + v2) / 3;
  ctx.beginPath();
  d.forEach(([px, py], i) => {
    const L = Math.hypot(px - cx, py - cy) || 1;
    const qx = px + ((px - cx) / L) * 0.6;
    const qy = py + ((py - cy) / L) * 0.6;
    if (i === 0) ctx.moveTo(qx, qy);
    else ctx.lineTo(qx, qy);
  });
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, dd, e, f);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

export default function Bandana3D({
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
  const [view, setView] = useState<BandanaView>("front");
  const [spin, setSpin] = useState(false);
  /** 🔄 ดูลายชั้นหลัง (ผ้า 2 ชั้นพับ) — เอาครึ่งบนของแบบ (กลับหัวตามการพับ) มาวางแทนชั้นหน้า */
  const [inner, setInner] = useState(false);
  const imgs = useRef<Record<string, HTMLImageElement> | null>(null);
  /** ภาพสำเร็จต่อมุม (รูป + ลาย) — วาดใหม่เมื่อลาย/ชั้นเปลี่ยน */
  const frames = useRef<Record<BandanaView, HTMLCanvasElement> | null>(null);
  /**
   * 🔄 หมุน (เจ้าของร้านสั่ง 23 ต.ค. 69 "ทำให้มันหมุนได้รอบให้หน่อย"): มุม −90° = หันซ้าย · 0° = หน้า · +90° = หันขวา
   * มีรูปจริงแค่หน้า + ข้าง → ข้างขวา = รูปข้างกลับซ้าย-ขวา (ลายไม่กลับ) · ระหว่างมุมผสมภาพ + บีบแนวนอนให้รู้สึกหมุน · ด้านหลังยังไม่มีรูป
   */
  const ang = useRef({ a: 0, target: null as number | null, spin: false, dir: 1, dragging: false });
  const drag = useRef<{ x: number; a: number } | null>(null);
  const goView = (v: BandanaView) => {
    ang.current.target = v === "left" ? -90 : v === "right" ? 90 : 0;
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
    const keys = ["front", "front-mask", "side", "side-mask", "side-knot"];
    Promise.all(keys.map((k) => loadImg(`${ASSET}/poodle-${k}.${/mask|knot/.test(k) ? "png" : "webp"}`)))
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

  // 🎨 วาดภาพสำเร็จ 3 มุม (รูป + ลายบนผ้า)
  useEffect(() => {
    const im = imgs.current;
    if (status !== "ready" || !im) return;
    const W = sheetMm.w;
    const H = sheetMm.h;
    const k = sheet.width / W;
    const folded = mock.style !== "tie";
    const wrap = mock.style === "tie" ? 0.94 : mock.style === "button" ? 1.04 : 0.62;
    const useBack = folded && inner;

    /** สีมุมผ้า (ปม/ชายผ้าท้ายทอย) — โปร่ง = ผ้าขาว */
    const tint = (() => {
      const sctx = sheet.getContext("2d");
      if (!sctx) return "#ffffff";
      const px = (xMm: number, yMm: number) => sctx.getImageData(Math.round(xMm * k), Math.round(yMm * k), 1, 1).data;
      const ys = folded ? H / 2 : H * 0.012;
      const a = px(W * 0.03, ys);
      const b = px(W * 0.97, ys);
      const mix = (i: number) => ((a[3] ? a[i] : 255) + (b[3] ? b[i] : 255)) >> 1;
      return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
    })();

    const render = (v: BandanaView): HTMLCanvasElement => {
      const side = v !== "front";
      const mirror = v === "right";
      const base = PATCH[side ? "side" : "front"];
      const mx = (p: Pt): Pt => (mirror ? [PW - p[0], p[1]] : p);
      const patch: Patch = { T: base.T.map(mx), L: base.L.map(mx), R: base.R.map(mx) };
      /** (u,v) ของผ้าในรูป → (s,t) บนผืน · ขอบคอเห็นแบบพันรอบ (ย่อปลาย) · ลึกลงไปผ้าห้อยแบน = เส้นตรง */
      const stOf = (u: number, t: number): [number, number] => {
        const flat = Math.min(1, t / 0.55);
        let s: number;
        if (!side) {
          const hw0 = Math.min(0.5, 0.25 / wrap);
          const curved = 0.5 + (Math.asin(Math.max(-1, Math.min(1, 2 * u - 1))) / (Math.PI / 2)) * hw0;
          s = curved * (1 - flat) + u * flat;
        } else {
          // u 0 = กลางผ้า (ขอบหน้าอก) · u 1 = มุมผ้าที่ปม · หันขวา = อีกครึ่งของผืน
          const phi = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * u)));
          const curved = Math.max(0, 0.5 - phi / (2 * Math.PI * wrap));
          s = curved * (1 - flat) + (0.5 - 0.5 * u) * flat;
          if (mirror) s = 1 - s;
        }
        return [Math.max(0, Math.min(1, s)), t];
      };
      /** (s,t) → พิกเซลบนอาร์ตบอร์ด (ผืนพับใช้ครึ่งล่าง · ชั้นหลัง = ครึ่งบนกลับหัว) */
      const srcOf = ([s, t]: [number, number]): Pt => {
        const xs = W / 2 + (s - 0.5) * W * (1 - t);
        const ys = !folded ? t * H : useBack ? H / 2 - (t * H) / 2 : H / 2 + (t * H) / 2;
        return [xs * k, ys * k];
      };
      const drawImg = (c: CanvasRenderingContext2D, img: CanvasImageSource) => {
        c.save();
        if (mirror) {
          c.translate(PW, 0);
          c.scale(-1, 1);
        }
        c.drawImage(img, 0, 0, PW, PH);
        c.restore();
      };

      const cv = document.createElement("canvas");
      cv.width = PW;
      cv.height = PH;
      const ctx = cv.getContext("2d");
      if (!ctx) return cv;
      drawImg(ctx, im[side ? "side" : "front"]);

      // ลายบนผ้า: วาดลงแผ่นแยก → ตัดตาม mask ผ้า → multiply ทับรูป
      const lay = document.createElement("canvas");
      lay.width = PW;
      lay.height = PH;
      const lctx = lay.getContext("2d");
      if (!lctx) return cv;
      lctx.fillStyle = "#fff";
      lctx.fillRect(0, 0, PW, PH);
      const NU = 28;
      const NV = 28;
      for (let i = 0; i < NV; i++) {
        // แถวสุดท้ายยุบเป็นจุด — หยุดก่อนนิดเดียว
        const v0 = i / NV;
        const v1 = Math.min((i + 1) / NV, 0.995);
        for (let j = 0; j < NU; j++) {
          const u0 = j / NU;
          const u1 = (j + 1) / NU;
          const d00 = coons(patch, u0, v0);
          const d10 = coons(patch, u1, v0);
          const d01 = coons(patch, u0, v1);
          const d11 = coons(patch, u1, v1);
          const s00 = srcOf(stOf(u0, v0));
          const s10 = srcOf(stOf(u1, v0));
          const s01 = srcOf(stOf(u0, v1));
          const s11 = srcOf(stOf(u1, v1));
          drawTri(lctx, sheet, [s00, s10, s11], [d00, d10, d11]);
          drawTri(lctx, sheet, [s00, s11, s01], [d00, d11, d01]);
        }
      }
      lctx.globalCompositeOperation = "destination-in";
      drawImg(lctx, im[side ? "side-mask" : "front-mask"]);
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(lay, 0, 0);

      if (side) {
        // 🎀 ปม + ชายผ้าท้ายทอย = ผ้ามุมผืน → ย้อมด้วยสีตรงมุมผ้าของลาย (ไม่แปะลายทั้งผืนบนปม)
        const kn = document.createElement("canvas");
        kn.width = PW;
        kn.height = PH;
        const kctx = kn.getContext("2d");
        if (kctx) {
          kctx.fillStyle = tint;
          kctx.fillRect(0, 0, PW, PH);
          kctx.globalCompositeOperation = "destination-in";
          drawImg(kctx, im["side-knot"]);
          ctx.drawImage(kn, 0, 0);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      return cv;
    };
    frames.current = { left: render("left"), front: render("front"), right: render("right") };
  }, [status, inner, sheet, sheetMm, mock.style]);

  // 🔁 วาดจอตามมุม: ผสมภาพมุมข้างเคียง + บีบแนวนอนรอบแกนกลาง (ให้รู้สึกหมุน) · หมุนโชว์ = แกว่งซ้าย↔ขวา
  useEffect(() => {
    const cv = canvasRef.current;
    if (status !== "ready" || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    cv.width = PW;
    cv.height = PH;
    let raf = 0;
    let last = performance.now();
    let shown: BandanaView = "front";
    const smooth = (x: number) => x * x * (3 - 2 * x);
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
        } else g.a += d * Math.min(1, dt * 7);
      } else if (g.spin && !g.dragging) {
        g.a += g.dir * dt * 55;
        if (g.a >= 90) (g.a = 90), (g.dir = -1);
        if (g.a <= -90) (g.a = -90), (g.dir = 1);
      }
      const f = frames.current;
      if (!f) return;
      const a = g.a;
      const sideV: BandanaView = a < 0 ? "left" : "right";
      const p = Math.min(1, Math.abs(a) / 90);
      // ผสมช่วงกลาง 25–65% ของการหมุน (ปลายทั้งสองเป็นรูปจริงล้วน ไม่ซ้อนเงา)
      const w = smooth(Math.max(0, Math.min(1, (p - 0.25) / 0.4)));
      ctx.clearRect(0, 0, PW, PH);
      const put = (img: HTMLCanvasElement, alpha: number, sx: number) => {
        if (alpha <= 0.001) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(PW / 2, 0);
        ctx.scale(sx, 1);
        ctx.drawImage(img, -PW / 2, 0);
        ctx.restore();
      };
      put(f.front, 1 - w, 1 - 0.18 * p);
      put(f[sideV], w, 0.82 + 0.18 * p);
      const near: BandanaView = p < 0.5 ? "front" : sideV;
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
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, a: ang.current.a };
            ang.current.target = null;
            ang.current.dragging = true;
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            // ลากขวา = หมุนให้หันขวา
            ang.current.a = Math.max(-90, Math.min(90, d.a + (e.clientX - d.x) * 0.45));
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
              {spin ? "หมุนโชว์" : BANDANA_VIEW_TH[view]}
              {inner && folded ? " · ชั้นหลัง" : ""}
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-900/70 px-3.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            ↔ ลากซ้าย-ขวา = หมุนดู
          </div>
        </div>

        <div className="space-y-2.5 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="มุมมอง">
              {(["left", "front", "right"] as BandanaView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : v === "left" ? "⬅ หันซ้าย" : "หันขวา ➡"}
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
              {spin ? "⏸ หยุดหมุน" : "🔄 หมุนโชว์"}
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
              ? "ภาพจำลองโดยประมาณ — ลายวางบนผ้าในรูปตัวอย่าง ผ้าชั้นเดียวพิมพ์ด้านหน้า · หมุนดูได้ หันซ้าย–หน้า–หันขวา · สีจริงอาจต่างจากหน้าจอเล็กน้อย"
              : inner
                ? "กำลังดูชั้นหลัง = ครึ่งบนของแบบ (กลับหัวตามการพับ) วางบนผ้าในรูปแทนชั้นหน้า · สีจริงอาจต่างจากหน้าจอเล็กน้อย"
                : "ภาพจำลองโดยประมาณ — ผืนพับครึ่งตามเส้นประ ครึ่งล่างของแบบอยู่ด้านหน้า กด “ดูลายชั้นหลัง” เพื่อดูครึ่งบน · ปมในรูปเป็นภาพประกอบ · สีจริงอาจต่างจากหน้าจอเล็กน้อย"}
          </p>
        </div>
      </div>
    </div>
  );
}
