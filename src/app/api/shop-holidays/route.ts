import { NextResponse } from "next/server";
import { loadShopHolidays } from "@/lib/server/shop-holidays";

export const dynamic = "force-dynamic";

/**
 * 🗓 วันหยุดร้าน (จากปฏิทิน TP-Leader) ให้หน้าเว็บใช้คิดวันทำการ — ตะกร้า (วันใช้งาน) + หน้าออเดอร์หลังบ้าน (วันส่ง)
 * { holidays: { "YYYY-MM-DD": ชื่อวันหยุด } | null } · null = อ่านปฏิทินไม่ได้ หน้าเว็บใช้ตารางสำรองในโค้ดต่อ
 * ข้อมูลสาธารณะ (วันหยุดร้าน) ไม่ต้องล็อกอิน · CDN แคช 10 นาที
 */
export async function GET() {
  const holidays = await loadShopHolidays();
  return NextResponse.json(
    { holidays },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
