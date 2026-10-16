/**
 * ☕🧊 พรีวิว 3D แก้วมัค — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 16 ต.ค. 69 "ฉันต้องการให้มี 3D ด้วย" ที่สินค้าแก้วมัค MUG 11oz)
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "mug" (ตั้งได้ที่หน้าแก้ไขสินค้า กล่อง 🎨 ปุ่มเริ่มสร้าง)
 * ลักษณะแก้ว/มุมมองเริ่มต้นเดาจาก "ค่าตัวเลือกที่ลูกค้าเลือกอยู่" (ไม่ผูกชื่อกลุ่ม — ใช้ได้ทุกสินค้าแก้วที่ตั้งตัวเลือกคล้ายกัน):
 *   ประเภท   "แก้วใส" → ตัวแก้วโปร่ง · "แก้วขาวขุ่น/ด้าน" → ผิวด้าน · อื่น ๆ → ขาวเงา
 *   ตำแหน่ง  "ด้านหน้า (ตรงข้ามหูจับ)" → กล้องมองฝั่งตรงข้ามหู · "หูจับด้านขวา/ซ้าย" → หันให้หูอยู่ขวา/ซ้าย
 *            "สกรีน 2 ด้าน" → หูขวา + หมุนให้เอง · "รอบแก้ว" → หน้า + หมุนให้เอง
 * ลายที่พิมพ์ = ทั้งอาร์ตบอร์ดของเทมเพลต (200×90 มม.) พันรอบตัวแก้ว กึ่งกลางลายอยู่ตรงข้ามหูจับ — ช่องว่างที่เหลืออยู่ตรงหู
 */

export type MugBody = "white" | "clear" | "matte";
/** มุมที่กล้องมองตอนเปิด (ลูกค้าลากหมุนต่อได้) */
export type MugView = "front" | "right" | "left";

export interface MugMock {
  kind: "mug";
  body: MugBody;
  view: MugView;
  /** หมุนโชว์รอบตัวให้เองตอนเปิด (สกรีน 2 ด้าน / รอบแก้ว) */
  spin: boolean;
}

/** ขนาดแก้วมัค 11 oz มาตรฐาน (มม.) — ⌀82 สูง 95 · ผนัง ~2.5 · ลาย 200×90 พันได้ ~280° */
export const MUG_11OZ = { heightMm: 95, radiusMm: 41, innerRadiusMm: 38.5 } as const;

export const MUG_DEFAULT: MugMock = { kind: "mug", body: "white", view: "front", spin: false };

export const MUG_VIEW_TH: Record<MugView, string> = {
  front: "ด้านหน้า (ตรงข้ามหูจับ)",
  right: "หูจับด้านขวา",
  left: "หูจับด้านซ้าย",
};

export const MUG_BODY_TH: Record<MugBody, string> = { white: "แก้วขาวเงา", clear: "แก้วใส", matte: "แก้วขาวขุ่น" };

/** เดาลักษณะแก้ว + มุมมองเริ่มต้น จากค่าตัวเลือกที่เลือกอยู่ (label → ชื่อตัวเลือก) */
export function mugMockFrom(sel: Record<string, string | undefined>): MugMock {
  const vals = Object.values(sel).map((v) => String(v ?? "").trim());
  const glass = vals.filter((v) => /แก้ว/.test(v));
  // "ใส" ต้องไม่ใช่ "ใส่" (ใส + ไม้เอก)
  const body: MugBody = glass.some((v) => /ใส(?!่)/.test(v)) ? "clear" : glass.some((v) => /ขุ่น|ด้าน/.test(v)) ? "matte" : "white";
  const pos = vals.find((v) => /หูจับ|สกรีน|รอบแก้ว/.test(v)) ?? "";
  if (/รอบ/.test(pos)) return { kind: "mug", body, view: "front", spin: true };
  if (/2\s*ด้าน|สองด้าน/.test(pos)) return { kind: "mug", body, view: "right", spin: true };
  if (/ตรงข้าม/.test(pos)) return { kind: "mug", body, view: "front", spin: false };
  if (/ขวา/.test(pos)) return { kind: "mug", body, view: "right", spin: false };
  if (/ซ้าย/.test(pos)) return { kind: "mug", body, view: "left", spin: false };
  return { kind: "mug", body, view: "front", spin: false };
}
