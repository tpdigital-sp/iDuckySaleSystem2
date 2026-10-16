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
// .ai ปฏิทินรูปเต็มจาก Illustrator ~180 MB (14 ต.ค. 69) — ทางตั๋วอัปตรงเข้า Supabase รับถึงเพดานนี้
// (เพดานจริงอยู่ที่ Upload file size limit ของโปรเจกต์ Supabase · ทาง multipart ผ่าน Netlify ยังติด ~6 MB)
const MAX = 500 * 1024 * 1024;
/**
 * ⚠️ ไฟล์สำรอง "-pdf.ai" (PDF-.ai แยกชั้นเป็น OCG — Illustrator เปิดแล้วรวมเป็น Layer 1) เกิดเมื่อเครื่องที่สั่งต่อ Illustrator ไม่ได้
 * เช่น สั่งจากมือถือ (OD-261016-6709 · 16 ต.ค. 69) · เดิมตั้งชื่อเก็บเป็น UUID ล้วน ท้าย -pdf หาย → หน้าออเดอร์เรียก ".ai เลเยอร์" ทั้งที่ไม่แยก
 * → คงท้าย -pdf ไว้ในชื่อที่เก็บ หน้าออเดอร์จะรู้ (isFlatCalAi) แล้วเสนอปุ่มทำใหม่ด้วย Illustrator ในเครื่องร้าน
 */
const flatSuffix = (name: string) => (/-pdf\.ai$/i.test(name) ? "-pdf" : "");

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (isFirebaseAdminConfigured && actor.role !== ROLE_ADMINISTRATOR) return NextResponse.json({ error: "เฉพาะเจ้าของร้าน" }, { status: 403 });

  /**
   * 🎫 ตั๋วอัปโหลดตรงเข้า Supabase (JSON {name,size}) — ไฟล์ .pdf ทั้งเล่ม/.ai มีรูปทุกหน้า 10–40MB
   * เกินเพดาน body ของ Netlify Functions (~6MB) → ส่งผ่าน route นี้แล้วตกเงียบ (14 ต.ค. 69) · ทางเดิม multipart ยังใช้ได้กับไฟล์เล็ก
   */
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { name?: string; size?: number } | null;
    const ext = /\.(ai|pdf|zip)$/i.exec(String(body?.name ?? ""))?.[1]?.toLowerCase();
    if (!ext) return NextResponse.json({ error: "รับเฉพาะไฟล์ .ai / .pdf / .zip" }, { status: 400 });
    if (Number(body?.size ?? 0) > MAX) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 500MB" }, { status: 400 });
    const path = `calendar-ai/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${flatSuffix(String(body?.name ?? ""))}.${ext}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) return NextResponse.json({ error: error?.message ?? "ขอตั๋วอัปโหลดไม่สำเร็จ" }, { status: 500 });
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, bucket: BUCKET, path, token: data.token, url: pub.publicUrl });
  }

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
  if (file.size > MAX) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 500MB" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  // .ai = PDF ข้างใน — กันไฟล์อื่นแอบตั้งนามสกุล
  // .ai/.pdf ข้างในเป็น PDF · .zip (คละลาย ลายละไฟล์) ขึ้นต้น PK — กันไฟล์อื่นแอบตั้งนามสกุล
  const magic = String.fromCharCode(...bytes.subarray(0, 5));
  if (ext === "zip" ? !magic.startsWith("PK") : magic !== "%PDF-") return NextResponse.json({ error: "ชนิดไฟล์ไม่ตรงนามสกุล" }, { status: 400 });
  const path = `calendar-ai/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${flatSuffix(file.name)}.${ext}`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: ext === "pdf" ? "application/pdf" : ext === "zip" ? "application/zip" : "application/postscript", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
