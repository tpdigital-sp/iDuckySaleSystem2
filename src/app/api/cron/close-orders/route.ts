import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ✅ ปิดงานอัตโนมัติ — ออเดอร์ที่ "จัดส่งแล้ว" นานเกินกำหนด → "เสร็จสิ้น"
 *
 * ทำไมต้องมี: ไม่มีใครมานั่งกดปิดงานทีละใบ ออเดอร์เลยค้างอยู่ที่ "จัดส่งแล้ว" ตลอดไป
 * ทำให้คิวงานดูรก และงานที่ผูกกับ "ปิดงานแล้ว" ไม่ทำงาน (เช่น ล้างรูปออเดอร์เก่า)
 *
 * นับอายุจาก "เวลาที่เปลี่ยนเป็นจัดส่งแล้ว" ในประวัติการทำงาน (ไม่มีก็ใช้ log ล่าสุด)
 * — ของถึงมือลูกค้าภายในไม่กี่วัน เลยรอให้พ้นช่วงที่ลูกค้าจะทักกลับก่อนค่อยปิด
 *
 * ?days=N → กำหนดจำนวนวันเอง (ค่าเริ่มต้น 3)
 * ?dry=1  → ดูว่าจะปิดใบไหนบ้าง โดยยังไม่ปิดจริง
 */
const DEFAULT_DAYS = 3;

/** เวลาที่ออเดอร์ถูกเปลี่ยนเป็น "จัดส่งแล้ว" ล่าสุด */
function shippedAt(order: Order): string | null {
  const log = order.log ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (/จัดส่งแล้ว/.test(e.detail ?? "") || /ยิงเลขพัสดุ|บันทึกเลขพัสดุ/.test(e.action)) return e.at;
  }
  return log.length ? log[log.length - 1].at : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const dry = url.searchParams.get("dry") === "1";
  const days = Math.max(1, Number(url.searchParams.get("days")) || DEFAULT_DAYS);
  const cutoff = Date.now() - days * 86_400_000;

  const { data, error } = await sb.from("orders").select("id,data");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const closed: { id: string; shipped: string | null }[] = [];
  for (const row of data ?? []) {
    const order = row.data as Order;
    if (order.status !== "จัดส่งแล้ว") continue;
    const at = shippedAt(order);
    // ไม่รู้ว่าส่งเมื่อไหร่ = ไม่แตะ (ปลอดภัยกว่าเดา)
    if (!at || new Date(at).getTime() > cutoff) continue;
    closed.push({ id: order.id, shipped: at });
    if (dry) continue;
    const updated = withLog(
      { ...order, status: "เสร็จสิ้น" as const },
      "ระบบ",
      "ปิดงานอัตโนมัติ",
      `จัดส่งแล้วเกิน ${days} วัน — จัดส่งแล้ว → เสร็จสิ้น`,
    );
    await sb.from("orders").update({ data: updated }).eq("id", order.id);
  }

  return NextResponse.json({ ok: true, dry, days, closed: closed.length, orders: closed.slice(0, 50) });
}
