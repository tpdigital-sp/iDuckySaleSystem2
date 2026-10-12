/**
 * สร้าง "เส้นไดคัท" จากลายที่ลูกค้าส่งมา (PNG พื้นใส) — คำนวณล้วน ๆ ไม่แตะ DOM
 *
 * ขั้นตอน: alpha → มาสก์ → สนามระยะ (distance field) → ตัดที่ระดับ = ค่าตัดเผื่อ (เก็บขอบบนสนามเดียวกัน)
 *          → marching squares ระดับทศนิยม → ฟิตเบซิเยร์ (แบบโปรแกรมตัดสติกเกอร์ทำ) = จุดแองเคอร์น้อย แก้ต่อง่าย
 *          หรือรูปทรงสำเร็จ (สี่เหลี่ยมมุมมน/วงกลม-วงรี) รอบลาย สำหรับการ์ด/ฉลาก/ที่คั่น/งานรูปทึบ
 *
 * หน่วยภายในทั้งหมดเป็น "พิกเซลของภาพ" (x ขวา · y ลง) แล้วค่อยคูณ mmPerPx ตอนท้าย
 */

import { type CubicSeg } from "./bezier-fit";
import { fitLoop, isoContours } from "./cutout";

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
  /**
   * รูปทรงเส้นตัด — contour = ตามรูปลาย (พวงกุญแจ/สติกเกอร์ไดคัท) · rect = สี่เหลี่ยม (การ์ด/ฉลาก/ที่คั่น)
   * · ellipse = วงกลม/วงรี · rect/ellipse ล้อมกรอบลาย (รูปทึบ = ทั้งภาพ) แล้วขยาย/หดตาม offsetMm (ติดลบได้)
   */
  shape?: "contour" | "rect" | "ellipse";
  /** รัศมีมุมมนของ rect (มม.) */
  cornerMm?: number;
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

/**
 * สนามระยะแบบมีเครื่องหมาย (พิกเซล): บวก = อยู่นอกมาสก์ห่างขอบเท่านี้ · ลบ = อยู่ในมาสก์ลึกเท่านี้
 * ศูนย์อยู่ตรงขอบพิกเซลพอดี — เส้นระดับใดก็ได้ของสนามนี้คือ "เส้นขยาย/หดขอบ" ที่โค้งกลมจริง ไม่ใช่ขั้นบันได
 */
