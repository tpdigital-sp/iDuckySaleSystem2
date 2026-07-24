import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { validateCoupon, couponLabel, couponErrorText, type Coupon } from "@/lib/coupons";

export const runtime = "nodejs";

/**
 * ตรวจคูปองก่อนสั่งซื้อ (พรีวิวส่วนลด — ยังไม่ตัดใช้)
 * ต้องล็อกอิน (แนบ access token) เพราะคูปองผูกกับบัญชี กันส่งต่อให้เพื่อน
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "ระบบยังไม่พร้อม" }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false, error: "ต้องเข้าสู่ระบบก่อนใช้คูปอง" }, { status: 401 });
  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u.user) return NextResponse.json({ ok: false, error: "เซสชันหมดอายุ" }, { status: 401 });

  let body: { code?: string; subtotal?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const code = (body.code ?? "").trim().toUpperCase();
  const subtotal = Math.max(0, Number(body.subtotal) || 0);
  if (!code) return NextResponse.json({ ok: false, error: "ใส่โค้ดคูปอง" }, { status: 400 });

  const { data: cRow, error } = await sb.from("coupons").select("data").eq("code", code).maybeSingle();
  if (error && !/schema cache|does not exist/i.test(error.message))
    return NextResponse.json({ ok: false, error: "ตรวจคูปองไม่สำเร็จ" }, { status: 500 });

  const c = (cRow?.data as Coupon | undefined) ?? null;
  const v = validateCoupon(c, u.user.id, subtotal, Date.now());
  if (!v.ok) return NextResponse.json({ ok: false, error: couponErrorText(v.reason) });

  return NextResponse.json({ ok: true, code, discount: v.discount, label: couponLabel(c!) });
}
