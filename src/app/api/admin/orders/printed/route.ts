import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderFullyPaid, withLog, type Order, type OrderStatus } from "@/lib/admin-data";
import { notifyCustomerLogged, orderLink, statusFlex } from "@/lib/server/notify";

export const runtime = "nodejs";

/** ชื่อเอกสารที่หน้าปริ้นส่งมา */
const DOC_LABEL: Record<string, string> = {
  work: "ใบงาน + ใบปะหน้า",
  box: "ใบแปะหน้ากล่อง",
  receipt: "ใบเสร็จ",
};

/**
 * สถานะที่ยัง "ไม่ถึงขั้นผลิต" — ปริ้นใบงาน/ใบปะหน้าเมื่อไหร่ = ของเข้าไลน์ผลิตแล้ว
 * เลยเลื่อนให้เป็น "กำลังผลิต" อัตโนมัติ (ผ่านขั้นนี้ไปแล้วไม่ย้อนกลับ)
 */
const BEFORE_PRODUCTION: OrderStatus[] = [
  "รอชำระเงิน",
  "รอตรวจสอบ",
  "ชำระแล้ว",
  "รอตรวจแบบ",
  "แก้ไขแบบ",
  "อนุมัติแบบ",
];

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

  /**
   * ปริ้น "ใบงาน + ใบปะหน้า" (ใบที่มีที่อยู่จัดส่ง) = งานเข้าไลน์ผลิตแล้ว → เลื่อนเป็นกำลังผลิต
   * ใบปะหน้าออกได้เฉพาะตอนเก็บเงินครบ จึงเช็คซ้ำอีกชั้นกันเลื่อนสถานะทั้งที่ที่อยู่ยังไม่ออก
   */
  const startsProduction =
    (body.docs ?? []).includes("work") && orderFullyPaid(order) && BEFORE_PRODUCTION.includes(order.status);

  let updated = withLog(
    {
      ...order,
      // printedAt ตั้งครั้งเดียวตอนแรก — เป็นตัวล็อกที่อยู่ ห้ามขยับตามการปริ้นซ้ำ
      printedAt: order.printedAt ?? now,
      printCount: count,
      lastPrintedAt: now,
      ...(startsProduction ? { status: "กำลังผลิต" as OrderStatus } : {}),
    },
    gate.actor.name || gate.actor.username,
    first ? "🖨 ปริ้นเอกสาร — ล็อกที่อยู่จัดส่ง" : `🖨 ปริ้นซ้ำ (ครั้งที่ ${count})`,
    what
  );
  if (startsProduction)
    updated = withLog(
      updated,
      gate.actor.name || gate.actor.username,
      "เริ่มผลิตอัตโนมัติ — ปริ้นใบงาน/ใบปะหน้าแล้ว",
      `${order.status} → กำลังผลิต`
    );

  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /**
   * สถานะเปลี่ยนตรงนี้ก็ต้องแจ้งลูกค้าเหมือนแอดมินกดเปลี่ยนเอง
   * (ไม่งั้นใบที่เข้าผลิตด้วยการปริ้น ลูกค้าจะไม่ได้ข่าวเลย)
   * "กำลังผลิต" = ข่าวคืบหน้า → importance "extra" ตามกติกาเดิม (คนที่เลือกรับเฉพาะเรื่องสำคัญจะไม่โดน)
   */
  if (startsProduction) {
    const link = orderLink(new URL(req.url).origin, updated);
    await notifyCustomerLogged(sb, updated, statusFlex(updated, link), 'แจ้งสถานะ "กำลังผลิต" (ปริ้นใบงาน)', "extra");
  }

  return NextResponse.json({ ok: true, printCount: count, reprint: !first });
}
