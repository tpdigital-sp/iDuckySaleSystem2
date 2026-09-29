import { orderItemDiscounts, orderSubtotal, orderTotal, withLog, type Order } from "@/lib/admin-data";
import { overpaidAmount } from "@/lib/payments";
import { couponErrorText, couponLabel, couponMaxUses, couponUses, validateCoupon, type Coupon } from "@/lib/coupons";
import { memberTierMoneyIn, syncOrderMemberTier } from "./order-member-tier";
import type { getSupabaseAdmin } from "./supabase-admin";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const thb = (n: number) => n.toLocaleString("th-TH");

/**
 * 🎟️ แอดมินใส่คูปองให้ออเดอร์ที่มีอยู่แล้ว / ถอดออก — กติกาอยู่ที่นี่ที่เดียว (route แค่ตรวจสิทธิ์ + บันทึก)
 *
 * มีไว้เพราะลูกค้าส่วนใหญ่ได้คูปองมาแล้ว "ทักไลน์ให้แอดมินรวมยอด" ไม่ได้กดสั่งเองผ่านหน้าเว็บ
 * → เดิมคูปองใช้ได้แค่ตอนลูกค้าล็อกอินสั่งเอง (/api/orders) ใบที่พนักงานเปิดให้ไม่มีทางใส่เลย (29 ก.ย. 69)
 *
 * กติกาเดียวกับตอนลูกค้าสั่งเอง: ตัดสิทธิ์แบบ atomic · คูปองต้องลดได้มากกว่าส่วนลดระดับสมาชิกถึงจะใช้ (ไม่งั้นไม่เผาคูปอง)
 * · ฐานคิด = ยอดสินค้าหลังหักส่วนลดรายรายการ (ไม่รวมค่าส่ง) · ใบที่มีเงินเข้าแล้วห้ามลดจนกลายเป็นโอนเกิน
 * ใบที่ไม่มีบัญชีเว็บ (customerId ว่าง): แอดมินยืนยันเองว่าเป็นลูกค้าเจ้าของคูปอง → คูปองที่เจาะจงคนใช้ได้
 *
 * ฟังก์ชันในไฟล์นี้ "ยังไม่บันทึกออเดอร์" — คืนก้อนที่พร้อมบันทึกให้ผู้เรียกส่งเข้าประตู updateOrder เอง
 * (แยกไว้ให้เทสด้วย Supabase ปลอมได้ · npm run check:coupon-admin)
 */

export type CouponFail = { ok: false; status: number; error: string };
export type CouponApplied = { ok: true; order: Order; before: Coupon; code: string; discount: number };

/**
 * ตัวตนผู้ใช้สิทธิ์ที่จะจดลงคูปอง — ดูคอมเมนต์หัวไฟล์
 * ใบไม่มีบัญชีเว็บแต่ผูกผู้ติดต่อที่ "ผูกบัญชีสมาชิกไว้" (contact.memberId) → ใช้ uuid นั้น
 * จะได้เป็นคนเดียวกับตอนลูกค้าล็อกอินสั่งเอง (กัน 1 บัญชี 1 ครั้ง ข้ามช่องทางแอดมิน/เว็บ)
 */
export async function couponRedeemerOf(sb: SB, order: Order, c: Coupon): Promise<string> {
  if (order.customerId) return order.customerId;
  if (order.contactId) {
    try {
      const { data } = await sb.from("contacts").select("data").eq("id", order.contactId).maybeSingle();
      const memberId = (data?.data as { memberId?: string } | undefined)?.memberId;
      if (memberId) return memberId;
    } catch {
      // อ่านผู้ติดต่อไม่ได้ → ใช้คีย์สำรองด้านล่าง ไม่ทำให้ใส่คูปองล้ม
    }
  }
  return c.assignedTo || (order.contactId ? `contact:${order.contactId}` : `order:${order.id}`);
}

