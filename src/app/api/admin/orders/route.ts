import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/** แอดมินดึงออเดอร์จริงทั้งหมด (ใหม่→เก่า) */
export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ orders: [] });
  const gate = await requirePerm("orders.view");
  if (gate.res) return gate.res;

  const { data, error } = await sb.from("orders").select("data").order("created_at", { ascending: false });
  if (error) {
    // ตารางยังไม่ถูกสร้าง → บอกให้รัน SQL (ไม่ถือเป็น error ร้ายแรง)
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
      return NextResponse.json({ orders: [], needsSetup: true });
    return NextResponse.json({ error: error.message, orders: [] }, { status: 500 });
  }
  return NextResponse.json({ orders: (data ?? []).map((r) => r.data as Order) });
}

/** แอดมินอัปเดตออเดอร์ (เปลี่ยนสถานะ ฯลฯ) — ส่ง Order เต็มมา */
export async function PATCH(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  let order: Order;
  try {
    order = (await req.json()) as Order;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!order?.id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { error } = await sb.from("orders").update({ data: order }).eq("id", order.id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
