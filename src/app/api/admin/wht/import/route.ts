import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { importSalesRows, isMissingTable } from "@/lib/server/wht-db";
import { parseSalesReport } from "@/lib/server/wht-xlsx";

export const runtime = "nodejs";

/** 📥 นำเข้าไฟล์ "รายงานยอดขาย" (.xlsx) จาก FlowAccount — นำเข้าซ้ำได้ ไม่ทับสิ่งที่พนักงานทำไว้ */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 4MB — ส่งออกทีละเดือน" }, { status: 400 });
  try {
    const rows = parseSalesReport(Buffer.from(await file.arrayBuffer()));
    if (!rows.length) return NextResponse.json({ error: "ไม่พบใบกำกับภาษีในไฟล์นี้" }, { status: 400 });
    const r = await importSalesRows(sb, rows);
    return NextResponse.json({ ok: true, total: rows.length, ...r });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    if (isMissingTable({ code: err.code, message: err.message ?? "" }))
      return NextResponse.json({ error: "ยังไม่ได้สร้างตาราง wht_certs — รันไฟล์ supabase/wht-certs.sql ใน Supabase ก่อน", needsSetup: true }, { status: 503 });
    return NextResponse.json({ error: err.message ?? "อ่านไฟล์ไม่สำเร็จ" }, { status: 400 });
  }
}
