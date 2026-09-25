import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { amountDueNow, hasUnpaidBalance, orderStatusLabel, withLog, type Order, type OrderStatus } from "@/lib/admin-data";
import { isPickupOrder } from "@/lib/ship-label";
import { isShipMain, isShipRider, shipMainIdOf, shipRiderIdsOf } from "@/lib/ship-with";
import { updateOrder } from "@/lib/server/order-write";
import { notifyCustomerLogged, orderLink, statusFlex, statusMessage } from "@/lib/server/notify";

export const runtime = "nodejs";

/**
 * 🏪 ลูกค้าที่มารับเอง — เมนู /admin/pickup (กลุ่มงานขาย) + ตัวเลขป้ายข้างเมนู (เจ้าของร้านสั่ง 17 ก.ย. 69)
 *
 * รวมทุกใบที่วิธีส่งเป็น "มารับเอง" (isPickupOrder) ไว้ที่เดียว — ลูกค้าเดินมาหน้าร้านแล้วหาใบเจอทันที แบ่ง 3 กอง:
 *   ready   = แพ็คเสร็จ รอลูกค้ามารับ (สถานะ "จัดส่งแล้ว" ของใบมารับเอง) ← ป้ายเมนูนับกองนี้ = ของที่วางรออยู่หน้าร้าน
 *   working = โอนแล้ว กำลังทำอยู่ — ลูกค้ามาถามก็ตอบได้ว่าถึงขั้นไหน
 *   ⚠️ ใบที่ยังไม่โอน (รอชำระเงิน) ไม่เอาเข้าหน้านี้ — เจ้าของร้านสั่ง 17 ก.ย. 69: ยังไม่ใช่งานที่ร้านต้องเตรียมของให้ใครมารับ
 *
 * 📅 วันนัดรับ = Order.shipDate (ช่อง "วันที่จัดส่ง" ในหน้าออเดอร์ — ใบมารับเองช่องเดียวกันนี้คือวันที่ลูกค้าจะมารับ)
 *   หน้าเว็บโชว์เป็นบล็อกวันที่ตัวใหญ่และจัดกลุ่มตามวัน (เจ้าของร้านสั่ง "ให้วันที่มารับเด่น")
 *   done    = ลูกค้ารับไปแล้ว (เสร็จสิ้น · ดูย้อนหลัง)
 *
 * GET  → { n, rows }   (?count=1 = เอาแค่ n ไว้ให้ป้ายเมนู)
 * POST { id } → กด "ลูกค้ารับของแล้ว" — จดคน/เวลา + ปิดงานเป็นเสร็จสิ้น ฝั่งเซิร์ฟเวอร์ (ไม่ต้องส่งออเดอร์ทั้งก้อน กันทับงานคนอื่น)
 *   ⚠️ ใบที่ยังค้างยอด (มัดจำงวดหลัง/ส่วนต่าง) ส่งมอบไม่ได้ — ต้องเก็บเงินให้ครบในหน้าออเดอร์ก่อน
 *   🏪📦 ชุดรับพร้อมกัน (lib/ship-with.ts · มารับเองทั้งคู่แพ็ครวม): กดที่ใบหลักใบเดียว = ปิดใบตามให้ด้วย · กดที่ใบตาม = 409 ชี้ไปใบหลัก
 */

export type PickupRow = {
  id: string;
  customer: string;
  phone?: string;
  status: OrderStatus;
  /** ป้ายสถานะแบบที่คนอ่าน ("แพ็คเสร็จ รอมารับ" / "ชำระแล้ว 50% แรก" …) */
  label: string;
  group: "ready" | "working" | "done";
  /** ยอดที่ต้องเก็บก่อนส่งมอบ (0 = จ่ายครบแล้ว) */
  due: number;
  rush?: boolean;
  /** วันนัดรับ (YYYY-MM-DD) จาก shipDate.from · pickupTo มีเมื่อนัดเป็นช่วงวัน */
  pickupDate?: string;
  pickupTo?: string;
  useByDate?: string;
  items: string[];
  note?: string;
  date: string;
  packedAt?: string;
  packedBy?: string;
  /** 🏪 แบ่งส่ง: รอบที่แพ็คเสร็จให้มารับไปก่อนแล้ว (ใบยังไม่ปิด ที่เหลือกำลังทำ) — "N รอบ · X ชิ้น" */
  partialRounds?: string;
  pickedUpAt?: string;
  pickedUpBy?: string;
  /** 🏪📦 ชุดรับพร้อมกัน: ใบหลักบอกใบที่รวมมา · ใบตามบอกใบหลัก (ปุ่มรับของกดที่ใบหลัก) */
  shipWith?: { role: "main" | "rider"; ids: string[] };
};

/** กองรับไปแล้วเก็บไว้ดูย้อนหลังเท่านี้พอ — หน้านี้ไว้ทำงานหน้าร้าน ไม่ใช่รายงาน */
const DONE_KEEP = 40;

