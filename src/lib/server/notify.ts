import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  depositInstallments,
  orderBalance,
  orderNetTransfer,
  orderTotal,
  orderWhtAmount,
  trackingBoxes,
  withLog,
  type FollowUpRound,
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

  const push = (messages: unknown[]) =>
    fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: target.id, messages }),
      signal: AbortSignal.timeout(10_000),
    });

  try {
    const messages = typeof msg === "string" ? [{ type: "text", text: msg }] : msg;
    let res = await push(messages);
    /**
     * 🛟 การ์ด Flex ผิดรูป = LINE ตอบ 400 แล้ว "ลูกค้าไม่ได้ข้อความเลย" — เรื่องเงิน/จัดส่งหายเงียบไม่ได้
     * ตกลงมาเป็นข้อความล้วนจาก altText (เนื้อความชุดเดียวกับก่อนเปลี่ยนเป็นการ์ด) แล้วส่งอีกครั้ง
     * 400 เท่านั้น — 401/403/429 เป็นเรื่อง token/ลูกค้าบล็อก/โควตา ส่งซ้ำก็ไม่ผ่าน (ดู scripts/flex-messages-test.mts)
     */
    if (res.status === 400 && typeof msg !== "string" && msg.some((m) => m.type === "flex")) {
      const text = msg.map((m) => (m.type === "flex" ? m.altText : m.text)).join("\n");
      console.error(`[notify] การ์ด Flex ของออเดอร์ ${order.id} ถูก LINE ตีกลับ — ส่งเป็นข้อความล้วนแทน`);
      res = await push([{ type: "text", text }]);
    }
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
  // 🏪 ชุดรับพร้อมกัน (มารับเองทั้งคู่) — ไม่มีกล่อง/เลขพัสดุ บอกว่ารับพร้อมกันได้เลย
  if (isPickupOrder(order)) {
    if (isShipMain(order)) return `🏪 แพ็ครวมของออเดอร์ ${shipRiderIdsOf(order).join(", ")} ไว้ด้วยแล้ว รับพร้อมกันได้เลยครับ`;
    if (isShipRider(order)) return `🏪 แพ็ครวมกับออเดอร์ ${shipMainIdOf(order)} รับพร้อมกันได้เลยครับ`;
    return "";
  }
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
        return `🏪 ออเดอร์ ${id} ${order.shipments?.length ? "แพ็คเสร็จรอบสุดท้ายแล้วครับ ครบทุกรายการ" : "แพ็คเสร็จแล้วครับ"} มารับที่ร้านได้เลย แจ้งเลขออเดอร์ตอนมารับนะครับ${shipWithLine(order) ? `\n${shipWithLine(order)}` : ""}\n${link}`;
      // 🚚 เคยแบ่งส่งมาก่อน → บอกว่านี่คือรอบสุดท้าย (เลขรอบก่อนแจ้งไปแล้วตอนส่งรอบนั้น)
      {
        // 📮 หลายกล่องในใบเดียว → ไล่เลขทุกกล่อง (กล่องที่ 1/2/…) ไม่งั้นลูกค้าได้เลขเดียวทั้งที่มี 2 พัสดุ
        const boxes = trackingBoxes(order);
        const trackLines =
          boxes.length > 1
            ? `\n${boxes.map((b) => `เลขพัสดุ กล่องที่ ${b.box}${b.note ? ` (${b.note})` : ""}: ${b.tracking}`).join("\n")}`
            : order.tracking
              ? `\n${order.shipments?.length ? "เลขพัสดุรอบนี้" : "เลขพัสดุ"}: ${order.tracking}`
              : "";
        return order.shipments?.length
          ? `🚚 ออเดอร์ ${id} จัดส่งรอบสุดท้ายแล้วครับ ครบทุกรายการ${trackLines}\n${link}`
          : `🚚 ออเดอร์ ${id} จัดส่งแล้วครับ${trackLines}${shipWithLine(order) ? `\n${shipWithLine(order)}` : ""}\n${link}`;
      }
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
  // 🔆 เข้มกว่าเดิม (#F0B429) — ตัวอักษรขาวบนเหลืองสดได้ contrast แค่ 1.9:1 อ่านไม่ออกกลางแดด (22 ก.ย. 69)
  รอชำระเงิน: "#B97609",
  รอตรวจสอบ: "#EA7317",
  ชำระแล้ว: "#16A34A",
  รอตรวจแบบ: "#7C3AED",
  แก้ไขแบบ: "#E11D48",
  อนุมัติแบบ: "#0D9488",
  กำลังผลิต: "#4F46E5",
  จัดส่งแล้ว: "#0284C7",
  เสร็จสิ้น: "#475569",
  ยกเลิก: "#78716C", // เทาอุ่น เข้มพอให้ตัวอักษรขาวอ่านออก (เดิม #94A3B8 = 2.6:1) และไม่ชนกับ "เสร็จสิ้น"
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
  if (order.status === "จัดส่งแล้ว" && order.tracking && !isPickupOrder(order)) {
    // 📮 ใบเดียวส่งหลายกล่อง (คนละที่อยู่/ของเยอะ) → ขึ้นทุกเลข ไม่ใช่เลขล่าสุดเลขเดียว
    const boxes = trackingBoxes(order);
    if (boxes.length > 1) boxes.forEach((b) => rows.push(flexRow(`เลขพัสดุ กล่องที่ ${b.box}${b.note ? ` (${b.note})` : ""}`, b.tracking, "#0F172A", true)));
    else rows.push(flexRow(order.shipments?.length ? "เลขพัสดุ (รอบสุดท้าย)" : "เลขพัสดุ", order.tracking, "#0F172A", true));
  }
  if (order.status === "จัดส่งแล้ว" && order.tracking && isShipMain(order)) rows.push(flexRow("รวมในกล่อง", shipRiderIdsOf(order).join(", ")));
  if (order.status === "จัดส่งแล้ว" && order.tracking && isShipRider(order)) rows.push(flexRow("ส่งรวมกับ", shipMainIdOf(order)));
  // 🏪 ชุดรับพร้อมกัน: แพ็คเสร็จ/รับแล้ว — บอกใบที่รับพร้อมกัน ลูกค้าจะได้รู้ว่ามารอบเดียวได้ครบ
  if ((order.status === "จัดส่งแล้ว" || order.status === "เสร็จสิ้น") && isPickupOrder(order) && isShipMain(order)) rows.push(flexRow("รับพร้อมกับ", shipRiderIdsOf(order).join(", ")));
  if ((order.status === "จัดส่งแล้ว" || order.status === "เสร็จสิ้น") && isPickupOrder(order) && isShipRider(order)) rows.push(flexRow("รับพร้อมกับ", shipMainIdOf(order)));

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
              // 🎨 ปุ่มสีเดียวกับหัวการ์ด (เจ้าของร้านสั่ง 22 ก.ย. 69) — การ์ดอ่านเป็นก้อนเดียว ไม่ใช่ฟ้าลอยมาจากไหนไม่รู้
              // ทุกสีในจานผ่าน contrast ≥ 3:1 กับตัวอักษรขาวแล้ว (ดู npm run check:flex)
              color: tone,
              action: { type: "uri", label: "เปิดหน้าออเดอร์", uri: link },
            },
          ],
        },
      },
    },
  ];
}

