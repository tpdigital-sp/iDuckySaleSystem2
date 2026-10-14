/**
 * ✂️ เอนจินเส้นตัดฝั่งลูกค้า — พอร์ตจาก tools/cutout-py/engine.py (หน้า /admin/diecut?tab=bg) มารันในเบราว์เซอร์
 * (ผู้ใช้สั่ง 14 ต.ค. 69 "ใช้ฟังก์ชันการทำงานเหมือนหน้านี้ คัดลอกมาเลย" · ลูกค้าเข้าถึงเซิร์ฟเวอร์ Python 8777 ไม่ได้)
 *
 * ขั้นตอนเดียวกับ engine.process():
 *   มาสก์วัตถุ (ทำความสะอาด) → ขนาดจริงจาก "ด้านยาวสุดของชิ้นงาน" → ขอบรอบรูป (stroke) → เส้นตัด
 *   contour: ขยายตามระยะ → ถมร่องแคบ (bridge) → แก้เฉพาะจุด ＋มน/−ชิด → ปิดรูใน → หดเข้า (ระยะติดลบ)
 *   rect / rounded / circle / ellipse: เรขาคณิตรอบวัตถุ ± ระยะ
 *   → ติ่งรูห่วงแบบร้าน (วงกลมเหนืองาน ห่างงาน hole_gap · ทับเส้นตัดแล้วรวมเป็นมุมหัก) → รองขาว
 * ต่างจาก Python: ลากเส้นด้วย marching squares + ฟิตเบซิเยร์ (lib/cutout) แทน potrace · ปรับรูปร่างด้วยสนามระยะแทน OpenCV
 *
 * หน่วยภายใน = พิกเซลของภาพคำนวณ · ผลลัพธ์เป็น มม.จริง อ้างอิงมุมซ้ายบนของกรอบวัตถุ
 */

import type { CubicSeg } from "./bezier-fit";
import { buildCutout } from "./cutout";
import { distanceSq } from "./diecut";

export type CutShape = "contour" | "rect" | "rounded" | "circle" | "ellipse";

export interface CutParams {
  /** ชนิดเส้นตัด — Cut100 ตัดขาด · Cut50 ตัดครึ่ง (kiss cut) */
  cutType: "Cut100" | "Cut50";
  shape: CutShape;
  /** ความมนของมุม (rounded) มม. */
  radiusMm: number;
  /** ระยะเส้นตัด มม. — ติดลบ = ตัดเข้าเนื้อ */
  offsetMm: number;
  /** ขอบรอบรูป (stroke) มม. · 0 = ไม่มี */
  strokeMm: number;
  strokeColor: string;
  /** ถมร่องแคบ 0–2.5 (เท่าของระยะเส้นตัด) */
  bridge: number;
  /** เว้นรูด้านใน (ตัดทะลุ) */
  holes: boolean;
  /** ความโค้งของเส้น 0–1.33 (alphamax ของ potrace) */
  smooth: number;
  /** รองขาว */
  white: "none" | "full";
  whiteChokeMm: number;
  /** ติ่งรูห่วง */
  hole: boolean;
  holeMm: number;
  ringMm: number;
  holeGapMm: number;
  holeXMm: number;
  /** แก้เฉพาะจุด [x มม.ผืน, y มม.ผืน, ขนาดแปรง มม., +1 มน / −1 ชิด] */
  edits: [number, number, number, number][];
  /** ความมนของจุด ＋ (มม.) */
  plusMm: number;
}

/** ค่าเริ่มต้น = สูตร "พวงกุญแจอะคริลิก" ของ tools/cutout-py/products.py (ACRYLIC + keychain) */
export const CUT_PARAMS_DEFAULT: CutParams = {
  cutType: "Cut100",
  shape: "contour",
  radiusMm: 3,
  offsetMm: 1.5,
  strokeMm: 0,
  strokeColor: "#ffffff",
  bridge: 1,
  holes: false,
  smooth: 1,
  white: "full",
  whiteChokeMm: 0.1,
  hole: true,
  holeMm: 1.5,
  ringMm: 2,
  holeGapMm: 1.5,
  holeXMm: 0,
  edits: [],
  plusMm: 3,
};

export type CutCurve = { start: { x: number; y: number }; segs: CubicSeg[] };

export interface CutResult {
  /** เส้นตัด (รวมติ่ง) มม.จริง · อ้างอิงมุมซ้ายบนของกรอบวัตถุ */
  cut: CutCurve[];
  /** รูห่วง (มม.จริง) */
  hole?: { cx: number; cy: number; r: number };
  /** ขอบรอบรูป (stroke) — เติมสีใต้ลาย */
  stroke: CutCurve[];
  /** รองขาว */
  white: CutCurve[];
  /** กรอบวัตถุบนผืนออกแบบ (มม.ผืน) */
  box: { x: number; y: number; w: number; h: number };
  /** มม.จริง ÷ มม.ผืน */
  scale: number;
  /** ขนาดตัวชิ้นงาน (ไม่รวมติ่ง) และทั้งชิ้น (มม.จริง) */
  bodyW: number;
  bodyH: number;
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** ขนาดวัตถุจริง (มม.) */
  objW: number;
  objH: number;
  extras: string[];
  warnings: string[];
}

