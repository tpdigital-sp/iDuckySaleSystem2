import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Rating } from "@/lib/ratings";

export const runtime = "nodejs";

const tableMissing = (msg = "", code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

/** สรุปผลประเมินให้แอดมิน — คะแนนเฉลี่ย/การกระจาย/แท็ก/คอมเมนต์ (ข้อมูลนิรนามอยู่แล้ว)
 *  ส่ง id (uuid สุ่ม) มาด้วยเพื่อให้หน้าจอนับ "รายการใหม่ที่ยังไม่ได้เปิดดู" — id ไม่โยงถึงลูกค้า
 *  สิทธิ์ orders.viewAll = แอดมิน/ออฟฟิศ (ฝ่ายแพ็คไม่เห็นผลประเมิน) */
export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ratings: [] });
  const gate = await requirePerm("orders.viewAll");
  if (gate.res) return gate.res;

  // เรียงตามเดือนล่าสุด (ไม่มี timestamp ละเอียดโดยเจตนา — นิรนาม)
  const { data, error } = await sb.from("ratings").select("id,data").order("month", { ascending: false }).limit(500);
  if (error) {
    if (tableMissing(error.message, error.code)) return NextResponse.json({ ratings: [], needsSetup: true });
    return NextResponse.json({ error: error.message, ratings: [] }, { status: 500 });
  }
  return NextResponse.json({ ratings: (data ?? []).map((r) => ({ id: r.id as string, ...(r.data as Rating) })) });
}
