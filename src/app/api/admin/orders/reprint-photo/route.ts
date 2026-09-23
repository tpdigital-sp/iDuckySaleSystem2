import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderPrintCount, withLog, type Order, type ReprintPhoto } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

// เก็บรวม bucket เดียวกับรูปแบบงาน/ภาพก่อนปิดกล่อง (public) — ภาพใบงานที่ฉีกทิ้งไม่ใช่ข้อมูลอ่อนไหว
const BUCKET = "order-proofs";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** ใครปริ้นได้ก็แนบภาพฉีกใบเก่าได้ — ชุดสิทธิ์เดียวกับ /api/admin/orders/printed */
const PRINT_PERMS = ["pack.ship", "orders.edit", "proof.manage", "pack.check"] as const;

/**
 * ♻️🖨 แนบภาพ "ฉีกใบเก่าทิ้งแล้ว" ก่อนปริ้นซ้ำ — เจ้าของร้านสั่ง 23 ก.ย. 69
 *
 * ปัญหาต้นเรื่อง: ใบงานเก่าที่ปริ้นไปแล้วยังลอยอยู่ในไลน์ผลิต พอปริ้นใบใหม่ทับ ของออกสองรอบ
 * กติกา: ปริ้นซ้ำ = ต้องฉีกใบเก่าทิ้งก่อน แล้วถ่ายรูปใบที่ฉีกแล้วแนบ ถึงจะกดพิมพ์ได้
 *   - ภาพ 1 ใบ ปลดล็อกปริ้นซ้ำได้ 1 รอบ (printed route ประทับ usedAt ตอนใช้)
 *   - printedBefore = ปริ้นไปแล้วกี่ครั้งตอนถ่าย — ภาพจากรอบก่อนหน้าใช้ซ้ำไม่ได้ (ดู reprintUnlock)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm([...PRINT_PERMS]);
  if (gate.res) return gate.res;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }
  const orderId = String(form.get("orderId") ?? "").trim();
  const file = form.get("file");
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์รูป" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะ PNG / JPG / WEBP" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;

  const printed = orderPrintCount(order);
  if (printed === 0)
    return NextResponse.json({ error: "ใบนี้ยังไม่เคยปริ้น — ไม่ต้องแนบภาพฉีกใบเก่า" }, { status: 400 });

  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `reprint/${safeId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  let { error: upErr } = await upload();
  if (upErr && /bucket not found|related resource does not exist/i.test(upErr.message)) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "10MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const by = gate.actor.name?.trim() || gate.actor.username;
  const photo: ReprintPhoto = { url: pub.publicUrl, path, by, at: new Date().toISOString(), printedBefore: printed };
  const updated = withLog(
    { ...order, reprintPhotos: [...(order.reprintPhotos ?? []), photo] },
    by,
    "♻️🖨 ยืนยันฉีกใบเก่าทิ้งแล้ว — แนบภาพก่อนปริ้นซ้ำ",
    `ใบนี้ปริ้นไปแล้ว ${printed} ครั้ง · ปลดล็อกปริ้นซ้ำครั้งที่ ${printed + 1}`
  );

  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: updated });
}

/** ลบภาพที่ถ่ายผิด/ถ่ายซ้ำ — ลบได้เฉพาะภาพที่ยังไม่ถูกใช้ปลดล็อก (ภาพที่ใช้แล้วคือหลักฐาน ห้ามลบ) */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm([...PRINT_PERMS]);
  if (gate.res) return gate.res;

  let body: { orderId?: string; index?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  const index = Number(body.index);
  if (!orderId || !Number.isInteger(index) || index < 0)
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  const target = order.reprintPhotos?.[index];
  if (!target) return NextResponse.json({ error: "ไม่พบภาพรูปนี้" }, { status: 404 });
  if (target.usedAt) return NextResponse.json({ error: "ภาพนี้ใช้ยืนยันปริ้นซ้ำไปแล้ว — ลบไม่ได้" }, { status: 409 });

  if (target.path) await sb.storage.from(BUCKET).remove([target.path]); // best-effort
  const photos = (order.reprintPhotos ?? []).filter((_, i) => i !== index);
  const by = gate.actor.name?.trim() || gate.actor.username;
  const updated = withLog(
    { ...order, reprintPhotos: photos.length ? photos : undefined },
    by,
    "ลบภาพฉีกใบเก่าทิ้ง (ถ่ายผิด/ถ่ายซ้ำ)",
    `เหลือ ${photos.length} รูป`
  );
  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: updated });
}
