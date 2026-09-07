import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadDealersDoc } from "@/lib/server/dealers";

export const runtime = "nodejs";

/**
 * สถานะตัวแทนของบัญชีที่ล็อกอิน — ใช้โดย customer-context ตอนเปิดเว็บ และหน้า /dealer
 * ตอบ { dealer, applied, application? } · application คืนเฉพาะของตัวเอง (ไว้เติมฟอร์มตอนแก้ใบสมัคร)
 * ไม่มี token/เซสชันหมดอายุ = ตอบค่าว่างเฉย ๆ (200) — เป็นการถามสถานะ ไม่ใช่ประตูกั้น
 */
export async function GET(req: Request) {
  const none = { dealer: false, applied: false };
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json(none);

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json(none);

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u.user) return NextResponse.json(none);

  const doc = await loadDealersDoc();
  const app = doc.applications[u.user.id];
  return NextResponse.json({
    dealer: u.user.id in doc.users,
    applied: !!app,
    ...(app ? { application: app } : {}),
  });
}
