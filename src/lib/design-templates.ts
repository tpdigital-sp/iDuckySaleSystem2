/**
 * 📐 คลังเทมเพลตไฟล์งาน (Design Templates)
 * — ไฟล์ .ai / .pdf ฯลฯ ที่ลูกค้าโหลดไปวางลายก่อนส่งกลับมาให้ร้านผลิต
 * — อัปครั้งเดียวในคลังกลาง แล้วติ๊กเลือกไปใช้กับสินค้ากี่ตัวก็ได้ (แบบเดียวกับคลังตัวเลือก)
 * — 1 ชุดเทมเพลตมีได้หลายไฟล์ แยกตาม "ตัวเลือกสินค้า" เช่น เคสมือถือ 1 ชุด มีไฟล์ของแต่ละรุ่น
 *   ลูกค้าเลือกรุ่นไหนบนหน้าสินค้า ก็เห็นไฟล์ของรุ่นนั้น
 */

/**
 * 🧩 ช่องใส่รูปบนเทมเพลต (Theme) — ตำแหน่ง/ขนาดเก็บเป็น % ของกรอบงาน (รวมตัดตก)
 *
 * ใช้ % ไม่ใช่มิลลิเมตร เพราะไฟล์เดียวกันอาจมีหลายขนาด และวาดกรอบบนรูปพรีวิวได้ตรงกันเสมอ
 * ลูกค้าจะเห็นเป็นกล่องให้กด "＋ เพิ่มรูป" ทีละช่อง (แบบเดียวกับ photobooth strip)
 */
