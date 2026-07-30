import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/admin-session";
import { can, type Actor, type Perm } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";

/**
 * ด่านตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ — ต้องเรียกใน API route ทุกเส้นที่แตะข้อมูลหลังบ้าน
 * การซ่อนปุ่มในหน้าจอกันไม่ได้ เพราะยิง API ตรงได้
 */

/** ผู้ใช้ที่ล็อกอินอยู่ (null = ยังไม่ล็อกอิน / คุกกี้หมดอายุ) */
export async function currentActor(): Promise<Actor | null> {
  const jar = await cookies();
  const s = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  return { username: s.username, name: s.name, role: s.role, department: s.department };
}

/**
 * ตรวจสิทธิ์ — คืน { actor } ถ้าผ่าน, คืน { res } ถ้าไม่ผ่าน (ส่ง res กลับได้เลย)
 *
 *   const gate = await requirePerm("products.manage");
 *   if (gate.res) return gate.res;
 *   // ใช้ gate.actor ต่อได้
 */
export async function requirePerm(
  perm: Perm
): Promise<{ actor: Actor; res: null } | { actor: null; res: NextResponse }> {
  const actor = await currentActor();
  if (!actor) {
    return { actor: null, res: NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 }) };
  }
  if (!can(actor, perm, await loadRolePerms())) {
    return {
      actor: null,
      res: NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 }),
    };
  }
  return { actor, res: null };
}
