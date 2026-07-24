import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { couponLabel, type Coupon } from "@/lib/coupons";

export const runtime = "nodejs";

/**
 * ข้อมูลคูปองแบบย่อ (สำหรับหน้าลิงก์ /coupon/[code]) — ต้องรู้โค้ดเต็ม (สุ่ม 8 ตัว) ถึงเปิดได้
 * คืนเฉพาะฟิลด์ที่โชว์ได้ ไม่เปิดเผยว่าใครใช้/ผูกกับบัญชีใคร
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim().toUpperCase();
  const sb = getSupabaseAdmin();
  if (!sb || !code) return NextResponse.json({ found: false });

  const { data } = await sb.from("coupons").select("data").eq("code", code).maybeSingle();
  const c = data?.data as Coupon | undefined;
  if (!c) return NextResponse.json({ found: false });

  const usable = c.status === "active" && (!c.expiresAt || new Date(c.expiresAt).getTime() >= Date.now());
  return NextResponse.json({
    found: true,
    code: c.code,
    label: couponLabel(c),
    status: c.status,
    usable,
    minSpend: c.minSpend ?? null,
    expiresAt: c.expiresAt ?? null,
    restricted: !!c.assignedTo, // เจาะจงบัญชี — ต้องล็อกอินบัญชีที่ถูกต้อง
  });
}
