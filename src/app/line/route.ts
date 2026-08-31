/**
 * /line — พาลูกค้าไป LINE ร้านให้ถูกทางตามอุปกรณ์
 *
 * มือถือ  → line.me/R/oaMessage/@146swmrt  = เปิด "ห้องแชทร้าน" ตรง ๆ
 *            (คนที่แอดร้านไว้แล้วเข้าแชทเลย ไม่ต้องผ่านหน้าแอดเพื่อน
 *             คนที่ยังไม่แอดก็เข้าห้องแชทได้ แล้วกดแอดจากแถบด้านบน)
 * คอม/อื่น → page.line.me = หน้าโปรไฟล์ร้าน + QR ให้สแกน
 *            (ลิงก์ oaMessage บนเบราว์เซอร์คอมจะเด้งไปหน้าแรก line.me เฉย ๆ ใช้ไม่ได้)
 *
 * ใส่ข้อความตั้งต้นได้ด้วย /line?text=... (เฉพาะมือถือ — จะไปโผล่ในช่องพิมพ์)
 */
import { NextResponse, type NextRequest } from "next/server";

/** ไอดีพื้นฐานของ LINE OA ร้าน (@ ต้องเข้ารหัสเป็น %40 ในลิงก์) */
const BASIC_ID = "146swmrt";
const CHAT_URL = `https://line.me/R/oaMessage/%40${BASIC_ID}/`;
const PAGE_URL = `https://page.line.me/${BASIC_ID}?openQrModal=true`;

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const ua = req.headers.get("user-agent") || "";
  const isMobile = /iPhone|iPad|iPod|Android|Line\//i.test(ua);

  let target = PAGE_URL;
  if (isMobile) {
    const text = (req.nextUrl.searchParams.get("text") || "").trim();
    // ลิงก์ยาวเกินบางเครื่องเปิดไม่ขึ้น — ข้อความยาว ๆ ปล่อยให้ลูกค้าวางจากคลิปบอร์ดแทน
    target = text && text.length <= 800 ? CHAT_URL + "?" + encodeURIComponent(text) : CHAT_URL;
  }

  return NextResponse.redirect(target, {
    status: 302,
    // กันแคช/CDN จำคำตอบของอุปกรณ์แรกไว้ใช้กับทุกคน
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
