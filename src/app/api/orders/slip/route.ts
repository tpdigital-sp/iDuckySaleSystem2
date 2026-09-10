import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { findPayment, paymentEntries, resolveSlipPhase } from "@/lib/payments";
import { applySlipVerification } from "@/lib/server/slip-apply";
import { acquireSlipLock, assertSlipNotDuplicate, SlipDuplicateError, slipHashOf, type SlipOwner } from "@/lib/server/slip-dedupe";

export const runtime = "nodejs";

// bucket ส่วนตัว — สลิปมีเลขบัญชี/ยอดเงินลูกค้า ห้ามเปิด public · แอดมินดูผ่าน signed URL เท่านั้น
const BUCKET = "payment-slips-private";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * ลูกค้าแจ้งโอน (guest, public) → อัปโหลดรูปสลิปขึ้น Supabase Storage แล้วผูกกับออเดอร์ + ตรวจ SlipOK
 *
 * 💸 แนบได้หลายใบ: ปุ่มเดียว ระบบตัดสินเองว่าใบนี้ลงช่องไหน (resolveSlipPhase — ใบแรก/ยอดคงเหลือ/ใบเพิ่ม)
 * รับเฉพาะเมื่อ "ยังมียอดค้าง" ไม่ว่าสถานะอะไร (โอนขาดแล้วโอนตาม · สั่งเพิ่ม · ค่าบริการเพิ่มระหว่างผลิต)
 * ออเดอร์ที่ครบแล้ว → 409 "ไม่มียอดค้าง" · path ใช้ UUID สุ่ม เดาไม่ได้
 *
 * กันสลิปซ้ำ (ดู lib/server/slip-dedupe.ts):
 *   - ล็อกต่อออเดอร์ — กดแจ้งโอนรัว ๆ ให้วิ่งทีละคำขอ (หน้าเว็บส่งหลายไฟล์ทีละใบต่อกันอยู่แล้ว)
 *   - ไฟล์เดิมเป๊ะ (SHA-256) ที่เคยแนบออเดอร์อื่น/ใบอื่น → ปฏิเสธก่อนอัปโหลด/ก่อนเสียโควตา SlipOK
 *   - ไฟล์เดิมของออเดอร์นี้เองที่ตรวจไปแล้ว → ไม่ตรวจซ้ำ (นับยอดแล้ว = ตอบผ่าน · ตกแล้ว = บอกว่ารอแอดมิน)
 *   - เลขอ้างอิงธุรกรรมที่ SlipOK อ่านได้ ซ้ำกับออเดอร์อื่น/ใบอื่น → applySlipVerification โยน 409 (ลบไฟล์ให้แล้ว)
 */
export async function POST(req: Request) {
  const release = await acquireSlipLockFrom(req);
  if (!release) return NextResponse.json({ error: "กำลังบันทึกสลิปของออเดอร์นี้อยู่ — รอสักครู่แล้วรีเฟรชดูสถานะ" }, { status: 429 });
  try {
    return await handle(req);
  } finally {
    release();
  }
}

/** อ่านเลขออเดอร์จากฟอร์มเพื่อจองล็อก — body อ่านซ้ำใน handle() ไม่ได้ (stream) เลย clone ก่อน */
async function acquireSlipLockFrom(req: Request): Promise<(() => void) | null> {
  const orderId = await req
    .clone()
    .formData()
    .then((f) => String(f.get("orderId") ?? "").trim())
    .catch(() => "");
  // ไม่มีเลขออเดอร์ = ปล่อยให้ handle() ตอบ 400 เอง (ไม่ต้องล็อก)
  return orderId ? acquireSlipLock(orderId) : () => undefined;
}

