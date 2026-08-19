import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * ขอ "ตั๋วอัปโหลด" (signed upload url) ให้เบราว์เซอร์ยิงไฟล์ขึ้น Supabase Storage ตรง ๆ
 *
 * ⚠️ ทำไมต้องมีเส้นนี้ — ทั้งที่มี /api/orders/artwork อยู่แล้ว:
 *    Netlify Functions จำกัด "ขนาด body ของ request" ไว้ ~6MB (นับแบบ base64 = ไฟล์จริงราว 4.5MB)
 *    รูปจากมือถือรุ่นใหม่ 12-48MP ไฟล์ละ 4-10MB ทะลุเพดานนี้ประจำ → Netlify ตอบกลับเป็นหน้า error
 *    ที่ไม่ใช่ JSON → หน้าเว็บอ่านไม่ออก เลยขึ้นแค่ "อัปโหลดไม่สำเร็จ" ลอย ๆ (บั๊กที่ลูกค้าเจอบนมือถือ)
 *
 *    ทางนี้ไฟล์ไม่ผ่านเซิร์ฟเวอร์เราเลย เบราว์เซอร์ยิงเข้า Supabase โดยตรง — ไม่ติดเพดาน
 *    ได้ไฟล์ต้นฉบับเต็ม ๆ ตามนโยบาย และเร็วกว่าเดิมด้วย (ไม่ต้องเด้งผ่าน function)
 */
const BUCKET = "customer-artwork";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_BYTES = 15 * 1024 * 1024;

// กันสแปมแบบเดียวกับเส้นอัปโหลดเดิม (ต่อ IP ต่อชั่วโมง)
const hits = new Map<string, { n: number; until: number }>();
const LIMIT = 120;
function overLimit(ip: string): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now > cur.until) {
    hits.set(ip, { n: 1, until: now + 3600_000 });
    return false;
  }
  cur.n += 1;
  return cur.n > LIMIT;
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  if (overLimit(ip)) return NextResponse.json({ error: "อัปโหลดถี่เกินไป ลองใหม่ในอีกสักครู่" }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { type?: string; size?: number } | null;
  const ext = EXT[String(body?.type ?? "")];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะไฟล์ JPG / PNG / WEBP" }, { status: 400 });
  const size = Number(body?.size ?? 0);
  if (size > MAX_BYTES)
    return NextResponse.json(
      { error: `ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024}MB — ถ้าไฟล์ใหญ่กว่านี้ให้แนบเป็นลิงก์ไฟล์แทน` },
      { status: 400 },
    );

  const path = `art/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const sign = () => sb.storage.from(BUCKET).createSignedUploadUrl(path);

  let { data, error } = await sign();
  if (error && /bucket not found/i.test(error.message)) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: `${MAX_BYTES}` });
    ({ data, error } = await sign());
  }
  if (error || !data?.token) return NextResponse.json({ error: error?.message ?? "ขอตั๋วอัปโหลดไม่สำเร็จ" }, { status: 500 });

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, bucket: BUCKET, path, token: data.token, url: pub.publicUrl });
}
