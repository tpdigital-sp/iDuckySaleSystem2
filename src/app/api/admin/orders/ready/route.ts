import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

/**
 * ✅ "งานเสร็จพร้อมส่งแล้ว" — ติ๊ก/ถอดจากรายงานงานค้าง (/admin/reports/wip)
 *
 * พนักงานขอ 30 ก.ย. 69: เดิมติ๊กในชีต Google (คอลัมน์ "งานเสร็จพร้อมส่งแล้ว") แยกจากระบบ
 * เขียนฝั่งเซิร์ฟเวอร์ทีละฟิลด์ ไม่ต้องส่งออเดอร์ทั้งก้อน (กันทับงานคนอื่น) · ลง log ทุกครั้ง
 * ไม่เปลี่ยนสถานะออเดอร์ ไม่แจ้งลูกค้า — แค่ป้ายให้ฝ่ายแพ็ค/แอดมินรู้ว่าของเสร็จแล้ว
 *
 * POST { id, on } → { ok, readyToShip? }
 */
export async function POST(req: Request) {
  // ฝ่ายผลิต (wip.view) + คนหน้าแพ็ค + แอดมิน — กราฟฟิกไม่ติ๊ก (ไม่ใช่คนเห็นของจริง)
  const gate = await requirePerm(["wip.view", "orders.edit", "pack.check", "pack.ship"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; on?: boolean };
  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  const on = body.on !== false;

  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  const o = data?.data as Order | undefined;
  if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  if (o.status === "ยกเลิก") return NextResponse.json({ error: "ใบนี้ยกเลิกไปแล้ว" }, { status: 409 });

  const by = gate.actor.name?.trim() || gate.actor.username;
  // ค่าเดิมตรงกับที่ขอแล้ว = ไม่ต้องเขียน (กดซ้ำ/สองคนกดพร้อมกัน)
  if (on === !!o.readyToShip) return NextResponse.json({ ok: true, readyToShip: o.readyToShip ?? null });

  let next: Order;
  if (on) {
    next = withLog({ ...o, readyToShip: { by, at: new Date().toISOString() } }, by, "✅ งานเสร็จพร้อมส่งแล้ว");
  } else {
    const { readyToShip: _rt, ...rest } = o;
    void _rt;
    next = withLog(rest as Order, by, "↩️ ถอดป้ายงานเสร็จพร้อมส่ง");
  }
  const { order: saved, error } = await updateOrder(sb, next, { prev: o, by });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, readyToShip: saved.readyToShip ?? null });
}
