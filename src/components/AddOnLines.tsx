"use client";
/**
 * 🧾 บรรทัดย่อยของ Add on "ระบุว่าเพิ่มค่าอะไร กี่บาท" — ชุดเดียวกับ "Add on = …" ใต้ราคาบนหน้าสินค้า
 * เจ้าของร้าน 29 ก.ย. 69 (OD-260924-2339): แถว "🎨 Add on — … (ค่าคละลาย (ด้านหน้า) · คละ 3 ลาย + ค่าคละลาย (ด้านหลัง) · คละ 3 ลาย) +฿20"
 * อ่านไม่ออกว่าด้านไหนกี่บาท → วาดเป็นบรรทัดละค่า "ค่าคละลาย (ด้านหน้า) +฿10 · คละ 3 ลาย"
 *
 * แหล่งข้อมูล (ตามลำดับ): OrderItem.addOnLines (ใบใหม่) → ถอดจากชื่อบรรทัด → ใบเก่าที่มีหลายค่าแต่ไม่รู้ยอดแยก
 * ลองคิดใหม่จากรายการแม่ (feeBreakdown ของสินค้า+ตัวเลือก+จำนวนแม่) ถ้าผลรวมเท่ายอดบรรทัดจึงเชื่อ ไม่เท่า = โชว์แค่ชื่อค่า
 * ใช้ในหน้าออเดอร์ลูกค้า + หลังบ้าน (แถวย่อย "└ รวมในรายการที่ N")
 */
import { addOnLinesOf, itemDiscountAmount, type AddOnLineView, type OrderItem } from "@/lib/admin-data";
import { activeMatrix, feeBreakdown, formatPrice, unitPriceParts, type Product, type UnitPriceAddOn } from "@/lib/products";

export function addOnLineViews(item: OrderItem, parent?: OrderItem, product?: Product): AddOnLineView[] {
  const lines = addOnLinesOf(item);
  if (!lines.length || lines.every((l) => l.amount != null)) return lines;
  if (!parent || !product) return lines;
  try {
    const parts = feeBreakdown(product, parent.sel ?? {}, parent.qty);
    const sum = parts.reduce((s, f) => s + f.amount, 0);
    const total = (item.qty || 1) * (item.unitPrice || 0);
    if (parts.length && Math.abs(sum - total) < 0.01) return parts.map((f) => ({ label: f.label, amount: f.amount, ...(f.note ? { note: f.note } : {}) }));
  } catch {
    /* สินค้า/ตัวเลือกเปลี่ยนไปแล้ว คิดใหม่ไม่ได้ — โชว์แค่ชื่อค่า */
  }
  return lines;
}

export function AddOnLines({
  item,
  parent,
  product,
  className = "",
}: {
  item: OrderItem;
  parent?: OrderItem;
  product?: Product;
  className?: string;
}) {
  const lines = addOnLineViews(item, parent, product);
  if (!lines.length) return null;
  return (
    <span className={className}>
      {lines.map((l, i) => (
        <span key={`${l.label}-${i}`} className="block">
          <strong className="font-bold">{l.label}</strong>
          {l.amount != null ? <span className="tabular-nums"> +{formatPrice(l.amount)}</span> : null}
          {l.note ? <span className="opacity-80"> · {l.note}</span> : null}
        </span>
      ))}
      {/* 💵 ค่าตัวเลือกต่อชิ้นของรายการแม่ (เคลือบ/พิมพ์ 2 ด้าน) อยู่ในแถว Add on ด้วย — เจ้าของร้าน 29 ก.ย. 69:
          "ราคาเรท ฿90 + … มันควรไปแสดงที่ Add on" · ยอดพวกนี้รวมในราคาต่อชิ้นของแม่แล้ว ไม่ใช่ยอด +฿ ของแถวนี้ */}
      {parent && <UnitPriceLine item={parent} product={product} className="block opacity-80" />}
    </span>
  );
}

/**
 * 💵 ค่าตัวเลือกต่อชิ้นที่รวมอยู่ใน unitPrice ของรายการ (ตะขอ/เคลือบ/พิมพ์ 2 ด้าน) — ชุดเดียวกับ item.addOns ในตะกร้า
 * ใบใหม่ใช้ OrderItem.addOns ที่ checkout เก็บไว้ · ใบเก่าคิดใหม่จากสินค้า+ตัวเลือก+จำนวน แล้วเชื่อเฉพาะเมื่อราคาต่อชิ้นตรงกับที่บันทึก
 * (ราคาที่แอดมินแก้เอง/สินค้าเปลี่ยนราคาแล้ว = ไม่ตรง → ไม่โชว์ ดีกว่าโชว์ผิด) · ราคาต่อชิ้นลบด้วยยอดพวกนี้ = ราคาเรท
 */
export function itemUnitAddOns(item: OrderItem, product?: Product): UnitPriceAddOn[] {
  if (item.addOns?.length) return item.addOns;
  if (!product || !item.sel || !Object.keys(item.sel).length || item.qty <= 0) return [];
  try {
    const parts = unitPriceParts(product, item.sel, item.qty);
    if (!parts.addOns.length || Math.abs(parts.total - item.unitPrice) > 0.01) return [];
    return parts.addOns;
  } catch {
    return [];
  }
}

