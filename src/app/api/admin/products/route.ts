import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Product } from "@/lib/products";

export const runtime = "nodejs";

/** บันทึก/อัปเดตสินค้า (เฉพาะแอดมินที่ล็อกอิน) */
export async function POST(req: Request) {
  // ยังไม่ตั้งค่า → 503 ให้ client fallback เป็นโหมดเดโม (localStorage)
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  let p: Product;
  try {
    p = (await req.json()) as Product;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!p?.id || !p?.name) return NextResponse.json({ error: "ข้อมูลสินค้าไม่ครบ" }, { status: 400 });

  const { error } = await sb.from("products").upsert(
    {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      sold: p.sold,
      featured: p.featured ?? false,
      badge: p.badge ?? null,
      data: p,
    },
    { onConflict: "id" }
  );
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

/** ลบสินค้า (เฉพาะแอดมิน) — /api/admin/products?id=xxx */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });
  const { error } = await sb.from("products").delete().eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
