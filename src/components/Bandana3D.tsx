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

type Pt = [number, number];
interface Patch {
  /** ขอบบน (ขอบคอ) ซ้าย→ขวา · ซ้าย = u 0 · ขวา = u 1 */
  T: Pt[];
  /** ขอบซ้าย (u 0) บน→ยอด */
  L: Pt[];
  /** ขอบขวา (u 1) บน→ยอด */
  R: Pt[];
}
const PW = 720;
const PH = 1200;
const ASSET = "/mock/collar-animal";
type Shot = "front" | "q-left" | "side" | "back" | "q-right";
/** โครงร่างผ้าในรูป (พิกเซล 720×1200) — convex hull ของ mask แยกเป็นขอบบน/ซ้าย/ขวา */
const PATCH: Partial<Record<Shot, Patch>> = {
  front: {
    T: [[230, 587], [475, 583], [485, 586]],
    L: [[230, 587], [205, 615], [198, 654], [217, 703], [253, 755], [285, 789], [360, 857]],
    R: [[485, 586], [510, 614], [518, 631], [518, 647], [427, 796], [367, 856], [360, 857]],
  },
  "q-left": {
    T: [[130, 598], [299, 616], [387, 649]],
    L: [[130, 598], [95, 698], [89, 746], [127, 831], [161, 881]],
    R: [[387, 649], [391, 655], [369, 685], [170, 879], [161, 881]],
  },
  side: {
    T: [[149, 608], [157, 603], [215, 609], [313, 637]],
    L: [[149, 608], [110, 809], [104, 868]],
    R: [[313, 637], [319, 661], [116, 867], [104, 868]],
  },
  "q-right": {
    T: [[357, 622], [560, 580], [563, 582]],
    L: [[357, 622], [297, 686], [301, 709], [341, 754], [430, 830], [500, 884]],
    R: [[563, 582], [567, 615], [556, 691], [510, 873], [500, 884]],
  },
};
/** เฟรมรอบตัว: มุม (องศา) · รูป · กลับซ้าย-ขวา · ψ = มุมรอบคอที่อยู่กลางภาพ (θ บวก = ทางขวาของภาพตอนมองหน้า) */
const FRAMES: { deg: number; shot: Shot; mirror?: boolean; psi: number }[] = [
  { deg: 0, shot: "front", psi: 0 },
  { deg: 45, shot: "q-left", psi: 45 },
  { deg: 90, shot: "side", psi: 90 },
  { deg: 180, shot: "back", psi: 180 },
  { deg: 270, shot: "side", mirror: true, psi: -90 },
  { deg: 315, shot: "q-right", psi: -45 },
];
const VIEW_DEG: Record<BandanaView, number> = { front: 0, left: 90, back: 180, right: 270 };

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
    const W = sheetMm.w;
    const H = sheetMm.h;
    const k = sheet.width / W;
    const folded = mock.style !== "tie";
    const wrap = mock.style === "tie" ? 0.94 : mock.style === "button" ? 1.04 : 0.62;
    /** ครึ่งมุมที่ผ้าคลุมรอบคอ (องศา) ที่ขอบคอ */
    const thetaMax = Math.min(180, 180 * wrap);
    const useBack = folded && inner;
    const rad = Math.PI / 180;

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
    /** (s,t) → พิกเซลบนอาร์ตบอร์ด (ผืนพับใช้ครึ่งล่าง · ชั้นหลัง = ครึ่งบนกลับหัว) */
    const srcOf = ([s, t]: [number, number]): Pt => {
      const xs = W / 2 + (s - 0.5) * W * (1 - t);
      const ys = !folded ? t * H : useBack ? H / 2 - (t * H) / 2 : H / 2 + (t * H) / 2;
      return [xs * k, ys * k];
    };

    const render = (f: (typeof FRAMES)[number]): HTMLCanvasElement => {
      const mirror = !!f.mirror;
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
      drawImg(ctx, im[f.shot]);

      const base = PATCH[f.shot];
      if (base) {
        const mx = (p: Pt): Pt => (mirror ? [PW - p[0], p[1]] : p);
        const patch: Patch = { T: base.T.map(mx), L: base.L.map(mx), R: base.R.map(mx) };
        /**
         * (u,v) ของผ้าในรูป → (s,t) บนผืน: ที่ความลึก t ผ้าคลุมมุม ±φ รอบคอ · ส่วนที่เห็นคือ [max(−φ, ψ−90), min(φ, ψ+90)]
         * ตำแหน่งบนภาพ ∝ sin(θ − ψ) → กลับหา θ แล้ว s = 0.5 + 0.5·θ/φ · รูปกลับด้าน: u 0 อยู่ขวาของภาพ จึงใช้ 1 − u
         */
        const stOf = (u0: number, t: number): [number, number] => {
          const u = mirror ? 1 - u0 : u0;
          const phi = Math.max(1, thetaMax * (1 - t));
          let a0 = Math.max(-phi, f.psi - 90);
          let a1 = Math.min(phi, f.psi + 90);
          if (a1 <= a0) a0 = a1 = Math.max(-phi, Math.min(phi, f.psi));
          const sa = Math.sin((a0 - f.psi) * rad);
          const sb = Math.sin((a1 - f.psi) * rad);
          const theta = f.psi + Math.asin(Math.max(-1, Math.min(1, sa + u * (sb - sa)))) / rad;
          return [Math.max(0, Math.min(1, 0.5 + (0.5 * theta) / phi)), t];
        };
        // ลายบนผ้า: วาดลงแผ่นแยก → ตัดตาม mask ผ้า → multiply ทับรูป
        const lay = document.createElement("canvas");
        lay.width = PW;
        lay.height = PH;
        const lctx = lay.getContext("2d");
        if (lctx) {
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
          drawImg(lctx, im[`${f.shot}-mask`]);
          ctx.globalCompositeOperation = "multiply";
          ctx.drawImage(lay, 0, 0);
        }
      }
      const knot = im[`${f.shot}-knot`];
      if (knot) {
        // 🎀 ปม + ชายผ้า/แถบผ้าท้ายทอย = ผ้ามุมผืน → ย้อมสีมุมผ้าของลาย
        const kn = document.createElement("canvas");
        kn.width = PW;
        kn.height = PH;
        const kctx = kn.getContext("2d");
        if (kctx) {
          kctx.fillStyle = tint;
          kctx.fillRect(0, 0, PW, PH);
          kctx.globalCompositeOperation = "destination-in";
          drawImg(kctx, knot);
          ctx.globalCompositeOperation = "multiply";
          ctx.drawImage(kn, 0, 0);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      return cv;
    };
    frames.current = FRAMES.map(render);
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
