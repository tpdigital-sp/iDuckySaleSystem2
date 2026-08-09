/**
 * 📐 คลังเทมเพลตไฟล์งาน (Design Templates)
 * — ไฟล์ .ai / .pdf ฯลฯ ที่ลูกค้าโหลดไปวางลายก่อนส่งกลับมาให้ร้านผลิต
 * — อัปครั้งเดียวในคลังกลาง แล้วติ๊กเลือกไปใช้กับสินค้ากี่ตัวก็ได้ (แบบเดียวกับคลังตัวเลือก)
 * — 1 ชุดเทมเพลตมีได้หลายไฟล์ แยกตาม "ตัวเลือกสินค้า" เช่น เคสมือถือ 1 ชุด มีไฟล์ของแต่ละรุ่น
 *   ลูกค้าเลือกรุ่นไหนบนหน้าสินค้า ก็เห็นไฟล์ของรุ่นนั้น
 */

/** ไฟล์ 1 ไฟล์ในชุดเทมเพลต */
export interface TemplateFile {
  id: string;
  /**
   * ค่าตัวเลือกที่ไฟล์นี้ใช้ เช่น "iPhone 17 Pro Max"
   * ว่าง = ไฟล์กลาง ใช้ได้กับทุกตัวเลือก (โชว์เมื่อไม่มีไฟล์ที่ตรงรุ่นกว่า)
   */
  choice?: string;
  /** ไฟล์ที่อัปเข้าระบบ (Supabase Storage) */
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  /** ลิงก์ไฟล์ภายนอก (Google Drive / Dropbox) — ใช้กับไฟล์ใหญ่เกินลิมิต */
  linkUrl?: string;
}

export interface DesignTemplate {
  id: string;
  /** ชื่อชุดที่ลูกค้าเห็น เช่น "เทมเพลตเคสมือถือ (ทุกรุ่น)" */
  name: string;
  /** คำแนะนำสั้น ๆ เช่น "เซฟเป็น .ai · โหมดสี CMYK · ตัวหนังสือ create outline" */
  note?: string;
  /**
   * หมวดหมู่ในคลัง เช่น "เคสมือถือ" · "สแตนดี้" — ไว้จัดกลุ่มตอนเทมเพลตเยอะ
   * ว่าง = อยู่กลุ่ม "ยังไม่จัดหมวด"
   */
  category?: string;
  /**
   * ชื่อกลุ่มตัวเลือกที่ไฟล์ในชุดนี้ผูกอยู่ เช่น "รุ่น"
   * ว่าง = ชุดนี้ไม่แยกตามตัวเลือก (ไฟล์ทั้งหมดโชว์หมด)
   */
  optionLabel?: string;
  /** ไฟล์ในชุด (ชุดเก่าที่มีไฟล์เดียวถูกแปลงเข้ามาที่นี่ตอนอ่าน — ดู normalizeTemplate) */
  files?: TemplateFile[];
  /** รูปตัวอย่างของทั้งชุด (PNG/JPG) */
  previewUrl?: string;
  /** ลำดับในลิสต์ (ไม่ตั้ง = ไปต่อท้าย เรียงตามชื่อ) */
  sort?: number;
  /** ซ่อน — ไม่โชว์บนหน้าสินค้า */
  hidden?: boolean;
  /** เวลาที่บันทึกล่าสุด (เซิร์ฟเวอร์เขียนให้) */
  savedAt?: string;

  // ── ฟิลด์รุ่นเก่า (ชุดละไฟล์เดียว) — อ่านอย่างเดียว เก็บไว้ให้ข้อมูลเดิมไม่หาย ──
  /** @deprecated ใช้ files[] แทน */
  fileUrl?: string;
  /** @deprecated */
  fileName?: string;
  /** @deprecated */
  fileSize?: number;
  /** @deprecated */
  linkUrl?: string;
}

/** ไฟล์เทมเพลตที่รับ — .ai เป็นตัวหลัก ที่เหลือเผื่อร้านมีไฟล์คนละแบบ */
export const TEMPLATE_EXT = ["ai", "pdf", "eps", "svg", "psd", "zip"] as const;

/**
 * เพดานไฟล์ที่อัปเข้าระบบได้ (MB) — ตามลิมิตกลางของ Supabase (แพ็กเกจฟรี = 50MB)
 * ใหญ่กว่านี้ให้อัปขึ้น Google Drive แล้วใส่ลิงก์แทน
 */
export const TEMPLATE_MAX_MB = 50;

/** ชุดเก่า (ไฟล์เดียวเก็บไว้ระดับชุด) → แปลงเป็น files[] ให้โค้ดใหม่ใช้ทางเดียว */
export function normalizeTemplate(t: DesignTemplate): DesignTemplate {
  if (t.files?.length) return t;
  if (!t.fileUrl && !t.linkUrl) return { ...t, files: [] };
  return {
    ...t,
    files: [
      {
        id: `${t.id}-legacy`,
        ...(t.fileUrl ? { fileUrl: t.fileUrl, fileName: t.fileName, fileSize: t.fileSize } : {}),
        ...(t.linkUrl ? { linkUrl: t.linkUrl } : {}),
      },
    ],
  };
}

/** ไฟล์ในชุด (แปลงข้อมูลเก่าให้แล้ว) */
export function templateFiles(t: DesignTemplate): TemplateFile[] {
  return normalizeTemplate(t).files ?? [];
}

