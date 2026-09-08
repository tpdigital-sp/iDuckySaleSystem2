import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";
import { applySlipVerification } from "@/lib/server/slip-apply";
import { acquireSlipLock, SlipDuplicateError } from "@/lib/server/slip-dedupe";

export const runtime = "nodejs";

const BUCKET = "payment-slips-private";
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/**
 * 🔄 ตรวจสลิปใบเดิมกับ SlipOK อีกครั้ง — ปุ่ม "ตรวจสลิปอีกครั้ง" ในหน้าออเดอร์
 *
 * ทำไมต้องมี: ลูกค้ามักแนบสลิปทันทีหลังโอน (ห่างกันไม่ถึง 1-2 นาที) ธนาคารยังไม่ส่งข้อมูลรายการเข้าระบบตรวจกลาง
 * SlipOK เลยตอบ 1010 แล้วผลค้างเป็น "ไม่ผ่าน" ทั้งที่รอสักครู่ก็ตรวจได้ — ให้แอดมินกดยิงซ้ำโดยไม่ต้องลบ/แนบใหม่
 *
 * กติกา: ใช้ไฟล์เดิมจากบัคเก็ต (ไม่รับไฟล์ใหม่) · ผ่าน = ยืนยันรับเงิน/แจ้ง LINE/msVerify เหมือนตรวจรอบแรกทุกอย่าง
 * (applySlipVerification ตัวเดียวกัน) · ห้ามยิงซ้ำสลิปที่ผ่านแล้ว (เปลืองโควตาและอาจโดน SlipOK ตอบว่าซ้ำ)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const who = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; phase?: string };
  const orderId = String(body.orderId ?? "").trim();
  const balance = body.phase === "balance";
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (order.status === "ยกเลิก") return NextResponse.json({ error: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 409 });

  const path = balance ? order.deposit?.balanceSlipPath : order.slipPath;
  const hash = balance ? order.deposit?.balanceSlipHash : order.slipHash;
  const cur = balance ? order.deposit?.balanceVerify : order.slipVerify;
  if (!path) return NextResponse.json({ error: "ออเดอร์นี้ยังไม่มีสลิปให้ตรวจ" }, { status: 409 });
  if (cur?.status === "pass") return NextResponse.json({ error: "สลิปใบนี้ตรวจผ่านไปแล้ว ไม่ต้องตรวจซ้ำ" }, { status: 409 });

  const release = acquireSlipLock(orderId);
  if (!release) return NextResponse.json({ error: "กำลังตรวจสลิปของออเดอร์นี้อยู่ — รอสักครู่" }, { status: 429 });
  try {
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(path);
    if (dlErr || !blob) return NextResponse.json({ error: `อ่านไฟล์สลิปไม่ได้ (${dlErr?.message ?? "ไม่พบไฟล์"})` }, { status: 500 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const contentType = blob.type && blob.type !== "application/octet-stream" ? blob.type : MIME[ext] ?? "image/jpeg";

    // ลงประวัติว่าใครกดตรวจซ้ำ ก่อนให้ SlipOK ลงผลต่อท้าย
    const attached = withLog(order, who, balance ? "ตรวจสลิปยอดคงเหลืออีกครั้ง" : "ตรวจสลิปอีกครั้ง", cur?.detail ? `รอบก่อน: ${cur.detail.slice(0, 120)}` : "");

    let updated: Order;
    let confirmed = false;
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
        balancePhase: balance,
        origin: new URL(req.url).origin,
        paidReportedAt: order.paidReportedAt,
        recheck: true,
      });
      ({ updated, confirmed } = r);
      verifyDetail = r.verify.detail;
      verifyStatus = r.verify.status;
    } catch (e) {
      if (e instanceof SlipDuplicateError) return NextResponse.json({ error: e.message, duplicate: true, owners: e.owners }, { status: 409 });
      return NextResponse.json({ error: e instanceof Error ? e.message : "ตรวจสลิปไม่สำเร็จ" }, { status: 500 });
    }

    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
    return NextResponse.json({
      ok: true,
      verified: confirmed,
      status: verifyStatus,
      detail: verifyDetail,
      order: balance
        ? { ...updated, deposit: { ...updated.deposit!, balanceSlipUrl: signed?.signedUrl } }
        : { ...updated, slipUrl: signed?.signedUrl },
    });
  } finally {
    release();
  }
}
