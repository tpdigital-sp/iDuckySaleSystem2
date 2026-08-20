import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Claim } from "@/lib/claims";

/** ของกลางฝั่งเซิร์ฟเวอร์ของระบบเคลม — ใช้ร่วมกันหลาย route */

/** bucket ส่วนตัวเก็บรูปประกอบเคลม (รูปของเสียหายไม่ควร public — เสิร์ฟผ่าน signed url เท่านั้น) */
export const CLAIM_BUCKET = "claim-photos";

/** ยืนยันตัวลูกค้าจาก Authorization: Bearer <token> (แบบเดียวกับ /api/orders/mine) */
export async function bearerUser(sb: SupabaseClient, req: Request): Promise<User | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user;
}

/** ตาราง claims ยังไม่ได้สร้าง (ยังไม่ได้รัน supabase/claims.sql) */
export function isMissingTable(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);
}

/** เติม photoUrls (signed 1 ชม.) ให้เคลมก่อนส่งออก — path เก็บในฐาน แต่ URL เซ็นสดเสมอ */
export async function withSignedPhotos(sb: SupabaseClient, claim: Claim): Promise<Claim> {
  if (!claim.photoPaths?.length) return { ...claim, photoUrls: [] };
  const { data } = await sb.storage.from(CLAIM_BUCKET).createSignedUrls(claim.photoPaths, 3600);
  return { ...claim, photoUrls: (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u) };
}

export async function loadClaim(sb: SupabaseClient, id: string): Promise<Claim | null> {
  const { data } = await sb.from("claims").select("data").eq("id", id).maybeSingle();
  return (data?.data as Claim) ?? null;
}

export async function saveClaim(sb: SupabaseClient, claim: Claim): Promise<{ error?: string }> {
  const { error } = await sb
    .from("claims")
    .update({ data: { ...claim, photoUrls: undefined, updatedAt: new Date().toISOString() } })
    .eq("id", claim.id);
  return error ? { error: error.message } : {};
}