function signedField(mask: Uint8Array, w: number, h: number): Float32Array {
  const dOut = distanceSq(mask, w, h);
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const dIn = distanceSq(inv, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? 0.5 - Math.sqrt(dIn[i]) : Math.sqrt(dOut[i]) - 0.5;
  return out;
}

/** เบลอกล่อง 2 รอบ (≈ เกาส์เซียน) บนสนามทศนิยม — ลบรอยหยักระดับพิกเซลที่ยังเหลือ */
function blurField(src: Float32Array, w: number, h: number, rad: number): Float32Array {
  if (rad < 1) return src;
  const a = Float32Array.from(src);
  const b = new Float32Array(w * h);
  const win = rad * 2 + 1;
  const pass = (from: Float32Array, to: Float32Array, horiz: boolean) => {
    const n = horiz ? w : h;
    const lines = horiz ? h : w;
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
  return a;
}

/** min แบบลบมุม (polynomial smooth-min) — ใช้ต่อแท็บหูร้อยเข้ากับตัวงานให้รอยต่อโค้งรับกัน ไม่เป็นซอกหัก */
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const hh = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - hh * hh * k * 0.25;
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

/** พื้นที่แบบมีเครื่องหมาย — เครื่องหมายบอกทิศการเดินของเส้น */
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

/** กรอบสี่เหลี่ยมที่ล้อมส่วนที่เป็นลายไว้ (หน่วยพิกเซล · x1/y1 = ขอบขวา/ล่างของพิกเซลสุดท้าย) */
function bboxOfMask(m: Uint8Array, w: number, h: number) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * คำนวณเส้นไดคัททั้งชุดจาก ImageData ของลาย
 *
 * วิธีแบบโปรแกรมตัด (FineCut ฯลฯ): ไม่ไล่ขอบพิกเซลเป็นขั้นบันไดแล้วค่อยลบมุม แต่สร้าง "สนามระยะ" จากลาย
 * แล้วตัดที่ระดับ = ค่าตัดเผื่อ ด้วย marching squares ระดับทศนิยม → เส้นโค้งกลมเนียนตั้งแต่ต้น
 * เก็บขอบ (ปิดร่อง + ปาดติ่ง) ทำบนสนามระยะเหมือนกัน · ฟิตเบซิเยร์ทีละช่วงระหว่างซอกหัก (ซอกคมไม่โดนลบมน)
 *
 * ทำงานบนผืนที่ "เผื่อขอบ" ไว้รอบภาพ เพราะเส้นตัดต้องล้นออกนอกลายเสมอ
 * (ลายที่ชิดขอบไฟล์จะได้เส้นครบ ไม่โดนตัดหัวท้าย) พิกัดที่คืนออกไปจึงติดลบได้
 *
 * @param img ภาพลาย · ขนาดที่ส่งเข้ามาคือขนาดที่ใช้คำนวณ
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
  const shape = s.shape ?? "contour";

  const opaque = !hasAlpha(img.data);
  if (opaque && shape === "contour") {
    warnings.push("ลายนี้ไม่มีพื้นใส (ทั้งภาพทึบ) — เส้นตามรูปลายจะออกมาเป็นกรอบสี่เหลี่ยม · เลือกรูปทรง “สี่เหลี่ยม/วงกลม” หรือไล่พื้นหลังในแท็บตัดภาพก่อน");
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

  // ลายกินพื้นที่เกือบเต็มกรอบ = น่าจะติดพื้นหลัง/เงาฟุ้งมาด้วย (เส้นตัดจะออกมาเป็นกล่อง)
  const bb = bboxOfMask(src, w0, h0);
  const fill = inkPx / Math.max(1, (bb.x1 - bb.x0) * (bb.y1 - bb.y0));
  if (shape === "contour" && !opaque && fill > 0.9) {
    warnings.push(
      "ลายเต็มกรอบเกือบทั้งผืน — ถ้าไฟล์มีเงา/แสงฟุ้งจาง ๆ ระบบจะนับเป็นลายด้วย ทำให้เส้นตัดออกมาเป็นกล่อง · ลองเลื่อน “ความไวขอบลาย” ไปทางขวา"
    );
  }

  // เผื่อขอบผืนคำนวณให้พอกับ ตัดเผื่อ + เก็บขอบ + แท็บหูร้อย
  const tabPx = ring && ring.tabDiameterMm > 0 ? px(ring.tabDiameterMm) : 0;
  const offPx = px(s.offsetMm);
  const smoothPx = shape === "contour" ? px(Math.max(0, s.smoothMm)) : 0;
  const pad = Math.ceil(Math.max(0, offPx) + smoothPx * 2 + tabPx + 6);
  const w = w0 + pad * 2;
  const h = h0 + pad * 2;
  let ink: Uint8Array = new Uint8Array(w * h);
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) if (src[y * w0 + x]) ink[(y + pad) * w + (x + pad)] = 1;

  /** สนามสุดท้าย: ≤ 0 = เนื้องาน (ในเส้นตัด) */
  let field: Float32Array;
  let blurRad = 0;
  if (shape === "contour") {
    if (s.fillHoles) ink = fillEnclosedHoles(ink, w, h);
    const sd = signedField(ink, w, h);
    if (smoothPx >= 0.75) {
      // closing แล้ว opening ด้วยจานรัศมี r บนสนามระยะ: ขยาย (ตัดเผื่อ+r) → หด 2r → ขยาย r
      const grown = new Uint8Array(w * h);
      for (let i = 0; i < grown.length; i++) grown[i] = sd[i] <= offPx + smoothPx ? 1 : 0;
      const sdG = signedField(grown, w, h);
      const core = new Uint8Array(w * h);
      for (let i = 0; i < core.length; i++) core[i] = sdG[i] <= -2 * smoothPx ? 1 : 0;
      field = signedField(core, w, h);
      for (let i = 0; i < field.length; i++) field[i] -= smoothPx;
    } else {
      field = sd;
      for (let i = 0; i < field.length; i++) field[i] -= offPx;
    }
    // เกลาเศษหยักระดับพิกเซลที่เหลือ (~0.05 มม. · อย่างน้อย 1 พิกเซล)
    blurRad = Math.max(1, Math.min(3, Math.round(px(0.05))));
    field = blurField(field, w, h, blurRad);
  } else {
    // รูปทรงสำเร็จ: กรอบอ้างอิง = กรอบลาย (PNG พื้นใส) หรือทั้งภาพ (รูปทึบ) แล้วขยาย/หดตามค่าตัดเผื่อ
    const ref = opaque ? { x0: 0, y0: 0, x1: w0, y1: h0 } : bb;
    const cx = (ref.x0 + ref.x1) / 2 + pad;
    const cy = (ref.y0 + ref.y1) / 2 + pad;
    const hx = Math.max(1, (ref.x1 - ref.x0) / 2 + offPx);
    const hy = Math.max(1, (ref.y1 - ref.y0) / 2 + offPx);
    field = new Float32Array(w * h);
    if (shape === "rect") {
      const r = Math.min(px(Math.max(0, s.cornerMm ?? 0)), hx, hy);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const qx = Math.abs(x + 0.5 - cx) - (hx - r);
          const qy = Math.abs(y + 0.5 - cy) - (hy - r);
          field[y * w + x] = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
        }
    } else {
      const m = Math.min(hx, hy);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const ex = (x + 0.5 - cx) / hx;
          const ey = (y + 0.5 - cy) / hy;
          field[y * w + x] = (Math.hypot(ex, ey) - 1) * m;
        }
    }
  }

  // แท็บหูร้อยห่วง: วงกลมยื่นออกจากขอบงาน ซ้อนทับไว้นิดหน่อยให้เป็นชิ้นเดียวกัน · รอยต่อลบมุมโค้งรับ
  let hole: DiecutResult["hole"];
  if (ring && ring.holeDiameterMm > 0) {
    const body = new Uint8Array(w * h);
    for (let i = 0; i < body.length; i++) body[i] = field[i] <= 0 ? 1 : 0;
    const b = bboxOfMask(body, w, h);
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
      const col = Math.min(w - 1, Math.max(0, Math.round(cx)));
      for (let y = 0; y < h; y++) if (body[y * w + col]) { top = y; break; }
      cy = top - tabR + overlap;
    }
    if (tabR > 0) {
      const k = px(1.2); // รัศมีลบมุมตรงรอยต่อแท็บ
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const dc = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - tabR;
          if (dc < field[i] + k) field[i] = smin(field[i], dc, k);
        }
    }
    hole = { cx: (cx - pad) * mmPerPx, cy: (cy - pad) * mmPerPx, r: ring.holeDiameterMm / 2 };
    if (tabPx > 0 && ring.tabDiameterMm < ring.holeDiameterMm + 4) {
      warnings.push("แท็บหูร้อยเล็กกว่ารูมาก — ควรให้แท็บใหญ่กว่ารูอย่างน้อย 4 มม. ไม่งั้นขอบบางจนฉีกง่าย");
    }
  }

  if (s.fillHoles) {
    const body = new Uint8Array(w * h);
    for (let i = 0; i < body.length; i++) body[i] = field[i] <= 0 ? 1 : 0;
    const filled = fillEnclosedHoles(body, w, h);
    for (let i = 0; i < field.length; i++) if (filled[i] && !body[i]) field[i] = -1;
  }

  // ไล่เส้นที่ระดับ 0 (กลับเครื่องหมาย: isoContours ถือว่า "ค่า ≥ ระดับ" คือด้านใน)
  const neg = new Float32Array(field.length);
  for (let i = 0; i < neg.length; i++) neg[i] = -field[i];
  const minArea = 1 / (mmPerPx * mmPerPx); // ทิ้งเศษเล็กกว่า 1 ตร.มม.
  const loops = isoContours(neg, w, h, 0, -1e4).filter((l) => areaOf(l) >= minArea);
  if (!loops.length) return { ...emptyResult, warnings };

  // แยก "เส้นรอบชิ้นงาน" ออกจาก "รูตรงกลาง" — รูคือวงที่ถูกวงอื่นล้อมเป็นจำนวนคี่
  const isHole = loops.map((l, i) => {
    let depth = 0;
    for (let j = 0; j < loops.length; j++) if (j !== i && areaOf(loops[j]) > areaOf(l) && insidePoly(l[0], loops[j])) depth++;
    return depth % 2 === 1;
  });
  const pieces = isHole.filter((x) => !x).length;
  const innerHoles = loops.length - pieces;
  if (pieces > 1) {
    warnings.push(`ลายนี้แยกเป็น ${pieces} ชิ้นที่ไม่ติดกัน — ถ้าต้องการชิ้นเดียวให้เพิ่มค่าตัดเผื่อ/ค่าเก็บขอบ หรือแก้ลายให้เชื่อมกัน`);
  }
  if (innerHoles > 0) {
    warnings.push(`มีรูตัดทะลุกลางงาน ${innerHoles} รู — ไม่ต้องการให้ตัดทะลุ ให้ติ๊ก “ปิดรูกลางลาย”`);
  }

  // รูปทรงสำเร็จที่ไม่มีแท็บ = เขียนเรขาคณิตตรง ๆ (เส้นตรงเป๊ะ · โค้งวงกลมจริง) ไม่ต้องฟิต
  if (shape !== "contour" && !(ring && tabPx > 0) && pieces === 1 && innerHoles === 0) {
    const ref = opaque ? { x0: 0, y0: 0, x1: w0, y1: h0 } : bb;
    const box = {
      x0: ref.x0 * mmPerPx - s.offsetMm,
      y0: ref.y0 * mmPerPx - s.offsetMm,
      x1: ref.x1 * mmPerPx + s.offsetMm,
      y1: ref.y1 * mmPerPx + s.offsetMm,
    };
    if (box.x1 - box.x0 > 0.5 && box.y1 - box.y0 > 0.5) {
      const c = shapeCurve(shape, box, Math.max(0, s.cornerMm ?? 0));
      const pts = [c.start, ...c.segs.map((sg) => sg.to)];
      const bounds = {
        x0: Math.min(box.x0, hole ? hole.cx - hole.r : Infinity),
        y0: Math.min(box.y0, hole ? hole.cy - hole.r : Infinity),
        x1: Math.max(box.x1, hole ? hole.cx + hole.r : -Infinity),
        y1: Math.max(box.y1, hole ? hole.cy + hole.r : -Infinity),
      };
      return { paths: [pts], curves: [c], anchors: c.segs.length, hole, widthMm: s.widthMm, heightMm: h0 * mmPerPx, mmPerPx, pieces: 1, innerHoles: 0, bounds, warnings };
    }
  }

  // ฟิตเป็นเส้นโค้ง (หน่วยพิกเซล) — เก็บมุมคมเฉพาะ "ซอก" ของเนื้องาน (ส่วนนูนของเส้นตัดเผื่อโค้งกลมเสมอ)
  // ยกเว้นสี่เหลี่ยมมุมฉากที่มุมนูนคมจริง
  const sharpConvex = shape === "rect" && !((s.cornerMm ?? 0) > 0);
  // รูปทรงสำเร็จ + แท็บ: ฟิตแน่นขึ้น ด้านตรงจะได้ไม่เป็นลอน
  const tolPx = Math.max(0.3, px(Math.max(0.01, shape === "contour" ? s.curveTolMm : Math.min(s.curveTolMm, 0.05))));
  const toMm = (q: Pt): Pt => ({ x: (q.x - pad) * mmPerPx, y: (q.y - pad) * mmPerPx });
  const paths: Pt[][] = [];
  const curves: DiecutResult["curves"] = [];
  loops.forEach((l, i) => {
    const dir = Math.sign(signedArea(l));
    // turn ทางเดียวกับวง = นูนเมื่อมองจากด้านในวง · รู = เนื้องานอยู่ด้านนอกวง จึงกลับกัน
    const concave = (turn: number) => (isHole[i] ? turn * dir > 0 : turn * dir < 0);
    const fit = fitLoop(l, tolPx, 30, blurRad, sharpConvex ? undefined : concave);
    curves.push({
      start: toMm(fit.start),
      segs: fit.segs.map((sg) => ({ c1: toMm(sg.c1), c2: toMm(sg.c2), to: toMm(sg.to) })),
    });
    paths.push(l.map(toMm));
  });
  const anchors = curves.reduce((n, c) => n + c.segs.length, 0);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths) for (const q of p) {
    if (q.x < x0) x0 = q.x;
    if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.y > y1) y1 = q.y;
  }
  if (hole) {
    x0 = Math.min(x0, hole.cx - hole.r);
    y0 = Math.min(y0, hole.cy - hole.r);
    x1 = Math.max(x1, hole.cx + hole.r);
    y1 = Math.max(y1, hole.cy + hole.r);
  }

  return { paths, curves, anchors, hole, widthMm: s.widthMm, heightMm: h0 * mmPerPx, mmPerPx, pieces, innerHoles, bounds: { x0, y0, x1, y1 }, warnings };
}

