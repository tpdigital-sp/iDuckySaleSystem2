/**
 * 📦 ส่งรวมกล่องกับออเดอร์อื่น — บิลแยก ส่งกล่องเดียว (พนักงานขอ 18 ก.ย. 69)
 *
 * เคสจริง: ลูกค้าสั่งใบแรกแบบ "มารับเอง" แล้วสั่งใบใหม่แบบส่ง ปณ. ขอให้เอาของใบแรกใส่กล่องใบใหม่ไปด้วย
 * เดิมต้องทำมือ 3 จุดที่พลาดแล้วเสียหาย: แก้วิธีส่งใบแรกแล้วค่าส่งเด้ง (ยอดเพี้ยนจากบิล) · แพ็คส่งใบแรกแยกไปก่อน · ลืมยิงเลขใบที่สอง
 *
 * กติกา:
 *  · ใบหลัก (main) = ใบที่ยิงเลขพัสดุ + ปริ้นใบปะหน้า · ใบตาม (rider) = ของใส่กล่องใบหลัก ยิงเลขเองไม่ได้
 *  · ผูก/ยกเลิก ผ่าน /api/admin/orders/ship-with เท่านั้น (เขียนสองใบพร้อมกันฝั่งเซิร์ฟเวอร์)
 *  · ⚠️ ไม่แตะ shippingCost ของใบไหนเลย — ใบมารับเองค่าส่ง 0 อยู่แล้ว · ใบตามที่มีค่าส่งค้างอยู่ให้แอดมินตัดสินเอง (ยอดต้องตรงบิล)
 *  · ยิงเลขที่ใบหลัก → เซิร์ฟเวอร์ลงเลขเดียวกัน + สถานะจัดส่งแล้วให้ใบตามทุกใบ (PATCH /api/admin/orders)
 *
 * ไฟล์นี้ไม่มีโค้ดฝั่งเซิร์ฟเวอร์ — หน้าจอกับ API ใช้ตัวตัดสินชุดเดียวกัน
 */
import { hasUnpaidBalance, packGate, withLog, type Order } from "./admin-data";
import { isGenericShipLabel, isPickupOrder } from "./ship-label";

export const isShipMain = (o: Pick<Order, "shipWith">) => o.shipWith?.role === "main" && o.shipWith.orders.length > 0;
export const isShipRider = (o: Pick<Order, "shipWith">) => o.shipWith?.role === "rider" && o.shipWith.orders.length > 0;
/** เลขใบหลักของใบตามนี้ ("" = ไม่ใช่ใบตาม) */
export const shipMainIdOf = (o: Pick<Order, "shipWith">) => (isShipRider(o) ? o.shipWith!.orders[0] : "");
/** เลขใบตามทุกใบของใบหลักนี้ */
export const shipRiderIdsOf = (o: Pick<Order, "shipWith">) => (isShipMain(o) ? o.shipWith!.orders : []);

const CLOSED: Order["status"][] = ["ยกเลิก", "เสร็จสิ้น"];

/** ใบนี้เป็น "ใบหลัก" ได้ไหม — คืนเหตุผลที่ไม่ได้ ("" = ได้) */
export function cannotBeMain(o: Order): string {
  if (CLOSED.includes(o.status)) return `ใบนี้${o.status}แล้ว`;
  if (isShipRider(o)) return `ใบนี้เป็นใบตามของ ${shipMainIdOf(o)} อยู่`;
  if (isPickupOrder(o)) return "ใบนี้ลูกค้ามารับเอง ไม่มีพัสดุให้ส่งรวม — เปลี่ยนวิธีส่งเป็นแบบจัดส่งก่อน";
  if ((o.tracking ?? "").trim() || o.status === "จัดส่งแล้ว") return "ใบนี้ยิงเลขพัสดุไปแล้ว";
  return "";
}

/** ใบนี้เป็น "ใบตาม" ได้ไหม — คืนเหตุผลที่ไม่ได้ ("" = ได้) */
export function cannotBeRider(o: Order): string {
  if (CLOSED.includes(o.status)) return `${o.status}แล้ว`;
  if (o.shipWith?.orders.length) return isShipRider(o) ? `ผูกส่งรวมกับ ${shipMainIdOf(o)} อยู่แล้ว` : "เป็นใบหลักของชุดส่งรวมอื่นอยู่";
  if ((o.tracking ?? "").trim()) return "ยิงเลขพัสดุไปแล้ว";
  if (o.shipments?.length || o.shipPlan?.length) return "ใบนี้แบ่งส่งหลายรอบ — ส่งรวมไม่ได้";
  if (o.pickedUp) return "ลูกค้ามารับของไปแล้ว";
  // "จัดส่งแล้ว" ที่ไม่มีเลข = ใบมารับเองที่แพ็คเสร็จรอมารับ → ยังเอาไปใส่กล่องใบหลักได้
  if (o.status === "จัดส่งแล้ว" && !o.packedAt) return "จัดส่งแล้ว";
  return "";
}

/**
 * ใบนี้ "ของออกจากร้านไปแล้ว" หรือยัง — รวมกล่องไม่ได้ทั้งเป็นใบหลักและใบตาม
 * ใช้คัดใบพวกนี้ออกจากรายการให้เลือก: โชว์ไว้พร้อมเหตุผลทำให้แอดมินสับสนว่ายังรวมได้ (พนักงานแจ้ง 23 ก.ย. 69)
 * ⚠️ ใบมารับเองที่แพ็คเสร็จรอมารับ (จัดส่งแล้ว + packedAt) ยังไม่ออกจากร้าน — ยังเอาไปใส่กล่องใบหลักได้ ห้ามคัดทิ้ง
 */
