/**
 * 🎀🧊 พรีวิว "ดูแบบ 3D" ผ้าผูกผม (scarf) + Scrunchy ยางรัดผม (scrunchy) — ค่าที่จอออกแบบใช้สร้างโมเดล
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "ช่วยทำ 3D ให้หน่อย" ต่อจากเปิดออกแบบบนเว็บ)
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "scarf" | "scrunchy" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts)
 * ผืนเทมเพลต (หมวด Women Product · วัดจากไฟล์ร้าน):
 *   ผ้าพันผม 1022×133 — เส้นตัดแดง 3 มม. ในขอบ · พับครึ่งตามยาว (เส้นประกลาง) → 5 × 100 ซม.
 *     ปลายซ้ายตัดเว้า V ลึก 63 · ปลายขวาแหลมยื่น 64 → พับแล้วปลายตัดเฉียงขนานกันทั้งคู่ (ทรงสี่เหลี่ยมด้านขนาน)
 *     ด้านหน้า = ครึ่งบนของผืน · ด้านหลัง = ครึ่งล่าง (พับไปข้างหลัง → เห็นหมุน 180°)
 *   ยางมัดผม 457.2×101.6 — เส้นตัด = ขอบอาร์ตบอร์ด · เส้นเย็บประ 9.7 มม. ในขอบ · เย็บเป็นท่อแล้วรูดบนยางวง
 * ดู components/HairTie3D
 */

export type HairStyle = "scarf" | "scrunchy";
export type HairView = "front" | "back" | "top" | "side";

export interface HairMock {
  kind: "hairtie";
  style: HairStyle;
  /** สีไหมเย็บ (กลุ่ม "สีไหมเย็บชิ้นงาน") เป็นสี hex */
  thread: string;
  threadName?: string;
  /** ค่า "ขนาด" ที่ลูกค้าเลือก (ป้ายบนหน้าต่าง) */
  label?: string;
}

/** ผ้าพันผม (มม. ในผืน): ขอบเส้นตัด · ความลึกปลายตัด V */
export const SCARF_INSET_MM = 3;
export const SCARF_TIP_MM = 63;
/** ยางมัดผม: เส้นเย็บ (ขอบในของส่วนเผื่อเย็บ) */
export const SCRUNCHY_SEAM_MM = 9.7;

export const HAIR_STYLE_TH: Record<HairStyle, string> = { scarf: "ผ้าผูกผม", scrunchy: "ยางรัดผม Scrunchy" };
export const HAIR_VIEW_TH: Record<HairView, string> = { front: "ด้านหน้า", back: "ด้านหลัง", top: "ด้านบน", side: "ด้านข้าง" };

/** สีไหมตามชื่อในกลุ่ม "สีไหมเย็บชิ้นงาน" (ขาว (1803) / ชมพู (1816) / …) — ชุดเดียวกับกระเป๋าต๊อบแต๊บ */
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

export function hairMockFrom(style: HairStyle, sel: Record<string, string | undefined>): HairMock {
  const v = (k: string) => String(sel[k] ?? "").trim();
  const t = v("สีไหมเย็บชิ้นงาน");
  const thread = THREAD.find(([re]) => re.test(t))?.[1] ?? "#f4f2ee";
  return { kind: "hairtie", style, thread, threadName: t.replace(/\s*\(\d+\)\s*$/, "") || undefined, label: v("ขนาด") || undefined };
}
