import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderStatusLabel, withLog, type Order } from "@/lib/admin-data";
import { isPickupOrder, stripShipPrice } from "@/lib/ship-label";
import { alreadyShipped, buildShipLink, cannotBeMain, cannotBeRider, isShipMain, isShipRider, partialShipNote, pickShipRoles, riderNotReady, shipMainIdOf, shipRiderIdsOf, type ShipWithRow } from "@/lib/ship-with";
import { updateOrder } from "@/lib/server/order-write";
import { notifyCustomerLogged, orderLink, orderNotice } from "@/lib/server/notify";

export const runtime = "nodejs";

/**
 * 📦 ส่งรวมกล่องกับออเดอร์อื่น (บิลแยก ส่งกล่องเดียว) — กติกาทั้งหมดอยู่ที่ lib/ship-with.ts
 *
 * GET  ?id=OD-…            → { linked: ShipWithRow[], candidates: ShipWithRow[] }
 *        linked     = ใบที่ผูกกับใบนี้อยู่ (ใบหลักเห็นใบตามทุกใบพร้อมสถานะ "ของพร้อมลงกล่องหรือยัง" · ใบตามเห็นใบหลัก)
 *        candidates = ใบอื่นของลูกค้าคนเดียวกันที่ยังไม่ปิด (จับจาก contactId/customerId/LINE/เบอร์/ชื่อ) · &q= ค้นเลขออเดอร์เพิ่มได้
 *                     แต่ละใบมี blocked = เหตุผลที่ผูกไม่ได้ ("" = ผูกได้เลย) · ใบที่ผูกได้เรียงขึ้นก่อน
 * POST { mainId, riderId } → ผูก: เขียนสองใบ · ใบตามเปลี่ยนวิธีส่งตามใบหลัก (ค่าส่งไม่แตะ) · แจ้งลูกค้าทางไลน์
 *        🏪 มารับเองทั้งคู่ = "ชุดรับพร้อมกัน" (pickShipRoles เลือกใบหลักให้) — ข้อความไลน์ไม่พูดเรื่องกล่อง/เลขพัสดุ
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
    // 🚚 ใบที่แบ่งส่งไปแล้วบางรอบ — บอกให้รู้ว่ากล่องรวมนี้ใส่เฉพาะที่เหลือ (25 ก.ย. 69)
    ...(partialShipNote(o) ? { partial: partialShipNote(o) } : {}),
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
  const qAsk = q ? asks.length : -1; // ตำแหน่งของชุดที่มาจากช่องค้นเลขออเดอร์ (ต่อท้ายเสมอ)
  if (q) asks.push(sb.from("orders").select("data").ilike("id", `%${q.replace(/[%_]/g, "")}%`).order("created_at", { ascending: false }).limit(10));
  const seen = new Set<string>([me.id, ...linkedIds]);
  const candidates: ShipWithRow[] = [];
  for (const [i, res] of (await Promise.all(asks)).entries()) {
    const typed = i === qAsk; // แอดมินพิมพ์เลขใบนี้มาเอง
    for (const r of res.data ?? []) {
      const o = r.data as Order;
      if (!o?.id || seen.has(o.id)) continue;
      if (o.status === "ยกเลิก" || o.status === "เสร็จสิ้น") continue;
      /**
       * 📦 ใบที่ของออกจากร้านไปแล้ว ไม่ต้องโผล่ในรายการอัตโนมัติ — เดิมโชว์พร้อมเหตุผล "✗ ยิงเลขพัสดุไปแล้ว"
       * แต่หน้างานอ่านแล้วสับสน (เจ้าของร้านแจ้ง 23 ก.ย. 69) รายการนี้ควรมีแต่ใบที่กดผูกได้จริง
       * ยกเว้นคนพิมพ์เลขใบนั้นมาเอง — ตอบว่าทำไมรวมไม่ได้ ดีกว่าเงียบแล้วขึ้น "ไม่เจอออเดอร์"
       */
      if (!typed && alreadyShipped(o)) continue;
      seen.add(o.id); // นับเฉพาะใบที่เข้ารายการ — ใบที่คัดออกยังให้ชุดค้นเลขหยิบมาตอบได้
      candidates.push(toRow(o, { blocked: pairBlocked(me, o) }));
    }
  }
  // ใบที่ผูกได้เลยขึ้นก่อน — หน้าออเดอร์เอาชุดนี้ไปโชว์คาไว้ที่ช่องเลขพัสดุ ไม่ต้องเปิดหน้าต่างก่อนถึงจะรู้ว่ามีใบให้รวมไหม
  candidates.sort((a, b) => (a.blocked ? 1 : 0) - (b.blocked ? 1 : 0) || (b.date || "").localeCompare(a.date || ""));
  return NextResponse.json({ ok: true, linked, candidates });
}

/**
 * คู่นี้ผูกส่งรวมไม่ได้เพราะอะไร ("" = ผูกได้) — ด่านเดียวกับตอน POST แต่ตอบล่วงหน้าให้ปุ่มบนจอ
 * เหตุผลเขียนจากมุมของ "ใบที่อยู่ในรายการ" — ถ้าติดที่ใบที่เปิดอยู่ บอกว่าเป็นใบที่เปิดอยู่
 */
