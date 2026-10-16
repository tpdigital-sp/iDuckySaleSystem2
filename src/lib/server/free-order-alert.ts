import type { Order } from "@/lib/admin-data";
import { SITE_URL } from "@/lib/shop-info";

/**
 * 🎁 "พนักงานกดส่งฟรี — ไม่คิดเงิน" — แจ้งกลุ่มไลน์แอดมินทันทีที่ใบยอด ฿0 ถูกปล่อยเข้าคิวงานโดยไม่มีเงินเข้า
 *
 * เจ้าของร้านสั่ง 16 ต.ค. 69: ปุ่มนี้ปล่อยงานไปผลิต/ส่งได้โดยไม่ผ่านเงินเลย ต้องมีคนเห็นทุกครั้งว่าใครกด ใบไหน เหตุผลอะไร
 * (ถอนป้ายก็แจ้ง — จะได้รู้ว่าใบกลับไปรอเก็บเงิน) · ไปกลุ่มเดียวกับเรื่องเงิน (money = ใบเคลม/ยอดค้าง)
 *
 * ⚠️ ผู้เรียกต้อง await (Netlify แช่เครื่องทันทีที่ตอบ งานค้างหายเงียบ) — ตัวส่งมี timeout ในตัวและไม่ throw
 */
export async function alertFreeOrder(o: Order, by: string, mode: "set" | "unset", reason: string): Promise<void> {
  const items = o.items.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`);
  // โหลดตัวส่งไลน์ตอนจะส่งจริง — line-alert เป็น server-only · สคริปต์ (tsx) ที่ import ประตูเขียนออเดอร์ต้องไม่พังเพราะไฟล์นี้
  const { pushShopAlert } = await import("./line-alert");
  const set = mode === "set";
  await pushShopAlert(
    {
      tone: set ? "#059669" : "#B45309",
      title: set ? "🎁 ส่งฟรี — ไม่คิดเงินกับลูกค้า" : "↩️ ถอนส่งฟรี — กลับไปรอชำระเงิน",
      headline: set
        ? `${by} ปล่อยใบยอด ฿0 เข้าคิวงานโดยไม่มีเงินเข้า · ไม่นับยอดขาย/แต้ม`
        : `${by} ถอนป้ายส่งฟรี · ใบกลับไปรอเก็บเงินตามปกติ`,
      heroLabel: "เลขออเดอร์",
      hero: o.id,
      rows: [
        { label: "ลูกค้า", value: `${o.customer || "ยังไม่ระบุชื่อ"}${o.phone ? ` · ${o.phone}` : ""}` },
        { label: "คนกด", value: by, bold: true },
        { label: "สถานะตอนนี้", value: o.status },
        ...(o.shippingLabel ? [{ label: "วิธีส่ง", value: o.shippingLabel }] : []),
      ],
      bullets: items,
      note: `เหตุผล: ${reason}`,
      button: { label: "เปิดออเดอร์", uri: `${SITE_URL}/admin/orders/${encodeURIComponent(o.id)}` },
      alt: `${set ? "🎁 ส่งฟรี" : "↩️ ถอนส่งฟรี"} ${o.id} · ${by} · ${reason}`,
    },
    { money: true }
  );
}
