import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "@/lib/permissions";

/** เก็บประวัติกี่เวอร์ชันล่าสุดต่อสินค้า (เกินนี้ลบตัวเก่าทิ้ง) */
const REVISIONS_KEEP = 30;

/**
 * เก็บ "ข้อมูลก่อนถูกเขียนทับ/ลบ" ลง product_revisions — ไว้กู้คืนเมื่อข้อมูลหาย
 * (เคยเกิด: กลุ่ม "เคลือบเรซิ่น" กริ๊บต๊อก และกลุ่ม "งานปัก" เสื้อ หายจากการบันทึกทับ)
 * ตารางยังไม่ได้สร้าง (ยังไม่รัน supabase/product-revisions.sql) = ข้ามเงียบ ๆ ไม่ให้การบันทึกล้ม
 * ใช้ร่วมกันทุกเส้นทางที่เขียนตาราง products (บันทึกสินค้า / ลบสินค้า / ลบตัวเลือกจากหน้าผูกคลัง)
 */
export async function snapshotRevision(
  sb: SupabaseClient,
  productId: string,
  data: unknown,
  actor: Actor | null,
  action: "save" | "delete"
) {
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
