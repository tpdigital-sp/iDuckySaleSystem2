import { NextResponse } from "next/server";
import { pushShopAlert } from "@/lib/server/line-alert";
import { SITE_URL } from "@/lib/shop-info";
import { bkkYmd, thaiDateTime } from "@/lib/bangkok-time";
import { autoShipDate, earliestShipDate, earliestUseBy, shortThaiDay, todayBkkYmd } from "@/lib/ship-date";
import { loadShopHolidays } from "@/lib/server/shop-holidays";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, withLog, type Order, type OrderSender } from "@/lib/admin-data";
import { tierDiscountAmount, tiersOf, lockedTier, seedTierStatus, type Tier, type TierStatus } from "@/lib/tiers";
import { couponLabel, couponMaxUses, couponUses, validateCoupon, type Coupon } from "@/lib/coupons";
import { giftsFor, giftsToOrder, type GiftPromo, type OrderGift } from "@/lib/gifts";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getProductServer, withUnitYield } from "@/lib/products-server";
import { insertOrder } from "@/lib/server/order-write";
import { dealerRateOf, lotShortfalls, type Product } from "@/lib/products";
import { isDealerUid } from "@/lib/server/dealers";
import { loadDealerSender } from "@/lib/server/dealer-sender";

// id เรคอร์ดตั้งค่าร้าน (ตรงกับ SETTINGS_ID ใน shop-settings ซึ่งเป็น "use client")
const SETTINGS_ROW = "__shop_payment__";

export const runtime = "nodejs";

