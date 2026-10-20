import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { updateOrder } from "@/lib/server/order-write";
import { isPickupOrder } from "@/lib/ship-label";
import { isShipMain, isShipRider, shipMainIdOf, shipRiderIdsOf } from "@/lib/ship-with";
import { unshippedQty, withLog, type Order, type OrderStatus } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ↩ ยกเลิก "แพ็คเสร็จ — รอลูกค้ามารับ" (ใบมารับเอง) — แอดมินเท่านั้น (orders.edit)
 *
 * ทำไมต้องมี (20 ต.ค. 69): ใบแบ่งรับ 4 ใบในวันเดียวถูกกด "แพ็คเสร็จ" ซึ่งคือรอบสุดท้าย = ปิดทั้งใบ ทั้งที่ลูกค้ารับไปแค่รอบแรก
 *   OD-261007-2540 / OD-261016-5502 (ตั้งใจ "ปิดงานรอบ 1") · OD-260917-6432 / OD-260930-9389 (แตะเบิ้ล 1–5 วิหลังบันทึกรอบ 1)
 *   เดิมย้อนได้ทางเดียวคือให้ Claude เขียนสคริปต์ซ่อม (scripts/pickup-round-reopen.mts)
 *
 * ทำอะไร: ถอด packedAt + pickedUp (ถ้าปิดงานไปแล้ว) · สถานะ → กำลังผลิต · รอบแบ่งส่ง/ภาพ/ผลตรวจนับคงเดิม
 * ⚠️ ไม่แจ้งไลน์ลูกค้า (ใช้ updateOrder ตรง) — ลูกค้าได้ไลน์ "จัดส่งแล้ว/เสร็จสิ้น" ไปแล้วต้องคุยในแชทเอง
 * 🏪📦 ชุดรับพร้อมกัน: ย้อนที่ใบหลัก = ย้อนใบตามที่แพ็คเสร็จไปพร้อมกัน (packedAt เวลาเดียวกัน) · กดที่ใบตาม = 409 ชี้ไปใบหลัก
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { orderId?: string; reason?: string };
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่ได้ระบุออเดอร์" }, { status: 400 });
  const reason = String(body.reason ?? "").trim();

  const { data, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  const o = data?.data as Order | undefined;
  if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  if (!isPickupOrder(o)) return NextResponse.json({ error: "ใช้ได้เฉพาะใบมารับเอง — ใบส่งพัสดุใช้ “↩ ของตีกลับ” แทน" }, { status: 409 });
  if (!o.packedAt) return NextResponse.json({ error: "ใบนี้ยังไม่ได้กดแพ็คเสร็จ — ไม่มีอะไรให้ย้อน" }, { status: 409 });
  if (o.status === "ยกเลิก") return NextResponse.json({ error: "ใบนี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (isShipRider(o))
    return NextResponse.json({ error: `ใบนี้แพ็ครวมกับ ${shipMainIdOf(o)} — ยกเลิกแพ็คเสร็จที่ใบ ${shipMainIdOf(o)} ใบเดียว ใบนี้จะย้อนให้เอง` }, { status: 409 });

  const by = gate.actor.name?.trim() || gate.actor.username;
  const reopen = (x: Order, note: string): Order => {
    const { packedAt, pickedUp, ...rest } = x;
    // รอบแบ่งรับที่ถูกจดรับพร้อมการปิดงานครั้งนั้น ย้อนตามด้วย
    const shipments = x.shipments?.map((s) => (pickedUp && s.pickedUp?.at === pickedUp.at ? { ...s, pickedUp: undefined } : s));
    const left = x.shipments?.length ? unshippedQty(x) : 0;
    return withLog(
      { ...(rest as Order), ...(shipments ? { shipments } : {}), status: "กำลังผลิต" as OrderStatus },
      by,
      "↩ ยกเลิกแพ็คเสร็จ — กลับไปกำลังผลิต",
      [
        `เดิมกดแพ็คเสร็จ ${packedAt?.at ?? "-"} โดย ${packedAt?.by ?? "-"}`,
        pickedUp ? `ล้าง “ลูกค้ามารับของแล้ว” (${pickedUp.by})` : "",
        x.shipments?.length ? `แบ่งรับไปแล้ว ${x.shipments.length} รอบ · ของที่เหลือ ${left.toLocaleString("th-TH")} ชิ้นกลับเข้าคิวปริ้น “ใบปะหน้ารอบถัดไป”` : "",
        `สถานะ ${x.status} → กำลังผลิต`,
        reason ? `สาเหตุ: ${reason}` : "",
        note,
        "ไม่แจ้งลูกค้า",
      ]
        .filter(Boolean)
        .join(" · ")
    );
  };

  let riders: Order[] = [];
  if (isShipMain(o)) {
    const { data: rr } = await sb.from("orders").select("data").in("id", shipRiderIdsOf(o));
    riders = (rr ?? []).map((r) => r.data as Order).filter((r) => isShipRider(r) && shipMainIdOf(r) === o.id && r.packedAt?.at === o.packedAt!.at && r.status !== "ยกเลิก");
  }
  const written = await updateOrder(sb, reopen(o, riders.length ? `ย้อนใบที่แพ็ครวม ${riders.map((r) => r.id).join(", ")} ด้วย` : ""), { prev: o, by: `แอดมิน ${by}` });
  if (written.error) return NextResponse.json({ error: written.error.message }, { status: 500 });
  for (const r of riders) {
    const wr = await updateOrder(sb, reopen(r, `ย้อนตามใบหลัก ${o.id}`), { prev: r, by: `แอดมิน ${by}` });
    if (wr.error) console.error(`[orders/unpack] ย้อนใบแพ็ครวม ${r.id} ไม่สำเร็จ:`, wr.error.message);
  }
  return NextResponse.json({ ok: true, order: written.order, reopened: riders.map((r) => r.id) });
}
