import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can, ROLE_ADMINISTRATOR } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderAlertActive, type Order } from "@/lib/admin-data";
import { alertDismissDenied, applyOrderAlert, mayDismissAlert } from "@/lib/order-alert";
import { updateOrder } from "@/lib/server/order-write";

export const runtime = "nodejs";

/**
 * 🔔 แจ้งเตือนเด้ง (Order.alertNote) — เจ้าของร้านขอ 12 ต.ค. 69
 *
 * เขียนทีละฟิลด์ฝั่งเซิร์ฟเวอร์ (แบบเดียวกับ /ready) ไม่ส่งออเดอร์ทั้งก้อน — คนแพ็คกดปิดได้โดยไม่ทับงานคนอื่น
 * PATCH ทั้งก้อนของหน้าออเดอร์เก็บค่าเดิมไว้เสมอ (ดู route.ts หลัก)
 *
 * POST { id, text }       → ตั้ง/แก้ข้อความ (เด้งใหม่ทุกคน) — แอดมิน (orders.edit) · text ว่าง = ลบทิ้ง — คนตั้ง/ผู้ดูแลระบบ
 * POST { id, dismiss }    → ปิดแจ้งเตือน (ไม่เด้งอีก) — คนตั้ง (byUser) หรือผู้ดูแลระบบเท่านั้น (พนักงานขอ 16 ต.ค. 69)
 * POST { id, ack }        → รับทราบ (จดชื่อให้คนตั้งดู ยังเด้งต่อ) — พนักงานที่ล็อกอินคนไหนก็ได้
 * POST { id, reopen }     → เปิดเด้งใหม่ข้อความเดิม — แอดมิน (orders.edit)
 * → { ok, alertNote }
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; text?: string; dismiss?: boolean; reopen?: boolean; ack?: boolean };
  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const mayEdit = can(actor, "orders.edit", await loadRolePerms());
  if (!body.dismiss && !body.ack && !mayEdit) return NextResponse.json({ error: "ตั้งแจ้งเตือนได้เฉพาะแอดมิน" }, { status: 403 });

  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  const o = data?.data as Order | undefined;
  if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });

  const by = actor.name?.trim() || actor.username;
  const who = { username: actor.username, name: by, isAdministrator: actor.role === ROLE_ADMINISTRATOR };
  // ปิด หรือ ลบ (text ว่าง) ตอนยังเด้งอยู่ = ต้องเป็นคนตั้งเอง/ผู้ดูแลระบบ — คนอื่นได้แค่รับทราบ (ใบที่หยุดเด้งแล้วลบได้ตามปกติ)
  const closing = body.dismiss || (!body.ack && !body.reopen && !(body.text ?? "").trim());
  if (closing && o.alertNote && orderAlertActive(o) && !mayDismissAlert(o.alertNote, who)) {
    return NextResponse.json({ error: alertDismissDenied(o.alertNote) }, { status: 403 });
  }

  const next = applyOrderAlert(o, body, by, new Date().toISOString(), actor.username);
  if (!next) return NextResponse.json({ ok: true, alertNote: o.alertNote ?? null });
  const { order: saved, error } = await updateOrder(sb, next, { prev: o, by });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alertNote: saved.alertNote ?? null, savedAt: saved.savedAt, log: saved.log });
}