export interface TemplateSlot {
  id: string;
  /** มุมซ้ายบนของช่อง (% ของความกว้าง/สูงกรอบงาน) */
  xPct: number;
  yPct: number;
  /** ขนาดช่อง (% ของกรอบงาน) */
  wPct: number;
  hPct: number;
  /** ทรงช่อง — วงกลมใช้กับสติกเกอร์กลม/เข็มกลัด (ไม่ระบุ = สี่เหลี่ยม) */
  shape?: "rect" | "circle";
  /** ป้ายกำกับให้ลูกค้าอ่าน เช่น "รูปที่ 1" (ไม่ใส่ = ระบบเรียงเลขให้) */
  label?: string;
}

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
  /**
   * รูปตัวอย่างของไฟล์นี้ (PNG) — เรนเดอร์จากหน้าแรกของ .ai/.pdf ตอนอัป
   * ทำให้เห็นว่าแต่ละรุ่นหน้าตาเป็นยังไงโดยไม่ต้องเปิดไฟล์
   */
  previewUrl?: string;
  /**
   * 👕 สกินสินค้าของไฟล์นี้ (PNG พื้นโปร่งใส) — วางทับลายในจอวางลายของลูกค้า
   * ให้เห็นเป็นสินค้าจริง (ขอบเคส รูกล้อง เงาผ้า ฯลฯ) · เป็นแค่ภาพพรีวิว ไม่ติดไปกับไฟล์พิมพ์
   * ไม่มีค่า = ใช้สกินระดับชุด (DesignTemplate.skinUrl)
   */
  skinUrl?: string;
  /**
   * ขนาดงานจริงของไฟล์นี้ (มม.) — อ่านจากขนาดอาร์ตบอร์ดของ .ai/.pdf ตอนอัปโหลด
   * ใช้เป็นขนาดผืนผ้าใบตอนลูกค้า "วางลายบนเว็บ" (ไม่มีค่า = เดาจากชื่อตัวเลือก)
   */
  widthMm?: number;
  heightMm?: number;
  /** 🧩 ช่องใส่รูปของไฟล์นี้ — ไม่มี = ใช้ของทั้งชุด (DesignTemplate.slots) */
  slots?: TemplateSlot[];
  /**
   * 🔄 ชื่อ "ด้าน" ของไฟล์นี้ เช่น "ด้านหน้า" · "ด้านหลัง"
   * ไฟล์ที่อยู่ตัวเลือกเดียวกัน (choice เท่ากัน) แต่คนละด้าน = งานชิ้นเดียวที่มีหลายด้าน
   * ลูกค้าจะได้กระดานแยกกันคนละแท็บ แต่ยังนับเป็นสินค้าชิ้นเดียว ไม่ใช่คนละลาย
   */
  side?: string;
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
  /**
   * สินค้าที่ใช้เป็นต้นแบบตอนตั้งค่า (ดึงกลุ่มตัวเลือก/รายชื่อค่ามาจากตัวนี้)
   * เก็บไว้ให้กลับมาแก้ทีหลังได้ถูกตัว — ตอนโชว์หน้าร้านยังจับคู่ด้วย "ชื่อกลุ่ม + ค่า"
   * เลยใช้ชุดเดียวกับสินค้าตัวอื่นที่มีกลุ่มตัวเลือกชื่อเดียวกันได้
   */
  optionProductId?: string;
  /** ไฟล์ในชุด (ชุดเก่าที่มีไฟล์เดียวถูกแปลงเข้ามาที่นี่ตอนอ่าน — ดู normalizeTemplate) */
  files?: TemplateFile[];
  /** รูปตัวอย่างของทั้งชุด (PNG/JPG) */
  previewUrl?: string;
  /**
   * 👕 สกินสินค้าของทั้งชุด (PNG พื้นโปร่งใส) — ใช้เมื่อไฟล์ในชุดไม่ได้ตั้งสกินของตัวเอง
   * ดูคำอธิบายที่ TemplateFile.skinUrl
   */
  skinUrl?: string;
  /**
   * ตัดตก (มม.) — ลายต้องเลยขอบงานออกไปเท่านี้ กันขาวขอบเวลาตัด
   * ไม่ตั้ง = ใช้ค่ากลาง DEFAULT_BLEED_MM
   */
  bleedMm?: number;
  /** เขตปลอดภัย (มม.) — ข้อความ/ของสำคัญต้องอยู่ห่างขอบงานเข้ามาเท่านี้ */
  safeMm?: number;
  /**
   * งานพิมพ์รวมแผ่น — 1 แผ่นพิมพ์ได้กี่ชิ้น (เช่น สติกเกอร์วงกลม 4 ดวง/แผ่น)
   * ลูกค้ายังสั่งเป็น "ชิ้น" เหมือนเดิม แต่ใบงานจะสรุปให้ทีมผลิตว่าเท่ากับกี่แผ่น
   * ไม่ตั้ง = งานชิ้นต่อแผ่น ไม่ต้องคิดเรื่องนี้
   */
  perSheet?: number;
  /** 🧩 ช่องใส่รูปของทั้งชุด — ใช้เมื่อไฟล์ในชุดไม่ได้กำหนดช่องของตัวเอง */
  slots?: TemplateSlot[];
  /**
   * บังคับให้ลูกค้าใส่รูปครบทุกช่องก่อนสั่ง
   * ไม่ติ๊ก = เว้นช่องได้ (ช่องที่เว้นเป็นพื้นขาว) — บางงานตั้งใจเว้นจริง ๆ
   */
  slotsRequired?: boolean;
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
 * 👕 สกินสินค้าที่จะวางทับลายในจอวางลาย
 * (เคสมือถือแต่ละรุ่นรูกล้องไม่เหมือนกัน เลยตั้งรายไฟล์ได้ · งานที่หน้าตาเหมือนกันหมดตั้งครั้งเดียวที่ชุด)
 *
 * ลำดับเดียวกับ previewOf(): ของหน้านั้น → หน้าอื่นในชุดที่ขนาดเท่ากัน → หน้าอื่นใด ๆ → ของทั้งชุด
 * หน้าที่แอดมินเพิ่มเองยังไม่มีสกินของตัวเอง — ถ้าไม่ยืมของหน้าพี่น้อง กระดานจะหน้าตาคนละอย่างกับหน้าแรก
 * (หน้าแรกเห็นรูปสินค้าจริง หน้าที่เพิ่มเห็นแค่กรอบเส้นตัด ทั้งที่เป็นงานชิ้นเดียวกัน)
 */
export function skinOf(t: DesignTemplate, f?: TemplateFile): string | undefined {
  if (f?.skinUrl) return f.skinUrl;
  const others = templateFiles(t).filter((x) => x.skinUrl);
  // ยืมของหน้าที่ขนาดเท่ากันก่อน — ขนาดต่างกันแปลว่าเป็นคนละไดคัท เอาสกินมาวางทับจะหลอกตา
  const sameSize =
    f?.widthMm && f?.heightMm
      ? others.find((x) => x.widthMm === f.widthMm && x.heightMm === f.heightMm)
      : undefined;
  return sameSize?.skinUrl || others[0]?.skinUrl || t.skinUrl || undefined;
}

