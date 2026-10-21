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
 * 🚚⚡ ค่าส่งของใบนี้ "ระบบเลือกให้" ไหม — ใช่ = รายการเปลี่ยนแล้วคิดค่าส่งใหม่ตามทั้งใบ (เจ้าของร้าน 20 ต.ค. 69 OD-261020-2478:
 * แก้จำนวนถุงผ้า 40 → 1 ใบ ค่าส่งค้าง EMS (100) เพราะค่าส่งเป็นตัวเลขที่ตั้งครั้งเดียว ไม่เคยคิดใหม่ตามรายการ)
 * Order.shipAuto ตั้ง/ล้างทุกครั้งที่ค่าส่งเปลี่ยน · ใบเก่าที่ยังไม่มีธง อ่านจากประวัติครั้งล่าสุดที่ค่าส่งถูกตั้ง
 * ไม่ใช่ = แอดมินเลือกวิธีส่ง/พิมพ์ค่าส่งเอง หรือไม่มีร่องรอยว่าระบบคิดให้ → ระบบไม่แตะ (ขึ้นปุ่มแนะนำแทน)
 */
export function shipFollowsItems(o: {
  shipAuto?: boolean;
  log?: { action: string; detail?: string }[];
}): boolean {
  if (typeof o.shipAuto === "boolean") return o.shipAuto;
  const log = o.log ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const { action, detail = "" } = log[i];
    if (action === "เปลี่ยนวิธีส่ง") return detail.includes("(อัตโนมัติ");
    if (action === "แก้ค่าจัดส่ง") return false;
    if (action === "สั่งเพิ่มในออเดอร์เดิม" && detail.includes("ใส่ค่าส่ง")) return true;
  }
  return false;
}

/**
 * 🤷 ไม่มีร่องรอยเลยว่าค่าส่งใบนี้ใครตั้ง — ไม่มีธง shipAuto และไม่มี log เปลี่ยนวิธีส่ง/แก้ค่าจัดส่ง/ใส่ค่าส่งตอนสั่งเพิ่ม
 * = ใบจากหน้าร้านก่อน 21 ต.ค. 69 (ตะกร้าเพิ่งเริ่มส่งธงมา) ค่าส่งอาจเป็นตัวที่ระบบเลือกให้ หรือลูกค้าเลือกเองก็ได้
 * หน้าออเดอร์ใช้: ค่าส่งเดิมตรงกับที่ระบบคิดจากรายการเดิม → ถือว่าระบบเลือกให้ ปรับตามได้ · ไม่ตรง → ขึ้นปุ่มแนะนำแทน
 */
export function shipOriginUnknown(o: { shipAuto?: boolean; log?: { action: string; detail?: string }[] }): boolean {
  if (typeof o.shipAuto === "boolean") return false;
  return !(o.log ?? []).some(
    ({ action, detail = "" }) =>
      action === "เปลี่ยนวิธีส่ง" || action === "แก้ค่าจัดส่ง" || (action === "สั่งเพิ่มในออเดอร์เดิม" && detail.includes("ใส่ค่าส่ง"))
  );
}

/**
 * 🚚 ออเดอร์นี้ "ยังไม่เคยเลือกวิธีส่ง" — ค่าส่ง 0 และไม่มีป้ายวิธีส่ง (ไม่ใช่มารับเอง/ส่งฟรีที่เลือกไว้แล้ว)
 * = ใบเปล่าที่แอดมินเพิ่งกด "สร้างออเดอร์งานพิเศษ" (สร้างมาด้วย shippingCost 0 ไม่มี shippingLabel)
 * ใบจากหน้าร้าน/ใบเสนอราคา/FlowAccount มีป้ายหรือตัวเลขค่าส่งเสมอ จึงไม่เข้าข้อนี้
 * ใช้ตัดสินว่าตอน "สั่งเพิ่มในออเดอร์เดิม" ต้องคิดค่าส่งให้ด้วยไหม (ปกติสั่งเพิ่ม = ไม่คิดซ้ำ เพราะใบแรกจ่ายไปแล้ว)
 */
