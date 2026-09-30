import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadRolePerms } from "@/lib/server/role-perms";
import { can } from "@/lib/permissions";
import { orderTotal, proofsOf, type Order } from "@/lib/admin-data";
import { isWipOrder, type WipOrder, type WipResponse } from "@/lib/wip-report";

export const runtime = "nodejs";

/**
 * 🗂 ข้อมูลรายงานงานค้าง โอนแล้ว→กำลังผลิต (/admin/reports/wip)
 *
 * แยกจาก /api/admin/orders เพราะฝ่ายผลิต (สิทธิ์ wip.view) ต้องเห็นแค่ที่จำเป็น:
 * เลขที่ · ชื่อลูกค้า · รายการ+จำนวน · วันส่ง/วันใช้งาน · สถานะ · ป้ายเร่ง/ปริ้น/รอของ/งานเสร็จ
 * ฟิลด์อ่อนไหวเติมตามสิทธิ์: phone (orders.view) · total (orders.money) — ที่อยู่/สลิป/LINE ไม่ส่งให้ใครเลยจากทางนี้
 *
 * GET → WipResponse (เฉพาะใบในช่วง ชำระแล้ว→กำลังผลิต ไม่รวมยกเลิก)
 */
export async function GET() {
  const gate = await requirePerm(["wip.view", "orders.view"]);
  if (gate.res) return gate.res;
  const rolePerms = await loadRolePerms();
  const full = can(gate.actor, "orders.view", rolePerms);
  const money = can(gate.actor, "orders.money", rolePerms);
  const mayTick = ["wip.view", "orders.edit", "pack.check", "pack.ship"].some((p) => can(gate.actor, p as Parameters<typeof can>[1], rolePerms));

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "ยังไม่ได้ตั้งค่า Supabase", orders: [] } satisfies WipResponse, { status: 503 });

  // ให้ Postgres กรองสถานะก่อน — ใบที่จบ/ยกเลิกเป็นส่วนใหญ่ของตาราง ไม่ต้องลากมา
  // (ใบที่เด้งกลับ "รอชำระเงิน" เพราะค้างส่วนต่าง มี reopenedFrom → ต้องเอามาด้วยแล้วค่อยคัดใน isWipOrder)
  const { data, error } = await sb
    .from("orders")
    .select("data")
    .in("data->>status", ["ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ", "กำลังผลิต", "รอชำระเงิน"])
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[orders/wip] ถามฐานไม่สำเร็จ:", error.message);
    return NextResponse.json({ ok: false, error: error.message, orders: [] } satisfies WipResponse, { status: 500 });
  }

  const orders: WipOrder[] = [];
  for (const r of data ?? []) {
    const o = r.data as Order;
    if (!isWipOrder(o)) continue;
    orders.push({
      id: o.id,
      customer: o.customer,
      date: o.date,
      status: o.status,
      ...(o.reopenedFrom ? { reopenedFrom: o.reopenedFrom } : {}),
      ...(o.shipping ? { shipping: o.shipping } : {}),
      ...(o.shippingLabel ? { shippingLabel: o.shippingLabel } : {}),
      ...(o.shipDate ? { shipDate: o.shipDate } : {}),
      ...(o.useByDate ? { useByDate: o.useByDate } : {}),
      ...(o.rush ? { rush: true } : {}),
      ...(o.printedAt ? { printedAt: o.printedAt } : {}),
      ...(o.readyToShip ? { readyToShip: o.readyToShip } : {}),
      ...(o.deposit ? { deposit: { ...(o.deposit.firstPaidAt ? { firstPaidAt: o.deposit.firstPaidAt } : {}), ...(o.deposit.settledAt ? { settledAt: o.deposit.settledAt } : {}) } } : {}),
      ...(o.needsPurchase ? { needsPurchase: { ...(o.needsPurchase.arrivedAt ? { arrivedAt: o.needsPurchase.arrivedAt } : {}), ...(o.needsPurchase.note ? { note: o.needsPurchase.note } : {}) } } : {}),
      items: (o.items ?? []).map((i) => ({
        productId: i.productId,
        name: i.name,
        qty: i.qty,
        ...(i.selections ? { selections: i.selections } : {}),
        ...(i.sel ? { sel: i.sel } : {}),
        ...(i.unitYield ? { unitYield: i.unitYield } : {}),
        ...(i.artworkUrls?.length ? { artworkUrls: i.artworkUrls } : {}),
        ...(i.artworkBackUrls?.length ? { artworkBackUrls: i.artworkBackUrls } : {}),
        ...(i.artworkQty ? { artworkQty: i.artworkQty } : {}),
        ...(i.artworkSize ? { artworkSize: i.artworkSize } : {}),
        ...(proofsOf(i).length
          ? {
              proofs: proofsOf(i).map((p) => ({
                url: p.url,
                ...(p.qty != null ? { qty: p.qty } : {}),
                ...(p.unit ? { unit: p.unit } : {}),
                ...(p.note ? { note: p.note } : {}),
                ...(p.review ? { review: p.review } : {}),
              })),
            }
          : {}),
        ...(i.proofStatus ? { proofStatus: i.proofStatus } : {}),
        ...(i.noProof ? { noProof: true } : {}),
      })),
      ...(full && o.phone ? { phone: o.phone } : {}),
      ...(money ? { total: orderTotal(o) } : {}),
    });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString(), full, money, mayTick, orders } satisfies WipResponse);
}
