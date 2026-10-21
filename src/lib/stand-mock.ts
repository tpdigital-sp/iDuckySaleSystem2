/**
 * 📱🧊 พรีวิว 3D ที่ตั้งโทรศัพท์ — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 21 ต.ค. 69 "360° PHONE STAND / PHONE STAND 3 STEP ช่วยทำ 3D ให้หน่อย")
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "stand360" | "stand3" (หลังบ้าน กล่อง 🧊 ปุ่ม ดูแบบ 3D · หรือ scripts/mock3d-set.mts)
 *   stand360 = แผ่นพิมพ์ ABS ขาวทึบ ยืนบนฐานหมุน + ที่ตั้งโทรศัพท์ใส 2 ตัวด้านล่าง · ทรงแผ่นตามเส้นไดคัทของเทมเพลต (cutCurves)
 *              ฐาน: 7×12 (ทรงโดม) = ฐานใสสี่เหลี่ยม · 6.8×10.5 (สี่เหลี่ยมมุมมน) = ฐานกลม (ตามคำอธิบายตัวเลือก "ขนาด")
 *   stand3   = แผ่น ABS ใสแผ่นเดียว พับ 2 รอย (รอยพับที่ ~55% และ ~75% จากขอบบน) กางตั้งได้ 3 ระดับ · ลายพิมพ์ด้านเดียว มองทะลุได้
 * ลายที่พิมพ์ = ทั้งอาร์ตบอร์ดของเทมเพลต ครอปตามเส้นไดคัท (ทรงเดียวกับไฟล์งาน) — ดู components/Stand3D
 */

export type StandKind = "stand360" | "stand3";
/** มุมที่กล้องมองตอนเปิด (ลูกค้าลากหมุนต่อได้) */
export type StandView = "front" | "right" | "left" | "back";

export interface StandMock {
  kind: StandKind;
  /** ฐานของ 360° — square = ฐานใสสี่เหลี่ยม (ทรงโดม 7×12) · round = ฐานกลม (สี่เหลี่ยมมุมมน 6.8×10.5) */
  base: "square" | "round";
  /** 3 step: ระดับการกางตอนเปิด (1 = เอนมาก · 3 = ตั้งชัน) */
  level: 1 | 2 | 3;
  /** ชื่อตัวเลือกที่ลูกค้าเลือก (ป้ายบนหน้าต่าง 3D) */
  label?: string;
}

export const STAND_VIEW_TH: Record<StandView, string> = { front: "ด้านหน้า", right: "ด้านขวา", left: "ด้านซ้าย", back: "ด้านหลัง" };

export const STAND_KIND_TH: Record<StandKind, string> = { stand360: "360° Phone Stand", stand3: "Phone Stand 3 step" };

/**
 * เดาค่าจากตัวเลือกที่เลือกอยู่ — 360°: ค่า "ขนาด" มี 7 × 12 → ฐานสี่เหลี่ยม · อื่น ๆ → ฐานกลม (ไม่ผูกชื่อกลุ่ม อ่านทุกค่า)
 */
export function standMockFrom(kind: StandKind, sel: Record<string, string | undefined>): StandMock {
  const all = Object.values(sel).map((v) => String(v ?? "").trim());
  const size = all.find((v) => /\d+(\.\d+)?\s*[×x]\s*\d+(\.\d+)?/.test(v));
  const base: StandMock["base"] = kind === "stand360" && size && /^7\s*[×x]\s*12/.test(size.replace(/\s/g, "").replace(/×/g, "×")) ? "square" : "round";
  return { kind, base, level: 2, label: size };
}
