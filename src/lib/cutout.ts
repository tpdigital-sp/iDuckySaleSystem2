/**
 * "ตัดภาพ" แบบ pen tool — จากมาสก์ (ค่า 0–255 ต่อพิกเซล) → เส้นโค้งเบซิเยร์ปิดรอบวัตถุ
 * แล้วใช้เส้นนั้นเป็น clipping path ตัดรูปจริง = ขอบคมเรียบเหมือนวาดด้วย pen tool ไม่ใช่ขอบฟุ้งของ AI
 *
 * ขั้นตอน: มาสก์ → หดขอบ (กันขอบพื้นหลังติดมา) → เกลาขอบ (เบลอ) → ไล่เส้นที่ระดับ "ครึ่งทาง"
 *          แบบ marching squares (ละเอียดกว่าพิกเซล ไม่มีขั้นบันได) → หามุมหัก → ฟิตเบซิเยร์ทีละช่วงระหว่างมุม
 *
 * คำนวณล้วน ๆ ไม่แตะ DOM · หน่วยทั้งหมดเป็นพิกเซลของมาสก์ (x ขวา · y ลง · จุดกลางพิกเซล = +0.5)
 */

import { fitClosedCurve, fitCurve, type CubicSeg, type Pt } from "./bezier-fit";

export interface CutoutSettings {
  /** ระดับมาสก์ที่ถือเป็นขอบ (1–254) · มากขึ้น = เส้นเข้าในตัววัตถุ */
  level: number;
  /** หดขอบเข้า (พิกเซล) — กันเส้นขอบพื้นหลังติดมาเป็นขอบขาว/ขอบดำ */
  insetPx: number;
  /** เกลาขอบ (พิกเซล) — ลบรอยหยักเล็ก ๆ · 0 = ตามมาสก์เป๊ะ */
  smoothPx: number;
  /** ความคลาดเคลื่อนตอนฟิตเส้นโค้ง (พิกเซล) — มาก = จุดแองเคอร์น้อย เส้นลื่น */
  tolPx: number;
  /** มุมที่ถือว่า "หัก" (องศา) — ตรงนั้นเป็นจุดแหลมแบบ pen tool · 180 = ไม่เก็บมุม (โค้งหมด) */
  cornerDeg: number;
  /** ปิดรูกลางวัตถุ (ไม่ตัดทะลุ) */
  fillHoles: boolean;
  /** ทิ้งเศษที่เล็กกว่านี้ (ตร.พิกเซล) */
  minAreaPx: number;
  /** ปิดรูกลางวัตถุที่เล็กกว่านี้ (ตร.พิกเซล) · ไม่ใส่ = ใช้ minAreaPx */
  minHolePx?: number;
}

export interface CutoutCurve {
  start: Pt;
  segs: CubicSeg[];
  /** true = รูกลางวัตถุ */
  hole: boolean;
}

export interface CutoutResult {
  curves: CutoutCurve[];
  anchors: number;
  /** กรอบรวมของเส้น (พิกเซลมาสก์) */
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
  pieces: number;
  holes: number;
}

/* ───────────── ฟิลเตอร์มาสก์ ───────────── */

/** เบลอกล่องแนวนอน+แนวตั้ง (ทำ 2 รอบ ≈ เกาส์เซียน) */
export function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const rad = Math.round(r);
  if (rad < 1) return src;
  const a = Float32Array.from(src);
  const b = new Float32Array(w * h);
  const pass = (from: Float32Array, to: Float32Array, horiz: boolean) => {
    const n = horiz ? w : h;
    const lines = horiz ? h : w;
    const win = rad * 2 + 1;
    for (let l = 0; l < lines; l++) {
      const idx = (i: number) => (horiz ? l * w + i : i * w + l);
      const at = (i: number) => from[idx(i < 0 ? 0 : i >= n ? n - 1 : i)];
      let sum = 0;
      for (let i = -rad; i <= rad; i++) sum += at(i);
      for (let i = 0; i < n; i++) {
        to[idx(i)] = sum / win;
        sum += at(i + rad + 1) - at(i - rad);
      }
    }
  };
  for (let k = 0; k < 2; k++) {
    pass(a, b, true);
    pass(b, a, false);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = a[i] < 0 ? 0 : a[i] > 255 ? 255 : a[i] + 0.5;
  return out;
}

