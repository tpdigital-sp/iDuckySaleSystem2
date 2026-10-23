import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isFreeOrder, orderTotal, priceCheckPending, resetProofStageForNewWork, shipAutoFollowNow, withLog, type Order, type OrderItem, type OrderStatus } from "@/lib/admin-data";
import { dealerRateOf, type Product } from "@/lib/products";
import { getProductServer, withUnitYield } from "@/lib/products-server";
import { syncOrderMemberTier } from "@/lib/server/order-member-tier";
import { syncOrderEarlyPay } from "@/lib/server/order-early-pay";
import { updateOrder } from "@/lib/server/order-write";
import { customerSafeOrder } from "@/lib/customer-order";
import { carryAdminSurcharge, lotRepriceNote, repriceOrderLot, surchargeNote } from "@/lib/order-lot-reprice";
import { giftSyncNote, syncOrderGifts } from "@/lib/server/order-gifts";
import { shippingUnset } from "@/lib/ship-label";
import { requirePerm } from "@/lib/server/require-perm";
import { cleanCustomerItems, priceMismatchMessage, shippingFloorProblem, underpricedLines } from "@/lib/server/order-price-guard";
import type { ShopPayment } from "@/lib/shop-settings";

// id เรคอร์ดตั้งค่าร้าน (ตรงกับ SETTINGS_ID ใน shop-settings ซึ่งเป็น "use client")
const SETTINGS_ROW = "__shop_payment__";

export const runtime = "nodejs";

/** สถานะที่ยัง "เปิดอยู่" — สั่งเพิ่มได้ (ผลิต/ส่งแล้ว/จบ/ยกเลิก = เพิ่มไม่ได้) */
const OPEN: OrderStatus[] = ["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"];

