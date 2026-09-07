import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * 🤝 ทะเบียนตัวแทนจำหน่าย — บัญชีสมาชิก (Supabase auth) ที่ได้สิทธิ์เห็น/สั่งเรทราคาตัวแทน
 *
 * เก็บเป็นแถวพิเศษในตาราง products เหมือน __user_perms__ (ไม่มีตารางแยก) คีย์ = uid ของ auth.users
 * ⚠️ ห้ามเก็บสถานะตัวแทนใน user_metadata — ลูกค้าเขียนทับเองได้ผ่าน updateProfile (customer-auth.ts)
 * ⚠️ แถวนี้อ่าน public ได้ (RLS products เปิด select) — เก็บแค่ uid ทึบ ๆ + โน้ต ห้ามใส่ชื่อ/อีเมล/เบอร์
 *   (ชื่อ-อีเมลให้ /api/admin/dealers ไป join สดจาก auth.admin.listUsers ตอนแอดมินเปิดดู)
 */
export const DEALERS_ID = "__dealers__";

export interface DealerEntry {
  /** โน้ตของแอดมิน เช่น ชื่อร้านตัวแทน (อย่าใส่ข้อมูลส่วนตัวลูกค้า — แถวนี้อ่าน public ได้) */
  note?: string;
  /** วันที่เพิ่มเป็นตัวแทน (ISO) */
  since: string;
}

export type DealersMap = Record<string, DealerEntry>;

// cache สั้น ๆ — ถูกเช็คทุกครั้งที่มีออเดอร์เข้า
let cache: { at: number; map: DealersMap } | null = null;
const TTL = 10_000;

/** ทะเบียนตัวแทนทั้งหมด (ว่าง = ยังไม่มีตัวแทน) */
export async function loadDealers(): Promise<DealersMap> {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  const sb = getSupabaseAdmin();
  if (!sb) return {};
  const { data, error } = await sb.from("products").select("data").eq("id", DEALERS_ID).maybeSingle();
  if (error) return {}; // อ่านไม่ได้ → ถือว่าไม่ใช่ตัวแทน (ปิดไว้ก่อนปลอดภัยกว่า)
  const raw = (data?.data as { users?: Record<string, unknown> } | undefined)?.users ?? {};
  const map: DealersMap = {};
  for (const [uid, v] of Object.entries(raw)) {
    if (!uid) continue;
    const e = (v ?? {}) as Partial<DealerEntry>;
    map[uid] = { since: typeof e.since === "string" ? e.since : "", ...(e.note ? { note: String(e.note) } : {}) };
  }
  cache = { at: Date.now(), map };
  return map;
}

/** บัญชีนี้เป็นตัวแทนจำหน่ายไหม */
export async function isDealerUid(uid: string | undefined | null): Promise<boolean> {
  if (!uid) return false;
  return uid in (await loadDealers());
}

/** บันทึกทะเบียนทั้งใบ — เรียกจากหน้า /admin/dealers เท่านั้น (service role) */
export async function saveDealers(map: DealersMap): Promise<{ error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { error: "ยังไม่ได้ตั้งค่า Supabase" };
  const { error } = await sb.from("products").upsert(
    {
      id: DEALERS_ID,
      name: "(ตั้งค่าระบบ — ตัวแทนจำหน่าย)",
      category: "__settings__",
      price: 0,
      data: { users: map },
    },
    { onConflict: "id" }
  );
  if (error) return { error: error.message };
  invalidateDealers();
  return {};
}

/** ล้าง cache หลังบันทึก — ให้สถานะใหม่มีผลทันที */
export function invalidateDealers(): void {
  cache = null;
}
