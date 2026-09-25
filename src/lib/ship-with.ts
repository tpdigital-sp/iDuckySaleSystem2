/**
 * 📦 ส่งรวมกล่องกับออเดอร์อื่น — บิลแยก ส่งกล่องเดียว (พนักงานขอ 18 ก.ย. 69)
 *
 * เคสจริง: ลูกค้าสั่งใบแรกแบบ "มารับเอง" แล้วสั่งใบใหม่แบบส่ง ปณ. ขอให้เอาของใบแรกใส่กล่องใบใหม่ไปด้วย
 * เดิมต้องทำมือ 3 จุดที่พลาดแล้วเสียหาย: แก้วิธีส่งใบแรกแล้วค่าส่งเด้ง (ยอดเพี้ยนจากบิล) · แพ็คส่งใบแรกแยกไปก่อน · ลืมยิงเลขใบที่สอง
 *
 * 🏪 เคสที่ 2 (25 ก.ย. 69 · OD-260919-1322 + OD-260924-5507): ลูกค้ามารับเอง "ทั้งสองใบ" อยากให้แพ็ครวมรับทีเดียว
 * เดิมกติกาห้ามใบมารับเองเป็นใบหลัก (ไม่มีพัสดุให้ยิงเลข) → ทั้งคู่มารับเอง = สลับให้ก็ไม่รอด ขึ้น "เป็นใบหลักไม่ได้" ทั้งสองทาง
 * ตอนนี้ = "ชุดรับพร้อมกัน" (isPickupShipSet): ใบหลักคือใบที่กด "แพ็คเสร็จ" + กด "ลูกค้ารับของแล้ว" ใบเดียว แล้วลงให้ใบตามเอง
 *
 * กติกา:
 *  · ใบหลัก (main) = ใบที่ยิงเลขพัสดุ + ปริ้นใบปะหน้า · ใบตาม (rider) = ของใส่กล่องใบหลัก ยิงเลขเองไม่ได้
 *  · ชุดรับพร้อมกัน (ทั้งคู่มารับเอง): ใบหลัก = ใบที่กด "แพ็คเสร็จ"/"ลูกค้ารับของแล้ว" · ใบตามกดเองไม่ได้ ขึ้นให้เองตามใบหลัก
 *    ใบที่ยังไม่แพ็คเป็นใบหลัก (pickShipRoles) — ไม่งั้นใบตามที่ยังไม่แพ็คไม่มีทางกดแพ็คเสร็จ
 *  · ผูก/ยกเลิก ผ่าน /api/admin/orders/ship-with เท่านั้น (เขียนสองใบพร้อมกันฝั่งเซิร์ฟเวอร์)
 *  · ⚠️ ไม่แตะ shippingCost ของใบไหนเลย — ใบมารับเองค่าส่ง 0 อยู่แล้ว · ใบตามที่มีค่าส่งค้างอยู่ให้แอดมินตัดสินเอง (ยอดต้องตรงบิล)
 *  · ยิงเลขที่ใบหลัก → เซิร์ฟเวอร์ลงเลขเดียวกัน + สถานะจัดส่งแล้วให้ใบตามทุกใบ (PATCH /api/admin/orders)
 *  · 🚚 ใบที่ "แบ่งส่งไปแล้วบางรอบ" แต่ของยังเหลือ = ผูกได้ (พนักงานขอ 25 ก.ย. 69 · OD-260911-8472 ส่งรอบ 1 ไปแล้ว อยากให้ที่เหลือไปกับใบใหม่)
 *    ของที่เหลือทั้งหมดไปกล่องใบหลัก = รอบสุดท้ายของใบนั้น (เลขจากใบหลักลงมาเหมือนรอบสุดท้ายปกติ ไลน์บอก "รอบสุดท้าย ครบทุกรายการ")
 *    ยกเว้นใบที่ยังมี "รอบตามแผนที่ต้องส่งแยกก่อน" (pendingPlanRound) — ส่งรอบนั้นให้จบก่อนค่อยผูก ไม่งั้นแผนกับกล่องรวมตีกัน
 *
 * ไฟล์นี้ไม่มีโค้ดฝั่งเซิร์ฟเวอร์ — หน้าจอกับ API ใช้ตัวตัดสินชุดเดียวกัน
 */
