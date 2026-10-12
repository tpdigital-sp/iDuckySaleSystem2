/**
 * เส้น pen tool แบบแก้ได้ (เหมือน Illustrator): จุดแองเคอร์ + ด้ามโค้งเข้า/ออก
 *
 * แปลงไปมากับ CutoutCurve (start + segs) · คำนวณล้วน ๆ ไม่แตะ DOM · หน่วย = พิกเซลของภาพทำงาน
 * node k: ท่อน k-1 จบที่ p ด้วยด้าม hin · ท่อน k เริ่มที่ p ด้วยด้าม hout
 */

import type { CubicSeg, Pt } from "./bezier-fit";
import type { CutoutCurve } from "./cutout";

export interface PathNode {
  p: Pt;
  hin: Pt;
  hout: Pt;
}

/** เส้นหนึ่งเส้น · open = กำลังวาดอยู่ (ยังไม่ปิด ไม่ใช้ตัดภาพ) */
export interface EditPath {
  nodes: PathNode[];
  open?: boolean;
}

const cp = (p: Pt): Pt => ({ x: p.x, y: p.y });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function clonePaths(ps: EditPath[]): EditPath[] {
  return ps.map((q) => ({ open: q.open, nodes: q.nodes.map((n) => ({ p: cp(n.p), hin: cp(n.hin), hout: cp(n.hout) })) }));
}

export function curvesToPaths(curves: CutoutCurve[]): EditPath[] {
  return curves
    .filter((c) => c.segs.length >= 2)
    .map((c) => {
      const n = c.segs.length;
      const nodes: PathNode[] = [];
      for (let k = 0; k < n; k++) {
        const p = k === 0 ? c.start : c.segs[k - 1].to;
        nodes.push({ p: cp(p), hin: cp(c.segs[(k - 1 + n) % n].c2), hout: cp(c.segs[k].c1) });
      }
      return { nodes };
    });
}

/** เส้นที่ปิดแล้ว → CutoutCurve (เส้นที่ยังวาดไม่เสร็จไม่นับ) */
export function pathsToCurves(paths: EditPath[]): CutoutCurve[] {
  return paths
    .filter((q) => !q.open && q.nodes.length >= 2)
    .map((q) => {
      const n = q.nodes.length;
      const segs: CubicSeg[] = [];
      for (let k = 0; k < n; k++) {
        const a = q.nodes[k];
        const b = q.nodes[(k + 1) % n];
        segs.push({ c1: cp(a.hout), c2: cp(b.hin), to: cp(b.p) });
      }
      return { start: cp(q.nodes[0].p), segs, hole: false };
    });
}

