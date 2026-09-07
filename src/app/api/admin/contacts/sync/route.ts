import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { syncContacts } from "@/lib/server/contacts-sync";

export const runtime = "nodejs";

/**
 * ซิงก์สมาชิกเว็บ + ลูกค้าจากออเดอร์ เข้าคลังผู้ติดต่อ — หน้าผู้ติดต่อเรียกเองตอนเปิด (?force=1 = ไม่สนช่วงพัก 2 นาที)
 * ใช้สิทธิ์ดูก็พอ เพราะเป็นงานที่ระบบทำให้เอง ไม่ใช่การแก้ข้อมูลโดยคน
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.viewAll");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    return NextResponse.json(await syncContacts(sb, { force }));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