/**
 * ลูกค้าสั่งเพิ่มเข้าออเดอร์เดิม (public แต่ต้องมี key ลับ)
 * POST { orderId, key, items[] }
 *
 * กติกา:
 * - เพิ่มได้เฉพาะออเดอร์ที่ยังไม่เข้าสายการผลิต (กันของที่ทำไปแล้วเพี้ยน)
 * - ไม่คิดค่าจัดส่งซ้ำ (ใช้ค่าส่งเดิมของออเดอร์)
 *   🚚 ยกเว้นใบที่ "ยังไม่เคยเลือกวิธีส่ง" (shippingUnset — ใบเปล่าจาก "สร้างออเดอร์งานพิเศษ" ที่แอดมินหยิบจากหน้าร้าน):
 *   รับ shipping/shippingCost ที่หน้าชำระเงินคิดไว้มาใส่ให้ (เหมือน /api/orders ตอนสั่งครั้งแรกที่เชื่อค่าส่งจากหน้าตะกร้า)
 *   ใบที่มีค่าส่ง/ป้ายวิธีส่งแล้ว = ไม่แตะ แม้ส่งมา (พนักงานแจ้ง 18 ก.ย. 69: หยิบจากหน้าร้านแล้วค่าส่งไม่ตามมา)
 * - รายการใหม่ยังไม่มีแบบ → ดึงสถานะกลับมาที่ "รอชำระเงิน" ถ้ามียอดค้าง
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: {
    orderId?: string;
    key?: string;
    items?: OrderItem[];
    shipping?: string;
    shippingCost?: number;
    /** ⚡ วิธีส่งที่ส่งมาคือวิธีที่ระบบเลือกให้ (ไม่ใช่ลูกค้า/แอดมินเลือกเอง) → ใบปรับค่าส่งตามรายการต่อไป */
    shippingAuto?: boolean;
    giftSizes?: Record<string, string>;
    giftArtwork?: Record<string, string[]>;
    /** 🛠 บรรทัดเดิมที่ของใหม่มาแทน (ปุ่ม "แก้ตัวเลือก (หน้าร้าน)") — หน้าออเดอร์จะถอดออกทีหลัง */
    replacing?: { index?: number; productId?: string; name?: string; qty?: number };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  // 🚧 ตัวเลขต้องเป็นตัวเลขจริง + ตัดฟิลด์เรื่องเงินที่แอดมินเท่านั้นใส่ได้ — ดู lib/server/order-price-guard.ts
  const cleaned = cleanCustomerItems(body.items);
  if (cleaned.error) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const items = cleaned.items;

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (order.key && order.key !== (body.key ?? ""))
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });

  if (!OPEN.includes(order.status))
    return NextResponse.json(
      { error: `ออเดอร์นี้อยู่ในขั้น “${order.status}” แล้ว สั่งเพิ่มไม่ได้ — กรุณาสั่งเป็นออเดอร์ใหม่` },
      { status: 409 }
    );

  /**
   * 🧰🎁 ใบเคลม (claimOf) / ใบส่งฟรี (freeOf) = ใบที่ "ไม่คิดเงินกับลูกค้า" — ของที่เข้าใบทางนี้ต้องเป็น ฿0 และใบห้ามเด้งกลับ "รอชำระเงิน"
   *
   * ทำไม (OD-261021-7345 · 21 ต.ค. 69): พนักงานกด "🛠 แก้ตัวเลือก (หน้าร้าน)" บนใบเคลมโฟโต้การ์ด (เกิดมา "ชำระแล้ว" ราคา ฿0)
   * หน้าร้านคิดราคาปกติ @฿180 ส่งเข้ามาทางนี้ → ใบไม่มี paidTotal จึงเห็น "ค้าง ฿900" แล้วดึงสถานะไป "รอชำระเงิน"
   * ทั้งที่งานเคลมไม่มีใครต้องโอน — กราฟฟิก/ปริ้นมองว่าใบยังไม่ผ่านด่านเงิน งานค้าง
   * (ประตู PATCH ฝั่งแอดมินกันด้วย isFreeOrder อยู่แล้ว ประตูนี้ลืม)
   *
   * กติกา: ของที่เพิ่ม/แทนที่ = ฿0 เหมือนตอนสร้างใบเคลม (orders/redo) · ค่าส่งไม่ใส่ · สถานะคงเดิม
   * และให้ทำได้เฉพาะพนักงานที่มีสิทธิ์แก้ออเดอร์ (คุกกี้หลังบ้านติดมากับหน้าร้าน) — ลูกค้าถือลิงก์ใบเคลมมาสั่งเพิ่มเองจะได้ของฟรีเพิ่ม ไม่ให้
   */
  const free = isFreeOrder(order);
  if (free) {
    const gate = await requirePerm("orders.edit");
    if (gate.res)
      return NextResponse.json(
        { error: `ใบนี้เป็น${order.claimOf ? "งานเคลม" : "ใบส่งฟรี"} (ไม่คิดเงิน) ลูกค้าสั่งเพิ่มเองไม่ได้ — กรุณาสั่งเป็นออเดอร์ใหม่ หรือติดต่อร้าน` },
        { status: 409 }
      );
  }

  // 🤝 รายการเรทตัวแทนจำหน่าย เพิ่มได้เฉพาะออเดอร์ตัวแทน (order.dealer) — กันคนถือ key ออเดอร์ธรรมดา
  // ยัด label เรทตัวแทนใส่ selections แล้วได้ราคาตัวแทน
  if (!order.dealer) {
    for (const it of items) {
      if (!it.productId || !it.sel) continue;
      const p = await getProductServer(it.productId);
      if (p && dealerRateOf(p, it.sel)) {
        return NextResponse.json(
          { error: "เรทตัวแทนจำหน่ายใช้ได้เฉพาะออเดอร์ของบัญชีตัวแทนจำหน่าย" },
          { status: 400 }
        );
      }
    }
  }

  /**
   * 🚧 ราคาต่อชิ้นของที่เพิ่มต้องไม่ต่ำกว่าที่ร้านคิดได้ — คิดร่วมล็อตกับของเดิมในใบเหมือนตะกร้า (ตรวจความปลอดภัย 8 ต.ค. 69)
   * เดิมเชื่อ unitPrice จากเบราว์เซอร์ → คนถือ key ออเดอร์ยิง API เพิ่มของราคา ฿1 เข้าใบได้
   */
  /**
   * 🛠 แก้ตัวเลือกจากหน้าร้าน = ของใหม่แทนบรรทัดเดิม (หน้าออเดอร์ถอดบรรทัดเดิมทีหลัง)
   * เช็คว่าบรรทัดยังตรงกับที่หน้าจอส่งมาจริง (สินค้า/ชื่อ/จำนวน) ไม่ตรง = ถือเป็นสั่งเพิ่มธรรมดา
   */
  const rp = body.replacing;
  const rIdx = typeof rp?.index === "number" ? rp.index : -1;
  const rOld = rIdx >= 0 && rIdx < order.items.length ? order.items[rIdx] : null;
  const skipIdx = rOld && rOld.productId === rp?.productId && rOld.name === rp?.name && rOld.qty === rp?.qty ? rIdx : -1;
  /** ของเดิมที่ผลิตร่วมล็อตจริง — บรรทัดที่กำลังถูกแทนไม่นับ (OD-260910-5776: นับ 40 ใบที่จะถูกถอด ทำให้ 25 ใบใหม่ได้ขั้น 50+) */
  const lotBase = skipIdx >= 0 ? order.items.filter((_, i) => i !== skipIdx) : order.items;

  const short = await underpricedLines(items, getProductServer, lotBase);
  if (short.length) return NextResponse.json({ error: priceMismatchMessage(short) }, { status: 400 });

  /** 🧰🎁 ใบเคลม/ส่งฟรี: ของที่เข้าใบคิด ฿0 (ตรวจราคาขั้นต่ำด้านบนด้วยราคาจริงก่อน แล้วค่อยตัดเป็นศูนย์) · จำราคาปกติไว้ลง log */
  const freeNote = free ? items.map((it) => `${it.name} ×${it.qty} @${it.unitPrice.toLocaleString("th-TH")} → ฿0`).join(" · ") : "";
  const priced0: OrderItem[] = free
    ? items.map((it) => ({
        ...it,
        unitPrice: 0,
        ...(it.addOns?.length ? { addOns: it.addOns.map((a) => ({ ...a, amount: 0 })) } : {}),
      }))
    : items;

  // 📐 แช่จำนวนชิ้นต่อหน่วยให้ของที่สั่งเพิ่มเหมือนตอนสั่งครั้งแรก
  const merged = [...order.items, ...(await withUnitYield(priced0))];

  /**
   * 🧮 ยอดรวมทั้งใบเข้าเรทส่ง → ราคาต่อชิ้นต้องเท่ากันทั้งบิล (เจ้าของร้านสั่ง 21 ก.ย. 69 · OD-260917-1401)
   * ของที่เพิ่งเพิ่มได้ราคาล็อตรวมอยู่แล้ว (ตะกร้านับของเดิมร่วมล็อต) — ตรงนี้ลดบรรทัดเดิมลงมาให้เท่ากัน
   * ลดอย่างเดียว ไม่ขึ้นราคาย้อนหลัง · ดู lib/order-lot-reprice.ts
   */
  // บรรทัดที่กำลังถูกแทนไม่ร่วมคิด และไม่ถูกแตะราคา (หน้าออเดอร์จับคู่ถอดด้วยราคาเดิม — ราคาเปลี่ยน = ถอดไม่ได้)
  const lotMerged = [...lotBase, ...merged.slice(order.items.length)];
  const lotAdded = lotMerged.map((_, i) => i).filter((i) => i >= lotBase.length);
  const lotRes0 = await repriceOrderLot({ ...order, items: lotMerged }, getProductServer, lotAdded);
  /**
   * ✋➕ สินค้าที่แอดมินเคยแก้ราคาเองในใบนี้ (งานดีเทล) → สเปคตรง = บวกค่าดีเทลให้เอง · ไม่ตรง = พักไว้ให้พนักงานตรวจราคาก่อนโอน
   * (เจ้าของร้านสั่ง 23 ต.ค. 69 · OD-261015-7299) · ใบเคลม/ส่งฟรีของเข้าใบเป็น ฿0 อยู่แล้ว ไม่ต้องคิด · ดู carryAdminSurcharge
   */
  const surcharge = await (async () => {
    if (free) return { items: lotRes0.order.items, carried: [], held: [] } as ReturnType<typeof carryAdminSurcharge>;
    const prods = new Map<string, Product | undefined>();
    for (const pid of new Set(lotRes0.order.items.map((x) => x.productId))) prods.set(pid, await getProductServer(pid));
    return carryAdminSurcharge(lotBase, lotRes0.order.items, (id) => prods.get(id));
  })();
  const lotRes = surcharge.carried.length || surcharge.held.length ? { ...lotRes0, order: { ...lotRes0.order, items: surcharge.items } } : lotRes0;
  const lot =
    skipIdx >= 0
      ? {
          ...lotRes,
          order: {
            ...lotRes.order,
            items: [...lotRes.order.items.slice(0, skipIdx), merged[skipIdx], ...lotRes.order.items.slice(skipIdx)],
          },
        }
      : lotRes;

  /**
   * 🎁 ของแถมตามจำนวนชิ้นต้องนับ "ทั้งใบ" — เดิมคิดครั้งเดียวตอนสั่งครั้งแรก ของที่สั่งเพิ่มเลยไม่ได้ของแถม
   * (OD-261006-8507 · 8 ต.ค. 69: 80 → 100 ชิ้น แต่รองหลังค้าง 80) · เพิ่มอย่างเดียว คงลาย/แบบ/ผลตรวจเดิม · ดู server/order-gifts.ts
   */
  // 📐 ขนาด/ลายของแถมที่เลือกในตะกร้า — ใช้กับโปรที่เพิ่งได้ในรอบนี้ (OD-261012-9950: เลือก 9 × 9 แต่ใบขึ้น 7 × 7)
  /**
   * 🛠 แก้ตัวเลือกจากหน้าร้าน → นับของแถมโดยไม่รวมบรรทัดที่กำลังถูกแทน (skipIdx ด้านบน)
   * (OD-261012-5632 · 12 ต.ค. 69: 10 ชิ้นแก้ตัวเลือก 9 ชิ้น → เดิมนับ 19 ได้รองหลังฟรี 19 · ของแถมเพิ่มอย่างเดียว ถอดบรรทัดเก่าแล้วก็ไม่ลด)
   */
  const giftBase = skipIdx >= 0 ? { ...lot.order, items: lot.order.items.filter((_, i) => i !== skipIdx) } : lot.order;
  const gift = await syncOrderGifts(sb, giftBase, { sizes: body.giftSizes, artwork: body.giftArtwork });

  // 🚚 ใบเปล่าที่ยังไม่เคยเลือกวิธีส่ง → รับค่าส่งที่หน้าชำระเงินคิดไว้ (ชื่อวิธีส่ง + ตัวเลข) มาใส่ให้เป็นครั้งแรก
  // ⚡ ใบที่ค่าส่งระบบเลือกให้ + ยังไม่มีเงินเข้า (shipAutoFollowNow) → รับค่าส่งที่คิดจาก "ทั้งใบ" มาแทนค่าเดิม
  //    (เจ้าของร้าน 20 ต.ค. 69 OD-261020-2478: ค่าส่งตั้งครั้งเดียวตอนหยิบรอบแรก สั่งเพิ่ม/แก้จำนวนแล้วไม่ขยับตาม)
  //    ใบที่แอดมินตั้งค่าส่งเอง/มีเงินเข้าแล้ว = ไม่แตะ แม้ส่งมา (หน้าออเดอร์ขึ้นปุ่ม ⚡ แนะนำแทน)
  const shipName = (body.shipping ?? "").trim().slice(0, 40);
  const shipUnsetBefore = shippingUnset(order);
  // 🧰🎁 ใบเคลม/ส่งฟรี ร้านออกค่าส่งเอง — ใบเปล่าที่ยังไม่มีวิธีส่งก็ไม่รับค่าส่งจากหน้าชำระเงิน (shipAutoFollowNow กันใบฟรีอยู่แล้ว)
  const takeShip = !!shipName && !free && (shipUnsetBefore || shipAutoFollowNow(order));
  if (takeShip) {
    // 🚧 ค่าส่งต้องไม่ต่ำกว่าราคาวิธีส่งที่เลือก (กติกาเดียวกับ /api/orders)
    const { data: shipSett } = await sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle();
    const subtotalAll = merged.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const shipErr = shippingFloorProblem(body.shippingCost, shipName, subtotalAll, (shipSett?.data as ShopPayment | undefined) ?? null);
    if (shipErr) return NextResponse.json({ error: shipErr }, { status: 400 });
  }
  const shipPatch: Partial<Order> = takeShip
    ? {
        shipping: shipName.includes("ด่วน") ? "ส่งด่วน" : "ส่งธรรมดา",
        shippingLabel: shipName,
        shippingCost: Math.max(0, Number(body.shippingCost) || 0),
        shipAuto: body.shippingAuto === true,
      }
    : {};
  /** ค่าส่งเปลี่ยนจริงไหม (ใบที่มีค่าส่งอยู่แล้ว) — ไว้ลง log ให้เห็นว่าขยับจากเท่าไรเป็นเท่าไร */
  const shipMoved =
    takeShip && !shipUnsetBefore && (shipPatch.shippingLabel !== order.shippingLabel || shipPatch.shippingCost !== order.shippingCost);

  /**
   * 🏅 ส่วนลดระดับสมาชิก — ใบที่ผูกผู้ติดต่อไว้ (พนักงานเปิดใบให้ทางไลน์) ต้องได้ % ของระดับตัวเองเหมือนสั่งเองจากเว็บ
   * คิดใหม่จากยอดสินค้าหลังเพิ่มรายการ · ใบที่แจ้งโอนแล้ว/มีส่วนลดที่ตกลงกันไว้ = ไม่แตะ (ดู lib/server/order-member-tier.ts)
   */
  const priced = await syncOrderMemberTier(sb, { ...order, ...shipPatch, items: lot.order.items, ...(gift.changed.length ? { gifts: gift.order.gifts } : {}) });

  /**
   * ⚡ ส่วนลดโอนไว — คิดที่ประตูเขียนออเดอร์ (updateOrder → syncOrderEarlyPay) ที่เดียวทั้งระบบ
   * (เดิมคิดตรงนี้เอง ทางเข้าอื่นที่แตะรายการได้จึงไม่ได้ส่วนลด — ดู server/order-early-pay.ts)
   * ยอดที่แจ้งลูกค้าจึงต้องอ่านจากก้อนที่บันทึกจริง (saved) ไม่ใช่ก้อนที่ส่งเข้าไป
   */
  const owedBefore = orderTotal(priced) - (order.paidTotal ?? 0);

  const reopened = {
    ...priced,
    // มียอดค้าง → กลับไปรอชำระ · ไม่มียอดค้าง (เช่นยังไม่เคยจ่าย) → คงสถานะเดิม · ใบเคลม/ส่งฟรีไม่มีใครต้องโอน → ไม่เด้ง (OD-261021-7345)
    status: owedBefore > 0 && !free ? ("รอชำระเงิน" as OrderStatus) : order.status,
  };
  /**
   * 🎨↩ ของใหม่ที่ยังไม่มีแบบเข้าใบที่แบบเดินไปแล้ว (อนุมัติแบบ/รอตรวจแบบ) → ต้องกลับไป "รอทำแบบ" ไม่ใช่ค้างขั้นเดิม
   * (ทางแอดมินสั่งเพิ่มจากตะกร้าก็มาทางนี้ · ยอดไม่โตเพราะเพิ่งลบรายการเดิมออก = สถานะไม่ขยับเลย) — ดู resetProofStageForNewWork
   */
  const proofReset = resetProofStageForNewWork(order, reopened);
  const updated = proofReset ? proofReset.order : reopened;

  // เรียกกฎกลางก่อนเพื่อให้ log บอกยอดที่ลูกค้าเห็นจริง — updateOrder จะเรียกซ้ำเองอีกชั้น (ได้ผลเท่าเดิม ไม่เขียนซ้ำ)
  const synced = await syncOrderEarlyPay(sb, updated, "ลูกค้า");
  const newTotal = orderTotal(synced);
  const owed = newTotal - (order.paidTotal ?? 0);
  let logged = withLog(
    synced,
    "ลูกค้า",
    "สั่งเพิ่มในออเดอร์เดิม",
    `${items.length} รายการ` +
      (takeShip && shipUnsetBefore ? ` · ใส่ค่าส่ง ${shipPatch.shippingLabel} ฿${(shipPatch.shippingCost ?? 0).toLocaleString()}` : "") +
      (shipMoved
        ? ` · ปรับค่าส่งตามทั้งใบ ${order.shippingLabel || "—"} ฿${(order.shippingCost ?? 0).toLocaleString()} → ${shipPatch.shippingLabel} ฿${(shipPatch.shippingCost ?? 0).toLocaleString()}`
        : "") +
      ` · ยอดรวมใหม่ ฿${newTotal.toLocaleString()}`
  );
  if (free)
    logged = withLog(logged, "ระบบ", `${order.claimOf ? "งานเคลม" : "ใบส่งฟรี"} — ของที่เพิ่มไม่คิดเงิน`, `${freeNote} · คงสถานะ "${order.status}" ไม่เด้งรอชำระเงิน`);
  // 🧮 บอกให้ชัดว่าของเดิมถูกลดลงมาเท่ากับของใหม่เพราะยอดรวมเข้าเรทส่ง (ลูกค้า/แอดมินเห็นใน log ใบนี้)
  if (lot.changed.length)
    logged = withLog(logged, "ระบบ", "ปรับราคาต่อชิ้นให้เท่ากันทั้งบิล", `ยอดรวมทั้งใบเข้าเรทส่ง · ${lotRepriceNote(lot.changed)}`);
  if (surcharge.carried.length)
    logged = withLog(logged, "ระบบ", "✋ บวกค่างานดีเทลตามราคาที่ร้านแก้ไว้", surchargeNote(surcharge.carried));
  if (surcharge.held.length)
    logged = withLog(
      logged,
      "ระบบ",
      "⏸ พักรายการไว้ให้ร้านตรวจราคาก่อนโอน",
      surcharge.held.map((h) => `${h.name} — ${h.why}`).join(" · ")
    );
  if (gift.changed.length) logged = withLog(logged, "ระบบ", "ปรับของแถมตามยอดรวมทั้งใบ", giftSyncNote(gift.changed));
  if (proofReset) logged = withLog(logged, "ระบบ", "รายการใหม่ยังไม่มีแบบ — กลับไปรอทำแบบ", proofReset.note);

  /**
   * 🧮 รอตรวจราคา — ขั้นราคาทั้งล็อตขยับเพราะมีของเข้าใบ ให้แอดมินตรวจอีกรอบ (เจ้าของร้านสั่ง 20 ต.ค. 69 · OD-260910-5776)
   * ยังไม่มีคนตรวจรอบก่อน = ต่อรอบเดิม (at คงเดิม · ของใหม่นับตั้งแต่ at) · ดู OrderPriceCheck
   */
  {
    const nowIso = new Date().toISOString();
    const prevCheck = priceCheckPending(order) ? order.priceCheck : undefined;
    const what = skipIdx >= 0 ? "แก้ตัวเลือกจากหน้าร้าน" : "สั่งเพิ่มในออเดอร์เดิม";
    const note = [
      prevCheck?.note,
      lot.changed.length ? lotRepriceNote(lot.changed) : "",
      surcharge.carried.length ? `บวกค่าดีเทล: ${surchargeNote(surcharge.carried)}` : "",
      surcharge.held.length ? `⏸ รอตรวจราคาก่อนโอน ${surcharge.held.length} รายการ (สเปคไม่ตรงกับรายการที่ร้านแก้ราคาไว้)` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    logged = {
      ...logged,
      priceCheck: {
        at: prevCheck?.at ?? nowIso,
        lastAt: nowIso,
        what: prevCheck && prevCheck.what !== what ? `${prevCheck.what} · ${what}` : what,
        ...(note ? { note } : {}),
      },
    };
  }

  const { order: saved, error: saveErr } = await updateOrder(sb, logged, { prev: order, by: "ลูกค้า" });
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  const safe = customerSafeOrder(saved);
  return NextResponse.json({
    ok: true,
    order: safe,
    owed: Math.max(0, owed),
    // ⏸ มีรายการพักรอร้านตรวจราคา — หน้าชำระเงินต้องบอกว่ายังไม่ต้องโอน
    ...(surcharge.held.length ? { priceHold: surcharge.held.length } : {}),
  });
}