function pairBlocked(me: Order, other: Order): string {
  const { main, rider } = pickShipRoles(me, other);
  const whyMain = cannotBeMain(main);
  const why = whyMain || cannotBeRider(rider);
  if (!why) return "";
  const culprit = whyMain ? main : rider;
  const text = why.replace(/^ใบนี้/, "").trim();
  return culprit.id === other.id ? text : `ใบที่เปิดอยู่${text}`;
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
  // ใบหลัก/ใบตามตัดสินที่ lib/ship-with.ts (ใบส่ง ปณ. นำ · มารับเองทั้งคู่ = ใบที่ยังไม่แพ็คนำ)
  const { main, rider } = pickShipRoles(a, b);
  const whyMain = cannotBeMain(main);
  if (whyMain) return NextResponse.json({ error: `${main.id} เป็นใบหลักไม่ได้ — ${whyMain}` }, { status: 409 });
  const whyRider = cannotBeRider(rider);
  if (whyRider) return NextResponse.json({ error: `${rider.id} ส่งรวมไม่ได้ — ${whyRider}` }, { status: 409 });

  const by = gate.actor.name?.trim() || gate.actor.username;
  const at = new Date().toISOString();
  const wasPickup = isPickupOrder(rider);
  const wasPackedForPickup = wasPickup && !!rider.packedAt;
  // 🏪 ชุดรับพร้อมกัน: ใบตามยังมารับเองเหมือนเดิม — แค่บอกว่ารับพร้อมอีกใบ ไม่ใช่ "เปลี่ยนจากมารับเอง"
  const pickupSet = isPickupOrder(main);
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
    pickupSet
      ? orderNotice(r1.order, link, {
          tone: "shipTogether",
          head: "รับพร้อมกันที่ร้าน",
          headline: `ออเดอร์นี้ทางร้านแพ็ครวมกับออเดอร์ ${main.id} ให้มารับพร้อมกันทีเดียวครับ`,
          rows: [{ label: "รับพร้อมกับ", value: main.id, bold: true }],
          note: "แพ็คเสร็จเมื่อไหร่ทางร้านแจ้งให้มารับอีกครั้งครับ",
          alt: `🏪 ออเดอร์ ${rider.id} ทางร้านแพ็ครวมกับออเดอร์ ${main.id} ให้มารับพร้อมกันทีเดียวครับ\nแพ็คเสร็จเมื่อไหร่ทางร้านแจ้งให้มารับอีกครั้งครับ\n${link}`,
        })
      : orderNotice(r1.order, link, {
          tone: "shipTogether",
          head: "ส่งรวมกล่องเดียวกัน",
          headline: `ออเดอร์นี้จะจัดส่งรวมกล่องเดียวกับออเดอร์ ${main.id} ครับ`,
          rows: [{ label: "ส่งรวมกับ", value: main.id, bold: true }],
          note: `${wasPickup ? "เปลี่ยนจากมารับเอง — ไม่ต้องมารับที่ร้านแล้วครับ\n" : ""}จัดส่งเมื่อไหร่ทางร้านแจ้งเลขพัสดุอีกครั้งครับ`,
          alt: `📦 ออเดอร์ ${rider.id} จะจัดส่งรวมกล่องเดียวกับออเดอร์ ${main.id} ครับ${wasPickup ? " (เปลี่ยนจากมารับเอง — ไม่ต้องมารับที่ร้านแล้ว)" : ""}\nจัดส่งเมื่อไหร่ทางร้านแจ้งเลขพัสดุอีกครั้งครับ\n${link}`,
        }),
    pickupSet ? `แจ้งรับพร้อมกับ ${main.id}` : `แจ้งส่งรวมกล่องกับ ${main.id}`,
    // ใบที่เคยบอก "มารับได้เลย" แล้วกลายเป็นส่งไปรษณีย์ = เรื่องสำคัญ · ชุดรับพร้อมกันยังมารับเหมือนเดิม = ข่าวคืบหน้า
    wasPackedForPickup && !pickupSet ? "key" : "extra"
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
  // 🏪 ชุดรับพร้อมกัน (ใบหลักก็มารับเอง): ใบนี้แค่แยกรับต่างหาก — ไม่ใช่ "กลับเป็นมารับเอง"
  const wasPickupSet = !!main && isPickupOrder(main) && isPickupOrder(rider);
  const link = orderLink(new URL(req.url).origin, r1.order);
  await notifyCustomerLogged(
    sb,
    r1.order,
    wasPickupSet
      ? orderNotice(r1.order, link, {
          tone: "shipApart",
          head: "แยกรับต่างหาก",
          headline: `ออเดอร์นี้ไม่ได้รวมรับกับออเดอร์ ${mainId} แล้วครับ — แยกรับต่างหากตามใบนี้`,
          rows: [{ label: "วิธีรับ", value: r1.order.shippingLabel || r1.order.shipping || "มารับเองที่ร้าน", bold: true }],
          alt: `🏪 ออเดอร์ ${rider.id} ไม่ได้รวมรับกับออเดอร์ ${mainId} แล้วครับ — แยกรับต่างหากตามใบนี้\n${link}`,
        })
      : orderNotice(r1.order, link, {
          tone: "shipApart",
          head: "ยกเลิกส่งรวมกล่อง",
          headline: `ยกเลิกการส่งรวมกับออเดอร์ ${mainId} แล้วครับ`,
          rows: [{ label: "วิธีส่ง", value: r1.order.shippingLabel || r1.order.shipping || "—", bold: true }],
          ...(isPickupOrder(r1.order) ? { note: "กลับเป็นมารับเองที่ร้านครับ" } : {}),
          alt: `📦 ออเดอร์ ${rider.id} ยกเลิกการส่งรวมกับออเดอร์ ${mainId} แล้วครับ${isPickupOrder(r1.order) ? " — กลับเป็นมารับเองที่ร้าน" : ""}\n${link}`,
        }),
    wasPickupSet ? `แจ้งแยกรับจาก ${mainId}` : `แจ้งยกเลิกส่งรวมกล่องกับ ${mainId}`,
    !wasPickupSet && isPickupOrder(r1.order) && r1.order.packedAt ? "key" : "extra"
  );

  return NextResponse.json({ ok: true, main: savedMain, rider: r1.order });
}
