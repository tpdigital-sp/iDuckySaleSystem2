import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getStockSettings, setStockLive } from "@/lib/server/stock";

export const runtime = "nodejs";

/** ⏸ สถานะ "เปิดใช้คลัง" (ดู getStockSettings) — GET ทุกคนที่ล็อกอิน */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, settings: await getStockSettings(true) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** body { live: boolean } — เปิด/ปิดคลังทั้งระบบ · สิทธิ์เดียวกับแก้ไขสต๊อก (orders.edit) */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });
  let body: { live?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (typeof body.live !== "boolean") return NextResponse.json({ error: "ระบุ live เป็น true/false" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, settings: await setStockLive(body.live, actor.name?.trim() || actor.username) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
