import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { setStockSort } from "@/lib/server/stock";

export const runtime = "nodejs";

/**
 * ↕ ลากจัดลำดับแถวในกลุ่มของหน้าคลัง (เจ้าของร้านขอ 1 ต.ค. 69) — body { ids: string[] } เรียงตามที่ต้องการ
 * สิทธิ์เดียวกับแก้ไขสต๊อก · เขียนแค่ฟิลด์ sort ไม่แตะยอด/ลิงก์
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms())) return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });
  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && !!x))] : [];
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการที่จะจัดลำดับ" }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "จัดลำดับได้ครั้งละไม่เกิน 500 รายการ" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, sorted: await setStockSort(ids) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