/* ════════════════════════════════════════════════════════════════════════════
 * 🎴 การ์ดแจ้งเตือนกลาง — ข้อความถึงลูกค้า "ทุกใบ" เป็น Flex (เจ้าของร้านสั่ง 22 ก.ย. 69)
 *
 * เดิม statusFlex ใช้ได้เฉพาะ "แจ้งสถานะออเดอร์" ข้อความอื่น (รับเงิน · ตีราคา · แบ่งส่ง ·
 * ยอดโอนเพิ่ม · เคลม · ของเข้าร้าน) ยังเป็นข้อความล้วน — อ่านยาก ยอดเงินจมอยู่กลางบรรทัด
 *
 * ตัวนี้เป็นโครงเดียวกับ statusFlex (หัวสี → ประโยคนำ → เลขออเดอร์ → แถวข้อมูล → ปุ่ม)
 * แต่ป้อนเนื้อหาเองได้ทุกช่อง · altText = ข้อความล้วนชุดเดิม (โชว์ในแถบแจ้งเตือน + เครื่องที่แสดงการ์ดไม่ได้)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * 🎨 โทนสีการ์ด — "หนึ่งเรื่อง หนึ่งสี" ไม่ซ้ำกันเลยสักใบ (เจ้าของร้านสั่ง 22 ก.ย. 69)
 *
 * รวมกับสีสถานะ 10 สีด้านบน = 31 สีที่ต้องแยกออกจากกันให้ได้ · เลือกด้วยเครื่องจากจานสีโทนสุภาพ
 * (Tailwind 600/700/800) โดยไล่หาชุดที่ "ห่างกันมากที่สุด" แล้วตรวจ 3 ข้อทุกครั้งที่แก้ (npm run check:flex):
 *   1) ไม่มีสีซ้ำ   2) ตัวอักษรขาวบนหัวการ์ดต้องได้ contrast ≥ 3:1 (อ่านออกกลางแดด)
 *   3) ทุกคู่ต้องห่างกัน deltaE ≥ 13 — ใกล้กว่านี้คนแยกไม่ออกว่าคนละการ์ด (ตอนนี้ใกล้สุด 14.1)
 * ⚠️ เพิ่มสีใหม่แล้วเทสตก = สีไปชนของเดิม ให้เลือกสีอื่น อย่าปิดเทส
 */
