import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { hasQuoteOption, priceRange, type Product } from "@/lib/products";
import { sanitizeHtml } from "@/lib/server/sanitize-html";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "@/lib/permissions";

export const runtime = "nodejs";

/** เก็บประวัติกี่เวอร์ชันล่าสุดต่อสินค้า (เกินนี้ลบตัวเก่าทิ้ง) */
const REVISIONS_KEEP = 30;

/**
 * เก็บ "ข้อมูลก่อนถูกเขียนทับ/ลบ" ลง product_revisions — ไว้กู้คืนเมื่อข้อมูลหาย
 * (เคยเกิด: กลุ่ม "เคลือบเรซิ่น" กริ๊บต๊อก และกลุ่ม "งานปัก" เสื้อ หายจากการบันทึกทับ)
 * ตารางยังไม่ได้สร้าง (ยังไม่รัน supabase/product-revisions.sql) = ข้ามเงียบ ๆ ไม่ให้การบันทึกล้ม
 */
async function snapshotRevision(sb: SupabaseClient, productId: string, data: unknown, actor: Actor | null, action: "save" | "delete") {
  if (!data) return;
  const { error } = await sb.from("product_revisions").insert({
    product_id: productId,
    data,
    action,
    editor: actor?.username ?? null,
    editor_name: actor?.name ?? null,
  });
  if (error) {
    // 42P01 = ตารางยังไม่ได้สร้าง — แจ้งใน log เฉย ๆ อย่างอื่นก็แค่เตือน (ประวัติหาย 1 จุด ดีกว่าบันทึกสินค้าไม่ได้)
    console.warn("เก็บประวัติสินค้าไม่สำเร็จ:", error.message);
    return;
  }
  // ตัดประวัติเก่าเกินโควตา — เรียงใหม่→เก่า แล้วลบตั้งแต่ตัวที่เกิน
  const { data: over } = await sb
    .from("product_revisions")
    .select("id")
    .eq("product_id", productId)
    .order("id", { ascending: false })
    .range(REVISIONS_KEEP, REVISIONS_KEEP + 200);
  if (over?.length) await sb.from("product_revisions").delete().in("id", over.map((r) => r.id));
}

/** บันทึก/อัปเดตสินค้า (เฉพาะแอดมินที่ล็อกอิน) */
export async function POST(req: Request) {
  // ยังไม่ตั้งค่า → 503 ให้ client fallback เป็นโหมดเดโม (localStorage)
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;

  // sort = ลำดับในลิสต์ (คอลัมน์แยก ไม่เก็บใน data) — ส่งมาเฉพาะตอนทำซ้ำ ให้สำเนาอยู่ติดตัวต้นฉบับ
  let p: Product & { sort?: number };
  try {
    p = (await req.json()) as Product & { sort?: number };
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
  const { data: cur } = await sb.from("products").select("data").eq("id", p.id).maybeSingle();
  const baseSavedAt = req.headers.get("x-base-saved-at");
  if (baseSavedAt) {
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

  // 🗂️ เก็บเวอร์ชันเดิมไว้ก่อนเขียนทับ — กลุ่มตัวเลือก/ข้อมูลหายเมื่อไหร่ กู้จาก product_revisions ได้
  await snapshotRevision(sb, p.id, cur?.data, gate.actor, "save");

  const { sort, ...product } = p;
  // เก็บช่วงราคาที่คำนวณไว้ด้วย — หน้ารายการ/หน้าแรกจะได้โชว์ราคาโดยไม่ต้องโหลดตารางราคาทั้งก้อน
  const range = priceRange(product as Product);
  const saved: Product = {
    ...product,
    // เนื้อหาแท็บแบบจัดรูปแบบขึ้นหน้าเว็บสาธารณะ → กรองแท็กอันตรายก่อนเก็บเสมอ (ชุดเดียวกับบทความ)
    ...(product.tabs
      ? { tabs: product.tabs.map((t) => (t.html ? { ...t, html: sanitizeHtml(t.html) } : t)) }
      : {}),
    // ท่อนเนื้อหา (รวมโซนข้างแผงสั่งซื้อ) ที่จัดรูปแบบมาจากตัวเขียน → กรองเหมือนกัน
    ...(product.body
      ? { body: product.body.map((b) => (b.html ? { ...b, html: sanitizeHtml(b.html) } : b)) }
      : {}),
    // มีแบบ "งานสั่งทำ ให้แอดมินตีราคา" ไหม — การ์ดหน้ารายการใช้ธงนี้โชว์ "เริ่มต้น ฿X" (ไม่ต้องโหลด options)
    ...(hasQuoteOption(product as Product) ? { quoteOption: true } : { quoteOption: undefined }),
    priceMin: range.min,
    priceMax: range.max,
    savedAt: new Date().toISOString(),
  };
  const { error } = await sb.from("products").upsert(
    {
      id: saved.id,
      name: saved.name,
      category: saved.category,
      price: saved.price,
      sold: saved.sold,
      featured: saved.featured ?? false,
      badge: saved.badge ?? null,
      // ไม่ส่ง sort มา = ไม่แตะลำดับเดิม (การบันทึกทั่วไปห้ามล้างลำดับที่จัดไว้)
      ...(typeof sort === "number" ? { sort } : {}),
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
  // 🗂️ เก็บสำเนาสุดท้ายก่อนลบถาวร — เผลอลบผิดตัวยังกู้กลับได้จาก product_revisions
  const { data: cur } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  await snapshotRevision(sb, id, cur?.data, gate.actor, "delete");
  const { error } = await sb.from("products").delete().eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
