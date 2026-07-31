import "server-only";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { orderTotal, type Order } from "@/lib/admin-data";
import { SITE_URL } from "@/lib/shop-info";

/**
 * ส่งออเดอร์ที่ "ชำระแล้ว" ไปหน้าตรวจหลักฐานการชำระของระบบ Admin (msVerify)
 * — เขียนลง Firestore (โปรเจกต์ tpdigital-iducky, db tp-fixflow) collection iduckyPaidOrders
 * หน้า msVerify subscribe collection นี้แล้วแสดงใน subtab "iDucky Store"
 *
 * Fire-and-forget: พังเงียบ (log ไว้) — ห้ามทำให้ flow ยืนยันเงินของร้านล้ม
 * Idempotent: doc id = เลขออเดอร์ + .create() → ยิงซ้ำกี่ครั้งก็มีเรคอร์ดเดียว
 */
export const TP_PAID_COLLECTION = "iduckyPaidOrders";

export async function reportPaidToTP(
  order: Order,
  verifiedBy: string,
  opts?: {
    /** ต่อท้าย doc id — ใช้กับงวดที่สองของออเดอร์มัดจำ (กันชนกับเรคอร์ดงวดแรก) */
    docSuffix?: string;
    /** ยอดของงวดนี้ (ไม่ระบุ = paidTotal/ยอดออเดอร์) */
    amount?: number;
    /** ข้อความต่อท้าย note เช่น "มัดจำ 50% งวดแรก" */
    noteSuffix?: string;
  }
): Promise<void> {
  try {
    const db = getFirestoreAdmin();
    if (!db) return; // ยังไม่ตั้งค่า Firebase — ข้ามเงียบ
    const now = new Date();
    // วันเวลาแบบไทย (Asia/Bangkok) ให้ตรงรูปแบบที่ msVerify ใช้ (date=YYYY-MM-DD, time=HH:MM)
    const th = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const part = (t: string) => th.find((p) => p.type === t)?.value ?? "";
    const itemSummary = order.items
      .map((i) => `${i.name} ×${i.qty}`)
      .join(", ")
      .slice(0, 120);

    await db
      .collection(TP_PAID_COLLECTION)
      .doc(`${order.id}${opts?.docSuffix ?? ""}`)
      .create({
        id: `iducky-${order.id}${opts?.docSuffix ?? ""}`,
        orderId: order.id,
        date: `${part("year")}-${part("month")}-${part("day")}`,
        time: `${part("hour")}:${part("minute")}`,
        customerName: order.customer,
        phone: order.phone || "",
        slipAmount: opts?.amount ?? order.paidTotal ?? orderTotal(order),
        bank: "iDucky Store",
        orderLink: `${SITE_URL}/admin/orders/${encodeURIComponent(order.id)}`,
        note: opts?.noteSuffix ? `${opts.noteSuffix} · ${itemSummary}`.slice(0, 120) : itemSummary,
        verifiedBy,
        paymentStatus: "ชำระแล้ว",
        origin: "iducky",
        createdAt: now.toISOString(),
      });
  } catch (e) {
    // already-exists (ยิงซ้ำ) = ปกติ · อย่างอื่น log ไว้ดู
    const code = (e as { code?: number | string })?.code;
    if (code !== 6 && code !== "already-exists")
      console.error("[tp-report] ส่งออเดอร์ไป msVerify ไม่สำเร็จ:", (e as Error)?.message);
  }
}