/** เส้นสี่เหลี่ยม(มุมมน)/วงรี ที่แม่นตามเรขาคณิต — มุมมนใช้ค่า kappa ของวงกลม (แบบที่ Illustrator วาด) */
function shapeCurve(
  shape: "rect" | "ellipse",
  b: { x0: number; y0: number; x1: number; y1: number },
  cornerMm: number
): { start: Pt; segs: CubicSeg[] } {
  const K = 0.5522847498;
  const line = (p: Pt, q: Pt): CubicSeg => ({
    c1: { x: p.x + (q.x - p.x) / 3, y: p.y + (q.y - p.y) / 3 },
    c2: { x: p.x + ((q.x - p.x) * 2) / 3, y: p.y + ((q.y - p.y) * 2) / 3 },
    to: q,
  });
  if (shape === "ellipse") {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const rx = (b.x1 - b.x0) / 2, ry = (b.y1 - b.y0) / 2;
    return {
      start: { x: cx + rx, y: cy },
      segs: [
        { c1: { x: cx + rx, y: cy + ry * K }, c2: { x: cx + rx * K, y: cy + ry }, to: { x: cx, y: cy + ry } },
        { c1: { x: cx - rx * K, y: cy + ry }, c2: { x: cx - rx, y: cy + ry * K }, to: { x: cx - rx, y: cy } },
        { c1: { x: cx - rx, y: cy - ry * K }, c2: { x: cx - rx * K, y: cy - ry }, to: { x: cx, y: cy - ry } },
        { c1: { x: cx + rx * K, y: cy - ry }, c2: { x: cx + rx, y: cy - ry * K }, to: { x: cx + rx, y: cy } },
      ],
    };
  }
  const r = Math.min(cornerMm, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2);
  if (r < 0.01) {
    const p = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
    return { start: p[0], segs: [line(p[0], p[1]), line(p[1], p[2]), line(p[2], p[3]), line(p[3], p[0])] };
  }
  const k = r * K;
  const segs: CubicSeg[] = [];
  let cur: Pt = { x: b.x0 + r, y: b.y0 };
  const to = (q: Pt) => {
    if (Math.hypot(q.x - cur.x, q.y - cur.y) > 1e-6) segs.push(line(cur, q));
    cur = q;
  };
  const arc = (c1: Pt, c2: Pt, q: Pt) => {
    segs.push({ c1, c2, to: q });
    cur = q;
  };
  to({ x: b.x1 - r, y: b.y0 });
  arc({ x: b.x1 - r + k, y: b.y0 }, { x: b.x1, y: b.y0 + r - k }, { x: b.x1, y: b.y0 + r });
  to({ x: b.x1, y: b.y1 - r });
  arc({ x: b.x1, y: b.y1 - r + k }, { x: b.x1 - r + k, y: b.y1 }, { x: b.x1 - r, y: b.y1 });
  to({ x: b.x0 + r, y: b.y1 });
  arc({ x: b.x0 + r - k, y: b.y1 }, { x: b.x0, y: b.y1 - r + k }, { x: b.x0, y: b.y1 - r });
  to({ x: b.x0, y: b.y0 + r });
  arc({ x: b.x0, y: b.y0 + r - k }, { x: b.x0 + r - k, y: b.y0 }, { x: b.x0 + r, y: b.y0 });
  return { start: { x: b.x0 + r, y: b.y0 }, segs };
}

