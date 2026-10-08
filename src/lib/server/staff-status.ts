import "server-only";
import { EMPLOYEE_COLLECTION, getFirestoreAdmin, isFirebaseAdminConfigured, loginKey } from "@/lib/server/firebase-admin";
import { WORK_STATUS_ACTIVE } from "@/lib/permissions";

/**
 * 👮 สถานะพนักงาน "สด" สำหรับทุกคำขอหลังบ้าน (ตรวจความปลอดภัยรอบ 2 · 8 ต.ค. 69)
 *
 * ปัญหาเดิม: คุกกี้ session เป็น HMAC ไม่พึ่งฐาน และต่ออายุเลื่อนไปเรื่อย ๆ ตราบใดที่ยังใช้งาน
 * → พนักงานที่ถูกระงับ (/admin/staff) หรือพ้นสภาพใน TP (workStatus) ยังเข้าหลังบ้านได้ต่อ
 *   จนกว่าคุกกี้จะหมดอายุเอง (30 วัน — หรือไม่มีวันหมดถ้ายังเปิดใช้อยู่) · การเปลี่ยนตำแหน่ง/แผนกก็ไม่มีผลจนกว่าจะล็อกอินใหม่
 *
 * ทางแก้: อ่าน employees2 ทั้งชุดครั้งเดียวทุก 60 วิ (ต่ออินสแตนซ์ — ล็อกอินอ่านทั้งชุดทุกครั้งอยู่แล้ว ถูกกว่านั้นอีก)
 * แล้วให้ currentActor() เทียบทุกคำขอ: ไม่ผ่าน = เหมือนไม่ได้ล็อกอิน · ผ่าน = ใช้ตำแหน่ง/แผนกล่าสุดจากฐานแทนค่าในคุกกี้
 *
 * กติกาเมื่อฐานล่ม/อ่านไม่ได้: ใช้ชุดล่าสุดที่เคยอ่านได้ · ไม่เคยอ่านได้เลย = ไม่ขวาง (fail-open) กันล็อกทั้งร้านออกจากระบบ
 * โหมดเดโม (ไม่ได้ตั้ง Firebase) = ไม่ตรวจ
 */
export interface StaffStatus {
  active: boolean;
  role: string;
  department?: string;
  name?: string;
}

const TTL_MS = 60_000;
let cache: { at: number; map: Map<string, StaffStatus> } | null = null;
let inflight: Promise<Map<string, StaffStatus>> | null = null;

type Emp = {
  username?: string;
  role?: string;
  name?: string;
  department?: string;
  isSuspended?: boolean;
  iduckySuspended?: boolean;
  workStatus?: string;
};

async function loadAll(): Promise<Map<string, StaffStatus>> {
  const db = getFirestoreAdmin();
  if (!db) return new Map();
  const rows = await db.collection(EMPLOYEE_COLLECTION).get();
  const map = new Map<string, StaffStatus>();
  for (const d of rows.docs) {
    const e = d.data() as Emp;
    const k = loginKey(e.username ?? "");
    if (!k) continue;
    map.set(k, {
      active: e.isSuspended !== true && e.workStatus === WORK_STATUS_ACTIVE && e.iduckySuspended !== true,
      role: e.role ?? "",
      department: e.department,
      name: e.name,
    });
  }
  return map;
}

async function snapshot(): Promise<Map<string, StaffStatus> | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  if (!inflight) {
    inflight = loadAll()
      .then((map) => {
        cache = { at: Date.now(), map };
        return map;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch {
    return cache?.map ?? null; // อ่านไม่ได้ → ชุดเก่า (ไม่มี = null = ไม่ตรวจ)
  }
}

/**
 * สถานะของพนักงานคนนี้ (username ต้องเป็น loginKey แล้ว — ค่าเดียวกับที่อยู่ในคุกกี้)
 *  - null = ตรวจไม่ได้/โหมดเดโม → ผู้เรียกใช้ค่าในคุกกี้ต่อไป
 *  - { active: false } = ถูกระงับ/พ้นสภาพ/ไม่มีชื่อในทะเบียนแล้ว → ต้องปฏิเสธ
 */
export async function staffStatusOf(usernameKey: string): Promise<StaffStatus | null> {
  if (!isFirebaseAdminConfigured) return null;
  const map = await snapshot();
  if (!map) return null;
  return map.get(usernameKey) ?? { active: false, role: "" };
}

/** ล้าง cache หลังหน้า /admin/staff บันทึก — ให้การระงับมีผลทันทีบนอินสแตนซ์นี้ */
export function invalidateStaffStatus(): void {
  cache = null;
}
