import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, paidSoFar, withLog, type Order, type OrderItem, type OrderStatus } from "@/lib/admin-data";
import { dealerRateOf, type Product } from "@/lib/products";
import { earlyPayAmount, earlyPayBase, earlyPayExpiresAt, earlyPayOf, EARLY_PAY_LABEL, type EarlyPayDiscount } from "@/lib/early-pay";
import { getProductServer, withUnitYield } from "@/lib/products-server";

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
 * - รายการใหม่ยังไม่มีแบบ → ดึงสถานะกลับมาที่ "รอชำระเงิน" ถ้ามียอดค้าง
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { orderId?: string; key?: string; items?: OrderItem[] };
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
   * ⚡ ส่วนลดโอนไว — ใบที่ "ยังไม่มี" ส่วนลดนี้และยังไม่มีเงินเข้า (สร้างจากหลังบ้านเป็นใบเปล่า → ลูกค้าใส่ของเองทางลิงก์
   * = ทางสั่งปกติของลูกค้าไลน์ เคส OD-260910-7269 ที่พนักงานทัก 10 ก.ย. 69) คิดให้ตอนนี้จากรายการทั้งใบ กติกาเดียวกับ /api/orders
   * ใบที่มีส่วนลดอยู่แล้ว = ไม่คิดซ้ำ (เหมือนส่วนลดระดับ) · ตัวแทนไม่ได้ · เวลาหมดอายุนับจากตอนสั่งเพิ่มครั้งนี้
   */
  let earlyPay = order.earlyPay;
  if (!earlyPay && !order.dealer && paidSoFar(order) <= 0) {
    try {
      const prods = new Map<string, Product>();
      for (const pid of [...new Set(merged.map((i) => i.productId).filter(Boolean))]) {
        const p = await getProductServer(pid);
        if (p) prods.set(pid, p);
      }
      const { data: settRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
      const cfg = earlyPayOf(settRow?.data as { earlyPay?: EarlyPayDiscount } | undefined);
      const goods = earlyPayBase(
        merged.map((i) => ({ productId: i.productId, selections: i.sel, qty: i.qty, amount: i.qty * i.unitPrice })),
        (id) => prods.get(id),
        { mergeLots: true }
      );
      const amount = earlyPayAmount(goods, cfg);
      const expiresAt = earlyPayExpiresAt(cfg);
      if (amount > 0) earlyPay = { label: EARLY_PAY_LABEL, amount, ...(expiresAt ? { expiresAt } : {}) };
    } catch {
      // อ่านตั้งค่า/สินค้าไม่ได้ = ไม่ลด ดีกว่าสั่งเพิ่มไม่สำเร็จ
    }
  }

  const newTotal = orderTotal({ ...order, items: merged, earlyPay }); // หักส่วนลด (ส่วนลดคิดจาก subtotal เดิม ไม่คิดซ้ำของที่สั่งเพิ่ม)
  const owed = newTotal - (order.paidTotal ?? 0);

  const updated = withLog(
    {
      ...order,
      items: merged,
      ...(earlyPay ? { earlyPay } : {}),
      // มียอดค้าง → กลับไปรอชำระ · ไม่มียอดค้าง (เช่นยังไม่เคยจ่าย) → คงสถานะเดิม
      status: owed > 0 ? "รอชำระเงิน" : order.status,
    },
    "ลูกค้า",
    "สั่งเพิ่มในออเดอร์เดิม",
    `${items.length} รายการ · ยอดรวมใหม่ ฿${newTotal.toLocaleString()}`
  );

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  const { key: _secret, ...safe } = updated;
  void _secret;
  return NextResponse.json({ ok: true, order: safe, owed: Math.max(0, owed) });
}