/* ───────────── มอร์โฟโลยีด้วยสนามระยะ (แทน cv2.dilate/erode กับจานกลม) ───────────── */

function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m.slice();
  const d = distanceSq(m, w, h);
  const out = new Uint8Array(w * h);
  const r2 = r * r;
  for (let i = 0; i < out.length; i++) out[i] = d[i] <= r2 ? 1 : 0;
  return out;
}
function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m.slice();
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = m[i] ? 0 : 1;
  const d = distanceSq(inv, w, h);
  const out = new Uint8Array(w * h);
  const r2 = r * r;
  for (let i = 0; i < out.length; i++) out[i] = d[i] > r2 ? 1 : 0;
  return out;
}
const close = (m: Uint8Array, w: number, h: number, r: number) => erode(dilate(m, w, h, r), w, h, r);
const open = (m: Uint8Array, w: number, h: number, r: number) => dilate(erode(m, w, h, r), w, h, r);

/** ปิดรูที่ไม่ติดขอบ (cutout.fill_holes) */
function fillHoles(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = m.slice();
  const seen = new Uint8Array(w * h);
  const st: number[] = [];
  const push = (i: number) => {
    if (!seen[i] && !m[i]) {
      seen[i] = 1;
      st.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (st.length) {
    const i = st.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  for (let i = 0; i < out.length; i++) if (!m[i] && !seen[i]) out[i] = 1;
  return out;
}

/** ทิ้งเศษชิ้นเล็ก (cutout.clean_mask) */
function dropSpecks(m: Uint8Array, w: number, h: number, minArea: number): Uint8Array {
  const lab = new Int32Array(w * h);
  const out = new Uint8Array(w * h);
  let id = 0;
  const st: number[] = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || lab[s]) continue;
    id++;
    const comp: number[] = [];
    lab[s] = id;
    st.push(s);
    while (st.length) {
      const i = st.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (m[j] && !lab[j]) {
            lab[j] = id;
            st.push(j);
          }
        }
    }
    if (comp.length >= minArea) for (const i of comp) out[i] = 1;
  }
  return out;
}

function bbox(m: Uint8Array, w: number, h: number) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** วาดวงกลมทึบลงมาสก์ */
function disk(m: Uint8Array, w: number, h: number, cx: number, cy: number, r: number) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) m[y * w + x] = 1;
}

/**
 * มาสก์ → เส้นโค้ง (แทน potrace) · smooth 0–1.33: น้อย = เก็บมุมหัก · มาก = โค้งลื่น
 * คืนพิกัดพิกเซล (จะแปลงเป็น มม. ทีหลัง)
 */
function trace(m: Uint8Array, w: number, h: number, smooth: number, minAreaPx: number): CutCurve[] {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = m[i] ? 255 : 0;
  const r = buildCutout(g, w, h, {
    level: 128,
    insetPx: 0,
    smoothPx: Math.max(1, Math.round(1 + smooth * 1.5)),
    tolPx: 0.35 + smooth * 0.5,
    cornerDeg: smooth >= 1 ? 180 : 40 + smooth * 120,
    fillHoles: false,
    minAreaPx,
  });
  return r.curves.map((c) => ({ start: c.start, segs: c.segs }));
}

const KAPPA = 0.5522847498;
function ellipseCurve(cx: number, cy: number, rx: number, ry: number): CutCurve {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return {
    start: { x: cx + rx, y: cy },
    segs: [
      { c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry }, to: { x: cx, y: cy + ry } },
      { c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky }, to: { x: cx - rx, y: cy } },
      { c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry }, to: { x: cx, y: cy - ry } },
      { c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky }, to: { x: cx + rx, y: cy } },
    ],
  };
}

function mapCurves(cs: CutCurve[], f: (p: { x: number; y: number }) => { x: number; y: number }): CutCurve[] {
  return cs.map((c) => ({ start: f(c.start), segs: c.segs.map((s) => ({ c1: f(s.c1), c2: f(s.c2), to: f(s.to) })) }));
}

export function curvesBounds(cs: CutCurve[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p: { x: number; y: number }) => {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  };
  // จุดบนเส้นโค้งระหว่างแองเคอร์ด้วย (ส่วนโค้งนูนเกินแองเคอร์ได้)
  for (const c of cs) {
    let p0 = c.start;
    add(p0);
    for (const s of c.segs) {
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        const u = 1 - t;
        add({
          x: u * u * u * p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.to.x,
          y: u * u * u * p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.to.y,
        });
      }
      p0 = s.to;
    }
  }
  return { x0, y0, x1, y1 };
}

