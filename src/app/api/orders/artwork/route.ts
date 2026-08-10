import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * ลูกค้า/แอดมิน อัปโหลด "ภาพลาย" ที่หน้าสินค้า/หน้าสั่งงานพิเศษ (ยังไม่มีเลขออเดอร์ตอนอัป)
 *
 * ⚠️ เก็บไฟล์ตามต้นฉบับที่ส่งมา — ไม่ย่อ ไม่บีบอัดซ้ำ (ไฟล์ที่ได้ = ไฟล์ที่ลูกค้าเลือก)
 * แต่ภาพที่มาจากแชท/มือถือมักถูกบีบมาตั้งแต่ต้นทางแล้ว หน้าเว็บจึงกำกับไว้ว่าใช้เป็นแนวทางให้กราฟฟิก
 * และแนะนำให้แนบลิงก์ไฟล์ต้นฉบับคู่กันเสมอ
 */
const BUCKET = "customer-artwork";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_BYTES = 15 * 1024 * 1024;

// กันสแปม endpoint สาธารณะแบบเบา ๆ (ต่อ IP ต่อชั่วโมง) — รีเซ็ตเมื่อ process ใหม่ พอสำหรับกันยิงรัว
// ⚠️ โหมดออกแบบบนเว็บใช้ 2 ไฟล์ต่อลาย (ภาพที่ประกอบแล้ว + ต้นฉบับ) ลูกค้าที่สั่งหลายลาย
//    และแก้แบบไปมาจะกินโควตาเร็วมาก — 40 เดิมตันได้จริง เลยขยับเป็น 120
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

  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (overLimit(ip)) return NextResponse.json({ error: "อัปโหลดถี่เกินไป ลองใหม่ในอีกสักครู่" }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์รูป" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะไฟล์ JPG / PNG / WEBP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024}MB — ถ้าไฟล์ใหญ่กว่านี้ให้แนบเป็นลิงก์ไฟล์แทน` }, { status: 400 });

  const path = `art/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer()); // ต้นฉบับล้วน — ไม่แปลงไฟล์
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });

  let { error } = await upload();
  if (error && /bucket not found/i.test(error.message)) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: `${MAX_BYTES}` });
    ({ error } = await upload());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, path, size: file.size, name: file.name });
}
