import { withLog, type Order } from "@/lib/admin-data";
import { SITE_URL } from "@/lib/shop-info";
import { updateOrder } from "./order-write";
import { notifyStockArrived } from "./needs-purchase";
import { syncStockWaitToTP } from "./tp-report";
import { TP_ORIGIN, tpOrderDb, tpRequestId } from "./tp-order-bridge";

/**
 * 📦 → 🛒 คำขอใน TP เป็น "ของเข้าแล้ว" → ติ๊ก "ของเข้าแล้ว" ให้ออเดอร์ร้าน (แบบเดียวกับปุ่มในหน้า /admin/stock-buy)
 *
 * TP เปลี่ยนสถานะ "ของเข้าแล้ว" ได้ 6 ที่ (แท็บจัดการคำสั่งซื้อ + หน้ารับของเข้าอีก 5 จุด) → ไม่ไล่ฝังโค้ดทุกที่
 * ใช้ 2 ชั้นแทน: cron ทุก 5 นาทีกวาดเอง (/api/cron/tp-order-sync) + หน้า order-request ยิงทันทีเมื่อเห็น (/api/tp/order-arrived)
 *
 * ⚠️ ไม่เชื่อคนเรียก — อ่านคำขอจาก Firestore เอง ต้อง origin ร้าน + สถานะ "ของเข้าแล้ว" จริง + ตรงกับการติ๊กปัจจุบันของออเดอร์
 *    ทำครั้งเดียวต่อคำขอ (ตรา shopArrivedSyncedAt) · ออเดอร์ที่ติ๊กของเข้าเองไปแล้ว = แค่ประทับตรา
 */

type SB = Parameters<typeof updateOrder>[0];

export type ArrivedResult = { id: string; result: "arrived" | "already" | "skip" | "error"; reason?: string };

export async function applyTPArrived(sb: SB, tpId: string): Promise<ArrivedResult> {
  const col = tpOrderDb();
  if (!col) return { id: tpId, result: "error", reason: "no-firestore" };
  const ref = col.doc(tpId);
  try {
    const snap = await ref.get();
    const t = snap.data();
    if (!t || t.origin !== TP_ORIGIN || !t.shopOrderId) return { id: tpId, result: "skip", reason: "not-shop-request" };
    if (t.status !== "ของเข้าแล้ว") return { id: tpId, result: "skip", reason: "not-arrived" };
    if (t.shopArrivedSyncedAt) return { id: tpId, result: "already" };

    const stamp = (reason: string) => ref.update({ shopArrivedSyncedAt: new Date().toISOString(), shopArrivedResult: reason });
    const { data } = await sb.from("orders").select("data").eq("id", String(t.shopOrderId)).maybeSingle();
    const o = data?.data as Order | undefined;
    // ออเดอร์ถูกยกเลิกติ๊ก/ติ๊กใหม่ไปแล้ว = คำขอนี้ไม่ใช่ของการติ๊กปัจจุบัน → ไม่แตะออเดอร์
    if (!o?.needsPurchase || tpRequestId(o) !== tpId) { await stamp("ไม่ตรงกับการติ๊กปัจจุบันของออเดอร์"); return { id: tpId, result: "skip", reason: "tick-changed" }; }
    if (o.needsPurchase.arrivedAt) { await stamp("ร้านติ๊กของเข้าเองไปแล้ว"); return { id: tpId, result: "already" }; }

    const by = `${String(t.receivedBy || t.orderedBy || "ฝ่ายจัดซื้อ").trim()} (TP)`;
    const next = withLog(
      { ...o, needsPurchase: { ...o.needsPurchase, arrivedAt: new Date().toISOString(), arrivedBy: by } },
      by,
      "🛒 ของเข้าแล้ว — ส่งเข้าผลิตได้",
      `อัปเดตอัตโนมัติจากระบบสั่งของ TP (คำขอ ${tpId})${o.needsPurchase.note ? ` · ${o.needsPurchase.note}` : ""}`
    );
    const { order: saved, error } = await updateOrder(sb, next, { prev: o, by });
    if (error) return { id: tpId, result: "error", reason: error.message };
    // ⏳ รอส่งเสร็จก่อนตอบ — Netlify แช่เครื่องทันทีที่ตอบ (เหมือนปุ่มในหน้า /admin/stock-buy)
    await Promise.all([notifyStockArrived(sb, saved, SITE_URL), syncStockWaitToTP(saved)]);
    await stamp("ติ๊กของเข้าให้ออเดอร์ร้านแล้ว");
    return { id: tpId, result: "arrived" };
  } catch (e) {
    console.error("[tp-order-arrived]", tpId, (e as Error)?.message);
    return { id: tpId, result: "error", reason: (e as Error)?.message };
  }
}

/** กวาดคำขอจากร้านที่ "ของเข้าแล้ว" แต่ยังไม่ได้ติ๊กฝั่งร้าน — ใช้โดย cron */
export async function sweepTPArrived(sb: SB, dry = false): Promise<ArrivedResult[]> {
  const col = tpOrderDb();
  if (!col) return [];
  // เท่ากับ 2 ช่อง (origin + status) ไม่ต้องสร้าง composite index · ตรา shopArrivedSyncedAt คัดในโค้ด
  const snap = await col.where("origin", "==", TP_ORIGIN).where("status", "==", "ของเข้าแล้ว").limit(200).get();
  const todo = snap.docs.filter((d) => !d.data().shopArrivedSyncedAt).map((d) => d.id);
  if (dry) return todo.map((id) => ({ id, result: "skip", reason: "dry-run" }));
  const out: ArrivedResult[] = [];
  for (const id of todo) out.push(await applyTPArrived(sb, id));
  return out;
}