/* ───────────── รวมวงกลม (ติ่งรูห่วง) เข้ากับเส้นตัดแบบเวกเตอร์ ───────────── */

type P2 = { x: number; y: number };
type Cub = [P2, P2, P2, P2];
const lerp = (a: P2, b: P2, t: number): P2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const bez = (c: Cub, t: number): P2 => {
  const u = 1 - t;
  return {
    x: u * u * u * c[0].x + 3 * u * u * t * c[1].x + 3 * u * t * t * c[2].x + t * t * t * c[3].x,
    y: u * u * u * c[0].y + 3 * u * u * t * c[1].y + 3 * u * t * t * c[2].y + t * t * t * c[3].y,
  };
};
/** ตัดท่อนเบซิเยร์ที่ t (de Casteljau) */
function splitCub(c: Cub, t: number): [Cub, Cub] {
  const a = lerp(c[0], c[1], t), b = lerp(c[1], c[2], t), d = lerp(c[2], c[3], t);
  const e = lerp(a, b, t), f = lerp(b, d, t), g = lerp(e, f, t);
  return [
    [c[0], a, e, g],
    [g, f, d, c[3]],
  ];
}
/** ท่อนย่อยช่วง t0..t1 */
function subCub(c: Cub, t0: number, t1: number): Cub {
  const right = splitCub(c, t0)[1];
  return t0 >= 1 ? right : splitCub(right, (t1 - t0) / (1 - t0))[0];
}
/** ส่วนโค้งวงกลมเป็นเบซิเยร์ (ท่อนละ ≤ 90°) จากมุม a0 ไป a1 (เรเดียน · ตามทิศเครื่องหมาย) */
function arcCubs(cx: number, cy: number, R: number, a0: number, a1: number): Cub[] {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
  const da = (a1 - a0) / n;
  const k = (4 / 3) * Math.tan(da / 4);
  const out: Cub[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + da * i;
    const t1 = t0 + da;
    const p0 = { x: cx + R * Math.cos(t0), y: cy + R * Math.sin(t0) };
    const p3 = { x: cx + R * Math.cos(t1), y: cy + R * Math.sin(t1) };
    out.push([
      p0,
      { x: p0.x - k * R * Math.sin(t0), y: p0.y + k * R * Math.cos(t0) },
      { x: p3.x + k * R * Math.sin(t1), y: p3.y - k * R * Math.cos(t1) },
      p3,
    ]);
  }
  return out;
}

/**
 * รวมวงกลม (cx, cy, R) เข้ากับเส้นตัดที่วงกลมพาดผ่าน — แบบ Pathfinder › Unite: ตัดช่วงของเส้นตัวงานที่อยู่ในวงกลมทิ้ง
 * แล้วต่อด้วยส่วนโค้งด้านบนของวงกลม · จุดต่อเป็นมุมหักคม · หาจุดตัดไม่ได้ 2 จุดพอดี = null (ใช้วิธีพิกเซลแทน)
 */
