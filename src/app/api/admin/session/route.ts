import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isFirebaseAdminConfigured } from "@/lib/server/firebase-admin";
import {
  SESSION_COOKIE,
  adminCookieOptions,
  createSessionToken,
  verifySessionToken,
} from "@/lib/server/admin-session";
import { ALL_PERMS, permsOf, roleLabel } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  const session = verifySessionToken(jar.get(SESSION_COOKIE)?.value);

  const actor = session
    ? { username: session.username, name: session.name, role: session.role, department: session.department }
    : null;

  const res = NextResponse.json({
    // ไม่ได้ตั้งค่า Firebase → โหมดเดโม (เข้าได้เลย + สิทธิ์เต็มสำหรับทดลองใช้)
    configured: isFirebaseAdminConfigured,
    loggedIn: !!session,
    name: session?.name ?? session?.username ?? null,
    role: roleLabel(actor),
    perms: isFirebaseAdminConfigured ? permsOf(actor) : ALL_PERMS,
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
