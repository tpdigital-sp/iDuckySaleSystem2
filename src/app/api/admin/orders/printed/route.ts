import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ทำเครื่องหมายว่า "ปริ้นใบงานแล้ว" — ตั้ง printedAt ครั้งแรก (ล็อกที่อยู่ฝั่งลูกค้า)
 * เรียกจากหน้าปริ้นตอนแอดมินกดพิมพ์ · ต้องมีสิทธิ์ pack.ship (ทีมปริ้น/แพ็ค)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("pack.ship");
  if (gate.res) return gate.res;

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "ไม่พบออเดอร์" }, { status: 404 });

  const order = row.data as Order;
  if (order.printedAt) return NextResponse.json({ ok: true, alreadyPrinted: true }); // ตั้งครั้งเดียว

  const updated = withLog(
    { ...order, printedAt: new Date().toISOString() },
    gate.actor.name || gate.actor.username,
    "ปริ้นใบงาน — ล็อกที่อยู่จัดส่ง"
  );
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
