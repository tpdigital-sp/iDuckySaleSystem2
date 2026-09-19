import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { setNoStock } from "@/lib/server/stock";

export const runtime = "nodejs";

/**
 * ตั้ง/ปลด "ไม่ต้องมีสต๊อก" — body { ids: string[], on: boolean }
 * รับหลายตัวเพราะปุ่มที่หัวกลุ่มสินค้าในหน้าคลังกดทีเดียวทั้งกลุ่ม · สิทธิ์เดียวกับแก้ไข SKU (orders.edit)
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });
  let body: { ids?: unknown; on?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((x) => String(x).trim()).filter(Boolean))] : [];
  if (!ids.length || ids.length > 2000) return NextResponse.json({ error: "ไม่มีรายการให้ตั้งค่า" }, { status: 400 });
  try {
    const count = await setNoStock(ids, body.on !== false);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
