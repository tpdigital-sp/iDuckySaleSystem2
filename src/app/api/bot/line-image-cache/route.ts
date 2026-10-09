import { NextResponse } from "next/server";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { verifyBotToken } from "@/lib/server/customer-profile";
import { cacheLineImage } from "@/lib/server/line-image-cache";

export const runtime = "nodejs";
export const maxDuration = 26;

/**
 * 🤖🖼 บอท n8n (Build AI Request) เรียกทันทีหลังบันทึก log รูปของลูกค้า → ดึงจาก LINE เก็บถาวรใน Storage ก่อน LINE จะลบ
 *   POST { uid, log }  · Authorization: Bearer <Firebase ID token เดียวกับที่บอทใช้เขียน Firestore> หรือ x-cron-secret
 *   ตอบ { ok, url } · ดึงไม่ได้ก็ตอบ 200 พร้อม ok:false (บอทไม่ต้องสนใจผล)
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bySecret = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!bySecret && !(await verifyBotToken(req.headers.get("authorization")))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ ok: false, reason: "no firestore" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { uid?: string; log?: string };
  const r = await cacheLineImage(db, String(b.uid ?? "").trim(), String(b.log ?? "").trim());
  return NextResponse.json(r.ok ? { ok: true, url: r.url, cached: r.cached } : { ok: false, reason: r.reason }, { headers: { "Cache-Control": "no-store" } });
}
