import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";
import { withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

const BUCKET = "payment-slips-private";

/**
 * ลบสลิปออกจากออเดอร์ (ใช้ตอนสลิปผิดใบ/ทดสอบ) — เฉพาะ "ผู้ดูแลระบบ" เท่านั้น
 * รีเซ็ตการแจ้งโอนทั้งหมด → ออเดอร์กลับเป็น "รอชำระเงิน" ให้ลูกค้าแนบใหม่ได้
 */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (actor.role !== ROLE_ADMINISTRATOR)
    return NextResponse.json({ error: "ลบสลิปได้เฉพาะผู้ดูแลระบบ" }, { status: 403 });

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (!order.slipPath && !order.slipUrl) return NextResponse.json({ error: "ออเดอร์นี้ไม่มีสลิป" }, { status: 404 });
  // กันลบสลิปงานที่เดินหน้าไปแล้ว — ลบได้เฉพาะช่วงตรวจเงิน
  if (order.status !== "รอตรวจสอบ" && order.status !== "ชำระแล้ว" && order.status !== "รอชำระเงิน")
    return NextResponse.json({ error: `ออเดอร์อยู่สถานะ "${order.status}" แล้ว — ลบสลิปไม่ได้` }, { status: 409 });

  // ลบไฟล์จริงใน bucket (best-effort — path เก่าบางออเดอร์อาจไม่มี)
  if (order.slipPath) await sb.storage.from(BUCKET).remove([order.slipPath]);

  const updated = withLog(
    {
      ...order,
      slipPath: undefined,
      slipUrl: undefined,
      slipVerify: undefined,
      paidReportedAt: undefined,
      paidTotal: undefined,
      status: "รอชำระเงิน",
    },
    actor.name?.trim() || actor.username,
    "ลบสลิป (รีเซ็ตการแจ้งโอน)",
    "ออเดอร์กลับเป็น รอชำระเงิน — ลูกค้าแนบสลิปใหม่ได้"
  );
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: updated });
}