/**
 * เติม "ตัดตก" (bleed) ให้รูปลาย — ระบายสีขอบลายออกไปในส่วนโปร่งใสรอบ ๆ rPx พิกเซล
 * งานกระดาษ/สติกเกอร์ที่ตัดชิดลาย เครื่องตัดคลาด ±0.5–2 มม. ถ้าไม่มีตัดตกจะเห็นขอบขาวแลบ
 * (ขยายได้แค่ในกรอบไฟล์ — ลายที่ชิดขอบไฟล์ ด้านนั้นจะไม่ได้ตัดตก)
 * keep = พิกเซลที่ห้ามแตะ (ด้านในเส้นตัด — ช่องว่างระหว่างตัวอักษร/พื้นการ์ดต้องคงเดิม ระบายเฉพาะส่วนที่โดนตัดทิ้ง)
 */
export function bleedImage(img: ImageData, rPx: number, keep?: Uint8Array): ImageData {
  const { width: w, height: h, data } = img;
  if (rPx < 0.5) return img;
  const INF = 1e20;
  // ระยะในแนวตั้งถึงพิกเซลทึบที่ใกล้สุดในคอลัมน์เดียวกัน (+ แถวของมัน)
  const gy = new Float64Array(w * h);
  const srcRow = new Int32Array(w * h).fill(-1);
  const solid = (i: number) => data[i * 4 + 3] >= 250;
  for (let x = 0; x < w; x++) {
    let last = -1;
    for (let y = 0; y < h; y++) {
      if (solid(y * w + x)) last = y;
      srcRow[y * w + x] = last;
      gy[y * w + x] = last < 0 ? INF : y - last;
    }
    last = -1;
    for (let y = h - 1; y >= 0; y--) {
      if (solid(y * w + x)) last = y;
      if (last >= 0 && last - y < gy[y * w + x]) {
        gy[y * w + x] = last - y;
        srcRow[y * w + x] = last;
      }
    }
  }
  // แนวนอน: lower envelope ของพาราโบลา (Felzenszwalb) จำว่าใครชนะ
  const out = new ImageData(new Uint8ClampedArray(data), w, h);
  const o = out.data;
  const f = new Float64Array(w);
  const v = new Int32Array(w);
  const z = new Float64Array(w + 1);
  const r2 = rPx * rPx;
  for (let y = 0; y < h; y++) {
    let any = false;
    for (let x = 0; x < w; x++) {
      const g = gy[y * w + x];
      f[x] = g >= INF ? INF : g * g;
      if (g < INF) any = true;
    }
    if (!any) continue;
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < w; q++) {
      let sv = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (sv <= z[k]) {
        k--;
        sv = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = sv;
      z[k + 1] = INF;
    }
    k = 0;
    for (let x = 0; x < w; x++) {
      while (z[k + 1] < x) k++;
      const sx = v[k];
      const d2 = (x - sx) * (x - sx) + f[sx];
      const i = y * w + x;
      const a = data[i * 4 + 3];
      if (a >= 250 || d2 > r2 || f[sx] >= INF || keep?.[i]) continue;
      const si = (srcRow[y * w + sx] * w + sx) * 4;
      // ทับใต้ขอบลายเดิม (ขอบ anti-alias ไม่มีฮาโลขาว)
      for (let c = 0; c < 3; c++) o[i * 4 + c] = (data[i * 4 + c] * a + data[si + c] * (255 - a)) / 255;
      o[i * 4 + 3] = 255;
    }
  }
  return out;
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
