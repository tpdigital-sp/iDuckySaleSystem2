import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order, type OrderStatus } from "@/lib/admin-data";

export const runtime = "nodejs";

// สถานะที่ล็อกที่อยู่แน่นอน (ส่งของไปแล้ว/จบ/ยกเลิก) — นอกเหนือจากเช็ค printedAt
const LOCKED_STATUS: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];

/**
 * ลูกค้าแก้ไขที่อยู่จัดส่ง (public แต่ต้องมี key ลับ)
 * POST { orderId, key, customer?, phone?, address }
 *
 * กติกา: แก้ได้ "จนกว่าจะปริ้นใบงาน" — ถ้า order.printedAt ถูกตั้งแล้ว = ล็อก
 * (บังคับฝั่งเซิร์ฟเวอร์ กันแก้ผ่าน DevTools)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { orderId?: string; key?: string; customer?: string; phone?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").trim();
  const address = (body.address ?? "").trim();
  const customer = (body.customer ?? "").trim();
  const phone = (body.phone ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!customer || !phone || !address)
    return NextResponse.json({ error: "กรอกชื่อผู้รับ เบอร์โทร และที่อยู่ให้ครบ" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (order.key && order.key !== (body.key ?? ""))
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });

  // ── ล็อก: ปริ้นใบงานแล้ว หรือส่งของแล้ว → แก้ไม่ได้ ──
  if (order.printedAt)
    return NextResponse.json(
      { error: "ทางร้านปริ้นใบงานแล้ว ที่อยู่ถูกล็อก — หากต้องแก้ไข กรุณาติดต่อร้านทางไลน์", locked: true },
      { status: 409 }
    );
  if (LOCKED_STATUS.includes(order.status))
    return NextResponse.json(
      { error: `ออเดอร์อยู่ในขั้น “${order.status}” แล้ว แก้ไขที่อยู่ไม่ได้ — ติดต่อร้าน`, locked: true },
      { status: 409 }
    );

  const updated = withLog(
    { ...order, customer, phone, address },
    "ลูกค้า",
    "แก้ไขที่อยู่จัดส่ง"
  );

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  const { key: _secret, ...safe } = updated;
  void _secret;
  return NextResponse.json({ ok: true, order: safe });
}
