/**
 * สร้าง "เส้นไดคัท" จากลายที่ลูกค้าส่งมา (PNG พื้นใส) — คำนวณล้วน ๆ ไม่แตะ DOM
 *
 * ขั้นตอน: alpha → มาสก์ → ขยายออกตามค่าตัดเผื่อ (mm) → เก็บขอบให้เรียบ → ปิดรูใน (ถ้าเลือก)
 *          → ไล่เส้นขอบเป็นรูปหลายเหลี่ยม → ลบมุมบันได → แปลงเป็นมิลลิเมตร
 *          → ฟิตเป็นเส้นโค้งเบซิเยร์ (แบบโปรแกรมตัดสติกเกอร์ทำ) = จุดแองเคอร์น้อย แก้ต่อง่าย
 *
 * หน่วยภายในทั้งหมดเป็น "พิกเซลของภาพ" (x ขวา · y ลง) แล้วค่อยคูณ mmPerPx ตอนท้าย
 */

import { fitClosedCurve, type CubicSeg } from "./bezier-fit";

export interface DiecutSettings {
  /** ตัดเผื่อรอบลาย (มม.) — ค่าที่ร้านใช้ประจำคือ 2 */
  offsetMm: number;
  /** ความกว้างงานจริง (มม.) — ใช้กำหนดสเกลจากพิกเซล → มิลลิเมตร */
  widthMm: number;
  /** ปิดรูที่อยู่กลางลาย (เช่น ช่องว่างในตัวอักษร) = ไม่ตัดทะลุ */
  fillHoles: boolean;
  /** ค่า alpha ที่ถือว่า "มีลาย" (0-255) */
  alphaThreshold: number;
  /**
   * เก็บขอบให้เรียบ (มม.) — ลบรอยหยัก/ร่องเล็ก ๆ ที่เล็กกว่าค่านี้ทิ้ง
   * เส้นจะลื่นแบบงานสติกเกอร์จริง · 0 = ตามขอบลายเป๊ะ (หยักตามลาย)
   */
  smoothMm: number;
  /**
   * ความคลาดเคลื่อนตอนแปลงเป็นเส้นโค้งเบซิเยร์ (มม.) — เหมือนค่า "ความละเอียด" ของโปรแกรมตัด
   * น้อย = เกาะลายแน่น จุดแองเคอร์เยอะ · มาก = เส้นลื่น จุดน้อย แก้ต่อง่าย (แนะนำ 0.1–0.25)
   */
  curveTolMm: number;
}

/** หูร้อยห่วงแบบ "แท็บกลม" ยื่นออกจากตัวงาน (แบบพวงกุญแจอะคริลิคทั่วไป) */
export interface RingTab {
  /** เส้นผ่านศูนย์กลางแท็บกลม (มม.) — 0 = ไม่ทำแท็บ เจาะรูบนตัวงานเลย */
  tabDiameterMm: number;
  /** เส้นผ่านศูนย์กลางรูที่เจาะ (มม.) */
  holeDiameterMm: number;
  /** แท็บซ้อนทับตัวงานกี่ มม. (ให้เชื่อมเป็นชิ้นเดียว ไม่หลุด) */
  overlapMm: number;
  position: "left" | "right" | "top-center" | "top-left" | "top-right";
}

export interface DiecutResult {
  /** เส้นไดคัทเป็นมิลลิเมตร (x ขวา · y ลง · อ้างอิงมุมซ้ายบนของลาย · ติดลบได้ถ้าเส้นล้นออกนอกลาย) */
  paths: { x: number; y: number }[][];
  /** เส้นเดียวกันในรูปโค้งเบซิเยร์ (เรียงตรงกับ paths) — อันนี้คือของที่ส่งออกไฟล์จริง */
  curves: { start: { x: number; y: number }; segs: CubicSeg[] }[];
  /** จำนวนจุดแองเคอร์รวมของเส้นโค้ง (ยิ่งน้อยยิ่งแก้ง่ายใน Illustrator) */
  anchors: number;
  /** รูร้อยห่วง (มม.) — ไม่ได้เปิดใช้ = undefined */
  hole?: { cx: number; cy: number; r: number };
  widthMm: number;
  heightMm: number;
  mmPerPx: number;
  /** จำนวนชิ้นงานที่ตัดแยกกัน (ไม่นับรูตรงกลาง) */
  pieces: number;
  /** จำนวนรูที่ตัดทะลุกลางงาน */
  innerHoles: number;
  /** กรอบรวมของเส้นตัดทั้งหมด (มม.) — ใช้กำหนดขนาดไฟล์ส่งออก */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** เตือนก่อนส่งเข้าเครื่องตัด */
  warnings: string[];
}

