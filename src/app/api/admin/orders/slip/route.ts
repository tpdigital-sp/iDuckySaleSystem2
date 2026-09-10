import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentActor, requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";
import { orderTotal, paidSoFar, withLog, type Order } from "@/lib/admin-data";
import { findPayment, resolveSlipPhase, type SlipPhase } from "@/lib/payments";
import { acceptPaymentManually, applySlipVerification } from "@/lib/server/slip-apply";
import { acquireSlipLock, assertSlipNotDuplicate, SlipDuplicateError, slipHashOf, type SlipOwner } from "@/lib/server/slip-dedupe";
import { signPaymentUrls } from "@/lib/server/slip-sign";
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
 * — ยิง SlipOK ตรวจเหมือนลูกค้าแนบเอง (8 ก.ย. 69): ผ่าน = นับยอด/ยืนยันรับเงินอัตโนมัติ + แจ้ง LINE/msVerify/ตัดสต๊อก
 *   โอนขาด = รับบางส่วน · ไม่ผ่าน/ระบบล่ม = เก็บผลไว้ให้ดู แล้วแอดมินตรวจยอดเองต่อ (fail-safe เหมือนเดิม)
 * ออเดอร์ที่ยืนยันเงินครบไปแล้ว (แนบหลักฐานย้อนหลัง) → ตรวจแล้วเก็บผลอย่างเดียว ไม่แตะสถานะ/ยอด
 *
 * form: orderId · file · phase = "auto" (ค่าเริ่มต้น — ให้ resolveSlipPhase ตัดสินจากยอดค้าง) | "first" | "balance" | "extra"
 *       force=1 = แอดมินยืนยันว่าสลิปใบนี้จ่ายรวมหลายออเดอร์ — ข้ามการกันซ้ำ (ลง log ว่าใครยืนยัน + ซ้ำกับใบไหน)
 * "extra" = ใบเพิ่มใน order.payments[] (ใบที่ 2, 3, … ไม่จำกัด) · แนบย้อนหลังบนใบที่ครบแล้วก็ลง extra ได้ (เก็บหลักฐานอย่างเดียว)
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
  const phaseRaw = String(form.get("phase") ?? "auto");
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

  // ── ช่องที่จะลง: แอดมินระบุเองได้ · "auto" = ตามยอดค้าง · ไม่มียอดค้างแล้ว = ลงใบเพิ่มเป็นหลักฐาน (ไม่กระทบยอด) ──
  let phase: SlipPhase;
  if (phaseRaw === "first" || phaseRaw === "balance" || phaseRaw === "extra") phase = phaseRaw;
  else phase = resolveSlipPhase(order) ?? (order.slipPath || order.slipUrl ? "extra" : "first");
  if (phase === "balance" && !order.deposit) return NextResponse.json({ error: "ออเดอร์นี้ไม่ได้เปิดโหมดมัดจำ" }, { status: 409 });

  // ── กันคำขอซ้อน: ออเดอร์เดียวกันรับสลิปทีละคำขอ ──
  const release = acquireSlipLock(orderId);
  if (!release) return NextResponse.json({ error: "กำลังบันทึกสลิปของออเดอร์นี้อยู่ — รอสักครู่" }, { status: 429 });
  try {
    return await attachSlip({ sb, req, who: actor.name?.trim() || actor.username, order, file, ext, phase, force });
  } finally {
    release();
  }
}

