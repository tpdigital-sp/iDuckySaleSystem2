import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getProductsSlim } from "@/lib/server/products-slim";
import { codeSlug, saveStockItem, setBom } from "@/lib/server/stock";

export const runtime = "nodejs";

/**
 * วัสดุแฝงของสินค้า (ขาตั้ง หมุด ถุง) — ของที่ทุกชิ้นใช้แต่ไม่มีในตัวเลือกให้ลูกค้าเลือก
 *   POST { productId, per, stockItemId }                      → ผูก SKU เดิม
 *   POST { productId, per, create: { name, unit, part? } }    → สร้าง SKU ใหม่แล้วผูก
 *   DELETE { productId, stockItemId }                         → ถอด
 * ตัดที่ cutStockForOrder (ข้อ 1b) · สิทธิ์เดียวกับแก้ไข SKU (orders.edit)
 */
async function guard() {
  const actor = await currentActor();
  if (!actor) return { res: NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 }) };
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return { res: NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 }) };
  return { actor };
}

export async function POST(req: Request) {
  const g = await guard();
  if (g.res) return g.res;
  let body: { productId?: string; per?: number; stockItemId?: string; create?: { name?: string; unit?: string; part?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const productId = body.productId?.trim();
  const per = Number(body.per);
  if (!productId) return NextResponse.json({ error: "ไม่มีสินค้า" }, { status: 400 });
  if (!Number.isFinite(per) || per <= 0 || per > 100000) return NextResponse.json({ error: "จำนวนต่อชิ้นต้องมากกว่า 0" }, { status: 400 });
  // ผูกกับรหัสที่ไม่มีจริง = ลิงก์ตายตั้งแต่เกิด (เคยมี 32 SKU แบบนี้)
  const slim = await getProductsSlim().catch(() => null);
  if (slim && !slim.products.some((p) => p.id === productId)) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });

  let itemId = body.stockItemId?.trim();
  try {
    if (!itemId) {
      const name = body.create?.name?.trim();
      if (!name) return NextResponse.json({ error: "ต้องเลือกวัสดุเดิม หรือกรอกชื่อวัสดุใหม่" }, { status: 400 });
      // รหัสตามสินค้า: วัสดุแฝงของ photoframe-3 → P-PHOTOFRAME-3-B1, B2 …
      const sku = await saveStockItem({
        name,
        unit: body.create?.unit?.trim() || "ชิ้น",
        part: body.create?.part?.trim() || undefined,
        codePrefix: `P-${codeSlug(productId)}-B`,
      });
      itemId = sku.id;
    }
    const item = await setBom(itemId, productId, per);
    if (!item) return NextResponse.json({ error: "ไม่พบวัสดุนี้" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const g = await guard();
  if (g.res) return g.res;
  let body: { productId?: string; stockItemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body.productId || !body.stockItemId) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  try {
    const item = await setBom(body.stockItemId, body.productId, null);
    if (!item) return NextResponse.json({ error: "ไม่พบวัสดุนี้" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
