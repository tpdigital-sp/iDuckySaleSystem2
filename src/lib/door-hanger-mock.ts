/**
 * 🚪🧊 พรีวิว 3D ป้ายแขวนประตู (Door Hanger) — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่ม 3D ให้หน่อย")
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "doorhanger" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts)
 * แผ่นป้าย = ทรงตามเส้นไดคัทของเทมเพลต (ทรงตะขอ/แคปซูลรูกลม) หนาตามวัสดุ แขวนบนก้านมือจับประตู · ดู components/DoorHanger3D
 * งาน 2 ด้าน (tpl2) = ลายหน้า 2 อยู่ด้านหลังแผ่น (ไกด์ด้านหลังกลับข้างอยู่แล้ว) · ด้านเดียว = หลังเป็นเนื้อวัสดุเปล่า (อะคริลิคใสมีรองขาว → หลังขาวตามทรงลาย · PET ใสมองทะลุเห็นลายกลับด้าน)
 */

export type DoorHangerView = "front" | "right" | "left" | "back";

/** เนื้อวัสดุ (กลุ่ม "ชนิดวัสดุ") — clear = มองทะลุได้ */
export type DoorHangerMaterial = "mdf" | "acrylic-clear" | "acrylic-white" | "acrylic-color" | "paper" | "pet-clear" | "pet-white";

export interface DoorHangerMock {
  kind: "doorhanger";
  material: DoorHangerMaterial;
  /** ชื่อวัสดุที่ลูกค้าเลือก (ป้ายบนหน้าต่าง 3D) */
  label?: string;
}

export const DOOR_HANGER_VIEW_TH: Record<DoorHangerView, string> = { front: "ด้านหน้า", right: "ด้านขวา", left: "ด้านซ้าย", back: "ด้านหลัง" };

/** ความหนาแผ่น (มม.) · ใส = มองทะลุ · edge = สีขอบแผ่น · face = สีเนื้อด้านที่ไม่พิมพ์ */
export const DOOR_HANGER_MAT: Record<DoorHangerMaterial, { t: number; clear: boolean; edge: number; face: number; th: string }> = {
  // MDF ของร้านเป็นแผ่นเคลือบขาว — ด้านหลังที่ไม่พิมพ์เป็นสีขาว ขอบตัดเห็นเนื้อไม้ (เจ้าของร้านแจ้ง 23 ต.ค. 69 "MDF ด้านหลังจะเป็นสีขาว")
  mdf: { t: 3, clear: false, edge: 0x9a7650, face: 0xfbfaf7, th: "ไม้ MDF" },
  "acrylic-clear": { t: 3, clear: true, edge: 0x9fd0de, face: 0xffffff, th: "อะคริลิคใส" },
  "acrylic-white": { t: 3, clear: false, edge: 0xf4f4f2, face: 0xfafaf8, th: "อะคริลิคขาวขุ่น" },
  "acrylic-color": { t: 3, clear: false, edge: 0xe9e4f5, face: 0xf3effa, th: "อะคริลิคสีพิเศษ" },
  paper: { t: 0.6, clear: false, edge: 0xffffff, face: 0xffffff, th: "กระดาษ 300 แกรม" },
  "pet-clear": { t: 0.5, clear: true, edge: 0xeef8fb, face: 0xffffff, th: "PET ใส" },
  "pet-white": { t: 0.5, clear: false, edge: 0xffffff, face: 0xffffff, th: "PET ขาว" },
};

export function doorHangerMockFrom(sel: Record<string, string | undefined>): DoorHangerMock {
  const v = String(sel["ชนิดวัสดุ"] ?? "").trim();
  const material: DoorHangerMaterial = /MDF/i.test(v)
    ? "mdf"
    : /PET/i.test(v)
      ? /ใส/.test(v)
        ? "pet-clear"
        : "pet-white"
      : /กระดาษ/.test(v)
        ? "paper"
        : /ขาวขุ่น/.test(v)
          ? "acrylic-white"
          : /สีพิเศษ/.test(v)
            ? "acrylic-color"
            : "acrylic-clear";
  return { kind: "doorhanger", material, label: v || undefined };
}
