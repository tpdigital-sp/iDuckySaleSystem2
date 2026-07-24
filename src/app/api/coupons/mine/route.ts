import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { couponLabel, type Coupon } from "@/lib/coupons";

export const runtime = "nodejs";

const tableMissing = (msg = "", code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

/** คูปองของลูกค้าที่ล็อกอิน (เฉพาะที่ผูกบัญชีไว้ assignedTo) — ยืนยันตัวตนด้วย access token */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ coupons: [] });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u.user) return NextResponse.json({ error: "เซสชันหมดอายุ" }, { status: 401 });

  const { data, error } = await sb.from("coupons").select("data").eq("data->>assignedTo", u.user.id);
  if (error) {
    if (tableMissing(error.message, error.code)) return NextResponse.json({ coupons: [], needsSetup: true });
    return NextResponse.json({ error: error.message, coupons: [] }, { status: 500 });
  }

  const nowMs = Date.now();
  const coupons = (data ?? [])
    .map((r) => r.data as Coupon)
    .map((c) => {
      const usable = c.status === "active" && (!c.expiresAt || new Date(c.expiresAt).getTime() >= nowMs);
      // คืนเฉพาะฟิลด์ที่ต้องโชว์ (ไม่เปิดเผยข้อมูลภายใน เช่น redeemedBy)
      return {
        code: c.code,
        type: c.type,
        value: c.value,
        label: couponLabel(c),
        minSpend: c.minSpend ?? null,
        maxDiscount: c.maxDiscount ?? null,
        expiresAt: c.expiresAt ?? null,
        status: c.status,
        usable,
        note: c.note ?? null,
      };
    })
    // ใช้ได้ก่อน แล้วค่อยหมดอายุ/ใช้แล้ว · ในกลุ่มเดียวกันเรียงหมดอายุใกล้สุดก่อน
    .sort((a, b) => {
      if (a.usable !== b.usable) return a.usable ? -1 : 1;
      const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
      const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
      return ae - be;
    });

  return NextResponse.json({ coupons });
}