/**
 * 🖼 รูปตัวอย่างที่ใช้เป็น "ไกด์" ใต้กระดานวางลายของหน้านั้น (เส้นตัด/กรอบเขียวของไฟล์งาน)
 *
 * ของหน้านั้นมาก่อน → ไม่มีก็ยืมของหน้าอื่นในชุด (ไดคัทและขนาดเดียวกันอยู่แล้ว) → ท้ายสุดค่อยใช้ของทั้งชุด
 *
 * ⚠️ รูประดับชุดอยู่ท้ายสุดโดยตั้งใจ — เป็นของเก่าที่ค้างมาตั้งแต่ยุคชุดละไฟล์เดียว
 * หายจาก storage ได้ง่าย พอเอามาก่อนแล้วหน้าที่เพิ่มใหม่จะได้กระดานเปล่าไม่มีเส้นไกด์
 */
export function previewOf(t: DesignTemplate, f?: TemplateFile): string | undefined {
  if (f?.previewUrl) return f.previewUrl;
  const others = templateFiles(t).filter((x) => x.previewUrl);
  // ยืมของหน้าที่ขนาดเท่ากันก่อน — ขนาดต่างกันแปลว่าเส้นตัดคนละแบบ เอามาวางทับจะหลอกตา
  const sameSize =
    f?.widthMm && f?.heightMm
      ? others.find((x) => x.widthMm === f.widthMm && x.heightMm === f.heightMm)
      : undefined;
  return sameSize?.previewUrl || others[0]?.previewUrl || t.previewUrl || undefined;
}

/**
 * 🧩 ช่องใส่รูปที่จะใช้จริง — ของไฟล์นั้นมาก่อน ไม่มีค่อยใช้ของทั้งชุด
 * ไม่มีเลย = เทมเพลตธรรมดา (ลูกค้าวางลายเดียวเต็มกรอบเหมือนเดิม)
 */
export function slotsOf(t: DesignTemplate, f?: TemplateFile): TemplateSlot[] {
  const list = f?.slots?.length ? f.slots : (t.slots ?? []);
  return list.filter((s) => s.wPct > 0 && s.hPct > 0);
}

/**
 * สร้างช่องเป็นตาราง cols × rows — ใช้กับงานรวมแผ่น (สติกเกอร์ 4 ดวง/แผ่น ฯลฯ)
 * ทุกค่าเป็น % ของกรอบงาน · ขอบ = ระยะจากขอบกระดาษ · ช่องไฟ = ระยะระหว่างช่อง
 */
