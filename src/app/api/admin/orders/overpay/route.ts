import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderBalance, orderTotal, withLog, type Order, type OrderPayment, type OverpayAction } from "@/lib/admin-data";
import { newPaymentId, overpayOutstanding, paymentEntries } from "@/lib/payments";
import { acceptPaymentManually } from "@/lib/server/slip-apply";
import { acquireSlipLock } from "@/lib/server/slip-dedupe";
import { signPaymentUrls } from "@/lib/server/slip-sign";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

/**
 * 💸 จัดการเงินโอนเกิน (3 ต.ค. 69 · เคสต้นเรื่อง OD-260929-3229 ↔ OD-260929-2180)
 *
 * เดิมระบบแค่จดว่า "โอนเกิน" แล้วไม่มีทางบอกว่าคืนแล้ว/เอาไปใช้กับใบไหน → ป้ายค้างตลอด เสี่ยงคืนเงินซ้ำ
 * และเคสโอนรวมหลายออเดอร์ต้องแนบสลิปเดิมซ้ำที่ใบที่สอง (ข้ามด่านกันซ้ำ) แล้วกดรับยอดเอง
 *
 *   GET  ?orderId=          → ยอดค้างจัดการ + ออเดอร์อื่นของลูกค้าคนเดียวกันที่ยังค้างชำระ (ตัวเลือกปลายทาง)
 *   POST multipart          → kind=refund  : amount · note? · file? (สลิปที่ร้านโอนคืน)
 *                             kind=transfer: amount · toOrderId · note?
 *
 * transfer = สร้าง "ใบเพิ่ม" ในใบปลายทาง (fromOrder · ชี้สลิปของใบต้นทาง) แล้วนับยอดผ่าน acceptPaymentManually
 * (ครบแล้วยืนยันงวด/แจ้งลูกค้า/ตัดสต๊อกเหมือนรับยอดเอง) · เรคอร์ด msVerify ติดหมายเหตุ "ย้ายมาจาก OD-… ไม่มีเงินเข้าใหม่"
 * สิทธิ์เดียวกับ "ยืนยันเงินเข้า" (orders.markPaid)
 */

const BUCKET = "payment-slips-private";
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const round2 = (n: number) => Math.round(n * 100) / 100;
const thb = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

async function loadOrder(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, id: string): Promise<Order | null> {
  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  return (data?.data as Order | undefined) ?? null;
}