/**
 * ที่อยู่ไฟล์ที่ใช้จริง — ไฟล์ในระบบมาก่อน ไม่มีค่อยใช้ลิงก์ภายนอก
 *
 * ⚠️ attribute `download` ของ <a> ใช้ไม่ได้กับไฟล์ข้ามโดเมน (ไฟล์อยู่บน supabase.co)
 * เลยต่อ `?download=<ชื่อไฟล์>` ให้ Supabase ใส่ Content-Disposition มาเอง —
 * ลูกค้าจะได้ไฟล์ชื่อเดิมที่ร้านตั้งไว้ (เช่น "17pro max พรีเมี่ยม.ai")
 * ไม่ใช่ชื่อสุ่มในพาธ และเบราว์เซอร์บันทึกลงเครื่องแทนที่จะเปิดค้างในแท็บ
 */
export function fileHref(f: TemplateFile): string | undefined {
  if (f.fileUrl) return f.fileName ? `${f.fileUrl}?download=${encodeURIComponent(f.fileName)}` : f.fileUrl;
  return f.linkUrl || undefined;
}

/** ไฟล์นี้พร้อมให้โหลดไหม */
export function fileReady(f: TemplateFile): boolean {
  return !!(f.fileUrl || f.linkUrl);
}

/** ชุดนี้พร้อมโชว์บนหน้าสินค้าไหม (ไม่ซ่อน + มีไฟล์ที่โหลดได้อย่างน้อย 1) */
export function templateReady(t: DesignTemplate): boolean {
  return !t.hidden && templateFiles(t).some(fileReady);
}

/**
 * ไฟล์ที่ควรโชว์ให้ลูกค้า ตามตัวเลือกที่เลือกอยู่
 * — ชุดที่ผูกกับกลุ่มตัวเลือก: เอาไฟล์ที่ตรงค่าที่เลือก · ไม่ตรง = ไฟล์กลาง (ไม่ระบุค่า)
 * — ชุดที่ไม่ผูกตัวเลือก: โชว์ทุกไฟล์
 */
export function filesForSelections(
  t: DesignTemplate,
  selections: Record<string, string> = {}
): TemplateFile[] {
  const files = templateFiles(t).filter(fileReady);
  const label = t.optionLabel?.trim();
  if (!label) return files;
  const chosen = (selections[label] ?? "").trim();
  const exact = chosen ? files.filter((f) => (f.choice ?? "").trim() === chosen) : [];
  if (exact.length) return exact;
  // ไม่มีไฟล์ของค่าที่เลือก → ไฟล์กลางที่ไม่ได้ระบุค่า (ถ้ามี)
  return files.filter((f) => !(f.choice ?? "").trim());
}

/** ขนาดไฟล์อ่านง่าย เช่น "12.4 MB" */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** ป้ายกลุ่มของชุดที่ยังไม่ได้ใส่หมวด */
export const NO_CATEGORY = "ยังไม่จัดหมวด";

/** ชื่อหมวดที่ใช้จริงในคลัง (ไม่ซ้ำ เรียงไทย) — ไว้ทำตัวกรอง/ช่องแนะนำ */
export function templateCategories(list: DesignTemplate[]): string[] {
  const set = new Set<string>();
  for (const t of list) {
    const c = t.category?.trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "th"));
}

/** จัดชุดเทมเพลตเป็นกลุ่มตามหมวด (กลุ่ม "ยังไม่จัดหมวด" ไปท้ายสุดเสมอ) */
export function groupByCategory<T extends DesignTemplate>(list: T[]): { category: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const t of list) {
    const key = t.category?.trim() || NO_CATEGORY;
    (map.get(key) ?? map.set(key, []).get(key)!).push(t);
  }
  return [...map.entries()]
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) =>
      a.category === NO_CATEGORY ? 1 : b.category === NO_CATEGORY ? -1 : a.category.localeCompare(b.category, "th")
    );
}

/** เรียงตามลำดับที่แอดมินจัดไว้ (ยังไม่จัด = ต่อท้าย เรียงตามชื่อไทย) */
export function sortTemplates(list: DesignTemplate[]): DesignTemplate[] {
  return [...list].sort(
    (a, b) => (a.sort ?? 9999) - (b.sort ?? 9999) || a.name.localeCompare(b.name, "th")
  );
}

/**
 * เดาว่าไฟล์นี้เป็นของตัวเลือกไหน จากชื่อไฟล์ (ตอนลากไฟล์เข้ามาทีละหลายไฟล์)
 * เทียบแบบตัดช่องว่าง/ขีด/ตัวพิมพ์ เช่น "17pro max พรีเมี่ยม.ai" ↔ "iPhone 17 Pro Max"
 * เดาไม่ออกก็คืนค่าว่าง ให้แอดมินเลือกเอง
 */
export function guessChoice(fileName: string, choices: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, "");
  const f = norm(fileName.replace(/\.[^.]+$/, ""));
  // ตัวที่ยาวที่สุดที่อยู่ในชื่อไฟล์ชนะ (กัน "17" ไปแมตช์ก่อน "17 Pro Max")
  let best = "";
  for (const c of choices) {
    const n = norm(c);
    if (n && f.includes(n) && n.length > norm(best).length) best = c;
  }
  return best;
}
