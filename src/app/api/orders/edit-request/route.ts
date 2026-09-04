import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order, type OrderStatus } from "@/lib/admin-data";

export const runtime = "nodejs";

/** ปิดรับคำขอแก้ไขเมื่อของออกจากร้านแล้ว — แก้ไม่ทันแล้ว ให้ทักร้านคุยเรื่องเคลมแทน */
const CLOSED: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];

/**
 * ลูกค้าส่ง "ขอแก้ไขออเดอร์" (public แต่ต้องมี key ลับ)
 * POST { orderId, key, text }
 *
 * ตั้งใจให้เป็น "คำขอ" ไม่ใช่การแก้จริง — ลูกค้าพิมพ์บอกว่าอยากแก้อะไร
 * แล้วแอดมินเป็นคนแก้ให้ในหน้าหลังบ้าน (กันยอดในบิลเพี้ยนจากสลิปที่โอนมาแล้ว)
 * ส่งซ้ำได้ = ทับข้อความเดิม (ประวัติเก็บครบทุกครั้งใน log)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { orderId?: string; key?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").trim();
  const text = (body.text ?? "").trim().slice(0, 800);
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (text.length < 3) return NextResponse.json({ error: "พิมพ์บอกหน่อยครับว่าอยากแก้ตรงไหน" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (order.key && order.key !== (body.key ?? ""))
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });

  if (CLOSED.includes(order.status))
    return NextResponse.json(
      {
        error: `ออเดอร์อยู่ในขั้น “${order.status}” แล้ว ส่งคำขอแก้ไขไม่ได้ — ทักร้านทางไลน์ได้เลยครับ`,
        locked: true,
      },
      { status: 409 }
    );

  const updated = withLog(
    { ...order, editRequest: { text, at: new Date().toISOString() } },
    "ลูกค้า",
    "ขอแก้ไขออเดอร์",
    text
  );

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  const { key: _secret, ...safe } = updated;
  void _secret;
  return NextResponse.json({ ok: true, order: safe });
}