/** ออเดอร์อื่นของลูกค้าคนเดียวกันที่ยังค้างชำระ — customerId / contactId / เบอร์ */
async function candidatesFor(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, o: Order) {
  const clauses: string[] = [];
  const safe = (s: string | undefined) => (s && /^[A-Za-z0-9-]{4,64}$/.test(s) ? s : null);
  const cid = safe(o.customerId);
  const kid = safe(o.contactId);
  const phone = (o.phone ?? "").replace(/\D/g, "");
  if (cid) clauses.push(`data->>customerId.eq.${cid}`);
  if (kid) clauses.push(`data->>contactId.eq.${kid}`);
  if (phone.length >= 9) clauses.push(`data->>phone.eq.${phone}`);
  if (!clauses.length) return [];
  const { data } = await sb.from("orders").select("data").or(clauses.join(",")).limit(60);
  return (data ?? [])
    .map((r) => r.data as Order)
    .filter((x) => x.id !== o.id && x.status !== "ยกเลิก" && orderBalance(x) > 0.5)
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 12)
    .map((x) => ({ id: x.id, status: x.status, customer: x.customer, total: orderTotal(x), balance: round2(orderBalance(x)) }));
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.markPaid");
  if (gate.res) return gate.res;
  const id = new URL(req.url).searchParams.get("orderId")?.trim() ?? "";
  const order = id ? await loadOrder(sb, id) : null;
  if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  return NextResponse.json({ outstanding: overpayOutstanding(order), candidates: await candidatesFor(sb, order) });
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.markPaid");
  if (gate.res) return gate.res;
  const who = gate.actor.name?.trim() || gate.actor.username;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = String(form.get("orderId") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  const amount = round2(Number(form.get("amount")) || 0);
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || undefined;
  if (!orderId || (kind !== "refund" && kind !== "transfer")) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  if (!(amount > 0)) return NextResponse.json({ error: "ยอดต้องมากกว่า 0" }, { status: 400 });

  const toOrderId = kind === "transfer" ? String(form.get("toOrderId") ?? "").trim().toUpperCase() : "";
  if (kind === "transfer" && !toOrderId) return NextResponse.json({ error: "เลือกออเดอร์ปลายทาง" }, { status: 400 });
  if (toOrderId === orderId) return NextResponse.json({ error: "ออเดอร์ปลายทางต้องเป็นคนละใบ" }, { status: 400 });

  const release = acquireSlipLock(orderId);
  if (!release) return NextResponse.json({ error: "กำลังบันทึกเรื่องเงินของออเดอร์นี้อยู่ — รอสักครู่" }, { status: 429 });
  const releaseTo = toOrderId ? acquireSlipLock(toOrderId) : () => undefined;
  if (!releaseTo) {
    release();
    return NextResponse.json({ error: `กำลังบันทึกเรื่องเงินของ ${toOrderId} อยู่ — รอสักครู่` }, { status: 429 });
  }
  try {
    const order = await loadOrder(sb, orderId);
    if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
    const left = overpayOutstanding(order);
    if (amount > left + 0.005)
      return NextResponse.json({ error: `เงินโอนเกินที่ยังไม่ได้จัดการเหลือ ${thb(left)} บาท — ใส่เกินนี้ไม่ได้` }, { status: 409 });

    const now = new Date().toISOString();
    const action: OverpayAction = { id: newPaymentId(), at: now, by: who, kind, amount, ...(note ? { note } : {}) };

    if (kind === "refund") {
      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        const ext = EXT[file.type];
        if (!ext) return NextResponse.json({ error: "สลิปรองรับเฉพาะ PNG / JPG / WEBP / GIF" }, { status: 400 });
        if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5MB" }, { status: 400 });
        const path = `${orderId.replace(/[^a-z0-9_-]/gi, "") || "misc"}/refund-${randomUUID()}.${ext}`;
        const { error: upErr } = await sb.storage
          .from(BUCKET)
          .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
        action.slipPath = path;
      }
      const updated = withLog(
        { ...order, overpayActions: [...(order.overpayActions ?? []), action] },
        who,
        "💸 คืนเงินโอนเกินให้ลูกค้าแล้ว",
        `ยอด ${thb(amount)} บาท${action.slipPath ? " · แนบสลิปที่ร้านโอนคืน" : " · ไม่มีสลิปแนบ"}${note ? ` · ${note}` : ""}` +
          ` · เหลือโอนเกินที่ยังไม่จัดการ ${thb(round2(left - amount))} บาท`
      );
      const { error } = await updateOrder(sb, updated);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, updated) });
    }

    // ── transfer: นับเป็นยอดชำระของออเดอร์ปลายทาง ──
    const target = await loadOrder(sb, toOrderId);
    if (!target) return NextResponse.json({ error: `ไม่พบออเดอร์ ${toOrderId}` }, { status: 404 });
    if (target.status === "ยกเลิก") return NextResponse.json({ error: `${toOrderId} ถูกยกเลิกแล้ว` }, { status: 409 });
    const due = round2(orderBalance(target));
    if (due <= 0.5) return NextResponse.json({ error: `${toOrderId} ไม่มียอดค้างชำระแล้ว — ย้ายเงินไปไม่ได้` }, { status: 409 });
    if (amount > due + 0.005)
      return NextResponse.json({ error: `${toOrderId} ค้างชำระแค่ ${thb(due)} บาท — ย้ายเกินยอดค้างไม่ได้` }, { status: 409 });

    // สลิปหลักฐาน = ใบของต้นทางที่มีเงินโอนเกิน (ใบล่าสุดที่ SlipOK อ่านยอดได้) — ใบปลายทางเปิดดูได้ว่าเงินมาจากไหน
    const src = [...paymentEntries(order)].reverse().find((e) => e.path && (e.verify?.over ?? 0) > 0) ??
      [...paymentEntries(order)].reverse().find((e) => e.path);
    const pay: OrderPayment = {
      id: newPaymentId(),
      path: src?.path ?? "",
      at: now,
      by: who,
      expected: due,
      fromOrder: order.id,
    };
    const credited = await acceptPaymentManually({
      sb,
      order: { ...target, payments: [...(target.payments ?? []), pay] },
      paymentId: pay.id,
      amount,
      who,
      origin: new URL(req.url).origin,
      moved: { fromOrderId: order.id },
    });
    void credited;

    action.toOrderId = toOrderId;
    action.toPaymentId = pay.id;
    const updated = withLog(
      { ...order, overpayActions: [...(order.overpayActions ?? []), action] },
      who,
      `💸 ย้ายเงินโอนเกินไปใช้กับ ${toOrderId}`,
      `ยอด ${thb(amount)} บาท (ลูกค้าโอนรวม)${note ? ` · ${note}` : ""} · เหลือโอนเกินที่ยังไม่จัดการ ${thb(round2(left - amount))} บาท`
    );
    const { error } = await updateOrder(sb, updated);
    if (error)
      return NextResponse.json(
        { error: `นับยอดเข้า ${toOrderId} แล้ว แต่บันทึกฝั่งใบนี้ไม่สำเร็จ: ${error.message} — แจ้งผู้ดูแลระบบ` },
        { status: 500 }
      );
    return NextResponse.json({ ok: true, order: await signPaymentUrls(sb, updated) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 409 });
  } finally {
    release();
    releaseTo();
  }
}
