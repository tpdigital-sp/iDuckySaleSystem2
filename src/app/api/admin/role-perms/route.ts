import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { invalidateRolePerms, loadRolePerms, ROLE_PERMS_ID } from "@/lib/server/role-perms";
import { ALL_PERMS, DEFAULT_ROLE_PERMS, ROLE_ADMINISTRATOR, type Perm, type RolePermsMap } from "@/lib/permissions";

export const runtime = "nodejs";

/** ชุดสิทธิ์บทบาทปัจจุบัน (ค่าที่แก้แล้ว หรือค่าเริ่มต้น) + คนนี้แก้ได้ไหม */
export async function GET() {
  const gate = await requirePerm("admin.access");
  if (gate.res) return gate.res;
  const map = (await loadRolePerms()) ?? DEFAULT_ROLE_PERMS;
  return NextResponse.json({
    roles: map,
    // แก้ชุดสิทธิ์ได้เฉพาะผู้ดูแลระบบ (พนง.แอดมินดูได้อย่างเดียว)
    editable: gate.actor.role === ROLE_ADMINISTRATOR,
  });
}

/** บันทึกชุดสิทธิ์ทั้งตาราง — เฉพาะผู้ดูแลระบบเท่านั้น (บังคับที่นี่ ไม่ใช่แค่ซ่อนปุ่ม) */
export async function PUT(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("admin.access");
  if (gate.res) return gate.res;
  if (gate.actor.role !== ROLE_ADMINISTRATOR)
    return NextResponse.json({ error: "แก้บทบาทได้เฉพาะผู้ดูแลระบบ" }, { status: 403 });

  let body: { roles?: Record<string, string[]> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const raw = body.roles;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });

  const roles: RolePermsMap = {};
  for (const [k, v] of Object.entries(raw)) {
    const name = k.trim().slice(0, 30);
    if (!name || name === ROLE_ADMINISTRATOR || name === "ผู้ดูแลระบบ") continue; // ผู้ดูแลระบบแก้ไม่ได้ (ได้ทุกสิทธิ์เสมอ)
    const perms = [...new Set((Array.isArray(v) ? v : []).filter((p): p is Perm => ALL_PERMS.includes(p as Perm)))];
    // มีสิทธิ์อื่นแต่ลืมติ๊กเข้าหลังบ้าน → เติมให้ (ไม่งั้นล็อกอินไม่ได้ทั้งที่ตั้งใจให้ทำงาน)
    if (perms.length && !perms.includes("admin.access")) perms.unshift("admin.access");
    roles[name] = perms;
    if (Object.keys(roles).length >= 20) break; // กันบวม
  }
  if (Object.keys(roles).length === 0)
    return NextResponse.json({ error: "ต้องมีบทบาทอย่างน้อย 1 ตำแหน่ง" }, { status: 400 });

  const { error } = await sb
    .from("products")
    .upsert(
      { id: ROLE_PERMS_ID, name: "(ตั้งค่าระบบ — สิทธิ์บทบาท)", category: "__settings__", price: 0, data: { roles } },
      { onConflict: "id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateRolePerms();
  return NextResponse.json({ ok: true, roles });
}
