import type { SupabaseClient } from "@supabase/supabase-js";
import { proofsOf, withLog, type Order } from "@/lib/admin-data";
import { notifyCustomer, orderLink, statusFlex, type NotifyResult } from "@/lib/server/notify";
import { pendingProofs, type PendingProofs } from "@/lib/proof-notify";

/**
 * ยิงไลน์ "ข้อความเดียว" สรุปแบบงานที่ค้างแจ้งทั้งใบ แล้วปักเวลา proofNotifiedAt + ลงประวัติ
 * — ปักเวลาแม้ส่งไม่ถึง (ลูกค้าไม่ผูก LINE/บล็อก) จะได้ไม่เตือน/ยิงซ้ำทุก 10 นาที · ผลอยู่ในประวัติออเดอร์
 * ใช้ทั้งปุ่ม 📣 ในหน้าออเดอร์ (by = ชื่อพนักงาน) และ cron (by = "ระบบ")
 */
export async function sendProofNotify(
  sb: SupabaseClient,
  order: Order,
  origin: string,
  by: string,
  opts?: { auto?: boolean; force?: boolean }
): Promise<{ pending: PendingProofs; sent: boolean; reason?: string; order: Order }> {
  let pending = pendingProofs(order);
  // force = พนักงานกด "แจ้งอีกครั้ง" ทั้งที่ไม่มีรูปค้าง → ย้ำทุกรูปที่ลูกค้ายังไม่อนุมัติ
  if (!pending.total && opts?.force) {
    const perItem: Record<number, number> = {};
    let added = 0;
    order.items?.forEach((it, i) => {
      const n = proofsOf(it).filter((p) => p.review !== "อนุมัติ").length;
      if (n) {
        perItem[i] = n;
        added += n;
      }
    });
    pending = { added, revised: 0, total: added, perItem };
  }
  if (!pending.total) return { pending, sent: false, reason: "ไม่มีแบบค้างแจ้ง", order };

  const link = orderLink(origin, order);
  const { added, revised } = pending;
  const head =
    added && revised
      ? `🎨 แบบงานออเดอร์ ${order.id} พร้อมให้คุณตรวจแล้ว ${added} รูป และแก้ไขรูปตามที่ขอเรียบร้อยอีก ${revised} รูป`
      : revised
        ? `🎨 ${revised > 1 ? `แก้ไขรูปแบบงาน ${revised} รูป` : "แก้ไขรูปแบบงาน"}ของออเดอร์ ${order.id} เรียบร้อย พร้อมให้คุณตรวจอีกครั้ง`
        : `🎨 แบบงานออเดอร์ ${order.id} พร้อมให้คุณตรวจแล้ว${added > 1 ? ` (${added} รูป)` : ""}`;
  // ส่งเป็นการ์ด Flex หัวม่วง "รอตรวจแบบ" แบบเดียวกับแจ้งสถานะ (ข้อความล้วนไว้เป็น altText บนเครื่องที่โชว์การ์ดไม่ได้)
  const headline =
    added && revised
      ? `แบบงานพร้อมให้ตรวจแล้ว ${added} รูป และแก้ไขรูปตามที่ขอเรียบร้อยอีก ${revised} รูป`
      : revised
        ? `แก้ไขรูปแบบงาน${revised > 1 ? ` ${revised} รูป` : ""}ตามที่ขอเรียบร้อย พร้อมให้ตรวจอีกครั้ง`
        : `แบบงานพร้อมให้ตรวจแล้ว${added > 1 ? ` (${added} รูป)` : ""}`;
  const r: NotifyResult = await notifyCustomer(
    sb,
    order,
    statusFlex(order, link, { status: "รอตรวจแบบ", headline, alt: `${head}\nดู/อนุมัติได้ที่: ${link}` })
  );

  // อ่านสดก่อนเขียน กันทับงานที่คนอื่นเพิ่งบันทึก
  const { data: row } = await sb.from("orders").select("data").eq("id", order.id).maybeSingle();
  const fresh = (row?.data as Order | undefined) ?? order;
  const what = `แบบงาน ${pending.total} รูป${opts?.auto ? " · อัตโนมัติ (ค้างเกินกำหนด)" : opts?.force ? " · แจ้งซ้ำ" : ""}${r.reason ? ` · ${r.reason}` : ""}`;
  const next = withLog(
    { ...fresh, proofNotifiedAt: new Date().toISOString(), savedAt: new Date().toISOString() },
    by,
    r.ok ? "แจ้งลูกค้าทางไลน์แล้ว" : "แจ้งลูกค้าทางไลน์ไม่สำเร็จ",
    what
  );
  await sb.from("orders").update({ data: next }).eq("id", order.id);
  return { pending, sent: r.ok, reason: r.ok ? undefined : r.reason, order: next };
}
