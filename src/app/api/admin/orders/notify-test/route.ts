import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { notifyCustomer, notifyLevelOf, orderLink, statusFlex } from "@/lib/server/notify";
import { SITE_URL } from "@/lib/shop-info";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ส่งข้อความทดสอบหาลูกค้าของออเดอร์นี้ — ไว้เช็คว่า "ลิงก์แชทที่วางไว้ใช้ส่งได้จริงไหม"
 * ก่อนจะไปหวังพึ่งตอนระบบทวงยอดอัตโนมัติทำงานเอง
 *
 * คืนเหตุผลตรง ๆ เมื่อส่งไม่ได้ (ลูกค้าบล็อก / token ผิด / โควตาหมด / ไม่รู้ LINE ของลูกค้า)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
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
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;

  const who = gate.actor.name?.trim() || gate.actor.username;
  // ส่งข้อความ "สถานะจริงตอนนี้" ไปเลย — แอดมินจะได้เห็นว่าลูกค้าได้รับอะไรจริง ๆ
  const link = orderLink(SITE_URL, order);
  // ปุ่มทดสอบส่งข้ามการกรองระดับแจ้งเตือน (แอดมินต้องเช็คได้เสมอ) — แต่บอกให้รู้ว่าลูกค้าตั้งค่าอะไรไว้
  const level = await notifyLevelOf(sb, order);
  const r = await notifyCustomer(sb, order, statusFlex(order, link));
  return NextResponse.json({
    ok: r.ok,
    via: r.via, // "chatlink" = ส่งผ่านลิงก์แชทที่แอดมินวางไว้ · "login" = ลูกค้าล็อกอิน LINE เอง
    reason: r.reason,
    level, // "all" | "key" | "off" — ลูกค้าเลือกไว้
    by: who,
  });
}
