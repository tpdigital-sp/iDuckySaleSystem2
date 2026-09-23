import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderFullyPaid, orderPrintCount, pendingSampleRound, printBlockers, proofBlockerLabel, reprintUnlock, sampleLabelOk, withLog, type Order, type OrderStatus } from "@/lib/admin-data";
import { notifyCustomerLogged, orderLink, statusFlex } from "@/lib/server/notify";
import { updateOrder } from "@/lib/server/order-write";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";

export const runtime = "nodejs";

/** ชื่อเอกสารที่หน้าปริ้นส่งมา */
const DOC_LABEL: Record<string, string> = {
  work: "ใบงาน + ใบปะหน้า",
  box: "ใบแปะหน้ากล่อง",
  receipt: "ใบเสร็จ",
};

/**
 * สถานะที่ยัง "ไม่ถึงขั้นผลิต" — ปริ้นใบงาน/ใบปะหน้าเมื่อไหร่ = ของเข้าไลน์ผลิตแล้ว
 * เลยเลื่อนให้เป็น "กำลังผลิต" อัตโนมัติ (ผ่านขั้นนี้ไปแล้วไม่ย้อนกลับ)
 */
const BEFORE_PRODUCTION: OrderStatus[] = [
  "รอชำระเงิน",
  "รอตรวจสอบ",
  "ชำระแล้ว",
  "รอตรวจแบบ",
  "แก้ไขแบบ",
  "อนุมัติแบบ",
];