/** ลายมีพื้นใสจริงไหม (ไม่ใส = ทั้งภาพทึบ → ไดคัทได้แค่กรอบสี่เหลี่ยม) */
export function hasAlpha(data: Uint8ClampedArray, threshold = 250): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] < threshold) return true;
  return false;
}

/** มาสก์ 1 = มีลาย (alpha ถึงเกณฑ์) */
export function maskFromAlpha(data: Uint8ClampedArray, alphaThreshold: number): Uint8Array {
  const n = data.length / 4;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] >= alphaThreshold ? 1 : 0;
  return mask;
}

/** ระยะกำลังสองถึงจุดที่มีลายที่ใกล้ที่สุด (Felzenszwalb & Huttenlocher — เร็วพอสำหรับภาพหลักพันพิกเซล) */
function distanceSq(mask: Uint8Array, w: number, h: number): Float64Array {
  const INF = 1e20;
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  const out = new Float64Array(w * h);

  const pass = (n: number, get: (i: number) => number, set: (i: number, val: number) => void) => {
    for (let i = 0; i < n; i++) f[i] = get(i);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
    for (let i = 0; i < n; i++) set(i, d[i]);
  };

  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? 0 : INF;
  for (let x = 0; x < w; x++) pass(h, (y) => out[y * w + x], (y, val) => { out[y * w + x] = val; });
  for (let y = 0; y < h; y++) pass(w, (x) => out[y * w + x], (x, val) => { out[y * w + x] = val; });
  return out;
}

/** ขยายมาสก์ออกรอบทิศทาง r พิกเซล (ขอบโค้งมนเหมือนดอกกัดจริง) */
export function dilate(mask: Uint8Array, w: number, h: number, rPx: number): Uint8Array {
  if (rPx <= 0) return mask.slice();
  const d2 = distanceSq(mask, w, h);
  const rr = rPx * rPx;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d2[i] <= rr ? 1 : 0;
  return out;
}

/** หดมาสก์เข้า r พิกเซล (= ขยายพื้นหลังแล้วกลับด้าน) */
export function erode(mask: Uint8Array, w: number, h: number, rPx: number): Uint8Array {
  if (rPx <= 0) return mask.slice();
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const grown = dilate(inv, w, h, rPx);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = grown[i] ? 0 : 1;
  return out;
}

/**
 * เก็บขอบให้เรียบ — ปิดร่อง/รอยหยักที่แคบกว่า r ก่อน (closing) แล้วปาดติ่งเล็ก ๆ ทิ้ง (opening)
 * ผลคือเส้นลื่นแบบไดคัทงานจริง ไม่วิ่งตามหยักของลายทุกจุด
 */
export function smoothMask(mask: Uint8Array, w: number, h: number, rPx: number): Uint8Array {
  if (rPx <= 0) return mask;
  const closed = erode(dilate(mask, w, h, rPx), w, h, rPx);
  return dilate(erode(closed, w, h, rPx), w, h, rPx);
}

/** ปิดรูที่ไม่ติดขอบภาพ (พื้นหลังที่ถูกลายล้อมไว้) = ไม่ตัดทะลุกลางงาน */
export function fillEnclosedHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = mask.slice();
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!seen[i] && !mask[i]) {
      seen[i] = 1;
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
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < out.length; i++) if (!mask[i] && !seen[i]) out[i] = 1;
  return out;
}

type Pt = { x: number; y: number };

/**
 * ไล่เส้นขอบของมาสก์ → รูปปิดหลายวง (หน่วยพิกเซล)
 * เก็บ "ขอบของพิกเซล" ทีละด้าน แล้วต่อกันเป็นวง — ได้ขอบแบบขั้นบันได ค่อยไปลบมุมทีหลัง
 */
