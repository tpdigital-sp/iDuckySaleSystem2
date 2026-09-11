import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, withLog, type Order, type OrderStatus } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ✏️ คำขอแก้ไขออเดอร์จากลูกค้า — เมนูแยก /admin/edit-requests + ตัวเลขป้ายข้างเมนู
 *
 * ลูกค้ากด "ขอแก้ไขออเดอร์นี้" จากหน้าออเดอร์ของตัวเอง (POST /api/orders/edit-request) → เก็บใน Order.editRequest
 * เดิมเห็นได้แค่ป้ายในลิสต์ + แบนเนอร์ในหน้าออเดอร์ ต้องไล่เปิดเอง — ที่นี่รวมทุกใบที่ยัง "ไม่ได้จัดการ" ไว้ที่เดียว
 *
 * GET  → { n, requests: [...] }  n = จำนวนที่ยังไม่ได้จัดการ (ป้ายเมนู)  ·  ?all=1 รวมที่จัดการแล้ว (ไว้ดูย้อนหลัง)
 * POST { id } → ปิดคำขอ (doneAt/doneBy) แบบเดียวกับปุ่ม "จัดการแล้ว" ในหน้าออเดอร์ — เขียนฝั่งเซิร์ฟเวอร์
 *              จะได้ไม่ต้องส่งออเดอร์ทั้งก้อนจากหน้ารายการ (กันทับงานคนอื่น ดู savedAt ใน orders/route.ts)
 *
 * ใบที่ยกเลิกไปแล้วไม่นับเป็นงานค้าง (แก้อะไรไม่ได้แล้ว) — ตรงกับเงื่อนไขป้ายในลิสต์ออเดอร์
 */

export type EditRequestRow = {
  id: string;
  customer: string;
  phone: string;
  status: OrderStatus;
  total: number;
  text: string;
  at: string;
  doneAt?: string;
  doneBy?: string;
};

const isOpen = (o: Order) => !!o.editRequest && !o.editRequest.doneAt && o.status !== "ยกเลิก";

function toRow(o: Order): EditRequestRow {
  const r = o.editRequest!;
  return {
    id: o.id,
    customer: o.customer,
    phone: o.phone,
    status: o.status,
    total: orderTotal(o),
    text: r.text,
    at: r.at,
    ...(r.doneAt ? { doneAt: r.doneAt } : {}),
    ...(r.doneBy ? { doneBy: r.doneBy } : {}),
  };
}

export async function GET(req: Request) {
  const gate = await requirePerm("orders.view");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ n: 0, requests: [], ok: false, reason: "ยังไม่ได้ตั้งค่า Supabase" });

  const all = new URL(req.url).searchParams.get("all") === "1";

  // ให้ Postgres กรองเฉพาะใบที่เคยมีคำขอ (ส่วนใหญ่ของตารางไม่มี) — ไม่ต้องลากออเดอร์ทั้งร้านมาทุก 90 วิ
  const { data, error } = await sb
    .from("orders")
    .select("data")
    .not("data->editRequest", "is", null)
    .order("created_at", { ascending: false })
    .limit(all ? 500 : 200);
  if (error) {
    console.error("[orders/edit-requests] ถามฐานไม่สำเร็จ:", error.message);
    return NextResponse.json({ n: 0, requests: [], ok: false, reason: error.message });
  }

  const orders = (data ?? []).map((r) => r.data as Order).filter((o) => o.editRequest?.text);
  const open = orders.filter(isOpen);
  const rows = (all ? orders : open).map(toRow);
  // ใหม่สุดตามเวลาที่ลูกค้าส่ง (ไม่ใช่วันสร้างออเดอร์)
  rows.sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));
  return NextResponse.json({ n: open.length, requests: rows, ok: true });
}

export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const id = (body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (!order.editRequest) return NextResponse.json({ error: "ใบนี้ไม่มีคำขอแก้ไข" }, { status: 409 });
  if (order.editRequest.doneAt) return NextResponse.json({ ok: true, request: toRow(order), already: true });

  const actor = gate.actor.name || gate.actor.username;
  const now = new Date().toISOString();
  const next = withLog(
    { ...order, editRequest: { ...order.editRequest, doneAt: now, doneBy: actor }, savedAt: now },
    actor,
    "ปิดคำขอแก้ไขของลูกค้า",
    order.editRequest.text
  );
  const { error: saveErr } = await sb.from("orders").update({ data: next }).eq("id", id);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, request: toRow(next) });
}
