/**
 * 👛🧊 พรีวิว 3D กระเป๋าต๊อบแต๊บ (Clip Pouch) — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่ม 3D ให้ด้วย")
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "pouch" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts <id> pouch)
 * ผืนเทมเพลต (หมวด "Clip Pouch" · Clip Pouch WxH cm -.ai) = ผืนผ้ากางออกแนวตั้ง วัดจากไฟล์ร้านทั้ง 4 ขนาด (เส้นประเท่ากันทุกไฟล์):
 *   ตะเข็บข้าง 12.5 มม. ซ้าย/ขวา · ตะเข็บบน/ล่าง 7.5 · "พับเข้าด้านใน" 20 · "ใส่ตัวหนีบ" 20 · ด้านหน้า | กลางผืน = ก้นกระเป๋า | ด้านหลัง (วางกลับหัว)
 *   9.5x9 → 120×235 (กว้าง 95 · ช่องตัวหนีบ 20 + ตัวกระเป๋า 70 = สูง 90) … 17.5x14.5 → 200×345
 * ดู components/ClipPouch3D
 */

export type PouchView = "front" | "right" | "left" | "back" | "top" | "bottom";

export interface PouchMock {
  kind: "pouch";
  /** เนื้อผ้า (กลุ่ม "เนื้อผ้า") — ซาติน/ดัชเชส เงาลื่น · บาร์บี้ เงานิด ๆ · แคนวาส ด้าน */
  fabric: "satin" | "duchess" | "barbie" | "canvas";
  /** สีไหมเย็บ (กลุ่ม "สีไหมเย็บชิ้นงาน") เป็นสี hex */
  thread: string;
  threadName?: string;
  /** ชื่อตัวเลือก "ขนาด" ที่ลูกค้าเลือก (ป้ายบนหน้าต่าง 3D) */
  label?: string;
}

/** โซนผืน (มม.) — ตะเข็บข้าง · ตะเข็บ+พับเข้าด้านใน (ขอบบนผืน → ขอบบนกระเป๋า) · ช่องใส่ตัวหนีบ */
export const POUCH_SEAM_X_MM = 12.5;
export const POUCH_TOP_MM = 27.5;
export const POUCH_CLIP_MM = 20;

export const POUCH_VIEW_TH: Record<PouchView, string> = { front: "ด้านหน้า", right: "ด้านขวา", left: "ด้านซ้าย", back: "ด้านหลัง", top: "ด้านบน", bottom: "ด้านล่าง" };

export const POUCH_FABRIC_TH: Record<PouchMock["fabric"], string> = { satin: "ผ้าซาติน", duchess: "ผ้าดัชเชส", barbie: "ผ้าบาร์บี้", canvas: "ผ้าแคนวาส" };

/** สีไหมตามชื่อในกลุ่ม "สีไหมเย็บชิ้นงาน" (ขาว (1803) / ชมพู (1816) / …) */
const THREAD: [RegExp, string][] = [
  [/เขียวอ่อน/, "#9fd18b"],
  [/เขียวเข้ม/, "#2f6b3a"],
  [/น้ำเงิน/, "#22357a"],
  [/น้ำตาล/, "#7a4e2d"],
  [/ขาว/, "#f4f2ee"],
  [/ชมพู/, "#f3a6c3"],
  [/แดง/, "#c8282f"],
  [/เหลือง/, "#f2cf3b"],
  [/ส้ม/, "#ee7f2d"],
  [/ฟ้า/, "#7cc3ea"],
  [/ม่วง/, "#7e57b5"],
  [/เทา/, "#9a9ca1"],
  [/ดำ/, "#222326"],
];

export function pouchMockFrom(sel: Record<string, string | undefined>): PouchMock {
  const v = (k: string) => String(sel[k] ?? "").trim();
  const f = v("เนื้อผ้า");
  const fabric: PouchMock["fabric"] = /แคนวาส|canvas/i.test(f) ? "canvas" : /บาร์บี้/.test(f) ? "barbie" : /ดัชเชส/.test(f) ? "duchess" : "satin";
  const t = v("สีไหมเย็บชิ้นงาน");
  const thread = THREAD.find(([re]) => re.test(t))?.[1] ?? "#f4f2ee";
  return { kind: "pouch", fabric, thread, threadName: t.replace(/\s*\(\d+\)\s*$/, "") || undefined, label: v("ขนาด") || undefined };
}
