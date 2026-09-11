import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { orderBalance, orderTotal, withLog, type Order, type OrderCharge, type OrderStatus } from "@/lib/admin-data";
import { notifyCustomerLogged, orderLink } from "@/lib/server/notify";
import { signPaymentUrls } from "@/lib/server/slip-sign";

export const runtime = "nodejs";

/** สถานะที่ยังไม่เข้าไลน์ผลิต — ยอดโตแล้วให้เด้งกลับ "รอชำระเงิน" (ชุดเดียวกับ REOPEN_FOR_BALANCE ใน PATCH /api/admin/orders) */
const REOPEN_FOR_BALANCE: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"];
const thb = (n: number) => n.toLocaleString("th-TH");

/**
 * 🧾 เก็บค่าบริการเพิ่มทีหลัง (ค่าตัดภาพ · ค่าส่งเพิ่ม · ค่าเร่งงาน · ค่าแก้ไฟล์ …) — ไม่ใช่สินค้า ไม่เข้าใบงานผลิต
 * POST { orderId, label, amount, note? } → ต่อท้าย order.charges[] · ยอดรวมโต · แจ้งลูกค้าทางไลน์ยอดที่ต้องโอนเพิ่ม + ลิงก์แนบสลิป
 *   • ใบที่แอดมินเคยกด "ชำระแล้ว" เองโดยไม่มี paidTotal → ถือว่ารับครบเท่ายอดก่อนเก็บเพิ่ม (ไม่งั้นระบบไม่รู้ว่าค้าง)
 *   • ยังไม่เข้าไลน์ผลิต → เด้งกลับ "รอชำระเงิน" · ผลิตอยู่แล้ว → สถานะเดิม แต่ล็อกยิงเลขพัสดุด้วยยอดค้าง (packGate/hasUnpaidBalance)
 * DELETE { orderId, chargeId } → ถอดรายการ (ลง log) — ถ้าลูกค้าโอนมาแล้วจะกลายเป็นโอนเกิน แอดมินดูเอง
 * สิทธิ์: orders.edit + orders.money (แก้บิลได้และเห็นเงิน)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  if (!can(gate.actor, "orders.money", await loadRolePerms())) return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เรื่องเงินของออเดอร์" }, { status: 403 });
  const who = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; label?: string; amount?: number; note?: string };
  const orderId = String(body.orderId ?? "").trim();
  const label = String(body.label ?? "").trim().slice(0, 80);
  const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
  const note = String(body.note ?? "").trim().slice(0, 300) || undefined;
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "ใส่ชื่อรายการที่เก็บเพิ่ม" }, { status: 400 });
  if (!(amount > 0)) return NextResponse.json({ error: "ยอดต้องมากกว่า 0" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (order.status === "ยกเลิก") return NextResponse.json({ error: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (order.claimOf) return NextResponse.json({ error: "ออเดอร์เคลม/ทำใหม่ไม่คิดเงิน — เก็บเพิ่มไม่ได้" }, { status: 409 });

  const now = new Date().toISOString();
  const charge: OrderCharge = { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label, amount, note, by: who, at: now };
  const totalBefore = orderTotal(order);
  const waiting = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
  let updated: Order = { ...order, charges: [...(order.charges ?? []), charge] };
  // แอดมินยืนยันเงินเข้าเองมาก่อนโดยไม่มี paidTotal (เงินสด/ไม่มีสลิป) → ถือว่ารับครบเท่าบิลเดิม
  if (updated.paidTotal == null && !waiting && !updated.deposit) updated = { ...updated, paidTotal: totalBefore };
  const total = orderTotal(updated);
  const bal = orderBalance(updated);
  // ยังไม่เข้าไลน์ผลิต + มียอดค้างจริง → กลับไปรอชำระเงิน (ใบมัดจำมีเส้นทางเก็บงวดหลังของตัวเอง ไม่เด้ง)
  const reopen = !updated.deposit && REOPEN_FOR_BALANCE.includes(updated.status) && updated.paidTotal != null && bal > 0;
  if (reopen) updated = { ...updated, status: "รอชำระเงิน", reopenedFrom: order.status };
  updated = withLog(
    updated,
    who,
    `เก็บเพิ่ม: ${label} ${thb(amount)} บาท`,
    `ยอดรวม ${thb(totalBefore)} → ${thb(total)} บาท${updated.paidTotal != null ? ` · ค้าง ${thb(bal)} บาท` : ""}${note ? ` · ${note}` : ""}${reopen ? " · กลับไปรอชำระเงิน" : ""}`
  );
  // จำยอดค้างที่กำลังบอกลูกค้า — แอดมินลดยอดทีหลังก่อนลูกค้าโอน จะได้แจ้งยอดใหม่ให้ (ดู balanceShrank ใน /api/admin/orders)
  if (updated.paidTotal != null) updated = { ...updated, balanceNotified: { at: now, balance: bal } };
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // แจ้งลูกค้าทันที — บอกว่าเก็บอะไร เท่าไร และยอดที่ต้องโอนเพิ่ม (ลิงก์เดิม แนบสลิปได้เลย)
  const link = orderLink(new URL(req.url).origin, updated);
  const due = updated.paidTotal != null ? bal : total;
  void notifyCustomerLogged(
    sb,
    updated,
    `🧾 ออเดอร์ ${updated.id} มีค่าบริการเพิ่ม: ${label} ${thb(amount)} บาท${note ? `\n${note}` : ""}\n💰 ยอดรวมทั้งบิล ${thb(total)} บาท${
      due !== total ? `\n💳 ยอดที่ต้องโอนเพิ่ม ${thb(due)} บาท` : ""
    }\nโอนแล้วแนบสลิปที่ลิงก์นี้ได้เลยครับ\n${link}`,
    `แจ้งเก็บเพิ่ม ${label} ${thb(amount)} บาท`,
    "key"
  );
  // คืนออเดอร์พร้อมลิงก์สลิปที่เซ็นแล้ว — หน้าออเดอร์เอาไปแทนก้อนเดิมได้เลย
  return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, updated), charge });
}

export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  if (!can(gate.actor, "orders.money", await loadRolePerms())) return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เรื่องเงินของออเดอร์" }, { status: 403 });
  const who = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; chargeId?: string };
  const orderId = String(body.orderId ?? "").trim();
  const chargeId = String(body.chargeId ?? "").trim();
  if (!orderId || !chargeId) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  const c = (order.charges ?? []).find((x) => x.id === chargeId);
  if (!c) return NextResponse.json({ error: "ไม่พบรายการเก็บเพิ่มนี้" }, { status: 404 });

  const updated = withLog(
    { ...order, charges: (order.charges ?? []).filter((x) => x.id !== chargeId) },
    who,
    `ถอดรายการเก็บเพิ่ม: ${c.label} ${thb(c.amount)} บาท`,
    `ยอดรวม ${thb(orderTotal(order))} → ${thb(orderTotal({ ...order, charges: (order.charges ?? []).filter((x) => x.id !== chargeId) }))} บาท`
  );
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, updated) });
}
