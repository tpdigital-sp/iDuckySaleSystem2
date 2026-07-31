import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { proofsOf, withLog, type Order } from "@/lib/admin-data";
import { notifyCustomer, orderLink } from "@/lib/server/notify";

export const runtime = "nodejs";

const BUCKET = "order-proofs";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * กราฟฟิก/แอดมิน อัปโหลด "ภาพแบบงาน" (proof) ให้สินค้าแต่ละรายการในออเดอร์
 * → ตั้งสถานะรายการเป็น "รอตรวจ" + ออเดอร์เป็น "รอตรวจแบบ" + บันทึก log
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("proof.manage");
  if (gate.res) return gate.res;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }

  const orderId = String(form.get("orderId") ?? "").trim();
  const itemIndex = Number(form.get("itemIndex"));
  // มีค่า = "เปลี่ยนรูป" ทับตำแหน่งเดิม (กราฟฟิกแก้ตามคำขอลูกค้า) — ตำแหน่ง/เลขรูปไม่เลื่อน
  const rawReplace = form.get("replaceIndex");
  const replaceIndex = rawReplace === null ? null : Number(rawReplace);
  const file = form.get("file");
  const rawQty = Number(form.get("qty"));
  const proofQty = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty) : undefined;
  const proofNote = String(form.get("note") ?? "").trim() || undefined;
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!Number.isInteger(itemIndex) || itemIndex < 0) return NextResponse.json({ error: "ไม่ได้ระบุรายการสินค้า" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์รูปแบบงาน" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะ PNG / JPG / WEBP / GIF" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (!order.items?.[itemIndex]) return NextResponse.json({ error: "ไม่พบรายการสินค้านี้ในออเดอร์" }, { status: 404 });
  if (replaceIndex !== null && (!Number.isInteger(replaceIndex) || !proofsOf(order.items[itemIndex])[replaceIndex]))
    return NextResponse.json({ error: "ไม่พบรูปที่จะเปลี่ยน" }, { status: 404 });

  // อัปโหลดรูปแบบ (สร้าง bucket ให้อัตโนมัติถ้ายังไม่มี)
  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `${safeId}/${itemIndex}-${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });

  let { error: upErr } = await upload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "10MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const now = new Date().toISOString();

  let items: Order["items"];
  if (replaceIndex !== null) {
    // ── เปลี่ยนรูปทับตำแหน่งเดิม: ตำแหน่ง/จำนวน/รายละเอียดคงอยู่ · ผลตรวจ+ผลนับของรูปนั้นรีเซ็ต (รูปเปลี่ยนแล้วต้องตรวจใหม่) ──
    items = order.items.map((it, i) => {
      if (i !== itemIndex) return it;
      const proofs = proofsOf(it).map((p, j) =>
        j === replaceIndex
          ? { url: pub.publicUrl, at: now, ...(p.qty ? { qty: p.qty } : {}), ...(p.note ? { note: p.note } : {}) }
          : p
      );
      // สถานะรายการคิดใหม่จากผลตรวจรายรูป (ตรรกะเดียวกับตอนลูกค้าตรวจ)
      const anyEdit = proofs.some((p) => p.review === "ขอแก้ไข");
      const allOk = proofs.length > 0 && proofs.every((p) => p.review === "อนุมัติ");
      return {
        ...it,
        proofs,
        proofStatus: (anyEdit ? "ขอแก้ไข" : allOk ? "อนุมัติ" : "รอตรวจ") as typeof it.proofStatus,
        ...(anyEdit ? {} : { proofNote: undefined }), // ไม่มีรูปค้างแก้แล้ว → เคลียร์คอมเมนต์รวมของรายการ
        proofUpdatedAt: now,
      };
    });
  } else {
    const newProof = { url: pub.publicUrl, at: now, ...(proofQty ? { qty: proofQty } : {}), ...(proofNote ? { note: proofNote } : {}) };
    items = order.items.map((it, i) =>
      i === itemIndex
        ? {
            ...it,
            proofs: [...proofsOf(it), newProof], // เพิ่มรูป ไม่ทับของเดิม
            proofStatus: "รอตรวจ" as const,
            proofNote: undefined, // เคลียร์คอมเมนต์เก่าของลูกค้า เพราะส่งแบบใหม่ให้ตรวจแล้ว
            proofUpdatedAt: now,
          }
        : it
    );
  }

  // ยังมีรายการไหนค้างแก้อยู่ไหม → คุมสถานะออเดอร์ให้ตรงความจริง
  const anyEditLeft = items.some((it) => it.proofStatus === "ขอแก้ไข");
  const updated = withLog(
    { ...order, items, status: anyEditLeft ? ("แก้ไขแบบ" as const) : ("รอตรวจแบบ" as const) },
    gate.actor.name?.trim() || "กราฟฟิก", // บันทึกชื่อคนที่อัปโหลดจริง (fallback: กราฟฟิก)
    replaceIndex !== null ? "เปลี่ยนรูปแบบงาน (แก้ตามคำขอ)" : "อัปโหลดแบบให้ลูกค้าตรวจ",
    replaceIndex !== null
      ? `${order.items[itemIndex].name} · รูปที่ ${replaceIndex + 1}`
      : `${order.items[itemIndex].name}${proofQty ? ` · ${proofQty} ชิ้น` : ""}${proofNote ? ` · ${proofNote}` : ""}`
  );

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  // แจ้งเตือนลูกค้าว่ามีแบบงานให้ตรวจ (เงียบถ้ายังไม่ตั้งค่า LINE)
  const origin = new URL(req.url).origin;
  void notifyCustomer(
    sb,
    updated,
    replaceIndex !== null
      ? `🎨 รูปที่ ${replaceIndex + 1} ของออเดอร์ ${updated.id} แก้ไขเรียบร้อย พร้อมให้คุณตรวจอีกครั้ง\nดู/อนุมัติได้ที่: ${orderLink(origin, updated)}`
      : `🎨 แบบงานออเดอร์ ${updated.id} พร้อมให้คุณตรวจแล้ว\nดู/อนุมัติได้ที่: ${orderLink(origin, updated)}`
  );

  return NextResponse.json({ ok: true, order: updated });
}
