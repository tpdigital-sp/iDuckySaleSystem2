import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

/**
 * ✏️ เก็บ "ข้อมูลแบบ" ที่ลูกค้าทำในจอสร้างปฏิทิน (JSON: รูปแบบงาน · เลย์เอาต์ · ข้อความ · ลิงก์รูปต้นฉบับที่อัปแล้ว)
 * ไว้กับออเดอร์ — หลังบ้านเปิดแบบเดิมกลับมาแก้ได้ (ผู้ใช้ขอ 15 ต.ค. 69) · เดิมแบบอยู่แค่ localStorage เครื่องลูกค้า
 *
 * ลูกค้าทั่วไปเรียกได้ (เหมือน /api/orders/artwork) — รับเฉพาะ JSON ที่หน้าตาเป็นแบบปฏิทิน · ไม่เกิน 512KB
 * เก็บใน bucket design-templates/cal-design/ (public) — ไม่มีข้อมูลส่วนตัว (ไม่มีชื่อ/ที่อยู่) มีแค่ลิงก์รูปที่ลูกค้าอัปอยู่แล้ว
 */
const BUCKET = "design-templates";
const MAX = 512 * 1024;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const text = await req.text();
  if (!text || text.length > MAX) return NextResponse.json({ error: "ข้อมูลแบบใหญ่เกินไป" }, { status: 400 });
  let body: { v?: number; format?: unknown; design?: unknown; back?: unknown; sourceUrls?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ใช่ JSON" }, { status: 400 });
  }
  if (body?.v !== 1 || typeof body.format !== "string" || typeof body.design !== "object" || typeof body.back !== "object" || !Array.isArray(body.sourceUrls))
    return NextResponse.json({ error: "ไม่ใช่ข้อมูลแบบปฏิทิน" }, { status: 400 });
  const path = `cal-design/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.json`;
  const { error } = await sb.storage.from(BUCKET).upload(path, new TextEncoder().encode(text), { contentType: "application/json", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
}