/** หดส่วนที่เป็นวัตถุ (min filter แยกแกน · รัศมีเป็นพิกเซล) */
export function erodeGray(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const rad = Math.round(r);
  if (rad < 1) return src;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = Math.max(0, x - rad); k <= Math.min(w - 1, x + rad); k++) {
        const v = src[y * w + k];
        if (v < m) m = v;
      }
      tmp[y * w + x] = m;
    }
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      let m = 255;
      for (let k = Math.max(0, y - rad); k <= Math.min(h - 1, y + rad); k++) {
        const v = tmp[k * w + x];
        if (v < m) m = v;
      }
      out[y * w + x] = m;
    }
  return out;
}

/** อุดรูที่ล้อมรอบด้วยวัตถุ (พื้นหลังที่ไม่แตะขอบภาพ = รูใน) */
export function fillHolesGray(src: Uint8Array, w: number, h: number, level: number): Uint8Array {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!outside[i] && src[i] < level) {
      outside[i] = 1;
      stack.push(i);
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
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  const out = Uint8Array.from(src);
  for (let i = 0; i < out.length; i++) if (!outside[i] && out[i] < level) out[i] = 255;
  return out;
}

/* ───────────── marching squares ───────────── */

/**
 * ไล่เส้นที่ระดับ level ของมาสก์ — ตำแหน่งจุดเฉลี่ยตามค่าจริง (ละเอียดกว่าพิกเซล)
 * ใส่ขอบศูนย์รอบภาพ 1 ช่องให้ทุกเส้นปิดวงเสมอ
 */
export function isoContours(field: ArrayLike<number>, w: number, h: number, level: number, outside = 0): Pt[][] {
  const W = w + 2;
  const H = h + 2;
  const v = (gx: number, gy: number) => (gx < 1 || gy < 1 || gx > w || gy > h ? outside : field[(gy - 1) * w + (gx - 1)]);
  const L = level;
  const hId = (gx: number, gy: number) => (gy * W + gx) * 2;
  const vId = (gx: number, gy: number) => (gy * W + gx) * 2 + 1;
  const pos = new Map<number, Pt>();
  const ptOf = (id: number): Pt => {
    let p = pos.get(id);
    if (p) return p;
    const cell = id >> 1;
    const gx = cell % W;
    const gy = (cell - gx) / W;
    if ((id & 1) === 0) {
      const a = v(gx, gy);
      const b = v(gx + 1, gy);
      const t = a === b ? 0.5 : (L - a) / (b - a);
      p = { x: gx - 0.5 + t, y: gy - 0.5 };
    } else {
      const a = v(gx, gy);
      const b = v(gx, gy + 1);
      const t = a === b ? 0.5 : (L - a) / (b - a);
      p = { x: gx - 0.5, y: gy + t - 0.5 };
    }
    pos.set(id, p);
    return p;
  };
  /** จุดตัดหนึ่งจุดมีเพื่อนบ้านสองฝั่งเสมอ */
  const nb = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const la = nb.get(a);
    if (la) la.push(b);
    else nb.set(a, [b]);
    const lb = nb.get(b);
    if (lb) lb.push(a);
    else nb.set(b, [a]);
  };
  for (let gy = 0; gy < H - 1; gy++) {
    for (let gx = 0; gx < W - 1; gx++) {
      const tl = v(gx, gy) >= L ? 8 : 0;
      const tr = v(gx + 1, gy) >= L ? 4 : 0;
      const br = v(gx + 1, gy + 1) >= L ? 2 : 0;
      const bl = v(gx, gy + 1) >= L ? 1 : 0;
      const c = tl | tr | br | bl;
      if (c === 0 || c === 15) continue;
      const T = hId(gx, gy);
      const B = hId(gx, gy + 1);
      const Lf = vId(gx, gy);
      const R = vId(gx + 1, gy);
      const center = (v(gx, gy) + v(gx + 1, gy) + v(gx + 1, gy + 1) + v(gx, gy + 1)) / 4 >= L;
      switch (c) {
        case 1: case 14: link(Lf, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(Lf, R); break;
        case 4: case 11: link(T, R); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(Lf, T); break;
        case 5:
          if (center) { link(Lf, T); link(B, R); } else { link(T, R); link(Lf, B); }
          break;
        case 10:
          if (center) { link(T, R); link(Lf, B); } else { link(Lf, T); link(B, R); }
          break;
      }
    }
  }
  const seen = new Set<number>();
  const loops: Pt[][] = [];
  for (const startId of nb.keys()) {
    if (seen.has(startId)) continue;
    const loop: Pt[] = [];
    let prev = -1;
    let cur = startId;
    let guard = 0;
    while (!seen.has(cur) && guard++ < 1e7) {
      seen.add(cur);
      loop.push(ptOf(cur));
      const ns = nb.get(cur)!;
      const next = ns[0] !== prev ? ns[0] : ns[1];
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    if (loop.length > 4) loops.push(loop);
  }
  return loops;
}

/* ───────────── เส้น → เบซิเยร์ (เก็บมุมคม) ───────────── */

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** จุดอยู่ในรูปปิดไหม (ray casting) */
function insidePoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** ลดจุดที่อยู่ชิดกันเกินไป (marching squares ให้จุดถี่ทุกพิกเซล) */
function thin(pts: Pt[], minGap: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const q = out[out.length - 1];
    if (Math.hypot(pts[i].x - q.x, pts[i].y - q.y) >= minGap) out.push(pts[i]);
  }
  return out;
}

