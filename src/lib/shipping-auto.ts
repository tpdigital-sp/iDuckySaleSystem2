import type { ShippingMethod } from "@/lib/shop-settings";

/**
 * 🚚 เลือกวิธีจัดส่งให้อัตโนมัติ
 *
 * ปัญหาเดิม: ลูกค้าสั่งขายส่ง 200 ชิ้น แต่ระบบยังเลือก "EMS (50)" ให้ ของใส่กล่องเล็กไม่พอ
 * ร้านต้องมาไล่แก้ทีหลังทุกครั้ง
 *
 * กติกา (เอาอันที่ "ใหญ่ที่สุด" ที่เข้าเงื่อนไข):
 *  1) สินค้าบางตัวบังคับกล่องใหญ่เสมอ (ตั้งที่หน้าแก้ไขสินค้า → ค่าส่งขั้นต่ำ)
 *  2) จำนวนรวมถึงเกณฑ์ / ยอดรวมถึงเกณฑ์ (ตั้งที่ ตั้งค่าระบบ → การจัดส่ง)
 * ไม่เข้าเงื่อนไขไหนเลย = ใช้อันแรกในรายการเหมือนเดิม
 *
 * "ใหญ่กว่า" วัดจากราคาค่าส่ง — ค่าส่งแพงกว่า = กล่องใหญ่กว่า/หนักกว่า
 */

export interface AutoShipping {
  /** วิธีที่ระบบเลือกให้ */
  id: string;
  /** วิธีที่ถูกกว่านี้เลือกไม่ได้ (ของใส่ไม่พอ) — undefined = เลือกได้ทุกอัน */
  floorId?: string;
  /** เหตุผลสั้น ๆ ให้ลูกค้าเห็นว่าทำไมถึงเลือกอันนี้ */
  reason?: string;
}

export interface AutoShippingInput {
  /** จำนวนชิ้นรวมในตะกร้า */
  totalQty: number;
  /** ยอดสินค้ารวม (ยังไม่รวมค่าส่ง) */
  subtotal: number;
  /** วิธีจัดส่งขั้นต่ำที่สินค้าในตะกร้าบังคับไว้ (เอาเฉพาะตัวที่ตั้งค่าไว้) */
  requiredIds?: string[];
}

const rank = (m: ShippingMethod) => m.price;

/** วิธีนี้ถูก "ปลุก" ด้วยเกณฑ์จำนวน/ยอดไหม */
function triggeredBy(m: ShippingMethod, input: AutoShippingInput): string | null {
  if (m.minQty && input.totalQty >= m.minQty) return `สั่ง ${input.totalQty} ชิ้น (ตั้งแต่ ${m.minQty} ชิ้นขึ้นไป)`;
  if (m.minSubtotal && input.subtotal >= m.minSubtotal) return `ยอดสั่งซื้อถึง ${m.minSubtotal.toLocaleString()} บาท`;
  return null;
}

export function pickShipping(methods: ShippingMethod[], input: AutoShippingInput): AutoShipping {
  if (!methods.length) return { id: "" };

  let best = methods[0];
  let reason: string | undefined;

  // 1) สินค้าบังคับ — อันไหนใหญ่สุดชนะ
  for (const id of input.requiredIds ?? []) {
    const m = methods.find((x) => x.id === id);
    if (m && rank(m) > rank(best)) {
      best = m;
      reason = "มีสินค้าที่ต้องส่งแบบนี้อยู่ในตะกร้า";
    }
  }

  // 2) เกณฑ์จำนวน/ยอด — อันไหนใหญ่สุดชนะ
  for (const m of methods) {
    const why = triggeredBy(m, input);
    if (why && rank(m) > rank(best)) {
      best = m;
      reason = why;
    }
  }

  // ถูกกว่าที่เลือกไว้ = ของใส่ไม่พอ ล็อกไม่ให้เลือก (เฉพาะตอนที่มีเหตุผลจริง ๆ)
  return { id: best.id, ...(reason ? { floorId: best.id, reason } : {}) };
}

/** วิธีนี้เลือกได้ไหม เทียบกับขั้นต่ำที่ระบบคำนวณไว้ */
export function shippingAllowed(m: ShippingMethod, methods: ShippingMethod[], auto: AutoShipping): boolean {
  if (!auto.floorId) return true;
  // ค่าส่ง 0 = มารับเอง / ส่งฟรี — ไม่ใช่กล่องพัสดุ ห้ามล็อกไม่ว่าจะสั่งเยอะแค่ไหน
  if (m.price === 0) return true;
  const floor = methods.find((x) => x.id === auto.floorId);
  return !floor || rank(m) >= rank(floor);
}
