import { NextResponse } from "next/server";
import { getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { pushShopAlert } from "@/lib/server/line-alert";

/**
 * 📦 POST /api/line/goods-receipt-alert  { receiptId }
 *
 * หน้า "รับของเข้า" ของ TP-Leader (goods-receipt-report.html) ยิงมาหลังหัวหน้ากดอนุมัติ
 * → การ์ดเข้าไลน์กลุ่มแอดมิน ผ่านบัญชีแจ้งเตือนของร้าน (/admin/line-groups)
 *
 * ทำไมต้องผ่านที่นี่: เลขห้องกลุ่มผูกกับบัญชี LINE — บอทของ TP (n8n) ส่งเข้ากลุ่มแอดมินไม่ได้
 *
 * ⚠️ หน้า TP เป็นไฟล์ static ใส่รหัสลับไม่ได้ — จึงไม่เชื่ออะไรจากคนเรียกนอกจากเลขใบ:
 *    อ่านใบจาก Firestore เอง · ต้องเป็น approved จริง · ธง lineAlertAt จองใน transaction
 *    (1 ใบแจ้งครั้งเดียว) คนนอกยิงมาได้มากสุด = แจ้งใบที่อนุมัติจริงและยังไม่เคยแจ้ง
 *
 * 📣 แจ้งเฉพาะใบที่ออเดอร์ต้นทางถูกติ๊ก "แจ้งกลุ่มแอดมินเมื่อของเข้า" ในแท็บจัดการคำสั่งซื้อ
 *    (order-request.html#manage → order.notifyAdminOnReceive · ฐาน tpdigitalreciept คนละฐานกับใบรับของ)
 *    ใบที่ไม่ผูกออเดอร์ / ออเดอร์ไม่ได้ติ๊ก = ไม่แจ้ง
 */

export const dynamic = "force-dynamic";

const COLLECTION = "goods_receipts";
const ORDER_DB = "tpdigitalreciept";
const ORDER_COLLECTION = "order";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { receiptId?: unknown } | null;
  const receiptId = typeof body?.receiptId === "string" ? body.receiptId.trim() : "";
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(receiptId)) return json({ ok: false, reason: "bad-id" }, 400);

  const db = getFirestoreAdmin();
  if (!db) return json({ ok: false, reason: "no-firestore" }, 503);

  const ref = db.collection(COLLECTION).doc(receiptId);

  // ออเดอร์ต้นทางต้องติ๊กให้แจ้ง — อ่านก่อนจองธง ใบที่ไม่เข้าเงื่อนไขจะได้ไม่ถูกแตะเลย
  const orderId = String((await ref.get()).data()?.orderRefId || "");
  if (!orderId) return json({ ok: true, sent: false, reason: "no-order" });
  const order = (await getFirestore(getApps()[0]!, ORDER_DB).collection(ORDER_COLLECTION).doc(orderId).get()).data();
  if (order?.notifyAdminOnReceive !== true) return json({ ok: true, sent: false, reason: "not-flagged" });
  let r: FirebaseFirestore.DocumentData | null = null;
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!snap.exists || !d || d.status !== "approved" || d.lineAlertAt) return false;
    r = d;
    tx.update(ref, { lineAlertAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed || !r) return json({ ok: true, sent: false });

  const d = r as FirebaseFirestore.DocumentData;
  const qty = Number(d.quantity) || 0;
  const qtyText = `${qty.toLocaleString("th-TH")}${d.unit ? ` ${d.unit}` : ""}`;
  const item = String(d.itemName || "รายการรับของ");
  const total = Number(d.totalPrice) || 0;
  const rows = [
    { label: "จำนวน", value: qtyText, bold: true },
    d.supplier ? { label: "ผู้ขาย/ผู้ส่ง", value: String(d.supplier) } : null,
    d.lot ? { label: "ล็อต", value: String(d.lot) } : null,
    total > 0 ? { label: "มูลค่า", value: `฿${total.toLocaleString("th-TH")}` } : null,
    d.orderRequestedBy?.name ? { label: "ผู้ขอสั่ง", value: String(d.orderRequestedBy.name) } : null,
    { label: "ผู้รับของ", value: `${d.employeeName || "-"}${d.department ? ` (${d.department})` : ""}` },
    { label: "อนุมัติโดย", value: String(d.approvedBy || d.statusChangedBy || "-") },
  ].filter((x): x is { label: string; value: string; bold?: boolean } => !!x);

  const res = await pushShopAlert({
    tone: "#059669",
    title: "📦 อนุมัติรับของเข้าแล้ว",
    heroLabel: "ของที่รับเข้า",
    hero: item.slice(0, 80),
    rows,
    note: d.stockApplied ? "บวกเข้าสต๊อก iDucky แล้ว" : undefined,
    alt: `📦 อนุมัติรับของเข้า: ${item} ${qtyText}`,
  });

  // ส่งไม่ผ่าน → ปลดธง ให้อนุมัติ/กดซ้ำแล้วลองใหม่ได้
  if (!res.ok) {
    await ref.update({ lineAlertAt: FieldValue.delete() }).catch(() => {});
    return json({ ok: false, reason: "push-failed" }, 502);
  }
  return json({ ok: true, sent: true });
}
