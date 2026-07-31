import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { listStock, saveStockItem } from "@/lib/server/stock";

export const runtime = "nodejs";

/** ดูคลังสต๊อก — ทีมงานที่ล็อกอินทุกคน */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  const data = await listStock();
  return NextResponse.json({ ok: true, ...data });
}

/** สร้าง/แก้ไขรายการ SKU — สิทธิ์แก้ออเดอร์ (orders.edit) */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });

  let body: {
    id?: string;
    name?: string;
    unit?: string;
    category?: string;
    reorderPoint?: number;
    leadTimeDays?: number;
    productIds?: string[];
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body.name?.trim()) return NextResponse.json({ error: "ต้องมีชื่อรายการ" }, { status: 400 });
  try {
    const item = await saveStockItem({
      id: body.id,
      name: body.name,
      unit: body.unit,
      category: body.category,
      reorderPoint: Number.isFinite(body.reorderPoint) ? Math.max(0, Number(body.reorderPoint)) : undefined,
      leadTimeDays: Number.isFinite(body.leadTimeDays) ? Math.max(0, Number(body.leadTimeDays)) : undefined,
      productIds: Array.isArray(body.productIds) ? body.productIds.map((p) => String(p).trim()).filter(Boolean) : undefined,
      active: body.active,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
