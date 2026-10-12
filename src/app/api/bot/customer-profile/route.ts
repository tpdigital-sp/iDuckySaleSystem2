import { NextResponse } from "next/server";
import { buildCustomerProfile, verifyBotToken } from "@/lib/server/customer-profile";
import { inBackground } from "@/lib/server/background";
import { CHAT_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🧠 โปรไฟล์ลูกค้า LINE สำหรับบอท (n8n Build AI Request เรียกทุกข้อความ) — 1 ต.ค. 69
 * POST { userId } · สิทธิ์: Authorization: Bearer <Firebase ID token ของบัญชีบอท> (ตัวเดียวกับที่ Debounce Buffer ใช้เขียน Firestore)
 * หรือ header x-cron-secret = CRON_SECRET (ไว้ทดสอบ/สคริปต์ภายใน)
 * ตอบ { text, name, orders, tier, dealer, summary, messageCount, refreshed } — text = ก้อนข้อความสั้นไว้แปะหัวพรอมป์ต
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bySecret = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!bySecret && !(await verifyBotToken(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 401 });
  }
  let body: { userId?: string };
  try {
    body = (await req.json()) as { userId?: string };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const userId = String(body.userId ?? "").trim();
  if (!/^U[0-9a-f]{32}$/.test(userId)) return NextResponse.json({ error: "userId ไม่ถูกต้อง" }, { status: 400 });
  const t0 = Date.now();
  try {
    // ⏱ n8n รอ API นี้แค่ 6 วิ (เกิน = บอทไม่มีข้อมูลลูกค้าทั้งก้อน) · เว็บจริงวัดได้ ~4 วิ และ cold start หลัง deploy 13 วิ (12 ต.ค. 69)
    //   → เกิน 4.5 วิ ตอบด้วยข้อความที่แคชไว้ในห้องแชท (profile.text ของรอบก่อน) แล้วปล่อยตัวสร้างใหม่ทำต่อเบื้องหลัง (มันเขียนแคชเอง)
    const build = buildCustomerProfile(userId);
    const raced = await Promise.race([build, new Promise<"slow">((r) => setTimeout(() => r("slow"), Math.max(500, 4500 - (Date.now() - t0))))]);
    if (raced === "slow") {
      inBackground("customer-profile slow build", build);
      const db = getChatFirestore();
      const snap = db ? await db.collection(CHAT_COLLECTION).doc(userId).get().catch(() => null) : null;
      const text = String(((snap?.data() ?? {}) as { profile?: { text?: string } }).profile?.text ?? "");
      return NextResponse.json({ userId, text, cached: true, ms: Date.now() - t0 }, { headers: { "Cache-Control": "no-store" } });
    }
    const profile = raced;
    if (!profile) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
    return NextResponse.json({ ...profile, ms: Date.now() - t0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