/**
 * ค้นหามุมหัก: มุมระหว่างทิศเข้า/ทิศออกที่วัดห่างออกไป reach พิกเซล · เก็บเฉพาะจุดที่หักแรงสุดในละแวก
 * keep(turn) = กรองเพิ่ม · turn = ทิศเลี้ยว (ผลคูณไขว้ เครื่องหมายเดียวกับ signedArea = เลี้ยวไปทางเดียวกับวง)
 */
function findCorners(pts: Pt[], reach: number, minDeg: number, keep?: (turn: number) => boolean): number[] {
  const n = pts.length;
  if (n < 8 || minDeg >= 180) return [];
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const q = pts[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(q.x - pts[i].x, q.y - pts[i].y);
  }
  const total = cum[n];
  if (total < reach * 6) return [];
  const step = Math.max(1, Math.round(reach / Math.max(0.5, total / n)));
  const ang = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - step + n) % n];
    const p = pts[i];
    const b = pts[(i + step) % n];
    const ux = p.x - a.x, uy = p.y - a.y;
    const vx = b.x - p.x, vy = b.y - p.y;
    const lu = Math.hypot(ux, uy) || 1;
    const lv = Math.hypot(vx, vy) || 1;
    const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)));
    ang[i] = keep && !keep(ux * vy - uy * vx) ? 0 : (Math.acos(cos) * 180) / Math.PI;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (ang[i] < minDeg) continue;
    let best = true;
    for (let k = -step; k <= step && best; k++) {
      if (!k) continue;
      const j = (i + k + n) % n;
      if (ang[j] > ang[i] || (ang[j] === ang[i] && j < i)) best = false;
    }
    if (best) out.push(i);
  }
  return out;
}

/** ทิศของเส้นที่ปลายช่วง: จากจุดที่ห่างปลาย r0 ไปจุดที่ห่าง r1 (ข้ามโค้งมนเล็ก ๆ ตรงมุมไป ไม่ให้ทิศเอียง) */
function tangentAt(pts: Pt[], fromEnd: boolean, r0: number, r1: number): Pt {
  const at = (k: number) => pts[fromEnd ? pts.length - 1 - k : k];
  const p = at(0);
  let a = 0;
  let b = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = Math.hypot(at(k).x - p.x, at(k).y - p.y);
    if (!a && d >= r0) a = k;
    b = k;
    if (d >= r1) break;
  }
  const q0 = at(a && a < b ? a : 0);
  const q1 = at(b);
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/** ช่วงนี้เป็นเส้นตรงไหม (ทุกจุดห่างเส้นเชื่อมปลายไม่เกิน tol) */
function isStraight(pts: Pt[], tol: number): boolean {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) return false;
  for (const p of pts) if (Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l > tol) return false;
  return true;
}

