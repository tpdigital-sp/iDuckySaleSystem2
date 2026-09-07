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

/** 📝 ใบสมัครตัวแทน — ลูกค้ากรอกเองจากหน้า /dealer รอแอดมินอนุมัติที่ /admin/dealers */
export interface DealerApplication {
  /** ชื่อร้าน/ธุรกิจของผู้สมัคร (ผู้สมัครกรอกเอง — แถวนี้อ่าน public ได้ อย่าเก็บอะไรมากกว่านี้) */
  shopName: string;
  /** ช่องทางขาย เช่น IG/Facebook/หน้าร้าน */
  channel: string;
  /** รายละเอียดเพิ่มเติม (ไม่บังคับ) */
  detail?: string;
  /** วันที่สมัคร (ISO) — สมัครซ้ำ = อัปเดตใบเดิม เวลาเดินตามครั้งล่าสุด */
  at: string;
}

export type DealerApplicationsMap = Record<string, DealerApplication>;

/** ทั้งเอกสาร: ตัวแทนที่อนุมัติแล้ว + ใบสมัครที่รออนุมัติ (คนละก้อน ไม่ปนกัน) */
export interface DealersDoc {
  users: DealersMap;
  applications: DealerApplicationsMap;
}

// cache สั้น ๆ — ถูกเช็คทุกครั้งที่มีออเดอร์เข้า
let cache: { at: number; doc: DealersDoc } | null = null;
const TTL = 10_000;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** ทะเบียน + ใบสมัครทั้งเอกสาร (ว่าง = ยังไม่มี) */
export async function loadDealersDoc(): Promise<DealersDoc> {
  if (cache && Date.now() - cache.at < TTL) return cache.doc;
  const empty: DealersDoc = { users: {}, applications: {} };
  const sb = getSupabaseAdmin();
  if (!sb) return empty;
  const { data, error } = await sb.from("products").select("data").eq("id", DEALERS_ID).maybeSingle();
  if (error) return empty; // อ่านไม่ได้ → ถือว่าไม่ใช่ตัวแทน (ปิดไว้ก่อนปลอดภัยกว่า)
  const raw = (data?.data as { users?: Record<string, unknown>; applications?: Record<string, unknown> } | undefined) ?? {};
  const doc: DealersDoc = { users: {}, applications: {} };
  for (const [uid, v] of Object.entries(raw.users ?? {})) {
    if (!uid) continue;
    const e = (v ?? {}) as Partial<DealerEntry>;
    doc.users[uid] = { since: typeof e.since === "string" ? e.since : "", ...(e.note ? { note: String(e.note) } : {}) };
  }
  for (const [uid, v] of Object.entries(raw.applications ?? {})) {
    if (!uid) continue;
    const a = (v ?? {}) as Partial<DealerApplication>;
    if (!a.shopName) continue;
    doc.applications[uid] = {
      shopName: str(a.shopName, 120),
      channel: str(a.channel, 200),
      at: typeof a.at === "string" ? a.at : "",
      ...(a.detail ? { detail: str(a.detail, 500) } : {}),
    };
  }
  cache = { at: Date.now(), doc };
  return doc;
}

/** ทะเบียนตัวแทนทั้งหมด (ว่าง = ยังไม่มีตัวแทน) */
export async function loadDealers(): Promise<DealersMap> {
  return (await loadDealersDoc()).users;
}

/** บัญชีนี้เป็นตัวแทนจำหน่ายไหม */
export async function isDealerUid(uid: string | undefined | null): Promise<boolean> {
  if (!uid) return false;
  return uid in (await loadDealers());
}

/** บันทึกทั้งเอกสาร (ทะเบียน + ใบสมัคร) — service role เท่านั้น · เขียนแยกก้อนไม่ได้ กันเขียนทับกันหาย */
export async function saveDealersDoc(doc: DealersDoc): Promise<{ error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { error: "ยังไม่ได้ตั้งค่า Supabase" };
  const { error } = await sb.from("products").upsert(
    {
      id: DEALERS_ID,
      name: "(ตั้งค่าระบบ — ตัวแทนจำหน่าย)",
      category: "__settings__",
      price: 0,
      data: { users: doc.users, applications: doc.applications },
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
