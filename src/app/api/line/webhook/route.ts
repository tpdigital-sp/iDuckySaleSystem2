import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { rememberLineSources, type LineSource } from "@/lib/server/line-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 📬 ปลายทาง webhook ของ LINE OA ร้าน — มีไว้เพื่อ "หาเลขห้องแชท" อย่างเดียว
 *
 * ใช้ตอนย้ายข้อความแจ้งเตือนของร้าน (ออเดอร์สั่งจำนวนมาก · ของใกล้หมด) จากไลน์ส่วนตัวไปไลน์กลุ่ม:
 * LINE ไม่มี API ให้ถามว่ากลุ่มไหนมีเลขอะไร ต้องให้ LINE ยิง event มาบอกเองเท่านั้น
 * ได้เลขแล้วเอาไปใส่ env LINE_STOCK_ALERT_TO บน Netlify (ดู [[iducky-stock-check-alert]])
 *
 * ⚠️ ไม่ได้ตอบแชทลูกค้า — บอทตอบแชทอยู่ที่ n8n เหมือนเดิม
 *    ตั้ง LINE_FORWARD_WEBHOOK_URL = URL webhook ของ n8n ตัวเดิม แล้วเส้นนี้จะส่งต่อให้ทุก event
 *    (ส่งทั้งตัวดิบ + หัว x-line-signature เดิม n8n จึงตรวจลายเซ็นต่อได้) บอทจึงทำงานเหมือนเดิม
 *    ไม่ได้ตั้ง = จดเลขห้องอย่างเดียว ไม่ส่งต่อใคร
 *
 * ⚠️ ต้องตอบ 200 เร็ว ๆ เสมอ ไม่งั้น LINE จะมองว่า endpoint เสียแล้วปิด webhook ให้เอง
 *    งานจด/ส่งต่อจึงทำแบบไม่รอผล (void) และห่อ try ไว้ทั้งก้อน
 */

/** ลายเซ็นตรงกับ channel secret ไหม — ไม่ได้ตั้ง secret = ตรวจไม่ได้ (คืน false ไว้ก่อน) */
function signatureOk(raw: string, signature: string | null): boolean {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const mine = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  const a = Buffer.from(mine);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** ชื่อกลุ่มจาก LINE (มีเฉพาะ type group) — ไม่ได้ก็ไม่เป็นไร เลขห้องสำคัญกว่า */
async function groupName(groupId: string): Promise<string | undefined> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return undefined;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return undefined;
    return ((await res.json()) as { groupName?: string }).groupName;
  } catch {
    return undefined;
  }
}

interface LineEvent {
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string };
}

/** ส่ง event ดิบต่อให้ n8n (บอทตอบแชทตัวเดิม) — ล้มเหลวก็เงียบ ห้ามทำให้ webhook พัง */
async function forward(raw: string, signature: string | null): Promise<void> {
  const url = process.env.LINE_FORWARD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature ? { "x-line-signature": signature } : {}),
      },
      body: raw,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* n8n ล่ม = บอทไม่ตอบ แต่ webhook ฝั่งเราต้องตอบ 200 ตามเดิม */
  }
}

/** แกะเลขห้องจาก event แล้วจดลงคลัง (ถามชื่อกลุ่มจาก LINE ก่อนถ้าเป็นกลุ่ม) */
async function capture(raw: string, verified: boolean): Promise<void> {
  const events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? [];
  const at = new Date().toISOString();
  const seen = new Map<string, LineSource>();
  for (const ev of events) {
    const s = ev.source;
    if (!s) continue;
    const id = s.groupId ?? s.roomId ?? s.userId;
    const type = s.groupId ? "group" : s.roomId ? "room" : s.userId ? "user" : null;
    if (!id || !type) continue;
    seen.set(id, { type, id, at, verified });
  }
  const rows = [...seen.values()];
  if (rows.length === 0) return;
  await Promise.all(
    rows.filter((r) => r.type === "group").map(async (r) => {
      r.name = await groupName(r.id);
    }),
  );
  await rememberLineSources(rows);
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature");
  try {
    const raw = await req.text();
    /*
     * ⚠️ ต้อง await ทั้งคู่ ห้ามยิงทิ้ง (void) — บน Netlify ฟังก์ชันถูกแช่ทันทีที่ตอบกลับ
     *    งานที่ยังค้างอยู่จะไม่ได้ทำ เลขห้องจึงไม่ถูกจด/บอทไม่ได้ข้อความ
     *    ทั้งสองงานมี timeout ของตัวเอง (ส่งต่อ 10 วิ · ถามชื่อกลุ่ม 5 วิ) จึงไม่ค้างยาว
     *    ตัวไหนพังก็ไม่ลาก 200 ตกไปด้วย (allSettled)
     */
    await Promise.allSettled([forward(raw, signature), capture(raw, signatureOk(raw, signature))]);
  } catch {
    /* body ไม่ใช่ JSON — ยังต้องตอบ 200 ไม่งั้น LINE ปิด webhook ให้เอง */
  }
  return NextResponse.json({ ok: true });
}

/** ปุ่ม Verify ใน LINE console ยิง GET/POST มาเช็คว่า endpoint มีจริง */
export function GET() {
  return NextResponse.json({ ok: true, note: "LINE webhook ของ iDucky — ใช้หาเลขห้องแชท" });
}
