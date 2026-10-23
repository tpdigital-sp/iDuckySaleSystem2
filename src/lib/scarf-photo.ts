/**
 * 🎀📸 ภาพตัวอย่าง 2D ผ้าผูกผม — วางลายลูกค้าลงบนรูปผ้าซาตินขาว 4 มุม (แบบ Scrunchy · lib/scrunchy-photo)
 * (เจ้าของร้านส่งรูปผ้าขาวหลายมุม 23 ต.ค. 69 → ใช้ชุดที่ 2 6 ช่อง · รูปใน public/mock/scarf เตรียมด้วย scripts/py/scarf-photo-prep.py)
 *
 * ผ้าในรูป = ผืนพับครึ่งตามยาว วางพับกลางเป็นตัว V กลับหัว: ขา L (ปลายผืนซ้าย) · ขา R (ปลายผืนขวา) · รอยพับบนสุด = กลางผืน
 * แต่ละขา = สี่เหลี่ยม 4 มุม (ขอบ w0/w1 จากรอยพับถึงปลาย · พิกัดรูปที่ขยายแล้ว) → inverse bilinear ได้ (w ข้ามกว้าง, λ จากพับ→ปลาย)
 *   ตามยาวผืน s = กลาง + (ปลาย(w) − กลาง)·λ · ปลายเฉียง: ขอบ w = 0 ของ L ยาวสุด (s = 0) · ขอบ w = 1 ของ R ยาวสุด (s = สุดผืน)
 *   ด้าน A = ครึ่งบนของผืน · ด้าน B = ครึ่งล่าง (ผืน (x, H − y)) · ขาหน้าวาดทับขาหลัง · มาสก์จากรูปตัดขอบจริง
 * ผสม: ลาย × เงาผ้าขาว + ผิวผ้า + ประกาย (satinShading) — สูตรเดียวกับ Scrunchy
 */

import { loadImg, satinShading } from "@/lib/scrunchy-photo";

export { loadImg };
export const SCARF_ASSET = "/mock/scarf";
export const SCARF_VIEWS = ["flatFront", "flatBack", "front", "back", "left", "right", "rolled", "tied", "neck"] as const;
export type ScarfView = (typeof SCARF_VIEWS)[number];
export const SCARF_VIEW_TH: Record<ScarfView, string> = {
  flatFront: "วางราบ (หน้า)",
  flatBack: "วางราบ (หลัง)",
  front: "ด้านหน้า",
  back: "ด้านหลัง",
  left: "ด้านข้างซ้าย",
  right: "ด้านข้างขวา",
  rolled: "ม้วน",
  tied: "ผูกโบว์",
  neck: "ผูกคอ",
};

type P = [number, number];
/** flip = ขานี้หันอีกด้านเข้ากล้อง (มองจากหลัง/ข้าง) → กลับทิศข้ามกว้าง ไม่งั้นตัวหนังสือกลับด้าน (ทดสอบรูป FRONT/BACK 23 ต.ค. 69) */
type Leg = { leg: "L" | "R"; face: "A" | "B"; w0: [P, P]; w1: [P, P]; flip?: true };
/**
 * ขาต่อมุม เรียงหลัง → หน้า · [บน (รอยพับ/ปลายบน), ปลายเฉียง] ของขอบ w0 / w1 · พิกัดรูปต้นฉบับชุดที่ 2 (จะ −x0 แล้ว ×2)
 * วางราบ = ผืนครึ่งซ้าย (ขา L) + ครึ่งขวา (ขา R) วางคู่กัน ปลายบนตัดตรง = กลางผืน
 */
