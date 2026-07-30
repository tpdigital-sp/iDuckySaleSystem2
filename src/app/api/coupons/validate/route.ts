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

  let body: { code?: string; subtotal?: number; items?: { productId?: string; qty?: number; unitPrice?: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const code = (body.code ?? "").trim().toUpperCase();
  const subtotal = Math.max(0, Number(body.subtotal) || 0);
  if (!code) return NextResponse.json({ ok: false, error: "ใส่โค้ดคูปอง" }, { status: 400 });
  // รายการสินค้า (ไว้ตัดสินค้าไม่ร่วมรายการ) — ของเก่าที่ไม่ส่ง items มาก็ยังใช้ได้
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i) => ({ productId: String(i.productId ?? ""), qty: Math.max(0, Number(i.qty) || 0), unitPrice: Math.max(0, Number(i.unitPrice) || 0) }))
    .filter((i) => i.productId);

  const { data: cRow, error } = await sb.from("coupons").select("data").eq("code", code).maybeSingle();
  if (error && !/schema cache|find the table|relation .*does not exist/i.test(error.message))
    return NextResponse.json({ ok: false, error: "ตรวจคูปองไม่สำเร็จ" }, { status: 500 });

  const c = (cRow?.data as Coupon | undefined) ?? null;
  const v = validateCoupon(c, u.user.id, subtotal, Date.now(), items.length ? items : undefined);
  if (!v.ok) return NextResponse.json({ ok: false, error: couponErrorText(v.reason) });

  // มีบางชิ้นไม่ร่วมรายการ → บอกลูกค้าว่าส่วนลดคิดเฉพาะสินค้าที่ร่วม
  const hasExcluded = !!c!.excludeProducts?.length && items.some((i) => c!.excludeProducts!.includes(i.productId));
  return NextResponse.json({
    ok: true,
    code,
    discount: v.discount,
    label: couponLabel(c!),
    ...(hasExcluded ? { note: "สินค้าบางรายการไม่ร่วมรายการ — ส่วนลดคิดเฉพาะสินค้าที่ร่วม" } : {}),
  });
}
