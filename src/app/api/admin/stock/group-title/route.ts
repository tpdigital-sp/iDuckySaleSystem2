import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { listGroupTitles, setGroupTitle } from "@/lib/server/stock";

export const runtime = "nodejs";

/** 🏷 ชื่อหัวกลุ่มวัสดุที่ตั้งเอง — ดูได้ทุกคนที่ล็อกอิน (ทีมเห็นชื่อเดียวกัน) */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, titles: await listGroupTitles() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** ตั้ง/ล้างชื่อทีละกลุ่ม — body { key, name } (name ว่าง = กลับชื่อเดิม) · สิทธิ์เดียวกับแก้ไขสต๊อก (orders.edit) */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });
  let body: { key?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const key = String(body.key ?? "").trim();
  if (!key || key.length > 300) return NextResponse.json({ error: "ไม่มีกลุ่มให้ตั้งชื่อ" }, { status: 400 });
  const name = String(body.name ?? "").trim();
  if (name.length > 120) return NextResponse.json({ error: "ชื่อกลุ่มยาวเกินไป (ไม่เกิน 120 ตัวอักษร)" }, { status: 400 });
  try {
    const titles = await setGroupTitle(key, name, actor.name || actor.username);
    return NextResponse.json({ ok: true, titles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
