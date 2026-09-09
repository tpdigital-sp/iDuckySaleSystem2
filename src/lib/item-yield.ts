import { orderUnitYield, unitYieldOf, type Product } from "./products";
import { orderPiecesPerUnit } from "./admin-data";
import { parseSpecText } from "./spec-text";

/** "สั่ง 1 หน่วย ได้กี่ชิ้น" แบบที่แช่อยู่ในรายการ (ดู OrderItem.unitYield) */
export type ItemUnitYield = { per: number; piece: string; unit: string };

/** ฟิลด์ของรายการที่ตัวช่วยชุดนี้ใช้ — รับได้ทั้ง OrderItem (ออเดอร์/ใบเสนอราคา) และของที่ส่งมาจากตะกร้า */
export interface YieldItem {
  productId?: string;
  selections?: string;
  sel?: Record<string, string>;
  qty: number;
  unitYield?: ItemUnitYield;
}

/**
 * ตัวเลือกแบบมีโครงสร้างของรายการ — ไม่มี (ใบเสนอราคาเก่า/ออเดอร์เก่าเก็บแต่ข้อความ) ก็กางจากข้อความ
 * "ขนาดตัด: A4 · เรทราคา: ปกติ" → { ขนาดตัด: "A4", เรทราคา: "ปกติ" } ให้ orderUnitYield อ่านตัวเลือกได้
 */
export function itemSel(item: Pick<YieldItem, "sel" | "selections">): Record<string, string> {
  if (item.sel && Object.keys(item.sel).length) return item.sel;
  return Object.fromEntries(parseSpecText(item.selections ?? "").filter(([k]) => k));
}

/**
 * ตัวคูณของรายการ เรียงตามความน่าเชื่อถือ:
 *  1) ค่าที่แช่ไว้ตอนสั่ง (item.unitYield) — ตัวเลขวันที่สั่ง ไม่ขยับตามที่ร้านแก้สินค้าทีหลัง
 *  2) อ่านสดจากสินค้า (มีสินค้ามาให้) — ใบเก่าที่ยังไม่ได้แช่
 *  3) เดาจากข้อความ "(20 ใบ/เซ็ต)" ในสเปค — ตัวสำรองสุดท้าย
 * null = นับเป็นชิ้นตรง ๆ
 */
export function itemUnitYield(item: YieldItem, product?: Product | null): ItemUnitYield | null {
  if (item.unitYield?.per) return item.unitYield;
  if (product) {
    const y = orderUnitYield(product, itemSel(item));
    if (y) return y;
  }
  return orderPiecesPerUnit(item);
}

/**
 * บรรทัดสรุปจำนวนชิ้นจริงให้ลูกค้า/แอดมินอ่าน — ประโยคเดียวจบเหมือนในตะกร้า (เจ้าของร้านสั่ง "แจ้งแค่จุดเดียว")
 *   "📐 สั่ง 2 แผ่น A3 (ขนาดตัด A4) ได้ 4 ชิ้น" · ขนาดที่กรอกเอง = "ได้ประมาณ"
 * "" = งานนับเป็นชิ้นอยู่แล้ว (per ≤ 1) ไม่ต้องโชว์
 * ⚠️ ต่อสตริงทั้งบรรทัดใน template เดียว — JSX ตัดช่องว่างระหว่าง expression เคยได้ "ได้2 ชิ้น"
 */
export function itemPiecesLine(item: YieldItem, product?: Product | null): string {
  const y = itemUnitYield(item, product);
  if (!y || y.per <= 1 || !(item.qty > 0)) return "";
  // ห้อยขนาดที่นับไว้ในวงเล็บเมื่อรู้สินค้าและตัวเลขตรงกัน (เลขจากชื่อหน่วย/ชื่อตัวเลือกไม่มีขนาดให้ห้อย)
  let size = "";
  let approx = false;
  if (product) {
    const c = unitYieldOf(product, itemSel(item));
    if (c && c.per === y.per) {
      size = ` (${c.label} ${c.size})`;
      approx = c.approx;
    }
  }
  const total = item.qty * y.per;
  return `📐 สั่ง ${item.qty.toLocaleString("th-TH")} ${y.unit || "หน่วย"}${size} ได้${approx ? "ประมาณ" : ""} ${total.toLocaleString("th-TH")} ${y.piece}`;
}