export type NoticeTone =
  // 💰 เรื่องต้องจ่าย
  | "balanceUp" // ยอดเพิ่ม ต้องโอนเพิ่ม
  | "balanceDown" // ปรับยอดใหม่ (ลดลงแต่ยังต้องโอน)
  | "charge" // ค่าบริการเพิ่ม
  | "quote" // ตีราคางานสั่งทำให้แล้ว
  | "dueLeft" // เหลือยอดค้าง (เข้าไลน์ผลิตแล้ว)
  | "partial" // รับเงินบางส่วน ยังขาด
  // ✅ เงินเข้าแล้ว
  | "depositIn" // รับมัดจำ
  | "settled" // รับยอดคงเหลือครบ
  | "diffIn" // รับยอดส่วนต่างครบ
  | "fullIn" // รับยอดครบ (สลิปใบเพิ่ม)
  | "paidIn" // ยืนยันการชำระเงิน
  | "noMoreDue" // ไม่ต้องโอนเพิ่มแล้ว
  // 🎨 🚚 🏭 🧰
  | "proofReady" // แบบงานพร้อมตรวจ
  | "shipRound" // จัดส่งบางส่วน (มีเลขพัสดุ)
  | "pickupRound" // แพ็คเสร็จบางส่วน (มารับเอง)
  | "shipTogether" // ส่งรวมกล่อง
  | "shipApart" // ยกเลิกส่งรวมกล่อง
  | "shipBox" // เพิ่มเลขพัสดุกล่องที่ 2 ขึ้นไป (ใบเดียวส่งหลายกล่อง)
  | "stockOk" // เช็คสต๊อกเรียบร้อย
  | "stockIn" // ของเข้าร้านแล้ว
  | "claimOpen" // รับเรื่องเคลม
  | "claimUpdate"; // อัปเดตเรื่องเคลม

