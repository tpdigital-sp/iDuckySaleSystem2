import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isMissingTable } from "@/lib/server/reviews-db";
import { REVIEW_STATUSES, type Review, type ReviewStatus } from "@/lib/reviews";

export const runtime = "nodejs";

/** รีวิวทั้งหมด (หลังบ้าน) — ใหม่สุดก่อน ไว้ตรวจ/อนุมัติ/ตอบกลับ */
export async function GET() {
  const gate = await requirePerm("orders.viewAll");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ reviews: [] });

  const { data, error } = await sb.from("reviews").select("data").order("created_at", { ascending: false }).limit(500);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ reviews: [], needsSetup: true });
    return NextResponse.json({ error: error.message, reviews: [] }, { status: 500 });
  }
  return NextResponse.json({ reviews: (data ?? []).map((r) => r.data as Review) });
}

/** อนุมัติ/ซ่อน/ตอบกลับรีวิว */
export async function PATCH(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { id?: string; status?: ReviewStatus; reply?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "ไม่รู้ว่ารีวิวไหน" }, { status: 400 });

  const { data: row } = await sb.from("reviews").select("data").eq("id", body.id).maybeSingle();
  const review = row?.data as Review | undefined;
  if (!review) return NextResponse.json({ error: "ไม่พบรีวิวนี้" }, { status: 404 });

  if (body.status && REVIEW_STATUSES.includes(body.status)) review.status = body.status;
  const reply = (body.reply ?? "").trim().slice(0, 1000);
  if (reply) review.reply = { text: reply, at: new Date().toISOString(), name: gate.actor.name || gate.actor.username };

  review.updatedAt = new Date().toISOString();
  const { error } = await sb.from("reviews").update({ data: review }).eq("id", review.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, review });
}
