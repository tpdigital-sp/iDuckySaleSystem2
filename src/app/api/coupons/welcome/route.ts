import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { randomCode, type Coupon } from "@/lib/coupons";
import { welcomeCouponOf, SETTINGS_ID, type ShopPayment } from "@/lib/shop-settings";

export const runtime = "nodejs";

// สมัครภายในกี่วันถือว่า "สมาชิกใหม่" (กันลูกค้าเก่าล็อกอินแล้วได้คูปองย้อนหลัง)
const NEW_ACCOUNT_DAYS = 14;

const tableMissing = (msg = "", code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|does not exist/i.test(msg);

/**
 * ออกคูปองต้อนรับให้สมาชิกใหม่ (เรียกตอนล็อกอินครั้งแรก) — idempotent
 * กันออกซ้ำด้วย flag ใน user_metadata.welcomeCoupon · ผูกบัญชี (assignedTo) กันส่งต่อ
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, issued: false });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false, issued: false }, { status: 401 });
  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u.user) return NextResponse.json({ ok: false, issued: false }, { status: 401 });
  const user = u.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  // ออกไปแล้ว → คืนโค้ดเดิม (ให้ client เก็บไว้ใช้ต่อได้)
  if (typeof meta.welcomeCoupon === "string" && meta.welcomeCoupon) {
    return NextResponse.json({ ok: true, issued: false, code: meta.welcomeCoupon });
  }

  // เฉพาะสมาชิกใหม่ (สมัครไม่เกิน NEW_ACCOUNT_DAYS วัน)
  const ageDays = user.created_at ? (Date.now() - new Date(user.created_at).getTime()) / 86_400_000 : 999;
  if (ageDays > NEW_ACCOUNT_DAYS) return NextResponse.json({ ok: true, issued: false });

  // อ่านค่าคูปองต้อนรับจากตั้งค่าร้าน
  const { data: settRow } = await sb.from("products").select("data").eq("id", SETTINGS_ID).maybeSingle();
  const cfg = welcomeCouponOf(settRow?.data as ShopPayment | undefined);
  if (!cfg.enabled || cfg.value <= 0) return NextResponse.json({ ok: true, issued: false });

  const nowMs = Date.now();
  const code = `WELCOME-${randomCode(6)}`;
  const coupon: Coupon = {
    code,
    type: cfg.type,
    value: cfg.value,
    ...(cfg.minSpend ? { minSpend: cfg.minSpend } : {}),
    ...(cfg.type === "percent" && cfg.maxDiscount ? { maxDiscount: cfg.maxDiscount } : {}),
    ...(cfg.expiryDays ? { expiresAt: new Date(nowMs + cfg.expiryDays * 86_400_000).toISOString() } : {}),
    assignedTo: user.id, // ผูกบัญชี — เพื่อนใช้ไม่ได้
    note: "คูปองต้อนรับสมาชิกใหม่",
    status: "active",
    createdAt: new Date(nowMs).toISOString(),
  };

  const { error: insErr } = await sb.from("coupons").insert({ code, data: coupon });
  if (insErr) {
    // ยังไม่มีตาราง coupons → ข้ามเงียบ ๆ (ระบบยังใช้ได้ แค่ไม่มีคูปองต้อนรับ)
    if (tableMissing(insErr.message, insErr.code)) return NextResponse.json({ ok: true, issued: false });
    return NextResponse.json({ ok: false, issued: false }, { status: 500 });
  }

  // ปักธงกันออกซ้ำ (merge เมทาดาต้าเดิม ไม่ให้โปรไฟล์หาย)
  await sb.auth.admin.updateUserById(user.id, {
    user_metadata: { ...meta, welcomeCoupon: code, welcomeCouponAt: coupon.createdAt },
  });

  return NextResponse.json({ ok: true, issued: true, code });
}
