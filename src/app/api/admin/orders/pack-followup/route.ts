import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { fetchOpenFollowupsFromTP } from "@/lib/server/tp-report";

export const runtime = "nodejs";

/**
 * 📦 คำตอบจากฝ่ายผลิต (ระบบ TP-Leader หน้า "ติดตามของ iDucky") ของรายการที่ยังรอของอยู่
 * สถานีแพ็ค–ส่งเรียกตอนโหลด/โพล เพื่อโชว์ใต้รายการว่า TP รับเรื่องหรือยัง คาดว่าส่งวันไหน
 * อ่านผ่าน service account ฝั่งเซิร์ฟเวอร์ (browser ไม่แตะ Firebase ตรง)
 */
export async function GET() {
  const gate = await requirePerm(["orders.view", "pack.check", "pack.ship"]);
  if (gate.res) return gate.res;
  const replies = await fetchOpenFollowupsFromTP();
  return NextResponse.json({ replies }, { headers: { "Cache-Control": "no-store" } });
}
