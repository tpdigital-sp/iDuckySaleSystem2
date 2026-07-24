import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/admin-data";

/**
 * แจ้งเตือนลูกค้าผ่าน LINE (push message)
 *
 * ต้องตั้ง env LINE_MESSAGING_ACCESS_TOKEN (จาก LINE Messaging API channel — คนละอันกับ LINE Login)
 * และลูกค้าต้องเคยล็อกอินด้วย LINE (ระบบจึงมี line_user_id เก็บไว้ใน user_metadata)
 *
 * ออกแบบให้ "ไม่พังงานหลัก": ถ้ายังไม่ตั้งคีย์ / ลูกค้าไม่มี LINE / ยิงไม่สำเร็จ → เงียบ ไม่ throw
 */
export async function notifyCustomer(sb: SupabaseClient, order: Order, text: string): Promise<void> {
  try {
    const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
    if (!token || !order.customerId) return;

    const { data } = await sb.auth.admin.getUserById(order.customerId);
    const lineId = (data?.user?.user_metadata as { line_user_id?: string } | undefined)?.line_user_id;
    if (!lineId) return;

    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineId, messages: [{ type: "text", text }] }),
    });
  } catch {
    /* แจ้งเตือนล้มเหลวไม่ควรทำให้งานหลักพัง */
  }
}

/** ลิงก์หน้าเช็คออเดอร์สำหรับแนบในข้อความ (ต้องมี key) */
export function orderLink(origin: string, order: Order): string {
  return `${origin}/order/${encodeURIComponent(order.id)}${order.key ? `?key=${encodeURIComponent(order.key)}` : ""}`;
}
