import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import type { PublicReview, Review, ReviewStats } from "@/lib/reviews";

/** ของกลางฝั่งเซิร์ฟเวอร์ของระบบรีวิว */

export function isMissingTable(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);
}

/** ตัดข้อมูลส่วนตัวก่อนส่งขึ้นหน้าสินค้า */
export function toPublic(r: Review): PublicReview {
  return { id: r.id, productId: r.productId, displayName: r.displayName, score: r.score, text: r.text, photoUrls: r.photoUrls, reply: r.reply, createdAt: r.createdAt };
}

/** รีวิวที่ "แสดง" ของสินค้า — ใหม่สุดก่อน */
export async function fetchShownReviews(sb: SupabaseClient, productId: string): Promise<Review[] | null> {
  const { data, error } = await sb
    .from("reviews")
    .select("data")
    .eq("data->>productId", productId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return null;
  return (data ?? []).map((r) => r.data as Review).filter((r) => r.status === "แสดง");
}

export function statsOf(reviews: Review[]): ReviewStats | null {
  if (!reviews.length) return null;
  const avg = reviews.reduce((s, r) => s + r.score, 0) / reviews.length;
  return { count: reviews.length, avg: Math.round(avg * 10) / 10 };
}

/**
 * สรุปคะแนนสินค้า (ฝั่งเซิร์ฟเวอร์) — ให้หน้าสินค้าใส่ aggregateRating ลง JSON-LD ตั้งแต่ HTML แรก
 * พังที่ไหนก็คืน null (หน้าไม่ล้มเพราะรีวิว)
 */
export async function fetchProductReviewStats(productId: string): Promise<ReviewStats | null> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const shown = await fetchShownReviews(sb, productId);
    return shown ? statsOf(shown) : null;
  } catch {
    return null;
  }
}
