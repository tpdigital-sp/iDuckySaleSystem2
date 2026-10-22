/**
 * 📁🧊 พรีวิว 3D แฟ้มจิ๋ว (MiNi FOLDER) — ค่าที่จอออกแบบใช้สร้างโมเดล (เจ้าของร้านสั่ง 22 ต.ค. 69 "ทำ 3d ให้หน่อย")
 *
 * เปิดต่อสินค้าด้วย Product.calendarStudio.mock3d = "folder" (หลังบ้าน กล่อง 🧊 · หรือ scripts/mock3d-set.mts)
 * เทมเพลต "(เล็ก/ใหญ่)แฟ้มจิ๋ว" = ผืนกางออก: ปกหลัง (ซ้าย) | สัน 17 มม. (กลาง) | ปกหน้า (ขวา · มีตำแหน่งกระดุมใกล้ขอบเปิด)
 * ขอบตัดเข้าใน ~1.6 มม. ทั้งสองขนาด (วัดจากสกินร้าน) — ดู components/Folder3D
 */

export type FolderView = "front" | "right" | "left" | "back";

export interface FolderMock {
  kind: "folder";
  /** ปกใส / ปกใสโรยกลิสเตอร์ */
  cover: "clear" | "glitter";
  /** โซ่ไข่ปลา — สี (hex) · metal = ชุบเงิน (ตะขอ Z2) · ไม่ใช่ = สีพ่น (ตะขอ C) */
  chain: { color: string; metal: boolean; label: string };
  /** ชื่อตัวเลือก "ขนาด" ที่ลูกค้าเลือก (ป้ายบนหน้าต่าง 3D) */
  label?: string;
}

/** มิติจากผืนเทมเพลต (มม.) — สันกึ่งกลางผืน กว้างคงที่ · ขอบตัดเข้าใน */
export const FOLDER_SPINE_MM = 17;
export const FOLDER_INSET_MM = 1.6;

export const FOLDER_VIEW_TH: Record<FolderView, string> = { front: "ด้านหน้า", right: "ด้านขวา", left: "ด้านสัน", back: "ด้านหลัง" };

/** สีโซ่ไข่ปลาตะขอ C (ตามชื่อในตัวเลือก "สีตะขอ C (โซ่ไข่ปลา)") */
const C_CHAIN: Record<string, string> = {
  C1: "#222222",
  C2: "#4a4d52",
  C3: "#a9adb2",
  C4: "#f4f4f2",
  C5: "#7a5236",
  C6: "#d9531e",
  C7: "#f28c28",
  C9: "#f5cf1f",
  C10: "#f3e38a",
  C11: "#b9dc8a",
  C12: "#2f5d3a",
  C13: "#3aa655",
  C15: "#8fe0cc",
  C16: "#a9d8f2",
  C17: "#4fb3e8",
  C18: "#1f6fb5",
  C20: "#1f2f6b",
  C21: "#5a2d82",
  C22: "#c3a6e0",
  C23: "#f7b9a0",
  C25: "#f49ac1",
  C26: "#e2348f",
  C27: "#d42a2a",
};

export function folderMockFrom(sel: Record<string, string | undefined>): FolderMock {
  const v = (k: string) => String(sel[k] ?? "").trim();
  const cover: FolderMock["cover"] = /กลิสเตอร์|glitter/i.test(v("แบบปก")) ? "glitter" : "clear";
  const hook = v("สีตะขอ");
  let chain: FolderMock["chain"] = { color: "#d8dadd", metal: true, label: "โซ่ไข่ปลาสีเงิน" };
  if (/^ตะขอ C|โซ่ไข่ปลาหลายสี/.test(hook) || (!/Z2/.test(hook) && v("สีตะขอ C (โซ่ไข่ปลา)"))) {
    const c = v("สีตะขอ C (โซ่ไข่ปลา)");
    const code = /^(C\d+)/.exec(c)?.[1];
    if (code && C_CHAIN[code]) chain = { color: C_CHAIN[code], metal: false, label: c };
  }
  return { kind: "folder", cover, chain, label: v("ขนาด") || undefined };
}