export function gridSlots(
  cols: number,
  rows: number,
  o: { marginPct?: number; gapPct?: number; shape?: "rect" | "circle" } = {},
): TemplateSlot[] {
  const m = Math.max(0, o.marginPct ?? 5);
  const g = Math.max(0, o.gapPct ?? 4);
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  const w = (100 - m * 2 - g * (c - 1)) / c;
  const h = (100 - m * 2 - g * (r - 1)) / r;
  if (w <= 0 || h <= 0) return [];
  const out: TemplateSlot[] = [];
  const n = (v: number) => Math.round(v * 100) / 100;
  for (let y = 0; y < r; y++)
    for (let x = 0; x < c; x++)
      out.push({
        id: `sl-${y}-${x}-${Math.random().toString(36).slice(2, 7)}`,
        xPct: n(m + x * (w + g)),
        yPct: n(m + y * (h + g)),
        wPct: n(w),
        hPct: n(h),
        ...(o.shape === "circle" ? { shape: "circle" as const } : {}),
      });
  return out;
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
 *
 * o.includeEmpty = เอาไฟล์ที่ยังไม่ได้อัป .ai มาด้วย
 *   ใช้กับ "จอออกแบบบนเว็บ" เท่านั้น — ด้านหลังของงานสกรีน 2 ด้านมักไม่มีไฟล์ .ai ของตัวเอง
 *   (แอดมินตั้งขนาด+ช่องไว้พอแล้ว) ถ้ากรองทิ้งเหมือนลิสต์ดาวน์โหลด หน้าที่แยกไว้จะหายเงียบ ๆ
 */
export function filesForSelections(
  t: DesignTemplate,
  selections: Record<string, string> = {},
  o: { includeEmpty?: boolean } = {}
): TemplateFile[] {
  const files = o.includeEmpty ? templateFiles(t) : templateFiles(t).filter(fileReady);
  const label = t.optionLabel?.trim();
  if (!label) return files;
  const chosen = (selections[label] ?? "").trim();
  const exact = chosen ? files.filter((f) => (f.choice ?? "").trim() === chosen) : [];
  if (exact.length) return exact;
  // ไม่มีไฟล์ของค่าที่เลือก → ไฟล์กลางที่ไม่ได้ระบุค่า (ถ้ามี)
  return files.filter((f) => !(f.choice ?? "").trim());
}

/**
 * ชื่อด้านของไฟล์ (ไม่ตั้ง = ไม่ใช่งานหลายด้าน)
 * ใช้ตัดสินว่าไฟล์ที่ได้จาก filesForSelections เป็น "หลายด้านของชิ้นเดียว" หรือแค่ไฟล์เดียว
 */
export function sideName(f: TemplateFile, i: number, total: number): string {
  const s = f.side?.trim();
  if (s) return s;
  // ไม่ตั้งชื่อ = เรียกกลาง ๆ ว่า "หน้า N" — ชุดหลายไฟล์ไม่ได้แปลว่าเป็นงานหน้า-หลังเสมอไป
  return total > 1 ? `หน้า ${i + 1}` : "";
}

/**
 * งานนี้เป็น "หลายหน้าของชิ้นเดียวกัน" ไหม
 *
 * ไฟล์ที่ส่งเข้ามาคือผลจาก filesForSelections แล้ว = ไฟล์ของค่าตัวเลือกที่ลูกค้าเลือกอยู่
 * เหลือมากกว่าหนึ่งไฟล์ในค่าตัวเลือกเดียวกัน = คนละหน้าของชิ้นเดียวกัน (ไม่ใช่ตัวเลือกให้เลือกอย่างใดอย่างหนึ่ง)
 *
 * ⚠️ ห้ามใช้ "มีชื่อด้านไหม" เป็นเงื่อนไข — หน้าที่แอดมินเพิ่มเองไม่ต้องตั้งชื่อก็ได้ (เรียกว่า "หน้า N")
 * เคยเช็คแบบนั้นแล้วหน้าที่เพิ่มมาหายไปจากจอออกแบบทั้งหมด
 */
export function isMultiSide(files: TemplateFile[]): boolean {
  if (files.length < 2) return false;
  if (files.some((f) => !!f.side?.trim())) return true;
  const choice = (f: TemplateFile) => (f.choice ?? "").trim();
  return files.every((f) => choice(f) === choice(files[0]));
}

// ══════════ ขนาดงานจริง (มม.) — ใช้ตอนลูกค้าวางลายบนเว็บ ══════════

/** ตัดตก/เขตปลอดภัยมาตรฐานของร้าน (มม.) เมื่อชุดนั้นไม่ได้ตั้งค่าไว้เอง */
export const DEFAULT_BLEED_MM = 3;
export const DEFAULT_SAFE_MM = 3;

export interface SizeMm {
  widthMm: number;
  heightMm: number;
}

/**
 * อ่านขนาดจากข้อความ เช่น "30x60cm" · "18 x 21 ซม." · "600x300 mm" · "MousePad 40x90"
 * ไม่ระบุหน่วย = เซนติเมตร (ค่าที่ร้านใช้ในชื่อตัวเลือกทั้งหมด)
 * คืน null เมื่อหาเลขคู่ไม่เจอ
 */
export function parseSizeMm(text?: string): SizeMm | null {
  if (!text) return null;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|มม\.?|cm|ซม\.?|นิ้ว|in(?:ch)?)?/i);
  if (!m) return null;
  const a = parseFloat(m[1].replace(",", "."));
  const b = parseFloat(m[2].replace(",", "."));
  if (!(a > 0) || !(b > 0)) return null;
  const unit = (m[3] ?? "").toLowerCase();
  const k = /^(mm|มม)/.test(unit) ? 1 : /^(in|นิ้ว)/.test(unit) ? 25.4 : 10;
  return { widthMm: a * k, heightMm: b * k };
}

