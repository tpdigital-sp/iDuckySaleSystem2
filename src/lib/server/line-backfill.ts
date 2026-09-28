import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/admin-data";
import { isQuotaMiss, missedLineNotifies, notifyCustomerLogged, orderLink, statusFlex, statusMessage } from "@/lib/server/notify";
import { sendProofNotify } from "@/lib/server/proof-notify";

export interface BackfillResult {
  /** เรื่องที่พลาดไป (จากประวัติ) — ว่าง = ไม่มีอะไรค้าง ไม่ได้ส่ง */
  missed: string[];
  /** ส่งอะไรถึงลูกค้า เช่น 'การ์ดสถานะ "ชำระแล้ว"' · null = ไม่ได้ส่ง */
  resent: string | null;
  /** ส่งไม่ได้เพราะอะไร (null = ไม่ได้พยายามส่ง หรือส่งถึงแล้ว) */
  resentError: string | null;
  /** ใบล่าสุดหลังบันทึกประวัติ */
  latest: Order;
}

/**
 * 📨 ส่งย้อนหลัง: ระหว่างที่ส่งไม่ถึง (ยังไม่ผูก LINE / โควตา LINE หมด) มีข้อความค้างอยู่ → ส่ง "สถานะล่าสุด" ให้ทีเดียว
 * ไม่ยิงซ้ำทุกข้อความที่พลาด — การ์ดสถานะปัจจุบันครอบคลุมอยู่แล้ว (เงินเข้า+ยอดค้าง / แบบให้ตรวจ / จัดส่ง)
 * ใบที่ไม่เคยพลาดอะไร = เงียบ (ไม่ทักลูกค้าโดยไม่มีเรื่อง)
 *
 * ใช้ 2 ที่: line-bind route (พนักงานเพิ่งผูก LINE · note "ส่งย้อนหลังหลังผูก LINE")
 *          และ cron balance-notify (โควตาเดือนใหม่/ซื้อเพิ่มแล้ว · note "ส่งย้อนหลังหลังโควตากลับมา")
 * ⚠️ วลี "ส่งย้อนหลัง" ในประวัติมีคนอ่าน: lastProofNotify (lib/proof-notify.ts) ถือว่าแบบงานถึงแล้ว
 */
export async function backfillMissedNotifies(
  sb: SupabaseClient,
  order: Order,
  origin: string,
  who: string,
  note: string,
): Promise<BackfillResult> {
  const missed = missedLineNotifies(order);
  let resent: string | null = null;
  let resentError: string | null = null;
  let latest: Order = order;
  if (!missed.length) return { missed, resent, resentError, latest };

  // แบบงานที่พลาด → ส่งการ์ดแบบงานพร้อมจำนวนรูป (ตัวเดียวกับปุ่ม 📣) · ถ้าไม่มีรูปค้างแล้วค่อยตกไปการ์ดสถานะ
  if (missed.some((m) => m.startsWith("แบบงาน"))) {
    const pr = await sendProofNotify(sb, order, origin, who, { force: true, note });
    latest = pr.order;
    if (pr.sent) resent = `แบบงาน ${pr.pending.total} รูป`;
    else if (pr.reason && pr.reason !== "ไม่มีแบบค้างแจ้ง") resentError = pr.reason;
  }
  const link = orderLink(origin, latest);
  if (!resent && !resentError && statusMessage(latest, link)) {
    const r = await notifyCustomerLogged(
      sb,
      latest,
      statusFlex(latest, link),
      `${note} — การ์ดสถานะ "${latest.status}" (ที่พลาดไป: ${missed.join(" / ")})`,
      "key",
    );
    if (r.ok) resent = `การ์ดสถานะ "${latest.status}"`;
    else resentError = r.reason ?? "ส่งไม่สำเร็จ";
  }
  // notifyCustomerLogged/sendProofNotify เพิ่งต่อท้ายประวัติในฐาน — อ่านสดให้คนเรียกเห็นบรรทัดนั้นเลย
  const { data: fresh } = await sb.from("orders").select("data").eq("id", order.id).maybeSingle();
  if (fresh?.data) latest = fresh.data as Order;
  return { missed, resent, resentError, latest };
}

/** ผลส่งย้อนหลังนี้ล้มเพราะโควตายังไม่กลับมา — คนเรียกแบบวนหลายใบควรหยุดรอบนี้ */
export function backfillHitQuota(r: BackfillResult): boolean {
  return isQuotaMiss(r.resentError ?? undefined);
}
