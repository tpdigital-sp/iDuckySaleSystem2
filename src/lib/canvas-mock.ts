/**
 * 🖼🪵🧊 พรีวิว 3D กรอบรูปแคนวาส (Canvas Frame) — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่ม 3D ให้หน่อย")
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "canvas" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts <id> canvas)
 * ผืนเทมเพลต (หมวด "กรอบรูปแคนวาส" · CanvasFrame WxH) = อาร์ตบอร์ดรวมส่วนอ้อมขอบ: หน้างาน (กรอบแดง) + "ขอบข้าง" 30 มม. + "ขอบเย็บ" 30 มม. พับไปด้านหลัง
 *   30x30 → 418×418 (หน้างาน 300 · ขอบรวมข้างละ 59) · 40x60 → 520×720 (ขอบ 60) · 100x120 → 1120×1320 (ขอบ 60)
 * ขนาดหน้างานจริงอ่านจากค่า "ขนาด" ที่ลูกค้าเลือก ("30x40cm") · อ่านไม่ได้ → components/CanvasFrame3D ถอดจากอาร์ตบอร์ด (ขอบ 60)
 */

export type CanvasView = "front" | "right" | "left" | "back" | "top" | "bottom";

export interface CanvasMock {
  kind: "canvas";
  /** ขนาดหน้างานจริง (มม.) จากตัวเลือก "ขนาด" — ไม่มี = ถอดจากอาร์ตบอร์ด */
  finishedMm?: { w: number; h: number };
  /** ชื่อตัวเลือก "ขนาด" ที่ลูกค้าเลือก (ป้ายบนหน้าต่าง 3D) */
  label?: string;
}

export const CANVAS_VIEW_TH: Record<CanvasView, string> = {
  front: "ด้านหน้า",
  right: "ด้านขวา",
  left: "ด้านซ้าย",
  back: "ด้านหลัง",
  top: "ด้านบน",
  bottom: "ด้านล่าง",
};

/** ขอบรวมข้างละ (มม.) เมื่อถอดจากตัวเลือกไม่ได้ — ไฟล์ร้านทุกขนาดใช้ 60 (30x30 ใช้ 59) */
export const CANVAS_WRAP_MM = 60;

export function canvasMockFrom(sel: Record<string, string | undefined>): CanvasMock {
  const size = String(sel["ขนาด"] ?? "").trim();
  const m = size.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  // ชื่อตัวเลือกเป็น ซม. ("30x40cm") → มม.
  const finishedMm = m ? { w: Number(m[1]) * 10, h: Number(m[2]) * 10 } : undefined;
  return { kind: "canvas", finishedMm, label: size || undefined };
}
