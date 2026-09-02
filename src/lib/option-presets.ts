/**
 * คลังตัวเลือกกลาง (Option Presets)
 * — กลุ่มตัวเลือกที่ใช้ซ้ำได้หลายสินค้า เช่น "ชนิดกระดาษ", "เคลือบ"
 * — สินค้า "ลิงก์" กับคลังผ่าน ProductOption.presetId · แก้คลังที่เดียว สินค้าที่ลิงก์อัปเดตตาม
 * — ต้องการต่างเฉพาะตัว → กด "ปรับเฉพาะตัว" ในหน้าแก้ไขสินค้า (ตัดลิงก์เป็นสำเนาอิสระ)
 */
import type { ProductOption, ProductOptionChoice } from "./products";

export interface OptionPreset {
  id: string;
  label: string;
  choices: ProductOptionChoice[];
  /** คำอธิบายสั้น ๆ (ไม่บังคับ) — ช่วยจำว่าใช้กับสินค้าแบบไหน */
  note?: string;
  /** ลำดับในลิสต์หลังบ้าน (ลากจัดเองได้) — ไม่ตั้ง = ไปต่อท้าย เรียงตามชื่อ */
  sort?: number;
  /** ปิดใช้งาน — ไม่ให้เลือกแทรกในสินค้าใหม่ (สินค้าที่ลิงก์ไว้แล้วยังใช้ได้ตามเดิม) */
  hidden?: boolean;
}

/**
 * คลังตั้งต้น (seed) — ดึงจากตัวเลือกจริงที่ใช้ซ้ำในกลุ่มงานกระดาษ
 * ผู้ใช้แก้/เพิ่ม/ลบได้จากหน้า /admin/options (บันทึกทับลงฐานข้อมูล/เบราว์เซอร์)
 */
export const DEFAULT_PRESETS: OptionPreset[] = [
  {
    id: "paper-type",
    label: "ชนิดกระดาษ",
    note: "กระดาษมาตรฐานงานโปสการ์ด (7 ชนิด)",
    choices: [
      { name: "กระดาษอาร์ตมัน 300 แกรม" },
      { name: "Canvas Paper 260 แกรม" },
      { name: "100 Pound Paper (หนา 300gsm)" },
      { name: "E-Photo Paper 290 แกรม" },
      { name: "Stardream Crystal Paper 285 แกรม" },
      { name: "Stardream Paper 285 แกรม" },
      { name: "Extra Paper 260 แกรม" },
    ],
  },
  {
    id: "coating-front",
    label: "เคลือบ (เฉพาะด้านหน้า)",
    note: "การเคลือบผิวหน้า รวมโฮโลแกรม",
    choices: [
      { name: "ไม่เคลือบ" },
      { name: "เคลือบด้าน" },
      { name: "เคลือบเงา" },
      { name: "Dot Hologram" },
      { name: "Crack Glass Hologram" },
      { name: "Rainbow Hologram" },
    ],
  },
];

/**
 * คลี่ตัวเลือกของสินค้าให้เป็นค่าจริง — กลุ่มที่ลิงก์คลัง (presetId) จะถูกแทน label+choices
 * ด้วยของในคลังปัจจุบัน · ถ้าหาคลังไม่เจอ (ถูกลบ) จะใช้สำเนาสำรองที่เก็บในสินค้าแทน
 * ทุกฝั่งที่ "อ่าน" ตัวเลือก (หน้าร้าน/ตะกร้า/ราคา) ควรได้ค่าที่ผ่าน resolve แล้ว
 */
export function resolveOptions(
  options: ProductOption[],
  presets: OptionPreset[]
): ProductOption[] {
  /**
   * ชื่อกลุ่มที่ "ไม่ได้ลิงก์คลัง" — กลุ่มพวกนี้เปลี่ยนชื่อไม่ได้ ถือเป็นเจ้าของชื่อนั้น
   * ใช้กันเคสชื่อคลังไปชนกับชื่อกลุ่มของสินค้าเอง (ดูหมายเหตุด้านล่าง)
   */
  const ownNames = new Set(options.filter((o) => !o.presetId).map((o) => o.label));
  return options
    .map((o) => {
      if (!o.presetId) return o;
      const preset = presets.find((p) => p.id === o.presetId);
      if (!preset) return o; // คลังหาย → ใช้สำเนาสำรองในสินค้า
      // คลังถูก "ปิดใช้งาน" ที่หน้าคลังตัวเลือก = เลิกใช้แล้ว → ไม่ต้องโชว์/ไม่คิดเงินบนหน้าร้าน
      // (ลิงก์ยังอยู่ในสินค้า หน้าแก้ไขยังเห็นและเปิดกลับได้ที่ /admin/options)
      if (preset.hidden) return null;
      /**
       * ⚠️ ชื่อคลังชนกับกลุ่มอื่นของสินค้า = สองกลุ่มใช้ค่าที่เลือกช่องเดียวกัน (selections คีย์ด้วย label)
       * ผลคือกลุ่มที่ลิงก์คลังเลือกอะไรไม่ได้เลย และกฎ/showWhen ที่อ้างชื่อเดิมก็ไม่ทำงาน
       * กรณีนี้คงชื่อเดิมของสินค้าไว้ ดีกว่าปล่อยให้กลุ่มพัง (ตัวเลือกยังมาจากคลังตามปกติ)
       */
      const label = ownNames.has(preset.label) ? o.label : preset.label;
      return { ...o, label, choices: preset.choices };
    })
    .filter((o): o is ProductOption => o !== null);
}

/** สร้างกลุ่มตัวเลือกแบบ "ลิงก์คลัง" จาก preset (เก็บ snapshot ไว้เป็นสำรอง) */
export function linkedOptionFromPreset(preset: OptionPreset): ProductOption {
  return { label: preset.label, choices: preset.choices, presetId: preset.id };
}

/** slug ปลอดภัยจากชื่อไทย/อังกฤษ — ถ้าถอดไม่ได้ (ไทยล้วน) จะได้ค่าว่าง ให้ผู้เรียกเติม fallback */
export function slugifyPreset(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