function uniteCircle(curves: CutCurve[], cx: number, cy: number, R: number): CutCurve[] | null {
  const g = (q: P2) => Math.hypot(q.x - cx, q.y - cy) - R;
  for (let ci = 0; ci < curves.length; ci++) {
    const c = curves[ci];
    const cubs: Cub[] = [];
    let p0 = c.start;
    for (const sg of c.segs) {
      cubs.push([p0, sg.c1, sg.c2, sg.to]);
      p0 = sg.to;
    }
    // จุดตัด (ไล่ตามลำดับเส้น)
    const hits: { i: number; t: number }[] = [];
    const N = 48;
    cubs.forEach((cb, i) => {
      let prev = g(cb[0]);
      for (let k = 1; k <= N; k++) {
        const t = k / N;
        const v = g(bez(cb, t));
        if ((prev < 0) !== (v < 0)) {
          let lo = (k - 1) / N;
          let hi = t;
          for (let it = 0; it < 40; it++) {
            const mid = (lo + hi) / 2;
            if ((g(bez(cb, mid)) < 0) === (prev < 0)) lo = mid;
            else hi = mid;
          }
          hits.push({ i, t: (lo + hi) / 2 });
        }
        prev = v;
      }
    });
    if (hits.length === 0) continue;
    if (hits.length !== 2) return null;
    const [A, B] = hits;
    // ช่วง A→B อยู่ในวงกลมไหม → จุดออก (E) / จุดเข้า (Nn)
    const midOf = (from: { i: number; t: number }, to: { i: number; t: number }): P2 => {
      if (from.i === to.i && to.t > from.t) return bez(cubs[from.i], (from.t + to.t) / 2);
      return from.i === to.i ? bez(cubs[(from.i + Math.floor(cubs.length / 2)) % cubs.length], 0.5) : bez(cubs[from.i], (from.t + 1) / 2);
    };
    const abInside = g(midOf(A, B)) < 0;
    const E = abInside ? B : A;
    const Nn = abInside ? A : B;
    // เส้นตัวงานจาก E วนไปถึง Nn (ส่วนที่อยู่นอกวงกลม)
    const segs: Cub[] = [];
    if (E.i === Nn.i && Nn.t > E.t) segs.push(subCub(cubs[E.i], E.t, Nn.t));
    else {
      segs.push(splitCub(cubs[E.i], E.t)[1]);
      for (let j = (E.i + 1) % cubs.length; j !== Nn.i; j = (j + 1) % cubs.length) segs.push(cubs[j]);
      segs.push(splitCub(cubs[Nn.i], Nn.t)[0]);
    }
    // ส่วนโค้งจาก Nn ไป E ด้านนอก (ผ่านยอดวงกลม · มุม −90° บนจอ)
    const pN = segs[segs.length - 1][3];
    const pE = segs[0][0];
    const aN = Math.atan2(pN.y - cy, pN.x - cx);
    let aE = Math.atan2(pE.y - cy, pE.x - cx);
    const top = -Math.PI / 2;
    const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // ทิศบวก: aN → aE ผ่าน top ไหม
    const ccwHasTop = norm(top - aN) <= norm(aE - aN);
    if (ccwHasTop) {
      if (aE < aN) aE += 2 * Math.PI;
    } else {
      if (aE > aN) aE -= 2 * Math.PI;
    }
    segs.push(...arcCubs(cx, cy, R, aN, aE));
    const out: CutCurve = {
      start: segs[0][0],
      segs: segs.filter((q) => Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) > 1e-6 || q === segs[0]).map((q) => ({ c1: q[1], c2: q[2], to: q[3] })),
    };
    // ปิดเส้นให้จุดท้ายชนจุดเริ่มพอดี
    out.segs[out.segs.length - 1].to = out.start;
    return curves.map((x, j) => (j === ci ? out : x));
  }
  return null;
}

/**
 * ประมวลผลทั้งหน้า (engine.process)
 * @param img ภาพผืนออกแบบ (พื้นใส) · ppm = พิกเซลต่อ มม.ของผืน
 * @param sizeMm ด้านยาวสุดของ "ตัวชิ้นงาน" (ไม่รวมติ่ง — แบบ body_bb ของ engine.py)
 */
