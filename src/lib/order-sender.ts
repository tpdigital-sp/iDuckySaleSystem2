import type { Order, OrderSender } from "./admin-data";
import type { ShopInfo } from "./shop-settings";

/**
 * 📮 ผู้ส่งที่ "ควรพิมพ์บนใบปะหน้า" ของออเดอร์ — ใช้ร่วมกันทุกจอ (ใบปะหน้า · ใบปะหน้ารอบแบ่งส่ง · หน้าออเดอร์)
 *
 * ทำไมต้องมี (15 ก.ย. 69): ตัวแทนจำหน่ายฝากเราผลิต+ส่งให้ลูกค้าปลายทางของเขา
 * ปลายทางเปิดกล่องแล้วเห็นชื่อร้านเรา = ตัวแทนโดนตัดหน้า → ต่อใบต้องตั้งชื่อผู้ส่งเองได้
 *
 * กติกา: ช่องไหนตั้งไว้ใช้ตามนั้น · ช่องที่เว้นว่างตกไปใช้ข้อมูลร้านช่องนั้น (ตั้งแค่ชื่อ เบอร์/ที่อยู่ยังเป็นของร้าน)
 * ⚠️ ใช้กับ "ป้ายติดกล่อง" เท่านั้น — ใบเสร็จ/ใบกำกับภาษีต้องเป็นชื่อร้านเราตามกฎหมาย
 */
export interface SenderView {
  name: string;
  phone: string;
  address: string;
  /** ใบนี้ตั้งผู้ส่งเอง (ไม่ใช่ข้อมูลร้าน) — เอาไว้ขึ้นป้ายเตือนคนแพ็ค/คนปริ้น */
  custom: boolean;
}

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** ผู้ส่งที่จะพิมพ์จริง (ตกไปใช้ข้อมูลร้านทีละช่อง) */
export function senderOf(order: Pick<Order, "sender">, shop: ShopInfo): SenderView {
  const s = order.sender;
  const name = t(s?.name);
  const phone = t(s?.phone);
  const address = t(s?.address);
  return {
    name: name || shop.legalName,
    phone: phone || shop.phone,
    address: address || shop.address,
    custom: !!(name || phone || address),
  };
}

/** ใบนี้ตั้งผู้ส่งเองไว้ไหม (มีอย่างน้อย 1 ช่อง) */
export function hasCustomSender(order: Pick<Order, "sender">): boolean {
  const s = order.sender;
  return !!(t(s?.name) || t(s?.phone) || t(s?.address));
}

/** ตัดช่องว่างทิ้ง — ไม่เหลืออะไรเลย = undefined (ลบฟิลด์ กลับไปใช้ข้อมูลร้าน) */
export function cleanSender(raw: OrderSender | null | undefined): OrderSender | undefined {
  const name = t(raw?.name).slice(0, 120);
  const phone = t(raw?.phone).slice(0, 40);
  const address = t(raw?.address).slice(0, 400);
  if (!name && !phone && !address) return undefined;
  return { ...(name ? { name } : {}), ...(phone ? { phone } : {}), ...(address ? { address } : {}) };
}

/** คีย์เทียบผู้ส่งซ้ำ (ใช้รวมรายการ "ผู้ส่งที่เคยใช้") */
export function senderKey(s: OrderSender): string {
  return [t(s.name), t(s.phone), t(s.address).replace(/\s+/g, " ")].join("|");
}

/** สรุปสั้น ๆ ไว้โชว์บนชิป เช่น "ร้านเบนซ์ เบสท์ · 081-016-1542" */
export function senderSummary(s: OrderSender): string {
  return [t(s.name), t(s.phone)].filter(Boolean).join(" · ") || t(s.address).split("\n")[0] || "ผู้ส่ง";
}