async function handle(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }

  const orderId = String(form.get("orderId") ?? "").trim();
  const key = String(form.get("key") ?? "");
  const file = form.get("file");
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์สลิป" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะ PNG / JPG / WEBP / GIF" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5MB" }, { status: 400 });

  // ดึงออเดอร์ก่อน — ต้องมีอยู่จริง และยังมียอดค้างให้รับ
  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  // ยืนยันสิทธิ์ด้วยกุญแจลับ — กันคนเดาเลขออเดอร์แล้วแนบสลิปมั่ว
  // (ออเดอร์เก่าก่อนมีระบบ key จะไม่มี order.key → ข้ามการเช็ค เพื่อ backward-compat)
  if (order.key && order.key !== key)
    return NextResponse.json({ error: "ลิงก์แจ้งโอนไม่ถูกต้อง (รหัสออเดอร์ไม่ตรง)" }, { status: 403 });
  if (order.status === "ยกเลิก") return NextResponse.json({ error: "ออเดอร์นี้ถูกยกเลิกแล้ว" }, { status: 409 });
  // ใบที่ออกบิล FlowAccount ชำระตามเอกสารนั้น — ไม่รับสลิปที่นี่ (หน้าเว็บซ่อนปุ่มไว้แล้ว)
  if (order.flowAccount && (order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ"))
    return NextResponse.json({ error: "ออเดอร์นี้ชำระตามเอกสาร FlowAccount — ไม่ต้องแนบสลิปที่นี่" }, { status: 409 });
  /**
   * 💬 ยังมีงานที่แอดมินต้องตีราคา → ยอดรวมยังไม่ครบ ห้ามรับสลิป
   * หน้าเว็บซ่อนเลขบัญชี/ปุ่มแนบสลิปไว้แล้ว อันนี้คือด่านฝั่งเซิร์ฟเวอร์ (หน้าเก่าค้างในเบราว์เซอร์ / ยิง API ตรง)
   * ออเดอร์เคลมตั้งใจให้ ฿0 — ไม่นับ
   */
  const pendingQuote = order.claimOf || order.claimReason ? [] : order.items.filter((i) => i.qty > 0 && i.unitPrice <= 0);
  if (pendingQuote.length)
    return NextResponse.json(
      {
        error: `ออเดอร์นี้ยังรอทางร้านตีราคา ${pendingQuote.length} รายการ — ยังโอนไม่ได้ครับ กรุณาส่งลิงก์ออเดอร์ให้แอดมินทางไลน์ก่อน`,
      },
      { status: 409 }
    );
  // ── ใบนี้ควรลงช่องไหน — null = ไม่มียอดค้าง (ครบแล้ว หรือระบบไม่รู้ยอดที่รับ → ให้ทักร้าน) ──
  const phase = resolveSlipPhase(order);
  if (!phase)
    return NextResponse.json(
      { error: "ออเดอร์นี้ไม่มียอดค้างให้แจ้งโอนแล้วครับ — ถ้าเพิ่งโอนเพิ่มตามที่ร้านแจ้ง กรุณาส่งสลิปให้แอดมินทางไลน์" },
      { status: 409 }
    );

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = slipHashOf(bytes);
  const self: SlipOwner = { orderId, phase };

  // ── ไฟล์เดิมของออเดอร์นี้ (ใบไหนก็ตาม) ที่ตรวจไปแล้ว → ไม่ต้องอัปโหลด/ตรวจซ้ำ ──
  const hashOf = (e: ReturnType<typeof paymentEntries>[number]) =>
    e.phase === "first" ? order.slipHash : e.phase === "balance" ? order.deposit?.balanceSlipHash : findPayment(order, e.paymentId ?? "")?.hash;
  const same = paymentEntries(order).find((e) => !!hash && hashOf(e) === hash);
  if (same) {
    if (same.state === "pass" || same.state === "partial" || same.state === "accepted")
      return NextResponse.json({ ok: true, verified: same.state === "pass", duplicateOfSelf: true });
    return NextResponse.json(
      { error: "สลิปใบนี้ส่งมาแล้ว กำลังรอแอดมินตรวจยอดอยู่ครับ — ไม่ต้องส่งซ้ำ ถ้าโอนใหม่ให้แนบสลิปใบใหม่", duplicate: true },
      { status: 409 }
    );
  }
  // ── ไฟล์เดิมเป๊ะที่เคยแนบออเดอร์อื่น → ตีตกก่อนเสียโควตา SlipOK ──
  try {
    await assertSlipNotDuplicate(sb, { hash }, self);
  } catch (e) {
    if (e instanceof SlipDuplicateError) return NextResponse.json({ error: e.message, duplicate: true, owners: e.owners }, { status: 409 });
    throw e;
  }

  // อัปโหลดสลิป (สร้าง bucket ให้อัตโนมัติถ้ายังไม่มี)
  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `${safeId}/${randomUUID()}.${ext}`;
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });

  let { error: upErr } = await upload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    // สร้างเป็น bucket ส่วนตัว (public: false) — เปิดได้เฉพาะผ่าน signed URL
    await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "5MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // ── ตรวจสลิปกับ SlipOK แล้วลงผล (ผ่าน = นับยอด/ยืนยันอัตโนมัติ · โอนขาด = รับบางส่วน) — กติกาเดียวกับแอดมินแนบแทน ──
  try {
    const r = await applySlipVerification({
      sb,
      order,
      path,
      bytes,
      contentType: file.type,
      hash,
      phase,
      origin: new URL(req.url).origin,
    });
    return NextResponse.json({ ok: true, verified: r.confirmed, partial: r.partial, phase, paymentId: r.paymentId });
  } catch (e) {
    // เลขอ้างอิงธุรกรรมซ้ำกับออเดอร์อื่น/ใบอื่น — ไฟล์ถูกลบไปแล้วใน applySlipVerification
    if (e instanceof SlipDuplicateError) return NextResponse.json({ error: e.message, duplicate: true, owners: e.owners }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกสลิปไม่สำเร็จ" }, { status: 500 });
  }
}