/**
 * 🖨 บันทึกว่า "ปริ้นแล้ว" — เรียกทุกครั้งที่กดพิมพ์ รวมปริ้นซ้ำ
 *
 * - ครั้งแรก: ตั้ง printedAt (ล็อกที่อยู่ฝั่งลูกค้า ไม่ให้แก้หลังใบปะหน้าออกไปแล้ว)
 * - ทุกครั้ง (รวมซ้ำ): +1 printCount · อัปเดต lastPrintedAt · ลงประวัติว่าใครปริ้น เอกสารอะไร ครั้งที่เท่าไร
 *   ปริ้นซ้ำต้องเห็นในประวัติเสมอ — ของออกสองรอบมักเริ่มจากตรงนี้
 *
 * ♻️ ด่านปริ้นซ้ำ (23 ก.ย. 69): ครั้งที่ 2 ขึ้นไปต้องมีภาพ "ฉีกใบเก่าทิ้งแล้ว" ที่ยังไม่ถูกใช้ (reprintUnlock) ไม่งั้น 409 reprint:true
 *   ภาพแนบผ่าน /api/admin/orders/reprint-photo · ใช้แล้วประทับ usedAt — ปริ้นซ้ำรอบหน้าต้องถ่ายใหม่
 *
 * ⛔ ด่านแบบไม่ครบ (18 ก.ย. 69 · OD-260916-4693): ใบงานปริ้นไม่ได้ถ้ายังมีรายการขาดแบบ/ลูกค้ายังไม่อนุมัติ (proofBlockers) → 409 blockers[]
 *   ปลดล็อก = ส่ง partial:true (ต้องมีสิทธิ์ orders.edit) → "ปริ้นเฉพาะที่พร้อม": จด partialPrint + ล็อกที่อยู่ + ลงประวัติ
 *   แต่ไม่นับ printCount · ไม่เลื่อนเป็นกำลังผลิต · ไม่แจ้งลูกค้า — ใบยังอยู่กองรอปริ้น รอปริ้นเต็มใบเมื่อแบบครบ
 *   ใบเสร็จ/ใบแปะหน้ากล่องอย่างเดียว ไม่ติดด่านนี้
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  /**
   * ใครปริ้นใบงานได้ต้องบันทึกได้ — เดิมล็อกแค่ pack.ship ทั้งที่หน้าปริ้นเปิดให้ทุกคนที่ดูออเดอร์ได้
   * กราฟฟิก/หัวหน้า (ไม่มี pack.ship) ปริ้นแล้วโดน 403 เงียบ ๆ → printedAt ไม่ตั้ง สถานะไม่เลื่อนเป็นกำลังผลิต
   * ทั้งที่หน้าจอคนปริ้นโชว์ว่าเลื่อนแล้ว (11 ก.ย. 69)
   */
  const gate = await requirePerm(["pack.ship", "orders.edit", "proof.manage", "pack.check"]);
  if (gate.res) return gate.res;

  let body: { orderId?: string; docs?: string[]; partial?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "ไม่พบออเดอร์" }, { status: 404 });

  const order = row.data as Order;
  const now = new Date().toISOString();

  const blockers = (body.docs ?? []).includes("work") ? printBlockers(order) : [];
  if (blockers.length) {
    const waiting = blockers.map(proofBlockerLabel);
    if (!body.partial)
      return NextResponse.json(
        { ok: false, error: `แบบงานยังไม่ครบ — ${waiting.join(" · ")}`, blockers: waiting },
        { status: 409 }
      );
    if (!can(gate.actor, "orders.edit", await loadRolePerms()))
      return NextResponse.json({ ok: false, error: "ปลดล็อกปริ้นเฉพาะที่พร้อมได้เฉพาะคนที่มีสิทธิ์แก้ไขออเดอร์" }, { status: 403 });
    const by = gate.actor.name || gate.actor.username;
    const partial = withLog(
      { ...order, printedAt: order.printedAt ?? now, printCount: order.printCount ?? (order.printedAt ? 1 : 0), partialPrint: { by, at: now, waiting } },
      by,
      "⛔🖨 ปลดล็อกปริ้นเฉพาะรายการที่พร้อม — แบบยังไม่ครบ",
      `ห้ามผลิต: ${waiting.join(" · ")}`
    );
    const { error: pErr } = await updateOrder(sb, partial);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, partial: true, printCount: partial.printCount });
  }

  const count = orderPrintCount(order) + 1;
  const first = count === 1;
  const what = (body.docs ?? []).map((d) => DOC_LABEL[d] ?? d).filter(Boolean).join(" + ") || "ใบงาน";

  /**
   * ♻️🖨 ด่านปริ้นซ้ำ (เจ้าของร้านสั่ง 23 ก.ย. 69) — ใบเก่าที่ยังลอยอยู่ในไลน์ผลิตคือต้นเหตุ "ของออกสองรอบ"
   * ปริ้นซ้ำต้องฉีกใบเก่าทิ้งก่อนแล้วถ่ายรูปแนบ (/api/admin/orders/reprint-photo) → ที่นี่ถึงปล่อยผ่าน
   * ไม่มีภาพ = 409 reprint:true — หน้าปริ้นเด้ง popup ให้ถ่ายรูปก่อน
   */
  const unlock = first ? undefined : reprintUnlock(order);
  if (!first && !unlock)
    return NextResponse.json(
      {
        ok: false,
        reprint: true,
        printCount: count - 1,
        error: `ใบนี้ปริ้นไปแล้ว ${count - 1} ครั้ง — ต้องฉีกใบเก่าทิ้งแล้วถ่ายรูปแนบก่อน ถึงจะปริ้นซ้ำได้`,
      },
      { status: 409 }
    );

  /**
   * ปริ้น "ใบงาน + ใบปะหน้า" (ใบที่มีที่อยู่จัดส่ง) = งานเข้าไลน์ผลิตแล้ว → เลื่อนเป็นกำลังผลิต
   * ใบปะหน้าออกได้เฉพาะตอนเก็บเงินครบ จึงเช็คซ้ำอีกชั้นกันเลื่อนสถานะทั้งที่ที่อยู่ยังไม่ออก
   */
  const startsProduction =
    (body.docs ?? []).includes("work") && orderFullyPaid(order) && BEFORE_PRODUCTION.includes(order.status);

  let updated = withLog(
    {
      ...order,
      // printedAt ตั้งครั้งเดียวตอนแรก — เป็นตัวล็อกที่อยู่ ห้ามขยับตามการปริ้นซ้ำ
      printedAt: order.printedAt ?? now,
      printCount: count,
      lastPrintedAt: now,
      lastPrintedBy: gate.actor.name || gate.actor.username,
      partialPrint: undefined, // แบบครบแล้วปริ้นเต็มใบ — ป้าย "ปริ้นบางส่วน" หมดหน้าที่
      // ภาพฉีกใบเก่าใบนี้ถูกใช้ปลดล็อกรอบนี้แล้ว — รอบหน้าต้องถ่ายใหม่
      ...(unlock ? { reprintPhotos: (order.reprintPhotos ?? []).map((p) => (p === unlock ? { ...p, usedAt: now } : p)) } : {}),
      ...(startsProduction ? { status: "กำลังผลิต" as OrderStatus } : {}),
    },
    gate.actor.name || gate.actor.username,
    first ? "🖨 ปริ้นเอกสาร — ล็อกที่อยู่จัดส่ง" : `🖨 ปริ้นซ้ำ (ครั้งที่ ${count})`,
    unlock ? `${what} · ♻️ ฉีกใบเก่าทิ้งแล้ว (ภาพยืนยันโดย ${unlock.by})` : what
  );
  if (startsProduction)
    updated = withLog(
      updated,
      gate.actor.name || gate.actor.username,
      "เริ่มผลิตอัตโนมัติ — ปริ้นใบงาน/ใบปะหน้าแล้ว",
      `${order.status} → กำลังผลิต`
    );

  /**
   * 🎁➗ ใบมัดจำที่พิมพ์ใบปะหน้ารอบตัวอย่าง (เก็บเงินยังไม่ครบ) = พิมพ์ได้ครั้งเดียว → จดไว้ที่รอบนั้น ใบปะหน้าล็อกกลับทันที
   * พิมพ์ซ้ำต้องให้เจ้าของร้านกด 🔁 อนุญาตในหน้าออเดอร์ (เจ้าของร้านทัก 16 ก.ย. 69)
   */
  const samplePending = pendingSampleRound(order);
  if ((body.docs ?? []).includes("work") && !orderFullyPaid(order) && sampleLabelOk(order) && samplePending) {
    const by = gate.actor.name || gate.actor.username;
    updated = withLog(
      {
        ...updated,
        shipPlan: (updated.shipPlan ?? []).map((r, i) => (i === samplePending.index ? { ...r, samplePrintedAt: { by, at: now } } : r)),
      },
      by,
      "🖨 พิมพ์ใบปะหน้ารอบตัวอย่างแล้ว — ใบปะหน้าล็อกกลับ",
      `รอบที่ ${samplePending.index + 1} · พิมพ์ซ้ำต้องให้เจ้าของร้านกด 🔁 อนุญาตพิมพ์ซ้ำ`
    );
  }

  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /**
   * สถานะเปลี่ยนตรงนี้ก็ต้องแจ้งลูกค้าเหมือนแอดมินกดเปลี่ยนเอง
   * (ไม่งั้นใบที่เข้าผลิตด้วยการปริ้น ลูกค้าจะไม่ได้ข่าวเลย)
   * "กำลังผลิต" = ข่าวคืบหน้า → importance "extra" ตามกติกาเดิม (คนที่เลือกรับเฉพาะเรื่องสำคัญจะไม่โดน)
   */
  if (startsProduction) {
    const link = orderLink(new URL(req.url).origin, updated);
    await notifyCustomerLogged(sb, updated, statusFlex(updated, link), 'แจ้งสถานะ "กำลังผลิต" (ปริ้นใบงาน)', "extra");
  }

  return NextResponse.json({ ok: true, printCount: count, reprint: !first });
}