export function shippingUnset(o: { shipping?: string; shippingLabel?: string | null; shippingCost?: number }): boolean {
  return !(o.shippingLabel ?? "").trim() && !((o.shippingCost ?? 0) > 0) && !isPickupOrder(o);
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

/**
 * ค่าที่ระบบเติมเองตอนเปิดใบ (ไม่ใช่วิธีส่งที่ใครเลือก) — ทุกทางเข้าเซ็ต shipping = "ส่งธรรมดา" ไว้ก่อนเสมอ
 * ⚠️ ร้านไม่มีวิธีส่งชื่อนี้ (มีแค่ EMS (50)/EMS (100)/มารับเอง) ใบที่เหลือแค่ค่านี้จึงแปลว่า "ยังไม่ได้เลือก"
 */
const DEFAULT_SHIPPING = "ส่งธรรมดา";

/** คำที่ใช้ตรงกันทุกจอเมื่อใบนั้นยังไม่ได้เลือกวิธีส่ง */
export const UNSET_SHIP_LABEL = "ยังไม่ระบุวิธีส่ง";

/**
 * ชื่อวิธีส่งสำหรับแสดงผล — ป้ายจริง → จับคู่ราคา → ค่าเก่า order.shipping
 * คืน "" เมื่อยังไม่ได้เลือกวิธีส่งจริง ๆ (ไม่มีป้าย + ราคาจับคู่ไม่ได้ + เหลือแค่ค่า default)
 * ⚠️ อย่าเดาเป็นชื่อวิธีส่ง — ใบปะหน้าขึ้น "ส่งธรรมดา" ตัวใหญ่ทั้งที่ไม่มีใครเลือก คนแพ็คแยกกองผิด (เจ้าของร้านทัก 15 ก.ย. 69)
 */
export function resolveShipLabel(
  o: { shipping?: string; shippingLabel?: string | null; shippingCost?: number },
  methods: ShippingMethod[] = []
): string {
  const s = (o.shippingLabel ?? "").trim();
  if (s && !isGenericShipLabel(s)) return s;
  const cost = Number(o.shippingCost) || 0;
  const byPrice = shippingMethodByPrice(methods, cost)?.name;
  if (byPrice) return byPrice;
  // 📦 ค่าส่งไม่ตรงราคาไหนเลย (งานเยอะคิดค่าส่ง 200/250/300 ในบิล FlowAccount) แต่วิธีส่งแบบเสียเงินของร้านเป็นขนส่งเดียวกันหมด
  // (EMS (50)/EMS (100) → "EMS") = ใบนี้ส่ง EMS แน่ ๆ · เดิมใบปะหน้าว่าง คนแพ็คต้องไปเลือก EMS (100) แล้วพิมพ์ราคากลับเอง (OD-260917-9787 · 19 ต.ค. 69)
  const sameCarrier = paidCarrierName(methods);
  if (cost > 0 && sameCarrier) return sameCarrier;
  const legacy = (o.shipping ?? "").trim();
  return legacy === DEFAULT_SHIPPING ? "" : legacy;
}

/** ชื่อขนส่งเมื่อวิธีส่งแบบเสียเงินทุกตัวเป็นขนส่งเดียวกัน (ชื่อตัดราคาแล้วเหมือนกัน) · ปนกันหลายขนส่ง → "" (ไม่เดา) */
function paidCarrierName(methods: ShippingMethod[]): string {
  const names = new Set(
    methods
      .filter((m) => Number(m.price) > 0 && !PICKUP_RE.test(m.name ?? ""))
      .map((m) => stripShipPrice(m.name ?? ""))
  );
  const [only] = Array.from(names);
  return names.size === 1 && only ? only : "";
}

/** ใบนี้ยังไม่ได้เลือกวิธีส่ง — ไว้ติดป้ายเตือนให้แอดมินเลือกก่อนส่งของ */
export function isShipMethodUnset(
  o: { shipping?: string; shippingLabel?: string | null; shippingCost?: number },
  methods: ShippingMethod[] = []
): boolean {
  return !resolveShipLabel(o, methods);
}
