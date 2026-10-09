import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { cacheLineImage } from "@/lib/server/line-image-cache";

/**
 * 🖼 รูปที่ลูกค้าส่งใน LINE สำหรับหน้าแชท — GET ?uid=U…&log=<logDocId> → 302 ไปยัง URL รูป (ใช้เป็น src ของ <img> ได้ตรง ๆ)
 *   ตรรกะดึง/แคชอยู่ที่ lib/server/line-image-cache.ts (บอท n8n ก็เรียกผ่าน /api/bot/line-image-cache ทันทีที่ลูกค้าส่ง)
 */
function svgNote(text: string, status = 404) {
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="100%" height="100%" rx="12" fill="#F1F5F9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#64748B">${text}</text></svg>`;
  return new NextResponse(body, { status, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const gate = await requirePerm(["reports.view", "chat.reply"]);
  if (gate.res) return gate.res;
  const u = new URL(req.url);
  const db = getChatFirestore();
  if (!db) return svgNote("ยังไม่ได้ตั้งค่า Firestore", 503);
  const r = await cacheLineImage(db, (u.searchParams.get("uid") ?? "").trim(), (u.searchParams.get("log") ?? "").trim());
  if (r.ok) return NextResponse.redirect(r.url, 302);
  // เก็บขึ้น Storage ไม่ได้แต่ดึงจาก LINE ได้ → ส่งไฟล์ให้ดูก่อน (ครั้งหน้าลองใหม่)
  if (r.buf) return new NextResponse(new Uint8Array(r.buf), { status: 200, headers: { "Content-Type": r.type ?? "image/jpeg", "Cache-Control": "private, max-age=600" } });
  return svgNote(r.reason, r.status);
}
