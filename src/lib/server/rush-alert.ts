import { orderTotal, type Order } from "@/lib/admin-data";
import { SITE_URL } from "@/lib/shop-info";
import { shortThaiDay } from "@/lib/ship-date";

/**
 * 🔥 "ใบนี้งานเร่ง" — แจ้งกลุ่มไลน์ร้านตอนเงินเข้า (นาทีที่การ์ดขึ้นบอร์ด WIP กราฟฟิก)
 *
 * พนักงานแจ้ง 21 ก.ย. 69: ใบที่ลูกค้าสั่งเองไม่มีใครกดปุ่มงานเร่งให้ กว่ากราฟฟิกจะมาเปิดเจอ
 * ก็อาจเลยรอบส่งผลิตของวันแล้ว → ระบบติ๊กธงให้เอง (lib/rush-auto.ts) แล้วบอกกลุ่มร้านทันทีหนึ่งครั้ง
 *
 * ⚠️ ผู้เรียกต้อง await (Netlify แช่เครื่องทันทีที่ตอบ งานค้างหายเงียบ) — ตัวส่งมี timeout ในตัวและไม่ throw
 */
export async function alertRushOrder(o: Order): Promise<void> {
  const ra = o.rushAuto;
  if (!ra) return;
  const items = o.items.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`);
  const ship = o.shipDate?.from || o.shipDate?.to || "";
  // โหลดตัวส่งไลน์ตอนจะส่งจริง — line-alert เป็น server-only · สคริปต์ซ่อมข้อมูล (tsx) ที่ import ประตูเขียนออเดอร์ต้องไม่พังเพราะไฟล์นี้
  const { pushShopAlert } = await import("./line-alert");
  await pushShopAlert({
    tone: "#E11D48",
    title: "🔥 งานเร่ง — วันใช้งานกระชั้น",
    headline: "ลูกค้าสั่งเองและระบุวันใช้งานกระชั้น · รีบทำแบบให้ทันรอบส่งผลิตของวัน",
    heroLabel: "เลขออเดอร์",
    hero: o.id,
    rows: [
      { label: "ลูกค้า", value: o.customer || "ยังไม่ระบุชื่อ" },
      ...(o.useByDate ? [{ label: "วันใช้งาน", value: shortThaiDay(o.useByDate), bold: true }] : []),
      ...(ship ? [{ label: "ต้องส่งวันที่", value: shortThaiDay(ship), bold: true }] : []),
      { label: "ยอดบิล", value: `${orderTotal(o).toLocaleString("th-TH")} บาท` },
    ],
    bullets: items,
    note: ra.reason,
    button: { label: "เปิดออเดอร์", uri: `${SITE_URL}/admin/orders/${encodeURIComponent(o.id)}` },
    alt: `🔥 งานเร่ง ${o.id} · ${ra.reason}`,
  });
}
