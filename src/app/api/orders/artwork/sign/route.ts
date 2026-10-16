import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { clientIp, rateLimited } from "@/lib/server/rate-limit";
import { currentActor } from "@/lib/server/require-perm";

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

// กันสแปม — 120 ตั๋ว/ชั่วโมง ต่อ IP (นับใน Firestore ข้ามอินสแตนซ์ · เดิม Map ในหน่วยความจำไม่เคยถึงเพดานบน Netlify)
const LIMIT = 120;

type SignOne = { ok: true; bucket: string; path: string; token: string; url: string } | { ok: false; error: string; status: number };

async function signOne(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, type: unknown, sizeRaw: unknown, pre = false): Promise<SignOne> {
  const ext = EXT[String(type ?? "")];
  if (!ext) return { ok: false, error: "รองรับเฉพาะไฟล์ JPG / PNG / WEBP", status: 400 };
  const size = Number(sizeRaw ?? 0);
  if (size > MAX_BYTES)
    return { ok: false, error: `ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024}MB — ถ้าไฟล์ใหญ่กว่านี้ให้แนบเป็นลิงก์ไฟล์แทน`, status: 400 };

  // 🕐 pre = อัปล่วงหน้าจากจอออกแบบ (ลูกค้าเพิ่งใส่รูป ยังไม่กดใช้แบบ · 16 ต.ค. 69) → art-pre/<วันที่>/
  //    ตอนกดใช้แบบ /api/orders/artwork/keep ย้ายเข้า art/ · ที่ไม่ได้ใช้ cron cleanup-images กวาดทิ้งใน 3 วัน
  const iso = new Date().toISOString();
  const path = pre ? `art-pre/${iso.slice(0, 10)}/${randomUUID()}.${ext}` : `art/${iso.slice(0, 7)}/${randomUUID()}.${ext}`;
  const sign = () => sb.storage.from(BUCKET).createSignedUploadUrl(path);

  let { data, error } = await sign();
  if (error && /bucket not found/i.test(error.message)) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: `${MAX_BYTES}` });
    ({ data, error } = await sign());
  }
  if (error || !data?.token) return { ok: false, error: error?.message ?? "ขอตั๋วอัปโหลดไม่สำเร็จ", status: 500 };
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, bucket: BUCKET, path, token: data.token, url: pub.publicUrl };
}

/** ขอตั๋วทีละชุดได้สูงสุดเท่านี้ (ปฏิทิน 26 หน้า + ต้นฉบับ 26 รูป) */
const MAX_BATCH = 60;

/**
 * POST { type, size }            → { ok, bucket, path, token, url }          (ทีละไฟล์ — แบบเดิม)
 * POST { files: [{type,size}] }  → { ok, items: [{ok,bucket,path,token,url} | {ok:false,error}] }
 *   🚀 ทีละชุด (15 ต.ค. 69): จอสร้างปฏิทินอัป 16–52 ไฟล์ต่อครั้ง · เดิมขอตั๋วทีละไฟล์ ~0.6 วิ/ใบ = ช้ากว่าตัวอัปเอง
 *   เพดานกันสแปมนับตามจำนวนไฟล์เท่าเดิม
 *   + pre: true = อัปล่วงหน้าเก็บที่ art-pre/ (ดู signOne · 16 ต.ค. 69)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { type?: string; size?: number; files?: { type?: string; size?: number }[]; pre?: boolean } | null;
  const batch = Array.isArray(body?.files) ? body!.files.slice(0, MAX_BATCH) : null;
  if (batch && !batch.length) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });

  const ip = clientIp(req);
  // พนักงานหลังบ้านที่ล็อกอิน (แก้แบบปฏิทินให้ลูกค้า 16–52 ไฟล์ต่อรอบ) ไม่นับเพดาน — เพดานมีไว้กันสแปมจากคนนอก (15 ต.ค. 69)
  if (!(await currentActor()) && (await rateLimited(`artwork-sign:${ip}`, LIMIT, 3600_000, batch?.length ?? 1)))
    return NextResponse.json({ error: "อัปโหลดถี่เกินไป ลองใหม่ในอีกสักครู่" }, { status: 429 });

  if (batch) {
    const items = await Promise.all(batch.map((f) => signOne(sb, f?.type, f?.size, body?.pre === true)));
    return NextResponse.json({ ok: true, items: items.map((r) => (r.ok ? r : { ok: false, error: r.error })) });
  }
  const r = await signOne(sb, body?.type, body?.size);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
