/**
 * ☕🧊 พรีวิว 3D แก้วมัค — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 16 ต.ค. 69 "ฉันต้องการให้มี 3D ด้วย" ที่สินค้าแก้วมัค MUG 11oz)
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "mug" (ตั้งได้ที่หน้าแก้ไขสินค้า กล่อง 🎨 ปุ่มเริ่มสร้าง)
 * ลักษณะแก้ว/มุมมองเริ่มต้นเดาจาก "ค่าตัวเลือกที่ลูกค้าเลือกอยู่" (ไม่ผูกชื่อกลุ่ม — ใช้ได้ทุกสินค้าแก้วที่ตั้งตัวเลือกคล้ายกัน):
 *   ประเภท   "แก้วใส" → แก้วใส · "แก้วขาวขุ่น/ด้าน" → แก้วฝ้าโปร่งแสง (ของจริงเป็นแก้วขุ่น ไม่ใช่เซรามิก) · อื่น ๆ → เซรามิกขาวเงา
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
  /** ชื่อประเภทแก้วตามที่ลูกค้าเลือกจริง (ป้ายบนหัวจอออกแบบ/หน้าต่าง 3D) · ไม่มี = ชื่อมาตรฐาน MUG_BODY_TH */
  label?: string;
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

/** ชื่อประเภทแก้วที่แสดง (ชื่อตัวเลือกจริงก่อน) */
export function mugBodyLabel(m: MugMock): string {
  return m.label?.trim() || MUG_BODY_TH[m.body];
}

const BODY_RE = /แก้ว\s*(ขาว|ใส(?!่)|ขุ่น|ด้าน|เงา)/;
const POS_RE = /หูจับ|รอบแก้ว|สกรีน\s*2\s*ด้าน/;

/**
 * เดาลักษณะแก้ว + มุมมองเริ่มต้น จากตัวเลือกที่เลือกอยู่
 * options = กลุ่มตัวเลือกของสินค้า → อ่านเฉพาะ "กลุ่มประเภทแก้ว" (ตัวเลือกมีชื่อ แก้วขาว/แก้วใส/แก้วขุ่น…) และ "กลุ่มตำแหน่ง" (มีคำว่า หูจับ)
 * ไม่ไล่ทุกค่าใน sel — ค่าอื่นที่ติดมา (สเปคแบบที่วางไว้ · ขนาดลาย · เรท) มีคำว่า "แก้ว…/ด้าน…" ปนได้ ทำให้เดาประเภทผิด
 * ไม่ส่ง options = ไล่ค่าทั้งหมดแบบเดิม
 */
export function mugMockFrom(
  sel: Record<string, string | undefined>,
  options?: { label: string; choices: { name: string }[] }[],
): MugMock {
  const pick = (re: RegExp) => {
    const o = options?.find((x) => x.choices.some((c) => re.test(c.name)));
    return o ? String(sel[o.label] ?? "").trim() : undefined;
  };
  const all = Object.values(sel).map((v) => String(v ?? "").trim());
  const bodyVal = options ? (pick(BODY_RE) ?? "") : (all.find((v) => BODY_RE.test(v)) ?? "");
  // "ใส" ต้องไม่ใช่ "ใส่" (ใส + ไม้เอก)
  const body: MugBody = /ใส(?!่)/.test(bodyVal) ? "clear" : /ขุ่น|ด้าน|ฝ้า/.test(bodyVal) ? "matte" : "white";
  const label = bodyVal || undefined;
  const pos = options ? (pick(POS_RE) ?? "") : (all.find((v) => POS_RE.test(v)) ?? "");
  const base = { kind: "mug" as const, body, label };
  if (/รอบ/.test(pos)) return { ...base, view: "front", spin: true };
  if (/2\s*ด้าน|สองด้าน/.test(pos)) return { ...base, view: "right", spin: true };
  if (/ตรงข้าม/.test(pos)) return { ...base, view: "front", spin: false };
  if (/ขวา/.test(pos)) return { ...base, view: "right", spin: false };
  if (/ซ้าย/.test(pos)) return { ...base, view: "left", spin: false };
  return { ...base, view: "front", spin: false };
}