import { hasUnpaidBalance, packGate, partialShipSummary, pendingPlanRound, proofShipStates, withLog, type Order } from "./admin-data";
import { isGenericShipLabel, isPickupOrder } from "./ship-label";

export const isShipMain = (o: Pick<Order, "shipWith">) => o.shipWith?.role === "main" && o.shipWith.orders.length > 0;
export const isShipRider = (o: Pick<Order, "shipWith">) => o.shipWith?.role === "rider" && o.shipWith.orders.length > 0;
/** 🏪 ชุด "รับพร้อมกัน" — ผูกส่งรวมอยู่และเป็นใบมารับเอง (ใบตามรับวิธีส่งตามใบหลัก ทั้งชุดจึงเป็นมารับเองพร้อมกัน) */
export const isPickupShipSet = (o: Pick<Order, "shipWith" | "shipping" | "shippingLabel">) => !!o.shipWith?.orders.length && isPickupOrder(o);
/** เลขใบหลักของใบตามนี้ ("" = ไม่ใช่ใบตาม) */
export const shipMainIdOf = (o: Pick<Order, "shipWith">) => (isShipRider(o) ? o.shipWith!.orders[0] : "");
/** เลขใบตามทุกใบของใบหลักนี้ */
export const shipRiderIdsOf = (o: Pick<Order, "shipWith">) => (isShipMain(o) ? o.shipWith!.orders : []);

const CLOSED: Order["status"][] = ["ยกเลิก", "เสร็จสิ้น"];

/** ใบนี้เป็น "ใบหลัก" ได้ไหม — คืนเหตุผลที่ไม่ได้ ("" = ได้) */
export function cannotBeMain(o: Order): string {
  if (CLOSED.includes(o.status)) return `ใบนี้${o.status}แล้ว`;
  if (isShipRider(o)) return `ใบนี้เป็นใบตามของ ${shipMainIdOf(o)} อยู่`;
  if ((o.tracking ?? "").trim()) return "ใบนี้ยิงเลขพัสดุไปแล้ว";
  // 🏪 มารับเอง: ไม่มีพัสดุ แต่เป็นใบหลักของ "ชุดรับพร้อมกัน" ได้ตราบที่ของยังอยู่ในร้าน (แพ็คเสร็จรอมารับก็ยังได้)
  // ⚠️ ห้ามกลับไปห้ามทั้งก้อน — ลูกค้ามารับเอง 2 ใบจะรวมกันไม่ได้เลย (25 ก.ย. 69) · คู่กับใบส่ง ปณ. pickShipRoles ยกใบส่งเป็นใบหลักให้เอง
  if (isPickupOrder(o)) return o.pickedUp ? "ลูกค้ามารับของใบนี้ไปแล้ว" : "";
  if (o.status === "จัดส่งแล้ว") return "ใบนี้ยิงเลขพัสดุไปแล้ว";
  return "";
}

/**
 * ใครเป็นใบหลัก/ใบตามจากคู่ที่ส่งมา (a = ใบที่แอดมินเปิดอยู่)
 *  · มารับเอง + ส่ง ปณ. → ใบส่ง ปณ. เป็นใบหลัก (มีพัสดุให้ยิงเลข) สลับให้เองเมื่อส่งมากลับด้าน
 *  · มารับเองทั้งคู่ → ใบที่ "ยังไม่แพ็ค" เป็นใบหลัก: กดแพ็คเสร็จที่ใบหลักแล้วใบตามขึ้นให้เอง (ใบตามกดเองไม่ได้)
 *    ถ้าให้ใบที่แพ็คแล้วเป็นใบหลัก ใบตามที่ยังไม่แพ็คจะไม่มีทางแพ็คเสร็จได้เลย
 */