export const NOTICE_HEX: Record<NoticeTone, string> = {
  balanceUp: "#C2410C",
  balanceDown: "#155E75",
  charge: "#9A3412",
  quote: "#854D0E",
  dueLeft: "#DC2626",
  partial: "#44403C",
  depositIn: "#15803D",
  settled: "#065F46",
  diffIn: "#4D7C0F",
  fullIn: "#65A30D",
  paidIn: "#3F6212",
  noMoreDue: "#059669",
  proofReady: "#C026D3",
  shipRound: "#2563EB",
  pickupRound: "#0891B2",
  shipTogether: "#075985",
  shipApart: "#1E40AF",
  shipBox: "#1E3A8A",
  stockOk: "#6B21A8",
  stockIn: "#86198F",
  claimOpen: "#DB2777",
  claimUpdate: "#9D174D",
};

/** ทุกสีของการ์ดทั้งระบบ (สถานะ + แจ้งเตือน) — เทสจานสีอ่านจากตัวนี้ */
export const ALL_CARD_HEX = (): Record<string, string> => ({ ...STATUS_HEX, ...NOTICE_HEX });

const hexRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/**
 * สีกล่องเน้นท้ายการ์ด — คิดจากสีหัวการ์ดเอง (พื้น = ผสมขาว 90% · ตัวอักษร = เข้มลง 25%)
 * ทำแบบนี้แทนตารางมือ เพราะ 21 โทนต้องดูแลคู่สีมือทั้งหมด = ลืมง่ายและหลุดง่าย
 */
function noteColors(tone: NoticeTone): [string, string] {
  const rgb = hexRgb(NOTICE_HEX[tone]);
  return [toHex(rgb.map((v) => v + (255 - v) * 0.9)), toHex(rgb.map((v) => v * 0.75))];
}

export interface NoticeRow {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}

export interface NoticeCard {
  tone: NoticeTone;
  /** คำบนหัวการ์ด เช่น "ยอดที่ต้องโอนเพิ่ม" */
  head: string;
  /** ประโยคนำใต้หัว — บอกว่าเกิดอะไรขึ้น */
  headline: string;
  /** เลขออเดอร์ (ตัวใหญ่กลางการ์ด) */
  id: string;
  /** ยอดเงินก้อนเด่น — ตัวเลขที่ลูกค้าต้องเห็นก่อนอย่างอื่น */
  hero?: { label: string; value: string };
  rows?: NoticeRow[];
  /** รายการย่อย (รายการที่ส่งรอบนี้ · ราคาที่ตีให้ · อื่น ๆ) */
  bullets?: string[];
  /** กล่องเน้นท้ายการ์ด (สิ่งที่ลูกค้าต้องทำต่อ) */
  note?: string;
  /** ปุ่มท้ายการ์ด — ไม่ส่ง = ไม่มีปุ่ม */
  button?: { label: string; uri: string };
  /** ข้อความล้วนสำหรับแถบแจ้งเตือน (ชุดเดิมก่อนเปลี่ยนเป็นการ์ด) */
  alt: string;
}

