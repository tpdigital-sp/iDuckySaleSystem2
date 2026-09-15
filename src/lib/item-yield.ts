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
  /*
   * ⚠️ per 1 ที่แช่ไว้ไม่ใช่ "ตัวคูณของวันที่สั่ง" แต่แปลว่า "รู้แค่ว่าขายเป็นเซ็ต ยังไม่รู้ว่าเซ็ตละกี่ชิ้น"
   * (ดู orderUnitYield ตอนจบ) — ใบพวกนี้อ่านจากสินค้าวันนี้ได้เลย ดีกว่าปล่อยให้กราฟฟิกมานั่งคูณเอง
   * ตัวคูณจริง (per > 1) ยังชนะเสมอ ร้านแก้ตารางทีหลังก็ไม่ขยับ (ดู stale-unit-yield-scan.mts)
   */
  const frozen = item.unitYield?.per ? item.unitYield : null;
  if (frozen && frozen.per > 1) return frozen;
  if (product) {
    const y = orderUnitYield(product, itemSel(item));
    if (y && (y.per > 1 || !frozen)) return y;
  }
  return frozen ?? orderPiecesPerUnit(item);
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
  // 📏 งานกรอกด้านยาวสุดด้านเดียว — ห้อย "กราฟฟิกแจ้งจำนวนที่ได้จริงตอนส่งแบบ" ทุกจอ (เจ้าของร้านสั่ง 10 ก.ย. 69)
  let note = "";
  if (product) {
    const c = unitYieldOf(product, itemSel(item));
    if (c && c.per === y.per) {
      size = ` (${c.label} ${c.size})`;
      approx = c.approx;
      note = c.note ? ` · ${c.note}` : "";
    }
  }
  const total = item.qty * y.per;
  return `📐 สั่ง ${item.qty.toLocaleString("th-TH")} ${y.unit || "หน่วย"}${size} ได้${approx ? "ประมาณ" : ""} ${total.toLocaleString("th-TH")} ${y.piece}${note}`;
}

/**
 * 🔢 จำนวนของรายการเดียวแบบสั้น ใช้ในตาราง/ป้าย/แถวคิว — "17 เซ็ต · 102 ชิ้น" · งานนับเป็นชิ้น = "17 ชิ้น"
 * ต่างจาก itemPiecesLine ตรงที่ไม่มีคำว่า "สั่ง…ได้…" และไม่ห้อยขนาด — ที่แคบ ๆ เอาแค่ตัวเลขกับหน่วย
 * ⛔ ห้ามเขียน "ชิ้น" ตายตัวต่อท้าย item.qty เองอีก — จำนวนที่สั่งของงานเซ็ต/แผ่นไม่ใช่จำนวนชิ้น
 */
export function itemQtyText(item: YieldItem, product?: Product | null): string {
  const n = item.qty.toLocaleString("th-TH");
  const y = itemUnitYield(item, product);
  if (!y) return `${n} ชิ้น`;
  const unit = y.unit || "ชิ้น";
  if (y.per <= 1) return `${n} ${unit}`;
  return `${n} ${unit} · ${(item.qty * y.per).toLocaleString("th-TH")} ${y.piece}`;
}

/**
 * 🔢 จำนวนรวมทั้งใบ — "17 เซ็ต · 102 ชิ้น" · หลายรายการคนละหน่วยรวมเป็น "17 หน่วย · 102 ชิ้น"
 * ใช้กับแถวคิว/ท้ายใบงานที่เดิมเขียน "N ชิ้น" จากผลบวก qty ดิบ (งานเซ็ต/แผ่นเลยบอกจำนวนผิด)
 */
export function orderQtyText(items: YieldItem[], productOf?: (id: string) => Product | null | undefined): string {
  let units = 0;
  let pieces = 0;
  const unitWords = new Set<string>();
  const pieceWords = new Set<string>();
  for (const it of items) {
    const y = itemUnitYield(it, productOf?.(it.productId ?? ""));
    units += it.qty;
    pieces += it.qty * Math.max(1, y?.per ?? 1);
    unitWords.add(y?.unit || "ชิ้น");
    pieceWords.add(y?.piece || "ชิ้น");
  }
  const unit = unitWords.size === 1 ? [...unitWords][0] : "หน่วย";
  const piece = pieceWords.size === 1 ? [...pieceWords][0] : "ชิ้น";
  const n = units.toLocaleString("th-TH");
  if (pieces <= units) return `${n} ${unit}`;
  return `${n} ${unit} · ${pieces.toLocaleString("th-TH")} ${piece}`;
}
