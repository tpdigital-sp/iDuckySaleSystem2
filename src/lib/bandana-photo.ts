/**
 * 🐶📸 วางลายลูกค้าลงบนผ้าพันคอขาวในรูปตุ๊กตาพุดเดิ้ลของร้าน (ใช้ร่วม: components/Bandana3D หมุน 360° แบบผูก · components/BandanaFabric3D แผงหมาข้างผ้า 3D)
 * (23 ต.ค. 69 · รูป + mask อยู่ใน public/mock/collar-animal/poodle360-* — ดูคำอธิบายวิธีวางลายใน components/Bandana3D)
 */
import type { BandanaStyle, BandanaView } from "@/lib/bandana-mock";

export type Pt = [number, number];
export interface Patch {
  /** ขอบบน (ขอบคอ) ซ้าย→ขวา · ซ้าย = u 0 · ขวา = u 1 */
  T: Pt[];
  /** ขอบซ้าย (u 0) บน→ยอด */
  L: Pt[];
  /** ขอบขวา (u 1) บน→ยอด */
  R: Pt[];
}
export const PW = 720;
export const PH = 1200;
export const ASSET = "/mock/collar-animal";
export type Shot = "front" | "q-left" | "side" | "back" | "q-right";
/** โครงร่างผ้าในรูป (พิกเซล 720×1200) — convex hull ของ mask แยกเป็นขอบบน/ซ้าย/ขวา */
export const PATCH: Partial<Record<Shot, Patch>> = {
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
export const FRAMES: { deg: number; shot: Shot; mirror?: boolean; psi: number }[] = [
  { deg: 0, shot: "front", psi: 0 },
  { deg: 45, shot: "q-left", psi: 45 },
  { deg: 90, shot: "side", psi: 90 },
  { deg: 180, shot: "back", psi: 180 },
  { deg: 270, shot: "side", mirror: true, psi: -90 },
  { deg: 315, shot: "q-right", psi: -45 },
];
export const VIEW_DEG: Record<BandanaView, number> = { front: 0, left: 90, back: 180, right: 270 };

/** จุดบนโพลีไลน์ที่สัดส่วนความยาว k ∈ [0,1] */
export function along(poly: Pt[], k: number): Pt {
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
export function coons(p: Patch, u: number, v: number): Pt {
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

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`โหลดรูปไม่ได้: ${src}`));
    im.src = src;
  });
}

/** วาดรูป src จากสามเหลี่ยม s0-s2 (พิกเซลใน src) ไปสามเหลี่ยม d0-d2 ด้วย affine */
export function drawTri(ctx: CanvasRenderingContext2D, src: CanvasImageSource, s: [Pt, Pt, Pt], d: [Pt, Pt, Pt]) {
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


/** วาดเฟรม f ของรูปพุดเดิ้ล + ลายบนผ้า (+ ย้อมปม) · inner = ผืนพับใช้ครึ่งบน (ชั้นหลัง) แทนครึ่งล่าง */
export function renderBandanaFrame(
  f: (typeof FRAMES)[number],
  im: Record<string, HTMLImageElement>,
  sheet: HTMLCanvasElement,
  sheetMm: { w: number; h: number },
  style: BandanaStyle,
  inner = false,
): HTMLCanvasElement {
  const W = sheetMm.w;
  const H = sheetMm.h;
  const k = sheet.width / W;
  const folded = style !== "tie";
  const wrap = style === "tie" ? 0.94 : style === "button" ? 1.04 : 0.62;
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
        // ผ้าใน mask ที่อยู่นอกตารางลาย (แถบรอบคอไปหาปม · ด้านเงาของผ้า) = สีมุมผ้า ไม่ปล่อยขาว (เจ้าของร้านทัก 23 ต.ค. 69 "ยังติดสีขาว")
        lctx.fillStyle = tint;
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
}
