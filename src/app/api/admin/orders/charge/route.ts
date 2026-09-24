import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { clearStageMemory, hasUnpaidBalance, orderTotal, stageAfterPayment, withLog, type Order, type OrderCharge } from "@/lib/admin-data";
import { notifyCustomerLogged, orderLink } from "@/lib/server/notify";
import { applyCharge, chargeNotice, newChargeId } from "@/lib/server/order-charge";
import { signPaymentUrls } from "@/lib/server/slip-sign";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

const thb = (n: number) => n.toLocaleString("th-TH");

/**
 * 🧾 เก็บค่าบริการเพิ่มทีหลัง (ค่าตัดภาพ · ค่าส่งเพิ่ม · ค่าเร่งงาน · ค่าแก้ไฟล์ …) — ไม่ใช่สินค้า ไม่เข้าใบงานผลิต
 * POST { orderId, label, amount, note? } → ต่อท้าย order.charges[] · ยอดรวมโต · แจ้งลูกค้าทางไลน์ยอดที่ต้องโอนเพิ่ม + ลิงก์แนบสลิป
 *   • ใบที่แอดมินเคยกด "ชำระแล้ว" เองโดยไม่มี paidTotal → ถือว่ารับครบเท่ายอดก่อนเก็บเพิ่ม (ไม่งั้นระบบไม่รู้ว่าค้าง)
 *   • มียอดค้างจริง → เด้งกลับ "รอชำระเงิน" (รวมใบที่กำลังผลิต ตั้งแต่ 24 ก.ย. 69 — คิวปริ้น/แพ็คยังเห็นผ่าน queueStageOf) · เงินครบกลับขั้นเดิมเอง
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
  const charge: OrderCharge = { id: newChargeId(), label, amount, note, by: who, at: now };
  // กติกากลาง (เด้งกลับรอชำระเงิน · balanceNotified · log) อยู่ที่ applyCharge — ใช้ร่วมกับ "แนบบิลเพิ่ม" FlowAccount
  const applied = applyCharge(order, charge, who);
  const updated = applied.order;
  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // แจ้งลูกค้าทันที — บอกว่าเก็บอะไร เท่าไร และยอดที่ต้องโอนเพิ่ม (ใบ FlowAccount = โอนตามเอกสาร ส่งสลิปในแชท)
  const link = orderLink(new URL(req.url).origin, updated);
  void notifyCustomerLogged(sb, updated, chargeNotice(applied, charge, link), `แจ้งเก็บเพิ่ม ${label} ${thb(amount)} บาท`, "key");
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
    {
      ...order,
      charges: (order.charges ?? []).filter((x) => x.id !== chargeId),
      // 🧾➕ บิลเพิ่มที่คู่กับค่านี้ถอดตามไปด้วย (ใบกำกับที่ไม่ได้เก็บเงินแล้วไม่ควรค้างให้ฝ่ายแพ็คหา)
      ...(order.flowAccountExtras?.some((x) => x.chargeId === chargeId)
        ? { flowAccountExtras: order.flowAccountExtras.filter((x) => x.chargeId !== chargeId) }
        : {}),
    },
    who,
    `ถอดรายการเก็บเพิ่ม: ${c.label} ${thb(c.amount)} บาท`,
    `ยอดรวม ${thb(orderTotal(order))} → ${thb(orderTotal({ ...order, charges: (order.charges ?? []).filter((x) => x.id !== chargeId) }))} บาท`
  );
  // ↩️ ถอดแล้วยอดค้างหมด + ใบเคยถูกเด้งกลับรอชำระเงินเพราะยอดนี้ → คืนขั้นเดิมที่จำไว้เอง (กติกาเดียวกับ PATCH restoredFromReopen)
  const restored =
    updated.status === "รอชำระเงิน" && !!updated.reopenedFrom && !updated.deposit && !updated.claimOf && hasUnpaidBalance(order) && !hasUnpaidBalance(updated);
  const final = restored
    ? withLog({ ...updated, status: stageAfterPayment(updated), ...clearStageMemory }, who, "ยอดค้างหมดแล้ว — กลับไปขั้นเดิม", `รอชำระเงิน → ${stageAfterPayment(updated)}`)
    : updated;
  const { error } = await updateOrder(sb, final);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, final) });
}
