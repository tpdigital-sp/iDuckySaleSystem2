/**
 * 🛋🧊 พรีวิว 3D ปลอกหมอนอิง — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 22 ต.ค. 69 "ช่วยสร้าง 3D ให้หน่อย" หลังผูกเทมเพลตหมอนอิง(ซิป))
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "cushion" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts)
 * เทมเพลต "Cushion Zip NxNin" = ผืนกางออก: ครึ่งซ้าย = ด้านหน้า · ครึ่งขวา = ด้านหลัง (+ แถบพับทำสายซิปริมขวา) · ขอบรอบ = เผื่อเย็บ
 * โมเดลหยิบลายจากกึ่งกลางของแต่ละครึ่งเป็นสี่เหลี่ยม "ขนาดสำเร็จ" (sizeMm) ไปแปะหน้า/หลังของหมอนที่ยัดไส้พอง — ดู components/Cushion3D
 */

export type CushionView = "front" | "right" | "left" | "back";

export interface CushionMock {
  kind: "cushion";
  /** ขนาดสำเร็จด้านละกี่มม. (12x12 นิ้ว = 304.8) · 0 = เดาจากผืน (ครึ่งความกว้าง - เผื่อเย็บ) */
  sizeMm: number;
  /** ชื่อตัวเลือกที่ลูกค้าเลือก (ป้ายบนหน้าต่าง 3D) */
  label?: string;
}

export const CUSHION_VIEW_TH: Record<CushionView, string> = { front: "ด้านหน้า", right: "ด้านขวา", left: "ด้านซ้าย", back: "ด้านหลัง" };

/** ค่า "ขนาด" ของสินค้า เช่น "12x12 นิ้ว" / "50x80 ซม." → มม. (ด้านสั้น) · ไม่รู้จัก = 0 */
export function cushionMockFrom(sel: Record<string, string | undefined>): CushionMock {
  const all = Object.values(sel).map((v) => String(v ?? "").trim());
  const size = all.find((v) => /\d+(\.\d+)?\s*[×x]\s*\d+(\.\d+)?/.test(v));
  let sizeMm = 0;
  if (size) {
    const m = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/.exec(size);
    if (m) {
      const a = Math.min(Number(m[1]), Number(m[2]));
      sizeMm = /นิ้ว|in\b/i.test(size) ? a * 25.4 : /ซม|cm/i.test(size) ? a * 10 : a * 25.4;
    }
  }
  return { kind: "cushion", sizeMm, label: size };
}
