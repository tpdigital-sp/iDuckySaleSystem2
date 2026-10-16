import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ⏱️ ล้างแคชหน้าสินค้าสาธารณะ (/products/[id] เก็บแคช 1 ชม. · revalidate = 3600)
 *
 * ทำไมต้องมี (16 ต.ค. 69 เข็มกลัด): ข้อมูลเทมเพลต (ไฟล์ .ai · พรีวิว · ขนาดอาร์ตบอร์ด · เส้นตัด) ถูกฝังมากับหน้าสินค้าตอนสร้างหน้า
 * แต่การบันทึกชุดเทมเพลต (ทั้ง /admin/templates และสคริปต์ที่เขียน DB ตรง) ไม่เคยล้างแคชหน้าสินค้าที่ผูกชุดนั้น
 * → เปลี่ยนไฟล์ 2.5 ซม. แล้วหน้าเว็บจริงยังถือไฟล์เก่า 69.5 มม. (.ai ที่โหลดได้ 6.95 ซม.) ได้นานถึงชั่วโมง
 * → และพอพรีวิวรุ่นเก่าถูกลบ หน้าแคชโหลดไกด์ไม่ได้ ลูกค้าเห็นเป็น "ไม่มีเทมเพลต" (32/44/58mm)
 * หน้าเดียวเข้าได้ 2 ทาง (id + slug ภาษาไทย) ต้องล้างทั้งคู่ (แบบเดียวกับ clearProductPageCache ใน api/admin/products)
 */
export function revalidateProductPages(products: { id: string; slug?: string | null }[]): string[] {
  const done: string[] = [];
  for (const p of products) {
    for (const seg of [p.id, p.slug]) {
      if (!seg) continue;
      try {
        revalidatePath(`/products/${seg}`);
        done.push(seg);
      } catch {
        /* ล้างไม่ได้ก็ไม่ควรทำให้งานหลักล้ม — อย่างช้าหน้าจะสดเองเมื่อครบชั่วโมง */
      }
    }
  }
  return done;
}

/** สินค้าที่ผูกชุดเทมเพลตเหล่านี้ (Product.templateIds) — id + slug */
export async function productsUsingTemplates(sb: SupabaseClient, templateIds: string[]): Promise<{ id: string; slug?: string }[]> {
  const out = new Map<string, { id: string; slug?: string }>();
  for (const tid of [...new Set(templateIds.filter(Boolean))]) {
    const { data } = await sb
      .from("products")
      .select("id,slug:data->>slug")
      .filter("data->templateIds", "cs", JSON.stringify([tid]));
    for (const r of (data ?? []) as { id: string; slug?: string | null }[]) out.set(r.id, { id: r.id, slug: r.slug ?? undefined });
  }
  return [...out.values()];
}

/** ล้างแคชหน้าสินค้าทุกตัวที่ผูกชุดเทมเพลตเหล่านี้ — คืนรายการ path ที่ล้าง */
export async function revalidateTemplateProducts(sb: SupabaseClient, templateIds: string[]): Promise<string[]> {
  try {
    return revalidateProductPages(await productsUsingTemplates(sb, templateIds));
  } catch {
    return [];
  }
}

/**
 * 🔏 ลายเซ็นของคำขอล้างแคชจากสคริปต์ในเครื่อง (สคริปต์เขียน DB ตรงด้วย service role · ไม่มีคุกกี้แอดมิน)
 * HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, `${ts}.${body}`) — คีย์ไม่ถูกส่งออกไปกับคำขอ · ts ห่างเกิน 5 นาที = ปฏิเสธ
 * ฝั่งสคริปต์: scripts/lib/revalidate-live.mts (สูตรเดียวกัน)
 */
export function verifyScriptSignature(ts: string | null, sig: string | null, body: string): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !ts || !sig) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 5 * 60_000) return false;
  const want = createHmac("sha256", key).update(`${ts}.${body}`).digest("hex");
  const a = Buffer.from(want);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
