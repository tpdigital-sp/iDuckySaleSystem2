import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentActor, requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";
import { withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

const BUCKET = "payment-slips-private";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * แอดมินแนบสลิปแทนลูกค้า (ลูกค้าส่งมาทางแชท/ไลน์ หรือจ่ายช่องทางอื่นแล้วมีหลักฐาน)
 * — ไม่ยิง SlipOK และไม่เปลี่ยนสถานะให้เอง แค่ผูกไฟล์กับออเดอร์ + ลง log ว่าใครแนบ
 * คนเปลี่ยนสถานะยังเป็นแอดมินเอง (ผ่านหน้าออเดอร์) เพื่อให้ยังมีคนรับผิดชอบการตรวจยอด
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  // ต้องเป็นคนที่ดูแลเรื่องเงินของออเดอร์ได้ — ฝ่ายแพ็ค/คอนเทนต์แนบไม่ได้
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const actor = gate.actor;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }
  const orderId = String(form.get("orderId") ?? "").trim();
  // "balance" = สลิปงวดหลังของออเดอร์มัดจำ (เก็บคนละช่องกับสลิปงวดแรก)
  const phase = String(form.get("phase") ?? "") === "balance" ? "balance" : "first";
  const file = form.get("file");
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์สลิป" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะ PNG / JPG / WEBP / GIF" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5MB" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (order.status === "ยกเลิก") return NextResponse.json({ error: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 409 });

  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `${safeId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  let { error: upErr } = await upload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "5MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const who = actor.name?.trim() || actor.username;
  const now = new Date().toISOString();
  const balance = phase === "balance" && !!order.deposit;
  if (phase === "balance" && !order.deposit)
    return NextResponse.json({ error: "ออเดอร์นี้ไม่ได้เปิดโหมดมัดจำ" }, { status: 409 });

  const updated = withLog(
    balance
      ? { ...order, deposit: { ...order.deposit!, balanceSlipPath: path, balanceReportedAt: now, balanceVerify: undefined } }
      : {
          ...order,
          slipPath: path,
          slipUrl: undefined, // ห้ามเก็บ signed URL ลงฐาน — เซ็นใหม่ทุกครั้งที่ดึง
          slipVerify: undefined, // แอดมินแนบเอง = ไม่มีผลตรวจอัตโนมัติ
          paidReportedAt: order.paidReportedAt ?? now,
        },
    who,
    balance ? "แนบสลิปยอดคงเหลือแทนลูกค้า" : "แนบสลิปแทนลูกค้า",
    `ไฟล์ ${file.name.slice(0, 60)}`
  );
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ส่ง signed URL กลับไปให้หน้าออเดอร์แสดงรูปได้ทันที (ไม่ได้เก็บลงฐาน)
  const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  return NextResponse.json({
    ok: true,
    order: balance
      ? { ...updated, deposit: { ...updated.deposit!, balanceSlipUrl: signed?.signedUrl } }
      : { ...updated, slipUrl: signed?.signedUrl },
  });
}

/**
 * ลบสลิปออกจากออเดอร์ (ใช้ตอนสลิปผิดใบ/ทดสอบ) — เฉพาะ "ผู้ดูแลระบบ" เท่านั้น
 * รีเซ็ตการแจ้งโอนทั้งหมด → ออเดอร์กลับเป็น "รอชำระเงิน" ให้ลูกค้าแนบใหม่ได้
 */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (actor.role !== ROLE_ADMINISTRATOR)
    return NextResponse.json({ error: "ลบสลิปได้เฉพาะผู้ดูแลระบบ" }, { status: 403 });

  let body: { orderId?: string; phase?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  const balancePhase = body.phase === "balance";

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;

  // ── สลิป "งวดหลัง" ของออเดอร์มัดจำ — ลบเฉพาะไฟล์ใบนั้น ไม่ยุ่งกับสถานะ/ยอดที่รับแล้ว ──
  if (balancePhase) {
    if (!order.deposit?.balanceSlipPath) return NextResponse.json({ error: "ออเดอร์นี้ไม่มีสลิปงวดหลัง" }, { status: 404 });
    await sb.storage.from(BUCKET).remove([order.deposit.balanceSlipPath]);
    const settled = !!order.deposit.settledAt;
    const cleaned = withLog(
      { ...order, deposit: { ...order.deposit, balanceSlipPath: undefined, balanceSlipUrl: undefined, balanceReportedAt: undefined, balanceVerify: undefined } },
      actor.name?.trim() || actor.username,
      "ลบสลิปงวดหลัง",
      settled ? "⚠️ ออเดอร์นี้ยืนยันรับครบแล้ว — ลบหลักฐานงวดหลังออก" : "ให้ลูกค้า/แอดมินแนบใหม่ได้"
    );
    const { error: e2 } = await sb.from("orders").update({ data: cleaned }).eq("id", orderId);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true, order: cleaned });
  }

  if (!order.slipPath && !order.slipUrl) return NextResponse.json({ error: "ออเดอร์นี้ไม่มีสลิป" }, { status: 404 });
  // กันลบสลิปงานที่เดินหน้าไปแล้ว — ลบได้เฉพาะช่วงตรวจเงิน
  if (order.status !== "รอตรวจสอบ" && order.status !== "ชำระแล้ว" && order.status !== "รอชำระเงิน")
    return NextResponse.json({ error: `ออเดอร์อยู่สถานะ "${order.status}" แล้ว — ลบสลิปไม่ได้` }, { status: 409 });

  // ลบไฟล์จริงใน bucket (best-effort — path เก่าบางออเดอร์อาจไม่มี)
  if (order.slipPath) await sb.storage.from(BUCKET).remove([order.slipPath]);

  const updated = withLog(
    {
      ...order,
      slipPath: undefined,
      slipUrl: undefined,
      slipVerify: undefined,
      paidReportedAt: undefined,
      paidTotal: undefined,
      status: "รอชำระเงิน",
    },
    actor.name?.trim() || actor.username,
    "ลบสลิป (รีเซ็ตการแจ้งโอน)",
    "ออเดอร์กลับเป็น รอชำระเงิน — ลูกค้าแนบสลิปใหม่ได้"
  );
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: updated });
}
