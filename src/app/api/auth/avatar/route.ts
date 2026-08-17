import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * ลูกค้าเปลี่ยนรูปโปรไฟล์จากหน้าบัญชี (/account)
 * — ยืนยันตัวตนด้วย access token · เก็บรูปในบัคเก็ต customer-artwork/avatar/<uid> (ทับของเดิม)
 *   แล้วบันทึก URL ลง user_metadata.picture (ช่องเดียวกับที่ LINE login เติมให้)
 * ฝั่งเว็บย่อรูปให้เหลือ ~512px ก่อนส่ง (รูปโปรไฟล์ไม่ต้องใช้ต้นฉบับ)
 */
const BUCKET = "customer-artwork";
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u.user) return NextResponse.json({ error: "เซสชันหมดอายุ" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์รูป" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะไฟล์ JPG / PNG / WEBP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 3MB" }, { status: 400 });

  // ชื่อไฟล์คงที่ต่อคน + upsert = เปลี่ยนรูปกี่ครั้งก็ไม่กองไฟล์เก่า · ต่อ ?v= กัน cache เดิมค้าง
  const path = `avatar/${u.user.id}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: true });
  let { error } = await upload();
  if (error && /bucket not found/i.test(error.message)) {
    await sb.storage.createBucket(BUCKET, { public: true });
    ({ error } = await upload());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = `${sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error: metaErr } = await sb.auth.admin.updateUserById(u.user.id, {
    user_metadata: { ...(u.user.user_metadata ?? {}), picture: url },
  });
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}

/** ลบรูปโปรไฟล์ — ล้าง user_metadata.picture (ไฟล์ใน storage ปล่อยไว้ อัปใหม่จะทับเอง) */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u.user) return NextResponse.json({ error: "เซสชันหมดอายุ" }, { status: 401 });
  const { error } = await sb.auth.admin.updateUserById(u.user.id, {
    user_metadata: { ...(u.user.user_metadata ?? {}), picture: "" },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
