/**
 * จัดชิ้นงานไดคัทลงแผ่น (แบบ "Copy/Layout" ของ FineCut) — คำนวณล้วน ๆ ไม่แตะ DOM
 *
 * วางเป็นแถว ๆ (shelf) ซ้าย→ขวา บน→ล่าง ทีละลายตามลำดับ · ลายใหม่ต่อแถวเดิมได้ถ้าพอ
 * แต่ละลายเลือกทิศ (ตั้ง/หมุน 90°) ที่วางเต็มแผ่นได้มากกว่า · ล้นแผ่น = ขึ้นแผ่นใหม่
 * ลายที่ตั้งจำนวน 0 = "เติมที่ว่างที่เหลือ" ของแผ่นสุดท้าย (ไม่เปิดแผ่นใหม่ให้)
 *
 * หน่วยทั้งหมดเป็นมิลลิเมตร (x ขวา · y ลง · มุมซ้ายบนของแผ่น = 0,0)
 */

type Pt = { x: number; y: number };

/** กรอบของชิ้นงานหนึ่งชิ้นในพิกัดของลาย (มม. · ติดลบได้ เพราะเส้นตัดล้นออกนอกลาย) */
export interface PieceBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LayoutItem {
  id: string;
  box: PieceBox;
  /** จำนวนชิ้นที่ต้องการ · 0 = เติมเต็มที่ว่างที่เหลือ */
  qty: number;
}

export interface SheetSpec {
  widthMm: number;
  heightMm: number;
  /** ขอบซ้าย/ขวาที่ห้ามวาง */
  marginXMm: number;
  /** ขอบบน/ล่างที่ห้ามวาง */
  marginYMm: number;
  /** ระยะห่างระหว่างกรอบชิ้นงาน (วัดจากเส้นตัดถึงเส้นตัด) */
  gapMm: number;
  /** ยอมหมุน 90° ถ้าได้จำนวนมากกว่า */
  allowRotate: boolean;
}

export interface Placement {
  id: string;
  /** มุมซ้ายบนของกรอบชิ้นงานบนแผ่น */
  x: number;
  y: number;
  /** หมุน 90° ตามเข็มนาฬิกา */
  rot: boolean;
  /** ขนาดกรอบหลังหมุนแล้ว */
  w: number;
  h: number;
}

export interface LayoutResult {
  sheets: Placement[][];
  /** วางได้จริงต่อลาย */
  placed: Record<string, number>;
  /** ลายที่ใหญ่กว่าพื้นที่วาง (วางไม่ได้เลยสักชิ้น) */
  tooBig: string[];
  /** ใช้พื้นที่แผ่นสุดท้ายไปถึง y เท่าไร (มม. จากขอบบน) — ไว้บอกว่าตัดม้วนได้ตรงไหน */
  lastSheetUsedMm: number;
}

/** ได้กี่ชิ้นถ้าวางลายนี้อย่างเดียวเต็มแผ่น (ตาราง) */
export function gridFit(w: number, h: number, s: SheetSpec): number {
  const uw = s.widthMm - s.marginXMm * 2;
  const uh = s.heightMm - s.marginYMm * 2;
  if (w > uw || h > uh) return 0;
  const cols = Math.floor((uw + s.gapMm) / (w + s.gapMm));
  const rows = Math.floor((uh + s.gapMm) / (h + s.gapMm));
  return cols * rows;
}

/** ทิศที่ให้จำนวนต่อแผ่นมากกว่า (เท่ากัน = ตั้งตรงตามลาย) */
function bestOrientation(box: PieceBox, s: SheetSpec) {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const up = gridFit(w, h, s);
  const turned = s.allowRotate ? gridFit(h, w, s) : 0;
  return turned > up ? { rot: true, w: h, h: w, perSheet: turned } : { rot: false, w, h, perSheet: up };
}

