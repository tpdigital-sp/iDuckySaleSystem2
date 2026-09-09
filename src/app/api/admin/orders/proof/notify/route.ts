import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { sendProofNotify } from "@/lib/server/proof-notify";

export const runtime = "nodejs";

/**
 * ปุ่ม 📣 "แจ้งลูกค้าทางไลน์" ในหน้าออเดอร์ — แจ้งครั้งเดียวสรุปรูปแบบงานที่ค้างแจ้งทั้งใบ
 * ตัวอัปโหลด (/proof) รับ silent=1 แล้วไม่ยิงเอง · จำนวนรูปนับจากออเดอร์ในฐาน (ไม่เชื่อตัวเลขจากหน้าจอ)
 * ไม่กดภายใน 30 นาที → /api/cron/proof-notify แจ้งให้เอง
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("proof.manage");
  if (gate.res) return gate.res;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; force?: boolean };
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row, error } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });

  const by = gate.actor.name?.trim() || "กราฟฟิก";
  const r = await sendProofNotify(sb, row.data as Order, new URL(req.url).origin, by, { force: !!body.force });
  if (!r.pending.total) return NextResponse.json({ ok: true, skipped: true, order: r.order });
  return NextResponse.json({ ok: true, sent: r.sent, reason: r.reason, count: r.pending.total, order: r.order });
}