export function alreadyShipped(o: Order): boolean {
  if ((o.tracking ?? "").trim()) return true;
  if (o.shipments?.length) return true; // แบ่งส่งออกไปแล้วบางรอบ
  if (o.pickedUp) return true;
  return o.status === "จัดส่งแล้ว" && !o.packedAt;
}

/**
 * ของใบตามพร้อมลงกล่องหรือยัง — ด่านเดียวกับยิงเลขพัสดุ ยกเว้น "ภาพก่อนปิดกล่อง" (ถ่ายที่ใบหลักใบเดียว)
 * ใบมารับเองที่กดแพ็คเสร็จไปแล้ว (packedAt) = ผ่านด่านมาแล้ว ไม่ตรวจซ้ำ
 */
export function riderNotReady(o: Order): string[] {
  if (o.packedAt) return hasUnpaidBalance(o) ? ["ยังค้างยอดชำระ"] : [];
  const g = packGate(o);
  return [
    g.uncounted.length ? `ยังไม่ตรวจนับ ${g.uncounted.length} รูป` : "",
    g.unread.length ? `ยังไม่ยืนยันอ่านรายละเอียด ${g.unread.length} รายการ` : "",
    g.short.length ? `ของไม่ครบ ${g.short.length} รายการ` : "",
    g.missing.length ? `ของยังไม่มา ${g.missing.length} รายการ` : "",
    g.unsampled.length ? `ยังไม่ใส่ชิ้นงานตัวอย่าง ${g.unsampled.length} รายการ` : "",
    g.taxInvoiceUnpacked ? "ยังไม่ใส่ใบกำกับภาษี" : "",
    g.unpaidBalance ? "ยังค้างยอดชำระ" : "",
  ].filter(Boolean);
}

/**
 * ก้อนใหม่ของสองใบเมื่อผูกส่งรวม (ยังไม่บันทึก — API เป็นคนเขียน · สคริปต์จำลองใช้ตัวเดียวกัน)
 * ใบตาม: วิธีส่งตามใบหลัก (ป้ายกลาง ๆ อย่าง "ค่าส่ง" ไม่บอกวิธีส่ง → ใช้คำกลางแทน) + เติมที่อยู่เฉพาะเมื่อว่าง + จำค่าเดิมไว้คืนตอนยกเลิก
 * ⚠️ shippingCost ไม่แตะทั้งสองใบ
 */
export function buildShipLink(main: Order, rider: Order, by: string, at: string): { nextMain: Order; nextRider: Order } {
  const mainLabel = (main.shippingLabel ?? "").trim();
  const riderLabel = mainLabel && !isGenericShipLabel(mainLabel) ? mainLabel : `ส่งรวมกับ ${main.id}`;
  const fillAddress = !rider.address?.trim() && !!main.address?.trim();
  const nextRider = withLog(
    {
      ...rider,
      shipping: main.shipping,
      shippingLabel: riderLabel,
      ...(fillAddress ? { address: main.address } : {}),
      shipWith: {
        role: "rider" as const,
        orders: [main.id],
        at,
        by,
        prev: { shipping: rider.shipping, shippingLabel: rider.shippingLabel, ...(fillAddress ? { address: rider.address ?? "" } : {}) },
      },
    },
    by,
    `📦 ส่งรวมกล่องกับ ${main.id}`,
    `ของใบนี้ใส่กล่องไปกับ ${main.id} — ห้ามส่งแยก ยิงเลขพัสดุที่ ${main.id} ใบเดียว · วิธีส่ง ${rider.shippingLabel || rider.shipping || "—"} → ${riderLabel} (ค่าส่งคงเดิม ฿${(rider.shippingCost || 0).toLocaleString("th-TH")})${fillAddress ? " · เติมที่อยู่ตามใบหลัก" : ""}`
  );
  const nextMain = withLog(
    { ...main, shipWith: { role: "main" as const, orders: [...shipRiderIdsOf(main), rider.id], at: main.shipWith?.at ?? at, by: main.shipWith?.by ?? by } },
    by,
    `📦 รับของ ${rider.id} มาส่งรวมกล่อง`,
    `ยิงเลขพัสดุใบนี้ = ลงเลขให้ ${rider.id} ด้วย · ปริ้นใบปะหน้าจากใบนี้ใบเดียว`
  );
  return { nextMain, nextRider };
}

/** แถวสรุปของใบที่ผูกกัน/ใบที่เลือกผูกได้ — API ship-with ตอบรูปนี้ */
export type ShipWithRow = {
  id: string;
  customer: string;
  status: Order["status"];
  /** ป้ายสถานะแบบที่คนอ่าน */
  label: string;
  shipLabel: string;
  shippingCost: number;
  items: string[];
  date: string;
  /** ผูกไม่ได้เพราะอะไร ("" = ผูกได้) — เฉพาะรายการให้เลือก */
  blocked?: string;
  /** ของยังไม่พร้อมลงกล่อง (เฉพาะใบตามที่ผูกแล้ว) */
  notReady?: string[];
};