/** แผนที่ "ชื่อกลุ่ม → บาท/ชิ้น" สำหรับป้าย +฿N/ชิ้น ท้ายบรรทัดสเปค (SpecLines extras) */
export function itemUnitExtras(item: OrderItem, product?: Product): Record<string, number> | undefined {
  const a = itemUnitAddOns(item, product);
  return a.length ? Object.fromEntries(a.map((x) => [x.label, x.amount])) : undefined;
}

/** บรรทัด "ราคาเรท ฿90 + จำนวนด้านที่พิมพ์ ฿10 + เคลือบ (เฉพาะด้านหลัง) ฿10" ใต้ราคาต่อชิ้น — เหมือนมุมขวาล่างของตะกร้า */
export function UnitPriceLine({ item, product, className = "" }: { item: OrderItem; product?: Product; className?: string }) {
  const addOns = itemUnitAddOns(item, product);
  if (!addOns.length || item.unitPrice <= 0) return null;
  const base = item.unitPrice - addOns.reduce((s, a) => s + a.amount, 0);
  return (
    <span className={className}>
      ราคาเรท {formatPrice(base)}
      {addOns.map((a, i) => (
        <span key={`${a.label}-${i}`}>
          {" "}
          {a.amount < 0 ? "−" : "+"} {a.label} {formatPrice(Math.abs(a.amount))}
        </span>
      ))}
      <span className="tabular-nums"> = {formatPrice(item.unitPrice)}/ชิ้น</span>
    </span>
  );
}

/** ยอดรวม "รายการแม่ + Add on" หลังหักส่วนลดของทั้งสองบรรทัด — เลขที่ลูกค้าต้องเห็นเป็นคำตอบสุดท้าย (฿110 + ฿20 = ฿130) */
export function addOnPairTotal(item: OrderItem, parent?: OrderItem): number {
  const own = item.qty * item.unitPrice - itemDiscountAmount(item);
  const p = parent ? parent.qty * parent.unitPrice - itemDiscountAmount(parent) : 0;
  return own + p;
}

/**
 * 🧮 แถว Add on แบบ "บวกให้ดูจนจบ" — เจ้าของร้าน 29 ก.ย. 69: "รายละเอียดชวนงง สุดท้ายแล้วมันควรเป็น 130 บาท"
 *   ราคาสินค้า ฿110 × 1 ชิ้น = ฿110   (ราคาเรท ฿90 + จำนวนด้านที่พิมพ์ ฿10 + เคลือบ (เฉพาะด้านหลัง) ฿10)
 *   + ค่าคละลาย (ด้านหน้า) ฿10 · คละ 3 ลาย
 *   + ค่าคละลาย (ด้านหลัง) ฿10 · คละ 3 ลาย
 *   = รวมรายการนี้ ฿130
 * ค่าตัวเลือกต่อชิ้นอยู่ในวงเล็บใต้ราคาสินค้า (รวมใน ฿110 แล้ว) จะได้ไม่ถูกบวกซ้ำกับ Add on
 */
export function AddOnBreakdown({
  item,
  parent,
  product,
  className = "",
}: {
  item: OrderItem;
  parent?: OrderItem;
  product?: Product;
  className?: string;
}) {
  const lines = addOnLineViews(item, parent, product);
  if (!lines.length) return null;
  const unitAddOns = parent ? itemUnitAddOns(parent, product) : [];
  const unit = (product && parent ? activeMatrix(product, parent.sel ?? {})?.unit : undefined) ?? "ชิ้น";
  const parentDisc = parent ? itemDiscountAmount(parent) : 0;
  const ownDisc = itemDiscountAmount(item);
  const total = addOnPairTotal(item, parent);
  return (
    <span className={className}>
      {parent && parent.unitPrice > 0 && (
        <span className="block">
          <strong className="font-bold">ราคาสินค้า</strong>{" "}
          <span className="tabular-nums">
            {formatPrice(parent.unitPrice)} × {parent.qty.toLocaleString("th-TH")} {unit} = {formatPrice(parent.qty * parent.unitPrice)}
          </span>
          {unitAddOns.length > 0 && (
            <span className="block pl-3 opacity-75">
              (ราคาเรท {formatPrice(parent.unitPrice - unitAddOns.reduce((s, a) => s + a.amount, 0))}
              {unitAddOns.map((a, i) => (
                <span key={`${a.label}-${i}`}>
                  {" "}
                  {a.amount < 0 ? "−" : "+"} {a.label} {formatPrice(Math.abs(a.amount))}
                </span>
              ))}
              )
            </span>
          )}
        </span>
      )}
      {parentDisc > 0 && (
        <span className="block tabular-nums">− ส่วนลดสินค้า {formatPrice(parentDisc)}</span>
      )}
      {lines.map((l, i) => (
        <span key={`${l.label}-${i}`} className="block">
          + <strong className="font-bold">{l.label}</strong>
          {l.amount != null ? <span className="tabular-nums"> {formatPrice(l.amount)}</span> : null}
          {l.note ? <span className="opacity-75"> · {l.note}</span> : null}
        </span>
      ))}
      {ownDisc > 0 && <span className="block tabular-nums">− ส่วนลด Add on {formatPrice(ownDisc)}</span>}
      <span className="block font-bold tabular-nums">= รวมรายการนี้ {formatPrice(total)}</span>
    </span>
  );
}