/**
 * กรอบงานสำหรับจอวางลาย — ทุกค่าเป็นมิลลิเมตรของงานจริง
 *
 * ⚠️ อาร์ตบอร์ดของไฟล์ .ai ที่ร้านทำไว้ "รวมตัดตกมาแล้ว"
 * (เช่น แผ่นรองเมาส์ 60×30 ซม. อาร์ตบอร์ดจริง 610×310 มม. = เผื่อด้านละ 5 มม.)
 * เลยยึดอาร์ตบอร์ดเป็นผืนผ้าใบทั้งผืน แล้วถอยเข้ามาเป็นเส้นตัด — ไม่ใช่เอาตัดตกไปบวกเพิ่มอีก
 */
export interface TemplateFrame {
  /** ผืนผ้าใบทั้งผืน (รวมตัดตก) — ลายต้องคลุมเต็มขนาดนี้ */
  canvasWMm: number;
  canvasHMm: number;
  /** ตัดตกซ้าย-ขวา / บน-ล่าง (บางไฟล์เผื่อไม่เท่ากันสองแกน) */
  bleedXMm: number;
  bleedYMm: number;
  /** ขนาดงานจริงหลังตัด */
  trimWMm: number;
  trimHMm: number;
  /** เขตปลอดภัย นับเข้ามาจากเส้นตัด */
  safeMm: number;
  /** ขนาดมาจากอาร์ตบอร์ดจริงของไฟล์ (ไม่ได้เดาจากชื่อ) */
  fromFile: boolean;
}

/**
 * ชื่อบรรทัดที่ติดไปกับรายการในตะกร้า/ออเดอร์เมื่อลูกค้าวางลายบนเว็บ
 * — PLACEMENT_LABEL: สรุปให้ลูกค้าอ่าน
 * — PLACEMENT_SPEC_LABEL: ตัวเลขให้ทีมผลิตวางในไฟล์จริง (ซ่อนจากบรรทัดสรุปในตะกร้า แต่ยังไปถึงออเดอร์)
 */
export const PLACEMENT_LABEL = "วางบนเทมเพลต";
export const PLACEMENT_SPEC_LABEL = "ตำแหน่งลาย (ทีมผลิต)";

/**
 * โทเคนขนาดกรอบงานที่ต่อท้ายบรรทัดของทีมผลิต เช่น "[ai:230x190]"
 * หลังบ้านอ่านค่านี้ไปตั้งขนาดหน้าไฟล์ .ai ให้ตรงงานจริงตอนกดดาวน์โหลด
 */
export function printFrameToken(
  widthMm: number,
  heightMm: number,
  tplUrl?: string,
  perSheet?: number,
): string {
  const n = (v: number) => Math.round(v * 10) / 10;
  // จดที่อยู่ไฟล์เทมเพลต + จำนวนชิ้นต่อแผ่นติดไปกับออเดอร์
  // (ค่าพวกนี้อาจถูกแก้ในคลังทีหลัง — เก็บไว้ตอนสั่งจึงตรงกับที่ลูกค้าเห็นจริง)
  return (
    `[ai:${n(widthMm)}x${n(heightMm)}` +
    `${tplUrl ? `|tpl:${tplUrl}` : ""}` +
    `${perSheet && perSheet > 1 ? `|sheet:${Math.round(perSheet)}` : ""}]`
  );
}

/** อ่านขนาดกรอบงานกลับจากบรรทัดของทีมผลิต — ไม่มีโทเคน = ออเดอร์เก่าที่ยังไม่ได้วางลายบนเว็บ */
export function parsePrintFrame(text?: string): (SizeMm & { tplUrl?: string; perSheet?: number }) | null {
  const m = (text ?? "").match(
    /\[ai:(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:\|tpl:([^\]\s|]+))?(?:\|sheet:(\d+))?\]/,
  );
  if (!m) return null;
  const widthMm = parseFloat(m[1]);
  const heightMm = parseFloat(m[2]);
  if (!(widthMm > 0 && heightMm > 0)) return null;
  const perSheet = m[4] ? parseInt(m[4], 10) : undefined;
  return {
    widthMm,
    heightMm,
    ...(m[3] ? { tplUrl: m[3] } : {}),
    ...(perSheet && perSheet > 1 ? { perSheet } : {}),
  };
}

