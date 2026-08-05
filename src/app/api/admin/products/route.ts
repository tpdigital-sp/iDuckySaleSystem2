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

  /**
   * กันแท็บที่เปิดค้างไว้บันทึกทับข้อมูลใหม่กว่า (เคยทำราคาขั้นบันได/กฎตัวเลือกหายมาแล้ว)
   * หน้าแก้ไขส่ง header x-base-saved-at = savedAt ตอนที่โหลดข้อมูลมา
   * ถ้าในฐานข้อมูลถูกบันทึกหลังจากนั้น = ข้อมูลในมือเก่าแล้ว → ปฏิเสธ ให้ไปโหลดใหม่ก่อน
   * (ไม่ส่ง header มา = เส้นทางอื่นที่แก้ทีละฟิลด์ เช่น ติ๊ก "ตรวจแล้ว" — ผ่านได้ตามเดิม)
   */
  const baseSavedAt = req.headers.get("x-base-saved-at");
  if (baseSavedAt) {
    const { data: cur } = await sb.from("products").select("data").eq("id", p.id).maybeSingle();
    const dbSavedAt = (cur?.data as Product | undefined)?.savedAt;
    if (dbSavedAt && dbSavedAt !== baseSavedAt) {
      return NextResponse.json(
        {
          error:
            "มีการบันทึกสินค้านี้จากที่อื่นหลังจากคุณเปิดหน้านี้ — กด F5 โหลดข้อมูลล่าสุดก่อนแล้วแก้ใหม่ (กันข้อมูลใหม่หายจากการบันทึกทับ)",
        },
        { status: 409 }
      );
    }
  }

  const saved: Product = { ...p, savedAt: new Date().toISOString() };
  const { error } = await sb.from("products").upsert(
    {
      id: saved.id,
      name: saved.name,
      category: saved.category,
      price: saved.price,
      sold: saved.sold,
      featured: saved.featured ?? false,
      badge: saved.badge ?? null,
      data: saved,
    },
    { onConflict: "id" }
  );
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true, savedAt: saved.savedAt });
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