const RAW: Partial<Record<ScarfView, { x0: number; legs: Leg[] }>> = {
  flatFront: {
    x0: 0,
    legs: [
      { leg: "L", face: "A", w0: [[82, 39], [56, 546]], w1: [[150, 39], [138, 479]] },
      { leg: "R", face: "A", w0: [[166, 39], [166, 478]], w1: [[234, 39], [246, 546]] },
    ],
  },
  flatBack: {
    x0: 302,
    legs: [
      { leg: "L", face: "B", w0: [[367, 39], [346, 546]], w1: [[432, 39], [430, 476]], flip: true },
      { leg: "R", face: "B", w0: [[437, 39], [447, 476]], w1: [[502, 39], [528, 546]], flip: true },
    ],
  },
  front: {
    x0: 572,
    legs: [
      { leg: "L", face: "A", w0: [[683, 80], [579, 535]], w1: [[750, 78], [661, 470]] },
      { leg: "R", face: "B", w0: [[683, 80], [754, 467]], w1: [[752, 78], [849, 537]] },
    ],
  },
  back: {
    x0: 857,
    legs: [
      { leg: "L", face: "B", w0: [[958, 80], [865, 535]], w1: [[1033, 78], [950, 468]], flip: true },
      { leg: "R", face: "A", w0: [[960, 78], [1030, 463]], w1: [[1027, 78], [1119, 530]], flip: true },
    ],
  },
  left: {
    x0: 1125,
    legs: [
      { leg: "R", face: "B", w0: [[1218, 72], [1244, 452]], w1: [[1246, 70], [1271, 490]] },
      { leg: "L", face: "A", w0: [[1243, 70], [1230, 545]], w1: [[1215, 72], [1195, 468]], flip: true },
    ],
  },
  right: {
    x0: 1328,
    legs: [
      { leg: "L", face: "A", w0: [[1412, 72], [1390, 495]], w1: [[1440, 70], [1420, 452]] },
      { leg: "R", face: "B", w0: [[1440, 70], [1478, 478]], w1: [[1418, 70], [1425, 545]], flip: true },
    ],
  },
};
/**
 * 🎀 มุมทรงโค้ง (ม้วน / ผูกโบว์ / ผูกคอ — เจ้าของร้าน "อยากได้ 3 ภาพนี้ด้วย") = ชิ้นผ้าตามเส้นกลาง (จุดต่อกัน) + ครึ่งความกว้าง hw
 *   s = ช่วงผืน (สัดส่วน 0 = ปลายซ้าย … 1 = ปลายขวา) จากจุดแรก → จุดสุดท้าย · ชิ้นเรียงหลัง → หน้า · พิกัดรูปต้นฉบับชุดที่ 2
 *   ห่วง/ปม/วงม้วน ไม่มีปลายเฉียง · ชายผ้าจบที่ปลายผืน (0 หรือ 1) — มาสก์รูปจริงตัดทรงปลายให้
 */
type Piece = { pts: P[]; hw: number; s: [number, number]; face: "A" | "B"; flip?: true };
const ring = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 36): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P;
  });
const PATHS: Partial<Record<ScarfView, { x0: number; y0: number; pieces: Piece[] }>> = {
  tied: {
    x0: 955,
    y0: 608,
    pieces: [
      { pts: [[1080, 718], [1060, 770], [1040, 825], [1015, 880], [990, 925]], hw: 34, s: [0.3, 0], face: "A" },
      { pts: [[1115, 718], [1140, 765], [1168, 815], [1195, 868], [1225, 925]], hw: 33, s: [0.68, 1], face: "A" },
      { pts: [[1078, 688], [1040, 682], [1005, 678], [982, 676]], hw: 28, s: [0.3, 0.42], face: "A" },
      { pts: [[1122, 686], [1160, 676], [1195, 670], [1212, 668]], hw: 28, s: [0.5, 0.62], face: "A" },
      { pts: [[1072, 696], [1126, 696]], hw: 26, s: [0.44, 0.49], face: "A" },
    ],
  },
  neck: {
    x0: 1249,
    y0: 608,
    pieces: [
      {
        pts: [[1378, 752], [1340, 725], [1322, 690], [1335, 655], [1370, 638], [1400, 633], [1435, 640], [1458, 665], [1462, 700], [1440, 735], [1415, 752]],
        hw: 17,
        s: [0.25, 0.75],
        face: "A",
      },
      { pts: [[1382, 782], [1350, 825], [1320, 870], [1290, 915]], hw: 30, s: [0.25, 0], face: "A" },
      { pts: [[1410, 782], [1440, 828], [1466, 872], [1490, 918]], hw: 30, s: [0.75, 1], face: "A" },
      { pts: [[1374, 768], [1416, 768]], hw: 22, s: [0.48, 0.52], face: "A" },
    ],
  },
  rolled: {
    x0: 649,
    y0: 608,
    pieces: [
      { pts: [[748, 705], [730, 760], [700, 815], [665, 852]], hw: 33, s: [0.22, 0], face: "A" },
      { pts: ring(800, 712, 68, 36, Math.PI, 3 * Math.PI), hw: 12, s: [0.22, 0.45], face: "A" },
      { pts: ring(800, 708, 92, 50, Math.PI, 3 * Math.PI), hw: 18, s: [0.45, 0.75], face: "A" },
      { pts: [[895, 725], [855, 785], [800, 840], [745, 893], [700, 928]], hw: 46, s: [0.75, 1], face: "A" },
    ],
  },
};

