import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ลูกค้ายกเลิกออเดอร์เอง (public แต่ต้องมี key ลับ)
 * POST { orderId, key, reason? }
 *
 * กติกา — เปิดให้เฉพาะใบที่ "ยังไม่มีเงินเข้าเลย และร้านยังไม่เริ่มงาน":
 *   • สถานะต้องเป็น "รอชำระเงิน" เท่านั้น
 *   • ยังไม่แนบสลิป / ยังไม่กดแจ้งโอน · paidTotal ต้องเป็น 0 (ใบที่จ่ายแล้วแล้วสั่งเพิ่มจนกลับมารอชำระ = ไม่เข้าเงื่อนไข)
 *   • ใบมัดจำที่รับงวดแรกแล้ว = ไม่ได้
 *   • ปริ้นใบงานแล้ว = ไม่ได้
 * นอกเหนือจากนี้ให้ทักร้าน — พนักงานที่มีสิทธิ์ orders.cancel เป็นคนกดให้ (มีเรื่องคืนเงิน/ของที่ทำไปแล้ว)
 *
 * ไม่ต้องคืนสต๊อก/ถอนยอดขายที่นี่ — ทั้งสองอย่างเกิดตอนสถานะเป็น "ชำระแล้ว"
 * ซึ่งใบที่ผ่านด่านข้างบนมายังไม่เคยไปถึง
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { orderId?: string; key?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").trim();
  const reason = (body.reason ?? "").trim().slice(0, 300);
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (order.key && order.key !== (body.key ?? ""))
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });

  if (order.status === "ยกเลิก")
    return NextResponse.json({ ok: true, order: strip(order) }); // กดซ้ำ/เน็ตหลุดแล้วยิงใหม่ — ถือว่าสำเร็จ

  // ── ด่านตรวจฝั่งเซิร์ฟเวอร์ (บังคับจริง ไม่ใช่แค่ซ่อนปุ่ม) ──
  const paid =
    !!order.slipUrl ||
    !!order.slipPath ||
    !!order.paidReportedAt ||
    (order.paidTotal ?? 0) > 0 ||
    !!order.deposit?.firstPaidAt;

  if (paid)
    return NextResponse.json(
      {
        error: "ออเดอร์นี้แจ้งโอนไปแล้ว ยกเลิกเองไม่ได้ — ทักร้านทางไลน์ได้เลยครับ ทางร้านจะเช็คให้",
        locked: true,
      },
      { status: 409 }
    );

  if (order.printedAt)
    return NextResponse.json(
      { error: "ทางร้านเริ่มทำใบงานแล้ว ยกเลิกเองไม่ได้ — ทักร้านทางไลน์ได้เลยครับ", locked: true },
      { status: 409 }
    );

  if (order.status !== "รอชำระเงิน")
    return NextResponse.json(
      {
        error: `ออเดอร์อยู่ในขั้น “${order.status}” แล้ว ยกเลิกเองไม่ได้ — ทักร้านทางไลน์ได้เลยครับ`,
        locked: true,
      },
      { status: 409 }
    );

  const now = new Date().toISOString();
  const updated = withLog(
    {
      ...order,
      status: "ยกเลิก",
      cancelledByCustomer: { at: now, ...(reason ? { reason } : {}) },
      // คำขอแก้ไขที่ค้างอยู่ไม่ต้องให้แอดมินตามต่อแล้ว
      ...(order.editRequest && !order.editRequest.doneAt
        ? { editRequest: { ...order.editRequest, doneAt: now, doneBy: "ปิดอัตโนมัติ (ลูกค้ายกเลิกออเดอร์)" } }
        : {}),
    },
    "ลูกค้า",
    "ยกเลิกออเดอร์เอง",
    reason ? `เหตุผล: ${reason}` : "ยังไม่ได้แจ้งโอน — ยกเลิกจากหน้าออเดอร์"
  );

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, order: strip(updated) });
}

/** ตัด key ลับออกก่อนส่งกลับหน้าเว็บ (แบบเดียวกับ /api/orders/view) */
function strip(o: Order) {
  const { key: _secret, ...safe } = o;
  void _secret;
  return safe;
}
