import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import type { Order } from "@/lib/admin-data";
import { applyCouponToOrder, removeCouponFromOrder, rollbackCouponRedeem } from "@/lib/server/order-coupon";
import { signPaymentUrls } from "@/lib/server/slip-sign";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

/**
 * 🎟️ แอดมินใส่คูปองให้ออเดอร์ที่มีอยู่แล้ว (หรือถอดออก) — ลูกค้าได้คูปองมาแล้วแต่ทักไลน์ให้แอดมินรวมยอด
 * POST { orderId, code } = ใช้คูปอง · POST { orderId, remove: true } = ถอดคูปองคืนสิทธิ์
 * กติกาทั้งหมดอยู่ที่ lib/server/order-coupon.ts (เทส npm run check:coupon-admin)
 * สิทธิ์: orders.edit + orders.money (ชุดเดียวกับปุ่มราคาตัวแทน)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  if (!can(gate.actor, "orders.money", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เรื่องเงินของออเดอร์" }, { status: 403 });
  const who = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; code?: string; remove?: boolean };
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;

  if (body.remove) {
    const r = await removeCouponFromOrder(sb, order, who);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const { error } = await updateOrder(sb, r.order, { prev: order, by: who });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, r.order), restored: r.restored });
  }

  const r = await applyCouponToOrder(sb, order, String(body.code ?? ""), who);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { error } = await updateOrder(sb, r.order, { prev: order, by: who });
  if (error) {
    // บันทึกใบไม่ผ่าน → คืนสิทธิ์คูปองให้เหมือนเดิม
    await rollbackCouponRedeem(sb, r.before, order.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, r.order), discount: r.discount });
}
