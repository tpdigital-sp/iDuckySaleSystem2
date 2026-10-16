import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * 📌 ผูกรูปที่ "อัปล่วงหน้า" เข้ากับแบบจริง (16 ต.ค. 69 เจ้าของร้านแจ้ง "กดใส่ตะกร้าแล้วอัปโหลดนานมาก")
 *
 * จอออกแบบอัปรูปต้นฉบับทันทีที่ลูกค้าใส่รูป (ระหว่างยังจัดแบบอยู่) ไว้ที่ customer-artwork/art-pre/<วันที่>/
 * ตอนกด "ใช้แบบนี้/ใส่ตะกร้า" หน้าเว็บส่ง path มาที่นี่ → ย้ายเข้า art/<เดือน>/ (ชื่อไฟล์เดิม) แล้วคืน url ใหม่
 * ที่ไม่ถูกย้าย (ลูกค้าปิดจอ/ลบรูป) cron cleanup-images กวาดทิ้งหลัง 3 วัน
 *
 * ลูกค้าทั่วไปเรียกได้ (เหมือน /api/orders/artwork/sign) — รับเฉพาะ path รูปแบบ art-pre/วันที่/uuid.ext เท่านั้น
 * ย้ายได้แค่ภายใน bucket นี้ ไม่ลบ/ไม่เขียนทับอะไร (uuid ไม่ชนกัน)
 */
const BUCKET = "customer-artwork";
const PRE = /^art-pre\/(\d{4}-\d{2}-\d{2})\/([0-9a-f-]{36})\.(jpg|png|webp)$/;
const MAX = 60;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = Array.isArray(body?.paths) ? body!.paths.filter((p): p is string => typeof p === "string").slice(0, MAX) : [];
  if (!paths.length) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });
  const month = new Date().toISOString().slice(0, 7);
  const items = await Promise.all(
    [...new Set(paths)].map(async (from) => {
      const m = PRE.exec(from);
      if (!m) return { from, error: "ไม่ใช่รูปที่อัปล่วงหน้า" };
      const to = `art/${month}/${m[2]}.${m[3]}`;
      const { error } = await sb.storage.from(BUCKET).move(from, to);
      if (error) return { from, error: error.message };
      return { from, path: to, url: sb.storage.from(BUCKET).getPublicUrl(to).data.publicUrl };
    }),
  );
  return NextResponse.json({ ok: true, items });
}
