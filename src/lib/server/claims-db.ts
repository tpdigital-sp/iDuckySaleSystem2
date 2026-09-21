import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { bkkYmd } from "@/lib/bangkok-time";
import { isOpenClaim, type Claim } from "@/lib/claims";
import type { Order } from "@/lib/admin-data";
import { notifyCustomer } from "@/lib/server/notify";

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

/** เคสทุกใบที่เกี่ยวกับออเดอร์นี้ — ทั้งที่เคลมออเดอร์นี้ และที่ออเดอร์นี้เป็นงานผลิตใหม่ของเคส (ไว้ขึ้นป้ายในหน้าออเดอร์) */
export async function claimsOfOrder(sb: SupabaseClient, orderId: string): Promise<Claim[]> {
  const { data } = await sb
    .from(CLAIM_TABLE)
    .select("data")
    .or(`data->>orderId.eq.${orderId},data->resolution->>redoOrderId.eq.${orderId}`)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => r.data as Claim).filter((c) => !!c?.id);
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const CLAIM_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

/**
 * ตั๋วอัปโหลดรูปประกอบเคลม — เบราว์เซอร์ยิงไฟล์เข้า Supabase ตรง (เพดาน body ของ Netlify ~4.5MB จึงห้ามส่งผ่าน API)
 * bucket "ส่วนตัว" — ไม่มี public URL อ่านผ่าน signed url ที่ API เซ็นให้เท่านั้น · ใช้ร่วมกันทั้งเส้นลูกค้าและเส้นแอดมิน
 */
export async function signClaimUpload(
  sb: SupabaseClient,
  type: string,
  size: number,
): Promise<{ ok: true; bucket: string; path: string; token: string } | { ok: false; error: string; status: number }> {
  const ext = EXT[type];
  if (!ext) return { ok: false, error: "รองรับเฉพาะไฟล์ JPG / PNG / WEBP", status: 400 };
  if (size > CLAIM_PHOTO_MAX_BYTES) return { ok: false, error: `ไฟล์ใหญ่เกิน ${CLAIM_PHOTO_MAX_BYTES / 1024 / 1024}MB`, status: 400 };

  const path = `claims/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const sign = () => sb.storage.from(CLAIM_BUCKET).createSignedUploadUrl(path);
  let { data, error } = await sign();
  // Supabase ตอบ bucket หายได้ 2 สำนวน: "Bucket not found" / "The related resource does not exist"
  if (error && /bucket not found|related resource does not exist/i.test(error.message)) {
    await sb.storage.createBucket(CLAIM_BUCKET, { public: false, fileSizeLimit: `${CLAIM_PHOTO_MAX_BYTES}` });
    ({ data, error } = await sign());
  }
  if (error || !data?.token)
    return { ok: false, error: `ขอตั๋วอัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง${error ? ` (${error.message})` : ""}`, status: 500 };
  return { ok: true, bucket: CLAIM_BUCKET, path, token: data.token };
}

/** path รูปต้องเป็นของ bucket เคลมที่เราเซ็นให้เอง — กันยัด path มั่วมาให้เซิร์ฟเวอร์เซ็น */
export const CLAIM_PHOTO_PATH_RE = /^claims\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * 🔔 แจ้งลูกค้าทาง LINE ว่ารับเรื่องเคลมแล้ว (เคสที่ทีมงานเปิด) — ผลลง claim.log ให้เห็นในหน้าเคลมว่าส่งถึงหรือไม่
 * ไม่ persist เอง: เรียกก่อน insertClaim/saveClaim แล้วเซฟรอบเดียว
 */
export async function notifyClaimOpened(sb: SupabaseClient, order: Order, claim: Claim, by: string): Promise<void> {
  const redo = claim.resolution?.redoOrderId;
  const lines = [
    `🧰 รับเรื่องเคลมแล้วค่ะ เลขที่ ${claim.id} (ออเดอร์ ${claim.orderId})`,
    `ประเภท: ${claim.type}`,
    claim.detail ? `รายละเอียด: ${claim.detail.slice(0, 300)}` : null,
    redo ? `ทีมงานกำลังผลิตใหม่ให้ (ออเดอร์ ${redo}) ไม่มีค่าใช้จ่ายเพิ่ม` : "ทีมงานกำลังตรวจสอบ จะแจ้งแนวทางให้ทราบอีกครั้งค่ะ",
    claim.customerId ? "ติดตามได้ที่หน้า บัญชีของฉัน › แจ้งปัญหา/เคลมสินค้า" : null,
  ].filter(Boolean) as string[];
  const r = await notifyCustomer(sb, order, lines.join("\n"));
  const at = new Date().toISOString();
  claim.log = [
    ...(claim.log ?? []),
    { at, by, action: r.ok ? "แจ้งลูกค้าทาง LINE แล้ว (รับเรื่องเคลม)" : `แจ้งลูกค้าทาง LINE ไม่ได้: ${r.reason ?? "ไม่ทราบสาเหตุ"}` },
  ];
}
