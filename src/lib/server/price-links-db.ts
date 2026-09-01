import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { PriceLink } from "@/lib/price-links";

const TABLE = "price_links";

/** อ่านลิงก์ราคาจากโค้ดสั้น (null = ไม่มี / ยังไม่ได้สร้างตาราง) */
export async function getPriceLink(code: string): Promise<PriceLink | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.from(TABLE).select("data").eq("code", code).maybeSingle();
  if (error || !data) return null;
  return (data.data as PriceLink) ?? null;
}

/**
 * นับว่าลูกค้าเปิดดูแล้ว — แอดมินจะได้รู้ว่าควรตามต่อไหม
 * ล้มเหลวก็ช่างมัน (ตัวนับพลาดไม่ควรทำให้ลูกค้าเปิดการ์ดไม่ได้)
 */
export async function bumpPriceLinkOpened(link: PriceLink): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const next: PriceLink = { ...link, opened: (link.opened ?? 0) + 1, lastOpenedAt: new Date().toISOString() };
  await sb.from(TABLE).update({ data: next }).eq("code", link.code);
}
