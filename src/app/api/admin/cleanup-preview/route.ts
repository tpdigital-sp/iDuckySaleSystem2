import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { proofsOf, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * 🔍 "ลองดูก่อน" ของหน้าตั้งค่า — บอกว่าถ้าล้างรูปตอนนี้จะโดนออเดอร์ไหนบ้าง (ไม่ลบจริง)
 * ใช้เกณฑ์เดียวกับ cron จริง แต่รับ days/closed จาก query เพื่อลองค่าก่อนกดบันทึก
 */
export async function GET(req: Request) {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const url = new URL(req.url);
  const days = Math.max(1, Number(url.searchParams.get("days")) || 30);
  const onlyClosed = url.searchParams.get("closed") !== "0";
  const cutoff = Date.now() - days * 86400_000;

  const { data: rows, error } = await sb.from("orders").select("id,data,created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const CLOSED = new Set(["เสร็จสิ้น", "ยกเลิก"]);
  const list: { id: string; status: string; files: number }[] = [];

  for (const row of rows ?? []) {
    const order = row.data as Order & { imagesPurgedAt?: string };
    if (!order?.id || order.imagesPurgedAt) continue;
    const created = new Date(row.created_at ?? order.date ?? 0).getTime();
    if (!created || created > cutoff) continue;
    if (onlyClosed && !CLOSED.has(order.status)) continue;

    let files = 0;
    for (const it of order.items ?? []) {
      files += proofsOf(it).length;
      files += (it.artworkUrls ?? []).length;
    }
    files += (order.packPhotos ?? []).length;
    if (order.slipPath) files += 1;
    if (!files) continue;
    list.push({ id: order.id, status: order.status, files });
  }

  return NextResponse.json({
    ok: true,
    days,
    onlyClosed,
    orders: list.length,
    files: list.reduce((n, o) => n + o.files, 0),
    list: list.slice(0, 30),
  });
}
