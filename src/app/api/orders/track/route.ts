import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isThaiPostNumber, trackThailandPost } from "@/lib/server/thailand-post";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * สถานะพัสดุไปรษณีย์ไทยของออเดอร์ — ใช้ได้ 2 ทาง:
 *  - ทีมงาน (มีคุกกี้หลังบ้าน) ส่ง ?number=
 *  - ลูกค้า ส่ง ?orderId=&key= (ต้องตรงกับออเดอร์ และใช้เลขพัสดุของออเดอร์นั้นเอง)
 * กันคนนอกใช้เราเป็น proxy ยิง API ปณ. ฟรี ๆ
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = (url.searchParams.get("orderId") ?? "").trim();
  const key = (url.searchParams.get("key") ?? "").trim();
  let number = (url.searchParams.get("number") ?? "").trim().toUpperCase();

  if (orderId && key) {
    // ทางลูกค้า (กุญแจออเดอร์) — ต้องมาก่อนเช็คคุกกี้ ไม่งั้นทีมงานที่ล็อกอินค้างไว้เปิดลิงก์ลูกค้าแล้วพัง
    const sb = getSupabaseAdmin();
    if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
    const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
    const order = row?.data as Order | undefined;
    if (!order || (order.key ?? "") !== key) return NextResponse.json({ error: "ไม่มีสิทธิ์เรียกดู" }, { status: 401 });
    number = (order.tracking ?? "").trim().toUpperCase();
  } else {
    // ทางทีมงาน: ส่ง ?number= ตรง ๆ ได้ (ต้องล็อกอินหลังบ้าน)
    const actor = await currentActor();
    if (!actor) return NextResponse.json({ error: "ไม่มีสิทธิ์เรียกดู" }, { status: 401 });
  }

  if (!number) return NextResponse.json({ error: "ไม่มีเลขพัสดุ" }, { status: 400 });
  if (!isThaiPostNumber(number))
    return NextResponse.json({ configured: true, notThaiPost: true, events: [] });

  const r = await trackThailandPost(number);
  return NextResponse.json(r);
}
