import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { currentActor, requirePerm } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { notifyCustomer, orderLink } from "@/lib/server/notify";
import { packGate, proofsOf, withLog, type Order, type OrderStatus, type PackGate } from "@/lib/admin-data";

/** สรุปเหตุผลที่ด่านตรวจยังไม่ผ่าน (ไว้โชว์/ลง log) */
function gateReasons(g: PackGate): string {
  return [
    g.uncounted.length ? `ตรวจนับอีก ${g.uncounted.length} รูป` : "",
    g.unread.length ? `ยืนยันอ่านอีก ${g.unread.length} รายการ` : "",
    g.short.length ? `ของไม่ครบ ${g.short.length} รายการ` : "",
    g.unsampled.length ? `ยังไม่ยืนยันใส่งานตัวอย่าง ${g.unsampled.length} รายการ` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const runtime = "nodejs";

/**
 * ฝ่ายแพ็คบันทึกได้เฉพาะงานแพ็ค — เอาออเดอร์เดิมจาก DB เป็นฐาน แล้วทับเฉพาะ:
 *   ผลตรวจนับ (proofs[].pack) · ยืนยันอ่าน (items[].noteAck) · ยืนยันใส่งานตัวอย่าง (items[].samplePacked) · เลขพัสดุ + สถานะจัดส่ง · log
 * ฟิลด์อื่น (ราคา ที่อยู่ รายการ) ใช้ของเดิมทั้งหมด — กันแก้ทางอ้อม
 */
function mergePackFields(existing: Order, incoming: Order, mayShip: boolean): Order {
  const items = existing.items.map((it, i) => {
    const inc = incoming.items?.[i];
    if (!inc) return it;
    const proofs = proofsOf(it).map((p, j) => {
      const ip = (inc.proofs ?? [])[j];
      return ip?.pack ? { ...p, pack: ip.pack } : p;
    });
    return { ...it, proofs, noteAck: inc.noteAck ?? it.noteAck, samplePacked: inc.samplePacked ?? it.samplePacked };
  });

  const merged: Order = { ...existing, items };

  // เลขพัสดุ + เปลี่ยนสถานะเป็น "จัดส่งแล้ว" ทำได้เฉพาะคนที่มีสิทธิ์ยิงเลขพัสดุ
  if (mayShip && typeof incoming.tracking === "string") {
    merged.tracking = incoming.tracking;
    if (incoming.status === "จัดส่งแล้ว" && existing.status !== "เสร็จสิ้น") {
      merged.status = "จัดส่งแล้ว" as OrderStatus;
    }
  }

  // ต่อประวัติการทำงาน (log ที่ client ส่งมา = ของเดิม + รายการใหม่)
  if (incoming.log && incoming.log.length >= (existing.log?.length ?? 0)) {
    merged.log = incoming.log;
  }

  return merged;
}

/** แอดมินดึงออเดอร์จริงทั้งหมด (ใหม่→เก่า) */
export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ orders: [] });
  const gate = await requirePerm("orders.view");
  if (gate.res) return gate.res;

  const { data, error } = await sb.from("orders").select("data").order("created_at", { ascending: false });
  if (error) {
    // ตารางยังไม่ถูกสร้าง → บอกให้รัน SQL (ไม่ถือเป็น error ร้ายแรง)
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
      return NextResponse.json({ orders: [], needsSetup: true });
    return NextResponse.json({ error: error.message, orders: [] }, { status: 500 });
  }

  const orders = (data ?? []).map((r) => r.data as Order);
  // เซ็น signed URL ชั่วคราวสำหรับสลิปที่อยู่ใน bucket ส่วนตัว (ออเดอร์ใหม่) — ไม่แก้ข้อมูลในฐาน
  const withSlip = orders.filter((o) => o.slipPath);
  if (withSlip.length) {
    const signed = await Promise.all(
      withSlip.map((o) => sb.storage.from("payment-slips-private").createSignedUrl(o.slipPath!, 3600))
    );
    withSlip.forEach((o, i) => {
      const url = signed[i].data?.signedUrl;
      if (url) o.slipUrl = url; // ชั่วคราว ใช้แสดงผลเท่านั้น ไม่ persist
    });
  }
  return NextResponse.json({ orders });
}

