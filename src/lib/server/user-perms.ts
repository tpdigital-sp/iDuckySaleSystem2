import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { GRANTABLE_EXTRA_PERMS, type Perm } from "@/lib/permissions";

/**
 * สิทธิ์พิเศษ "รายคน" ที่เจ้าของร้านเปิดให้จากหน้า /admin/staff
 * (ชุดของแผนกอยู่ที่ role-perms.ts — ตัวนี้บวกเพิ่มเฉพาะบางคน เช่น คนที่ไว้ใจให้ยืนยันเงินเข้า)
 *
 * เก็บเป็นแถวพิเศษในตาราง products เหมือน __role_perms__ (ไม่มีตารางแยก)
 * คีย์ = loginKey(username) ตัวเดียวกับที่เก็บใน session cookie
 */
export const USER_PERMS_ID = "__user_perms__";

export type UserPermsMap = Record<string, Perm[]>;

// cache สั้น ๆ — currentActor() ถูกเรียกแทบทุก API route
let cache: { at: number; map: UserPermsMap } | null = null;
const TTL = 10_000;

/** กรองให้เหลือเฉพาะสิทธิ์ที่ "เปิดเป็นรายคนได้" จริง ๆ (กันข้อมูลเก่า/ยัดค่ามั่ว) */
export const sanitizeExtraPerms = (ps: unknown): Perm[] => [
  ...new Set((Array.isArray(ps) ? ps : []).filter((p): p is Perm => GRANTABLE_EXTRA_PERMS.includes(p as Perm))),
];

/** ตารางสิทธิ์รายคนทั้งหมด (ว่าง = ยังไม่เคยเปิดให้ใคร) */
export async function loadUserPerms(): Promise<UserPermsMap> {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  const sb = getSupabaseAdmin();
  if (!sb) return {};
  const { data, error } = await sb.from("products").select("data").eq("id", USER_PERMS_ID).maybeSingle();
  if (error) return {}; // อ่านไม่ได้ → ถือว่าไม่มีสิทธิ์พิเศษ (ปิดไว้ก่อนปลอดภัยกว่า)
  const raw = (data?.data as { users?: Record<string, unknown> } | undefined)?.users ?? {};
  const map: UserPermsMap = {};
  for (const [k, v] of Object.entries(raw)) {
    const perms = sanitizeExtraPerms(v);
    if (perms.length) map[k] = perms;
  }
  cache = { at: Date.now(), map };
  return map;
}

/** สิทธิ์พิเศษของคนคนเดียว (คีย์ต้องเป็น loginKey แล้ว) */
export async function extraPermsOf(loginKeyed: string): Promise<Perm[]> {
  if (!loginKeyed) return [];
  return (await loadUserPerms())[loginKeyed] ?? [];
}

/** บันทึกตารางทั้งใบ — เรียกหลังเจ้าของกดเปิด/ปิดสวิตช์ในหน้าพนักงาน */
export async function saveUserPerms(map: UserPermsMap): Promise<{ error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { error: "ยังไม่ได้ตั้งค่า Supabase" };
  const users: UserPermsMap = {};
  for (const [k, v] of Object.entries(map)) {
    const perms = sanitizeExtraPerms(v);
    if (perms.length) users[k] = perms; // คนที่ไม่เหลือสิทธิ์ = ถอดออกจากตารางไปเลย
  }
  const { error } = await sb.from("products").upsert(
    { id: USER_PERMS_ID, name: "(ตั้งค่าระบบ — สิทธิ์รายคน)", category: "__settings__", price: 0, data: { users } },
    { onConflict: "id" }
  );
  if (error) return { error: error.message };
  invalidateUserPerms();
  return {};
}

/** ล้าง cache หลังบันทึก — ให้สิทธิ์ใหม่มีผลทันที ไม่ต้องรอคนนั้นล็อกอินใหม่ */
export function invalidateUserPerms(): void {
  cache = null;
}
