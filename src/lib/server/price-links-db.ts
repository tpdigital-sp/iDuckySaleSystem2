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
 * สินค้าตัวนี้บังคับแนบลายก่อนสั่งไหม (อ่านฟิลด์เดียว ไม่ดึงทั้งสินค้า — การ์ดต้องเบา)
 * ใช้บอกบนการ์ดว่า "ต้องวางรูปก่อนถึงจะสั่งได้" — ไม่งั้นลูกค้ากด "สั่งตามสเปคนี้" แล้วไปค้างที่หน้าสินค้าโดยไม่รู้ว่าติดอะไร
 * อ่านไม่ได้ = ถือว่าไม่บังคับ (หน้าสินค้ายังกั้นให้อีกชั้นอยู่แล้ว)
 */
export async function productArtworkRequired(productId: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  if (!sb) return false;
  const { data, error } = await sb.from("products").select("data->artworkRequired").eq("id", productId).maybeSingle();
  if (error || !data) return false;
  // ค่าเริ่มต้นของสินค้าคือ "บังคับ" (artworkIsRequired: artworkRequired !== false)
  return (data as { artworkRequired?: unknown }).artworkRequired !== false;
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
