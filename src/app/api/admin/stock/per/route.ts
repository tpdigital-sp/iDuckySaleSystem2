import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { setProductPer } from "@/lib/server/stock";

export const runtime = "nodejs";

/**
 * 📦 อัตรา "ตัดกี่หน่วยต่อ 1 ที่ลูกค้าสั่ง" ของ SKU ที่ผูกกับตัวสินค้าตรง ๆ — งานขายเป็นเซ็ต
 *   POST { stockItemId, productId, per }   → ตั้ง (per 1/ว่าง = กลับไป 1 ต่อ 1)
 * ผูกที่ "ตัวเลือก" ใช้ stockQtyPer (/api/admin/stock/link) · วัสดุแฝงใช้ bomFor (/api/admin/stock/bom)
 * ตัดจริงที่ cutStockForOrder ข้อ 1 · สิทธิ์เดียวกับแก้ไข SKU (orders.edit)
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });

  let body: { stockItemId?: string; productId?: string; per?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const itemId = body.stockItemId?.trim();
  const productId = body.productId?.trim();
  if (!itemId || !productId) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  let per: number | null = null;
  if (body.per != null && body.per !== 1) {
    const n = Number(body.per);
    if (!Number.isFinite(n) || n <= 0 || n > 100000) return NextResponse.json({ error: "จำนวนต่อชุดต้องมากกว่า 0" }, { status: 400 });
    per = Math.round(n * 10000) / 10000;
  }
  try {
    const item = await setProductPer(itemId, productId, per);
    if (!item) return NextResponse.json({ error: "ไม่พบวัสดุนี้" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