/** แอดมินสร้างออเดอร์ใหม่จากหลังบ้าน (ออเดอร์เปล่า — ไปกดเพิ่มรายการพิเศษต่อในหน้าออเดอร์) */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  // สร้างได้ทันทีไม่ต้องกรอกอะไรก่อน — ไปเติมชื่อ/ที่อยู่/รายการ ในหน้าออเดอร์ (หน้าเดียวจบ)
  let body: { customerName?: string; phone?: string; address?: string; shipping?: string; shippingCost?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* ไม่ส่ง body มาก็ได้ */
  }

  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const id = `OD-${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
  const by = gate.actor.name?.trim() || gate.actor.username;
  let order: Order = {
    id,
    key: randomBytes(24).toString("base64url"),
    customer: body.customerName?.trim() || "ยังไม่ระบุชื่อ",
    phone: body.phone?.trim() || "",
    address: body.address?.trim() || "",
    date: now.toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    payment: "โอนธนาคาร",
    shipping: body.shipping === "ส่งด่วน" ? "ส่งด่วน" : "ส่งธรรมดา",
    shippingCost: Math.max(0, Number(body.shippingCost) || 0),
    status: "รอชำระเงิน",
    items: [],
    placedBy: by,
  };
  order = withLog(order, by, "สร้างออเดอร์จากหลังบ้าน", "งานพิเศษ/สั่งแทนลูกค้า");

  const { error } = await sb.from("orders").insert({ id, data: order });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}

/** แอดมินอัปเดตออเดอร์ (เปลี่ยนสถานะ ฯลฯ) — ส่ง Order เต็มมา */
export async function PATCH(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  // แอดมิน (orders.edit) → บันทึกได้เต็ม · ฝ่ายแพ็ค (pack.check/pack.ship) → บันทึกได้เฉพาะงานแพ็ค
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  const mayEditFull = can(actor, "orders.edit");
  const mayPack = can(actor, "pack.check") || can(actor, "pack.ship");
  if (!mayEditFull && !mayPack) {
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์แก้ไขออเดอร์" }, { status: 403 });
  }

  let order: Order;
  try {
    order = (await req.json()) as Order;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!order?.id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  // ดึงออเดอร์เดิม — ฝ่ายแพ็คใช้เป็นฐาน merge · ทุกคนใช้เทียบสถานะเก่าเพื่อแจ้งเตือน
  const { data: row, error: gErr } = await sb.from("orders").select("data").eq("id", order.id).single();
  if (gErr || !row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const existing = row.data as Order;
  const oldStatus = existing.status;

  // มีการ "ยิงเลขพัสดุใหม่" ในคำขอนี้ไหม (ใช้ตัดสินเรื่องด่านตรวจ)
  const wantsTracking =
    typeof order.tracking === "string" && order.tracking.trim() !== "" && order.tracking.trim() !== (existing.tracking ?? "");

  let toSave: Order;
  if (mayEditFull) {
    toSave = order;
    // แอดมินยิงเลขทั้งที่ด่านตรวจยังไม่ครบ = อนุญาต (ตัดสินใจเอง) แต่บันทึก log ฝั่งเซิร์ฟเวอร์เสมอ — ตรวจย้อนหลังได้ว่าใครข้าม
    if (wantsTracking) {
      const g = packGate(existing);
      if (!g.ready) {
        toSave = withLog(toSave, actor.name || actor.username, "⚠️ ข้ามด่านตรวจ — ยิงเลขพัสดุ", gateReasons(g));
      }
    }
  } else {
    // ฝ่ายแพ็ค: ห้ามข้ามเด็ดขาด — เช็คด่านจากข้อมูลล่าสุด (รวมผลตรวจที่เพิ่งส่งมาในคำขอนี้)
    const mergedNoShip = mergePackFields(existing, order, false);
    if (wantsTracking && !packGate(mergedNoShip).ready) {
      return NextResponse.json(
        { error: `ยังยิงเลขพัสดุไม่ได้ — ${gateReasons(packGate(mergedNoShip))}` },
        { status: 409 }
      );
    }
    toSave = mergePackFields(existing, order, can(actor, "pack.ship"));
  }

  // อย่าเก็บ signed URL ชั่วคราวลงฐาน — สลิปที่มี slipPath ต้องเซ็นใหม่ทุกครั้งที่ดึง
  if (toSave.slipPath) toSave = { ...toSave, slipUrl: undefined };

  const { error } = await sb.from("orders").update({ data: toSave }).eq("id", toSave.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // แจ้งเตือนลูกค้าเมื่อสถานะเปลี่ยนไปขั้นสำคัญ (เงียบถ้ายังไม่ตั้งค่า LINE)
  if (toSave.status !== oldStatus) {
    const origin = new URL(req.url).origin;
    const link = orderLink(origin, toSave);
    if (toSave.status === "ชำระแล้ว")
      void notifyCustomer(sb, toSave, `✅ ยืนยันการชำระเงินออเดอร์ ${toSave.id} แล้ว กำลังเริ่มงานให้ครับ\n${link}`);
    else if (toSave.status === "จัดส่งแล้ว")
      void notifyCustomer(sb, toSave, `🚚 ออเดอร์ ${toSave.id} จัดส่งแล้ว${toSave.tracking ? `\nเลขพัสดุ: ${toSave.tracking}` : ""}\n${link}`);
  }

  return NextResponse.json({ ok: true, order: toSave });
}
