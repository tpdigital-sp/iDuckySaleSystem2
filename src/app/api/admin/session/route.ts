import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isFirebaseAdminConfigured } from "@/lib/server/firebase-admin";
import {
  SESSION_COOKIE,
  adminCookieOptions,
  createSessionToken,
  verifySessionToken,
} from "@/lib/server/admin-session";
import { ALL_PERMS, permsOf, roleLabel, ROLE_ADMINISTRATOR } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { extraPermsOf } from "@/lib/server/user-perms";
import { staffStatusOf } from "@/lib/server/staff-status";

export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  let session = verifySessionToken(jar.get(SESSION_COOKIE)?.value);

  // 👮 ถูกระงับ/พ้นสภาพแล้ว = ถือว่าไม่ได้ล็อกอิน (ลบคุกกี้ทิ้ง ไม่ต่ออายุให้) · ตำแหน่ง/แผนกใช้ค่าสดจากฐาน
  // ⚡ 20 ต.ค. 69 ทุกหน้าหลังบ้านรอคำขอนี้ก่อนแสดงเนื้อหา — เดิมอ่านทะเบียนพนักงาน → สิทธิ์รายคน → สิทธิ์ตามตำแหน่ง ต่อกัน (เย็น ~0.9 วิ) → อ่านพร้อมกัน
  const [live, extraPerms, rolePerms] = await Promise.all([
    session ? staffStatusOf(session.username) : Promise.resolve(null),
    session ? extraPermsOf(session.username) : Promise.resolve([]),
    isFirebaseAdminConfigured ? loadRolePerms() : Promise.resolve(undefined),
  ]);
  if (session && live && !live.active) {
    jar.delete(SESSION_COOKIE);
    session = null;
  } else if (session && live) {
    session = { ...session, name: live.name ?? session.name, role: live.role || session.role, department: live.department };
  }

  const actor = session
    ? {
        username: session.username,
        name: session.name,
        role: session.role,
        department: session.department,
        // สิทธิ์พิเศษรายคน (เช่น ยืนยันเงินเข้า) — อ่านสดทุกครั้ง ไม่ได้ฝังในคุกกี้
        extraPerms,
      }
    : null;

  const res = NextResponse.json({
    // ไม่ได้ตั้งค่า Firebase → โหมดเดโม (เข้าได้เลย + สิทธิ์เต็มสำหรับทดลองใช้)
    configured: isFirebaseAdminConfigured,
    loggedIn: !!session,
    name: session?.name ?? session?.username ?? null,
    username: session?.username ?? null,
    role: roleLabel(actor),
    perms: isFirebaseAdminConfigured ? permsOf(actor, rolePerms) : ALL_PERMS,
    // ผู้ดูแลระบบ = เห็น/แก้ของที่อ่อนไหวได้ (บัญชีร้าน · บทบาท · เชื่อม Google) · โหมดเดโมถือว่าใช่
    isAdministrator: !isFirebaseAdminConfigured || actor?.role === ROLE_ADMINISTRATOR,
  });

  // ต่ออายุแบบ sliding: ยังล็อกอินอยู่ → รีเฟรชคุกกี้ให้หมดอายุเลื่อนออกไปอีก 30 วัน
  if (session) {
    const token = createSessionToken({
      username: session.username,
      name: session.name,
      role: session.role,
      department: session.department,
    });
    res.cookies.set(SESSION_COOKIE, token, adminCookieOptions());
  }

  return res;
}
