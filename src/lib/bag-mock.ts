/**
 * 🌈🧊 พรีวิว 3D กระเป๋าโฮโลแกรม (ถุงซิปล็อก) — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 22 ต.ค. 69 "ทำ 3D ให้หน่อย")
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "bag" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts)
 * เทมเพลต ZipLock.ai: อาร์ตบอร์ด 210×153 · พื้นที่พิมพ์ = ขอบถุง 204×147 (เส้นตัดของเทมเพลต) · แถบซิปอยู่เหนือพื้นที่พิมพ์ (นอกงาน)
 * ตัวถุง = พลาสติกโฮโลแกรมสีรุ้ง · ส่วนที่ไม่มีหมึกในลาย (โปร่ง) เห็นโฮโลแกรมทะลุ · ดู components/Bag3D
 */

export type BagView = "front" | "right" | "left" | "back";

export interface BagMock {
  kind: "bag";
  /** สีแถบซิป (กลุ่ม "สีซิป") */
  zip: "white" | "black";
  /** ชื่อตัวเลือก "ขนาด" ที่ลูกค้าเลือก (ป้ายบนหน้าต่าง 3D) */
  label?: string;
}

/**
 * แถบซิป (มม.) บนสุด · ขอบโฮโลแกรมรอบลาย (ด้านข้าง/ล่าง) · แถบโฮโลแกรมใต้ซิปที่สกรีนไม่ได้
 * วัดจากรูปถุงจริงที่เจ้าของร้านส่ง (ลาย 204 มม. ≈ 1,705 px): แถบใต้ซิป ≈ 80 px ≈ 9.5 มม. (เจ้าของร้านวงกรอบแดง 22 ต.ค. 69
 * "3D เพิ่มตามกรอบสีแดงให้หน่อย เพราะส่วนนั้นสกรีนไม่ได้") · ซิป ≈ 65 px ≈ 8 มม. · ขอบข้าง ≈ 3 มม.
 */
export const BAG_ZIP_MM = 8;
export const BAG_BORDER_MM = 3;
export const BAG_BAND_MM = 9.5;

export const BAG_VIEW_TH: Record<BagView, string> = { front: "ด้านหน้า", right: "ด้านขวา", left: "ด้านซ้าย", back: "ด้านหลัง" };

export function bagMockFrom(sel: Record<string, string | undefined>): BagMock {
  const v = (k: string) => String(sel[k] ?? "").trim();
  return { kind: "bag", zip: /ดำ|black/i.test(v("สีซิป")) ? "black" : "white", label: v("ขนาด") || undefined };
}