export function layoutSheets(items: LayoutItem[], s: SheetSpec): LayoutResult {
  const uw = s.widthMm - s.marginXMm * 2;
  const uh = s.heightMm - s.marginYMm * 2;
  const sheets: Placement[][] = [];
  const placed: Record<string, number> = {};
  const tooBig: string[] = [];

  let sheet: Placement[] = [];
  let cx = 0; // ตำแหน่งถัดไปในแถว (ในพื้นที่วาง)
  let rowY = 0;
  let rowH = 0;
  const flushSheet = () => {
    sheets.push(sheet);
    sheet = [];
    cx = 0;
    rowY = 0;
    rowH = 0;
  };

  /** หาที่วางชิ้นถัดไป · newSheet=false = ห้ามขึ้นแผ่นใหม่ */
  const place = (id: string, w: number, h: number, rot: boolean, newSheet: boolean): boolean => {
    // ต่อแถวเดิม
    if (cx > 0 && cx + w <= uw + 1e-6 && rowY + h <= uh + 1e-6) {
      sheet.push({ id, x: s.marginXMm + cx, y: s.marginYMm + rowY, rot, w, h });
      cx += w + s.gapMm;
      rowH = Math.max(rowH, h);
      return true;
    }
    // ขึ้นแถวใหม่
    const nextY = cx > 0 ? rowY + rowH + s.gapMm : rowY;
    if (nextY + h <= uh + 1e-6) {
      rowY = nextY;
      rowH = h;
      sheet.push({ id, x: s.marginXMm, y: s.marginYMm + rowY, rot, w, h });
      cx = w + s.gapMm;
      return true;
    }
    if (!newSheet) return false;
    flushSheet();
    rowH = h;
    sheet.push({ id, x: s.marginXMm, y: s.marginYMm, rot, w, h });
    cx = w + s.gapMm;
    return true;
  };

  const fixed = items.filter((it) => it.qty > 0);
  const fill = items.filter((it) => it.qty <= 0);

  for (const it of fixed) {
    const o = bestOrientation(it.box, s);
    placed[it.id] = 0;
    if (!o.perSheet) {
      tooBig.push(it.id);
      continue;
    }
    for (let i = 0; i < it.qty; i++) if (place(it.id, o.w, o.h, o.rot, true)) placed[it.id]++;
  }
  for (const it of fill) {
    const o = bestOrientation(it.box, s);
    placed[it.id] = 0;
    if (!o.perSheet) {
      tooBig.push(it.id);
      continue;
    }
    // ไม่มีอะไรวางมาก่อนเลย = เติมเต็มแผ่นแรก
    let guard = 0;
    while (guard++ < 5000 && place(it.id, o.w, o.h, o.rot, false)) placed[it.id]++;
  }
  if (sheet.length || !sheets.length) sheets.push(sheet);

  const last = sheets[sheets.length - 1];
  const lastSheetUsedMm = last.length ? Math.max(...last.map((p) => p.y + p.h)) + s.marginYMm : 0;
  return { sheets, placed, tooBig, lastSheetUsedMm };
}

/**
 * ตัวแปลงพิกัด "ในลาย" (มม.) → "บนแผ่น" (มม.) ของชิ้นที่วางไว้
 * หมุน 90° ตามเข็มนาฬิกา: จุด (u,v) → (y1 − v, u − x0) แล้วเลื่อนไปมุมกรอบบนแผ่น
 */
export function placementTransform(p: Placement, box: PieceBox): (q: Pt) => Pt {
  if (p.rot) return (q) => ({ x: p.x + (box.y1 - q.y), y: p.y + (q.x - box.x0) });
  return (q) => ({ x: p.x + (q.x - box.x0), y: p.y + (q.y - box.y0) });
}

/** แผ่นที่วางเหมือนกันทุกตำแหน่ง = พิมพ์/ตัดซ้ำได้ ไม่ต้องโหลดแยกไฟล์ */
export function sheetSignature(sheet: Placement[]): string {
  return sheet.map((p) => `${p.id}@${p.x.toFixed(2)},${p.y.toFixed(2)}${p.rot ? "r" : ""}`).join("|");
}
