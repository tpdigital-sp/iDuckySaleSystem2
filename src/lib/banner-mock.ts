/**
 * 🪧🧊 พรีวิว 3D ป้ายขาตั้ง (X-Stand / Roll UP) — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 22 ต.ค. 69 "ทำ 3D เพิ่มให้หน่อย" หลังผูกเทมเพลตป้ายขาตั้ง)
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "xstand" | "rollup" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts)
 *   xstand = ป้ายไวนิล 60×160 ซม. เจาะตาไก่ 4 มุม เกี่ยวบนโครงคาร์บอนไฟเบอร์ไขว้ (X) + ขาค้ำหลัง · ลาย = ทั้งอาร์ตบอร์ด (600×1600)
 *   rollup = ป้ายไวนิลม้วนเก็บในฐานอลูมิเนียม ดึงขึ้นแขวนกับเสาหลัง + รางหนีบบน · อาร์ตบอร์ด 600×1800 = งานโชว์ 1600 + เผื่อหัวหนีบบน 100 / ม้วนเข้าฐานล่าง 100
 *            → โมเดลโชว์เฉพาะช่วง 100–1700 มม. ของผืน (BANNER_ROLLUP_HIDE_MM) — ดู components/Banner3D
 */

export type BannerStand = "xstand" | "rollup";
export type BannerView = "front" | "right" | "left" | "back";

export interface BannerMock {
  kind: "banner";
  stand: BannerStand;
  /** ชื่อตัวเลือกที่ลูกค้าเลือก (ป้ายบนหน้าต่าง 3D) — ป้ายขาตั้งไม่มีตัวเลือก จึงมักว่าง */
  label?: string;
}

/** Roll UP: ส่วนของผืนที่ซ่อนอยู่ในหัวหนีบ (บน) และในฐาน (ล่าง) — มม. ต่อด้าน (ตรงแถบขาวในสกินร้าน) */
export const BANNER_ROLLUP_HIDE_MM = 100;

export const BANNER_VIEW_TH: Record<BannerView, string> = { front: "ด้านหน้า", right: "ด้านขวา", left: "ด้านซ้าย", back: "ด้านหลัง" };
export const BANNER_STAND_TH: Record<BannerStand, string> = { xstand: "ป้ายขาตั้ง X-Stand", rollup: "ป้ายขาตั้ง Roll UP" };

/** สินค้าไม่มีตัวเลือก — เก็บค่าที่เลือก (ถ้ามี) ไว้เป็นป้ายเฉย ๆ */
export function bannerMockFrom(stand: BannerStand, sel: Record<string, string | undefined>): BannerMock {
  const all = Object.values(sel).map((v) => String(v ?? "").trim());
  const size = all.find((v) => /\d+(\.\d+)?\s*[×x]\s*\d+(\.\d+)?/.test(v));
  return { kind: "banner", stand, label: size };
}