/** จำนวนแผ่นที่ต้องพิมพ์ เมื่อ 1 แผ่นได้ perSheet ชิ้น (เศษปัดขึ้น = ต้องใช้อีกแผ่น) */
export function sheetsFor(pieces: number, perSheet?: number): number | null {
  if (!perSheet || perSheet < 2 || pieces < 1) return null;
  return Math.ceil(pieces / perSheet);
}

/** ตัดตกที่ยอมรับว่า "สมเหตุสมผล" ตอนถอดจากส่วนต่างอาร์ตบอร์ด−ขนาดงาน */
const MAX_DERIVED_BLEED_MM = 25;

/**
 * กรอบงานที่จะใช้เป็นผืนผ้าใบ — ไล่จากแม่นสุดไปเดาสุด
 * ① อาร์ตบอร์ดจริงของไฟล์ (ถอดตัดตกจากส่วนต่างกับขนาดที่ลูกค้าเลือก)
 * ② ชื่อตัวเลือกที่ลูกค้าเลือก เช่น "30x60cm" (บวกตัดตกมาตรฐานเข้าไปเอง)
 * ③ ชื่อไฟล์ / ชื่อชุด
 * เดาไม่ออกคืน null → หน้าสินค้าไม่ต้องขึ้นปุ่มวางลาย
 */
export function templateFrame(t: DesignTemplate, f?: TemplateFile, choice?: string): TemplateFrame | null {
  const safeMm = t.safeMm ?? DEFAULT_SAFE_MM;
  const setBleed = t.bleedMm ?? DEFAULT_BLEED_MM;
  /** ขนาดงานจริงตามชื่อ (ยังไม่รู้ว่าด้านไหนกว้าง) */
  const named = parseSizeMm(choice) ?? parseSizeMm(f?.fileName) ?? parseSizeMm(t.name);

  if (f?.widthMm && f?.heightMm) {
    const canvasWMm = f.widthMm;
    const canvasHMm = f.heightMm;
    // จับคู่ชื่อขนาดกับแนวของอาร์ตบอร์ด (ชื่อ "30x60" ไม่ได้บอกว่าด้านไหนกว้าง)
    let trimWMm = 0;
    let trimHMm = 0;
    if (named) {
      const a = { w: named.widthMm, h: named.heightMm };
      const b = { w: named.heightMm, h: named.widthMm };
      const fitScore = (s: { w: number; h: number }) =>
        Math.abs(canvasWMm - s.w) + Math.abs(canvasHMm - s.h);
      const best = fitScore(a) <= fitScore(b) ? a : b;
      const bx = (canvasWMm - best.w) / 2;
      const by = (canvasHMm - best.h) / 2;
      if (bx >= 0 && by >= 0 && bx <= MAX_DERIVED_BLEED_MM && by <= MAX_DERIVED_BLEED_MM) {
        trimWMm = best.w;
        trimHMm = best.h;
      }
    }
    if (!trimWMm) {
      // ถอดไม่ได้ → ใช้ตัดตกที่ตั้งไว้ในชุด (แต่ไม่ให้ติดลบถ้าอาร์ตบอร์ดเล็กมาก)
      const bx = Math.min(setBleed, canvasWMm / 4);
      const by = Math.min(setBleed, canvasHMm / 4);
      trimWMm = canvasWMm - bx * 2;
      trimHMm = canvasHMm - by * 2;
    }
    return {
      canvasWMm,
      canvasHMm,
      bleedXMm: Math.round(((canvasWMm - trimWMm) / 2) * 10) / 10,
      bleedYMm: Math.round(((canvasHMm - trimHMm) / 2) * 10) / 10,
      trimWMm,
      trimHMm,
      safeMm,
      fromFile: true,
    };
  }

  if (!named) return null;
  return {
    canvasWMm: named.widthMm + setBleed * 2,
    canvasHMm: named.heightMm + setBleed * 2,
    bleedXMm: setBleed,
    bleedYMm: setBleed,
    trimWMm: named.widthMm,
    trimHMm: named.heightMm,
    safeMm,
    fromFile: false,
  };
}

/** ขนาดอ่านง่ายเป็นเซนติเมตร เช่น "60 × 30 ซม." */
export function formatSizeCm(s: SizeMm): string {
  const n = (v: number) => (Math.round(v / 10 * 10) / 10).toString().replace(/\.0$/, "");
  return `${n(s.widthMm)} × ${n(s.heightMm)} ซม.`;
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