function orderNo(d: Date): string {
  const ymd = bkkYmd(d);
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
   * 🏭 สั่งวันไหน ส่งวันนั้นไม่ได้ — ไม่มีรอบคิวผลิตในวันเดียวกัน (พนักงานแจ้ง 17 ก.ย. 69 · OD-260917-5550 สั่งตี 4 ใช้งานพรุ่งนี้)
   * ลูกค้าระบุวันใช้งานเร็วกว่าที่ร้านส่งทัน = ไม่รับ (ตะกร้าบล็อกไว้แล้ว นี่คือด่านฝั่งเซิร์ฟเวอร์กันหน้าเว็บค้าง/ยิงตรง)
   * พนักงานสั่งแทนลูกค้าผ่านได้ (คุยคิวกันแล้ว) แต่วันส่งที่เติมให้เองก็ยังไม่ตกวันสั่งอยู่ดี (autoShipDate)
   * โหลดปฏิทินวันหยุดร้านก่อน — autoShipDate ด้านล่างใช้ชุดเดียวกัน
   */
  await loadShopHolidays();
  if (!input.staffOrder && /^\d{4}-\d{2}-\d{2}$/.test(input.useByDate ?? "")) {
    const today = todayBkkYmd();
    const minUseBy = earliestUseBy(today);
    if (input.useByDate! < minUseBy)
      return NextResponse.json(
        {
          error: `วันใช้งาน ${shortThaiDay(input.useByDate!)} กระชั้นเกินไป — สั่งวันนี้ไม่มีรอบคิวผลิตส่งในวันเดียวกัน ร้านส่งได้เร็วสุด ${shortThaiDay(earliestShipDate(today))} (ร้านหยุดเสาร์-อาทิตย์และวันหยุด) · เลือกวันใช้งานตั้งแต่ ${shortThaiDay(minUseBy)} หรือทัก LINE เช็คคิวงานด่วนกับร้านก่อนนะครับ`,
        },
        { status: 400 },
      );
  }

  /**
   * 🤝 ตัวแทนจำหน่าย — ยืนยันตัวตนจาก access token เท่านั้น (customerId ในบอดี้ปลอมได้)
   * แล้วเช็คกับทะเบียน __dealers__ ฝั่งเซิร์ฟเวอร์ · token พัง/ไม่มี = ไม่ใช่ตัวแทน (ออเดอร์ปกติเดินต่อ)
   */
  let dealer = false;
  let dealerUid = "";
  /** 📮 ผู้ส่งประจำที่ตัวแทนตั้งไว้เอง (หน้า /dealer) — ติดไปกับใบนี้ให้เลย ใบปะหน้าจะขึ้นชื่อร้านเขา */
  let dealerSender: OrderSender | undefined;
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (token && !input.staffOrder) {
      const { data: u } = await sb.auth.getUser(token);
      if (u.user && (await isDealerUid(u.user.id))) {
        dealer = true;
        dealerUid = u.user.id;
        dealerSender = await loadDealerSender(sb, dealerUid);
      }
    }
  } catch {
    // เช็คไม่ได้ = ปฏิบัติเหมือนลูกค้าทั่วไป (ด่านเรทตัวแทนด้านล่างยังกันราคาตัวแทนอยู่)
  }

  // โหลดสินค้าของทุกรายการที่มีสเปค — ใช้ทั้งด่านเรทตัวแทนและประตูขั้นต่ำต่อรอบผลิต
  const withSel = input.items.filter((i) => i.sel && i.productId);
  const prods = new Map<string, Product>();
  for (const pid of [...new Set(withSel.map((i) => i.productId))]) {
    const p = await getProductServer(pid);
    if (p) prods.set(pid, p);
  }

  /**
   * 🚧 ด่านเรทตัวแทนจำหน่าย — บรรทัดที่เลือก "เรทราคา" เป็นเรท dealerOnly ต้องมาจากบัญชีตัวแทน
   * ที่ยืนยัน token แล้วเท่านั้น (พนักงานสั่งแทน staffOrder ผ่านได้ — เคสสั่งแทนตัวแทน)
   * ไม่งั้นใครก็ยัด label เรทตัวแทนใส่ selections แล้วจ่ายราคาตัวแทนได้
   */
  if (!dealer && !input.staffOrder) {
    for (const i of withSel) {
      const p = prods.get(i.productId);
      if (p && dealerRateOf(p, i.sel!)) {
        return NextResponse.json(
          { error: "เรทตัวแทนจำหน่ายใช้ได้เฉพาะบัญชีตัวแทนจำหน่ายที่ล็อกอินอยู่ — กรุณาเข้าสู่ระบบใหม่" },
          { status: 400 }
        );
      }
    }
  }

  /**
   * 📦 ยอดสั่งขั้นต่ำต่อ "รอบผลิต" (เรทที่ตั้ง minQtyScope: "lot" เช่น สติ๊กเกอร์ UV 3 แผ่น A3 ต่อเนื้อ 1 ชนิด)
   * หน้าสินค้าปล่อยให้ทยอยเพิ่มทีละแผ่น ประตูจริงอยู่ที่ตะกร้า/หน้าชำระเงิน — ตรงนี้กันคนยิง API ตรง
   * แอดมินสั่งแทนลูกค้า (staffOrder) ข้ามได้ — เคสตกลงกับลูกค้าเป็นราย ๆ ไป
   */
  if (!input.staffOrder) {
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
  // ตัวแทนจำหน่าย: ผูกออเดอร์กับ uid ที่ยืนยันแล้ว (ไม่เชื่อค่าในบอดี้)
  if (dealer) input.customerId = dealerUid;
  const cid = input.customerId;

  // ── 1) ส่วนลดระดับสมาชิก ── (ตัวแทนจำหน่ายไม่ได้ — ได้ราคาเรทตัวแทนอย่างเดียว)
  let tierAmount = 0;
  let tierLabel = "";
  if (cid && !dealer) {
    // ระดับสมาชิกแบบ status-lock: อ่าน "ระดับที่ล็อกอยู่" ของลูกค้าจาก contact (จับคู่ด้วย memberId)
    // ยังไม่มี contact/สถานะ → ประเมินจากยอดสะสมเดิมของลูกค้าไปก่อน (ยกยอดลูกค้าเก่า)
    const [settRes, contactRes, ordRes] = await Promise.all([
      sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle(),
      sb.from("contacts").select("data").eq("data->>memberId", cid).limit(1).maybeSingle(),
      sb.from("orders").select("data").eq("data->>customerId", cid),
    ]);
    const configuredTiers = ((settRes.data?.data as { tiers?: Tier[] } | undefined)?.tiers ?? []).filter((t) => t.name?.trim());
    const tiers = tiersOf(configuredTiers.length ? configuredTiers : null);
    const contact = contactRes.data?.data as { tierLevel?: string; tierAnchor?: string; tierCycleSpend?: number; point?: number; importedAt?: string } | undefined;
    let status: TierStatus;
    if (contact?.tierLevel) status = { levelId: contact.tierLevel, anchor: contact.tierAnchor, cycleSpend: contact.tierCycleSpend };
    else {
      // ไม่มี contact → ประเมินระดับจากยอดที่ลูกค้าจ่ายจริงในระบบนี้ (หรือยอดเดิมถ้ามี contact แต่ยังไม่ซีด)
      const lifetime = contact?.point ?? (ordRes.data ?? []).map((r) => r.data as Order).filter((o) => o.customerId === cid).reduce((spend, o) => spend + orderTotal(o), 0);
      status = seedTierStatus(lifetime, contact?.importedAt, tiers);
    }
    const tier = lockedTier(status, tiers);
    tierAmount = tierDiscountAmount(subtotal, tier.discountPct);
    if (tierAmount > 0) tierLabel = `สมาชิก ${tier.name} (${tier.discountPct}%)`;
  }

  // ── 2) คูปอง (ต้องล็อกอิน) — เอาอันที่ดีกว่าระดับ · ตัดสิทธิ์แบบ atomic ──
  let discount: Order["discount"] | undefined;
  let redeemedCode: string | null = null; // เก็บไว้ rollback ถ้า insert พัง
  let couponBefore: Coupon | null = null; // สภาพคูปองก่อนตัดสิทธิ์ — ไว้คืนตอน rollback
  let coupon: { applied: boolean; reason?: string } = { applied: false };
  // ตัวแทนจำหน่ายใช้คูปองไม่ได้ — และไม่เผาคูปองที่เผลอส่งมา
  const couponCode = dealer ? "" : (input.couponCode ?? "").trim().toUpperCase();

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
      /**
       * ดีกว่าระดับ → ตัดสิทธิ์ 1 ครั้งแบบ atomic
       *
       * ใบหลายสิทธิ์: เงื่อนไข update ต้องล็อกที่ "ตัวนับต้องเป็นค่าเดิมที่เพิ่งอ่านมา" ไม่งั้นสองคน
       * ที่กดพร้อมกันจะเขียนทับกันแล้วนับไปแค่ครั้งเดียว · ใบเก่าที่ไม่มีตัวนับ = ใบสิทธิ์เดียว
       * ล็อกที่ status active ก็พอ (เหมือนเดิมทุกประการ)
       */
      const at = now.toISOString();
      const nextUses = couponUses(c) + 1;
      const redeemed: Coupon = {
        ...c,
        uses: nextUses,
        status: nextUses >= couponMaxUses(c) ? "redeemed" : "active",
        redeemedBy: cid,
        redeemedOrderId: id,
        redeemedAt: at,
        redemptions: [...(c.redemptions ?? []), { orderId: id, customerId: cid, at }].slice(-200),
      };
      const q = sb.from("coupons").update({ data: redeemed }).eq("code", couponCode).eq("data->>status", "active");
      const { data: upd } = await (typeof c.uses === "number" ? q.eq("data->>uses", String(c.uses)) : q).select("code");
      if (upd && upd.length) {
        discount = { label: couponLabel(c), amount: v.discount, couponCode };
        redeemedCode = couponCode;
        couponBefore = c;
        coupon = { applied: true };
      } else {
        coupon = { applied: false, reason: "used" }; // สิทธิ์ถูกตัดไปก่อนแล้ว (ชิงพร้อมกัน)
      }
    } else {
      coupon = { applied: false, reason: "worse" }; // คูปองใช้ได้ แต่ส่วนลดระดับดีกว่า → ไม่เผาคูปอง
    }
  }
  // ถ้าไม่ได้ใช้คูปอง → ใช้ส่วนลดระดับ (ถ้ามี)
  if (!discount && tierAmount > 0) discount = { label: tierLabel, amount: tierAmount };

  // ── 3) 🎁 ของแถมฟรีตามจำนวนชิ้น — คิดใหม่ฝั่งเซิร์ฟเวอร์เสมอ (ไม่เชื่อค่าที่หน้าเว็บส่งมา) ──
  // ตัวแทนจำหน่ายไม่ได้ของแถม (เจ้าของร้านยืนยัน 7 ก.ย. 69 — ได้ราคาตัวแทนอย่างเดียว)
  let gifts: OrderGift[] = [];
  if (!dealer) try {
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

  // ── 4) ⚡ ส่วนลดโอนไว — คิดที่ประตูเขียนออเดอร์ (insertOrder → syncOrderEarlyPay) ที่เดียวทั้งระบบ ──
  // เดิมคิดตรงนี้ ทำให้ทางเข้าอื่น (แอดมินเพิ่มรายการ/ตีราคาทีหลัง) ไม่ได้ส่วนลด — ดู server/order-early-pay.ts

  // 📐 แช่ "สั่ง 1 หน่วย ได้กี่ชิ้น" ลงรายการ (ตัวเดียวกับที่ใช้ตอนสั่งเพิ่ม/ใบเสนอราคา — ดู withUnitYield)
  const itemsWithYield = await withUnitYield(input.items);

  const key = randomBytes(24).toString("base64url"); // กุญแจลับต่อออเดอร์
  const order: Order = {
    id,
    key,
    customer: input.customerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    date: thaiDateTime(now),
    payment: "โอนธนาคาร",
    shipping: input.shipping === "ส่งด่วน" ? "ส่งด่วน" : "ส่งธรรมดา",
    ...(input.shipping?.trim() ? { shippingLabel: input.shipping.trim().slice(0, 40) } : {}),
    shippingCost: Number(input.shippingCost) || 0,
    status: "รอชำระเงิน",
    note: input.note?.trim() || undefined,
    ...(/^\d{4}-\d{2}-\d{2}$/.test(input.useByDate ?? "") ? { useByDate: input.useByDate, ...autoShipDate(input.useByDate!) } : {}),
    items: itemsWithYield,
    ...(cid ? { customerId: cid } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(discount ? { discount } : {}),
    ...(gifts.length ? { gifts } : {}),
    ...(placedBy ? { placedBy } : {}),
    ...(dealer ? { dealer: true } : {}),
    ...(dealer && dealerSender ? { sender: dealerSender } : {}),
  };

  /*
   * 📅 จดที่มาของวันใช้งานตั้งแต่ใบเกิด (พนักงานถาม 21 ก.ย. 69 · OD-260918-8582 "ลูกค้าใส่มาเองใช่ไหม")
   * ใบที่พนักงานสั่งแทน วันนี้มาจากเบราว์เซอร์ของร้าน ไม่ใช่ลูกค้าพิมพ์เข้ามาเอง — ประวัติต้องแยกให้ออก
   */
  const orderToSave = order.useByDate
    ? withLog(
        order,
        placedBy ? `พนักงาน ${placedBy}` : "ลูกค้า",
        "ระบุวันที่ต้องใช้งาน",
        `${shortThaiDay(order.useByDate)} — ${placedBy ? "พนักงานสั่งแทนลูกค้า (กรอกจากหน้าตะกร้าบนเครื่องของร้าน)" : "ลูกค้าเลือกเองในตะกร้า"}`
      )
    : order;

  const { order: saved, error } = await insertOrder(sb, orderToSave, "ระบบ");
  if (error) {
    // สร้างออเดอร์พัง → คืนสิทธิ์คูปองที่เพิ่งตัด (best-effort) กันสิทธิ์หายฟรี
    // คืนเป็นสภาพก่อนตัดทั้งก้อน และเฉพาะใบที่ยังเป็นครั้งของออเดอร์นี้ — คนที่ใช้ต่อทีหลังจะไม่โดนย้อน
    if (redeemedCode && couponBefore) {
      await sb.from("coupons").update({ data: couponBefore }).eq("code", redeemedCode).eq("data->>redeemedOrderId", id);
    }
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(error.message))
      return NextResponse.json({ error: "ระบบยังไม่พร้อม — ผู้ดูแลต้องสร้างตาราง orders ก่อน (รัน supabase/orders.sql)" }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // 📦 มีรายการสั่งจำนวนมาก → แจ้งร้านทาง LINE ให้รีบเช็คสต๊อก/คิวผลิตแล้วยืนยันกับลูกค้า
  const bulk = saved.items.filter((i) => i.needStockCheck);
  if (bulk.length) {
    /*
     * ⚠️ ต้อง await ห้ามยิงทิ้ง (void) — Netlify แช่ฟังก์ชันทันทีที่ตอบกลับ งานค้างอาจไม่ได้ทำ
     *    แจ้งเตือนหายเงียบ ๆ โดยไม่มีใครรู้ · ตัวส่งมี timeout 10 วิ ในตัว และไม่ throw ออกมา
     *    จึงไม่มีทางทำให้การสร้างออเดอร์ล้ม แค่ลูกค้ารอเพิ่มไม่ถึงวินาที
     */
    await pushShopAlert({
      tone: "#D97706",
      title: "📦 ออเดอร์สั่งจำนวนมาก",
      headline: "เช็คสต๊อก/คิวผลิตแล้วยืนยันจำนวนกับลูกค้าก่อนเริ่มงาน",
      heroLabel: "เลขออเดอร์",
      hero: id,
      rows: [
        { label: "ลูกค้า", value: saved.customer },
        { label: "เบอร์", value: saved.phone },
      ],
      bullets: bulk.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`),
      button: { label: "เปิดออเดอร์", uri: `${SITE_URL}/admin/orders/${encodeURIComponent(id)}` },
      alt: `📦 ออเดอร์สั่งจำนวนมาก ${id} · ${saved.customer}`,
    });
  }

  return NextResponse.json({ ok: true, id, key, coupon });
}
