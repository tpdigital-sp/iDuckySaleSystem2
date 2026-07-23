import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order, type OrderItem, type OrderStatus } from "@/lib/admin-data";

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

  const merged = [...order.items, ...items];
  const newTotal = merged.reduce((s, i) => s + i.qty * i.unitPrice, 0) + order.shippingCost;
  const owed = newTotal - (order.paidTotal ?? 0);

  const updated = withLog(
    {
      ...order,
      items: merged,
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
