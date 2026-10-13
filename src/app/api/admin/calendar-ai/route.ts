import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentActor } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isFirebaseAdminConfigured } from "@/lib/server/firebase-admin";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";

export const runtime = "nodejs";

/**
 * 🗂 อัปไฟล์ .ai แยกเลเยอร์ของปฏิทินที่ออกแบบบนเว็บ — เฉพาะเจ้าของร้าน (ช่วงทดสอบ · ผู้ใช้สั่ง 13 ต.ค. 69)
 * ทางอัปของลูกค้า (/api/orders/artwork) รับแค่รูป ไม่เปิดให้ไฟล์ .ai ทั่วไป — แยกทางนี้ไว้ ปิดง่ายตอนเลิกทดสอบ
 * เก็บใน bucket design-templates/calendar-ai/ (bucket เดียวกับไฟล์เทมเพลต .ai)
 */
const BUCKET = "design-templates";
const MAX = 50 * 1024 * 1024;

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (isFirebaseAdminConfigured && actor.role !== ROLE_ADMINISTRATOR) return NextResponse.json({ error: "เฉพาะเจ้าของร้าน" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });
  // .ai แยกเลเยอร์ · .pdf ชิ้นงาน (โปรแกรมจัดวาง 8002) — ข้างในเป็น PDF ทั้งคู่
  const ext = /\.(ai|pdf|zip)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (!ext) return NextResponse.json({ error: "รับเฉพาะไฟล์ .ai / .pdf / .zip" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 50MB" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  // .ai = PDF ข้างใน — กันไฟล์อื่นแอบตั้งนามสกุล
  // .ai/.pdf ข้างในเป็น PDF · .zip (คละลาย ลายละไฟล์) ขึ้นต้น PK — กันไฟล์อื่นแอบตั้งนามสกุล
  const magic = String.fromCharCode(...bytes.subarray(0, 5));
  if (ext === "zip" ? !magic.startsWith("PK") : magic !== "%PDF-") return NextResponse.json({ error: "ชนิดไฟล์ไม่ตรงนามสกุล" }, { status: 400 });
  const path = `calendar-ai/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: ext === "pdf" ? "application/pdf" : ext === "zip" ? "application/zip" : "application/postscript", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