export function traceContours(mask: Uint8Array, w: number, h: number): Pt[][] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  const key = (x: number, y: number) => y * (w + 1) + x;
  /** จุดเริ่ม → ปลายทางที่ยังไม่ได้เดิน */
  const edges = new Map<number, Pt[]>();
  const add = (a: Pt, b: Pt) => {
    const k = key(a.x, a.y);
    const list = edges.get(k);
    if (list) list.push(b);
    else edges.set(k, [b]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      // เดินตามเข็มนาฬิกาในระบบพิกัด y ลง (ลายอยู่ด้านขวาของทิศเดิน)
      if (!at(x, y - 1)) add({ x, y }, { x: x + 1, y });
      if (!at(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!at(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!at(x - 1, y)) add({ x, y: y + 1 }, { x, y });
    }
  }
  const loops: Pt[][] = [];
  for (const [startKey, list] of edges) {
    while (list.length) {
      const start: Pt = { x: startKey % (w + 1), y: Math.floor(startKey / (w + 1)) };
      const loop: Pt[] = [start];
      let cur = list.pop()!;
      let guard = 0;
      while ((cur.x !== start.x || cur.y !== start.y) && guard++ < 4 * w * h) {
        loop.push(cur);
        const nexts = edges.get(key(cur.x, cur.y));
        if (!nexts || !nexts.length) break; // ขอบขาด (ไม่ควรเกิด) — ทิ้งวงนี้
        cur = nexts.pop()!;
      }
      if (loop.length > 7) loops.push(loop);
    }
  }
  return loops;
}

/** ลบมุมขั้นบันไดให้เส้นลื่นขึ้น (Chaikin) */
export function smoothLoop(pts: Pt[], rounds = 2): Pt[] {
  let cur = pts;
  for (let r = 0; r < rounds; r++) {
    const next: Pt[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % cur.length];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    cur = next;
  }
  return cur;
}

/** ลดจำนวนจุดโดยรูปทรงยังเหมือนเดิม (Ramer–Douglas–Peucker) */
export function simplifyLoop(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const a = pts[i0];
    const b = pts[i1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let best = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([i0, far], [far, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** พื้นที่แบบมีเครื่องหมาย — เครื่องหมายบอกว่าเป็นเส้นรอบนอกหรือรูใน (ทิศเดินตรงข้ามกัน) */
function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** พื้นที่ของรูปปิด (ตร.พิกเซล · ค่าสัมบูรณ์) — ใช้ทิ้งเศษจุดเล็ก ๆ */
function areaOf(pts: Pt[]): number {
  return Math.abs(signedArea(pts));
}

/**
 * คำนวณเส้นไดคัททั้งชุดจาก ImageData ของลาย
 *
 * ทำงานบนผืนที่ "เผื่อขอบ" ไว้รอบภาพ เพราะเส้นตัดต้องล้นออกนอกลายเสมอ
 * (ลายที่ชิดขอบไฟล์จะได้เส้นครบ ไม่โดนตัดหัวท้าย) พิกัดที่คืนออกไปจึงติดลบได้
 *
 * @param img ภาพลาย (ควรเป็น PNG พื้นใส) · ขนาดที่ส่งเข้ามาคือขนาดที่ใช้คำนวณ
 */
export function buildDiecut(
  img: { data: Uint8ClampedArray; width: number; height: number },
  s: DiecutSettings,
  ring?: RingTab
): DiecutResult {
  const { width: w0, height: h0 } = img;
  const mmPerPx = s.widthMm / w0;
  const warnings: string[] = [];
  const px = (mm: number) => mm / mmPerPx;

  if (!hasAlpha(img.data)) {
    warnings.push("ลายนี้ไม่มีพื้นใส (ทั้งภาพทึบ) — เส้นไดคัทจะออกมาเป็นกรอบสี่เหลี่ยม ต้องไล่พื้นหลังออกก่อน");
  }
  const dpi = 25.4 / mmPerPx;
  if (dpi < 150) {
    warnings.push(`ความละเอียดลายเทียบกับขนาดจริงได้ ~${Math.round(dpi)} DPI (ต่ำกว่า 150) — พิมพ์ออกมาอาจไม่คม`);
  }

  const src = maskFromAlpha(img.data, s.alphaThreshold);
  let inkPx = 0;
  for (let i = 0; i < src.length; i++) inkPx += src[i];
  const emptyResult: DiecutResult = {
    paths: [],
    curves: [],
    anchors: 0,
    widthMm: s.widthMm,
    heightMm: h0 * mmPerPx,
    mmPerPx,
    pieces: 0,
    innerHoles: 0,
    bounds: { x0: 0, y0: 0, x1: s.widthMm, y1: h0 * mmPerPx },
    warnings: ["ไม่พบลายในไฟล์ (โปร่งใสทั้งภาพ)"],
  };
  if (inkPx === 0) return emptyResult;

  /** กรอบสี่เหลี่ยมที่ล้อมส่วนที่เป็นลายไว้ (หน่วยพิกเซล) */
  const bboxOfMask = (m: Uint8Array, w: number, h: number) => {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (m[y * w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return { x0, y0, x1, y1 };
  };
  // ลายกินพื้นที่เกือบเต็มกรอบ = น่าจะติดพื้นหลัง/เงาฟุ้งมาด้วย (เส้นตัดจะออกมาเป็นกล่อง)
  const bb = bboxOfMask(src, w0, h0);
  const fill = inkPx / Math.max(1, (bb.x1 - bb.x0 + 1) * (bb.y1 - bb.y0 + 1));
  if (fill > 0.9) {
    warnings.push(
      "ลายเต็มกรอบเกือบทั้งผืน — ถ้าไฟล์มีเงา/แสงฟุ้งจาง ๆ ระบบจะนับเป็นลายด้วย ทำให้เส้นตัดออกมาเป็นกล่อง · ลองเลื่อน “ความไวขอบลาย” ไปทางขวา"
    );
  }

  // เผื่อขอบผืนคำนวณให้พอกับ ตัดเผื่อ + เก็บขอบ + แท็บหูร้อย
  const tabPx = ring && ring.tabDiameterMm > 0 ? px(ring.tabDiameterMm) : 0;
  const pad = Math.ceil(px(s.offsetMm) + px(s.smoothMm) * 2 + tabPx + 4);
  const w = w0 + pad * 2;
  const h = h0 + pad * 2;
  let mask: Uint8Array = new Uint8Array(w * h);
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) if (src[y * w0 + x]) mask[(y + pad) * w + (x + pad)] = 1;

  mask = dilate(mask, w, h, px(s.offsetMm));
  mask = smoothMask(mask, w, h, px(s.smoothMm));

  // แท็บหูร้อยห่วง: วงกลมยื่นออกจากขอบงาน ซ้อนทับไว้นิดหน่อยให้เป็นชิ้นเดียวกัน
  let hole: DiecutResult["hole"];
  if (ring && ring.holeDiameterMm > 0) {
    const b = bboxOfMask(mask, w, h);
    const tabR = tabPx / 2;
    const overlap = px(ring.overlapMm);
    let cx: number;
    let cy: number;
    if (ring.position === "left") {
      cy = (b.y0 + b.y1) / 2;
      cx = b.x0 + overlap - tabR;
    } else if (ring.position === "right") {
      cy = (b.y0 + b.y1) / 2;
      cx = b.x1 - overlap + tabR;
    } else {
      cx =
        ring.position === "top-left"
          ? b.x0 + (b.x1 - b.x0) * 0.15
          : ring.position === "top-right"
            ? b.x1 - (b.x1 - b.x0) * 0.15
            : (b.x0 + b.x1) / 2;
      // ไล่หาขอบบนของงานตรงคอลัมน์นั้น แล้ววางแท็บให้ซ้อนลงมา
      let top = b.y0;
      const col = Math.round(cx);
      for (let y = 0; y < h; y++) if (mask[y * w + col]) { top = y; break; }
      cy = top - tabR + overlap;
    }
    if (tabR > 0) {
      const r2 = tabR * tabR;
      const yA = Math.max(0, Math.floor(cy - tabR));
      const yB = Math.min(h - 1, Math.ceil(cy + tabR));
      const xA = Math.max(0, Math.floor(cx - tabR));
      const xB = Math.min(w - 1, Math.ceil(cx + tabR));
      for (let y = yA; y <= yB; y++)
        for (let x = xA; x <= xB; x++)
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) mask[y * w + x] = 1;
    }
    hole = { cx: (cx - pad) * mmPerPx, cy: (cy - pad) * mmPerPx, r: ring.holeDiameterMm / 2 };
    if (tabPx > 0 && ring.tabDiameterMm < ring.holeDiameterMm + 4) {
      warnings.push("แท็บหูร้อยเล็กกว่ารูมาก — ควรให้แท็บใหญ่กว่ารูอย่างน้อย 4 มม. ไม่งั้นขอบบางจนฉีกง่าย");
    }
  }

  if (s.fillHoles) mask = fillEnclosedHoles(mask, w, h);

  // ทิ้งเศษเล็กกว่า 1 ตร.มม. (จุดฝุ่น/ขอบลายที่หลุดมา) แล้วเกลาเส้น
  const minArea = 1 / (mmPerPx * mmPerPx);
  const paths = traceContours(mask, w, h)
    .filter((loop) => areaOf(loop) >= minArea)
    .map((loop) => simplifyLoop(smoothLoop(loop, 3), 0.4))
    .map((loop) => loop.map((q) => ({ x: (q.x - pad) * mmPerPx, y: (q.y - pad) * mmPerPx })));

  if (!paths.length) return { ...emptyResult, warnings };

  // แยก "เส้นรอบชิ้นงาน" ออกจาก "รูตรงกลาง" ด้วยทิศการเดินของเส้น (ตรงข้ามกันเสมอ)
  const outerSign = Math.sign(signedArea(paths.reduce((a, b) => (areaOf(a) >= areaOf(b) ? a : b))));
  const pieces = paths.filter((q) => Math.sign(signedArea(q)) === outerSign).length;
  const innerHoles = paths.length - pieces;
  if (pieces > 1) {
    warnings.push(`ลายนี้แยกเป็น ${pieces} ชิ้นที่ไม่ติดกัน — ถ้าต้องการชิ้นเดียวให้เพิ่มค่าตัดเผื่อ/ค่าเก็บขอบ หรือแก้ลายให้เชื่อมกัน`);
  }
  if (innerHoles > 0) {
    warnings.push(`มีรูตัดทะลุกลางงาน ${innerHoles} รู — ไม่ต้องการให้ตัดทะลุ ให้ติ๊ก “ปิดรูกลางลาย”`);
  }

  // ฟิตเป็นเส้นโค้ง — นี่คือของที่เขียนลงไฟล์จริง (paths เก็บไว้วัด/วาดตัวอย่าง)
  const curves = paths.map((loop) => ({ start: loop[0], segs: fitClosedCurve(loop, Math.max(0.01, s.curveTolMm)) }));
  const anchors = curves.reduce((n, c) => n + c.segs.length, 0);

  const all = paths.flat();
  const bounds = {
    x0: Math.min(...all.map((q) => q.x), hole ? hole.cx - hole.r : Infinity),
    y0: Math.min(...all.map((q) => q.y), hole ? hole.cy - hole.r : Infinity),
    x1: Math.max(...all.map((q) => q.x), hole ? hole.cx + hole.r : -Infinity),
    y1: Math.max(...all.map((q) => q.y), hole ? hole.cy + hole.r : -Infinity),
  };

  return { paths, curves, anchors, hole, widthMm: s.widthMm, heightMm: h0 * mmPerPx, mmPerPx, pieces, innerHoles, bounds, warnings };
}

/**
 * กรอบไฟล์ส่งออก = เส้นตัดทั้งหมด + ตัวลาย + เว้นขอบ · คืนตำแหน่งที่ต้องวางลายในกรอบด้วย
 * (เส้นตัดล้นออกนอกลายได้ เช่น แท็บหูร้อย — ถ้าไม่ขยายกรอบจะโดนตัดหาย)
 */
export function exportFrame(r: DiecutResult, marginMm = 5) {
  const x0 = Math.min(0, r.bounds.x0) - marginMm;
  const y0 = Math.min(0, r.bounds.y0) - marginMm;
  const x1 = Math.max(r.widthMm, r.bounds.x1) + marginMm;
  const y1 = Math.max(r.heightMm, r.bounds.y1) + marginMm;
  return {
    pageWidthMm: x1 - x0,
    pageHeightMm: y1 - y0,
    /** ตำแหน่งมุมซ้ายบนของลายภายในกรอบ */
    artXMm: -x0,
    artYMm: -y0,
  };
}

/** เส้นไดคัทเป็น path ของ SVG (หน่วยมิลลิเมตร · โค้งเบซิเยร์เหมือนที่เขียนลงไฟล์ .ai) */
export function toSvgPath(curves: DiecutResult["curves"], hole?: DiecutResult["hole"]): string {
  const n = (v: number) => v.toFixed(3);
  const d = curves
    .map(
      (c) =>
        `M ${n(c.start.x)} ${n(c.start.y)} ` +
        c.segs.map((s) => `C ${n(s.c1.x)} ${n(s.c1.y)} ${n(s.c2.x)} ${n(s.c2.y)} ${n(s.to.x)} ${n(s.to.y)}`).join(" ") +
        " Z"
    )
    .join(" ");
  if (!hole) return d;
  const { cx, cy, r } = hole;
  // วงกลมด้วยส่วนโค้ง 2 ท่อน (ทิศตรงข้ามกับเส้นนอก = เจาะทะลุ)
  return `${d} M ${(cx - r).toFixed(3)} ${cy.toFixed(3)} A ${r} ${r} 0 1 0 ${(cx + r).toFixed(3)} ${cy.toFixed(3)} A ${r} ${r} 0 1 0 ${(cx - r).toFixed(3)} ${cy.toFixed(3)} Z`;
}
