import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { addStockCategory, assignStockCategory, assignStockFamily, deleteStockCategory, listStockCategories, listStockItems, renameStockCategory } from "@/lib/server/stock";

export const runtime = "nodejs";

/** 🗂 หมวดวัสดุ: รายชื่อที่เก็บไว้ + หมวดที่พิมพ์ค้างในวัสดุ พร้อมจำนวนวัสดุต่อหมวด */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  try {
    const [names, items] = await Promise.all([listStockCategories(), listStockItems()]);
    const counts: Record<string, number> = {};
    for (const it of items) if (it.category?.trim()) counts[it.category.trim()] = (counts[it.category.trim()] ?? 0) + 1;
    const all = [...new Set([...names, ...Object.keys(counts)])];
    return NextResponse.json({ ok: true, names: all, counts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** body { action: "add" | "rename" | "delete", name, to?, moveTo? } — สิทธิ์เดียวกับแก้ไขสต๊อก */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (!can(actor, "orders.edit", await loadRolePerms()))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" }, { status: 403 });
  let body: { action?: string; name?: string; to?: string; moveTo?: string; ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  // ย้ายวัสดุตาม ids ไปหมวด name (ว่าง = ยังไม่จัดหมวด)
  // 🏷 เปลี่ยนชื่อตระกูลทั้งชุด (หัวกลุ่มตามตระกูลในหน้าคลัง) — ids + name ใหม่
  if (body.action === "assign-family") {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && !!x) : [];
    if (!ids.length) return NextResponse.json({ error: "ระบุรายการที่จะเปลี่ยนตระกูล" }, { status: 400 });
    try {
      return NextResponse.json({ ok: true, moved: await assignStockFamily(ids, body.name ?? "") });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  if (body.action === "assign") {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && !!x) : [];
    if (!ids.length) return NextResponse.json({ error: "ระบุรายการที่จะย้าย" }, { status: 400 });
    try {
      return NextResponse.json({ ok: true, moved: await assignStockCategory(ids, body.name ?? "") });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "ต้องมีชื่อหมวด" }, { status: 400 });
  try {
    if (body.action === "add") return NextResponse.json({ ok: true, names: await addStockCategory(name) });
    if (body.action === "rename") {
      const to = body.to?.trim();
      if (!to) return NextResponse.json({ error: "ต้องมีชื่อใหม่" }, { status: 400 });
      if (to === name) return NextResponse.json({ ok: true, names: await listStockCategories(), moved: 0 });
      return NextResponse.json({ ok: true, ...(await renameStockCategory(name, to)) });
    }
    if (body.action === "delete") return NextResponse.json({ ok: true, ...(await deleteStockCategory(name, body.moveTo)) });
    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
