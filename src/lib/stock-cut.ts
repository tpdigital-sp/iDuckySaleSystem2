import { splitMultiPicks, type ProductOption } from "@/lib/products";

/**
 * "รายการนี้ต้องตัดสต๊อกตัวไหน กี่หน่วย" จากตัวเลือกที่ลูกค้าเลือก — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 * (ตัวเขียน ledger อยู่ที่ cutStockForOrder ใน lib/server/stock.ts)
 *
 * กติกา:
 *  - choice.stockItemId              → ตัดเสมอเมื่อเลือกค่านั้น × stockQtyPer
 *  - choice.stockLinks[] (มี when)   → ตัดเพิ่มเมื่อ "กลุ่มอื่น" ตรงเงื่อนไขทุกข้อ (ของที่ขึ้นกับ 2 ตัวเลือก: กรอบรูปตามขนาด)
 *  - ติ๊กหลายอย่าง "A + B ×2"        → แยกด้วย splitMultiPicks ที่รู้จักชื่อตัวเลือกจริง · ×N คูณจำนวนตัด
 *
 * ⚠️ ห้ามแยกค่าด้วย split(" + ") เฉย ๆ — ชื่อตัวเลือก "กรอบรูป + แผ่นจิ๊กซอว์" มี " + " ในชื่อ
 *    เคยทำให้หาคู่ไม่เจอ = ขายกรอบแล้วไม่ตัดยอดเลย (พบ 18 ก.ย. 69)
 */
export interface StockCut {
  itemId: string;
  qty: number;
  /** "ขนาด: 15*20cm" — ไว้ลงหมายเหตุใน ledger */
  via: string;
}

export function planStockCuts(options: ProductOption[], sel: Record<string, string> | undefined, orderQty: number): StockCut[] {
  if (!sel) return [];
  const n = Math.abs(orderQty) || 0;
  const names = (label: string) => options.filter((o) => o.label === label).flatMap((o) => (o.choices ?? []).map((c) => c.name));
  const picked = (label: string) => splitMultiPicks(sel[label], names(label));
  const out: StockCut[] = [];
  for (const [label, value] of Object.entries(sel)) {
    if (!value) continue;
    // กลุ่มชื่อซ้ำในสินค้าเดียวมีจริง — ค่าที่เลือกเก็บด้วย label จึงต้องมองทุกกลุ่มที่ชื่อนี้
    const groups = options.filter((o) => o.label === label);
    for (const pick of picked(label)) {
      const choice = groups.flatMap((o) => o.choices ?? []).find((c) => c.name === pick.name);
      if (!choice) continue;
      const via = `${label}: ${pick.name}`;
      if (choice.stockItemId) out.push({ itemId: choice.stockItemId, qty: n * pick.qty * (choice.stockQtyPer ?? 1), via });
      for (const l of choice.stockLinks ?? []) {
        const ok = (l.when ?? []).every((w) => picked(w.label).some((p) => w.choices.includes(p.name)));
        if (ok && l.stockItemId) out.push({ itemId: l.stockItemId, qty: n * pick.qty * (l.per ?? 1), via });
      }
    }
  }
  return out;
}
