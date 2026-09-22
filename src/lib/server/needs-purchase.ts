import { orderAwaitingStock, orderTotal, type Order } from "@/lib/admin-data";
import { SITE_URL } from "@/lib/shop-info";

/**
 * 🛒 "รอของเข้า / ต้องสั่งของ" (Order.needsPurchase) — ฝั่งเซิร์ฟเวอร์
 *
 * เจ้าของร้านสั่ง 17 ก.ย. 69: ลูกค้ารอของเข้า + โอนแล้วต้องสั่งของ
 * แอดมินติ๊กตอนสร้างคำสั่งซื้อ → พอสถานะเป็น "ชำระแล้ว" ต้องมีแจ้งเตือนให้แอดมิน/ฝ่ายผลิตรู้ว่าใบนี้ต้องสั่งของเพิ่ม
 *
 * กติกาแจ้งเตือนอยู่ที่ประตูเขียนออเดอร์ (order-write.ts) ที่เดียว — เงินเข้าได้หลายทาง
 * (SlipOK อัตโนมัติ · แอดมินกดยืนยัน · รับสลิปใบเพิ่ม · เก็บตก cron · FlowAccount ที่จ่ายแล้ว)
 * ทางเข้าใหม่ได้ไปด้วยเอง ไม่ต้องจำว่าต้องเรียก · กันแจ้งซ้ำด้วยตรา needsPurchase.alertedAt
 */

/** ตราตอนแอดมินติ๊ก — ใช้ร่วมกันทุกทางสร้างออเดอร์ของหลังบ้าน */
export function needsPurchaseStamp(by: string, note?: string): NonNullable<Order["needsPurchase"]> {
  const n = (note ?? "").trim().slice(0, 200);
  return { by, at: new Date().toISOString(), ...(n ? { note: n } : {}) };
}

/** เงินเข้าแล้ว (ชำระแล้วเป็นต้นไป) — ยังไม่จ่าย/รอตรวจสลิป/ยกเลิก ยังไม่ต้องสั่งของ */
function paidState(o: Order): boolean {
  return o.status !== "รอชำระเงิน" && o.status !== "รอตรวจสอบ" && o.status !== "ยกเลิก";
}

/**
 * เรียกที่ประตูก่อนบันทึก: ถึงเวลาแจ้ง "ต้องสั่งของ" หรือยัง
 * - คงตรา alertedAt ของเดิมไว้ (หน้าจอค้างส่งก้อนที่ไม่มีตรามา ต้องไม่ทำให้เด้งซ้ำ) — เทียบด้วย at ของการติ๊กครั้งเดียวกัน
 *   ยกเลิกติ๊กแล้วติ๊กใหม่ = at ใหม่ = เรื่องใหม่ แจ้งใหม่ได้
 * - คืน due=true เมื่อใบนี้เงินเข้าแล้ว + ยังรอของ + ยังไม่เคยแจ้ง → ผู้เรียกบันทึกให้ผ่านก่อนแล้วค่อยส่ง
 */
export function stampNeedsPurchaseAlert(prev: Order | null | undefined, next: Order): { order: Order; due: boolean } {
  const np = next.needsPurchase;
  if (!np) return { order: next, due: false };
  const old = prev?.needsPurchase;
  let cur = np;
  if (!cur.alertedAt && old?.alertedAt && old.at === cur.at) cur = { ...cur, alertedAt: old.alertedAt };
  const due = !cur.alertedAt && paidState(next) && orderAwaitingStock({ needsPurchase: cur });
  if (due) cur = { ...cur, alertedAt: new Date().toISOString() };
  return { order: cur === np ? next : { ...next, needsPurchase: cur }, due };
}

/**
 * ส่งการ์ดเข้ากลุ่ม LINE ร้าน — ⚠️ ผู้เรียกต้อง await (Netlify แช่เครื่องทันทีที่ตอบ งานค้างหายเงียบ)
 * ตัวส่งมี timeout ในตัวและไม่ throw จึงไม่ทำให้การบันทึกออเดอร์ล้ม
 */
export async function alertNeedsPurchase(o: Order): Promise<void> {
  const np = o.needsPurchase;
  if (!np) return;
  const items = o.items.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`);
  // โหลดตัวส่งไลน์ตอนจะส่งจริง — line-alert เป็น server-only · สคริปต์ซ่อมข้อมูล (tsx) ที่ import ประตูเขียนออเดอร์ต้องไม่พังเพราะไฟล์นี้
  const { pushShopAlert } = await import("./line-alert");
  await pushShopAlert({
    tone: "#C9425F",
    title: "🛒 ลูกค้าโอนแล้ว — ต้องสั่งของ",
    headline: "ใบนี้รอของเข้า สั่งของได้เลย · ของเข้าแล้วกด “ของเข้าแล้ว” ในหน้าออเดอร์ กราฟฟิกถึงจะส่งเข้าผลิต",
    heroLabel: "เลขออเดอร์",
    hero: o.id,
    rows: [
      { label: "ลูกค้า", value: o.customer || "ยังไม่ระบุชื่อ" },
      { label: "ยอดบิล", value: `${orderTotal(o).toLocaleString("th-TH")} บาท` },
      ...(o.useByDate ? [{ label: "วันใช้งาน", value: o.useByDate, bold: true }] : []),
      { label: "คนติ๊ก", value: np.by },
    ],
    bullets: items,
    ...(np.note ? { note: `ต้องสั่ง: ${np.note}` } : {}),
    button: { label: "เปิดออเดอร์", uri: `${SITE_URL}/admin/orders/${encodeURIComponent(o.id)}` },
    alt: `🛒 ${o.id} ลูกค้าโอนแล้ว ต้องสั่งของ${np.note ? ` — ${np.note}` : ""}`,
  });
}

/**
 * 📦 ของเข้าร้านแล้ว → บอกลูกค้าทางไลน์ (ข่าวคืบหน้า = ระดับ extra เคารพสิ่งที่ลูกค้าเลือกรับ)
 * ใช้ร่วมกันทั้ง PATCH หน้าออเดอร์ และปุ่ม "ของเข้าแล้ว" ในหน้า /admin/stock-wait — ข้อความต้องเป็นชุดเดียว
 * notify.ts เป็น server-only → โหลดตอนจะส่งจริง (เหตุผลเดียวกับ alertNeedsPurchase)
 */
export async function notifyStockArrived(sb: unknown, o: Order, origin: string): Promise<void> {
  if (o.status === "ยกเลิก") return;
  const { notifyCustomerLogged, orderLink, orderNotice } = await import("./notify");
  const link = orderLink(origin, o);
  await notifyCustomerLogged(
    sb as Parameters<typeof notifyCustomerLogged>[0],
    o,
    orderNotice(o, link, {
      tone: "stockIn",
      head: "ของเข้าร้านแล้ว",
      headline: "สินค้าสำหรับออเดอร์นี้เข้าร้านแล้วครับ",
      note: "ทางร้านจะเริ่มผลิตให้ทันทีที่แบบงานได้รับการอนุมัติ",
      alt: `📦 สินค้าสำหรับออเดอร์ ${o.id} เข้าร้านแล้วครับ\nทางร้านจะเริ่มผลิตให้ทันทีที่แบบงานได้รับการอนุมัติ — ดูสถานะได้ที่ลิงก์นี้เลย\n${link}`,
    }),
    "แจ้งลูกค้า: ของเข้าร้านแล้ว",
    "extra"
  );
}
