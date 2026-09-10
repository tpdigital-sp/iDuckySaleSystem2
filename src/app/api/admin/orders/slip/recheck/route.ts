import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";
import { findPayment, type SlipPhase } from "@/lib/payments";
import { applySlipVerification } from "@/lib/server/slip-apply";
import { acquireSlipLock, SlipDuplicateError } from "@/lib/server/slip-dedupe";
import { signPaymentUrls } from "@/lib/server/slip-sign";

export const runtime = "nodejs";

const BUCKET = "payment-slips-private";
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/**
 * 🔄 ตรวจสลิปใบเดิมกับ SlipOK อีกครั้ง — ปุ่ม "ตรวจสลิปอีกครั้ง" ในหน้าออเดอร์
 *
 * ทำไมต้องมี: ลูกค้ามักแนบสลิปทันทีหลังโอน (ห่างกันไม่ถึง 1-2 นาที) ธนาคารยังไม่ส่งข้อมูลรายการเข้าระบบตรวจกลาง
 * SlipOK เลยตอบ 1010 แล้วผลค้างเป็น "ไม่ผ่าน" ทั้งที่รอสักครู่ก็ตรวจได้ — ให้แอดมินกดยิงซ้ำโดยไม่ต้องลบ/แนบใหม่
 *
 * กติกา: ใช้ไฟล์เดิมจากบัคเก็ต (ไม่รับไฟล์ใหม่) · ผ่าน = นับยอด/ยืนยันรับเงิน/แจ้ง LINE/msVerify เหมือนตรวจรอบแรกทุกอย่าง
 * (applySlipVerification ตัวเดียวกัน) · ห้ามยิงซ้ำสลิปที่ผ่านหรือนับยอดแล้ว (เปลืองโควตา + นับซ้ำ)
 * body: { orderId, phase: "first" | "balance" | "extra", paymentId? (extra) }
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const who = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; phase?: string; paymentId?: string };
  const orderId = String(body.orderId ?? "").trim();
  const phase: SlipPhase = body.phase === "balance" ? "balance" : body.phase === "extra" ? "extra" : "first";
  const paymentId = phase === "extra" ? String(body.paymentId ?? "").trim() : undefined;
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (phase === "extra" && !paymentId) return NextResponse.json({ error: "ไม่ได้ระบุสลิปใบเพิ่มที่จะตรวจ" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (order.status === "ยกเลิก") return NextResponse.json({ error: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 409 });

  const extra = paymentId ? findPayment(order, paymentId) : undefined;
  if (phase === "extra" && !extra) return NextResponse.json({ error: "ไม่พบสลิปใบเพิ่มนี้ในออเดอร์" }, { status: 404 });
  const path = phase === "balance" ? order.deposit?.balanceSlipPath : phase === "extra" ? extra!.path : order.slipPath;
  const hash = phase === "balance" ? order.deposit?.balanceSlipHash : phase === "extra" ? extra!.hash : order.slipHash;
  const cur = phase === "balance" ? order.deposit?.balanceVerify : phase === "extra" ? extra!.verify : order.slipVerify;
  if (!path) return NextResponse.json({ error: "ออเดอร์นี้ยังไม่มีสลิปให้ตรวจ" }, { status: 409 });
  if (cur?.status === "pass") return NextResponse.json({ error: "สลิปใบนี้ตรวจผ่านไปแล้ว ไม่ต้องตรวจซ้ำ" }, { status: 409 });
  if ((cur?.credited ?? 0) > 0 || (extra?.credited ?? 0) > 0)
    return NextResponse.json({ error: "สลิปใบนี้นับยอดเข้าออเดอร์ไปแล้ว — ตรวจซ้ำจะนับซ้ำ ไม่อนุญาต" }, { status: 409 });

  const release = acquireSlipLock(orderId);
  if (!release) return NextResponse.json({ error: "กำลังตรวจสลิปของออเดอร์นี้อยู่ — รอสักครู่" }, { status: 429 });
  try {
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(path);
    if (dlErr || !blob) return NextResponse.json({ error: `อ่านไฟล์สลิปไม่ได้ (${dlErr?.message ?? "ไม่พบไฟล์"})` }, { status: 500 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const contentType = blob.type && blob.type !== "application/octet-stream" ? blob.type : MIME[ext] ?? "image/jpeg";

    // ลงประวัติว่าใครกดตรวจซ้ำ ก่อนให้ SlipOK ลงผลต่อท้าย
    const label = phase === "balance" ? "ตรวจสลิปยอดคงเหลืออีกครั้ง" : phase === "extra" ? "ตรวจสลิปใบเพิ่มอีกครั้ง" : "ตรวจสลิปอีกครั้ง";
    const attached = withLog(order, who, label, cur?.detail ? `รอบก่อน: ${cur.detail.slice(0, 120)}` : "");

    let updated: Order;
    let confirmed = false;
    let partial = false;
    let verifyDetail: string | undefined;
    let verifyStatus: string | undefined;
    try {
      const r = await applySlipVerification({
        sb,
        order: attached,
        path,
        bytes,
        contentType,
        hash,
        phase,
        paymentId,
        by: who,
        origin: new URL(req.url).origin,
        paidReportedAt: order.paidReportedAt,
        recheck: true,
      });
      ({ updated, confirmed, partial } = r);
      verifyDetail = r.verify.detail;
      verifyStatus = r.verify.status;
    } catch (e) {
      if (e instanceof SlipDuplicateError) return NextResponse.json({ error: e.message, duplicate: true, owners: e.owners }, { status: 409 });
      return NextResponse.json({ error: e instanceof Error ? e.message : "ตรวจสลิปไม่สำเร็จ" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      verified: confirmed,
      partial,
      status: verifyStatus,
      detail: verifyDetail,
      order: await signPaymentUrls(sb, updated),
    });
  } finally {
    release();
  }
}
