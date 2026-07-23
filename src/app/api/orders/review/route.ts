import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { proofsOf, withLog, type Order, type OrderStatus } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ลูกค้าตรวจแบบงาน — อนุมัติ หรือ ขอแก้ไข (public แต่ต้องมี key ลับ)
 * POST { orderId, key, itemIndex, action: "approve" | "request", note? }
 *
 * approve → รายการนั้นเป็น "อนุมัติ" · ถ้าทุกรายการที่มีแบบอนุมัติครบ → ออเดอร์ = "อนุมัติแบบ"
 * request → รายการนั้นเป็น "ขอแก้ไข" + เก็บคอมเมนต์ · ออเดอร์ = "แก้ไขแบบ"
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { orderId?: string; key?: string; itemIndex?: number; action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").trim();
  const itemIndex = Number(body.itemIndex);
  const action = body.action;
  const note = (body.note ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!Number.isInteger(itemIndex) || itemIndex < 0) return NextResponse.json({ error: "ไม่ได้ระบุรายการสินค้า" }, { status: 400 });
  if (action !== "approve" && action !== "request")
    return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  if (action === "request" && !note)
    return NextResponse.json({ error: "กรุณาระบุสิ่งที่ต้องการให้แก้ไข" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (order.key && order.key !== (body.key ?? ""))
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });

  const item = order.items?.[itemIndex];
  if (!item) return NextResponse.json({ error: "ไม่พบรายการสินค้านี้" }, { status: 404 });
  if (!proofsOf(item).length) return NextResponse.json({ error: "รายการนี้ยังไม่มีแบบให้ตรวจ" }, { status: 409 });

  const items = order.items.map((it, i) =>
    i === itemIndex
      ? action === "approve"
        ? { ...it, proofStatus: "อนุมัติ" as const, proofNote: undefined }
        : { ...it, proofStatus: "ขอแก้ไข" as const, proofNote: note }
      : it
  );

  // ทุกรายการที่มีแบบ ถูกอนุมัติครบแล้วหรือยัง
  const withProof = items.filter((it) => proofsOf(it).length);
  const allApproved = withProof.length > 0 && withProof.every((it) => it.proofStatus === "อนุมัติ");
  const status: OrderStatus = action === "request" ? "แก้ไขแบบ" : allApproved ? "อนุมัติแบบ" : "รอตรวจแบบ";

  const updated = withLog(
    { ...order, items, status },
    "ลูกค้า",
    action === "approve" ? "อนุมัติแบบ" : "ขอแก้ไขแบบ",
    action === "approve" ? item.name : `${item.name} — ${note}`
  );

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  const { key: _secret, ...safe } = updated;
  void _secret;
  return NextResponse.json({ ok: true, order: safe });
}
