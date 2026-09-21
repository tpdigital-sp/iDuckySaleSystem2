import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { signClaimUpload } from "@/lib/server/claims-db";

export const runtime = "nodejs";

/** ตั๋วอัปโหลดรูปประกอบเคลม (ฝั่งทีมงาน — รูปที่ลูกค้าส่งมาทาง LINE แล้วแอดมินวางลงฟอร์ม ➕ บันทึกเคลม) */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { type?: string; size?: number } | null;
  const r = await signClaimUpload(sb, String(body?.type ?? ""), Number(body?.size ?? 0));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, bucket: r.bucket, path: r.path, token: r.token });
}