export function pickShipRoles<T extends Order>(a: T, b: T): { main: T; rider: T } {
  const pa = isPickupOrder(a);
  const pb = isPickupOrder(b);
  if (pa && !pb) return { main: b, rider: a };
  if (pa && pb && a.packedAt && !b.packedAt) return { main: b, rider: a };
  return { main: a, rider: b };
}

/** ใบนี้เป็น "ใบตาม" ได้ไหม — คืนเหตุผลที่ไม่ได้ ("" = ได้) */
export function cannotBeRider(o: Order): string {
  if (CLOSED.includes(o.status)) return `${o.status}แล้ว`;
  if (o.shipWith?.orders.length) return isShipRider(o) ? `ผูกส่งรวมกับ ${shipMainIdOf(o)} อยู่แล้ว` : "เป็นใบหลักของชุดส่งรวมอื่นอยู่";
  if ((o.tracking ?? "").trim()) return "ยิงเลขพัสดุไปแล้ว";
  /**
   * 🚚 แบ่งส่ง: เดิมห้ามทั้งก้อน ("แบ่งส่งหลายรอบ — ส่งรวมไม่ได้") → พนักงานขอ 25 ก.ย. 69 ให้ใบที่ส่งไปแล้ว 1 รอบแต่ของยังเหลือ ผูกได้
   * ที่เหลือทั้งหมดไปกล่องใบหลัก = รอบสุดท้าย · ติดเฉพาะใบที่แผนยังสั่งให้ส่งแยกอีกรอบ (ไม่ใช่รอบสุดท้าย) — ส่งรอบนั้นก่อน
   * แผนที่ระบบตั้งเองจากโฟลเดอร์ (…ตย) บนใบที่จ่ายครบไม่นับ (pendingPlanRound ข้ามให้แล้ว) — ตัวอย่างไปกล่องเดียวกันอยู่แล้ว
   */
  const plan = pendingPlanRound(o);
  if (plan) return `ยังมีรอบแบ่งส่งตามแผนที่ต้องส่งแยกก่อน (รอบที่ ${plan.round}${plan.qty ? ` · ${plan.qty.toLocaleString("th-TH")} ชิ้น` : ""}) — ส่งรอบนั้นให้จบก่อนค่อยผูก`;
  if (o.shipments?.length && remainingToShip(o) <= 0) return "ของส่งออกไปครบทุกรอบแล้ว";
  if (o.pickedUp) return "ลูกค้ามารับของไปแล้ว";
  // "จัดส่งแล้ว" ที่ไม่มีเลข = ใบมารับเองที่แพ็คเสร็จรอมารับ → ยังเอาไปใส่กล่องใบหลักได้
  if (o.status === "จัดส่งแล้ว" && !o.packedAt) return "จัดส่งแล้ว";
  return "";
}

/** 🚚 จำนวนชิ้น (ตามป้ายบนรูปแบบงาน) ที่ยังไม่ได้ส่งออกไป — ใบที่ไม่เคยแบ่งส่ง = ทั้งใบ */
export function remainingToShip(o: Order): number {
  let n = 0;
  proofShipStates(o).forEach((st) => (n += st.remaining));
  return n;
}

/**
 * 🚚 ป้ายสั้น ๆ ว่าใบนี้แบ่งส่งไปแล้วเท่าไร เหลือเท่าไร ("" = ไม่เคยแบ่งส่ง) — โชว์ในรายการเลือก/แถบใบที่ผูก
 * ให้คนหน้างานรู้ว่ากล่องรวมนี้ใส่ "เฉพาะที่เหลือ" ไม่ใช่ทั้งใบ
 */
export function partialShipNote(o: Order): string {
  const s = partialShipSummary(o);
  if (!s || (o.tracking ?? "").trim()) return "";
  const left = Math.max(0, s.total - s.shipped);
  return `ส่งไปแล้ว ${s.rounds} รอบ (${s.shipped.toLocaleString("th-TH")}/${s.total.toLocaleString("th-TH")} ชิ้น) · เหลือ ${left.toLocaleString("th-TH")} ชิ้นไปกล่องรวม`;
}

