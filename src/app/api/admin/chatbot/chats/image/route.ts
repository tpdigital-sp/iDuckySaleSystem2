import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { uploadImage } from "@/lib/server/bot-kb";

/**
 * 🖼 รูปที่ลูกค้าส่งใน LINE — หน้าแชทเคยเห็นแค่ "[ลูกค้าส่งรูปภาพ]" (เจ้าของร้าน 9 ต.ค. 69 17:30: "ลูกค้าส่งภาพมา แต่ระบบไม่แสดง")
 *   บอท n8n บันทึก log ขาเข้าพร้อม messageId ของ LINE → ตัวนี้ดึงไฟล์จาก Messaging API (GET /v2/bot/message/{id}/content)
 *   ครั้งแรกที่มีคนเปิดดู แล้วเก็บขึ้น Storage (โฟลเดอร์ chat-<uid>) + เขียน imageUrl กลับลง log → ครั้งต่อไปไม่ต้องดึงจาก LINE อีก
 *   ⚠️ LINE เก็บเนื้อหาข้อความไว้ให้ดึงได้แค่ช่วงหนึ่ง — รูปเก่ามากอาจดึงไม่ได้แล้ว (ตอบ SVG "รูปหมดอายุ")
 *
 * GET ?uid=U…&log=<logDocId>  → 302 ไปยัง URL รูป (ใช้เป็น src ของ <img> ได้ตรง ๆ)
 */
const COL = "line-conversations";

function svgNote(text: string, status = 404) {
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="100%" height="100%" rx="12" fill="#F1F5F9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#64748B">${text}</text></svg>`;
  return new NextResponse(body, { status, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const gate = await requirePerm(["reports.view", "chat.reply"]);
  if (gate.res) return gate.res;
  const u = new URL(req.url);
  const uid = (u.searchParams.get("uid") ?? "").trim();
  const logId = (u.searchParams.get("log") ?? "").trim();
  if (!/^U[0-9a-f]{32}$/.test(uid) || !/^[A-Za-z0-9_-]{4,64}$/.test(logId)) return svgNote("พารามิเตอร์ไม่ถูกต้อง", 400);
  const db = getChatFirestore();
  if (!db) return svgNote("ยังไม่ได้ตั้งค่า Firestore", 503);

  const ref = db.collection(COL).doc(uid).collection("log").doc(logId);
  const snap = await ref.get();
  if (!snap.exists) return svgNote("ไม่พบข้อความนี้");
  const x = (snap.data() ?? {}) as Record<string, unknown>;
  const cached = String(x.imageUrl ?? "");
  if (/^https:\/\//.test(cached)) return NextResponse.redirect(cached, 302);
  // เคยดึงแล้ว LINE ไม่ให้ (หมดอายุ/ไม่ใช่รูป) → จำไว้ ไม่ยิง LINE ซ้ำทุกครั้งที่เปิดห้อง
  if (x.imageExpired === true) return svgNote("รูปหมดอายุใน LINE แล้ว");

  const mid = String(x.messageId ?? "").trim();
  if (!/^\d{6,30}$/.test(mid)) return svgNote("ไม่มีรหัสรูปจาก LINE");
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return svgNote("ยังไม่ได้ตั้งค่า LINE", 503);

  let res: Response;
  try {
    res = await fetch(`https://api-data.line.me/v2/bot/message/${mid}/content`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    return svgNote("ดึงรูปจาก LINE ไม่ได้ (เน็ต)", 502);
  }
  if (!res.ok) {
    await ref.set({ imageExpired: true, imageExpiredReason: `line-${res.status}`, imageCheckedAt: new Date() }, { merge: true }).catch(() => {});
    return svgNote(res.status === 404 ? "รูปหมดอายุใน LINE แล้ว" : `LINE ตอบ ${res.status}`, 404);
  }
  const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  if (!type.startsWith("image/")) {
    await ref.set({ imageExpired: true, imageExpiredReason: `type-${type}` }, { merge: true }).catch(() => {});
    return svgNote("ไม่ใช่ไฟล์รูป");
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
  try {
    const img = await uploadImage(`chat-${uid}`, `line-${mid}.${ext}`, buf, type);
    await ref.set({ imageUrl: img.url, imageCachedAt: new Date() }, { merge: true });
    return NextResponse.redirect(img.url, 302);
  } catch {
    // เก็บขึ้น Storage ไม่ได้ → ส่งไฟล์ตรงจาก LINE ให้ดูก่อน (ครั้งหน้าลองใหม่)
    return new NextResponse(buf, { status: 200, headers: { "Content-Type": type, "Cache-Control": "private, max-age=600" } });
  }
}
