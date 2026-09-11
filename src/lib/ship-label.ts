/**
 * 🚚 ชื่อวิธีส่งที่ "ควรโชว์" ของออเดอร์ — ใช้ร่วมกันทุกจอ (ใบปะหน้า · หน้าออเดอร์ · หน้าลูกค้า · ใบเสร็จ)
 *
 * ทำไมต้องมี (10 ก.ย. 69): ใบปะหน้าขึ้น "ค่าส่ง" / "ส่งธรรมดา" ตัวใหญ่แทนวิธีส่งจริง
 *  · ออเดอร์จากลิงก์ FlowAccount → shippingLabel = ชื่อบรรทัดในเอกสาร ("ค่าส่ง") ซึ่งไม่ใช่วิธีส่ง
 *  · ออเดอร์จากใบเสนอราคาที่แอดมินกรอกตัวเลขค่าส่งเอง → ไม่มี shippingLabel เลย
 *    ตกไปใช้ order.shipping ที่เก็บได้แค่ 2 ค่าเก่า "ส่งธรรมดา"/"ส่งด่วน" ทั้งที่ร้านตั้งวิธีส่งเป็น EMS (50)/EMS (100)/มารับเอง
 *
 * กติกา: ป้ายที่บอกวิธีส่งจริง (EMS/Kerry/มารับเอง/…) ใช้ตามนั้น · ป้ายว่างหรือเป็นคำกลาง ๆ ("ค่าส่ง", "ค่าจัดส่ง 50")
 * ให้จับคู่ "ราคาค่าส่งในใบ" กับวิธีส่งที่ร้านตั้งไว้ (50 → EMS (50)) · จับไม่ได้ค่อยตก order.shipping
 * ⚠️ ค่าส่ง 0 บาทไม่จับคู่ — แยกไม่ออกระหว่าง "มารับเอง" กับ "ส่งฟรี"
 */
import type { ShippingMethod } from "./settings-shared";

/** ป้ายค่าส่งกลาง ๆ ที่ไม่บอกวิธีส่ง — "ค่าส่ง" · "ค่าจัดส่ง" · "ค่าขนส่ง 50" · "Shipping fee" (มีตัวเลข/วงเล็บท้ายก็ยังนับ) */
const GENERIC_RE = /^(?:ค่า(?:จัด|ขน)?ส่ง(?:สินค้า|ของ)?|shipping(?:\s*(?:fee|cost))?|delivery(?:\s*(?:fee|cost))?)\s*[:\-–—]?\s*(?:[(\[]?\s*(?:฿|บาท)?\s*[\d,.]*\s*(?:฿|บาท|\.-)?\s*[)\]]?)?$/iu;
const PICKUP_RE = /รับเอง|มารับ|pick\s*-?up/i;

/** ป้ายนี้ไม่บอกวิธีส่ง (ว่าง หรือเป็นคำกลาง ๆ อย่าง "ค่าส่ง") */
export function isGenericShipLabel(label: string | null | undefined): boolean {
  const s = (label ?? "").trim();
  return !s || GENERIC_RE.test(s);
}

/** วิธีส่งของร้านที่ราคาตรงกับค่าส่งในใบ (ไม่นับ "มารับเอง" · 0 บาทไม่จับคู่) */
export function shippingMethodByPrice(methods: ShippingMethod[], cost: number): ShippingMethod | undefined {
  if (!(cost > 0)) return undefined;
  return methods.find((m) => Number(m.price) === cost && !PICKUP_RE.test(m.name ?? ""));
}

/**
 * ชื่อวิธีส่งที่ควรเก็บลง shippingLabel ตอนสร้าง/ซิงก์ออเดอร์
 * ป้ายจริงใช้ตามนั้น · ป้ายกลาง ๆ/ว่าง → ชื่อวิธีส่งของร้านที่ราคาตรง · ไม่มี → ป้ายเดิม (อาจว่าง)
 */
export function normalizeShipLabel(label: string | null | undefined, cost: number, methods: ShippingMethod[]): string {
  const s = (label ?? "").trim();
  if (s && !isGenericShipLabel(s)) return s;
  return shippingMethodByPrice(methods, cost)?.name ?? s;
}

/** ออเดอร์นี้ลูกค้ามารับเองที่ร้าน (ไม่มีพัสดุ) — ดูจากป้ายวิธีส่งที่เก็บไว้ · ค่าส่ง 0 อย่างเดียวตัดสินไม่ได้ (ส่งฟรีก็ 0) */
export function isPickupOrder(o: { shipping?: string; shippingLabel?: string | null }): boolean {
  return PICKUP_RE.test(o.shippingLabel ?? "") || PICKUP_RE.test(o.shipping ?? "");
}

/**
 * ชื่อวิธีส่งแบบไม่มีราคาติดท้าย ("EMS (50)" → "EMS") — ไว้โชว์เป็นป้ายใหญ่ ราคาอยู่ในตารางยอดเงินอยู่แล้ว
 * (สูตรเดียวกับป้ายบนใบปะหน้า)
 */
export function stripShipPrice(label: string): string {
  return label
    .replace(/[\s(\[]*(?:฿|บาท)?\s*\d[\d,.]*\s*(?:฿|บาท|.-)?\s*[)\]]*\s*$/u, "")
    .replace(/[\s·—–-]+$/u, "")
    .trim();
}

/** ชื่อวิธีส่งสำหรับแสดงผล — ป้ายจริง → จับคู่ราคา → ค่าเก่า order.shipping */
export function resolveShipLabel(
  o: { shipping?: string; shippingLabel?: string | null; shippingCost?: number },
  methods: ShippingMethod[] = []
): string {
  const s = (o.shippingLabel ?? "").trim();
  if (s && !isGenericShipLabel(s)) return s;
  return shippingMethodByPrice(methods, Number(o.shippingCost) || 0)?.name ?? (o.shipping ?? "").trim() ?? s;
}
