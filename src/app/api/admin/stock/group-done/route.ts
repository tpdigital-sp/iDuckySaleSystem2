import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { listGroupsDone, setGroupDone } from "@/lib/server/stock";

export const runtime = "nodejs";

/** ✅ กลุ่มวัสดุที่จัดแล้ว — ดูได้ทุกคนที่ล็อกอิน (ทีมเห็นตรงกันว่าจัดถึงไหนแล้ว) */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, done: await listGroupsDone() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** ติ๊ก/ถอนติ๊กทีละกลุ่ม — body { key, on } · สิทธิ์เดียวกับแก้ไขสต๊อก (orders.edit) */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });
  let body: { key?: unknown; on?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const key = String(body.key ?? "").trim();
  if (!key || key.length > 300) return NextResponse.json({ error: "ไม่มีกลุ่มให้ติ๊ก" }, { status: 400 });
  try {
    const done = await setGroupDone(key, body.on !== false, actor.name || actor.username);
    return NextResponse.json({ ok: true, done });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