/** ตัดข้อความให้ไม่เกินที่ LINE รับ — ยาวเกินแล้ว push ทั้งก้อนไม่ผ่าน (400) ทั้งข้อความ */
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** การ์ดแจ้งเตือนทั่วไป (ไม่ผูกกับสถานะออเดอร์) — ดูหมายเหตุด้านบน */
export function noticeFlex(card: NoticeCard): LineMessage[] {
  const tone = NOTICE_HEX[card.tone];
  const [noteBg, noteFg] = noteColors(card.tone);
  const body: unknown[] = [
    { type: "text", text: cut(card.headline, 300), size: "sm", color: "#334155", wrap: true },
    { type: "text", text: cut(card.id, 60), size: "lg", weight: "bold", color: "#0F172A" },
    { type: "separator", color: "#E2E8F0" },
  ];
  if (card.hero)
    body.push({
      type: "box",
      layout: "vertical",
      backgroundColor: noteBg,
      cornerRadius: "8px",
      paddingAll: "12px",
      contents: [
        { type: "text", text: cut(card.hero.label, 60), size: "xs", color: noteFg },
        { type: "text", text: cut(card.hero.value, 40), size: "xxl", weight: "bold", color: noteFg },
      ],
    });
  if (card.rows?.length)
    body.push({
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: card.rows.map((r) => flexRow(cut(r.label, 60), cut(r.value, 120), r.color ?? "#334155", r.bold)),
    });
  if (card.bullets?.length)
    body.push({
      type: "box",
      layout: "vertical",
      spacing: "xs",
      // ยาวเกิน 8 บรรทัดการ์ดจะสูงจนอ่านยาก — ที่เหลือบอกเป็นจำนวน (ครบ ๆ อยู่ใน altText + หน้าออเดอร์)
      contents: [
        ...card.bullets.slice(0, 8).map((b) => ({ type: "text", text: cut(`• ${b}`, 300), size: "xs", color: "#475569", wrap: true })),
        ...(card.bullets.length > 8
          ? [{ type: "text", text: `• และอีก ${card.bullets.length - 8} รายการ`, size: "xs", color: "#94A3B8", wrap: true }]
          : []),
      ],
    });
  if (card.note)
    body.push({
      type: "box",
      layout: "vertical",
      backgroundColor: noteBg,
      cornerRadius: "8px",
      paddingAll: "10px",
      contents: [{ type: "text", text: cut(card.note, 500), size: "xs", color: noteFg, wrap: true }],
    });

  return [
    {
      type: "flex",
      // altText ยาวเกิน 400 ตัว LINE ตีกลับทั้งข้อความ — ตัดให้พอดีเสมอ
      altText: cut(card.alt, 400),
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: tone,
          paddingAll: "14px",
          contents: [
            { type: "text", text: "iDucky Prints Studio", size: "xs", color: "#FFFFFFCC" },
            { type: "text", text: cut(card.head, 40), size: "xl", weight: "bold", color: "#FFFFFF", wrap: true },
          ],
        },
        body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", contents: body },
        ...(card.button
          ? {
              footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                  {
                    type: "button",
                    style: "primary",
                    height: "sm",
                    color: tone, // ปุ่มสีเดียวกับหัวการ์ด — ดูหมายเหตุใน statusFlex
                    // ป้ายปุ่มเกิน 20 ตัว LINE ไม่รับ
                    action: { type: "uri", label: cut(card.button.label, 20), uri: card.button.uri },
                  },
                ],
              },
            }
          : {}),
      },
    },
  ];
}

/** การ์ดมาตรฐานของออเดอร์ — เติมเลขออเดอร์/ปุ่ม "เปิดหน้าออเดอร์" ให้เอง (ใช้กับข้อความส่วนใหญ่) */
export function orderNotice(order: Order, link: string, card: Omit<NoticeCard, "id" | "button"> & { button?: NoticeCard["button"] }): LineMessage[] {
  return noticeFlex({
    ...card,
    id: order.id,
    button: card.button ?? { label: "เปิดหน้าออเดอร์", uri: link },
  });
}

/**
 * 📦 การ์ด "ส่งของที่ตกค้างให้แล้ว" — ปิดรอบส่งตาม (ใบที่ส่งไปแล้วแต่ของในกล่องไม่ครบ)
 * เจ้าของร้านเคาะ 24 ก.ย. 69: ไลน์ออก "ตอนยิงเลขกล่องส่งตามเท่านั้น" ตอนเปิดรอบไม่ยิง (แอดมินคุยเองในแชท)
 * การ์ดต้องบอกว่ากล่องนี้มีอะไร ไม่งั้นลูกค้าได้เลขพัสดุลอย ๆ แล้วงงว่าสั่งอะไรเพิ่ม
 */
