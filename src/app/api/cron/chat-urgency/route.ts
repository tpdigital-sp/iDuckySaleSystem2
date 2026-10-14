import { NextResponse } from "next/server";
import { classifyRecentRooms } from "@/lib/server/chat-urgency";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 🤖🏷 ทุก 5 นาที (netlify/functions/chat-urgency.mjs) — ห้องแชทที่ขยับใน 15 นาทีล่าสุด ให้ AI ติดป้ายความเร่งด่วน (lib/server/chat-urgency.ts)
 * ?key= (CRON_SECRET) · ?dry=1 = ดูผลเฉย ๆ ไม่เขียน · ?minutes= ช่วงย้อนหลัง
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });
  const minutes = Math.min(24 * 60, Math.max(1, Number(url.searchParams.get("minutes")) || 15));
  const results = await classifyRecentRooms({ minutes, dry: url.searchParams.get("dry") === "1" });
  const tagged = results.filter((r) => r.key).length;
  return NextResponse.json({ ok: true, rooms: results.length, tagged, results });
}
