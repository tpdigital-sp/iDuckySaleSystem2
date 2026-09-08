import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentActor, requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";
import { withLog, type Order } from "@/lib/admin-data";
import { applySlipVerification } from "@/lib/server/slip-apply";
import { acquireSlipLock, assertSlipNotDuplicate, SlipDuplicateError, slipHashOf, type SlipOwner } from "@/lib/server/slip-dedupe";
import type { SupabaseClient } from "@supabase/supabase-js";

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
 * — ยิง SlipOK ตรวจเหมือนลูกค้าแนบเอง (8 ก.ย. 69): ผ่าน = ยืนยันรับเงินอัตโนมัติ + แจ้ง LINE/msVerify/ตัดสต๊อก
 *   ไม่ผ่าน/ระบบล่ม = เก็บผลไว้ให้ดู แล้วแอดมินตรวจยอดเองต่อ (fail-safe เหมือนเดิม)
 * ออเดอร์ที่ยืนยันเงินไปแล้ว (แนบหลักฐานย้อนหลัง) → ตรวจแล้วเก็บผลอย่างเดียว ไม่แตะสถานะ/ยอด
 *
 * กันสลิปซ้ำ (slip-dedupe.ts): ไฟล์เดิม/เลขอ้างอิงเดิมที่ออเดอร์อื่นหรืองวดอื่นใช้อยู่ → 409 พร้อม duplicate:true
 * แอดมินยืนยันว่าเป็นสลิปโอนรวมหลายออเดอร์ได้ด้วย form field force=1 (ลง log ว่าใครยืนยัน + ซ้ำกับใบไหน)
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
  // force=1 = แอดมินยืนยันแล้วว่าสลิปใบนี้จ่ายรวมหลายออเดอร์ — ข้ามการกันซ้ำ (ยังบันทึกไว้ในประวัติ)
  const force = String(form.get("force") ?? "") === "1";
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
  if (phase === "balance" && !order.deposit)
    return NextResponse.json({ error: "ออเดอร์นี้ไม่ได้เปิดโหมดมัดจำ" }, { status: 409 });

  // ── กันคำขอซ้อน: ออเดอร์เดียวกันรับสลิปทีละคำขอ ──
  const release = acquireSlipLock(orderId);
  if (!release) return NextResponse.json({ error: "กำลังบันทึกสลิปของออเดอร์นี้อยู่ — รอสักครู่" }, { status: 429 });
  try {
    return await attachSlip({ sb, req, who: actor.name?.trim() || actor.username, order, file, ext, balance: phase === "balance", force });
  } finally {
    release();
  }
}

async function attachSlip(a: { sb: SupabaseClient; req: Request; who: string; order: Order; file: File; ext: string; balance: boolean; force: boolean }) {
  const { sb, req, who, order, file, ext, balance, force } = a;
  const orderId = order.id;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = slipHashOf(bytes);
  const self: SlipOwner = { orderId, phase: balance ? "balance" : "first" };

  // ── กันสลิปซ้ำชั้นที่ 1: ลายนิ้วมือไฟล์ (ก่อนอัปโหลด/ก่อนเสียโควตา SlipOK) ──
  const curHash = balance ? order.deposit?.balanceSlipHash : order.slipHash;
  if (curHash && curHash === hash)
    return NextResponse.json({ error: "สลิปใบนี้แนบไว้กับออเดอร์นี้อยู่แล้ว (ไฟล์เดิมเป๊ะ)", duplicate: true }, { status: 409 });
  let dupNote = "";
  try {
    await assertSlipNotDuplicate(sb, { hash }, self);
  } catch (e) {
    if (!(e instanceof SlipDuplicateError)) throw e;
    if (!force) return NextResponse.json({ error: e.message, duplicate: true, owners: e.owners }, { status: 409 });
    dupNote = ` · ⚠️ ยืนยันแนบทั้งที่ไฟล์ซ้ำกับ ${e.owners.map((o) => o.orderId).join(", ")} (โอนรวม)`;
  }
  if (!dupNote && force) dupNote = " · ⚠️ แอดมินยืนยันข้ามการกันสลิปซ้ำ (โอนรวม)";

  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `${safeId}/${randomUUID()}.${ext}`;
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  let { error: upErr } = await upload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "5MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const now = new Date().toISOString();

  // ลง log ว่าใครแนบก่อน แล้วค่อยให้ SlipOK ลงผลต่อท้าย (ประวัติอ่านเป็นลำดับ: แนบ → ตรวจ)
  const attached = withLog(order, who, balance ? "แนบสลิปยอดคงเหลือแทนลูกค้า" : "แนบสลิปแทนลูกค้า", `ไฟล์ ${file.name.slice(0, 60)}${dupNote}`);

  let updated: Order;
  let confirmed = false;
  try {
    ({ updated, confirmed } = await applySlipVerification({
      sb,
      order: attached,
      path,
      bytes,
      contentType: file.type,
      hash,
      // แอดมินยืนยันแล้วว่าเป็นสลิปโอนรวม → ไม่ตีตกเพราะเลขอ้างอิงซ้ำ
      allowDuplicate: force,
      balancePhase: balance,
      origin: new URL(req.url).origin,
      // แนบย้อนหลัง = คงเวลาแจ้งโอนเดิมไว้ (ถ้ามี)
      paidReportedAt: order.paidReportedAt ?? now,
    }));
  } catch (e) {
    // กันสลิปซ้ำชั้นที่ 2: เลขอ้างอิงธุรกรรมซ้ำกับออเดอร์อื่น — ไฟล์ถูกลบไปแล้วใน applySlipVerification
    // หน้าแอดมินถามยืนยัน แล้วส่งใหม่พร้อม force=1 ได้ถ้าเป็นโอนรวมจริง
    if (e instanceof SlipDuplicateError) return NextResponse.json({ error: e.message, duplicate: true, owners: e.owners }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกสลิปไม่สำเร็จ" }, { status: 500 });
  }

  // ส่ง signed URL กลับไปให้หน้าออเดอร์แสดงรูปได้ทันที (ไม่ได้เก็บลงฐาน)
  const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  return NextResponse.json({
    ok: true,
    verified: confirmed,
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
      // ล้าง balanceSlipHash ด้วย — ไม่งั้นแนบใบเดิมกลับมาจะโดนกันซ้ำทั้งที่ลบไปแล้ว
      { ...order, deposit: { ...order.deposit, balanceSlipPath: undefined, balanceSlipHash: undefined, balanceSlipUrl: undefined, balanceReportedAt: undefined, balanceVerify: undefined } },
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
      slipHash: undefined, // ล้างลายนิ้วมือด้วย — ให้แนบใบเดิมกลับมาได้หลังลบ
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