async function attachSlip(a: { sb: SupabaseClient; req: Request; who: string; order: Order; file: File; ext: string; phase: SlipPhase; force: boolean }) {
  const { sb, req, who, order, file, ext, phase, force } = a;
  const orderId = order.id;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = slipHashOf(bytes);
  const self: SlipOwner = { orderId, phase };

  // ── กันสลิปซ้ำชั้นที่ 1: ลายนิ้วมือไฟล์ (ก่อนอัปโหลด/ก่อนเสียโควตา SlipOK) ──
  const known = [order.slipHash, order.deposit?.balanceSlipHash, ...(order.payments ?? []).map((p) => p.hash)].filter(Boolean);
  if (known.includes(hash))
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
  const what = phase === "balance" ? "แนบสลิปยอดคงเหลือแทนลูกค้า" : phase === "extra" ? "แนบสลิปใบเพิ่มแทนลูกค้า" : "แนบสลิปแทนลูกค้า";
  const attached = withLog(order, who, what, `ไฟล์ ${file.name.slice(0, 60)}${dupNote}`);

  let updated: Order;
  let confirmed = false;
  let partial = false;
  try {
    ({ updated, confirmed, partial } = await applySlipVerification({
      sb,
      order: attached,
      path,
      bytes,
      contentType: file.type,
      hash,
      // แอดมินยืนยันแล้วว่าเป็นสลิปโอนรวม → ไม่ตีตกเพราะเลขอ้างอิงซ้ำ
      allowDuplicate: force,
      phase,
      by: who,
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
  return NextResponse.json({ ok: true, verified: confirmed, partial, phase, order: await signPaymentUrls(sb, updated) });
}

/**
 * 💰 แอดมินรับยอดของ "สลิปใบเพิ่ม" เอง (SlipOK ตรวจไม่ได้/ตรวจตก แต่เทียบยอดกับธนาคารแล้ว)
 * body: { orderId, paymentId, amount } — ต้องมีสิทธิ์ยืนยันเงินเข้า (orders.markPaid) เหมือนกดเปลี่ยนเป็น "ชำระแล้ว"
 * นับยอดเข้า paidTotal · ครบ = ยืนยันงวด + แจ้งลูกค้า + msVerify (กติกาเดียวกับ SlipOK ผ่าน)
 */
export async function PUT(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.markPaid");
  if (gate.res) return gate.res;
  const who = gate.actor.name?.trim() || gate.actor.username;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; paymentId?: string; amount?: number };
  const orderId = String(body.orderId ?? "").trim();
  const paymentId = String(body.paymentId ?? "").trim();
  const amount = Number(body.amount);
  if (!orderId || !paymentId) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  if (!(amount > 0)) return NextResponse.json({ error: "ยอดต้องมากกว่า 0" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  if (order.status === "ยกเลิก") return NextResponse.json({ error: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (!findPayment(order, paymentId)) return NextResponse.json({ error: "ไม่พบสลิปใบเพิ่มนี้ในออเดอร์" }, { status: 404 });

  const release = acquireSlipLock(orderId);
  if (!release) return NextResponse.json({ error: "กำลังบันทึกสลิปของออเดอร์นี้อยู่ — รอสักครู่" }, { status: 429 });
  try {
    const updated = await acceptPaymentManually({ sb, order, paymentId, amount, who, origin: new URL(req.url).origin });
    return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, updated) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "รับยอดไม่สำเร็จ" }, { status: 409 });
  } finally {
    release();
  }
}

/**
 * ลบสลิปออกจากออเดอร์ (ใช้ตอนสลิปผิดใบ/ทดสอบ) — เฉพาะ "ผู้ดูแลระบบ" เท่านั้น
 * body: { orderId, phase?: "first" | "balance" | "extra", paymentId? }
 *   first (ค่าเริ่มต้น) = รีเซ็ตการแจ้งโอนทั้งหมด → ออเดอร์กลับเป็น "รอชำระเงิน" ให้ลูกค้าแนบใหม่ได้
 *   balance = ลบเฉพาะไฟล์งวดหลัง ไม่ยุ่งกับสถานะ/ยอดที่รับแล้ว
 *   extra = ลบใบเพิ่มใบเดียว — ถ้าใบนั้นนับยอดแล้ว ถอยยอดนั้นออกจาก paidTotal (สถานะไม่ถอย · แอดมินดูเองว่าต้องเก็บเพิ่มไหม)
 */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (actor.role !== ROLE_ADMINISTRATOR)
    return NextResponse.json({ error: "ลบสลิปได้เฉพาะผู้ดูแลระบบ" }, { status: 403 });

  let body: { orderId?: string; phase?: string; paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  const who = actor.name?.trim() || actor.username;

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;

  // ── ใบเพิ่ม: ลบใบเดียว + ถอยยอดที่ใบนั้นนับไว้ ──
  if (body.phase === "extra") {
    const paymentId = String(body.paymentId ?? "").trim();
    const p = findPayment(order, paymentId);
    if (!p) return NextResponse.json({ error: "ไม่พบสลิปใบเพิ่มนี้" }, { status: 404 });
    await sb.storage.from(BUCKET).remove([p.path]).catch(() => undefined);
    const credited = p.credited ?? 0;
    const paidAfter = credited > 0 ? Math.max(0, Math.round((paidSoFar(order) - credited) * 100) / 100) : order.paidTotal;
    const cleaned = withLog(
      { ...order, payments: (order.payments ?? []).filter((x) => x.id !== paymentId), paidTotal: paidAfter },
      who,
      "ลบสลิปใบเพิ่ม",
      credited > 0
        ? `⚠️ ใบนี้นับยอดไว้ ${credited.toLocaleString("th-TH")} บาท — ถอยออกแล้ว รับแล้วเหลือ ${(paidAfter ?? 0).toLocaleString("th-TH")} จาก ${orderTotal(order).toLocaleString("th-TH")} (สถานะไม่เปลี่ยน ตรวจยอดค้างเอง)`
        : "ใบนี้ยังไม่ได้นับยอด — ไม่กระทบยอดที่รับแล้ว"
    );
    const { error: e3 } = await sb.from("orders").update({ data: cleaned }).eq("id", orderId);
    if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
    return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, cleaned) });
  }

  // ── สลิป "งวดหลัง" ของออเดอร์มัดจำ — ลบเฉพาะไฟล์ใบนั้น ไม่ยุ่งกับสถานะ/ยอดที่รับแล้ว (ยกเว้นที่รับบางส่วนจากใบนี้) ──
  if (body.phase === "balance") {
    if (!order.deposit?.balanceSlipPath) return NextResponse.json({ error: "ออเดอร์นี้ไม่มีสลิปงวดหลัง" }, { status: 404 });
    await sb.storage.from(BUCKET).remove([order.deposit.balanceSlipPath]);
    const settled = !!order.deposit.settledAt;
    const credited = settled ? 0 : order.deposit.balanceVerify?.credited ?? 0;
    const cleaned = withLog(
      // ล้าง balanceSlipHash ด้วย — ไม่งั้นแนบใบเดิมกลับมาจะโดนกันซ้ำทั้งที่ลบไปแล้ว
      {
        ...order,
        deposit: { ...order.deposit, balanceSlipPath: undefined, balanceSlipHash: undefined, balanceSlipUrl: undefined, balanceReportedAt: undefined, balanceVerify: undefined },
        ...(credited > 0 ? { paidTotal: Math.max(0, Math.round((paidSoFar(order) - credited) * 100) / 100) } : {}),
      },
      who,
      "ลบสลิปงวดหลัง",
      settled
        ? "⚠️ ออเดอร์นี้ยืนยันรับครบแล้ว — ลบหลักฐานงวดหลังออก"
        : credited > 0
          ? `ใบนี้นับยอดบางส่วนไว้ ${credited.toLocaleString("th-TH")} บาท — ถอยออกแล้ว · ให้ลูกค้า/แอดมินแนบใหม่ได้`
          : "ให้ลูกค้า/แอดมินแนบใหม่ได้"
    );
    const { error: e2 } = await sb.from("orders").update({ data: cleaned }).eq("id", orderId);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, cleaned) });
  }

  if (!order.slipPath && !order.slipUrl) return NextResponse.json({ error: "ออเดอร์นี้ไม่มีสลิป" }, { status: 404 });
  // กันลบสลิปงานที่เดินหน้าไปแล้ว — ลบได้เฉพาะช่วงตรวจเงิน
  if (order.status !== "รอตรวจสอบ" && order.status !== "ชำระแล้ว" && order.status !== "รอชำระเงิน")
    return NextResponse.json({ error: `ออเดอร์อยู่สถานะ "${order.status}" แล้ว — ลบสลิปไม่ได้` }, { status: 409 });

  // ลบไฟล์จริงใน bucket (best-effort — path เก่าบางออเดอร์อาจไม่มี)
  if (order.slipPath) await sb.storage.from(BUCKET).remove([order.slipPath]);

  // ใบเพิ่มที่นับยอดไว้ยังอยู่ — ถอยเฉพาะยอดของใบแรก (ถ้ารับบางส่วนจากใบแรก) · ไม่มีใบเพิ่ม = รีเซ็ต paidTotal ทั้งก้อนเหมือนเดิม
  const extrasCredited = (order.payments ?? []).reduce((s, p) => s + (p.credited ?? 0), 0);
  const updated = withLog(
    {
      ...order,
      slipPath: undefined,
      slipHash: undefined, // ล้างลายนิ้วมือด้วย — ให้แนบใบเดิมกลับมาได้หลังลบ
      slipUrl: undefined,
      slipVerify: undefined,
      paidReportedAt: undefined,
      paidTotal: extrasCredited > 0 ? extrasCredited : undefined,
      status: "รอชำระเงิน",
    },
    who,
    "ลบสลิป (รีเซ็ตการแจ้งโอน)",
    extrasCredited > 0
      ? `ออเดอร์กลับเป็น รอชำระเงิน — ยังนับยอดจากสลิปใบเพิ่มไว้ ${extrasCredited.toLocaleString("th-TH")} บาท`
      : "ออเดอร์กลับเป็น รอชำระเงิน — ลูกค้าแนบสลิปใหม่ได้"
  );
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, updated) });
}
