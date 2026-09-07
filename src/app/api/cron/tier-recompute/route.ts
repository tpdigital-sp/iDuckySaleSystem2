import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { recomputeAllTiers } from "@/lib/server/contact-points";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ⏰ คำนวณระดับสมาชิกใหม่ให้ทุกคนวันละครั้ง — จัดการ "แต้มหมดอายุตามเวลา → ลดระดับ"
 * ระดับคิดจากแต้มในช่วง 12 เดือนล่าสุด พอเวลาผ่านไปแต้มเก่าหลุดช่วง ระดับก็ลดเอง
 * ป้องกันคนนอกเรียกด้วย ?key= (CRON_SECRET)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || new URL(req.url).searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  return NextResponse.json(await recomputeAllTiers(sb));
}