/** จุดบนท่อนโค้ง ณ t */
export function bezAt(a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

/** ท่อน si ของเส้น (จาก node si ไป si+1) */
function segOf(q: EditPath, si: number) {
  const n = q.nodes.length;
  const a = q.nodes[si];
  const b = q.nodes[(si + 1) % n];
  return [a.p, a.hout, b.hin, b.p] as const;
}

/** จำนวนท่อน (เส้นเปิด = n-1) */
const segCount = (q: EditPath) => (q.open ? q.nodes.length - 1 : q.nodes.length);

export type Hit =
  | { kind: "node"; pi: number; ni: number }
  | { kind: "hin" | "hout"; pi: number; ni: number }
  | { kind: "seg"; pi: number; si: number; t: number };

/**
 * หาสิ่งที่อยู่ใต้นิ้ว/เมาส์ (ระยะ r) — ด้ามของจุดที่เลือกอยู่ก่อน แล้วจุด แล้วเส้น
 */
export function hitTest(paths: EditPath[], pt: Pt, r: number, sel: { pi: number; ni: number } | null): Hit | null {
  if (sel) {
    const nd = paths[sel.pi]?.nodes[sel.ni];
    if (nd) {
      if (dist(nd.hout, nd.p) > 0.01 && dist(pt, nd.hout) <= r) return { kind: "hout", ...sel };
      if (dist(nd.hin, nd.p) > 0.01 && dist(pt, nd.hin) <= r) return { kind: "hin", ...sel };
    }
  }
  let best: Hit | null = null;
  let bd = r;
  paths.forEach((q, pi) =>
    q.nodes.forEach((nd, ni) => {
      const d = dist(pt, nd.p);
      if (d <= bd) {
        bd = d;
        best = { kind: "node", pi, ni };
      }
    })
  );
  if (best) return best;
  bd = r;
  paths.forEach((q, pi) => {
    for (let si = 0; si < segCount(q); si++) {
      const [a, c1, c2, b] = segOf(q, si);
      // สุ่มตัวอย่างหยาบ แล้วเก็บละเอียดรอบจุดที่ใกล้สุด
      let bt = 0;
      let bdd = Infinity;
      for (let i = 0; i <= 40; i++) {
        const d = dist(pt, bezAt(a, c1, c2, b, i / 40));
        if (d < bdd) {
          bdd = d;
          bt = i / 40;
        }
      }
      for (let step = 1 / 80; step > 1e-4; step /= 2)
        for (const t of [bt - step, bt + step]) {
          if (t < 0 || t > 1) continue;
          const d = dist(pt, bezAt(a, c1, c2, b, t));
          if (d < bdd) {
            bdd = d;
            bt = t;
          }
        }
      if (bdd <= bd) {
        bd = bdd;
        best = { kind: "seg", pi, si, t: bt };
      }
    }
  });
  return best;
}

/** แทรกจุดบนท่อน si ที่ t (de Casteljau — รูปเส้นไม่เปลี่ยน) · คืน index ของจุดใหม่ */
export function insertNode(q: EditPath, si: number, t: number): number {
  const n = q.nodes.length;
  const A = q.nodes[si];
  const B = q.nodes[(si + 1) % n];
  const p01 = lerp(A.p, A.hout, t);
  const p12 = lerp(A.hout, B.hin, t);
  const p23 = lerp(B.hin, B.p, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const mid = lerp(p012, p123, t);
  A.hout = p01;
  B.hin = p23;
  q.nodes.splice(si + 1, 0, { p: mid, hin: p012, hout: p123 });
  return si + 1;
}

/** ลบจุด (ด้ามของจุดข้าง ๆ คงเดิม) · เหลือน้อยกว่า 3 จุด = ลบทั้งเส้น · คืน true ถ้าเส้นหายไป */
export function removeNode(paths: EditPath[], pi: number, ni: number): boolean {
  const q = paths[pi];
  q.nodes.splice(ni, 1);
  if (q.nodes.length < (q.open ? 1 : 3)) {
    paths.splice(pi, 1);
    return true;
  }
  return false;
}

/** จุดนี้เป็นมุมหักไหม (ด้ามไม่อยู่แนวเดียวกัน หรือไม่มีด้าม) */
export function isCorner(nd: PathNode): boolean {
  const a = { x: nd.p.x - nd.hin.x, y: nd.p.y - nd.hin.y };
  const b = { x: nd.hout.x - nd.p.x, y: nd.hout.y - nd.p.y };
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la < 0.01 || lb < 0.01) return true;
  return (a.x * b.x + a.y * b.y) / (la * lb) < 0.985; // ~10°
}

/**
 * สลับ มุมแหลม ↔ โค้งลื่น (แบบเครื่องมือ Convert Anchor)
 * มุม → โค้ง: ด้ามวางตามแนวจุดก่อน→จุดถัดไป ยาว 1/3 ของระยะไปจุดข้าง ๆ
 * โค้ง → มุม: หดด้ามเข้าจุด (เส้นสองข้างเป็นเส้นตรงหักมุม)
 */
export function toggleCorner(q: EditPath, ni: number) {
  const n = q.nodes.length;
  const nd = q.nodes[ni];
  if (!isCorner(nd)) {
    nd.hin = cp(nd.p);
    nd.hout = cp(nd.p);
    return;
  }
  const prev = q.nodes[(ni - 1 + n) % n].p;
  const next = q.nodes[(ni + 1) % n].p;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const li = dist(prev, nd.p) / 3;
  const lo = dist(next, nd.p) / 3;
  nd.hin = { x: nd.p.x - ux * li, y: nd.p.y - uy * li };
  nd.hout = { x: nd.p.x + ux * lo, y: nd.p.y + uy * lo };
}

/** เลื่อนจุด (ด้ามตามไปด้วย) */
export function moveNode(nd: PathNode, to: Pt) {
  const dx = to.x - nd.p.x;
  const dy = to.y - nd.p.y;
  nd.p = cp(to);
  nd.hin = { x: nd.hin.x + dx, y: nd.hin.y + dy };
  nd.hout = { x: nd.hout.x + dx, y: nd.hout.y + dy };
}

/**
 * ลากด้าม — จุดโค้งลื่น: ด้ามอีกข้างหมุนตามให้อยู่แนวเดียวกัน (ความยาวเดิม)
 * free = ลากแยกอิสระ (กด Alt/Option ค้าง หรือจุดเป็นมุมหักอยู่แล้ว)
 */
export function moveHandle(nd: PathNode, which: "hin" | "hout", to: Pt, free: boolean) {
  const smooth = !free && !isCorner(nd);
  nd[which] = cp(to);
  if (!smooth) return;
  const other = which === "hin" ? "hout" : "hin";
  const len = dist(nd[other], nd.p);
  const dx = nd.p.x - to.x;
  const dy = nd.p.y - to.y;
  const l = Math.hypot(dx, dy);
  if (l < 0.01) return;
  nd[other] = { x: nd.p.x + (dx / l) * len, y: nd.p.y + (dy / l) * len };
}

/** จำนวนจุดแองเคอร์ทั้งหมด */
export const anchorCount = (paths: EditPath[]) => paths.reduce((a, q) => a + (q.open ? 0 : q.nodes.length), 0);

/** กรอบรวมของเส้นที่ปิดแล้ว (สุ่มจุดบนโค้ง) */
export function pathsBounds(paths: EditPath[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of paths) {
    if (q.open) continue;
    for (let si = 0; si < q.nodes.length; si++) {
      const [a, c1, c2, b] = segOf(q, si);
      for (let i = 0; i <= 16; i++) {
        const p = bezAt(a, c1, c2, b, i / 16);
        if (p.x < x0) x0 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x;
        if (p.y > y1) y1 = p.y;
      }
    }
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 };
}
