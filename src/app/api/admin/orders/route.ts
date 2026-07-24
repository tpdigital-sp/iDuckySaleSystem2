import { NextResponse } from "next/server";
import { currentActor, requirePerm } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { proofsOf, type Order, type OrderStatus } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ฝ่ายแพ็คบันทึกได้เฉพาะงานแพ็ค — เอาออเดอร์เดิมจาก DB เป็นฐาน แล้วทับเฉพาะ:
 *   ผลตรวจนับ (proofs[].pack) · ยืนยันอ่าน (items[].noteAck) · เลขพัสดุ + สถานะจัดส่ง · log
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
    return { ...it, proofs, noteAck: inc.noteAck ?? it.noteAck };
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
  return NextResponse.json({ orders: (data ?? []).map((r) => r.data as Order) });
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

  // ฝ่ายแพ็ค: ดึงออเดอร์เดิมมาเป็นฐาน แล้วทับเฉพาะฟิลด์งานแพ็ค (กันแก้ราคา/ที่อยู่/รายการ)
  let toSave = order;
  if (!mayEditFull) {
    const { data: row, error: gErr } = await sb.from("orders").select("data").eq("id", order.id).single();
    if (gErr || !row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
    toSave = mergePackFields(row.data as Order, order, can(actor, "pack.ship"));
  }

  const { error } = await sb.from("orders").update({ data: toSave }).eq("id", toSave.id);
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true, order: toSave });
}