export function processCut(img: ImageData, ppm: number, sizeMm: number, p: CutParams): CutResult | null {
  const W0 = img.width;
  const H0 = img.height;
  const warnings: string[] = [];
  const extras: string[] = [];

  // --- มาสก์วัตถุ (clean_mask: ปิดรอยแตก + ลบจุดเศษ + ทิ้งชิ้นเล็ก) ---
  let obj: Uint8Array = new Uint8Array(W0 * H0);
  for (let i = 0; i < obj.length; i++) obj[i] = img.data[i * 4 + 3] >= 128 ? 1 : 0;
  obj = open(close(obj, W0, H0, 2), W0, H0, 2);
  obj = dropSpecks(obj, W0, H0, W0 * H0 * 0.001);
  const bb = bbox(obj, W0, H0);
  if (!bb) return null;

  // --- ขนาดฐาน (วงกลมใช้วงล้อม · วงรีขยายให้ครอบวัตถุ) ---
  const bw = bb.x1 - bb.x0;
  const bh = bb.y1 - bb.y0;
  let cx = (bb.x0 + bb.x1) / 2;
  let cy = (bb.y0 + bb.y1) / 2;
  let baseW = bw;
  let baseH = bh;
  let geo = { rx: bw / 2, ry: bh / 2 };
  if (p.shape === "circle" || p.shape === "ellipse") {
    let s = 0;
    let rMax = 0;
    for (let y = bb.y0; y < bb.y1; y += 2)
      for (let x = bb.x0; x < bb.x1; x += 2)
        if (obj[y * W0 + x]) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          rMax = Math.max(rMax, Math.hypot(dx, dy));
          s = Math.max(s, (dx / (bw / 2)) ** 2 + (dy / (bh / 2)) ** 2);
        }
    if (p.shape === "circle") geo = { rx: rMax, ry: rMax };
    else geo = { rx: (bw / 2) * Math.sqrt(Math.max(1, s)), ry: (bh / 2) * Math.sqrt(Math.max(1, s)) };
    cx = (bb.x0 + bb.x1) / 2;
    cy = (bb.y0 + bb.y1) / 2;
    baseW = geo.rx * 2;
    baseH = geo.ry * 2;
  }

  // --- ขนาดจริง: ตัวชิ้นงานยาวสุด = sizeMm (วัตถุ + ขอบสี + ระยะเส้นตัด สองข้าง) ---
  const st0 = p.strokeMm > 0 && p.shape === "contour" ? p.strokeMm : 0;
  const avail = sizeMm - 2 * p.offsetMm - 2 * st0;
  if (avail <= 0.5) throw new Error("ขนาดที่เลือกเล็กกว่าระยะเส้นตัด/ขอบ — ลดระยะเส้นตัดหรือเลือกขนาดใหญ่ขึ้น");
  const mmPerPx = avail / Math.max(baseW, baseH);
  const px = (mm: number) => mm / mmPerPx;

  const st = Math.round(px(st0));
  const b = px(p.offsetMm);
  const bi = Math.round(b);
  const kc = Math.abs(bi) > 0 ? Math.max(3, Math.floor(Math.abs(bi) * p.bridge) * 2 + 1) : 1;
  const holeR = px(p.holeMm) / 2;
  const ringR = holeR + px(p.ringMm);
  const extra = p.hole ? Math.ceil(ringR * 2 + px(p.holeGapMm)) + 6 : 0;
  const plusR = p.edits.length ? Math.floor(kc / 2) + Math.round(px(p.plusMm)) : 0;
  const pad = Math.max(0, bi) + Math.max(Math.floor(kc / 2), plusR) + st + 6 + extra;

  // --- ผืนทำงานครอปรอบวัตถุ + เผื่อขอบ ---
  const X0 = Math.max(0, bb.x0 - 2);
  const Y0 = Math.max(0, bb.y0 - 2);
  const X1 = Math.min(W0, bb.x1 + 2);
  const Y1 = Math.min(H0, bb.y1 + 2);
  const w = X1 - X0 + 2 * pad;
  const h = Y1 - Y0 + 2 * pad;
  const ox = pad - X0;
  const oy = pad - Y0;
  let objM: Uint8Array = new Uint8Array(w * h);
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) objM[(y + oy) * w + (x + ox)] = obj[y * W0 + x];
  // ภาพวัตถุจริง (alpha ≥ 128 · ไม่ผ่านการทำความสะอาด) ใช้วางรู/รองขาว
  let artM: Uint8Array = new Uint8Array(w * h);
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) artM[(y + oy) * w + (x + ox)] = img.data[(y * W0 + x) * 4 + 3] >= 128 ? 1 : 0;

  const minArea = Math.max(4, px(1) * px(1)); // ทิ้งเส้นที่เล็กกว่า 1 ตร.มม.
  // --- ขอบรอบรูป (stroke): ขยายรูปทรงออก st px — ขอบนอกนี้คือ "ขอบงาน" ใหม่ ---
  let stroke: CutCurve[] = [];
  if (st > 0) {
    const filled = p.holes ? objM : fillHoles(objM, w, h);
    const smask = dilate(filled, w, h, st);
    stroke = trace(smask, w, h, p.smooth, minArea);
    objM = smask;
    artM = smask;
  }

  // --- เส้นตัด ---
  let m: Uint8Array;
  if (p.shape === "contour") {
    m = bi > 0 ? dilate(objM, w, h, bi) : objM.slice();
    const mRaw = m.slice();
    if (kc > 1 && p.bridge > 0) m = close(m, w, h, kc / 2);
    if (p.edits.length) {
      // ＋ = ถมร่องรอบจุดที่จิ้มให้มนขึ้น · − = เส้นวิ่งตามซอกงาน (ไม่ถม) ในวงแปรง
      const minus = new Uint8Array(w * h);
      let plusClosed: Uint8Array | null = null;
      for (const [ex, ey, rMm, sg] of p.edits) {
        const cxp = ex * ppm + ox;
        const cyp = ey * ppm + oy;
        const rr = px(rMm) + Math.max(bi, 0) + (sg > 0 ? 0 : Math.floor(kc / 2));
        if (sg < 0) {
          disk(minus, w, h, cxp, cyp, Math.max(1, rr));
          continue;
        }
        const R = Math.max(kc / 2, 1) + px(p.plusMm);
        plusClosed ??= close(mRaw, w, h, R);
        const reg = new Uint8Array(w * h);
        disk(reg, w, h, cxp, cyp, Math.max(1, rr) + R * 2);
        for (let i = 0; i < m.length; i++) if (reg[i] && plusClosed[i]) m[i] = 1;
      }
      for (let i = 0; i < m.length; i++) if (minus[i]) m[i] = mRaw[i];
    }
    if (!p.holes) m = fillHoles(m, w, h);
    if (bi < 0) {
      m = erode(m, w, h, -bi);
      if (!m.some((v) => v)) throw new Error("ตัดเข้าเนื้อมากเกินไป งานหายหมด");
    }
  } else {
    m = new Uint8Array(w * h);
    if (p.shape === "rect" || p.shape === "rounded") {
      const rx0 = bb.x0 + ox - b;
      const ry0 = bb.y0 + oy - b;
      const rx1 = bb.x1 + ox + b;
      const ry1 = bb.y1 + oy + b;
      const r = p.shape === "rounded" ? Math.min(px(p.radiusMm), (rx1 - rx0) / 2, (ry1 - ry0) / 2) : 0;
      const hx = (rx1 - rx0) / 2;
      const hy = (ry1 - ry0) / 2;
      const mx = (rx0 + rx1) / 2;
      const my = (ry0 + ry1) / 2;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const qx = Math.abs(x + 0.5 - mx) - (hx - r);
          const qy = Math.abs(y + 0.5 - my) - (hy - r);
          if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0) m[y * w + x] = 1;
        }
    } else {
      const rx = geo.rx + b;
      const ry = geo.ry + b;
      if (rx <= 1 || ry <= 1) throw new Error("ตัดเข้าเนื้อมากเกินไป");
      const ex = cx + ox;
      const ey = cy + oy;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) if (((x + 0.5 - ex) / rx) ** 2 + ((y + 0.5 - ey) / ry) ** 2 <= 1) m[y * w + x] = 1;
    }
  }
  const body = bbox(m, w, h);
  if (!body) return null;

  // --- ติ่งรูห่วง (keychain): รูเหนือเนื้องาน ขอบรูห่างงาน hole_gap · วงกลมทับเส้นตัดแล้วรวม (มุมหัก) ---
  let holeC: { cx: number; cy: number } | null = null;
  let sharp = false;
  let bodyForTab: Uint8Array | null = null;
  if (p.hole) {
    const ab = bbox(artM, w, h) ?? body;
    const yt = ab.y0;
    const band = Math.max(2, Math.round(px(1)));
    let sx = 0;
    let n = 0;
    for (let y = yt; y <= yt + band && y < h; y++)
      for (let x = 0; x < w; x++)
        if (artM[y * w + x]) {
          sx += x + 0.5;
          n++;
        }
    const xt = (n ? sx / n : (ab.x0 + ab.x1) / 2) + px(p.holeXMm);
    const gap = px(p.holeGapMm);
    const dist = distanceSq(artM, w, h);
    let hy = yt - gap - holeR;
    const ix = Math.round(xt);
    for (let k = 0; k < Math.ceil(ringR * 4 + gap * 2) + 20; k++) {
      const iy = Math.round(hy);
      if (iy < 0 || ix < 0 || ix >= w) break;
      if (iy >= h || Math.sqrt(dist[Math.min(iy, h - 1) * w + ix]) >= gap + holeR - 0.5) break;
      hy -= 1;
    }
    hy = Math.max(hy, ringR + 2);
    holeC = { cx: xt, cy: hy };
    const add = new Uint8Array(w * h);
    disk(add, w, h, xt, hy, ringR);
    const touches = dilate(add, w, h, 1.5).some((v, i) => v && m[i]);
    if (touches) {
      // เก็บเส้นตัดตัวงาน (ก่อนรวมวงกลม) ไว้ต่อวงกลมแบบเวกเตอร์ — รอยต่อเป็นมุมหักคม (แบบ Pathfinder › Unite ของ engine.py)
      bodyForTab = m.slice();
      for (let i = 0; i < m.length; i++) if (add[i]) m[i] = 1;
      sharp = true;
    } else {
      // วงกลมลอยไม่ถึงเส้นตัด → ต่อคอลงมาหาตัวงาน แล้วลบมุมรอยต่อ
      let ylink = Math.round(hy + gap + ringR);
      for (let y = Math.round(hy); y < h; y++)
        if (m[y * w + ix]) {
          ylink = y + Math.round(px(1));
          break;
        }
      for (let y = Math.round(hy); y <= Math.min(h - 1, ylink); y++)
        for (let x = Math.round(xt - ringR); x <= Math.round(xt + ringR); x++) if (x >= 0 && x < w) add[y * w + x] = 1;
      const u = m.slice();
      for (let i = 0; i < u.length; i++) if (add[i]) u[i] = 1;
      const k = ringR * 1.2;
      const closed = close(u, w, h, k);
      const near = dilate(add, w, h, k);
      for (let i = 0; i < u.length; i++) if (near[i]) u[i] = closed[i];
      m = u;
      extras.push("ติ่งวงกลมไม่ถึงเส้นตัด จึงต่อคอให้");
    }
    m = fillHoles(m, w, h);
    extras.push(`รูห่วง Ø${p.holeMm} มม.`);
  }
  let cutPx: CutCurve[] | null = null;
  if (bodyForTab && holeC) {
    // ✂️ ติ่งวงกลมทับเส้นตัด: ลากเส้นตัวงานตามปกติ แล้วแทนช่วงที่อยู่ในวงกลมด้วยส่วนโค้งของวงกลม
    //    = มุมหักคมตรงรอยต่อ (เดิมรวมเป็นพิกเซลแล้วลากใหม่ → รอยต่อมนเป็นไหล่ ไม่เหมือนหน้า bg · 14 ต.ค. 69)
    const body = trace(fillHoles(bodyForTab, w, h), w, h, p.smooth, minArea);
    cutPx = uniteCircle(body, holeC.cx, holeC.cy, ringR);
  }
  cutPx ??= trace(m, w, h, Math.min(p.smooth, sharp ? 0.8 : p.smooth), minArea);
  if (!cutPx.length) return null;

  // --- รองขาว: เนื้อภาพในเส้นตัด หดเข้าเล็กน้อยกันขาวโผล่ ---
  let whitePx: CutCurve[] = [];
  if (p.white === "full") {
    let wm: Uint8Array = new Uint8Array(w * h);
    for (let i = 0; i < wm.length; i++) wm[i] = artM[i] && m[i] ? 1 : 0;
    const ck = Math.round(px(p.whiteChokeMm));
    if (ck > 0) wm = erode(wm, w, h, ck);
    if (wm.some((v) => v)) {
      whitePx = trace(wm, w, h, p.smooth, minArea);
      extras.push("รองขาวเต็มรูปทรง");
    }
  }

  // --- พิกเซล → มม.จริง อ้างอิงมุมซ้ายบนของกรอบวัตถุ ---
  const ax = bb.x0 + ox;
  const ay = bb.y0 + oy;
  const toMm = (q: { x: number; y: number }) => ({ x: (q.x - ax) * mmPerPx, y: (q.y - ay) * mmPerPx });
  const cut = mapCurves(cutPx, toMm);
  const holeOut = holeC ? { cx: (holeC.cx - ax) * mmPerPx, cy: (holeC.cy - ay) * mmPerPx, r: p.holeMm / 2 } : undefined;
  const bounds = curvesBounds(cut);
  const bodyW = (body.x1 - body.x0) * mmPerPx;
  const bodyH = (body.y1 - body.y0) * mmPerPx;
  if (p.hole) extras.push(`รวมทั้งชิ้น ${((bounds.x1 - bounds.x0) / 10).toFixed(2)} × ${((bounds.y1 - bounds.y0) / 10).toFixed(2)} ซม.`);
  const touchEdge = bb.x0 <= 0 || bb.y0 <= 0 || bb.x1 >= W0 || bb.y1 >= H0;
  if (touchEdge) warnings.push("ลายชนขอบผืน อาจถูกตัดขาดบางส่วน");
  if (cut.length > 1) warnings.push(`เส้นตัดแยกเป็น ${cut.length} ชิ้น — เพิ่มระยะเส้นตัด/ถมร่อง หรือจัดลายให้ติดกัน`);

  return {
    cut,
    hole: holeOut,
    stroke: mapCurves(stroke, toMm),
    white: mapCurves(whitePx, toMm),
    box: { x: bb.x0 / ppm, y: bb.y0 / ppm, w: bw / ppm, h: bh / ppm },
    scale: (bw * mmPerPx) / (bw / ppm),
    bodyW,
    bodyH,
    bounds,
    objW: bw * mmPerPx,
    objH: bh * mmPerPx,
    extras,
    warnings,
  };
}