/** ใส่คูปองให้ใบนี้: ตรวจ → ตัดสิทธิ์คูปอง (atomic) → คืนออเดอร์ที่ใส่ส่วนลด+log แล้ว (ยังไม่บันทึก) */
export async function applyCouponToOrder(sb: SB, order: Order, rawCode: string, who: string, nowMs = Date.now()): Promise<CouponApplied | CouponFail> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, status: 400, error: "ใส่โค้ดคูปอง" };
  if (order.status === "ยกเลิก") return { ok: false, status: 409, error: "ใบนี้ยกเลิกแล้ว" };
  if (order.dealer) return { ok: false, status: 409, error: "ออเดอร์ตัวแทนจำหน่ายใช้คูปองไม่ได้" };
  if (order.flowAccount) return { ok: false, status: 409, error: "ใบนี้ยอดต้องตรงบิล FlowAccount ที่ออกไปแล้ว — ใส่คูปองไม่ได้" };
  if (order.discount?.couponCode)
    return { ok: false, status: 409, error: `ใบนี้ใช้คูปอง ${order.discount.couponCode} อยู่แล้ว — ถอดออกก่อนถ้าจะเปลี่ยนใบ` };
  if (order.discount && !order.discount.tierId)
    return { ok: false, status: 409, error: `ใบนี้มีส่วนลด "${order.discount.label}" ที่ตกลงกับลูกค้าไว้แล้ว — ใช้ช่องส่วนลดทั้งบิลแทนถ้าจะลดเพิ่ม` };

  const { data: cRow, error: cErr } = await sb.from("coupons").select("data").eq("code", code).maybeSingle();
  if (cErr) return { ok: false, status: 500, error: "อ่านคูปองไม่สำเร็จ" };
  const c = (cRow?.data as Coupon | undefined) ?? null;
  if (!c) return { ok: false, status: 404, error: couponErrorText("notfound") };

  const asCustomer = await couponRedeemerOf(sb, order, c);
  const base = Math.max(0, orderSubtotal(order) - orderItemDiscounts(order));
  const items = order.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.unitPrice }));
  const v = validateCoupon(c, asCustomer, base, nowMs, items);
  if (!v.ok) return { ok: false, status: 409, error: couponErrorText(v.reason) };
  if (v.discount <= 0) return { ok: false, status: 409, error: "คูปองนี้ลดให้ใบนี้ไม่ได้ (ยอดเป็น 0)" };

  // ระดับสมาชิกดีกว่า → ไม่เผาคูปอง (กติกาเดียวกับตอนลูกค้าสั่งเอง)
  const tier = order.discount;
  if (tier?.tierId && v.discount <= tier.amount)
    return {
      ok: false,
      status: 409,
      error: `${tier.label} ลดให้ −฿${thb(tier.amount)} อยู่แล้ว มากกว่าหรือเท่ากับคูปองนี้ (−฿${thb(v.discount)}) — ไม่ตัดสิทธิ์คูปอง`,
    };

  const next: Order = { ...order, discount: { label: couponLabel(c), amount: v.discount, couponCode: code } };
  if (memberTierMoneyIn(order) && overpaidAmount(next) > 0)
    return {
      ok: false,
      status: 409,
      error: `ลดแล้วยอดรวมจะต่ำกว่าเงินที่รับมาแล้ว (โอนเกิน ฿${thb(overpaidAmount(next))} ต้องคืนเงิน) — ใบนี้ใส่คูปองไม่ได้`,
    };

  // ตัดสิทธิ์ 1 ครั้งแบบ atomic — ล็อกที่ตัวนับสำหรับใบหลายสิทธิ์ (ดู /api/orders)
  const at = new Date(nowMs).toISOString();
  const nextUses = couponUses(c) + 1;
  const redeemed: Coupon = {
    ...c,
    uses: nextUses,
    status: nextUses >= couponMaxUses(c) ? "redeemed" : "active",
    redeemedBy: asCustomer,
    redeemedOrderId: order.id,
    redeemedAt: at,
    redemptions: [...(c.redemptions ?? []), { orderId: order.id, customerId: asCustomer, at }].slice(-200),
  };
  const q = sb.from("coupons").update({ data: redeemed }).eq("code", code).eq("data->>status", "active");
  const { data: upd } = await (typeof c.uses === "number" ? q.eq("data->>uses", String(c.uses)) : q).select("code");
  if (!upd || !upd.length) return { ok: false, status: 409, error: couponErrorText("used") };

  const replaced = tier ? ` (แทน${tier.label} −฿${thb(tier.amount)})` : "";
  const updated = withLog(
    next,
    who,
    "🎟️ ใส่คูปองให้ลูกค้า",
    `${couponLabel(c)} −฿${thb(v.discount)}${replaced} · ยอดรวม ฿${thb(orderTotal(order))} → ฿${thb(orderTotal(next))}`
  );
  return { ok: true, order: updated, before: c, code, discount: v.discount };
}

