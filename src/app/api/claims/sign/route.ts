import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { bearerUser, CLAIM_BUCKET } from "@/lib/server/claims-db";

export const runtime = "nodejs";

/**
 * ตั๋วอัปโหลดรูปประกอบเคลม — เบราว์เซอร์ยิงไฟล์เข้า Supabase ตรง (เพดาน body ของ Netlify ~4.5MB จึงห้ามส่งผ่าน API)
 * ต่างจากภาพลายตรงที่ bucket นี้ "ส่วนตัว" — ไม่มี public URL, อ่านผ่าน signed url ที่ API เซ็นให้เท่านั้น
 */
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  // จำกัดเฉพาะลูกค้าที่ล็อกอิน (แน่นกว่าเส้นภาพลายที่เปิด public + กันด้วย IP)
  const user = await bearerUser(sb, req);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { type?: string; size?: number } | null;
  const ext = EXT[String(body?.type ?? "")];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะไฟล์ JPG / PNG / WEBP" }, { status: 400 });
  if (Number(body?.size ?? 0) > MAX_BYTES)
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024}MB` }, { status: 400 });

  const path = `claims/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const sign = () => sb.storage.from(CLAIM_BUCKET).createSignedUploadUrl(path);

  let { data, error } = await sign();
  if (error && /bucket not found/i.test(error.message)) {
    await sb.storage.createBucket(CLAIM_BUCKET, { public: false, fileSizeLimit: `${MAX_BYTES}` });
    ({ data, error } = await sign());
  }
  if (error || !data?.token) return NextResponse.json({ error: error?.message ?? "ขอตั๋วอัปโหลดไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ ok: true, bucket: CLAIM_BUCKET, path, token: data.token });
}
