import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderTotal, withLog, type Order } from "@/lib/admin-data";

/**
 * แจ้งเตือนลูกค้าผ่าน LINE (push message)
 *
 * ต้องตั้ง env LINE_MESSAGING_ACCESS_TOKEN (จาก LINE Messaging API channel — คนละอันกับ LINE Login)
 *
 * หา "ปลายทาง" ได้ 2 ทาง (ลองตามลำดับ):
 *   1. ลูกค้าเคยล็อกอินด้วย LINE → มี line_user_id ใน user_metadata
 *   2. พนักงานผูก LINE userId ไว้ในออเดอร์ (order.lineUserId) — ยืนยันกับ LINE ตอนบันทึกแล้ว
 *      ทางที่ 2 สำคัญมาก เพราะลูกค้าส่วนใหญ่สั่งแบบ guest ไม่เคยล็อกอิน LINE บนเว็บ
 *
 * ⚠️ userId ผูกกับ OA แต่ละตัว — ต้องมาจาก OA เดียวกับ token ที่ใช้ส่ง
 *
 * ออกแบบให้ "ไม่พังงานหลัก": ยิงไม่สำเร็จก็แค่คืนเหตุผล ไม่ throw
 */
export interface NotifyResult {
  ok: boolean;
  /** ได้ปลายทางมาจากไหน — ล็อกอินเว็บ · พนักงานผูกไว้ · จำจากออเดอร์เก่าของลูกค้าคนเดิม */
  via?: "login" | "bound" | "inherited";
  /** เหตุผลตอนส่งไม่สำเร็จ (โชว์ให้แอดมิน) */
  reason?: string;
}

/**
 * ดึง LINE userId จากสิ่งที่พนักงานวางมา — รับได้ทั้ง userId ดิบ และลิงก์ที่ "ลงท้ายด้วย userId"
 *
 * ⚠️ ลิงก์จาก OA Manager (chat.line.biz/{account}/chat/{chatId}) ใช้ไม่ได้!
 *    ท่อนท้ายเป็น "chat id" คนละชุดกับ userId ที่ใช้ส่งข้อความ (ยืนยันแล้วด้วยการทดสอบจริง)
 *    ตัวที่ใช้ได้คือ userId จากหน้าคลังแชท (AdminBuddy) — ต้องให้ LINE ยืนยันอีกชั้นเสมอ
 */
export function lineUserIdFrom(input?: string): string | null {
  const t = (input ?? "").trim();
  if (/^U[0-9a-f]{32}$/i.test(t)) return t;
  const m = t.match(/(U[0-9a-f]{32})(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

/** ชื่อ/รูปโปรไฟล์ LINE ของ userId นี้ — null = ส่งข้อความหาคนนี้ไม่ได้ (ไม่ใช่เพื่อน/คนละ OA/ id ผิด) */
export async function fetchLineProfile(userId: string): Promise<{ name: string; picture?: string } | null> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const p = (await res.json()) as { displayName?: string; pictureUrl?: string };
    return p.displayName ? { name: p.displayName, picture: p.pictureUrl } : null;
  } catch {
    return null;
  }
}

/** หา LINE userId ของลูกค้าออเดอร์นี้ (ล็อกอินก่อน → ไม่มีค่อยใช้ลิงก์แชท) */
/** userId ที่เคยผูกไว้ในออเดอร์ใบก่อนของลูกค้าคนเดียวกัน (จับคู่จาก customerId → เบอร์ → อีเมล) */
async function inheritedLineUserId(sb: SupabaseClient, order: Order): Promise<string | null> {
  try {
    const { data } = await sb.from("orders").select("data").order("created_at", { ascending: false }).limit(400);
    const phone = (order.phone ?? "").replace(/\D/g, "");
    const email = (order.email ?? "").trim().toLowerCase();
    for (const r of data ?? []) {
      const o = r.data as Order;
      if (o.id === order.id || !o.lineUserId) continue;
      const same =
        (!!order.customerId && o.customerId === order.customerId) ||
        (phone.length >= 8 && (o.phone ?? "").replace(/\D/g, "") === phone) ||
        (!!email && (o.email ?? "").trim().toLowerCase() === email);
      if (same) return o.lineUserId;
    }
  } catch {
    /* หาไม่เจอก็ถือว่าไม่มี */
  }
  return null;
}

async function lineTargetOf(sb: SupabaseClient, order: Order): Promise<{ id: string; via: "login" | "bound" | "inherited" } | null> {
  if (order.customerId) {
    try {
      const { data } = await sb.auth.admin.getUserById(order.customerId);
      const lineId = (data?.user?.user_metadata as { line_user_id?: string } | undefined)?.line_user_id;
      if (lineId) return { id: lineId, via: "login" };
    } catch {
      /* หาไม่เจอก็ลองทางลิงก์แชทต่อ */
    }
  }
  // พนักงานผูก userId ไว้เอง (ยืนยันกับ LINE ตอนบันทึกแล้ว) — ทางหลักของลูกค้า guest
  if (order.lineUserId) return { id: order.lineUserId, via: "bound" };
  // ลูกค้าเก่า: ใบนี้ยังไม่ได้ผูก แต่เคยผูกไว้ในออเดอร์ใบก่อน → ใช้ของเดิมได้เลย ไม่ต้องผูกซ้ำ
  const inherited = await inheritedLineUserId(sb, order);
  return inherited ? { id: inherited, via: "inherited" } : null;
}

export async function notifyCustomer(sb: SupabaseClient, order: Order, text: string): Promise<NotifyResult> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: "ยังไม่ได้ตั้งค่า LINE (LINE_MESSAGING_ACCESS_TOKEN)" };

  const target = await lineTargetOf(sb, order);
  if (!target)
    return { ok: false, reason: "ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้" };

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
    const via =
      r.via === "bound"
        ? "ผ่าน LINE ที่พนักงานผูกไว้"
        : r.via === "inherited"
          ? "ผ่าน LINE ที่จำจากออเดอร์เก่า"
          : r.via === "login"
            ? "ผ่านบัญชี LINE ที่ล็อกอิน"
            : "";
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

