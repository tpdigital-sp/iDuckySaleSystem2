import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, withLog, type Order, type OrderItem, type OrderStatus } from "@/lib/admin-data";
import { dealerRateOf } from "@/lib/products";
import { getProductServer, withUnitYield } from "@/lib/products-server";
import { syncOrderMemberTier } from "@/lib/server/order-member-tier";
import { syncOrderEarlyPay } from "@/lib/server/order-early-pay";
import { updateOrder } from "@/lib/server/order-write";
import { customerSafeOrder } from "@/lib/customer-order";
import { lotRepriceNote, repriceOrderLot } from "@/lib/order-lot-reprice";
import { shippingUnset } from "@/lib/ship-label";

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

  let body: { orderId?: string; key?: string; items?: OrderItem[]; shipping?: string; shippingCost?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: "ไม่มีรายการสินค้า" }, { status: 400 });

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

  // 📐 แช่จำนวนชิ้นต่อหน่วยให้ของที่สั่งเพิ่มเหมือนตอนสั่งครั้งแรก
  const merged = [...order.items, ...(await withUnitYield(items))];

  /**
   * 🧮 ยอดรวมทั้งใบเข้าเรทส่ง → ราคาต่อชิ้นต้องเท่ากันทั้งบิล (เจ้าของร้านสั่ง 21 ก.ย. 69 · OD-260917-1401)
   * ของที่เพิ่งเพิ่มได้ราคาล็อตรวมอยู่แล้ว (ตะกร้านับของเดิมร่วมล็อต) — ตรงนี้ลดบรรทัดเดิมลงมาให้เท่ากัน
   * ลดอย่างเดียว ไม่ขึ้นราคาย้อนหลัง · ดู lib/order-lot-reprice.ts
   */
  const addedIdx = merged.map((_, i) => i).filter((i) => i >= order.items.length);
  const lot = await repriceOrderLot({ ...order, items: merged }, getProductServer, addedIdx);

  // 🚚 ใบเปล่าที่ยังไม่เคยเลือกวิธีส่ง → รับค่าส่งที่หน้าชำระเงินคิดไว้ (ชื่อวิธีส่ง + ตัวเลข) มาใส่ให้เป็นครั้งแรก
  const shipName = (body.shipping ?? "").trim().slice(0, 40);
  const shipPatch: Partial<Order> =
    shipName && shippingUnset(order)
      ? {
          shipping: shipName.includes("ด่วน") ? "ส่งด่วน" : "ส่งธรรมดา",
          shippingLabel: shipName,
          shippingCost: Math.max(0, Number(body.shippingCost) || 0),
        }
      : {};

  /**
   * 🏅 ส่วนลดระดับสมาชิก — ใบที่ผูกผู้ติดต่อไว้ (พนักงานเปิดใบให้ทางไลน์) ต้องได้ % ของระดับตัวเองเหมือนสั่งเองจากเว็บ
   * คิดใหม่จากยอดสินค้าหลังเพิ่มรายการ · ใบที่แจ้งโอนแล้ว/มีส่วนลดที่ตกลงกันไว้ = ไม่แตะ (ดู lib/server/order-member-tier.ts)
   */
  const priced = await syncOrderMemberTier(sb, { ...order, ...shipPatch, items: lot.order.items });

  /**
   * ⚡ ส่วนลดโอนไว — คิดที่ประตูเขียนออเดอร์ (updateOrder → syncOrderEarlyPay) ที่เดียวทั้งระบบ
   * (เดิมคิดตรงนี้เอง ทางเข้าอื่นที่แตะรายการได้จึงไม่ได้ส่วนลด — ดู server/order-early-pay.ts)
   * ยอดที่แจ้งลูกค้าจึงต้องอ่านจากก้อนที่บันทึกจริง (saved) ไม่ใช่ก้อนที่ส่งเข้าไป
   */
  const owedBefore = orderTotal(priced) - (order.paidTotal ?? 0);

  const updated = {
    ...priced,
    // มียอดค้าง → กลับไปรอชำระ · ไม่มียอดค้าง (เช่นยังไม่เคยจ่าย) → คงสถานะเดิม
    status: owedBefore > 0 ? ("รอชำระเงิน" as OrderStatus) : order.status,
  };

  // เรียกกฎกลางก่อนเพื่อให้ log บอกยอดที่ลูกค้าเห็นจริง — updateOrder จะเรียกซ้ำเองอีกชั้น (ได้ผลเท่าเดิม ไม่เขียนซ้ำ)
  const synced = await syncOrderEarlyPay(sb, updated, "ลูกค้า");
  const newTotal = orderTotal(synced);
  const owed = newTotal - (order.paidTotal ?? 0);
  let logged = withLog(
    synced,
    "ลูกค้า",
    "สั่งเพิ่มในออเดอร์เดิม",
    `${items.length} รายการ` +
      (shipPatch.shippingLabel ? ` · ใส่ค่าส่ง ${shipPatch.shippingLabel} ฿${(shipPatch.shippingCost ?? 0).toLocaleString()}` : "") +
      ` · ยอดรวมใหม่ ฿${newTotal.toLocaleString()}`
  );
  // 🧮 บอกให้ชัดว่าของเดิมถูกลดลงมาเท่ากับของใหม่เพราะยอดรวมเข้าเรทส่ง (ลูกค้า/แอดมินเห็นใน log ใบนี้)
  if (lot.changed.length)
    logged = withLog(logged, "ระบบ", "ปรับราคาต่อชิ้นให้เท่ากันทั้งบิล", `ยอดรวมทั้งใบเข้าเรทส่ง · ${lotRepriceNote(lot.changed)}`);

  const { order: saved, error: saveErr } = await updateOrder(sb, logged, { prev: order, by: "ลูกค้า" });
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  const safe = customerSafeOrder(saved);
  return NextResponse.json({ ok: true, order: safe, owed: Math.max(0, owed) });
}
