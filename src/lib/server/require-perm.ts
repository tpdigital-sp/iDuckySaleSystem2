import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/admin-session";
import { can, type Actor, type Perm } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { extraPermsOf } from "@/lib/server/user-perms";
import { staffStatusOf } from "@/lib/server/staff-status";

/**
 * ด่านตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ — ต้องเรียกใน API route ทุกเส้นที่แตะข้อมูลหลังบ้าน
 * การซ่อนปุ่มในหน้าจอกันไม่ได้ เพราะยิง API ตรงได้
 */

/**
 * ผู้ใช้ที่ล็อกอินอยู่ (null = ยังไม่ล็อกอิน / คุกกี้หมดอายุ)
 *
 * สิทธิ์พิเศษรายคนอ่านสด ๆ จาก DB (ไม่ฝังในคุกกี้) — เจ้าของกดปิดสิทธิ์แล้วมีผลทันที
 * ถ้าฝังในคุกกี้ คนที่ถูกถอดสิทธิ์จะยังยืนยันเงินได้จนกว่าคุกกี้จะหมดอายุ (30 วัน)
 */
export async function currentActor(): Promise<Actor | null> {
  const jar = await cookies();
  const s = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  /**
   * 👮 เทียบทะเบียนพนักงานสดทุกคำขอ (cache 60 วิ) — ถูกระงับ/พ้นสภาพ = เหมือนไม่ได้ล็อกอิน
   * และใช้ตำแหน่ง/แผนกล่าสุดจากฐานแทนค่าที่ฝังในคุกกี้ (เดิมมีผลต่อเมื่อล็อกอินใหม่ · ดู staff-status.ts)
   */
  // ⚡ 20 ต.ค. 69 หน้าแชทหน่วง 2-3 วิ: เดิมอ่านทะเบียนพนักงาน → สิทธิ์เพิ่มรายคน ต่อกัน (เย็น ~0.8 วิ ทุกครั้งที่แคชหมด) → อ่านพร้อมกัน
  const [live, extraPerms] = await Promise.all([staffStatusOf(s.username), extraPermsOf(s.username)]);
  if (live && !live.active) return null;
  return {
    username: s.username,
    name: live?.name ?? s.name,
    role: live?.role || s.role,
    department: live ? live.department : s.department,
    extraPerms,
  };
}

/**
 * ตรวจสิทธิ์ — คืน { actor } ถ้าผ่าน, คืน { res } ถ้าไม่ผ่าน (ส่ง res กลับได้เลย)
 *
 *   const gate = await requirePerm("products.manage");
 *   if (gate.res) return gate.res;
 *   // ใช้ gate.actor ต่อได้
 *
 * ส่งเป็นอาร์เรย์ = มีสิทธิ์ข้อใดข้อหนึ่งก็ผ่าน (เช่นอัปโหลดรูป ใช้ได้ทั้งฝ่ายสินค้าและคนตั้งค่าระบบ)
 */
export async function requirePerm(
  perm: Perm | Perm[]
): Promise<{ actor: Actor; res: null } | { actor: null; res: NextResponse }> {
  // สิทธิ์ตามตำแหน่ง (แคช 10 วิ) อ่านพร้อมกับตัวตนผู้ใช้ ไม่ต้องรอต่อคิว
  const [actor, rolePerms] = await Promise.all([currentActor(), loadRolePerms()]);
  if (!actor) {
    return { actor: null, res: NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 }) };
  }
  const wanted = Array.isArray(perm) ? perm : [perm];
  if (!wanted.some((p) => can(actor, p, rolePerms))) {
    return {
      actor: null,
      res: NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 }),
    };
  }
  return { actor, res: null };
}
