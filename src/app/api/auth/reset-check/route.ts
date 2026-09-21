import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * ✉️ เช็คก่อนส่งลิงก์รีเซ็ตรหัสผ่าน ว่าอีเมลนี้มีบัญชีอยู่จริงไหม — เจ้าของร้านสั่ง 21 ก.ย. 69
 * POST /api/auth/reset-check  { email } → { status: "none" | "line" | "password" }
 *
 * ทำไมต้องมี: Supabase ตอบ "ส่งแล้ว" เหมือนกันหมดไม่ว่าอีเมลนั้นจะมีบัญชีหรือไม่ (กันคนไล่เดาอีเมล)
 * ผลคือลูกค้าที่ไม่เคยสมัครสมาชิกจะนั่งรออีเมลที่ไม่มีวันมา แล้วเข้าออเดอร์ตัวเองไม่ได้เลย
 * (เคสจริง 21 ก.ย. 69 — แอดมินต้องส่งลิงก์ออเดอร์ให้ทางไลน์เอง)
 *
 * เราจึงยอมบอกตรง ๆ ว่า "ยังไม่มีบัญชีอีเมลนี้" แล้วพาไปทางที่ใช้ได้จริง (/order/find หรือทักไลน์)
 * แลกกับการที่คนอื่นเดาได้ว่าอีเมลไหนเป็นสมาชิก — ร้านมีสมาชิกหลักสิบราย ความเสี่ยงต่ำกว่าลูกค้าเข้าออเดอร์ไม่ได้
 * กันไล่เดารายชื่อด้วยการจำกัดจำนวนครั้งต่อ IP ด้านล่าง
 *
 * "line" = บัญชีที่ผูกกับการเข้าสู่ระบบด้วย LINE — ส่วนใหญ่ไม่เคยตั้งรหัสผ่านไว้
 *          (เข้าด้วยปุ่ม LINE ได้เลย · ถ้าอยากตั้งรหัสผ่านก็ยังส่งลิงก์ให้ได้)
 */

const HITS = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 10;

function tooMany(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || cur.until < now) {
    HITS.set(ip, { n: 1, until: now + WINDOW_MS });
    if (HITS.size > 500) for (const [k, v] of HITS) if (v.until < now) HITS.delete(k);
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_TRIES;
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  // ตรวจไม่ได้ก็ไม่ขวาง — ให้หน้าเว็บส่งลิงก์ตามปกติ
  if (!sb) return NextResponse.json({ status: "unknown" });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (tooMany(ip)) return NextResponse.json({ status: "unknown" });

  let email = "";
  try {
    email = String(((await req.json()) as { email?: string }).email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!email) return NextResponse.json({ error: "กรอกอีเมลก่อนครับ" }, { status: 400 });

  // ไม่มี endpoint ค้นด้วยอีเมลตรง ๆ — ร้านมีสมาชิกหลักสิบ ดึงมาเทียบทั้งชุดเร็วพอ (แบบเดียวกับ LINE callback)
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const user = (list?.users ?? []).find((u) => u.email?.toLowerCase() === email);
  if (!user) return NextResponse.json({ status: "none" });
  return NextResponse.json({ status: user.user_metadata?.line_user_id ? "line" : "password" });
}
