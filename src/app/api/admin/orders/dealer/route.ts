import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { orderTotal, withLog, type Order } from "@/lib/admin-data";
import { getProductServer } from "@/lib/products-server";
import { dealerLeftoverDiscount, dealerRepriceBlockedBy, repriceOrderForDealer } from "@/lib/order-dealer";
import { signPaymentUrls } from "@/lib/server/slip-sign";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

const thb = (n: number) => n.toLocaleString("th-TH");

/**
 * 🤝 ทำใบนี้ให้เป็น "ออเดอร์ตัวแทนจำหน่าย" (หรือถอดกลับเป็นราคาปกติ)
 * POST { orderId, on } → สลับทุกบรรทัดไปเรทตัวแทน + ถอดส่วนลดที่ตัวแทนไม่ได้ (โอนไว/ระดับสมาชิก/ของแถม) + ติดธง dealer
 *
 * มีไว้เพราะตัวแทน "ลืมล็อกอินแล้วสั่ง" ได้ (OD-260915-3447) — เว็บไม่มีทางรู้ว่าเป็นตัวแทนตอนนั้น
 * กติกาและการคิดราคาอยู่ใน lib/order-dealer.ts ที่เดียว (ใช้ตัวคิดราคาชุดเดียวกับตะกร้า)
 * สิทธิ์: orders.edit + orders.money (แก้บิลได้และเห็นเงิน) — ชุดเดียวกับการเก็บเงินเพิ่ม
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  if (!can(gate.actor, "orders.money", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เรื่องเงินของออเดอร์" }, { status: 403 });
  const who = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; on?: boolean };
  const orderId = String(body.orderId ?? "").trim();
  const on = body.on !== false;
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (!!order.dealer === on)
    return NextResponse.json({ error: on ? "ใบนี้เป็นออเดอร์ตัวแทนอยู่แล้ว" : "ใบนี้ไม่ใช่ออเดอร์ตัวแทนอยู่แล้ว" }, { status: 409 });
  const blocked = dealerRepriceBlockedBy(order);
  if (blocked) return NextResponse.json({ error: `เปลี่ยนราคาไม่ได้ — ${blocked}` }, { status: 409 });

  const { order: repriced, changed, skipped } = await repriceOrderForDealer(order, on, getProductServer);
  const totalBefore = orderTotal(order);
  const total = orderTotal(repriced);
  const detail = [
    ...changed.map((c) => `${c.name} ฿${thb(c.from)} → ฿${thb(c.to)}/หน่วย × ${c.qty}`),
    ...(skipped.length ? [`ไม่ได้สลับ ${skipped.length} รายการ (ไม่มีราคาตัวแทน): ${skipped.join(" · ")}`] : []),
    `ยอดรวม ฿${thb(totalBefore)} → ฿${thb(total)}`,
  ].join(" · ");

  const updated = withLog(repriced, who, on ? "🤝 เปลี่ยนเป็นราคาตัวแทนจำหน่าย" : "ถอดราคาตัวแทนจำหน่าย (กลับราคาปกติ)", detail);
  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    order: await signPaymentUrls(sb, updated),
    changed,
    skipped,
    totalBefore,
    total,
    // ส่วนลดที่ระบบไม่ได้ถอดให้ (คูปอง/ส่วนลดที่แอดมินใส่เอง) — ตัวแทนไม่ควรได้ ให้แอดมินตัดสินใจเอง
    leftoverDiscount: on ? dealerLeftoverDiscount(updated) : 0,
  });
}
