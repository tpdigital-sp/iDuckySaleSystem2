import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderStatusLabel, withLog, type Order } from "@/lib/admin-data";
import { isPickupOrder, stripShipPrice } from "@/lib/ship-label";
import { buildShipLink, cannotBeMain, cannotBeRider, isShipMain, isShipRider, riderNotReady, shipMainIdOf, shipRiderIdsOf, type ShipWithRow } from "@/lib/ship-with";
import { updateOrder } from "@/lib/server/order-write";
import { notifyCustomerLogged, orderLink, orderNotice } from "@/lib/server/notify";

export const runtime = "nodejs";

/**
 * 📦 ส่งรวมกล่องกับออเดอร์อื่น (บิลแยก ส่งกล่องเดียว) — กติกาทั้งหมดอยู่ที่ lib/ship-with.ts
 *
 * GET  ?id=OD-…            → { linked: ShipWithRow[], candidates: ShipWithRow[] }
 *        linked     = ใบที่ผูกกับใบนี้อยู่ (ใบหลักเห็นใบตามทุกใบพร้อมสถานะ "ของพร้อมลงกล่องหรือยัง" · ใบตามเห็นใบหลัก)
 *        candidates = ใบอื่นของลูกค้าคนเดียวกันที่ยังไม่ปิด (จับจาก contactId/customerId/LINE/เบอร์/ชื่อ) · &q= ค้นเลขออเดอร์เพิ่มได้
 * POST { mainId, riderId } → ผูก: เขียนสองใบ · ใบตามเปลี่ยนวิธีส่งตามใบหลัก (ค่าส่งไม่แตะ) · แจ้งลูกค้าทางไลน์
 * DELETE { mainId, riderId } → ยกเลิกการผูก: ใบตามได้วิธีส่ง/ที่อยู่เดิมคืน
 *
 * ⚠️ เขียนสองใบ ไม่มี transaction — เขียนใบตามก่อน (ใบที่ข้อมูลเปลี่ยนเยอะ) พลาดตรงนั้น = ยังไม่มีอะไรเปลี่ยน
 *    ใบหลักพลาดทีหลัง → ถอยใบตามกลับ
 */

type SB = SupabaseClient;

const digits = (s?: string) => (s ?? "").replace(/\D/g, "");

