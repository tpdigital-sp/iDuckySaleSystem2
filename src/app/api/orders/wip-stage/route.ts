import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { slowestActive, wipJobsForOrder } from "@/lib/server/wip-production";

export const runtime = "nodejs";

/**
 * 🏭 ขั้นผลิตปัจจุบันสำหรับหน้าออเดอร์ลูกค้า (เจ้าของร้าน 12 ต.ค. 69 "อยากให้แสดง [QC/แพ็ค] ที่หน้าออเดอร์ลูกค้าด้วย")
 * GET /api/orders/wip-stage?id=OD-…&key=… → { stage: "QC/แพ็ค" | null, done: boolean }
 *   - ต้องมี key ลับของออเดอร์ (กติกาเดียวกับ /api/orders/view)
 *   - ส่งกลับแค่ "ชื่อขั้น" ของงานที่ช้าที่สุด — ไม่ส่งชื่อพนักงาน/ชื่อโฟลเดอร์/แผนก/จำนวนงาน (เรื่องภายในร้าน)
 *   - เฉพาะใบที่อยู่ช่วงผลิต (อนุมัติแบบ · กำลังผลิต) · จับคู่แบบชัวร์เท่านั้น (exactOnly) ไม่เดาจากชื่อ
 */
const PRODUCTION = new Set(["อนุมัติแบบ", "กำลังผลิต"]);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = (u.searchParams.get("id") ?? "").trim();
  const key = u.searchParams.get("key") ?? "";
  if (!/^OD-\d{6}-\d{4}$/.test(id)) return NextResponse.json({ error: "เลขออเดอร์ไม่ถูกต้อง" }, { status: 400 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ stage: null, done: false });
  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  const order = (data as { data?: Order } | null)?.data;
  if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  if (order.key && order.key !== key) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });
  if (!PRODUCTION.has(order.status)) return NextResponse.json({ stage: null, done: false });
  try {
    const { jobs } = await wipJobsForOrder(id, order.productionSent?.folder, { exactOnly: true });
    const live = jobs.filter((j) => j.status !== "archived");
    if (!live.length) return NextResponse.json({ stage: null, done: false }, { headers: { "Cache-Control": "private, max-age=60" } });
    const slow = slowestActive(live);
    return NextResponse.json({ stage: slow ? slow.stage : null, done: !slow }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    console.warn("[wip-stage]", (e as Error).message);
    return NextResponse.json({ stage: null, done: false });
  }
}
