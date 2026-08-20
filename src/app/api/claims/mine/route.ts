import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { bearerUser, isMissingTable, withSignedPhotos } from "@/lib/server/claims-db";
import type { Claim } from "@/lib/claims";

export const runtime = "nodejs";

/** เคลมทั้งหมดของลูกค้าที่ล็อกอิน — ใหม่สุดก่อน พร้อมลิงก์รูปแบบ signed (1 ชม.) */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ claims: [] });

  const user = await bearerUser(sb, req);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const { data, error } = await sb
    .from("claims")
    .select("data")
    .eq("data->>customerId", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ claims: [], needsSetup: true });
    return NextResponse.json({ error: error.message, claims: [] }, { status: 500 });
  }

  const claims = await Promise.all((data ?? []).map((r) => withSignedPhotos(sb, r.data as Claim)));
  return NextResponse.json({ claims });
}