/**
 * ข้อความแจ้งลูกค้าเมื่อ "สถานะออเดอร์เปลี่ยน" — ครบทุกสถานะ ลูกค้าจะได้รู้ความคืบหน้าตลอดทาง
 * เขียนแบบลูกค้าอ่านรู้เรื่อง ไม่ใช่ศัพท์หลังบ้าน · คืน null = สถานะนั้นไม่ต้องแจ้ง
 */
export function statusMessage(order: Order, link: string): string | null {
  const id = order.id;
  const bal = Math.max(0, orderTotal(order) - (order.paidTotal ?? 0));
  const owe = order.deposit && !order.deposit.settledAt && bal > 0 ? `\n💳 ยอดค้าง ${bal.toLocaleString()} บาท (ชำระก่อนจัดส่ง)` : "";
  switch (order.status) {
    case "รอชำระเงิน":
      return `🧾 ออเดอร์ ${id} รอชำระเงินครับ\nโอนแล้วแนบสลิปที่ลิงก์นี้ได้เลย\n${link}`;
    case "รอตรวจสอบ":
      return `🔎 ได้รับสลิปออเดอร์ ${id} แล้ว กำลังตรวจสอบยอดครับ\n${link}`;
    case "ชำระแล้ว":
      return `✅ ยืนยันการชำระเงินออเดอร์ ${id} แล้ว กำลังเริ่มงานให้ครับ${owe}\n${link}`;
    case "รอตรวจแบบ":
      return `🎨 แบบงานออเดอร์ ${id} พร้อมให้ตรวจแล้วครับ\nกดดูแล้วกดอนุมัติ หรือแจ้งจุดที่อยากแก้ได้เลย\n${link}`;
    case "แก้ไขแบบ":
      return `✏️ รับเรื่องขอแก้ไขแบบออเดอร์ ${id} แล้วครับ กำลังแก้ให้ เดี๋ยวส่งให้ตรวจอีกรอบ\n${link}`;
    case "อนุมัติแบบ":
      return `👍 แบบงานออเดอร์ ${id} อนุมัติแล้ว เตรียมเข้าผลิตครับ${owe}\n${link}`;
    case "กำลังผลิต":
      return `🛠️ ออเดอร์ ${id} เข้าไลน์ผลิตแล้วครับ${owe}\n${link}`;
    case "จัดส่งแล้ว":
      return `🚚 ออเดอร์ ${id} จัดส่งแล้วครับ${order.tracking ? `\nเลขพัสดุ: ${order.tracking}` : ""}\n${link}`;
    case "เสร็จสิ้น":
      return `🎉 ปิดงานออเดอร์ ${id} เรียบร้อย ขอบคุณที่ใช้บริการครับ 🦆\n${link}`;
    case "ยกเลิก":
      return `❌ ออเดอร์ ${id} ถูกยกเลิกแล้วครับ หากมีข้อสงสัยทักมาได้เลย`;
    default:
      return null;
  }
}
