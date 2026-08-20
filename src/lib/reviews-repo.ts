"use client";

/** ตัวกลางเรียก API ระบบรีวิวฝั่งลูกค้า */

import { getAccessToken } from "./customer-auth";
import type { PublicReview, Review, ReviewStats } from "./reviews";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** รีวิวสาธารณะของสินค้า (หน้าสินค้าเรียก — ไม่ต้องล็อกอิน) */
export async function fetchProductReviews(productId: string): Promise<{ reviews: PublicReview[]; stats: ReviewStats | null }> {
  try {
    const res = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    return { reviews: j.reviews ?? [], stats: j.stats ?? null };
  } catch {
    return { reviews: [], stats: null };
  }
}

export async function fetchMyReviews(): Promise<{ reviews: Review[]; needsSetup?: boolean }> {
  try {
    const res = await fetch("/api/reviews/mine", { headers: await authHeaders(), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    return { reviews: j.reviews ?? [], needsSetup: j.needsSetup };
  } catch {
    return { reviews: [] };
  }
}

export async function submitReview(input: {
  orderId: string;
  productId: string;
  score: number;
  text?: string;
  displayName?: string;
  photoUrls?: string[];
}): Promise<{ ok: boolean; review?: Review; error?: string }> {
  try {
    const res = await fetch("/api/reviews", { method: "POST", headers: await authHeaders(), body: JSON.stringify(input) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, review: j.review } : { ok: false, error: j.error ?? "ส่งรีวิวไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}