/** บันทึกใบไม่ผ่านหลังตัดสิทธิ์ไปแล้ว → คืนคูปองสภาพเดิม (ล็อกที่เลขใบนี้ กันย้อนสิทธิ์ของคนที่ใช้ต่อทีหลัง) */
export async function rollbackCouponRedeem(sb: SB, before: Coupon, orderId: string): Promise<void> {
  await sb.from("coupons").update({ data: before }).eq("code", before.code).eq("data->>redeemedOrderId", orderId);
}

/** ถอดคูปองออกจากใบ + คืนสิทธิ์ให้คูปอง (ใส่ผิดใบ/ลูกค้าเปลี่ยนใจ) · ระดับสมาชิกที่เคยถูกแทนจะกลับมาเอง */
export async function removeCouponFromOrder(sb: SB, order: Order, who: string): Promise<{ ok: true; order: Order; restored: boolean } | CouponFail> {
  const code = order.discount?.couponCode;
  if (!code || !order.discount) return { ok: false, status: 409, error: "ใบนี้ไม่ได้ใช้คูปอง" };
  if (order.status === "ยกเลิก") return { ok: false, status: 409, error: "ใบนี้ยกเลิกแล้ว" };
  const amount = order.discount.amount;

  const { data: cRow } = await sb.from("coupons").select("data").eq("code", code).maybeSingle();
  const c = (cRow?.data as Coupon | undefined) ?? null;
  let restored = false;
  let restoredNote = "ไม่พบคูปองในระบบ — ไม่ได้คืนสิทธิ์";
  if (c) {
    const mine = (c.redemptions ?? []).some((r) => r.orderId === order.id) || c.redeemedOrderId === order.id;
    if (mine) {
      const rest = (c.redemptions ?? []).filter((r) => r.orderId !== order.id);
      const last = rest[rest.length - 1];
      const nextUses = Math.max(0, couponUses(c) - 1);
      const back: Coupon = {
        ...c,
        ...(typeof c.uses === "number" ? { uses: nextUses } : {}),
        status: c.status === "void" ? "void" : nextUses >= couponMaxUses(c) ? "redeemed" : "active",
        redemptions: rest,
        redeemedBy: last?.customerId,
        redeemedOrderId: last?.orderId,
        redeemedAt: last?.at,
      };
      const q = sb.from("coupons").update({ data: back }).eq("code", code);
      const { data: upd } = await (typeof c.uses === "number" ? q.eq("data->>uses", String(c.uses)) : q.eq("data->>redeemedOrderId", order.id)).select("code");
      if (!upd || !upd.length) return { ok: false, status: 409, error: "คูปองถูกแก้พร้อมกันจากที่อื่น — ลองใหม่อีกครั้ง" };
      restored = true;
      restoredNote = "คืนสิทธิ์คูปองแล้ว";
    } else restoredNote = "คูปองนี้ไม่ได้ถูกตัดสิทธิ์ด้วยใบนี้ — ไม่ได้คืนสิทธิ์";
  }

  const { discount: _drop, ...rest } = order;
  void _drop;
  // ส่วนลดระดับสมาชิกที่เคยถูกคูปองแทน → คิดกลับให้ตามผู้ติดต่อที่ผูก (ถ้าใบยังอยู่ขั้นเก็บเงิน)
  const next = await syncOrderMemberTier(sb, rest as Order);
  const tierBack = next.discount?.tierId ? ` · ${next.discount.label} −฿${thb(next.discount.amount)} กลับมา` : "";
  const updated = withLog(
    next,
    who,
    "ถอดคูปองออกจากใบ",
    `${order.discount.label} −฿${thb(amount)} · ${restoredNote}${tierBack} · ยอดรวม ฿${thb(orderTotal(order))} → ฿${thb(orderTotal(next))}`
  );
  return { ok: true, order: updated, restored };
}