/** path ของเส้นโค้งชุดหนึ่ง (หน่วยตาม ctx ที่ตั้งสเกลไว้) */
export function pathCurves(ctx: CanvasRenderingContext2D, cs: CutCurve[]) {
  for (const c of cs) {
    ctx.moveTo(c.start.x, c.start.y);
    for (const s of c.segs) ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y);
    ctx.closePath();
  }
}

/** สูตรสินค้า (tools/cutout-py/products.py) — เลือกแล้วตั้งค่าเส้นตัดตามชนิดงาน */
export const CUT_PRESETS: { id: string; name: string; p: Partial<CutParams> & { shrink?: number } }[] = [
  { id: "keychain", name: "พวงกุญแจอะคริลิก", p: { offsetMm: 1.5, cutType: "Cut100", white: "full", whiteChokeMm: 0.1, holeMm: 1.5, ringMm: 2, holeGapMm: 1.5, holeXMm: 0 } },
  { id: "acrylic", name: "งานอะคริลิกตามทรง (บัคเคิล เขย่า กิ๊บ ฯลฯ)", p: { offsetMm: 1.5, cutType: "Cut100", white: "full", whiteChokeMm: 0.1 } },
  { id: "sticker100", name: "สติกเกอร์ไดคัท 100 (ตัดเป็นตัว)", p: { offsetMm: 0, cutType: "Cut100", white: "none" } },
  { id: "custom", name: "กำหนดเอง", p: {} },
];

