import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { syncFromFlowAccount } from "@/lib/server/wht-db";
import { flowAccountApiReady } from "@/lib/server/flowaccount-api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ⏰ ดึงใบกำกับภาษีเดือนนี้ + เดือนก่อนจาก FlowAccount ทุก 5 นาที (netlify/functions/wht-sync.mjs)
 * FlowAccount ไม่มี webhook → หน้า /admin/wht ช้ากว่าแอป FlowAccount ไม่เกิน ~5 นาที · ใช้ ~2–4 คำขอ/รอบ (เพดาน 100/นาที)
 * ?key= (CRON_SECRET) กันคนนอก
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });
  if (!(await flowAccountApiReady())) return NextResponse.json({ skipped: "ยังไม่ได้ใส่รหัส FlowAccount" });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, ...(await syncFromFlowAccount(sb, "ระบบ (อัตโนมัติ)")) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
