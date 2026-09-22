import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  depositInstallments,
  orderBalance,
  orderNetTransfer,
  orderTotal,
  orderWhtAmount,
  withLog,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";
import { formatPrice } from "@/lib/products";
import { itemQtyText } from "@/lib/item-yield";
import { isPickupOrder } from "@/lib/ship-label";
import { isShipMain, isShipRider, shipMainIdOf, shipRiderIdsOf } from "@/lib/ship-with";
import { updateOrder } from "@/lib/server/order-write";

/**
 * แจ้งเตือนลูกค้าผ่าน LINE (push message)
 *
 * ต้องตั้ง env LINE_MESSAGING_ACCESS_TOKEN (จาก LINE Messaging API channel — คนละอันกับ LINE Login)
 *
 * หา "ปลายทาง" ตามลำดับ (คนตั้งใจระบุ ชนะที่ระบบเดา):
 *   1. พนักงานผูก LINE userId ไว้ในออเดอร์ (order.lineUserId) — ยืนยันกับ LINE ตอนบันทึกแล้ว
 *   2. จำจากออเดอร์เก่าของลูกค้าคนเดียวกัน
 *   3. บัญชี LINE ที่ลูกค้าใช้ล็อกอินเว็บ — ท้ายสุด เพราะอาจเป็นคนสั่งแทน/บัญชีร้านเอง
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
/**
 * ค่าที่ "จำ" จากออเดอร์ใบก่อนของลูกค้าคนเดียวกัน — userId ที่ผูกไว้ + ระดับแจ้งเตือนที่ลูกค้าเลือก
 * (จับคู่จาก customerId → เบอร์ → อีเมล) ลูกค้าเก่าจึงไม่ต้องตั้งค่าใหม่ทุกใบ
 */
async function inheritedFromPastOrders(
  sb: SupabaseClient,
  order: Order
): Promise<{ lineUserId?: string; notifyLevel?: NotifyLevel }> {
  const out: { lineUserId?: string; notifyLevel?: NotifyLevel } = {};
  const seen = new Set<string>(); // LINE ที่ใบเก่าของลูกค้าคนนี้ผูกไว้ — เกิน 1 บัญชี = คนละคน ห้ามเดา
  try {
    const { data } = await sb.from("orders").select("data").order("created_at", { ascending: false }).limit(400);
    const phone = (order.phone ?? "").replace(/\D/g, "");
    const email = (order.email ?? "").trim().toLowerCase();
    for (const r of data ?? []) {
      const o = r.data as Order;
      if (o.id === order.id) continue;
      const same =
        (!!order.customerId && o.customerId === order.customerId) ||
        (phone.length >= 8 && (o.phone ?? "").replace(/\D/g, "") === phone) ||
        (!!email && (o.email ?? "").trim().toLowerCase() === email);
      if (!same) continue;
      if (o.lineUserId) seen.add(o.lineUserId);
      if (!out.lineUserId && o.lineUserId) out.lineUserId = o.lineUserId;
      if (!out.notifyLevel && o.notifyLevel) out.notifyLevel = o.notifyLevel;
    }
    /**
     * ⚠️ ใบเก่าของ "เบอร์เดียวกัน" ชี้ไป LINE คนละบัญชี = เดาไม่ได้ว่าใบนี้คือใคร — ไม่เดาดีกว่าส่งผิดคน
     * เบอร์เดียวกันไม่ได้แปลว่าคนเดียวกัน (สั่งแทนกัน/เบอร์ที่ทำงาน/พิมพ์เบอร์ผิด) · ส่งผิด = ข้อมูลออเดอร์
     * ไปโผล่แชทคนอื่น · ใบแบบนี้จะขึ้นแถบแดง "ยังไม่ได้ผูก LINE" ให้พนักงานผูกเอง (ดู lineUserOf ใน admin-data)
     */
    if (seen.size > 1) delete out.lineUserId;
  } catch {
    /* หาไม่เจอก็ถือว่าไม่มี */
  }
  return out;
}

/** ลูกค้าอยากรับแจ้งเตือนแค่ไหน */
export type NotifyLevel = "all" | "key" | "off";