export type CutPreset = { id: string; name: string; p: Partial<CutParams> & { shrink?: number } };

/**
 * 🔄 สูตรสินค้าที่ซิงก์จากหน้า /admin/diecut?tab=bg (products.py · คีย์ snake_case) → ชุดเดียวกับ CUT_PRESETS
 * เฉพาะชนิดงานที่จอลูกค้ารองรับ (ตัดสแตนดี้/กระดาษขนาดตายตัวออก) · ไม่มีค่าซิงก์ = CUT_PRESETS ในโค้ด
 */
export function cutPresetsFrom(sync?: { products: { id: string; name: string; kind?: string; p: Record<string, unknown> }[] } | null): CutPreset[] {
  if (!sync?.products?.length) return CUT_PRESETS;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : typeof v === "string" ? ["1", "true"].includes(v) : typeof v === "number" ? v !== 0 : undefined);
  const out: CutPreset[] = [];
  for (const it of sync.products) {
    if (it.kind === "standee" || it.kind === "paper") continue;
    const q = it.p;
    const p: CutPreset["p"] = {};
    const shape = q.shape;
    if (shape === "contour" || shape === "rect" || shape === "rounded" || shape === "circle" || shape === "ellipse") p.shape = shape;
    const ct = q.cut_type;
    if (ct === "Cut100" || ct === "Cut50") p.cutType = ct;
    if (q.white === "full" || q.white === "none") p.white = q.white;
    const n = (k: string) => num(q[k]);
    if (n("radius_mm") !== undefined) p.radiusMm = n("radius_mm");
    if (n("offset_mm") !== undefined) p.offsetMm = n("offset_mm");
    if (n("white_choke_mm") !== undefined) p.whiteChokeMm = n("white_choke_mm");
    if (n("bridge") !== undefined) p.bridge = n("bridge");
    if (n("smooth") !== undefined) p.smooth = n("smooth");
    if (n("shrink") !== undefined) p.shrink = n("shrink");
    if (n("hole_mm") !== undefined) p.holeMm = n("hole_mm");
    if (n("ring_mm") !== undefined) p.ringMm = n("ring_mm");
    if (n("hole_gap_mm") !== undefined) p.holeGapMm = n("hole_gap_mm");
    if (n("hole_x_mm") !== undefined) p.holeXMm = n("hole_x_mm");
    if (n("stroke_mm") !== undefined) p.strokeMm = n("stroke_mm");
    if (typeof q.stroke === "string" && /^#[0-9a-f]{6}$/i.test(q.stroke)) p.strokeColor = q.stroke;
    if (bool(q.holes) !== undefined) p.holes = bool(q.holes);
    out.push({ id: it.id, name: it.name, p });
  }
  // ให้มี "กำหนดเอง" เสมอ (สูตรว่าง) · "custom" ของ python มีค่า cut_type/white ติดมา — ใช้ชื่อแต่ไม่ใช้ค่า
  const fixed = out.map((x) => (x.id === "custom" ? { ...x, p: {} } : x));
  return fixed.some((x) => x.id === "custom") ? fixed : [...fixed, { id: "custom", name: "กำหนดเอง", p: {} }];
}

