import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { bearerUser, loadClaim, saveClaim, withSignedPhotos } from "@/lib/server/claims-db";

export const runtime = "nodejs";

/** ลูกค้าตอบเพิ่มในเคลมของตัวเอง (ข้อความสนทนากับทีมงาน) */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const user = await bearerUser(sb, req);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { claimId?: string; text?: string } | null;
  const text = (body?.text ?? "").trim().slice(0, 2000);
  if (!body?.claimId || !text) return NextResponse.json({ error: "ไม่มีข้อความ" }, { status: 400 });

  const claim = await loadClaim(sb, body.claimId);
  if (!claim || claim.customerId !== user.id) return NextResponse.json({ error: "ไม่พบเคลมนี้ในบัญชีของคุณ" }, { status: 404 });

  claim.messages = [...(claim.messages ?? []), { by: "customer", text, at: new Date().toISOString() }];
  const { error } = await saveClaim(sb, claim);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, claim: await withSignedPhotos(sb, claim) });
}
