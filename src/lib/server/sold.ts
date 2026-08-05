import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";

/**
 * 🔥 ยอด "ขายแล้ว" อัตโนมัติ — บวกเมื่อออเดอร์ชำระเงินแล้ว
 * หน้าแรกใช้ยอดนี้เรียง "สินค้าขายดี" · การ์ดสินค้าโชว์ "ขายแล้ว N"
 *
 * กันบวกซ้ำด้วยธง soldCounted ในตัวออเดอร์ (สถานะเด้งไปมา/กดยืนยันซ้ำ = บวกครั้งเดียว)
 * ออเดอร์ถูกยกเลิกหลังชำระ → ถอนยอดคืนแล้วล้างธง
 */

type OrderRow = { data: Order & { soldCounted?: boolean } };

async function shift(orderId: string, dir: 1 | -1): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    // อ่านออเดอร์สดจากฐาน (ธงกันซ้ำต้องเป็นค่าล่าสุดเสมอ)
    const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle<OrderRow>();
    if (!row) return;
    const order = row.data;
    if (dir === 1 && order.soldCounted) return; // บวกไปแล้ว
    if (dir === -1 && !order.soldCounted) return; // ยังไม่เคยบวก ไม่มีอะไรให้ถอน

    // รวมจำนวนต่อสินค้า (สินค้าเดียวกันหลายแถวเพราะตัวเลือกต่างกัน)
    const perProduct = new Map<string, number>();
    for (const it of order.items ?? []) {
      if (!it.productId) continue;
      perProduct.set(it.productId, (perProduct.get(it.productId) ?? 0) + (it.qty || 0));
    }

    for (const [pid, qty] of perProduct) {
      const { data: p } = await sb.from("products").select("sold,data").eq("id", pid).maybeSingle();
      if (!p) continue; // สินค้าพิเศษ/ถูกลบ — ข้าม
      const sold = Math.max(0, (Number(p.sold) || 0) + dir * qty);
      // อัปเดตทั้งคอลัมน์ (หน้ารายการ/หน้าแรกใช้) และใน data (หน้าสินค้าใช้)
      const d = (p.data ?? {}) as { sold?: number };
      await sb.from("products").update({ sold, data: { ...d, sold } }).eq("id", pid);
    }

    await sb
      .from("orders")
      .update({ data: { ...order, soldCounted: dir === 1 } })
      .eq("id", orderId);
  } catch {
    // ยอดขายเป็นตัวเลขโชว์หน้าเว็บ ไม่ใช่บัญชี — พลาดแล้วข้าม ไม่ให้ล้มการยืนยันชำระเงิน
  }
}

/** เรียกเมื่อออเดอร์กลายเป็น "ชำระแล้ว" */
export const bumpSoldForOrder = (orderId: string) => shift(orderId, 1);
/** เรียกเมื่อออเดอร์ถูก "ยกเลิก" (ถอนยอดที่เคยบวกคืน) */
export const unbumpSoldForOrder = (orderId: string) => shift(orderId, -1);
