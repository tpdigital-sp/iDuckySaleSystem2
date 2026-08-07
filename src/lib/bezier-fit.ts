/**
 * แปลง "เส้นหลายเหลี่ยม" (จุดเรียงกันเป็นพัน ๆ จุด) → "เส้นโค้งเบซิเยร์" ที่มีจุดแองเคอร์น้อย ๆ
 * เหมือนที่โปรแกรมตัดสติกเกอร์ (เช่น FineCut) ทำตอนสร้างเส้นไดคัท
 *
 * ใช้อัลกอริทึมของ Philip J. Schneider (Graphics Gems, 1990):
 * ลองฟิตโค้งท่อนเดียวก่อน → ถ้าเบี้ยวเกินค่าที่ยอมได้ ก็ตัดครึ่งตรงจุดที่เบี้ยวสุดแล้วฟิตใหม่
 *
 * ผลที่ได้: เปิดใน Illustrator แล้วเส้นลื่นจริง แก้จุดต่อได้ง่าย ไม่ใช่เส้นตรงต่อกันเป็นพัน ๆ ท่อน
 */

export interface Pt {
  x: number;
  y: number;
}

/** โค้งลูกบาศก์ 1 ท่อน — เริ่มจากจุดปลายของท่อนก่อนหน้า */
export interface CubicSeg {
  c1: Pt;
  c2: Pt;
  to: Pt;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const norm = (a: Pt): Pt => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

/** ค่าของโค้งลูกบาศก์ที่พารามิเตอร์ t */
function bezierAt(b: Pt[], t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * b[0].x + 3 * mt * mt * t * b[1].x + 3 * mt * t * t * b[2].x + t * t * t * b[3].x,
    y: mt * mt * mt * b[0].y + 3 * mt * mt * t * b[1].y + 3 * mt * t * t * b[2].y + t * t * t * b[3].y,
  };
}

