import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { updateOrder } from "@/lib/server/order-write";
import { isPickupOrder } from "@/lib/ship-label";
import { canUnship, withLog, type Order, type OrderStatus, type ReturnedShipment } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ↩ ของตีกลับ / ยกเลิกการส่ง — ยิงเลขพัสดุไปแล้วแต่ของกลับมาที่ร้าน ต้องแพ็คส่งใหม่ (ดู ReturnedShipment ใน admin-data.ts)
 * เคสแรก OD-260929-7393 (12 ต.ค. 69): ต้องส่ง 10 ที่อยู่ ฝ่ายแพ็คส่งรวมกล่องเดียว → ไปเอาของคืนมา ต้องตั้งแผนแบ่งส่งใหม่
 * แต่กล่อง 📋 แผนแบ่งส่งซ่อนทันทีที่ใบมีเลขพัสดุ และหน้าจอไม่มีทางถอดเลขหลัก
 *
 * ทำอะไร: ถอดเลขช่องหลัก + กล่องเพิ่ม + แพ็คเสร็จ + ภาพก่อนปิดกล่อง (ย้ายเก็บในประวัติ) · สถานะกลับ "กำลังผลิต" · เก็บเลขเดิมใน Order.returned (ห้ามยิงซ้ำ)
 * ⚠️ ไม่แตะรอบแบ่งส่งที่ส่งไปแล้ว (shipments) · ไม่แจ้งไลน์ลูกค้า (ใช้ updateOrder ตรง ไม่ผ่าน PATCH) — แอดมินคุยในแชทเอง
 * แอดมินเท่านั้น (orders.edit) — ฝ่ายแพ็คไม่มีปุ่มนี้
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { orderId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่ได้ระบุออเดอร์" }, { status: 400 });
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "ต้องระบุว่าทำไมของถึงกลับมา" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  const order = row.data as Order;

  if (isPickupOrder(order)) return NextResponse.json({ error: "ใบมารับเองไม่มีพัสดุให้ถอด" }, { status: 409 });
  const may = canUnship(order);
  if (!may.ok) return NextResponse.json({ error: may.reason }, { status: 409 });

  const by = gate.actor.name?.trim() || gate.actor.username;
  const trackings = [order.tracking ?? "", ...(order.extraTrackings ?? []).map((b) => b.tracking)].map((t) => t.trim()).filter(Boolean);
  const record: ReturnedShipment = {
    trackings,
    reason,
    statusWas: order.status,
    by,
    at: new Date().toISOString(),
    // 📸 ภาพกล่องเก่าย้ายมาเก็บที่นี่ — ค้างใน packPhotos = ด่านแพ็ค "ต้องมีภาพก่อนปิดกล่อง" ผ่านด้วยภาพกล่องที่ตีกลับ
    ...(order.packPhotos?.length ? { packPhotos: order.packPhotos } : {}),
  };
  // ใบเสร็จสิ้น/จัดส่งแล้ว → กลับไปขั้นก่อนส่ง · ใบที่สถานะไม่ใช่ขั้นส่ง (แก้มือมาแล้ว) คงไว้
  const status: OrderStatus = order.status === "จัดส่งแล้ว" || order.status === "เสร็จสิ้น" ? "กำลังผลิต" : order.status;

  const next = withLog(
    {
      ...order,
      tracking: undefined,
      extraTrackings: undefined,
      packedAt: undefined,
      packPhotos: undefined,
      // 🧾 ใบเสร็จ/ใบกำกับกลับมากับกล่อง — ต้องใส่กล่องใหม่อีกรอบ
      taxInvoicePacked: undefined,
      status,
      returned: [...(order.returned ?? []), record],
    },
    by,
    "↩ ของตีกลับ — ยกเลิกการส่ง",
    [
      `เลขพัสดุที่ยกเลิก: ${trackings.join(", ")}`,
      `สาเหตุ: ${reason}`,
      status !== order.status ? `สถานะ ${order.status} → ${status}` : "",
      "ยังไม่แจ้งลูกค้า — แพ็คใหม่แล้วยิงเลขใหม่ ไลน์จะออกตามปกติ",
    ]
      .filter(Boolean)
      .join(" · ")
  );
  const written = await updateOrder(sb, next, { prev: order, by: `แอดมิน ${by}` });
  if (written.error) return NextResponse.json({ error: written.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: written.order });
}
