import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { deleteStockItem, listStock, saveStockItem } from "@/lib/server/stock";
import { createClient } from "@supabase/supabase-js";
import { snapshotRevision } from "@/lib/server/product-revisions";
import { getProductsSlim, invalidateProductsSlim } from "@/lib/server/products-slim";
import type { ProductOption } from "@/lib/products";

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
    code?: string;
    aliases?: string[];
    family?: string;
    unit?: string;
    category?: string;
    reorderPoint?: number;
    leadTimeDays?: number;
    unitCost?: number;
    productIds?: string[];
    imageUrl?: string;
    part?: string;
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
      code: body.code?.trim() || undefined,
      family: body.family?.trim() || undefined,
      aliases: Array.isArray(body.aliases) ? body.aliases.map((a) => String(a).trim()).filter(Boolean) : undefined,
      unit: body.unit,
      category: body.category,
      reorderPoint: Number.isFinite(body.reorderPoint) ? Math.max(0, Number(body.reorderPoint)) : undefined,
      leadTimeDays: Number.isFinite(body.leadTimeDays) ? Math.max(0, Number(body.leadTimeDays)) : undefined,
      // ทุน/หน่วย — ส่ง 0 มาแปลว่า "ลบทุนออก" (undefined = ไม่ได้แตะช่องนี้ คงของเดิม)
      unitCost: Number.isFinite(body.unitCost) ? Math.max(0, Number(body.unitCost)) : undefined,
      productIds: Array.isArray(body.productIds) ? body.productIds.map((p) => String(p).trim()).filter(Boolean) : undefined,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim() : undefined,
      part: typeof body.part === "string" ? body.part.trim() : undefined,
      active: body.active,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * ลบ SKU — /api/admin/stock?id=xxx (สิทธิ์ orders.edit เหมือนสร้าง/แก้)
 * ปิดการใช้งานใน Firestore (เก็บ ledger ไว้) + ถอดลิงก์ stockItemId ออกจากตัวเลือกสินค้า/คลังตัวเลือกใน Supabase
 * ไม่ถอด = หน้าผูกคลังนับว่า "ผูกแล้ว" ทั้งที่ SKU หายไป ตัดสต๊อกไม่ได้เงียบ ๆ
 */
export async function DELETE(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });

  let item;
  try {
    item = await deleteStockItem(id, actor.name || actor.username);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!item) return NextResponse.json({ error: "ไม่พบวัสดุนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });

  // ถอดลิงก์จากตัวเลือกที่ชี้มา SKU นี้ — แถวคลังตัวเลือก (__preset_*) กับสินค้าอยู่ตารางเดียวกัน
  let unlinked = 0;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    // เดิมดึงสินค้าทั้งตาราง ~7MB ทุกครั้งที่ลบ = 4–6 วิ (18 ก.ย. 69 คนกดลบซ้ำเพราะคิดว่าไม่ติด)
    // → หาแถวที่อ้างถึง SKU นี้จากข้อมูลแบบ slim ก่อน แล้วดึงเต็มเฉพาะแถวนั้น (fresh = ห้ามพลาดลิงก์ที่เพิ่งผูก)
    const slim = await getProductsSlim({ fresh: true }).catch(() => null);
    const refIds = slim
      ? [
          ...slim.presets.filter((r) => JSON.stringify(r.data.choices ?? []).includes(`"${id}"`)).map((r) => r.id),
          ...slim.products.filter((r) => JSON.stringify(r.data.options ?? []).includes(`"${id}"`)).map((r) => r.id),
        ]
      : null;
    const { data: rows } = refIds
      ? refIds.length
        ? await sb.from("products").select("id,data").in("id", refIds)
        : { data: [] as { id: string; data: unknown }[] }
      : await sb.from("products").select("id,data"); // slim พัง → ทางเดิม
    type Ch = { name: string; stockItemId?: string; stockLinks?: { stockItemId: string }[] };
    const hits = (c: Ch) => c.stockItemId === id || (c.stockLinks ?? []).some((l) => l.stockItemId === id);
    const strip = (chs: Ch[]) =>
      chs.map((c) => {
        if (!hits(c)) return c;
        const rest = (c.stockLinks ?? []).filter((l) => l.stockItemId !== id);
        const drop = [...(c.stockItemId === id ? ["stockItemId", "stockQtyPer"] : []), ...(rest.length ? [] : ["stockLinks"])];
        const base = Object.fromEntries(Object.entries(c).filter(([k]) => !drop.includes(k))) as Ch;
        return rest.length ? { ...base, stockLinks: rest } : base;
      });
    for (const r of rows ?? []) {
      const d = r.data as { choices?: Ch[]; options?: ProductOption[] } | null;
      if (!d) continue;
      const hitPreset = r.id.startsWith("__preset_") && (d.choices ?? []).some(hits);
      const hitProduct = !r.id.startsWith("__") && (d.options ?? []).some((o) => ((o.choices ?? []) as Ch[]).some(hits));
      if (!hitPreset && !hitProduct) continue;
      const next = hitPreset
        ? { ...d, choices: strip(d.choices ?? []) }
        : { ...d, options: (d.options ?? []).map((o) => ({ ...o, choices: strip((o.choices ?? []) as Ch[]) })) };
      await snapshotRevision(sb, r.id, d, actor, "save");
      const { error } = await sb.from("products").update({ data: next }).eq("id", r.id);
      if (!error) unlinked++;
    }
    if (unlinked) invalidateProductsSlim();
  }
  return NextResponse.json({ ok: true, item, unlinked });
}
