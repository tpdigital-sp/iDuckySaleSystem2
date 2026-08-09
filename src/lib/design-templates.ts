/**
 * 📐 คลังเทมเพลตไฟล์งาน (Design Templates)
 * — ไฟล์ .ai / .pdf ฯลฯ ที่ลูกค้าโหลดไปวางลายก่อนส่งกลับมาให้ร้านผลิต
 * — อัปครั้งเดียวในคลังกลาง แล้วติ๊กเลือกไปใช้กับสินค้ากี่ตัวก็ได้ (แบบเดียวกับคลังตัวเลือก)
 * — แก้ไฟล์ที่เดียว สินค้าทุกตัวที่ผูกไว้อัปเดตตามทันที
 */

export interface DesignTemplate {
  id: string;
  /** ชื่อที่ลูกค้าเห็น เช่น "เทมเพลตพวงกุญแจอะคริลิค 5×5 ซม." */
  name: string;
  /** คำแนะนำสั้น ๆ เช่น "เซฟเป็น .ai หรือ PDF · โหมดสี CMYK · ตัวหนังสือ create outline" */
  note?: string;
  /** ไฟล์ที่อัปเข้าระบบ (Supabase Storage) */
  fileUrl?: string;
  fileName?: string;
  /** ขนาดไฟล์ (bytes) — โชว์ให้ลูกค้ารู้ก่อนกดโหลด */
  fileSize?: number;
  /**
   * ลิงก์ไฟล์ภายนอก (Google Drive / Dropbox) — ใช้กับไฟล์ใหญ่ที่ไม่อยากเปลืองพื้นที่ระบบ
   * มีทั้งไฟล์และลิงก์ได้ · ไม่มีสักอย่าง = ยังไม่พร้อมให้โหลด (คลังจะเตือน)
   */
  linkUrl?: string;
  /** รูปตัวอย่างเทมเพลต (PNG/JPG) — ให้ลูกค้าเห็นหน้าตาก่อนโหลด */
  previewUrl?: string;
  /** ลำดับในลิสต์ (ไม่ตั้ง = ไปต่อท้าย เรียงตามชื่อ) */
  sort?: number;
  /** ซ่อน — ไม่โชว์บนหน้าสินค้า และเลือกใหม่ไม่ได้ (ของเก่าที่ผูกไว้ก็ไม่โชว์ด้วย) */
  hidden?: boolean;
  /** เวลาที่บันทึกล่าสุด (เซิร์ฟเวอร์เขียนให้) */
  savedAt?: string;
}

/** ไฟล์เทมเพลตที่รับ — .ai เป็นตัวหลัก ที่เหลือเผื่อร้านมีไฟล์คนละแบบ */
export const TEMPLATE_EXT = ["ai", "pdf", "eps", "svg", "psd", "zip"] as const;

/**
 * เพดานไฟล์ที่อัปเข้าระบบได้ (MB) — ตามลิมิตกลางของ Supabase (แพ็กเกจฟรี = 50MB)
 * ใหญ่กว่านี้ให้อัปขึ้น Google Drive แล้วใส่ลิงก์แทน
 */
export const TEMPLATE_MAX_MB = 50;

/** ที่อยู่ไฟล์ที่ใช้จริง — ไฟล์ในระบบมาก่อน ไม่มีค่อยใช้ลิงก์ภายนอก */
export function templateHref(t: DesignTemplate): string | undefined {
  return t.fileUrl || t.linkUrl || undefined;
}

/** พร้อมให้ลูกค้าโหลดไหม (ต้องไม่ซ่อน + มีไฟล์หรือลิงก์) */
export function templateReady(t: DesignTemplate): boolean {
  return !t.hidden && !!templateHref(t);
}

/** ขนาดไฟล์อ่านง่าย เช่น "12.4 MB" */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** เรียงตามลำดับที่แอดมินจัดไว้ (ยังไม่จัด = ต่อท้าย เรียงตามชื่อไทย) */
export function sortTemplates(list: DesignTemplate[]): DesignTemplate[] {
  return [...list].sort(
    (a, b) => (a.sort ?? 9999) - (b.sort ?? 9999) || a.name.localeCompare(b.name, "th")
  );
}
