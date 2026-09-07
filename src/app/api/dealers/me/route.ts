import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isDealerUid } from "@/lib/server/dealers";

export const runtime = "nodejs";

/**
 * บัญชีที่ล็อกอินอยู่เป็นตัวแทนจำหน่ายไหม — ใช้โดย customer-context ตอนเปิดเว็บ
 * ไม่มี token/เซสชันหมดอายุ = ตอบ { dealer:false } เฉย ๆ (200) — เป็นการถามสถานะ ไม่ใช่ประตูกั้น
 */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ dealer: false });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ dealer: false });

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u.user) return NextResponse.json({ dealer: false });

  return NextResponse.json({ dealer: await isDealerUid(u.user.id) });
}
