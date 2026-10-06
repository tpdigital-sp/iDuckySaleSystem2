import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isMissingTable, syncFromFlowAccount } from "@/lib/server/wht-db";
import { flowAccountApiReady } from "@/lib/server/flowaccount-api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 🔄 ปุ่ม "ดึงตอนนี้" — ดึงใบกำกับภาษีจาก FlowAccount Open API ทันที (ปกติ cron wht-sync ดึงเองทุก 5 นาที)
 * { month: "YYYY-MM" } = เดือนนั้น · ไม่ส่ง = เดือนนี้ + เดือนก่อน
 * ได้หัก ณ ที่จ่ายจริงจากการรับชำระ → ตั้งหัก/ไม่หักให้เอง · ไม่ทับที่พนักงานทำ (ได้รับใบหัก/หักย้อนหลัง/ประวัติทวง)
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  if (!(await flowAccountApiReady())) return NextResponse.json({ error: "ยังไม่ได้ใส่รหัส FlowAccount (FLOWACCOUNT_CLIENT_ID / SECRET)" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { month?: string } | null;
  const month = body?.month;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "เดือนไม่ถูกต้อง (YYYY-MM)" }, { status: 400 });
  try {
    const r = await syncFromFlowAccount(sb, gate.actor.name || gate.actor.username, month);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    if (isMissingTable({ code: err.code, message: err.message ?? "" }))
      return NextResponse.json({ error: "ยังไม่ได้สร้างตาราง wht_certs — รันไฟล์ supabase/wht-certs.sql ก่อน" }, { status: 503 });
    return NextResponse.json({ error: err.message ?? "ดึงจาก FlowAccount ไม่สำเร็จ" }, { status: 502 });
  }
}
