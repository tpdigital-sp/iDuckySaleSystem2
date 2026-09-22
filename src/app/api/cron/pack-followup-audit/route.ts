import { NextResponse } from "next/server";
import { sweepStaleFollowups } from "@/lib/server/tp-report";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 🧹 ตรวจ "การ์ดค้างในหน้าติดตามของ iDucky ทั้งที่ของมาครบ/ส่งไปแล้ว" — รันจาก netlify/functions/pack-followup-audit.mjs
 *
 * ทำไม (พนักงานแจ้ง 22 ก.ย. 69 — OD-260916-1093, OD-260916-4693 และอีก 5 ใบ):
 * ใบติดตามถูกยิงไป Firestore หลังตอบ HTTP กลับไปแล้ว · Netlify แช่แข็งเครื่องทันทีที่ตอบ → ใบ "ปิดเรื่อง" ตายกลางทาง
 * (ฝ่ายแพ็คกดตรวจนับรัวทีละรูป คำขอยังซ้อนกันจนเขียนสลับลำดับได้อีก)
 * แก้ที่ต้นทางแล้ว — await ให้เขียนเสร็จก่อนตอบ + transaction กันเขียนย้อนเวลา + กวาดซ้ำตอนใบปิดงาน
 * ตัวนี้เป็นชั้นสุดท้าย: เทียบใบที่ยังเปิดอยู่กับออเดอร์จริงในฐาน แล้วปิดใบที่จบไปแล้ว
 *
 * ?key= (CRON_SECRET) · ?dry=1 ดูเฉย ๆ ไม่ปิดให้
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const dry = url.searchParams.get("dry") === "1";
  const { checked, orders, closed } = await sweepStaleFollowups(dry);
  return NextResponse.json({ ok: true, dry, checked, orders, closed }, { headers: { "Cache-Control": "no-store" } });
}
