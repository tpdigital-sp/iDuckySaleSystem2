import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/** ประวัติออเดอร์ของลูกค้าที่ล็อกอิน — ยืนยันตัวตนด้วย access token ใน Authorization header */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ orders: [] });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u.user) return NextResponse.json({ error: "เซสชันหมดอายุ" }, { status: 401 });

  // กรองที่ฐานข้อมูล (data->>customerId) + เรียงใหม่สุดก่อน — เดิมดึงทั้งตารางมากรองในนี้
  // ทำให้ยิ่งมีออเดอร์เยอะยิ่งช้า และ orders[0] ("ออเดอร์ล่าสุด") ก็ไม่ได้การันตีว่าใหม่สุด
  const { data, error } = await sb
    .from("orders")
    .select("data")
    .eq("data->>customerId", u.user.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
      return NextResponse.json({ orders: [], needsSetup: true });
    return NextResponse.json({ error: error.message, orders: [] }, { status: 500 });
  }
  const mine = (data ?? []).map((r) => r.data as Order);
  return NextResponse.json({ orders: mine });
}
