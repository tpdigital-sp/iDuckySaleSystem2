import { NextResponse, type NextRequest } from "next/server";

/**
 * 👁 ทีมงานเปิดลิงก์สินค้าปกติ /products/[id] แล้วเห็นหน้าพรีวิวโดยไม่ต้องเปลี่ยน URL
 *
 * ที่ต้องอ้อมแบบนี้: หน้า /products/[id] เป็นหน้าแคช ISR — อ่านคุกกี้ในหน้าโดยตรงไม่ได้
 * (บนเว็บจริงจะพัง 500 DYNAMIC_SERVER_USAGE — เคยเกิดกับสินค้าฉบับร่างทุกตัว 2 ก.ย. 69)
 * middleware รันก่อนแคชเสมอ เลยดูได้ว่า "มีคุกกี้ทีมงานไหม" แล้วค่อยเลือกเส้นทาง:
 *   • ไม่มีคุกกี้ (ลูกค้าทั่วไป) → ปล่อยผ่านไปหน้าแคชตามปกติ — ความเร็ว/ISR ไม่กระทบ
 *   • มีคุกกี้ → rewrite ไป /preview/[id] (หน้า force-dynamic) ซึ่งตรวจคุกกี้จริงจัง
 *     อีกชั้น: ร่างต้องเป็นทีมงานถึงเห็น · คุกกี้หมดอายุ+สินค้าเผยแพร่แล้วก็ยังเปิดได้ (แค่ไม่ผ่านแคช)
 *
 * ตรวจแค่ "มีคุกกี้" ไม่ verify ลายเซ็นที่นี่ — middleware เป็น edge runtime ใช้ node:crypto
 * ของ admin-session ไม่ได้ และการ verify จริงเกิดที่หน้า /preview อยู่แล้ว (ปลอมคุกกี้ = เห็นแต่ของที่
 * ลูกค้าเห็นได้อยู่แล้ว แบบไม่ผ่านแคชเท่านั้น)
 */
const SESSION_COOKIE = "ducky_admin_session"; // ให้ตรงกับ @/lib/server/admin-session (import ตรง ๆ ไม่ได้)

export function middleware(req: NextRequest) {
  if (!req.cookies.has(SESSION_COOKIE)) return;
  const url = req.nextUrl.clone();
  url.pathname = url.pathname.replace(/^\/products\//, "/preview/");
  return NextResponse.rewrite(url);
}

export const config = {
  // เฉพาะหน้าสินค้ารายตัวเท่านั้น — หน้าอื่นไม่ต้องเสียเวลาผ่านด่านนี้
  matcher: "/products/:id+",
};
