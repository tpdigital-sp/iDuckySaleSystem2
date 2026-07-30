import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { RolePermsMap } from "@/lib/permissions";

/**
 * ชุดสิทธิ์บทบาทที่แอดมินแก้เองจากหน้า ตั้งค่าระบบ → แท็บบทบาท
 * เก็บเป็นแถวพิเศษในตาราง products (แถวแยกจากตั้งค่าร้าน — กันโดนทับตอนบันทึกตั้งค่าอื่น)
 */
export const ROLE_PERMS_ID = "__role_perms__";

// cache สั้น ๆ กัน query ซ้ำทุก request (requirePerm ถูกเรียกแทบทุก API)
let cache: { at: number; map: RolePermsMap | null } | null = null;
const TTL = 10_000;

/** โหลดชุดสิทธิ์จาก DB — undefined = ยังไม่เคยแก้ ให้ใช้ค่าเริ่มต้นในโค้ด */
export async function loadRolePerms(): Promise<RolePermsMap | undefined> {
  if (cache && Date.now() - cache.at < TTL) return cache.map ?? undefined;
  const sb = getSupabaseAdmin();
  if (!sb) return undefined;
  const { data, error } = await sb.from("products").select("data").eq("id", ROLE_PERMS_ID).maybeSingle();
  if (error) return undefined; // อ่านไม่ได้ → ใช้ค่าเริ่มต้น (ปลอดภัยกว่าล็อกทุกคนออก)
  const map = ((data?.data as { roles?: RolePermsMap } | undefined)?.roles ?? null) as RolePermsMap | null;
  cache = { at: Date.now(), map };
  return map ?? undefined;
}

/** ล้าง cache หลังบันทึก — ให้สิทธิ์ใหม่มีผลทันทีใน instance นี้ */
export function invalidateRolePerms(): void {
  cache = null;
}
