import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ลูกค้าเลือกเองว่าอยากรับแจ้งเตือนทาง LINE แค่ไหน (จากหน้าออเดอร์ของตัวเอง)
 *   all = ทุกขั้นตอน · key = เฉพาะเรื่องสำคัญ · off = ไม่รับเลย
 * ยืนยันสิทธิ์ด้วย key ของออเดอร์ (เหมือนตอนแนบสลิป) — คนอื่นเปลี่ยนให้ไม่ได้
 */
const LEVELS = ["all", "key", "off"] as const;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { orderId?: string; key?: string; level?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  const level = LEVELS.find((l) => l === body.level);
  if (!orderId || !level) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (order.key && order.key !== (body.key ?? "")) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 403 });

  const label = level === "all" ? "ทุกขั้นตอน" : level === "key" ? "เฉพาะเรื่องสำคัญ" : "ไม่รับแจ้งเตือน";
  const next = withLog(
    { ...order, notifyLevel: level, notifyLevelAt: new Date().toISOString() },
    "ลูกค้า",
    "ตั้งค่าการแจ้งเตือน",
    label
  );
  const { error } = await sb.from("orders").update({ data: next }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, level });
}
