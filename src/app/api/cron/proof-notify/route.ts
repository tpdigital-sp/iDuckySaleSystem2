import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { sendProofNotify } from "@/lib/server/proof-notify";
import { PROOF_AUTO_NOTIFY_MINUTES, pendingProofs, proofNotifyOverdue } from "@/lib/proof-notify";
import { SITE_URL } from "@/lib/shop-info";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 📣 กันลืมกดปุ่ม "แจ้งลูกค้าทางไลน์" — รันทุก 10 นาทีจาก netlify/functions/proof-notify.mjs
 * ออเดอร์ที่มีแบบงานค้างแจ้งเกิน PROOF_AUTO_NOTIFY_MINUTES นาที → ยิงข้อความสรุปให้เองครั้งเดียว (by = "ระบบ")
 * ?key= (CRON_SECRET) กันคนนอก · ?dry=1 = ดูรายการเฉย ๆ
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const dry = url.searchParams.get("dry") === "1";

  // แบบค้างตรวจมีได้แค่ใบสถานะ "รอตรวจแบบ"/"แก้ไขแบบ" (ตัวอัปโหลดตั้งให้) — กรองที่ฐานเลย ไม่ต้องดึงทั้งตาราง
  const { data, error } = await sb.from("orders").select("id,data").in("data->>status", ["รอตรวจแบบ", "แก้ไขแบบ"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const due = (data ?? []).map((r) => r.data as Order).filter((o) => proofNotifyOverdue(o, now));
  const results: { id: string; count: number; sent?: boolean; reason?: string }[] = [];
  for (const o of due) {
    const count = pendingProofs(o).total;
    if (dry) {
      results.push({ id: o.id, count });
      continue;
    }
    const r = await sendProofNotify(sb, o, SITE_URL, "ระบบ", { auto: true });
    results.push({ id: o.id, count, sent: r.sent, reason: r.reason });
  }
  return NextResponse.json({ ok: true, dry, minutes: PROOF_AUTO_NOTIFY_MINUTES, scanned: data?.length ?? 0, due: results });
}