function toRow(o: Order, extra?: Partial<ShipWithRow>): ShipWithRow {
  return {
    id: o.id,
    customer: o.customer,
    status: o.status,
    label: orderStatusLabel(o),
    shipLabel: stripShipPrice((o.shippingLabel ?? "").trim()) || o.shipping || "",
    shippingCost: o.shippingCost || 0,
    items: o.items.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`),
    date: o.date,
    ...extra,
  };
}

async function loadOrder(sb: SB, id: string): Promise<Order | null> {
  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  return (data?.data as Order | undefined) ?? null;
}

async function loadOrders(sb: SB, ids: string[]): Promise<Order[]> {
  if (!ids.length) return [];
  const { data } = await sb.from("orders").select("data").in("id", ids);
  return (data ?? []).map((r) => r.data as Order);
}

export async function GET(req: Request) {
  const gate = await requirePerm(["orders.view", "pack.check", "pack.ship"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ linked: [], candidates: [], ok: false });
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  const me = await loadOrder(sb, id);
  if (!me) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const linkedIds = isShipMain(me) ? shipRiderIdsOf(me) : isShipRider(me) ? [shipMainIdOf(me)] : [];
  const linked = (await loadOrders(sb, linkedIds)).map((o) => toRow(o, isShipMain(me) ? { notReady: riderNotReady(o) } : {}));
  // ป้ายบนจอแพ็ค/หน้าออเดอร์ขอแค่ใบที่ผูกอยู่ — ไม่ต้องค้นใบให้เลือก
  if (url.searchParams.get("linked") === "1") return NextResponse.json({ ok: true, linked, candidates: [] });

  // ใบอื่นของลูกค้าคนเดียวกัน — ถามทีละกุญแจ (ชื่อมีวงเล็บ/จุลภาคใส่ใน .or() ไม่ได้) แล้วรวมกัน
  const q = url.searchParams.get("q")?.trim();
  const phone = digits(me.phone).length >= 8 ? me.phone.trim() : "";
  const keys: [string, string | undefined][] = [
    ["data->>contactId", me.contactId],
    ["data->>customerId", me.customerId],
    ["data->>lineUserId", me.lineUserId],
    ["data->>phone", phone],
    ["data->>customer", me.customer?.trim()],
  ];
  const asks = keys
    .filter(([, v]) => !!v)
    .map(([k, v]) => sb.from("orders").select("data").eq(k, v!).order("created_at", { ascending: false }).limit(30));
  if (q) asks.push(sb.from("orders").select("data").ilike("id", `%${q.replace(/[%_]/g, "")}%`).order("created_at", { ascending: false }).limit(10));
  const seen = new Set<string>([me.id, ...linkedIds]);
  const candidates: ShipWithRow[] = [];
  for (const res of await Promise.all(asks)) {
    for (const r of res.data ?? []) {
      const o = r.data as Order;
      if (!o?.id || seen.has(o.id)) continue;
      seen.add(o.id);
      if (o.status === "ยกเลิก" || o.status === "เสร็จสิ้น") continue;
      candidates.push(toRow(o));
    }
  }
  return NextResponse.json({ ok: true, linked, candidates });
}

/** หาว่าใครเป็นใบหลัก/ใบตามจากคู่ที่ส่งมา — ใบมารับเองเป็นใบหลักไม่ได้ สลับให้เองเมื่อส่งมากลับด้าน */
function pickRoles(a: Order, b: Order): { main: Order; rider: Order } {
  if (isPickupOrder(a) && !isPickupOrder(b)) return { main: b, rider: a };
  return { main: a, rider: b };
}

export async function POST(req: Request) {
  const gate = await requirePerm(["orders.edit"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { mainId?: string; riderId?: string };
  const mainId = body.mainId?.trim();
  const riderId = body.riderId?.trim();
  if (!mainId || !riderId || mainId === riderId) return NextResponse.json({ error: "ต้องเลือกออเดอร์ 2 ใบที่ต่างกัน" }, { status: 400 });

  const [a, b] = await Promise.all([loadOrder(sb, mainId), loadOrder(sb, riderId)]);
  if (!a || !b) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  const { main, rider } = pickRoles(a, b);
  const whyMain = cannotBeMain(main);
  if (whyMain) return NextResponse.json({ error: `${main.id} เป็นใบหลักไม่ได้ — ${whyMain}` }, { status: 409 });
  const whyRider = cannotBeRider(rider);
  if (whyRider) return NextResponse.json({ error: `${rider.id} ส่งรวมไม่ได้ — ${whyRider}` }, { status: 409 });

  const by = gate.actor.name?.trim() || gate.actor.username;
  const at = new Date().toISOString();
  const wasPickup = isPickupOrder(rider);
  const wasPackedForPickup = wasPickup && !!rider.packedAt;
  const { nextMain, nextRider } = buildShipLink(main, rider, by, at);

  const r1 = await updateOrder(sb, nextRider, { prev: rider, by });
  if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 });
  const r2 = await updateOrder(sb, nextMain, { prev: main, by });
  if (r2.error) {
    await updateOrder(sb, withLog(rider, by, "ถอยการผูกส่งรวม", `บันทึกใบหลัก ${main.id} ไม่สำเร็จ`), { prev: r1.order, by });
    return NextResponse.json({ error: r2.error.message }, { status: 500 });
  }

  // แจ้งลูกค้า — ใบที่เคยบอกให้ "มารับที่ร้านได้เลย" ไปแล้วต้องรู้ว่าเปลี่ยนแผน (เรื่องสำคัญ) · นอกนั้นเป็นข่าวคืบหน้า
  // ⏳ รอให้ส่งเสร็จก่อนตอบ — Netlify แช่เครื่องทันทีที่ตอบ
  const link = orderLink(new URL(req.url).origin, r1.order);
  await notifyCustomerLogged(
    sb,
    r1.order,
    orderNotice(r1.order, link, {
      tone: "shipTogether",
      head: "ส่งรวมกล่องเดียวกัน",
      headline: `ออเดอร์นี้จะจัดส่งรวมกล่องเดียวกับออเดอร์ ${main.id} ครับ`,
      rows: [{ label: "ส่งรวมกับ", value: main.id, bold: true }],
      note: `${wasPickup ? "เปลี่ยนจากมารับเอง — ไม่ต้องมารับที่ร้านแล้วครับ\n" : ""}จัดส่งเมื่อไหร่ทางร้านแจ้งเลขพัสดุอีกครั้งครับ`,
      alt: `📦 ออเดอร์ ${rider.id} จะจัดส่งรวมกล่องเดียวกับออเดอร์ ${main.id} ครับ${wasPickup ? " (เปลี่ยนจากมารับเอง — ไม่ต้องมารับที่ร้านแล้ว)" : ""}\nจัดส่งเมื่อไหร่ทางร้านแจ้งเลขพัสดุอีกครั้งครับ\n${link}`,
    }),
    `แจ้งส่งรวมกล่องกับ ${main.id}`,
    wasPackedForPickup ? "key" : "extra"
  );

  return NextResponse.json({ ok: true, main: r2.order, rider: r1.order });
}

export async function DELETE(req: Request) {
  const gate = await requirePerm(["orders.edit"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { mainId?: string; riderId?: string };
  const riderId = body.riderId?.trim();
  if (!riderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  const rider = await loadOrder(sb, riderId);
  if (!rider || !isShipRider(rider)) return NextResponse.json({ error: "ใบนี้ไม่ได้ผูกส่งรวมอยู่" }, { status: 404 });
  if ((rider.tracking ?? "").trim()) return NextResponse.json({ error: "ส่งรวมกันไปแล้ว (มีเลขพัสดุ) — ยกเลิกการผูกไม่ได้" }, { status: 409 });
  const mainId = shipMainIdOf(rider);
  const main = await loadOrder(sb, mainId);

  const by = gate.actor.name?.trim() || gate.actor.username;
  const prev = rider.shipWith?.prev;
  const { shipWith: _drop, ...bare } = rider;
  void _drop;
  const nextRider = withLog(
    {
      ...(bare as Order),
      ...(prev ? { shipping: prev.shipping, shippingLabel: prev.shippingLabel } : {}),
      // คืนที่อยู่เฉพาะเมื่อยังเป็นค่าที่ระบบเติมให้ตอนผูก (แอดมินแก้เองทีหลัง = ไม่แตะ)
      ...(prev?.address !== undefined && main && rider.address === main.address ? { address: prev.address } : {}),
    },
    by,
    `ยกเลิกส่งรวมกล่องกับ ${mainId}`,
    prev ? `วิธีส่งกลับเป็น ${prev.shippingLabel || prev.shipping || "—"}` : undefined
  );
  const r1 = await updateOrder(sb, nextRider, { prev: rider, by });
  if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 });

  let savedMain: Order | null = null;
  if (main && isShipMain(main)) {
    const left = shipRiderIdsOf(main).filter((x) => x !== rider.id);
    const { shipWith: sw, ...mainBare } = main;
    const nextMain = withLog(left.length ? { ...main, shipWith: { ...sw!, orders: left } } : (mainBare as Order), by, `ยกเลิกส่งรวมกล่องของ ${rider.id}`);
    const r2 = await updateOrder(sb, nextMain, { prev: main, by });
    if (r2.error) return NextResponse.json({ error: `ปลดใบตามแล้ว แต่บันทึกใบหลักไม่สำเร็จ: ${r2.error.message}` }, { status: 500 });
    savedMain = r2.order;
  }

  // ใบกลับไปเป็น "มารับเอง" ที่แพ็คเสร็จแล้ว = ลูกค้าต้องรู้ว่ากลับมารับที่ร้าน
  const link = orderLink(new URL(req.url).origin, r1.order);
  await notifyCustomerLogged(
    sb,
    r1.order,
    orderNotice(r1.order, link, {
      tone: "shipApart",
      head: "ยกเลิกส่งรวมกล่อง",
      headline: `ยกเลิกการส่งรวมกับออเดอร์ ${mainId} แล้วครับ`,
      rows: [{ label: "วิธีส่ง", value: r1.order.shippingLabel || r1.order.shipping || "—", bold: true }],
      ...(isPickupOrder(r1.order) ? { note: "กลับเป็นมารับเองที่ร้านครับ" } : {}),
      alt: `📦 ออเดอร์ ${rider.id} ยกเลิกการส่งรวมกับออเดอร์ ${mainId} แล้วครับ${isPickupOrder(r1.order) ? " — กลับเป็นมารับเองที่ร้าน" : ""}\n${link}`,
    }),
    `แจ้งยกเลิกส่งรวมกล่องกับ ${mainId}`,
    isPickupOrder(r1.order) && r1.order.packedAt ? "key" : "extra"
  );

  return NextResponse.json({ ok: true, main: savedMain, rider: r1.order });
}