export function fitLoop(
  loop: Pt[],
  tol: number,
  cornerDeg: number,
  blurPx: number,
  keepCorner?: (turn: number) => boolean
): { start: Pt; segs: CubicSeg[] } {
  const pts = thin(loop, 0.75);
  const n = pts.length;
  const corners = findCorners(pts, Math.max(3, tol * 4, blurPx * 2.5), cornerDeg, keepCorner);
  if (corners.length === 0) return { start: pts[0], segs: fitClosedCurve(pts, tol) };

  // ระยะที่มุมโดนเบลอจนมน — ตัดทิ้งแล้วต่อเส้นตรงสองข้างไปชนกันเป็นมุมแหลม (แบบ pen tool)
  const trim = Math.max(1.5, blurPx * 2 + 1);
  const r1 = Math.max(trim + 4, tol * 10);
  const ring = (i: number) => pts[((i % n) + n) % n];
  /** จุดตามเส้นจากมุม i ไปทาง dir ที่ห่างออกไประหว่าง d0..d1 */
  const run = (i: number, dir: 1 | -1, d0: number, d1: number) => {
    const p = ring(i);
    let q0: Pt | null = null;
    let q1: Pt = p;
    for (let k = 1; k < n; k++) {
      const q = ring(i + dir * k);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (!q0 && d >= d0) q0 = q;
      q1 = q;
      if (d >= d1) break;
    }
    return [q0 ?? p, q1] as const;
  };
  const snapped = corners.map((ci) => {
    const apex = ring(ci);
    const [a0, a1] = run(ci, -1, trim, r1);
    const [b0, b1] = run(ci, 1, trim, r1);
    // จุดตัดของเส้น a1→a0 กับ b1→b0
    const d1x = a0.x - a1.x, d1y = a0.y - a1.y;
    const d2x = b0.x - b1.x, d2y = b0.y - b1.y;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return apex;
    const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
    const x = { x: a1.x + d1x * t, y: a1.y + d1y * t };
    return Math.hypot(x.x - apex.x, x.y - apex.y) <= trim * 1.5 ? x : apex;
  });

  const segs: CubicSeg[] = [];
  for (let c = 0; c < corners.length; c++) {
    const ia = corners[c];
    const ib = corners[(c + 1) % corners.length];
    const len = ((ib - ia + n) % n) || n;
    const A = ring(ia);
    const B = ring(ib);
    const piece: Pt[] = [snapped[c]];
    for (let k = 1; k < len; k++) {
      const q = ring(ia + k);
      if (Math.hypot(q.x - A.x, q.y - A.y) < trim || Math.hypot(q.x - B.x, q.y - B.y) < trim) continue;
      piece.push(q);
    }
    piece.push(snapped[(c + 1) % corners.length]);
    const p0 = piece[0];
    const p1 = piece[piece.length - 1];
    // เส้นตรง = ท่อนเดียว จุดควบคุมอยู่บนเส้น (แบบคลิกสองจุดด้วย pen tool)
    if (piece.length < 4 || isStraight(piece, tol)) {
      segs.push({
        c1: { x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3 },
        c2: { x: p0.x + ((p1.x - p0.x) * 2) / 3, y: p0.y + ((p1.y - p0.y) * 2) / 3 },
        to: p1,
      });
      continue;
    }
    segs.push(...fitCurve(piece, tol, tangentAt(piece, false, 0.5, r1), tangentAt(piece, true, 0.5, r1)));
  }
  return { start: snapped[0], segs };
}

/** มาสก์ → เส้นตัดภาพทั้งชุด */
export function buildCutout(mask: Uint8Array, w: number, h: number, s: CutoutSettings): CutoutResult {
  const level = Math.min(254, Math.max(1, Math.round(s.level)));
  let f = mask;
  if (s.insetPx > 0) f = erodeGray(f, w, h, s.insetPx);
  if (s.smoothPx > 0) f = boxBlur(f, w, h, s.smoothPx);
  if (s.fillHoles) f = fillHolesGray(f, w, h, level);
  const loops = isoContours(f, w, h, level).filter((l) => Math.abs(signedArea(l)) >= s.minAreaPx);
  if (!loops.length) return { curves: [], anchors: 0, bounds: null, pieces: 0, holes: 0 };
  // รู = วงที่อยู่ในวงอื่นเป็นจำนวนคี่ (เส้นจาก marching squares ไม่มีทิศ ใช้การซ้อนกันแทน)
  const tol = Math.max(0.05, s.tolPx);
  const depthOf = (i: number) => {
    let depth = 0;
    for (let j = 0; j < loops.length; j++) if (j !== i && insidePoly(loops[i][0], loops[j])) depth++;
    return depth;
  };
  const minHole = s.minHolePx ?? 0;
  const curves: CutoutCurve[] = [];
  loops.forEach((l, i) => {
    const hole = depthOf(i) % 2 === 1;
    if (hole && Math.abs(signedArea(l)) < minHole) return; // รูเล็ก (มักเป็นฝุ่นจาก AI) = ไม่เจาะ
    curves.push({ ...fitLoop(l, tol, s.cornerDeg, s.smoothPx), hole });
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of loops)
    for (const p of l) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  return {
    curves,
    anchors: curves.reduce((a, c) => a + c.segs.length, 0),
    bounds: { x0, y0, x1, y1 },
    pieces: curves.filter((c) => !c.hole).length,
    holes: curves.filter((c) => c.hole).length,
  };
}

/** เส้นทั้งชุดเป็น path ของ SVG (คูณสเกลได้ · เลื่อนจุดเริ่มได้) */
export function cutoutSvgPath(curves: CutoutCurve[], k = 1, dx = 0, dy = 0): string {
  const n = (v: number) => (Math.round(v * 100) / 100).toString();
  const X = (p: Pt) => n(p.x * k + dx);
  const Y = (p: Pt) => n(p.y * k + dy);
  return curves
    .map(
      (c) =>
        `M${X(c.start)} ${Y(c.start)}` +
        c.segs.map((s) => `C${X(s.c1)} ${Y(s.c1)} ${X(s.c2)} ${Y(s.c2)} ${X(s.to)} ${Y(s.to)}`).join("") +
        "Z"
    )
    .join("");
}

/* ───────────── เก็บขอบละเอียด ───────────── */

/**
 * เอาขอบละเอียดจาก detail มาแทนขอบหยาบของ base เฉพาะ "แถบรอบขอบ" กว้าง bandPx
 * ด้านในแถบ = วัตถุแน่นอน (ตาม base) · นอกแถบ = พื้นแน่นอน · ในแถบเชื่อ detail
 * → ได้ทั้ง "เลือกถูกชิ้น" จาก base (SAM) และ "ขอบคมละเอียด" จาก detail (ISNet ที่ครอปมาดูใกล้ ๆ)
 */
export function refineEdges(base: Uint8Array, detail: Uint8Array, w: number, h: number, bandPx: number): Uint8Array {
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < bin.length; i++) bin[i] = base[i] >= 128 ? 255 : 0;
  // เกลาเฉพาะ "ขอบนอก" — รูด้านในคงตาม base (ไม่งั้นส่วนสีคล้ายพื้น เช่นท้องฟ้าในลาย จะโดนเจาะรูเพิ่ม)
  const solid = fillHolesGray(bin, w, h, 128);
  const r = Math.max(1, Math.round(bandPx));
  const inner = erodeGray(solid, w, h, r);
  // ขยาย = หดของกลับด้าน
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = 255 - solid[i];
  const outerInv = erodeGray(inv, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    if (inner[i] === 255) out[i] = base[i];
    else if (outerInv[i] === 255) out[i] = 0;
    else out[i] = solid[i] === 255 && bin[i] === 0 ? base[i] : detail[i]; // รูที่ชิดขอบ = คงเดิม
  }
  return out;
}

