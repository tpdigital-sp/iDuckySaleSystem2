import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withLog, type Order } from "@/lib/admin-data";

/**
 * แจ้งเตือนลูกค้าผ่าน LINE (push message)
 *
 * ต้องตั้ง env LINE_MESSAGING_ACCESS_TOKEN (จาก LINE Messaging API channel — คนละอันกับ LINE Login)
 *
 * หา "ปลายทาง" ได้ 2 ทาง (ลองตามลำดับ):
 *   1. ลูกค้าเคยล็อกอินด้วย LINE → มี line_user_id ใน user_metadata
 *   2. แอดมินวางลิงก์แชทไว้ในออเดอร์ (order.lineChatUrl) → แกะ userId จากลิงก์
 *      ทางที่ 2 สำคัญมาก เพราะลูกค้าส่วนใหญ่สั่งแบบ guest ไม่เคยล็อกอิน LINE บนเว็บ
 *      แต่เกือบทุกคนเคยแชทกับ OA ร้าน (แอดมินจึงมีลิงก์แชทให้วาง)
 *
 * ⚠️ userId ของ LINE ผูกกับ OA แต่ละตัว — ลิงก์แชทต้องมาจาก OA เดียวกับ token ที่ใช้ส่ง
 *
 * ออกแบบให้ "ไม่พังงานหลัก": ยิงไม่สำเร็จก็แค่คืนเหตุผล ไม่ throw
 */
export interface NotifyResult {
  ok: boolean;
  /** ได้ปลายทางมาจากไหน — ล็อกอิน LINE บนเว็บ หรือลิงก์แชทที่แอดมินวางไว้ */
  via?: "login" | "chatlink";
  /** เหตุผลตอนส่งไม่สำเร็จ (โชว์ให้แอดมิน) */
  reason?: string;
}

/** แกะ LINE userId จากลิงก์แชทของ OA Manager — https://chat.line.biz/{oaId}/chat/{userId} */
export function lineUserIdFromChatUrl(url?: string): string | null {
  const m = (url ?? "").match(/chat\.line\.biz\/[^/]+\/chat\/(U[0-9a-f]{32})/i);
  return m ? m[1] : null;
}

/** หา LINE userId ของลูกค้าออเดอร์นี้ (ล็อกอินก่อน → ไม่มีค่อยใช้ลิงก์แชท) */
async function lineTargetOf(sb: SupabaseClient, order: Order): Promise<{ id: string; via: "login" | "chatlink" } | null> {
  if (order.customerId) {
    try {
      const { data } = await sb.auth.admin.getUserById(order.customerId);
      const lineId = (data?.user?.user_metadata as { line_user_id?: string } | undefined)?.line_user_id;
      if (lineId) return { id: lineId, via: "login" };
    } catch {
      /* หาไม่เจอก็ลองทางลิงก์แชทต่อ */
    }
  }
  const fromLink = lineUserIdFromChatUrl(order.lineChatUrl);
  return fromLink ? { id: fromLink, via: "chatlink" } : null;
}

export async function notifyCustomer(sb: SupabaseClient, order: Order, text: string): Promise<NotifyResult> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: "ยังไม่ได้ตั้งค่า LINE (LINE_MESSAGING_ACCESS_TOKEN)" };

  const target = await lineTargetOf(sb, order);
  if (!target)
    return { ok: false, reason: "ไม่รู้ LINE ของลูกค้า — ยังไม่เคยล็อกอินด้วย LINE และไม่มีลิงก์แชทในออเดอร์" };

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: target.id, messages: [{ type: "text", text }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, via: target.via };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    // 403 = ลูกค้าบล็อก OA หรือไม่ได้เป็นเพื่อน · 401 = token ผิด/หมดอายุ · 429 = โควตาข้อความหมด
    const hint =
      res.status === 403
        ? "ลูกค้าบล็อกบัญชีร้าน หรือไม่ได้เป็นเพื่อนกับ OA"
        : res.status === 401
          ? "LINE token ไม่ถูกต้อง/หมดอายุ"
          : res.status === 429
            ? "โควตาข้อความของ LINE OA หมดแล้ว"
            : body?.message || `LINE ตอบกลับ ${res.status}`;
    return { ok: false, via: target.via, reason: hint };
  } catch {
    return { ok: false, via: target.via, reason: "ต่อ LINE ไม่ได้ (เน็ต/ปลายทางไม่ตอบ)" };
  }
}

/**
 * ส่ง + บันทึกผลลงประวัติออเดอร์ — ใช้แทน notifyCustomer ในงานที่ "ต้องรู้ว่าถึงลูกค้าไหม"
 * อ่านออเดอร์สดจากฐานก่อนเขียน กันทับงานที่ผู้เรียกเพิ่งบันทึกไป
 */
export async function notifyCustomerLogged(sb: SupabaseClient, order: Order, text: string, what: string): Promise<NotifyResult> {
  const r = await notifyCustomer(sb, order, text);
  // ยังไม่ได้ตั้งค่า LINE = ปัญหาระดับระบบ ไม่ใช่ของออเดอร์ใบนี้ — ไม่ต้องรกประวัติทุกใบ
  if (!r.ok && r.reason?.startsWith("ยังไม่ได้ตั้งค่า LINE")) return r;
  try {
    const { data: row } = await sb.from("orders").select("data").eq("id", order.id).maybeSingle();
    if (!row) return r;
    const fresh = row.data as Order;
    const via = r.via === "chatlink" ? "ผ่านลิงก์แชท" : r.via === "login" ? "ผ่านบัญชี LINE ที่ล็อกอิน" : "";
    const next = withLog(
      fresh,
      "LINE",
      r.ok ? "แจ้งลูกค้าทางไลน์แล้ว" : "แจ้งลูกค้าทางไลน์ไม่สำเร็จ",
      `${what}${via ? ` · ${via}` : ""}${r.reason ? ` · ${r.reason}` : ""}`
    );
    await sb.from("orders").update({ data: next }).eq("id", order.id);
  } catch {
    /* บันทึกไม่ได้ก็ไม่ควรทำให้งานหลักพัง */
  }
  return r;
}

/** ลิงก์หน้าเช็คออเดอร์สำหรับแนบในข้อความ (ต้องมี key) */
export function orderLink(origin: string, order: Order): string {
  return `${origin}/order/${encodeURIComponent(order.id)}${order.key ? `?key=${encodeURIComponent(order.key)}` : ""}`;
}
