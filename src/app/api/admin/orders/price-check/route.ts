import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { priceCheckPending, withLog, type Order } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

/**
 * 🧮 กด "ตรวจราคาแล้ว" (Order.priceCheck) — เจ้าของร้านสั่ง 20 ต.ค. 69 หลัง OD-260910-5776
 *
 * เขียนทีละฟิลด์ฝั่งเซิร์ฟเวอร์ (แบบเดียวกับ /alert) ไม่ส่งออเดอร์ทั้งก้อน
 * POST { id, at } → ackAt/ackBy · at = รอบที่หน้าจอเห็น — ระหว่างนั้นมีของเข้าใบเพิ่ม (lastAt ใหม่กว่า) = 409 ให้ดูใหม่
 * เฉพาะคนที่แก้ออเดอร์ได้ (orders.edit) → { ok, priceCheck, savedAt, log }
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "ตรวจราคาได้เฉพาะคนที่แก้ออเดอร์ได้" }, { status: 403 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; lastAt?: string };
  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  const o = data?.data as Order | undefined;
  if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  const c = o.priceCheck;
  if (!c || !priceCheckPending(o)) return NextResponse.json({ ok: true, priceCheck: c ?? null });
  if ((c.lastAt ?? c.at) !== (body.lastAt ?? ""))
    return NextResponse.json({ error: "มีรายการเข้าใบเพิ่มระหว่างนี้ — ตรวจราคาชุดใหม่อีกรอบ", priceCheck: c }, { status: 409 });

  const by = actor.name?.trim() || actor.username;
  // ⏸ ตรวจแล้ว = ปลดรายการที่พักไว้ (priceHold) ให้ลูกค้าโอนได้ตามราคาที่อยู่ในใบตอนนี้
  const unheld = o.items.filter((it) => it.priceHold).map((it) => it.name);
  const items = unheld.length ? o.items.map((it) => (it.priceHold ? { ...it, priceHold: undefined } : it)) : o.items;
  const next = withLog(
    { ...o, items, priceCheck: { ...c, ackAt: new Date().toISOString(), ackBy: by } },
    by,
    "ตรวจราคาแล้ว",
    `หลัง${c.what}${unheld.length ? ` · ปลดพักราคา ${unheld.join(", ")} (ลูกค้าโอนได้แล้ว)` : ""}`
  );
  const { order: saved, error } = await updateOrder(sb, next, { prev: o, by });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, priceCheck: saved.priceCheck ?? null, savedAt: saved.savedAt, log: saved.log, ...(unheld.length ? { items: saved.items } : {}) });
}
