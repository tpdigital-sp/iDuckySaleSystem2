import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, type Order } from "@/lib/admin-data";
import type { Contact } from "@/lib/contacts";

/**
 * 🦆 แต้มสะสมลูกค้า — ลูกค้าเริ่มสะสมแต้มตั้งแต่ออเดอร์แรกที่ชำระครบ
 *
 * บวกเข้า point ของผู้ติดต่อ (ตาราง contacts) + ลงประวัติในตาราง contact_points
 * เรียกจาก: แอดมินกดยืนยัน "ชำระแล้ว" · SlipOK ตรวจผ่านอัตโนมัติ · มัดจำเก็บยอดคงเหลือครบ
 * ยกเลิกออเดอร์ → คืนแต้มที่เคยบวก (revokePointsForOrder)
 *
 * กันบวกซ้ำด้วย id ประวัติที่ตายตัวต่อออเดอร์ (`<contactId>:od:<orderId>`) —
 * SlipOK กับแอดมินกดพร้อมกันก็บวกได้แค่ครั้งเดียว (แบบเดียวกับ cutStockForOrder)
 */

/** กติกาแต้ม: ยอดชำระ 100 บาท = 1 แต้ม (เก็บทศนิยม 2 ตำแหน่ง) — แก้เรทที่บรรทัดนี้ที่เดียว */
export const BAHT_PER_POINT = 100;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** เวลาไทยรูปแบบเดียวกับประวัติที่นำเข้าจากระบบเดิม เช่น "2026-09-07 14:59:11" */
function nowThai(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

type ContactRow = { id: string; data: Contact };

/**
 * หาผู้ติดต่อของออเดอร์ — ผูกไว้ (contactId) ใช้ตัวนั้น
 * ไม่ผูก → จับคู่จากเบอร์โทร ต้องเจอ "คนเดียวเท่านั้น" ถึงใช้ (เจอหลายคน = ไม่เดา กันแต้มเข้าผิดคน)
 */
async function contactForOrder(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, order: Order): Promise<ContactRow | null> {
  if (order.contactId) {
    const { data } = await sb.from("contacts").select("id,data").eq("id", order.contactId).maybeSingle();
    return (data as ContactRow | null) ?? null;
  }
  const digits = String(order.phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  const { data } = await sb.from("contacts").select("id,data").eq("data->>phone", digits).limit(2);
  const rows = (data ?? []) as ContactRow[];
  return rows.length === 1 ? rows[0] : null;
}

/** ออเดอร์ชำระครบ → บวกแต้มให้ผู้ติดต่อ (idempotent ต่อออเดอร์) — fire-and-forget */
export async function awardPointsForOrder(order: Order): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const total = orderTotal(order);
    const amount = round2(total / BAHT_PER_POINT);
    if (amount <= 0) return;
    const hit = await contactForOrder(sb, order);
    if (!hit) return;

    const logId = `${hit.id}:od:${order.id}`;
    // เคยบวกออเดอร์นี้แล้ว → ข้าม (SlipOK + แอดมินกดเปลี่ยนสถานะ ยิงมาซ้ำได้)
    const { data: dup } = await sb.from("contact_points").select("id").eq("id", logId).maybeSingle();
    if (dup) return;
    const { error: insErr } = await sb.from("contact_points").insert({
      id: logId,
      contact_id: hit.id,
      data: {
        at: nowThai(),
        action: "เพิ่มคะแนนสะสม",
        point: amount,
        orderId: order.id,
        note: `ชำระครบ ${total.toLocaleString("th-TH")} บาท (${BAHT_PER_POINT} บาท = 1 แต้ม)`,
      },
    });
    if (insErr) return; // แถวซ้ำ (แข่งกันเข้า) หรือตารางยังไม่ถูกสร้าง — ไม่บวกยอด

    const contact = hit.data;
    const point = round2((Number(contact.point) || 0) + amount);
    // เริ่มสะสมตั้งแต่ออเดอร์แรก — ติดธง pointActive ให้เลย
    await sb.from("contacts").update({ data: { ...contact, point, pointActive: true } }).eq("id", hit.id);
  } catch {
    /* fire-and-forget — แต้มพลาดไม่ควรล้มการบันทึกออเดอร์ */
  }
}

/** ออเดอร์ถูกยกเลิก → คืนแต้มที่เคยบวกจากออเดอร์นี้ (idempotent) — fire-and-forget */
export async function revokePointsForOrder(order: Order): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const hit = await contactForOrder(sb, order);
    if (!hit) return;

    const awardId = `${hit.id}:od:${order.id}`;
    const revokeId = `${awardId}:คืน`;
    const [{ data: award }, { data: revoked }] = await Promise.all([
      sb.from("contact_points").select("data").eq("id", awardId).maybeSingle(),
      sb.from("contact_points").select("id").eq("id", revokeId).maybeSingle(),
    ]);
    if (!award || revoked) return; // ไม่เคยบวก หรือคืนไปแล้ว
    const amount = Number((award.data as { point?: number }).point) || 0;
    if (amount <= 0) return;

    const { error: insErr } = await sb.from("contact_points").insert({
      id: revokeId,
      contact_id: hit.id,
      data: { at: nowThai(), action: "ลบคะแนนสะสม", point: -amount, orderId: order.id, note: "ยกเลิกออเดอร์ — คืนแต้มที่บวกไว้" },
    });
    if (insErr) return;

    const contact = hit.data;
    const point = round2(Math.max(0, (Number(contact.point) || 0) - amount));
    await sb.from("contacts").update({ data: { ...contact, point } }).eq("id", hit.id);
  } catch {
    /* fire-and-forget */
  }
}
