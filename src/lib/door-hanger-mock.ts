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

/** ผิวอะคริลิคสีพิเศษ — solid = สีทึบเงา · frost = ใสขุ่น · glitter = กากเพชร · mirror = กระจก · holo = โฮโลแกรม */
export type DoorHangerFinish = "solid" | "frost" | "glitter" | "mirror" | "holo";

export interface DoorHangerTint {
  /** ชื่อเฉดตามตัวเลือก "สีอะคริลิค" */
  name: string;
  color: number;
  finish: DoorHangerFinish;
}

export interface DoorHangerMock {
  kind: "doorhanger";
  material: DoorHangerMaterial;
  /** 🎨 เฉดของอะคริลิคสีพิเศษ (กลุ่ม "สีอะคริลิค") — เนื้อแผ่น/ด้านหลังงานสกรีน 1 ด้านเป็นสีนี้ (เจ้าของร้านแจ้ง 23 ต.ค. 69) */
  tint?: DoorHangerTint;
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

/**
 * เฉด → สี/ผิว (ค่าประมาณจากชื่อเฉด · ข้อแรกที่ตรงชนะ — ชื่อเจาะจงต้องมาก่อนชื่อกว้าง เช่น "ส้มแดง" ก่อน "ส้ม" · "กุหลาบแดง" ก่อน "แดง")
 */
const TINTS: [RegExp, number, DoorHangerFinish][] = [
  [/กากเพชร.*เงิน|กลิ[ตท]เตอร์.*เงิน/, 0xd8dce2, "glitter"],
  [/กากเพชร.*โรสโกลด์/, 0xe7b0a0, "glitter"],
  [/กากเพชร.*แดง/, 0xc8202f, "glitter"],
  [/กากเพชร.*ม่วง/, 0x8a4fc4, "glitter"],
  [/กลิ[ตท]เตอร์.*ทอง/, 0xd9b54a, "glitter"],
  [/กลิ[ตท]เตอร์.*รุ้ง/, 0xe6e0f2, "holo"],
  [/hologram|โฮโลแกรม/i, 0xdfe3ea, "holo"],
  [/กระจก/, 0xd5d9de, "mirror"],
  [/ใสขุ่น|C-01/i, 0xeef2f4, "frost"],
  [/ส้มแดง/, 0xf2542d, "solid"],
  [/ส้มอ่อน|OR-02/, 0xffb36b, "solid"],
  [/ส้ม/, 0xff8a1f, "solid"],
  [/กุหลาบแดง/, 0xb3122e, "solid"],
  [/กุหลาบชมพู/, 0xe8578d, "solid"],
  [/ไข่แดง/, 0xffb000, "solid"],
  [/แดง/, 0xd9202b, "solid"],
  [/ชมพู/, 0xf6a8c8, "solid"],
  [/เหลืองเข้ม/, 0xf2b705, "solid"],
  [/เลมอน/, 0xfff35a, "solid"],
  [/มัสตาร์ด/, 0xd9a514, "solid"],
  [/เหลือง/, 0xffe14a, "solid"],
  [/ทอง/, 0xc9a227, "solid"],
  [/เทามุก/, 0xc4c6c9, "solid"],
  [/เทา/, 0x8e9399, "solid"],
  [/หญ้าเขียว/, 0x4caf3c, "solid"],
  [/แอปเปิ้ลเขียว/, 0x8fd14f, "solid"],
  [/เขียว/, 0x2fae5b, "solid"],
  [/ท้องฟ้า/, 0x5fb7ec, "solid"],
  [/น้ำเงิน/, 0x1f3f9b, "solid"],
  [/ฟ้า/, 0x7cc4ea, "solid"],
  [/ม่วง/, 0x7b4bb3, "solid"],
  [/น้ำตาล/, 0x7a4a2a, "solid"],
  [/ดำ/, 0x1d1d1f, "solid"],
  [/ครีม/, 0xf3e6c8, "solid"],
  [/ขาว/, 0xf7f7f5, "solid"],
];

export function doorHangerTintOf(name: string): DoorHangerTint | undefined {
  const n = name.trim();
  if (!n) return undefined;
  const hit = TINTS.find(([re]) => re.test(n));
  return hit ? { name: n, color: hit[1], finish: hit[2] } : undefined;
}

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
  const tint = material === "acrylic-color" ? doorHangerTintOf(String(sel["สีอะคริลิค"] ?? "")) : undefined;
  return { kind: "doorhanger", material, ...(tint ? { tint } : {}), label: v || undefined };
}
