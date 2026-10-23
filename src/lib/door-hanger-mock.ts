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

/**
 * ผิวอะคริลิคสีพิเศษ (ดูจากภาพตัวอย่าง acrylic-colors/*-v2.jpg ของตัวเลือก "สีอะคริลิค")
 *   solid   = สีทึบเงา · frost = ใสขุ่น (C-01) · mirror = กระจก
 *   glitter = กากเพชรแน่นทึบ (G-silver/rosegold/red/purple)
 *   sparkle = อะคริลิคใส + เกล็ดกลิตเตอร์โปรย (กลิตเตอร์-เงิน/ทอง/รุ้ง)
 *   holo    = อะคริลิคใส + ฟิล์ม/อนุภาคโฮโลแกรมสีรุ้ง ลายตาม pattern (hologram-*)
 */
export type DoorHangerFinish = "solid" | "frost" | "mirror" | "glitter" | "sparkle" | "holo";

/** สีเกล็ด: silver/gold = โทนเดียว · rainbow = สุ่มสีรุ้ง · base = ตามสีพื้น (กากเพชรทึบ) */
export type DoorHangerFlake = "silver" | "gold" | "rainbow" | "base";

/** ลายอนุภาคโฮโลแกรม */
export type DoorHangerPattern = "film" | "rainbow" | "shards" | "dots" | "snow" | "stars" | "dust" | "stardust" | "hearts";

export interface DoorHangerTint {
  /** ชื่อเฉดตามตัวเลือก "สีอะคริลิค" */
  name: string;
  color: number;
  finish: DoorHangerFinish;
  flake?: DoorHangerFlake;
  pattern?: DoorHangerPattern;
}

/** พื้นเป็นอะคริลิคใส (มองทะลุ + พิมพ์รองขาว) */
export const tintIsClear = (t?: DoorHangerTint) => t?.finish === "sparkle" || t?.finish === "holo";

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
 * เฉด → สี/ผิว — สีทึบเก็บจากภาพตัวอย่างของร้าน (ค่ากลางมุมซ้ายล่างของแผ่น) · ข้อแรกที่ตรงชนะ
 * (ชื่อเจาะจงต้องมาก่อนชื่อกว้าง เช่น "ส้มแดง" ก่อน "ส้ม" · "กุหลาบแดง" ก่อน "แดง")
 * ⚠️ OR / OR-02 ของร้านเป็นโทนพีช ไม่ใช่ส้มสด · W ถ่ายออกม่วงอ่อน ใช้ขาวจริงแทน
 */
type TintRow = [RegExp, number, DoorHangerFinish, Partial<Pick<DoorHangerTint, "flake" | "pattern">>?];
const TINTS: TintRow[] = [
  [/กากเพชร.*เงิน/, 0xaca8b1, "glitter", { flake: "base" }],
  [/กากเพชร.*โรสโกลด์/, 0x8a6a62, "glitter", { flake: "base" }],
  [/กากเพชร.*แดง/, 0xc8101f, "glitter", { flake: "base" }],
  [/กากเพชร.*ม่วง/, 0x5a3866, "glitter", { flake: "base" }],
  [/กลิ[ตท]เตอร์.*เงิน/, 0xffffff, "sparkle", { flake: "silver" }],
  [/กลิ[ตท]เตอร์.*ทอง/, 0xffffff, "sparkle", { flake: "gold" }],
  [/กลิ[ตท]เตอร์.*รุ้ง/, 0xffffff, "sparkle", { flake: "rainbow" }],
  [/hologram-0?2/i, 0xffffff, "holo", { pattern: "shards" }],
  [/hologram-จุด/i, 0xffffff, "holo", { pattern: "dots" }],
  [/hologram-หิมะ/i, 0xffffff, "holo", { pattern: "snow" }],
  [/hologram-ดาว/i, 0xffffff, "holo", { pattern: "stars" }],
  [/hologram-stardust/i, 0xffffff, "holo", { pattern: "stardust" }],
  [/hologram-dust/i, 0xffffff, "holo", { pattern: "dust" }],
  [/hologram-หัวใจ/i, 0xffffff, "holo", { pattern: "hearts" }],
  [/hologram-รุ้ง/i, 0xffffff, "holo", { pattern: "rainbow" }],
  [/hologram|โฮโลแกรม/i, 0xffffff, "holo", { pattern: "film" }],
  [/กระจก/, 0xd5d9de, "mirror"],
  [/ใสขุ่น|C-01/i, 0xdfe2dc, "frost"],
  [/ส้มแดง/, 0xfe4602, "solid"],
  [/ส้มอ่อน|OR-02/, 0xf7c5af, "solid"],
  [/ส้ม/, 0xeeb394, "solid"],
  [/กุหลาบแดง/, 0xa3087e, "solid"],
  [/กุหลาบชมพู/, 0xffa289, "solid"],
  [/ไข่แดง/, 0xff9700, "solid"],
  [/แดง/, 0xd93032, "solid"],
  [/ชมพู/, 0xeaacb9, "solid"],
  [/เหลืองเข้ม/, 0xfe9901, "solid"],
  [/เลมอน/, 0xf7cd01, "solid"],
  [/มัสตาร์ด/, 0xeab601, "solid"],
  [/เหลือง/, 0xf7d840, "solid"],
  [/ทอง/, 0xc49126, "solid"],
  [/เทามุก/, 0x949b99, "solid"],
  [/เทา/, 0x4b4f4d, "solid"],
  [/หญ้าเขียว/, 0x01ab6c, "solid"],
  [/แอปเปิ้ลเขียว/, 0x4fc952, "solid"],
  [/เขียว/, 0x37d3a0, "solid"],
  [/ท้องฟ้า/, 0x0090f9, "solid"],
  [/น้ำเงิน/, 0x2252fe, "solid"],
  [/ฟ้า/, 0x94b9e9, "solid"],
  [/ม่วง/, 0xab18e4, "solid"],
  [/น้ำตาล/, 0x55110a, "solid"],
  [/ดำ/, 0x2f302e, "solid"],
  [/ครีม/, 0xe2e4c5, "solid"],
  [/ขาว/, 0xf4f4f6, "solid"],
];

export function doorHangerTintOf(name: string): DoorHangerTint | undefined {
  const n = name.trim();
  if (!n) return undefined;
  const hit = TINTS.find(([re]) => re.test(n));
  return hit ? { name: n, color: hit[1], finish: hit[2], ...(hit[3] ?? {}) } : undefined;
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
