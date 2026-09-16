import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { bkkYmd } from "@/lib/bangkok-time";
import { isOpenClaim, type Claim } from "@/lib/claims";

/** ของกลางฝั่งเซิร์ฟเวอร์ของระบบเคลม — ใช้ร่วมกันหลาย route */

/** bucket ส่วนตัวเก็บรูปประกอบเคลม (รูปของเสียหายไม่ควร public — เสิร์ฟผ่าน signed url เท่านั้น) */
export const CLAIM_BUCKET = "claim-photos";

/**
 * ชื่อตารางเคลม — ใช้ `product_claims` ไม่ใช่ `claims`
 * เพราะฐานข้อมูลมีตาราง `claims` ค้างอยู่จากดีไซน์เชิงสัมพันธ์รุ่นเก่าที่เลิกใช้แล้ว
 * (คนละโครงสร้าง: order_id เป็น uuid ทั้งที่ออเดอร์จริงเป็นข้อความ OD-xxxxxx-xxxx · ตารางว่าง · ไม่มีโค้ดไหนใช้)
 * เลี่ยงชื่อชนแทนการลบของเก่า — ปลอดภัยกว่าและไม่ต้องแตะข้อมูลที่เราไม่ได้สร้าง
 */
export const CLAIM_TABLE = "product_claims";

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
  const { data } = await sb.from(CLAIM_TABLE).select("data").eq("id", id).maybeSingle();
  return (data?.data as Claim) ?? null;
}

export async function saveClaim(sb: SupabaseClient, claim: Claim): Promise<{ error?: string }> {
  const { error } = await sb
    .from(CLAIM_TABLE)
    .update({ data: { ...claim, photoUrls: undefined, updatedAt: new Date().toISOString() } })
    .eq("id", claim.id);
  return error ? { error: error.message } : {};
}

/** เลขเคส CL-YYMMDD-#### (วันที่ตามเวลาไทย — เซิร์ฟเวอร์เป็น UTC) */
export const newClaimId = () => `CL-${bkkYmd(new Date(), true)}-${Math.floor(1000 + Math.random() * 9000)}`;

/** เคสที่ยังเดินเรื่องอยู่ของออเดอร์นี้ (ออเดอร์เดียวมีได้ทีละใบ) — null = ไม่มี · error = ถามฐานไม่ได้ */
export async function findOpenClaimByOrder(
  sb: SupabaseClient,
  orderId: string,
): Promise<{ claim: Claim | null; error?: { code?: string; message: string } }> {
  const { data, error } = await sb.from(CLAIM_TABLE).select("data").eq("data->>orderId", orderId);
  if (error) return { claim: null, error };
  return { claim: ((data ?? []).map((r) => r.data as Claim).find(isOpenClaim) ?? null) };
}

/** บันทึกเคสใหม่ — id ชนกัน (โอกาสน้อยมาก) สุ่มใหม่อีกรอบ · คืน error เป็นข้อความ */
export async function insertClaim(sb: SupabaseClient, claim: Claim): Promise<{ error?: string }> {
  let { error } = await sb.from(CLAIM_TABLE).insert({ id: claim.id, data: { ...claim, photoUrls: undefined } });
  if (error && /duplicate|unique/i.test(error.message)) {
    claim.id = newClaimId();
    ({ error } = await sb.from(CLAIM_TABLE).insert({ id: claim.id, data: { ...claim, photoUrls: undefined } }));
  }
  return error ? { error: error.message } : {};
}