/** ข้อความไหน "สำคัญ" (ส่งแม้ลูกค้าเลือกรับเฉพาะเรื่องสำคัญ) */
export const KEY_STATUSES: OrderStatus[] = ["ชำระแล้ว", "จัดส่งแล้ว", "ยกเลิก"];

/** ระดับแจ้งเตือนที่ใช้จริงกับออเดอร์นี้ (ของใบนี้ → จำจากใบเก่า → ค่าเริ่มต้น all) */
export async function notifyLevelOf(sb: SupabaseClient, order: Order): Promise<NotifyLevel> {
  if (order.notifyLevel) return order.notifyLevel;
  const inh = await inheritedFromPastOrders(sb, order);
  return inh.notifyLevel ?? "all";
}

async function lineTargetOf(sb: SupabaseClient, order: Order): Promise<{ id: string; via: "login" | "bound" | "inherited" } | null> {
  // ลำดับ: สิ่งที่คนตั้งใจระบุ ชนะสิ่งที่ระบบเดาเอง
  // 1) พนักงานผูกไว้ในออเดอร์นี้ (ยืนยันกับ LINE แล้ว) — แม่นสุด
  if (order.lineUserId) return { id: order.lineUserId, via: "bound" };
  // 2) จำจากออเดอร์เก่าของลูกค้าคนเดียวกัน (พนักงานเคยผูกไว้)
  const inherited = (await inheritedFromPastOrders(sb, order)).lineUserId;
  if (inherited) return { id: inherited, via: "inherited" };
  // 3) บัญชี LINE ที่ใช้ล็อกอินเว็บตอนสั่ง — ท้ายสุด เพราะอาจเป็นคนสั่งแทน/บัญชีร้าน ไม่ใช่ผู้รับจริง
  if (order.customerId) {
    try {
      const { data } = await sb.auth.admin.getUserById(order.customerId);
      const lineId = (data?.user?.user_metadata as { line_user_id?: string } | undefined)?.line_user_id;
      if (lineId) return { id: lineId, via: "login" };
    } catch {
      /* ไม่มีก็ไม่มี */
    }
  }
  return null;
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
  what: string,
  /** "key" = เรื่องสำคัญ ส่งเสมอ (ยกเว้นลูกค้าปิดรับ) · "extra" = ความคืบหน้าทั่วไป */
  importance: "key" | "extra" = "key"
): Promise<NotifyResult> {
  // เคารพสิ่งที่ลูกค้าเลือกไว้ — ปิดรับ = ไม่ส่งอะไรเลย · รับเฉพาะสำคัญ = ตัดข่าวคืบหน้าออก
  const level = await notifyLevelOf(sb, order);
  if (level === "off" || (level === "key" && importance === "extra"))
    return { ok: false, reason: level === "off" ? "ลูกค้าปิดรับแจ้งเตือน" : "ลูกค้าเลือกรับเฉพาะเรื่องสำคัญ" };
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
    await updateOrder(sb, next);
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
 * ➗ ยอดที่ลูกค้า "โอนจริง" สำหรับยอดค้างก้อนนี้ — ลูกค้านิติบุคคลหัก ณ ที่จ่ายแล้วโอนน้อยกว่ายอดงวด
 * (OD-260911-6656 · 14 ก.ย. 69: การ์ดไลน์บอกยอดค้าง ฿17,173.50 แต่หน้าออเดอร์บอกโอนจริง ฿16,692 — ลูกค้าเห็นสองยอดไม่ตรงกัน)
 * คืน null เมื่อบอกไม่ได้: ไม่มีหัก ณ ที่จ่าย หรือยอดค้างไม่ใช่ "ทั้งงวด" (โอนมาบางส่วนแล้ว สัดส่วนหักจะไม่ตรง)
 * กติกาเดียวกับหน้าออเดอร์ลูกค้า (netNote ใน app/(shop)/order/[id]/page.tsx)
 */
export function balanceNetTransfer(o: Order, bal: number): { net: number; rateTxt: string } | null {
  const wht = orderWhtAmount(o);
  if (!(wht > 0) || !(bal > 0)) return null;
  const rateTxt = o.wht?.rate ? ` ${o.wht.rate}%` : "";
  const same = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const inst = depositInstallments(o);
  if (inst) {
    // ค้างงวดหลัง (ปกติที่สุด) · ค้างงวดแรก · ค้างทั้งใบ (ยังไม่โอนเลย)
    if (same(bal, inst.second)) return { net: inst.secondNet, rateTxt };
    if (same(bal, inst.first)) return { net: inst.firstNet, rateTxt };
    if (same(bal, inst.first + inst.second)) return { net: orderNetTransfer(o), rateTxt };
    return null;
  }
  return same(bal, orderTotal(o)) ? { net: orderNetTransfer(o), rateTxt } : null;
}

/**
 * ข้อความแจ้งลูกค้าเมื่อ "สถานะออเดอร์เปลี่ยน" — ครบทุกสถานะ ลูกค้าจะได้รู้ความคืบหน้าตลอดทาง
 * เขียนแบบลูกค้าอ่านรู้เรื่อง ไม่ใช่ศัพท์หลังบ้าน · คืน null = สถานะนั้นไม่ต้องแจ้ง
 */
/** 📦 ส่งรวมกล่อง (lib/ship-with.ts): บรรทัดบอกลูกค้าว่ากล่องนี้มีของออเดอร์ไหนรวมอยู่ด้วย ("" = ไม่ได้ส่งรวม) */
function shipWithLine(order: Order): string {
  if (isShipMain(order)) return `📦 กล่องนี้รวมของออเดอร์ ${shipRiderIdsOf(order).join(", ")} ไปด้วยครับ`;
  if (isShipRider(order)) return `📦 ส่งรวมกล่องเดียวกับออเดอร์ ${shipMainIdOf(order)} ครับ`;
  return "";
}

export function statusMessage(order: Order, link: string): string | null {
  const id = order.id;
  // ยอดค้างต้องคิดเหมือนหน้าออเดอร์ทุกบาททุกสตางค์ (orderBalance + formatPrice) ไม่งั้นลูกค้าเทียบกับเว็บแล้วไม่ตรง
  const bal = orderBalance(order);
  const net = balanceNetTransfer(order, bal);
  const owe =
    order.deposit && !order.deposit.settledAt && bal > 0
      ? `\n💳 ยอดค้าง ${formatPrice(bal)} (ชำระก่อนจัดส่ง)` +
        (net ? `\n↳ โอนจริงหลังหัก ณ ที่จ่าย${net.rateTxt} ${formatPrice(net.net)}` : "")
      : "";
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
      // 🏪 มารับเอง — ไม่มีพัสดุ/เลขพัสดุ ข้อความต้องไม่พูดถึงการจัดส่ง
      if (isPickupOrder(order))
        return `🏪 ออเดอร์ ${id} ${order.shipments?.length ? "แพ็คเสร็จรอบสุดท้ายแล้วครับ ครบทุกรายการ" : "แพ็คเสร็จแล้วครับ"} มารับที่ร้านได้เลย แจ้งเลขออเดอร์ตอนมารับนะครับ\n${link}`;
      // 🚚 เคยแบ่งส่งมาก่อน → บอกว่านี่คือรอบสุดท้าย (เลขรอบก่อนแจ้งไปแล้วตอนส่งรอบนั้น)
      return order.shipments?.length
        ? `🚚 ออเดอร์ ${id} จัดส่งรอบสุดท้ายแล้วครับ ครบทุกรายการ${order.tracking ? `\nเลขพัสดุรอบนี้: ${order.tracking}` : ""}\n${link}`
        : `🚚 ออเดอร์ ${id} จัดส่งแล้วครับ${order.tracking ? `\nเลขพัสดุ: ${order.tracking}` : ""}${shipWithLine(order) ? `\n${shipWithLine(order)}` : ""}\n${link}`;
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
export function statusFlex(
  order: Order,
  link: string,
  /** ปรับหัวการ์ด/ประโยคนำ/altText เอง (เช่นแจ้งแบบงานพร้อมตรวจ N รูป) — ไม่ส่ง = ตามสถานะออเดอร์ */
  opts?: { status?: OrderStatus; headline?: string; alt?: string }
): LineMessage[] {
  const status = opts?.status ?? order.status;
  const alt = opts?.alt ?? statusMessage(order, link) ?? `ออเดอร์ ${order.id}`;
  const tone = STATUS_HEX[status] ?? "#475569";
  const total = orderTotal(order);
  // ยอดค้าง + เงินที่ต้องโอนจริง — ตัวเดียวกับหน้าออเดอร์ ลูกค้าเทียบสองจอแล้วต้องตรงกัน
  const bal = orderBalance(order);
  const owe = !!order.deposit && !order.deposit.settledAt && bal > 0;
  const oweNet = owe ? balanceNetTransfer(order, bal) : null;
  const first = order.items[0];
  const more = order.items.length - 1;
  /*
   * 🔢 งานเซ็ต/แผ่น — "×17" เฉย ๆ ลูกค้าอ่านว่า 17 ชิ้น ทั้งที่เป็น 17 เซ็ต (= 102 ชิ้น)
   * ใช้ข้อความชุดเดียวกับหน้าออเดอร์ (itemQtyText) · รายการเดียวชิ้นเดียวไม่ต้องห้อยจำนวน
   */
  const firstQty = first && (first.qty > 1 || (first.unitYield?.per ?? 1) > 1) ? ` ×${itemQtyText(first)}` : "";
  const items = first ? `${first.name}${firstQty}${more > 0 ? ` และอีก ${more} รายการ` : ""}` : "-";

  const rows: unknown[] = [flexRow("รายการ", items)];
  rows.push(flexRow("ยอดรวม", formatPrice(total), "#0F172A", true));
  if (owe) rows.push(flexRow("ยอดค้าง", formatPrice(bal), "#E11D48", true));
  // ➗ หัก ณ ที่จ่าย: ยอดงวดกับเงินที่โอนจริงคนละตัว — โชว์คู่กันเหมือนหน้าออเดอร์ ไม่งั้นลูกค้าโอนเกิน
  if (oweNet) rows.push(flexRow(`↳ โอนจริงหลังหัก ณ ที่จ่าย${oweNet.rateTxt}`, formatPrice(oweNet.net), "#0F172A", true));
  if (order.status === "จัดส่งแล้ว" && order.tracking && !isPickupOrder(order))
    rows.push(flexRow(order.shipments?.length ? "เลขพัสดุ (รอบสุดท้าย)" : "เลขพัสดุ", order.tracking, "#0F172A", true));
  if (order.status === "จัดส่งแล้ว" && order.tracking && isShipMain(order)) rows.push(flexRow("รวมในกล่อง", shipRiderIdsOf(order).join(", ")));
  if (order.status === "จัดส่งแล้ว" && order.tracking && isShipRider(order)) rows.push(flexRow("ส่งรวมกับ", shipMainIdOf(order)));

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
            // 🏪 มารับเอง: สถานะในระบบคือ "จัดส่งแล้ว" แต่ลูกค้าต้องอ่านว่าแพ็คเสร็จ รอมารับ — ไม่งั้นเข้าใจว่าร้านส่งพัสดุไปแล้ว
            // (ตรงกับ orderStatusLabel ในหน้าเว็บ · เจ้าของร้านเลือกแบบนี้ 17 ก.ย. 69)
            { type: "text", text: status === "จัดส่งแล้ว" && isPickupOrder(order) ? "แพ็คเสร็จ รอมารับ" : status, size: "xl", weight: "bold", color: "#FFFFFF" },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              // 🏪 มารับเอง: "จัดส่งแล้ว" = แพ็คเสร็จ รอมารับ — หัวการ์ดต้องไม่บอกว่าส่งของออกไปแล้ว
              text: opts?.headline ?? (status === "จัดส่งแล้ว" && isPickupOrder(order) ? "แพ็คเสร็จแล้ว — มารับที่ร้านได้เลย" : STATUS_HEADLINE[status]) ?? "",
              size: "sm",
              color: "#334155",
              wrap: true,
            },
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
                      {
                        type: "text",
                        text: oweNet
                          ? `💳 โอน ${formatPrice(oweNet.net)} (หลังหัก ณ ที่จ่าย${oweNet.rateTxt}) แล้วแนบสลิปในหน้าออเดอร์ได้เลย (จัดส่งได้หลังชำระครบ)`
                          : "💳 โอนยอดคงเหลือแล้วแนบสลิปในหน้าออเดอร์ได้เลย (จัดส่งได้หลังชำระครบ)",
                        size: "xs",
                        color: "#BE123C",
                        wrap: true,
                      },
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