/** เส้นตัดเป็นไฟล์ SVG (มม.จริง) — กรอบ = กรอบเส้นตัดทั้งชิ้น + pad */
export function cutSvg(r: CutResult, pad = 1): string {
  const x0 = r.bounds.x0 - pad;
  const y0 = r.bounds.y0 - pad;
  const w = r.bounds.x1 - r.bounds.x0 + pad * 2;
  const h = r.bounds.y1 - r.bounds.y0 + pad * 2;
  const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
  const d = r.cut
    .map((c) => `M${n(c.start.x - x0)},${n(c.start.y - y0)}` + c.segs.map((s) => `C${n(s.c1.x - x0)},${n(s.c1.y - y0)} ${n(s.c2.x - x0)},${n(s.c2.y - y0)} ${n(s.to.x - x0)},${n(s.to.y - y0)}`).join("") + "Z")
    .join("");
  const hole = r.hole ? `<circle cx="${n(r.hole.cx - x0)}" cy="${n(r.hole.cy - y0)}" r="${n(r.hole.r)}" fill="none" stroke="#ff00ff" stroke-width="0.25"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}mm" height="${n(h)}mm" viewBox="0 0 ${n(w)} ${n(h)}"><path d="${d}" fill="none" stroke="#ff00ff" stroke-width="0.25"/>${hole}</svg>\n`;
}
