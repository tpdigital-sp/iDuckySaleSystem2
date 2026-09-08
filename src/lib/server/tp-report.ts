import "server-only";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
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

/** bucket สลิปส่วนตัว — ต้องเซ็น URL ก่อนถึงจะเปิดดูได้ */
const SLIP_BUCKET = "payment-slips-private";
/** อายุลิงก์สลิปที่ส่งไปให้ msVerify — ยาว 1 ปี เพราะฝั่งนั้นเก็บไว้ดูย้อนหลัง (เซ็นสั้น = รูปเสียตอนเปิดดูทีหลัง) */
const SLIP_URL_TTL_SEC = 365 * 24 * 60 * 60;

/**
 * ลิงก์สลิปสำหรับส่งข้ามระบบ — งวดแรกใช้ order.slipPath · งวดหลัง (มัดจำ 50%) ใช้ deposit.balanceSlipPath
 * ออเดอร์เก่าที่เก็บเป็น public URL ถาวร (slipUrl) ส่งไปตรงๆ ได้เลย
 */
async function slipLinkFor(order: Order, isFinal: boolean): Promise<{ slipUrl: string; slipPath: string }> {
  const path = isFinal ? order.deposit?.balanceSlipPath : order.slipPath;
  if (!path) return { slipUrl: !isFinal && order.slipUrl ? order.slipUrl : "", slipPath: "" };
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return { slipUrl: "", slipPath: path };
    const { data } = await sb.storage.from(SLIP_BUCKET).createSignedUrl(path, SLIP_URL_TTL_SEC);
    return { slipUrl: data?.signedUrl ?? "", slipPath: path };
  } catch {
    return { slipUrl: "", slipPath: path };
  }
}

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
    const isFinal = opts?.docSuffix === "-final";
    const slip = await slipLinkFor(order, isFinal);
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
        // สลิปโอน — msVerify เอาไปโชว์เป็นรูปย่อในตาราง (ลิงก์เซ็นอายุ 1 ปี · เก็บ path ไว้เซ็นใหม่ได้)
        slipUrl: slip.slipUrl,
        slipPath: slip.slipPath,
        slipSignedAt: now.toISOString(),
        verifiedBy,
        // 🔥 งานเร่ง + วันที่ลูกค้าต้องใช้งาน — บอร์ด WIP กราฟฟิกเอาไปติดป้ายแดง/จัดคิว (แก้ทีหลังผ่าน syncRushToTP)
        rush: !!order.rush,
        useByDate: order.useByDate || "",
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

/**
 * แอดมินติ๊ก/ยกเลิก "งานเร่ง" หรือแก้วันที่ลูกค้าต้องใช้งาน หลังออเดอร์ชำระแล้ว → อัปเดตเรคอร์ดสะพานให้บอร์ด WIP เห็นตาม
 * เรคอร์ดมีได้ 2 ใบ (งวดแรก + งวดหลัง -final ของมัดจำ 50%) → ยิงทั้งคู่ · ใบที่ยังไม่มี (ยังไม่ชำระ) = not-found ข้ามเงียบ
 * Fire-and-forget เหมือน reportPaidToTP
 */
export async function syncRushToTP(order: Order): Promise<void> {
  const db = getFirestoreAdmin();
  if (!db) return;
  const patch = { rush: !!order.rush, useByDate: order.useByDate || "", rushUpdatedAt: new Date().toISOString() };
  for (const suffix of ["", "-final"]) {
    try {
      await db.collection(TP_PAID_COLLECTION).doc(`${order.id}${suffix}`).update(patch);
    } catch (e) {
      const code = (e as { code?: number | string })?.code;
      if (code !== 5 && code !== "not-found")
        console.error("[tp-report] อัปเดตงานเร่งไป WIP ไม่สำเร็จ:", (e as Error)?.message);
    }
  }
}
