import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";

/**
 * 📊 โควตาข้อความของบัญชีร้าน (@iduckyofficial) — มิเตอร์บนหน้า /admin/chatbot/chats
 * ตอบจากเว็บ = push นับโควตา (OA Manager ไม่นับ) → เหลือน้อยต้องเห็นก่อนกดส่ง · ตัวเลขเดียวกับ `npm run check:line-quota`
 * แคช 10 นาทีใน instance (LINE นับช้าอยู่แล้ว ไม่ต้องสดวินาทีต่อวินาที) · ?fresh=1 บังคับอ่านใหม่
 */
type Quota = { limit: number | null; used: number; left: number | null; at: string };
let cache: { at: number; q: Quota } | null = null;
const TTL = 10 * 60_000;

async function ask<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const gate = await requirePerm(["reports.view", "chat.reply"]);
  if (gate.res) return gate.res;
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า LINE_MESSAGING_ACCESS_TOKEN" }, { status: 503 });
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.q, { headers: { "Cache-Control": "no-store" } });
  const [quota, used] = await Promise.all([
    ask<{ type?: string; value?: number }>("https://api.line.me/v2/bot/message/quota", token),
    ask<{ totalUsage?: number }>("https://api.line.me/v2/bot/message/quota/consumption", token),
  ]);
  if (!quota && !used) return NextResponse.json({ error: "อ่านโควตาจาก LINE ไม่ได้" }, { status: 502 });
  const limit = quota?.type === "limited" && typeof quota.value === "number" ? quota.value : null;
  const totalUsage = used?.totalUsage ?? 0;
  const q: Quota = { limit, used: totalUsage, left: limit === null ? null : Math.max(0, limit - totalUsage), at: new Date().toISOString() };
  cache = { at: Date.now(), q };
  return NextResponse.json(q, { headers: { "Cache-Control": "no-store" } });
}
