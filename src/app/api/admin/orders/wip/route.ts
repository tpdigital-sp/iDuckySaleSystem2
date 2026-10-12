import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { TP_LEADER_URL, wipJobsForOrder } from "@/lib/server/wip-production";

export const runtime = "nodejs";

/**
 * 🏭 GET /api/admin/orders/wip?id=OD-… → งานของออเดอร์นี้บนบอร์ดผลิต TP ทั้ง 4 แผนก (อ่านอย่างเดียว · กล่อง "สถานะผลิต" หน้าออเดอร์)
 *   { jobs: WipJob[], folders: ชื่อโฟลเดอร์ที่ใช้ค้น, tp: URL บอร์ด }
 */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.view");
  if (gate.res) return gate.res;
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!/^OD-\d{6}-\d{4}$/.test(id)) return NextResponse.json({ error: "เลขออเดอร์ไม่ถูกต้อง" }, { status: 400 });
  // โฟลเดอร์ที่แอดมินโยนเข้าคิวปริ้น (ถ้ามี) ช่วยให้จับคู่ชัวร์ขึ้น — ไม่มีออเดอร์ในฐานก็ยังค้นจากการ์ดกราฟฟิกได้
  let folder: string | undefined;
  try {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
    const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
    folder = ((data as { data?: Order } | null)?.data as Order | undefined)?.productionSent?.folder;
  } catch (e) {
    console.warn("[wip] order lookup:", (e as Error).message);
  }
  const r = await wipJobsForOrder(id, folder);
  return NextResponse.json({ ...r, tp: TP_LEADER_URL }, { headers: { "Cache-Control": "no-store" } });
}
