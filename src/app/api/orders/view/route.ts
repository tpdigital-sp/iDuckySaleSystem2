import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ลูกค้าเปิดดูออเดอร์ของตัวเอง (public แต่ต้องมี key ลับที่ได้ตอนสั่งซื้อ)
 * GET /api/orders/view?id=OD-xxx&key=xxx
 * — ตัด key ออกก่อนส่งกลับ ไม่ต้องให้หน้าเว็บถือ key ซ้ำ (มันอยู่ใน URL อยู่แล้ว)
 */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  const key = url.searchParams.get("key") ?? "";
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row, error } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
      return NextResponse.json({ error: "ระบบยังไม่พร้อม — ผู้ดูแลต้องสร้างตาราง orders ก่อน" }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  // ออเดอร์ที่มี key ต้องยืนยันด้วย key เสมอ (ออเดอร์เก่าก่อนมีระบบ key → เปิดดูได้ด้วยเลขออเดอร์)
  if (order.key && order.key !== key)
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });

  const { key: _secret, ...safe } = order;
  void _secret;

  // ให้ลูกค้าเห็นสลิปที่ตัวเองแนบ — เซ็น URL ชั่วคราวจาก bucket ส่วนตัว (key ของออเดอร์คือหลักฐานความเป็นเจ้าของแล้ว)
  if (safe.slipPath) {
    const { data: signed } = await sb.storage.from("payment-slips-private").createSignedUrl(safe.slipPath, 3600);
    if (signed?.signedUrl) safe.slipUrl = signed.signedUrl;
  }
  // ออเดอร์มัดจำมีสลิปงวดหลังอีกใบ — เซ็นให้ลูกค้าเห็นของตัวเองเหมือนกัน
  if (safe.deposit?.balanceSlipPath) {
    const { data: signed } = await sb.storage.from("payment-slips-private").createSignedUrl(safe.deposit.balanceSlipPath, 3600);
    if (signed?.signedUrl) safe.deposit = { ...safe.deposit, balanceSlipUrl: signed.signedUrl };
  }

  return NextResponse.json({ ok: true, order: safe });
}