/**
 * ใบนี้ "ของออกจากร้านไปแล้ว" หรือยัง — รวมกล่องไม่ได้ทั้งเป็นใบหลักและใบตาม
 * ใช้คัดใบพวกนี้ออกจากรายการให้เลือก: โชว์ไว้พร้อมเหตุผลทำให้แอดมินสับสนว่ายังรวมได้ (พนักงานแจ้ง 23 ก.ย. 69)
 * ⚠️ ใบมารับเองที่แพ็คเสร็จรอมารับ (จัดส่งแล้ว + packedAt) ยังไม่ออกจากร้าน — ยังเอาไปใส่กล่องใบหลักได้ ห้ามคัดทิ้ง
 */
export function alreadyShipped(o: Order): boolean {
  if ((o.tracking ?? "").trim()) return true;
  // 🚚 แบ่งส่งไปแล้วบางรอบ: ของที่เหลือยังอยู่ในร้าน (25 ก.ย. 69 เดิมคัดทิ้งทั้งก้อน) — ออกครบทุกรอบแล้วค่อยนับว่าออกจากร้าน
  if (o.shipments?.length && remainingToShip(o) <= 0) return true;
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
  // 🏪 ชุดรับพร้อมกัน: ป้ายใบตามต้องยังอ่านเป็น "มารับเอง" (isPickupOrder) ไม่งั้นหลุดจากเมนูลูกค้ามารับเอง/ปุ่มแพ็คเสร็จ
  const pickupSet = isPickupOrder(main);
  const riderLabel = pickupSet ? mainLabel || `มารับเองพร้อม ${main.id}` : mainLabel && !isGenericShipLabel(mainLabel) ? mainLabel : `ส่งรวมกับ ${main.id}`;
  const fillAddress = !pickupSet && !rider.address?.trim() && !!main.address?.trim();
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
    pickupSet ? `🏪 รับพร้อมกับ ${main.id}` : `📦 ส่งรวมกล่องกับ ${main.id}`,
    pickupSet
      ? `ของใบนี้แพ็ครวมกับ ${main.id} ให้ลูกค้ามารับพร้อมกัน — กด "แพ็คเสร็จ"/"ลูกค้ารับของแล้ว" ที่ ${main.id} ใบเดียว ใบนี้ขึ้นให้เอง · วิธีส่ง ${rider.shippingLabel || rider.shipping || "—"} → ${riderLabel}`
      : `ของใบนี้ใส่กล่องไปกับ ${main.id} — ห้ามส่งแยก ยิงเลขพัสดุที่ ${main.id} ใบเดียว · วิธีส่ง ${rider.shippingLabel || rider.shipping || "—"} → ${riderLabel} (ค่าส่งคงเดิม ฿${(rider.shippingCost || 0).toLocaleString("th-TH")})${fillAddress ? " · เติมที่อยู่ตามใบหลัก" : ""}`
  );
  const nextMain = withLog(
    { ...main, shipWith: { role: "main" as const, orders: [...shipRiderIdsOf(main), rider.id], at: main.shipWith?.at ?? at, by: main.shipWith?.by ?? by } },
    by,
    pickupSet ? `🏪 รับของ ${rider.id} มาแพ็ครวม รับพร้อมกัน` : `📦 รับของ ${rider.id} มาส่งรวมกล่อง`,
    pickupSet ? `กดแพ็คเสร็จ/ลูกค้ารับของแล้วที่ใบนี้ = ลงให้ ${rider.id} ด้วย` : `ยิงเลขพัสดุใบนี้ = ลงเลขให้ ${rider.id} ด้วย · ปริ้นใบปะหน้าจากใบนี้ใบเดียว`
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
  /** 🚚 ใบนี้แบ่งส่งไปแล้วบางรอบ — กล่องรวมใส่เฉพาะที่เหลือ (partialShipNote · "" ไม่มี) */
  partial?: string;
};