export function followUpNotice(order: Order, link: string, round: FollowUpRound, tracking: string): LineMessage[] {
  const what = round.items.map(
    (it) => `${it.itemName ?? order.items[it.item]?.name ?? "รายการ"} ×${Math.max(1, Math.floor(Number(it.qty) || 1)).toLocaleString("th-TH")} ${it.unit ?? "ชิ้น"}`
  );
  const main = (order.tracking ?? "").trim();
  const pickup = !tracking.trim();
  return orderNotice(order, link, {
    tone: "shipBox",
    head: pickup ? "ของที่ตกค้างพร้อมให้มารับแล้ว" : "ส่งของที่ตกค้างให้แล้ว",
    headline: pickup
      ? "ของที่ยังไม่ได้ไปกับรอบแรก จัดเตรียมไว้ให้แล้ว มารับที่ร้านได้เลยครับ"
      : "ของที่ยังไม่ได้ไปกับกล่องแรก ทางร้านส่งตามไปให้แล้วครับ",
    bullets: what,
    rows: [
      ...(pickup ? [] : [{ label: "เลขพัสดุกล่องนี้", value: tracking, bold: true }]),
      ...(main && !pickup ? [{ label: "กล่องแรก", value: main }] : []),
    ],
    note: "ต้องขออภัยในความไม่สะดวกด้วยครับ 🙏",
    alt: [
      pickup ? `📦 ออเดอร์ ${order.id} — ของที่ตกค้างพร้อมให้มารับแล้วครับ` : `📦 ออเดอร์ ${order.id} — ส่งของที่ตกค้างตามไปให้แล้วครับ`,
      ...what.map((w) => `• ${w}`),
      pickup ? "" : `เลขพัสดุกล่องนี้: ${tracking}`,
      "ต้องขออภัยในความไม่สะดวกด้วยครับ 🙏",
      link,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

/**
 * 🧪 ตรวจการ์ดก่อนส่ง — คืนรายการปัญหา (ว่าง = ผ่าน) · ใช้ในเทส npm run check:flex
 * กติกาที่ LINE ตีกลับทั้งข้อความ (400) ถ้าผิด: altText ≤ 400 · text ห้ามว่าง · ป้ายปุ่ม ≤ 20 · uri ต้อง http(s)
 */
export function checkFlexMessages(msgs: LineMessage[]): string[] {
  const errs: string[] = [];
  const walk = (n: unknown, path: string) => {
    if (Array.isArray(n)) return n.forEach((c, i) => walk(c, `${path}[${i}]`));
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o.type === "text") {
      const t = o.text;
      if (typeof t !== "string" || !t.trim()) errs.push(`${path}: text ว่าง (LINE ไม่รับ)`);
      else if (t.length > 2000) errs.push(`${path}: text ยาว ${t.length} ตัว (เกิน 2000)`);
    }
    if (o.type === "button") {
      const a = o.action as Record<string, unknown> | undefined;
      const label = typeof a?.label === "string" ? a.label : "";
      if (!label) errs.push(`${path}: ปุ่มไม่มีป้าย`);
      else if (label.length > 20) errs.push(`${path}: ป้ายปุ่ม "${label}" ยาว ${label.length} ตัว (เกิน 20)`);
      const uri = typeof a?.uri === "string" ? a.uri : "";
      if (!/^https?:\/\//.test(uri)) errs.push(`${path}: uri ปุ่มไม่ใช่ http(s) — "${uri}"`);
    }
    for (const [k, v] of Object.entries(o)) if (typeof v === "object") walk(v, `${path}.${k}`);
  };
  msgs.forEach((m, i) => {
    if (m.type !== "flex") return;
    if (!m.altText?.trim()) errs.push(`msg[${i}]: altText ว่าง`);
    else if (m.altText.length > 400) errs.push(`msg[${i}]: altText ยาว ${m.altText.length} ตัว (เกิน 400)`);
    walk(m.contents, `msg[${i}].contents`);
  });
  return errs;
}
