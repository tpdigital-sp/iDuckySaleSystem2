import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/** ชื่อเอกสารที่หน้าปริ้นส่งมา */
const DOC_LABEL: Record<string, string> = {
  work: "ใบงาน + ใบปะหน้า",
  receipt: "ใบเสร็จ",
};

/**
 * 🖨 บันทึกว่า "ปริ้นแล้ว" — เรียกทุกครั้งที่กดพิมพ์ รวมปริ้นซ้ำ
 *
 * - ครั้งแรก: ตั้ง printedAt (ล็อกที่อยู่ฝั่งลูกค้า ไม่ให้แก้หลังใบปะหน้าออกไปแล้ว)
 * - ทุกครั้ง (รวมซ้ำ): +1 printCount · อัปเดต lastPrintedAt · ลงประวัติว่าใครปริ้น เอกสารอะไร ครั้งที่เท่าไร
 *   ปริ้นซ้ำต้องเห็นในประวัติเสมอ — ของออกสองรอบมักเริ่มจากตรงนี้
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("pack.ship");
  if (gate.res) return gate.res;

  let body: { orderId?: string; docs?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "ไม่พบออเดอร์" }, { status: 404 });

  const order = row.data as Order;
  const now = new Date().toISOString();
  const count = (order.printCount ?? (order.printedAt ? 1 : 0)) + 1;
  const first = count === 1;
  const what = (body.docs ?? []).map((d) => DOC_LABEL[d] ?? d).filter(Boolean).join(" + ") || "ใบงาน";

  const updated = withLog(
    {
      ...order,
      // printedAt ตั้งครั้งเดียวตอนแรก — เป็นตัวล็อกที่อยู่ ห้ามขยับตามการปริ้นซ้ำ
      printedAt: order.printedAt ?? now,
      printCount: count,
      lastPrintedAt: now,
    },
    gate.actor.name || gate.actor.username,
    first ? "🖨 ปริ้นเอกสาร — ล็อกที่อยู่จัดส่ง" : `🖨 ปริ้นซ้ำ (ครั้งที่ ${count})`,
    what
  );

  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, printCount: count, reprint: !first });
}