/** จุดใกล้สุดบนเส้นกลาง: ระยะตามเส้น (สัดส่วน) + ระยะตั้งฉากแบบมีเครื่องหมาย (ซ้าย/ขวาของทิศเดิน) */
function nearestOnPath(px: number, py: number, pts: P[], cum: number[]): { t: number; d: number } {
  let best = { t: 0, d: Infinity, ad: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const ex = bx - ax;
    const ey = by - ay;
    const L2 = ex * ex + ey * ey || 1e-9;
    const u = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / L2));
    const qx = ax + ex * u;
    const qy = ay + ey * u;
    const ad = Math.hypot(px - qx, py - qy);
    if (ad < best.ad) {
      const sign = ex * (py - ay) - ey * (px - ax) >= 0 ? 1 : -1;
      best = { t: (cum[i] + Math.sqrt(L2) * u) / cum[cum.length - 1], d: sign * ad, ad };
    }
  }
  return { t: best.t, d: best.d };
}

const SCALE = 2;

/** ขอบเส้นตัดผ้าพันผม (มม.) · ความลึกปลายเฉียง — ตรงกับ lib/hair-mock */
const INSET = 3;
const TIP = 63;

function pixels(src: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

/** หา (w, λ) ของจุดในสี่เหลี่ยม a(0,0) b(1,0) c(0,1) d(1,1) — นิวตัน 6 รอบ */
function invBilinear(px: number, py: number, a: P, b: P, c: P, d: P): P {
  let w = 0.5;
  let l = 0.5;
  for (let it = 0; it < 6; it++) {
    const x = (1 - w) * (1 - l) * a[0] + w * (1 - l) * b[0] + (1 - w) * l * c[0] + w * l * d[0];
    const y = (1 - w) * (1 - l) * a[1] + w * (1 - l) * b[1] + (1 - w) * l * c[1] + w * l * d[1];
    const dxw = (1 - l) * (b[0] - a[0]) + l * (d[0] - c[0]);
    const dyw = (1 - l) * (b[1] - a[1]) + l * (d[1] - c[1]);
    const dxl = (1 - w) * (c[0] - a[0]) + w * (d[0] - b[0]);
    const dyl = (1 - w) * (c[1] - a[1]) + w * (d[1] - b[1]);
    const det = dxw * dyl - dxl * dyw || 1e-9;
    const ex = px - x;
    const ey = py - y;
    w += (ex * dyl - ey * dxl) / det;
    l += (dxw * ey - dyw * ex) / det;
  }
  return [w, l];
}

export function renderScarfView(key: ScarfView, photo: HTMLImageElement, mask: HTMLImageElement, sheet: HTMLCanvasElement, sheetMm: { w: number; h: number }, lit = false): HTMLCanvasElement {
  const w = photo.naturalWidth;
  const h = photo.naturalHeight;
  const ph = pixels(photo, w, h);
  const mk = pixels(mask, w, h);
  // lit = false → สีตรงลาย ไม่แต่งแสงเงา (ลองแล้ว 23 ต.ค. 69 — เจ้าของร้านเลือกแบบมีแสงเงา · หน้าต่างส่ง true)
  const sh = lit ? satinShading(ph, mk, w, h) : null;
  const SW = sheet.width;
  const SH = sheet.height;
  const sp = pixels(sheet, SW, SH);
  const k = SW / sheetMm.w;
  const W = sheetMm.w;
  const H = sheetMm.h;
  const T = Math.min(TIP, (W - 2 * INSET) * 0.2);
  const HW = (H - 2 * INSET) / 2;
  const LP = W - 2 * INSET;
  const L0 = LP - T;
  const SM = LP / 2;
  const quad = RAW[key];
  const path = PATHS[key];
  const tp = (p: P, x0: number, y0 = 0): P => [(p[0] - x0) * SCALE, (p[1] - y0) * SCALE];
  // หน้า → หลัง (ชิ้นหน้าได้พิกเซลก่อน)
  const legs = (quad?.legs ?? []).map((g) => ({ ...g, a: tp(g.w0[0], quad!.x0), b: tp(g.w1[0], quad!.x0), c: tp(g.w0[1], quad!.x0), d: tp(g.w1[1], quad!.x0) })).reverse();
  const pieces = (path?.pieces ?? [])
    .map((g) => {
      const pts = g.pts.map((q) => tp(q, path!.x0, path!.y0));
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { ...g, pts, cum, hwPx: g.hw * SCALE };
    })
    .reverse();
  /** พิกเซล → ตำแหน่งบนผืน: s (มม. ตามยาว จากปลายซ้าย) · wn (0…1 ข้ามกว้าง) · ด้าน · กลับทิศ */
  const locate = (px: number, py: number): { s: number; wn: number; face: "A" | "B"; flip?: true } | null => {
    if (pieces.length) {
      let fb: { g: (typeof pieces)[number]; r: { t: number; d: number } } | null = null;
      let fo = Infinity;
      for (const g of pieces) {
        const r = nearestOnPath(px, py, g.pts, g.cum);
        const o = Math.abs(r.d) / g.hwPx;
        if (o <= 1.2) {
          fb = { g, r };
          break;
        }
        if (o < fo) {
          fo = o;
          fb = { g, r };
        }
      }
      if (!fb) return null;
      const f = fb.g.s[0] + (fb.g.s[1] - fb.g.s[0]) * fb.r.t;
      return { s: f * LP, wn: Math.max(0, Math.min(1, 0.5 + fb.r.d / (2 * fb.g.hwPx))), face: fb.g.face, flip: fb.g.flip };
    }
    let best: { g: (typeof legs)[number]; wl: P } | null = null;
    let bestOut = Infinity;
    for (const g of legs) {
      const wl = invBilinear(px, py, g.a, g.b, g.c, g.d);
      const o = Math.max(0, -wl[0], wl[0] - 1, -wl[1], wl[1] - 1);
      if (o <= M) {
        best = { g, wl };
        break;
      }
      if (o < bestOut) {
        bestOut = o;
        best = { g, wl };
      }
    }
    if (!best) return null;
    const ww = Math.max(0, Math.min(1, best.wl[0]));
    const ll = Math.max(0, Math.min(1, best.wl[1]));
    const tip = best.g.leg === "L" ? T * ww : L0 + T * ww;
    return { s: SM + (tip - SM) * ll, wn: ww, face: best.g.face, flip: best.g.flip };
  };
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return out;
  const img = octx.createImageData(w, h);
  const dd = img.data;
  const M = 0.04;
  const sample = (fx: number, fy: number, ch: number) => {
    const x = Math.max(0, Math.min(SW - 1.001, fx));
    const y = Math.max(0, Math.min(SH - 1.001, fy));
    const xi = x | 0;
    const yi = y | 0;
    const tx = x - xi;
    const ty = y - yi;
    const i00 = (yi * SW + xi) * 4 + ch;
    const p = sp[i00] + (sp[i00 + 4] - sp[i00]) * tx;
    const q = sp[i00 + SW * 4] + (sp[i00 + SW * 4 + 4] - sp[i00 + SW * 4]) * tx;
    return p + (q - p) * ty;
  };
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const al = mk[i];
      if (al < 4) continue;
      const loc = locate(px, py);
      if (!loc) continue;
      const s = loc.s;
      const ys = INSET + (loc.flip ? 1 - loc.wn : loc.wn) * HW;
      const fx = (INSET + s) * k;
      const fy = (loc.face === "A" ? ys : H - ys) * k;
      const shade = sh ? sh.shade[i >> 2] : 1;
      const spec = sh ? sh.spec[i >> 2] : 0;
      const la = sample(fx, fy, 3) / 255;
      for (let ch = 0; ch < 3; ch++) {
        let vv = (sample(fx, fy, ch) * la + 255 * (1 - la)) * shade;
        vv += (255 - vv) * spec;
        dd[i + ch] = vv;
      }
      dd[i + 3] = al;
    }
  octx.putImageData(img, 0, 0);
  return out;
}
