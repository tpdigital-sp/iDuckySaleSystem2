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
import { addOnLinesOf, type AddOnLineView, type OrderItem } from "@/lib/admin-data";
import { feeBreakdown, formatPrice, type Product } from "@/lib/products";

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
    </span>
  );
}
