import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { uploadImage } from "@/lib/server/bot-kb";

/**
 * 🖼 ดึงรูปที่ลูกค้าส่งใน LINE (log ขาเข้ามี messageId) จาก Messaging API → เก็บขึ้น Storage (chat-<uid>) → เขียน imageUrl กลับ log
 *   ใช้ 2 ทาง: (1) หน้าแชทเปิดดู (/api/admin/chatbot/chats/image) (2) บอท n8n เรียกทันทีหลังบันทึก log (/api/bot/line-image-cache)
 *   เจ้าของร้าน 9 ต.ค. 69 19:15: "รูปที่ลูกค้าส่งจะหมดอายุไหม" → ทาง (2) ทำให้รูปถูกเก็บถาวรตั้งแต่วินาทีที่ส่ง ไม่ต้องรอใครเปิด
 *   ⚠️ LINE ให้ดึงเนื้อหาได้แค่ช่วงหนึ่ง — ดึงไม่ได้ = ติด imageExpired จะได้ไม่ยิงซ้ำ
 */
export type CacheResult = { ok: true; url: string; cached: boolean } | { ok: false; reason: string; status: number; buf?: Buffer; type?: string };

const COL = "line-conversations";

export async function cacheLineImage(db: Firestore, uid: string, logId: string): Promise<CacheResult> {
  if (!/^U[0-9a-f]{32}$/.test(uid) || !/^[A-Za-z0-9_-]{4,64}$/.test(logId)) return { ok: false, reason: "พารามิเตอร์ไม่ถูกต้อง", status: 400 };
  const ref = db.collection(COL).doc(uid).collection("log").doc(logId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "ไม่พบข้อความนี้", status: 404 };
  const x = (snap.data() ?? {}) as Record<string, unknown>;
  const cached = String(x.imageUrl ?? "");
  if (/^https:\/\//.test(cached)) return { ok: true, url: cached, cached: true };
  if (String(x.type ?? "") !== "image") return { ok: false, reason: "ข้อความนี้ไม่ใช่รูป", status: 400 };
  if (x.imageExpired === true) return { ok: false, reason: "รูปหมดอายุใน LINE แล้ว", status: 404 };
  const mid = String(x.messageId ?? "").trim();
  if (!/^\d{6,30}$/.test(mid)) return { ok: false, reason: "ไม่มีรหัสรูปจาก LINE", status: 404 };
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: "ยังไม่ได้ตั้งค่า LINE", status: 503 };

  let res: Response;
  try {
    res = await fetch(`https://api-data.line.me/v2/bot/message/${mid}/content`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    return { ok: false, reason: "ดึงรูปจาก LINE ไม่ได้ (เน็ต)", status: 502 };
  }
  if (!res.ok) {
    await ref.set({ imageExpired: true, imageExpiredReason: `line-${res.status}`, imageCheckedAt: new Date() }, { merge: true }).catch(() => {});
    return { ok: false, reason: res.status === 404 ? "รูปหมดอายุใน LINE แล้ว" : `LINE ตอบ ${res.status}`, status: 404 };
  }
  const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  if (!type.startsWith("image/")) {
    await ref.set({ imageExpired: true, imageExpiredReason: `type-${type}` }, { merge: true }).catch(() => {});
    return { ok: false, reason: "ไม่ใช่ไฟล์รูป", status: 404 };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
  try {
    const img = await uploadImage(`chat-${uid}`, `line-${mid}.${ext}`, buf, type);
    await ref.set({ imageUrl: img.url, imageCachedAt: new Date() }, { merge: true });
    return { ok: true, url: img.url, cached: false };
  } catch {
    return { ok: false, reason: "เก็บขึ้น Storage ไม่ได้", status: 502, buf, type };
  }
}
