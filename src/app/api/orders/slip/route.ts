import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

const BUCKET = "payment-slips";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * ลูกค้าแจ้งโอน (guest, public) → อัปโหลดรูปสลิปขึ้น Supabase Storage
 * แล้วผูกกับออเดอร์ + เปลี่ยนสถานะเป็น "รอตรวจสอบ" ให้แอดมินตรวจยอด
 *
 * ความปลอดภัย: อนุญาตแนบสลิปเฉพาะออเดอร์ที่ยัง "รอชำระเงิน/รอตรวจสอบ" เท่านั้น
 * (กันการเปลี่ยนออเดอร์ที่ยืนยันไปแล้ว) · path ใช้ UUID สุ่ม เดาไม่ได้
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }

  const orderId = String(form.get("orderId") ?? "").trim();
  const file = form.get("file");
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์สลิป" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะ PNG / JPG / WEBP / GIF" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5MB" }, { status: 400 });

  // ดึงออเดอร์ก่อน — ต้องมีอยู่จริง และยังไม่ถูกยืนยันการชำระ
  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (order.status !== "รอชำระเงิน" && order.status !== "รอตรวจสอบ")
    return NextResponse.json({ error: "ออเดอร์นี้ยืนยันการชำระเงินแล้ว ไม่ต้องแจ้งโอนซ้ำ" }, { status: 409 });

  // อัปโหลดสลิป (สร้าง bucket ให้อัตโนมัติถ้ายังไม่มี)
  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `${safeId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });

  let { error: upErr } = await upload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "5MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const updated: Order = { ...order, slipUrl: pub.publicUrl, paidReportedAt: new Date().toISOString(), status: "รอตรวจสอบ" };
  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, slipUrl: pub.publicUrl });
}