function groupOf(o: Order): PickupRow["group"] | null {
  if (o.status === "ยกเลิก" || o.status === "รอชำระเงิน" || !isPickupOrder(o)) return null;
  if (o.status === "เสร็จสิ้น") return "done";
  return o.status === "จัดส่งแล้ว" ? "ready" : "working";
}

function toRow(o: Order, group: PickupRow["group"]): PickupRow {
  const unpaidStage = o.status === "รอตรวจสอบ";
  const from = o.shipDate?.from || o.shipDate?.to;
  const to = o.shipDate?.to && o.shipDate.to !== from ? o.shipDate.to : undefined;
  return {
    id: o.id,
    customer: o.customer,
    // เบอร์ขยะ ("0", "-") ไม่ส่งไป — หน้าเว็บทำเป็นปุ่มโทร กดแล้วต้องโทรได้จริง
    ...((o.phone ?? "").replace(/\D/g, "").length >= 8 ? { phone: o.phone!.trim() } : {}),
    status: o.status,
    label: orderStatusLabel(o),
    group,
    due: group !== "done" && (unpaidStage || hasUnpaidBalance(o)) ? amountDueNow(o) : 0,
    ...(o.rush ? { rush: true } : {}),
    ...(from ? { pickupDate: from } : {}),
    ...(to ? { pickupTo: to } : {}),
    ...(o.useByDate ? { useByDate: o.useByDate } : {}),
    items: o.items.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`),
    ...(o.note?.trim() ? { note: o.note.trim() } : {}),
    date: o.date,
    ...(o.packedAt ? { packedAt: o.packedAt.at, packedBy: o.packedAt.by } : {}),
    ...(!o.packedAt && (o.shipments?.length ?? 0) > 0
      ? { partialRounds: `${o.shipments!.length} รอบ · ${o.shipments!.reduce((n, s) => n + s.proofs.reduce((m, p) => m + (p.qty ?? 0), 0), 0).toLocaleString("th-TH")} ชิ้น` }
      : {}),
    ...(o.pickedUp ? { pickedUpAt: o.pickedUp.at, pickedUpBy: o.pickedUp.by } : {}),
    ...(isShipMain(o) ? { shipWith: { role: "main" as const, ids: shipRiderIdsOf(o) } } : isShipRider(o) ? { shipWith: { role: "rider" as const, ids: [shipMainIdOf(o)] } } : {}),
  };
}

const VIEW_PERMS = ["orders.view", "pack.check", "pack.ship"] as const;

export async function GET(req: Request) {
  const gate = await requirePerm([...VIEW_PERMS]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ n: 0, rows: [], ok: false, reason: "ยังไม่ได้ตั้งค่า Supabase" });

  // ให้ Postgres คัดหยาบจากป้ายวิธีส่งก่อน (ส่วนน้อยของตาราง) แล้วค่อยตัดสินจริงด้วย isPickupOrder — ป้ายเมนูถามทุก 90 วิ
  const { data, error } = await sb
    .from("orders")
    .select("data")
    .or("data->>shippingLabel.ilike.*รับ*,data->>shipping.ilike.*รับ*,data->>shippingLabel.ilike.*pick*,data->>shipping.ilike.*pick*")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) {
    console.error("[orders/pickup] ถามฐานไม่สำเร็จ:", error.message);
    return NextResponse.json({ n: 0, rows: [], ok: false, reason: error.message });
  }

  const rows: PickupRow[] = [];
  let done = 0;
  for (const r of data ?? []) {
    const o = r.data as Order;
    const g = groupOf(o);
    if (!g || (g === "done" && ++done > DONE_KEEP)) continue;
    rows.push(toRow(o, g));
  }
  const n = rows.filter((r) => r.group === "ready").length;
  if (new URL(req.url).searchParams.get("count") === "1") return NextResponse.json({ n, ok: true });
  return NextResponse.json({ n, rows, ok: true });
}

export async function POST(req: Request) {
  // คนส่งมอบของหน้าร้าน = แอดมิน หรือฝ่ายแพ็ค (สิทธิ์เดียวกับปุ่ม "แพ็คเสร็จ")
  const gate = await requirePerm(["orders.edit", "pack.ship"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  const o = data?.data as Order | undefined;
  if (!o || !isPickupOrder(o)) return NextResponse.json({ error: "ใบนี้ไม่ใช่ออเดอร์มารับเอง" }, { status: 404 });
  if (o.status === "เสร็จสิ้น") return NextResponse.json({ ok: true, row: toRow(o, "done") });
  // 🏪📦 ใบตามของชุดรับพร้อมกัน: ของอยู่รวมกับใบหลัก — กดรับที่ใบหลักใบเดียว (ปิดให้ทั้งชุด) กันครึ่ง ๆ กลาง ๆ
  if (isShipRider(o))
    return NextResponse.json({ error: `ใบนี้แพ็ครวมกับ ${shipMainIdOf(o)} ให้รับพร้อมกัน — กด “ลูกค้ารับของแล้ว” ที่ใบ ${shipMainIdOf(o)} ใบเดียว ใบนี้จะปิดให้เอง` }, { status: 409 });
  if (o.status !== "จัดส่งแล้ว") return NextResponse.json({ error: "ใบนี้ยังแพ็คไม่เสร็จ — ให้ฝ่ายแพ็คกด “แพ็คเสร็จ” ในหน้าออเดอร์ก่อน" }, { status: 409 });
  if (hasUnpaidBalance(o))
    return NextResponse.json(
      { error: `ใบนี้ยังค้าง ฿${amountDueNow(o).toLocaleString("th-TH")} — เก็บเงินให้ครบในหน้าออเดอร์ก่อน แล้วค่อยส่งมอบ` },
      { status: 409 }
    );

  // 🏪📦 ใบหลักของชุดรับพร้อมกัน: ใบตามต้องพร้อมส่งมอบทุกใบ (แพ็คเสร็จ + ไม่ค้างยอด) ก่อน — ของทั้งชุดออกจากร้านพร้อมกัน
  let riders: Order[] = [];
  if (isShipMain(o)) {
    const { data: rr } = await sb.from("orders").select("data").in("id", shipRiderIdsOf(o));
    riders = (rr ?? []).map((r) => r.data as Order).filter((r) => isShipRider(r) && shipMainIdOf(r) === o.id && r.status !== "เสร็จสิ้น" && r.status !== "ยกเลิก");
    const notPacked = riders.filter((r) => r.status !== "จัดส่งแล้ว");
    if (notPacked.length)
      return NextResponse.json({ error: `ใบที่รับพร้อมกัน ${notPacked.map((r) => r.id).join(", ")} ยังแพ็คไม่เสร็จ — กด “แพ็คเสร็จ” ที่ใบนี้ให้ครบทั้งชุดก่อน` }, { status: 409 });
    const owe = riders.filter((r) => hasUnpaidBalance(r));
    if (owe.length)
      return NextResponse.json(
        { error: `ใบที่รับพร้อมกัน ${owe.map((r) => `${r.id} ค้าง ฿${amountDueNow(r).toLocaleString("th-TH")}`).join(" · ")} — เก็บเงินให้ครบในหน้าออเดอร์นั้นก่อน แล้วค่อยส่งมอบทั้งชุด` },
        { status: 409 }
      );
  }

  const by = gate.actor.name?.trim() || gate.actor.username;
  const at = new Date().toISOString();
  const next = withLog(
    { ...o, status: "เสร็จสิ้น" as OrderStatus, pickedUp: { at, by } },
    by,
    "🏪 ลูกค้ามารับของแล้ว — ปิดงาน",
    riders.length ? `รับพร้อมกับ ${riders.map((r) => r.id).join(", ")} — ปิดให้ทั้งชุด` : undefined
  );
  const { order: saved, error } = await updateOrder(sb, next, { prev: o, by });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // แจ้งลูกค้าแบบเดียวกับเปลี่ยนสถานะในหน้าออเดอร์ ("เสร็จสิ้น" = ข่าวคืบหน้า ไม่ใช่เรื่องสำคัญ)
  // ⏳ รอให้ส่งเสร็จก่อนตอบ — Netlify แช่เครื่องทันทีที่ตอบ งานเบื้องหลังหายเงียบ
  const origin = new URL(req.url).origin;
  const link = orderLink(origin, saved);
  if (statusMessage(saved, link)) await notifyCustomerLogged(sb, saved, statusFlex(saved, link), `แจ้งสถานะ "${saved.status}"`, "extra");

  // ใบตามปิดตามใบหลัก — ใบหลักพลาดไปแล้วข้างบน = ยังไม่แตะใบตาม (สถานะทั้งชุดไม่ครึ่ง ๆ กลาง ๆ)
  for (const r of riders) {
    const nr = withLog({ ...r, status: "เสร็จสิ้น" as OrderStatus, pickedUp: { at, by } }, by, `🏪 ลูกค้ามารับของแล้ว — ปิดงาน (รับพร้อมกับ ${o.id})`);
    const wr = await updateOrder(sb, nr, { prev: r, by });
    if (wr.error) {
      console.error(`[orders/pickup] ปิดใบรับพร้อมกัน ${r.id} ไม่สำเร็จ:`, wr.error.message);
      continue;
    }
    // ใบตามผูก LINE คนละคนกับใบหลัก → แจ้งแยก (คนเดียวกันได้การ์ดจากใบหลักแล้ว)
    if (r.lineUserId && r.lineUserId !== saved.lineUserId) {
      const rl = orderLink(origin, wr.order);
      if (statusMessage(wr.order, rl)) await notifyCustomerLogged(sb, wr.order, statusFlex(wr.order, rl), `แจ้งสถานะ "${wr.order.status}" (รับพร้อมกับ ${o.id})`, "extra");
    }
  }

  return NextResponse.json({ ok: true, row: toRow(saved, "done"), closed: riders.map((r) => r.id) });
}
