import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderTotal, withLog, type Order, type OrderStatus } from "@/lib/admin-data";

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

/** ข้อความที่ส่งเข้า LINE ได้ — ข้อความล้วน หรือการ์ด Flex */
export type LineMessage = { type: "text"; text: string } | { type: "flex"; altText: string; contents: unknown };

export async function notifyCustomer(sb: SupabaseClient, order: Order, msg: string | LineMessage[]): Promise<NotifyResult> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: "ยังไม่ได้ตั้งค่า LINE (LINE_MESSAGING_ACCESS_TOKEN)" };

  const target = await lineTargetOf(sb, order);
  if (!target)
    return { ok: false, reason: "ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้" };

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: target.id, messages: typeof msg === "string" ? [{ type: "text", text: msg }] : msg }),
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
export async function notifyCustomerLogged(
  sb: SupabaseClient,
  order: Order,
  msg: string | LineMessage[],
  what: string
): Promise<NotifyResult> {
  const r = await notifyCustomer(sb, order, msg);
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


/** สีประจำสถานะสำหรับการ์ด LINE (hex — Flex ใช้ CSS class ไม่ได้) */
const STATUS_HEX: Record<OrderStatus, string> = {
  รอชำระเงิน: "#F0B429",
  รอตรวจสอบ: "#EA7317",
  ชำระแล้ว: "#16A34A",
  รอตรวจแบบ: "#7C3AED",
  แก้ไขแบบ: "#E11D48",
  อนุมัติแบบ: "#0D9488",
  กำลังผลิต: "#4F46E5",
  จัดส่งแล้ว: "#0284C7",
  เสร็จสิ้น: "#475569",
  ยกเลิก: "#94A3B8",
};

/** พาดหัวสั้น ๆ บนการ์ด (ข้อความยาวอยู่ใน statusMessage สำหรับ altText) */
const STATUS_HEADLINE: Record<OrderStatus, string> = {
  รอชำระเงิน: "รอชำระเงิน — โอนแล้วแนบสลิปได้เลย",
  รอตรวจสอบ: "ได้รับสลิปแล้ว กำลังตรวจสอบยอด",
  ชำระแล้ว: "ยืนยันการชำระเงินแล้ว เริ่มงานให้เลย",
  รอตรวจแบบ: "แบบงานพร้อมให้ตรวจแล้ว",
  แก้ไขแบบ: "รับเรื่องขอแก้ไขแล้ว กำลังแก้ให้",
  อนุมัติแบบ: "อนุมัติแบบแล้ว เตรียมเข้าผลิต",
  กำลังผลิต: "เข้าไลน์ผลิตแล้ว",
  จัดส่งแล้ว: "จัดส่งแล้ว",
  เสร็จสิ้น: "ปิดงานเรียบร้อย ขอบคุณครับ 🦆",
  ยกเลิก: "ออเดอร์ถูกยกเลิกแล้ว",
};

/** แถว "หัวข้อ + ค่า" ในการ์ด */
function flexRow(label: string, value: string, color = "#334155", bold = false) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      { type: "text", text: label, size: "sm", color: "#94A3B8", flex: 2 },
      { type: "text", text: value, size: "sm", color, weight: bold ? "bold" : "regular", flex: 3, align: "end", wrap: true },
    ],
  };
}

/**
 * การ์ดแจ้งสถานะแบบ Flex — อ่านง่ายกว่าข้อความล้วนเยอะ
 * altText ใช้ข้อความเดิม (โชว์ในแถบแจ้งเตือน/เครื่องที่แสดง Flex ไม่ได้)
 */
export function statusFlex(order: Order, link: string): LineMessage[] {
  const alt = statusMessage(order, link) ?? `ออเดอร์ ${order.id}`;
  const tone = STATUS_HEX[order.status] ?? "#475569";
  const total = orderTotal(order);
  const bal = Math.max(0, total - (order.paidTotal ?? 0));
  const owe = !!order.deposit && !order.deposit.settledAt && bal > 0;
  const first = order.items[0];
  const more = order.items.length - 1;
  const items = first ? `${first.name}${first.qty > 1 ? ` ×${first.qty.toLocaleString()}` : ""}${more > 0 ? ` และอีก ${more} รายการ` : ""}` : "-";

  const rows: unknown[] = [flexRow("รายการ", items)];
  rows.push(flexRow("ยอดรวม", `฿${total.toLocaleString()}`, "#0F172A", true));
  if (owe) rows.push(flexRow("ยอดค้าง", `฿${bal.toLocaleString()}`, "#E11D48", true));
  if (order.status === "จัดส่งแล้ว" && order.tracking) rows.push(flexRow("เลขพัสดุ", order.tracking, "#0F172A", true));

  return [
    {
      type: "flex",
      altText: alt,
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: tone,
          paddingAll: "14px",
          contents: [
            { type: "text", text: "iDucky Prints Studio", size: "xs", color: "#FFFFFFCC" },
            { type: "text", text: order.status, size: "xl", weight: "bold", color: "#FFFFFF" },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "16px",
          contents: [
            { type: "text", text: STATUS_HEADLINE[order.status] ?? "", size: "sm", color: "#334155", wrap: true },
            { type: "text", text: order.id, size: "lg", weight: "bold", color: "#0F172A" },
            { type: "separator", color: "#E2E8F0" },
            { type: "box", layout: "vertical", spacing: "sm", contents: rows },
            ...(owe
              ? [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#FFF1F2",
                    cornerRadius: "8px",
                    paddingAll: "10px",
                    contents: [
                      { type: "text", text: "💳 โอนยอดคงเหลือแล้วแนบสลิปในหน้าออเดอร์ได้เลย (จัดส่งได้หลังชำระครบ)", size: "xs", color: "#BE123C", wrap: true },
                    ],
                  },
                ]
              : []),
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "12px",
          contents: [
            {
              type: "button",
              style: "primary",
              height: "sm",
              color: "#2472AE",
              action: { type: "uri", label: "เปิดหน้าออเดอร์", uri: link },
            },
          ],
        },
      },
    },
  ];
}
