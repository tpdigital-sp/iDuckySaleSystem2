/**
 * เทียบชื่อ SKU กับชื่อตัวเลือกสินค้า — ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์ (หาคู่ที่น่าจะใช่) และหน้าจอ
 * ตัดสิ่งที่คนพิมพ์ต่างกันแต่หมายถึงของเดียวกัน: ช่องว่าง วรรณยุกต์ วงเล็บ หน่วย มม./mm ซม./cm
 *   "กระจกทรงกลม (ขนาด 58mm)" == "กระจกทรงกลม (ขนาด 58 มม.)"
 */
export function normName(s: string | undefined | null): string {
  return String(s || "")
    .toLowerCase()
    .replace(/เเ/g, "แ")
    .replace(/มม\.?/g, "mm")
    .replace(/ซม\.?/g, "cm")
    .replace(/[×*]/g, "x")
    .replace(/[็่้๊๋์]/g, "")
    .replace(/[\s()[\]{}"'“”.,:;·\-_/]/g, "");
}

/** "PL-MIRROR-1YE24T9" → "MIRROR" (หน้าตารางราคาที่ SKU ตัวนี้มาจาก) · รหัสแบบอื่น = "" */
export function skuPage(code: string | undefined): string {
  const m = /^PL-([A-Z0-9]+)-/.exec(code ?? "");
  return m && m[1] !== "X" ? m[1] : "";
}

/** ขายอะไรแล้วตัด SKU ตัวนี้ — ห้ามย้ายไปไว้ในไฟล์ route (Next ให้ export ได้เฉพาะ GET/POST ฯลฯ) */
export type StockUsage =
  | {
      kind: "product";
      productId: string;
      productName: string;
      img?: string;
      draft?: boolean;
      /** รหัสสินค้าที่ผูกไว้ไม่มีในระบบแล้ว (ถูกลบ/เปลี่ยนรหัส) = ลิงก์ตาย ขายแล้วไม่ตัดยอด */
      missing?: boolean;
      /** วัสดุแฝง (bomFor) — ไม่มีในตัวเลือก ตัดทุกชิ้น × per */
      bom?: boolean;
      per?: number;
    }
  | {
      kind: "choice";
      productId: string;
      productName: string;
      img?: string;
      draft?: boolean;
      label: string;
      optionIndex: number;
      choice: string;
      per: number;
      /** ผูกแบบมีเงื่อนไข (choice.stockLinks) — ตัดเฉพาะเมื่อกลุ่มอื่นตรงเงื่อนไข · cond = ข้อความเงื่อนไขไว้โชว์ */
      extra?: boolean;
      cond?: string;
    }
  | { kind: "preset"; presetId: string; label: string; choice: string; per: number; img?: string; usedBy: number; usedByNames: string[] };

export type StockSuggest =
  | { kind: "choice"; productId: string; productName: string; img?: string; label: string; optionIndex: number; choice: string }
  | { kind: "preset"; presetId: string; label: string; choice: string; img?: string; usedBy: number };

