import {
  MTO_LABEL,
  MTO_ON,
  RATE_LABEL,
  isInputOption,
  isMultiOption,
  optionVisible,
  type Product,
} from "./products";

/** ช่องว่างที่ต้องเติมเอง (ช่องกรอก เช่น ขนาดงานสั่งทำ) — แอดมินพิมพ์ค่าจริงทับได้เลย */
const BLANK = "____";

/**
 * 📝 สเปคตั้งต้นของ "สินค้าในเว็บ" — บรรทัดละกลุ่มตัวเลือก ตามค่าเริ่มต้นเดียวกับหน้าสินค้า
 *
 * ใช้ตอนแอดมินเลือกสินค้าจากช่อง "เลือกสินค้าจากหน้าเว็บ" ในตัวเพิ่มรายการ — เดิมเติมให้แค่
 * ชื่อ/ราคา ช่องสเปคจึงค้างข้อความของรายการก่อนหน้าไว้ (สเปคไม่ตรงสินค้าที่เลือก)
 *
 *   • กลุ่มที่ถูกซ่อนด้วย showWhen ตามค่าที่เลือกไว้ = ไม่ขึ้นบรรทัด (เหมือนหน้าร้านที่ไม่โชว์)
 *   • กลุ่มติ๊กหลายอย่าง (ของเสริม) = ยังไม่ติ๊กอะไร จึงไม่ขึ้นบรรทัด
 *   • ช่องกรอก (ขนาดสั่งทำ) = ขึ้นบรรทัดพร้อมช่องว่างให้เติม
 *
 * เป็นแค่ "ตั้งต้นให้แก้" — ตัวเลือกครบ ๆ พร้อมราคาขั้นบันไดต้องหยิบจากหน้าร้าน
 */
export function defaultSpecText(p: Product): string {
  const sel: Record<string, string> = {};
  const lines: string[] = [];
  const push = (label: string, value: string) => lines.push(`- ${label}: ${value}`);

  // เรทราคา (ถ้ามี) มาก่อนเสมอ — หลายกลุ่มโชว์/ซ่อนตามเรทที่เลือก
  const rate = p.priceRates?.[0];
  if (rate?.label) {
    sel[RATE_LABEL] = rate.label;
    push(RATE_LABEL, rate.label);
  }
  if (p.mtoAlways) sel[MTO_LABEL] = MTO_ON;

  for (const o of p.options ?? []) {
    if (!o?.label || !optionVisible(o, sel)) continue;
    if (isInputOption(o)) {
      const unit = o.input?.unit?.trim();
      sel[o.label] = ""; // ยังไม่มีค่า — กลุ่มที่รอค่านี้อยู่จะได้ซ่อนเหมือนหน้าร้าน
      push(o.label, unit ? `${BLANK} ${unit}` : BLANK);
      continue;
    }
    if (isMultiOption(o)) {
      sel[o.label] = ""; // ของเสริมเริ่มที่ยังไม่ติ๊ก (ไม่บวกเงินให้เอง)
      continue;
    }
    // ค่าเริ่มต้นตามกลุ่มคุม (defaultBy) ถ้าตั้งไว้และค่าที่ map ยังมีอยู่จริง
    const byCtrl = o.defaultBy ? o.defaultBy.map[sel[o.defaultBy.label] ?? ""] : undefined;
    const value = (byCtrl && o.choices?.some((c) => c.name === byCtrl) ? byCtrl : o.choices?.[0]?.name) ?? "";
    if (!value) continue;
    sel[o.label] = value;
    push(o.label, value);
  }
  return lines.join("\n");
}