/** แบ่งช่วง t ให้แต่ละจุดตามความยาวเส้นสะสม (chord length) */
function parameterize(pts: Pt[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + len(sub(pts[i], pts[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

/** หาโค้ง 1 ท่อนที่ "ใกล้จุดทั้งชุดที่สุด" ด้วยกำลังสองน้อยสุด (ทิศหัว-ท้ายล็อกไว้ตาม tangent) */
function generateBezier(pts: Pt[], first: number, last: number, u: number[], t1: Pt, t2: Pt): Pt[] {
  const n = last - first + 1;
  const A: [Pt, Pt][] = [];
  for (let i = 0; i < n; i++) {
    const t = u[i];
    const mt = 1 - t;
    A.push([mul(t1, 3 * mt * mt * t), mul(t2, 3 * mt * t * t)]);
  }
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < n; i++) {
    c00 += dot(A[i][0], A[i][0]);
    c01 += dot(A[i][0], A[i][1]);
    c11 += dot(A[i][1], A[i][1]);
    const t = u[i];
    const mt = 1 - t;
    const base = add(
      add(mul(pts[first], mt * mt * mt), mul(pts[first], 3 * mt * mt * t)),
      add(mul(pts[last], 3 * mt * t * t), mul(pts[last], t * t * t))
    );
    const tmp = sub(pts[first + i], base);
    x0 += dot(A[i][0], tmp);
    x1 += dot(A[i][1], tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const detA = x0 * c11 - c01 * x1;
  const detB = c00 * x1 - x0 * c01;
  let a1 = det === 0 ? 0 : detA / det;
  let a2 = det === 0 ? 0 : detB / det;
  const segLen = len(sub(pts[last], pts[first]));
  // ค่าติดลบ/ใหญ่เกินจริง = สมการเพี้ยน → ถอยไปใช้กฎ 1/3 แบบมาตรฐาน
  const eps = 1e-6 * segLen;
  if (a1 < eps || a2 < eps) {
    a1 = a2 = segLen / 3;
  }
  return [pts[first], add(pts[first], mul(t1, a1)), add(pts[last], mul(t2, a2)), pts[last]];
}

/** จุดที่เบี้ยวจากโค้งมากที่สุด (คืนระยะกำลังสอง + ตำแหน่ง) */
function maxError(pts: Pt[], first: number, last: number, bez: Pt[], u: number[]) {
  let max = 0;
  let split = Math.floor((last - first + 1) / 2) + first;
  for (let i = first + 1; i < last; i++) {
    const p = bezierAt(bez, u[i - first]);
    const d = sub(p, pts[i]);
    const dist = d.x * d.x + d.y * d.y;
    if (dist >= max) {
      max = dist;
      split = i;
    }
  }
  return { max, split };
}

/** ขยับค่า t ของแต่ละจุดให้เข้ากับโค้งมากขึ้น (Newton-Raphson 1 รอบ) */
function reparameterize(pts: Pt[], first: number, last: number, u: number[], bez: Pt[]): number[] {
  return u.map((t, i) => {
    const p = pts[first + i];
    const b = bezierAt(bez, t);
    // อนุพันธ์อันดับ 1 และ 2 ของโค้ง
    const q1 = [mul(sub(bez[1], bez[0]), 3), mul(sub(bez[2], bez[1]), 3), mul(sub(bez[3], bez[2]), 3)];
    const q2 = [mul(sub(q1[1], q1[0]), 2), mul(sub(q1[2], q1[1]), 2)];
    const mt = 1 - t;
    const d1 = add(add(mul(q1[0], mt * mt), mul(q1[1], 2 * mt * t)), mul(q1[2], t * t));
    const d2 = add(mul(q2[0], mt), mul(q2[1], t));
    const diff = sub(b, p);
    const numerator = dot(diff, d1);
    const denominator = dot(d1, d1) + dot(diff, d2);
    return denominator === 0 ? t : t - numerator / denominator;
  });
}

/**
 * ฟิตเส้นโค้งให้ชุดจุด (เส้นเปิด) — tolerance = ระยะที่ยอมให้เพี้ยนได้ (หน่วยเดียวกับพิกัดจุด)
 */
export function fitCurve(pts: Pt[], tolerance: number, t1?: Pt, t2?: Pt): CubicSeg[] {
  const out: CubicSeg[] = [];
  const tanLeft = t1 ?? norm(sub(pts[1] ?? pts[0], pts[0]));
  const tanRight = t2 ?? norm(sub(pts[pts.length - 2] ?? pts[pts.length - 1], pts[pts.length - 1]));
  fitCubic(pts, 0, pts.length - 1, tanLeft, tanRight, tolerance, out, 0);
  return out;
}

function fitCubic(pts: Pt[], first: number, last: number, t1: Pt, t2: Pt, tol: number, out: CubicSeg[], depth: number) {
  const nPts = last - first + 1;
  if (nPts === 2) {
    const dist = len(sub(pts[last], pts[first])) / 3;
    out.push({ c1: add(pts[first], mul(t1, dist)), c2: add(pts[last], mul(t2, dist)), to: pts[last] });
    return;
  }
  let u = parameterize(pts, first, last);
  let bez = generateBezier(pts, first, last, u, t1, t2);
  let err = maxError(pts, first, last, bez, u);
  const tol2 = tol * tol;
  if (err.max < tol2) {
    out.push({ c1: bez[1], c2: bez[2], to: bez[3] });
    return;
  }
  // ยังไม่เข้าเกณฑ์แต่ใกล้แล้ว → ขยับพารามิเตอร์อีกไม่กี่รอบ
  if (err.max < tol2 * 16) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(pts, first, last, u, bez);
      bez = generateBezier(pts, first, last, u, t1, t2);
      err = maxError(pts, first, last, bez, u);
      if (err.max < tol2) {
        out.push({ c1: bez[1], c2: bez[2], to: bez[3] });
        return;
      }
    }
  }
  // ยังเบี้ยวอยู่ → ตัดตรงจุดที่เบี้ยวสุด แล้วฟิตทีละครึ่ง (กันซอยลึกเกินจนช้า)
  if (depth > 24) {
    out.push({ c1: bez[1], c2: bez[2], to: bez[3] });
    return;
  }
  const split = Math.min(Math.max(err.split, first + 1), last - 1);
  const center = norm(sub(pts[split - 1], pts[split + 1]));
  fitCubic(pts, first, split, t1, center, tol, out, depth + 1);
  fitCubic(pts, split, last, mul(center, -1), t2, tol, out, depth + 1);
}

/**
 * ฟิตเส้นโค้งให้ "รูปปิด" — ต่อหัวชนท้ายโดยไม่มีรอยหักตรงจุดเริ่ม
 * (ประมาณทิศที่จุดเริ่มจากจุดก่อนหน้าแบบวนกลับ)
 */
export function fitClosedCurve(loop: Pt[], tolerance: number): CubicSeg[] {
  if (loop.length < 4) return [];
  const pts = [...loop, loop[0]]; // ปิดวง
  const prev = loop[loop.length - 1];
  const next = loop[1];
  const tangent = norm(sub(next, prev)); // ทิศเฉลี่ยที่จุดเริ่ม
  return fitCurve(pts, tolerance, tangent, mul(tangent, -1));
}
