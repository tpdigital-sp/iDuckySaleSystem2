import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isDealerUid } from "@/lib/server/dealers";
import { loadDealerSender, saveDealerSender } from "@/lib/server/dealer-sender";
import { cleanSender } from "@/lib/order-sender";
import type { OrderSender } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * 📮 ผู้ส่งประจำของตัวแทน (ชื่อร้านที่จะขึ้นบนกล่องแทนชื่อร้านเรา) — ตัวแทนตั้งเองจากหน้า /dealer
 *
 * GET  → { dealer, sender? }
 * POST { name?, phone?, address? } → บันทึก (ทุกช่องว่าง = ล้างทิ้ง กลับไปใช้ชื่อร้านเรา)
 *
 * ⚠️ ต้องเป็นบัญชีในทะเบียนตัวแทนเท่านั้น (ยืนยันจาก token ไม่ใช่ค่าที่ส่งมา) —
 *    ไม่งั้นลูกค้าทั่วไปตั้งชื่อผู้ส่งเป็นชื่อร้านคนอื่นได้
 */
async function uidOf(req: Request, sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return "";
  const { data, error } = await sb.auth.getUser(token);
  return error || !data.user ? "" : data.user.id;
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ dealer: false });
  const uid = await uidOf(req, sb);
  if (!uid || !(await isDealerUid(uid))) return NextResponse.json({ dealer: false });
  const sender = await loadDealerSender(sb, uid);
  return NextResponse.json({ dealer: true, ...(sender ? { sender } : {}) });
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const uid = await uidOf(req, sb);
  if (!uid) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!(await isDealerUid(uid))) return NextResponse.json({ error: "เฉพาะบัญชีตัวแทนจำหน่ายเท่านั้น" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as OrderSender | null;
  const sender = cleanSender(body);
  // ตั้งที่อยู่ผู้ส่งเอง = ที่อยู่ที่พัสดุตีกลับไปหา → ต้องมีเบอร์ให้ขนส่งติดต่อได้
  if (sender?.address && !sender.phone)
    return NextResponse.json({ error: "กรอกที่อยู่ผู้ส่งแล้วต้องมีเบอร์ผู้ส่งด้วย (ขนส่งใช้ติดต่อตอนของตีกลับ)" }, { status: 400 });

  const { error } = await saveDealerSender(sb, uid, sender);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, ...(sender ? { sender } : {}) });
}
