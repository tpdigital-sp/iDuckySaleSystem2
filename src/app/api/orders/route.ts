import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { paidSpend, tierForSpend, tierDiscountAmount, tiersOf, type Tier } from "@/lib/tiers";
import { couponLabel, validateCoupon, type Coupon } from "@/lib/coupons";
import { giftsFor, giftsToOrder, type GiftPromo, type OrderGift } from "@/lib/gifts";
import { earlyPayAmount, earlyPayOf, EARLY_PAY_LABEL, type EarlyPayDiscount } from "@/lib/early-pay";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getProductServer } from "@/lib/products-server";
import { lotShortfalls, type Product } from "@/lib/products";

// id เรคอร์ดตั้งค่าร้าน (ตรงกับ SETTINGS_ID ใน shop-settings ซึ่งเป็น "use client")
const SETTINGS_ROW = "__shop_payment__";

export const runtime = "nodejs";

function orderNo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const ymd = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `OD-${ymd}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

/** ลูกค้าสั่งซื้อ (guest หรือ สมาชิก) → บันทึกออเดอร์จริง + คิดส่วนลด (ระดับ/คูปอง) ฝั่งเซิร์ฟเวอร์ */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let input: {
    customerName?: string;
    phone?: string;
    address?: string;
    email?: string;
    customerId?: string;
    shipping?: string;
    shippingCost?: number;
    items?: Order["items"];
    note?: string;
    useByDate?: string;
    couponCode?: string;
    /** โหมดพนักงานสั่งแทนลูกค้า — ต้องล็อกอินหลังบ้านและมีสิทธิ์ orders.edit (ตรวจจากคุกกี้ฝั่งเซิร์ฟเวอร์) */
    staffOrder?: boolean;
    /** 📐 ขนาดของแถมที่ลูกค้าเลือก ({ promoId: "9 × 9 cm" }) — ตรวจกับลิสต์ของแอดมินก่อนใช้ */
    giftSizes?: Record<string, string>;
    /** 🎨 ลายที่ลูกค้าแนบให้ของแถม ({ promoId: [url, …] }) — ล้างด้วย sanitizeGiftArtwork ก่อนเก็บ */
    giftArtwork?: Record<string, string[]>;
  };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!input?.customerName?.trim() || !input?.phone?.trim() || !input?.address?.trim())
    return NextResponse.json({ error: "กรอกชื่อ เบอร์ และที่อยู่ให้ครบ" }, { status: 400 });
  if (!Array.isArray(input.items) || input.items.length === 0)
    return NextResponse.json({ error: "ไม่มีรายการสินค้า" }, { status: 400 });

  // สั่งแทนลูกค้า: เช็คว่าเป็นพนักงานจริง (อ้างชื่อเองจากหน้าเว็บไม่ได้) · ออเดอร์ไม่ผูกบัญชี/คูปอง/แต้ม
  let placedBy = "";
  if (input.staffOrder) {
    const staff = await currentActor();
    if (!staff || !can(staff, "orders.edit", await loadRolePerms()))
      return NextResponse.json({ error: "โหมดสั่งแทนลูกค้าใช้ได้เฉพาะพนักงานที่ล็อกอินหลังบ้าน" }, { status: 403 });
    placedBy = staff.name?.trim() || staff.username;
    input.customerId = undefined;
    input.email = undefined;
    input.couponCode = undefined;
  }

  /**
   * 📦 ยอดสั่งขั้นต่ำต่อ "รอบผลิต" (เรทที่ตั้ง minQtyScope: "lot" เช่น สติ๊กเกอร์ UV 3 แผ่น A3 ต่อเนื้อ 1 ชนิด)
   * หน้าสินค้าปล่อยให้ทยอยเพิ่มทีละแผ่น ประตูจริงอยู่ที่ตะกร้า/หน้าชำระเงิน — ตรงนี้กันคนยิง API ตรง
   * แอดมินสั่งแทนลูกค้า (staffOrder) ข้ามได้ — เคสตกลงกับลูกค้าเป็นราย ๆ ไป
   */
  if (!input.staffOrder) {
    const withSel = input.items.filter((i) => i.sel && i.productId);
    const prods = new Map<string, Product>();
    for (const pid of [...new Set(withSel.map((i) => i.productId))]) {
      const p = await getProductServer(pid);
      if (p) prods.set(pid, p);
    }
    const short = lotShortfalls(
      withSel.map((i) => ({ productId: i.productId, selections: i.sel!, qty: i.qty })),
      (id) => prods.get(id)
    );
    if (short.length) {
      const s = short[0];
      return NextResponse.json(
        {
          error:
            `${s.productName}${s.groupLabel ? ` · ${s.groupLabel}` : ""} สั่งขั้นต่ำ ${s.need} ${s.unit} ต่อ 1 รอบผลิต ` +
            `— ตอนนี้มี ${s.have} ${s.unit} ยังขาดอีก ${s.short} ${s.unit}`,
        },
        { status: 400 }
      );
    }
  }

  const subtotal = input.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const now = new Date();
  const id = orderNo(now);
  const cid = input.customerId;

  // ── 1) ส่วนลดระดับสมาชิก ──
  let tierAmount = 0;
  let tierLabel = "";
  if (cid) {
    const [settRes, ordRes] = await Promise.all([
      sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle(),
      sb.from("orders").select("data"),
    ]);
    const configuredTiers = ((settRes.data?.data as { tiers?: Tier[] } | undefined)?.tiers ?? []).filter((t) => t.name?.trim());
    const tiers = tiersOf(configuredTiers.length ? configuredTiers : null);
    const myPaid = (ordRes.data ?? []).map((r) => r.data as Order).filter((o) => o.customerId === cid);
    const tier = tierForSpend(paidSpend(myPaid), tiers);
    tierAmount = tierDiscountAmount(subtotal, tier.discountPct);
    if (tierAmount > 0) tierLabel = `สมาชิก ${tier.name} (${tier.discountPct}%)`;
  }

  // ── 2) คูปอง (ต้องล็อกอิน) — เอาอันที่ดีกว่าระดับ · ใช้ครั้งเดียวแบบ atomic ──
  let discount: Order["discount"] | undefined;
  let redeemedCode: string | null = null; // เก็บไว้ rollback ถ้า insert พัง
  let coupon: { applied: boolean; reason?: string } = { applied: false };
  const couponCode = (input.couponCode ?? "").trim().toUpperCase();

  if (couponCode && cid) {
    const { data: cRow } = await sb.from("coupons").select("data").eq("code", couponCode).maybeSingle();
    const c = (cRow?.data as Coupon | undefined) ?? null;
    const v = validateCoupon(
      c,
      cid,
      subtotal,
      now.getTime(),
      input.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.unitPrice }))
    );
    if (!v.ok) {
      coupon = { applied: false, reason: v.reason };
    } else if (c && v.discount > tierAmount) {
      // ดีกว่าระดับ → ตัดใช้แบบ atomic (update เฉพาะที่ status ยัง active — ยิงพร้อมกันได้แค่คนเดียว)
      const redeemed: Coupon = { ...c, status: "redeemed", redeemedBy: cid, redeemedOrderId: id, redeemedAt: now.toISOString() };
      const { data: upd } = await sb.from("coupons").update({ data: redeemed }).eq("code", couponCode).eq("data->>status", "active").select("code");
      if (upd && upd.length) {
        discount = { label: couponLabel(c), amount: v.discount, couponCode };
        redeemedCode = couponCode;
        coupon = { applied: true };
      } else {
        coupon = { applied: false, reason: "used" }; // ถูกใช้ไปก่อนแล้ว (ชิงพร้อมกัน)
      }
    } else {
      coupon = { applied: false, reason: "worse" }; // คูปองใช้ได้ แต่ส่วนลดระดับดีกว่า → ไม่เผาคูปอง
    }
  }
  // ถ้าไม่ได้ใช้คูปอง → ใช้ส่วนลดระดับ (ถ้ามี)
  if (!discount && tierAmount > 0) discount = { label: tierLabel, amount: tierAmount };

  // ── 3) 🎁 ของแถมฟรีตามจำนวนชิ้น — คิดใหม่ฝั่งเซิร์ฟเวอร์เสมอ (ไม่เชื่อค่าที่หน้าเว็บส่งมา) ──
  let gifts: OrderGift[] = [];
  try {
    const ids = [...new Set(input.items.map((i) => i.productId).filter(Boolean))];
    const [settRes, prodRes] = await Promise.all([
      sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle(),
      ids.length ? sb.from("products").select("id,category").in("id", ids) : Promise.resolve({ data: [] as { id: string; category: string }[] }),
    ]);
    const promos = ((settRes.data?.data as { gifts?: GiftPromo[] } | undefined)?.gifts ?? []).filter((g) => g?.id);
    if (promos.length) {
      const cat = new Map((prodRes.data ?? []).map((r) => [String(r.id), String(r.category ?? "")]));
      // 📐 ขนาดที่ลูกค้าเลือกมา — giftsToOrder ตรวจกับลิสต์ที่แอดมินตั้งไว้อีกชั้น (ไม่ตรง = ใช้ตัวแรก)
      const chosen: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.giftSizes ?? {})) if (typeof v === "string") chosen[k] = v;
      gifts = giftsToOrder(
        giftsFor(
          input.items.map((i) => ({ productId: i.productId, qty: i.qty, selections: i.sel })),
          (id) => cat.get(id),
          promos,
          now.getTime()
        ),
        chosen,
        // 🎨 ลายของแถม — เก็บเฉพาะโปรที่แอดมินตั้ง needArtwork ไว้ (giftsToOrder คัดให้อีกชั้น)
        input.giftArtwork
      );
    }
  } catch {
    // คิดของแถมไม่ได้ = ไม่ควรทำให้สั่งซื้อไม่สำเร็จ — แอดมินเติมให้ทีหลังได้
  }

  // ── 4) ⚡ ส่วนลดโอนไว — ได้ทุกออเดอร์ที่สั่งผ่านเว็บ (ลูกค้าโอนก่อนร้านเริ่มผลิตเสมอ) ──
  // คิดจาก "ยอดสินค้าก่อนค่าส่ง" ตามกติกาที่เจ้าของร้านกำหนด · ใช้พร้อมส่วนลดระดับ/คูปองได้
  // ⚠️ ออเดอร์ที่ยังรอตีราคา (unitPrice 0) จะได้ส่วนลดจากยอดเท่าที่กรอกมา — แอดมินแก้ยอดทีหลังได้ที่หน้าออเดอร์
  let earlyPay: Order["earlyPay"];
  try {
    const { data: settRow } = await sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle();
    const cfg = earlyPayOf(settRow?.data as { earlyPay?: EarlyPayDiscount } | undefined);
    const amount = earlyPayAmount(subtotal, cfg);
    if (amount > 0) earlyPay = { label: EARLY_PAY_LABEL, amount };
  } catch {
    // อ่านตั้งค่าไม่ได้ = ไม่ลด ดีกว่าสั่งซื้อไม่สำเร็จ (แอดมินใส่ส่วนลดเองได้ที่หน้าออเดอร์)
  }

  const key = randomBytes(24).toString("base64url"); // กุญแจลับต่อออเดอร์
  const order: Order = {
    id,
    key,
    customer: input.customerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    date: now.toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    payment: "โอนธนาคาร",
    shipping: input.shipping === "ส่งด่วน" ? "ส่งด่วน" : "ส่งธรรมดา",
    ...(input.shipping?.trim() ? { shippingLabel: input.shipping.trim().slice(0, 40) } : {}),
    shippingCost: Number(input.shippingCost) || 0,
    status: "รอชำระเงิน",
    note: input.note?.trim() || undefined,
    ...(/^\d{4}-\d{2}-\d{2}$/.test(input.useByDate ?? "") ? { useByDate: input.useByDate } : {}),
    items: input.items,
    ...(cid ? { customerId: cid } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(discount ? { discount } : {}),
    ...(earlyPay ? { earlyPay } : {}),
    ...(gifts.length ? { gifts } : {}),
    ...(placedBy ? { placedBy } : {}),
  };

  const { error } = await sb.from("orders").insert({ id, data: order });
  if (error) {
    // สร้างออเดอร์พัง → คืนคูปองที่เพิ่งตัดใช้ (best-effort) กันคูปองหายฟรี
    if (redeemedCode) {
      const { data: cRow } = await sb.from("coupons").select("data").eq("code", redeemedCode).maybeSingle();
      const c = cRow?.data as Coupon | undefined;
      if (c) await sb.from("coupons").update({ data: { ...c, status: "active", redeemedBy: undefined, redeemedOrderId: undefined, redeemedAt: undefined } }).eq("code", redeemedCode);
    }
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(error.message))
      return NextResponse.json({ error: "ระบบยังไม่พร้อม — ผู้ดูแลต้องสร้างตาราง orders ก่อน (รัน supabase/orders.sql)" }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // 📦 มีรายการสั่งจำนวนมาก → แจ้งร้านทาง LINE ให้รีบเช็คสต๊อก/คิวผลิตแล้วยืนยันกับลูกค้า
  const bulk = order.items.filter((i) => i.needStockCheck);
  if (bulk.length) {
    const to = process.env.LINE_STOCK_ALERT_TO;
    const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
    if (to && token) {
      const lines = bulk.map((i) => `• ${i.name} ×${i.qty.toLocaleString("th-TH")}`).join("\n");
      void fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to,
          messages: [
            {
              type: "text",
              text: `📦 ออเดอร์สั่งจำนวนมาก ${id}\n${order.customer} · ${order.phone}\n${lines}\n\nเช็คสต๊อก/คิวผลิตแล้วยืนยันกับลูกค้าด้วยครับ`,
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, id, key, coupon });
}
