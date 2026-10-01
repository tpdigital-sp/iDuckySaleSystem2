import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { snapshotRevision } from "@/lib/server/product-revisions";
import { invalidateProductsSlim } from "@/lib/server/products-slim";
import { renameChoiceInProduct } from "@/lib/option-rename";
import type { Product } from "@/lib/products";

export const runtime = "nodejs";

/**
 * ✏️ เปลี่ยนชื่อตัวเลือกของสินค้าจากหน้าต่าง "แยกสต๊อกตามตัวเลือก" — ไม่ต้องเด้งไปหน้าสินค้า (เจ้าของร้านขอ 1 ต.ค. 69)
 * POST { productId, optionIndex, oldName, newName } · สิทธิ์เดียวกับแยกสต๊อก (orders.edit) หรือจัดการสินค้า (products.manage)
 * ลากราคา/กฎ/เงื่อนไขตามให้ครบด้วย renameChoiceInProduct · เก็บ revision ก่อนเขียนทับเหมือนการบันทึกสินค้าปกติ
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  const perms = await loadRolePerms();
  if (!can(actor, "orders.edit", perms) && !can(actor, "products.manage", perms))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์แก้ตัวเลือกสินค้า" }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });

  let body: { productId?: string; optionIndex?: number; oldName?: string; newName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const { productId, optionIndex } = body;
  const oldName = String(body.oldName ?? "").trim();
  const newName = String(body.newName ?? "").trim();
  if (!productId || typeof optionIndex !== "number" || optionIndex < 0 || !oldName || !newName)
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  if (oldName === newName) return NextResponse.json({ ok: true, unchanged: true });

  const { data: row } = await db.from("products").select("id,data").eq("id", productId).maybeSingle();
  const p = row?.data as Product | undefined;
  if (!p?.name) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  const group = p.options?.[optionIndex];
  if (!group) return NextResponse.json({ error: "ไม่พบกลุ่มตัวเลือกนี้" }, { status: 404 });
  if (group.presetId) return NextResponse.json({ error: "กลุ่มนี้ลิงก์กับคลังตัวเลือกกลาง — แก้ชื่อที่คลังตัวเลือก" }, { status: 409 });
  if (!group.choices.some((c) => c.name.trim() === oldName)) return NextResponse.json({ error: `ไม่พบตัวเลือก “${oldName}” ในกลุ่ม “${group.label}” — อาจถูกแก้จากที่อื่นแล้ว ปิดแล้วเปิดใหม่` }, { status: 409 });
  if (group.choices.some((c) => c.name.trim() === newName)) return NextResponse.json({ error: `มีตัวเลือกชื่อ “${newName}” ในกลุ่มนี้อยู่แล้ว` }, { status: 409 });

  const next = { ...renameChoiceInProduct(p, optionIndex, oldName, newName), savedAt: new Date().toISOString() };
  await snapshotRevision(db, productId, p, actor, "save");
  const { error } = await db.from("products").update({ data: next }).eq("id", productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateProductsSlim();
  return NextResponse.json({ ok: true, group: group.label, oldName, newName });
}
