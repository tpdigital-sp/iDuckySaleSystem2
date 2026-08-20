import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { bearerUser } from "@/lib/server/claims-db";
import { isMissingTable } from "@/lib/server/reviews-db";
import type { Review } from "@/lib/reviews";

export const runtime = "nodejs";

/** รีวิวทั้งหมดของลูกค้าที่ล็อกอิน — ไว้โชว์แท็บ "รีวิวของฉัน" + ตัดรายการที่รีวิวแล้วออกจาก "รอรีวิว" */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ reviews: [] });

  const user = await bearerUser(sb, req);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const { data, error } = await sb
    .from("reviews")
    .select("data")
    .eq("data->>customerId", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ reviews: [], needsSetup: true });
    return NextResponse.json({ error: error.message, reviews: [] }, { status: 500 });
  }
  return NextResponse.json({ reviews: (data ?? []).map((r) => r.data as Review) });
}