/** กรอบรอบส่วนที่เป็นวัตถุ (ค่า ≥ 128) · ไม่มีเลย = null */
export function maskBounds(m: Uint8Array, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x] >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/* ───────────── หาพื้นหลังด้วยสี (ภาพพื้นเรียบ) ───────────── */

/**
 * พื้นหลังสีเรียบ (เช่น ถ่ายสินค้าบนผ้าขาว): สีพื้น = ค่ากลางของขอบภาพ
 * ไหลจากขอบภาพเข้าไปเรื่อย ๆ ผ่านพิกเซลที่สีใกล้พื้น (tol 0–100) · ที่ไหลไม่ถึง = วัตถุ
 */
export function maskFromBackgroundColor(rgba: Uint8ClampedArray, w: number, h: number, tol: number): Uint8Array {
  const border: number[][] = [[], [], []];
  const sample = (i: number) => {
    border[0].push(rgba[i * 4]);
    border[1].push(rgba[i * 4 + 1]);
    border[2].push(rgba[i * 4 + 2]);
  };
  for (let x = 0; x < w; x++) {
    sample(x);
    sample((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    sample(y * w);
    sample(y * w + w - 1);
  }
  const med = border.map((ch) => ch.sort((a, b) => a - b)[ch.length >> 1]);
  const lim = (tol / 100) * 255 * 1.2;
  const lim2 = lim * lim;
  const near = (i: number) => {
    if (rgba[i * 4 + 3] < 128) return true; // โปร่งอยู่แล้ว = พื้น
    const dr = rgba[i * 4] - med[0];
    const dg = rgba[i * 4 + 1] - med[1];
    const db = rgba[i * 4 + 2] - med[2];
    return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11 <= lim2 * 0.33;
  };
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!bg[i] && near(i)) {
      bg[i] = 1;
      stack.push(i);
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
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = bg[i] ? 0 : 255;
  return out;
}

/** มาสก์จากช่องโปร่งใสของไฟล์ (PNG ที่ไล่พื้นแล้วแต่ขอบยังหยาบ) */
export function maskFromAlphaChannel(rgba: Uint8ClampedArray): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = rgba[i * 4 + 3];
  return out;
}

/** ไฟล์มีพื้นโปร่งจริงไหม (มีพิกเซลโปร่งเกิน 1%) */
export function hasTransparency(rgba: Uint8ClampedArray): boolean {
  const n = rgba.length / 4;
  let c = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 200) c++;
  return c > n * 0.01;
}
