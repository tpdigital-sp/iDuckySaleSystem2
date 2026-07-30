import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { EMPLOYEE_COLLECTION, getFirestoreAdmin, normalizeUsername } from "@/lib/server/firebase-admin";
import { can, DEFAULT_ROLE_PERMS, ROLE_ADMINISTRATOR, ROLE_STAFF } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";

export const runtime = "nodejs";

interface EmpDoc {
  username?: string;
  name?: string;
  /** ชื่อ-นามสกุลเต็ม (name = ชื่อเล่น) */
  fullname?: string;
  role?: string;
  department?: string;
  workStatus?: string;
  /** ระงับสิทธิ์เฉพาะระบบ iDucky — คนละตัวกับ isSuspended ของระบบ TP เดิม (ห้ามแตะตัวนั้น) */
  iduckySuspended?: boolean;
}

/** รายชื่อพนักงานทั้งหมด (ไม่ส่งรหัสผ่านออกไปเด็ดขาด) */
export async function GET() {
  const gate = await requirePerm("staff.manage");
  if (gate.res) return gate.res;
  const db = getFirestoreAdmin();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase" }, { status: 503 });

  const [rows, rolePerms] = await Promise.all([db.collection(EMPLOYEE_COLLECTION).get(), loadRolePerms()]);
  const staff = rows.docs
    .map((d) => {
      const e = d.data() as EmpDoc;
      return {
        id: d.id,
        username: e.username ?? "",
        name: e.name ?? "",
        fullname: e.fullname ?? "",
        role: e.role ?? "",
        department: e.department ?? "",
        workStatus: e.workStatus ?? "",
        suspended: e.iduckySuspended === true,
        // เข้าหลังบ้านได้จริงไหม — คิดจากชุดสิทธิ์เดียวกับตอนล็อกอิน (รวมบทบาทที่แอดมินแก้เอง)
        hasAccess:
          e.iduckySuspended !== true &&
          can({ username: e.username ?? "", role: e.role ?? "", department: e.department }, "admin.access", rolePerms),
      };
    })
    .sort((a, b) => (a.fullname || a.name || a.username).localeCompare(b.fullname || b.name || b.username, "th"));

  return NextResponse.json({
    staff,
    // ตัวเลือกแผนกในหน้าจอ = บทบาททั้งหมดที่ตั้งไว้ (รวมที่เพิ่มใหม่)
    departments: Object.keys(rolePerms ?? DEFAULT_ROLE_PERMS),
    // พนง.แอดมินตั้ง/แก้ระดับ Administrator ไม่ได้ — ให้หน้าจอปิดตัวเลือกให้ตรงกับกติกาเซิร์ฟเวอร์
    canGrantAdmin: gate.actor.role === ROLE_ADMINISTRATOR,
    me: normalizeUsername(gate.actor.username),
  });
}

/** แก้บทบาท/แผนก/สถานะพนักงาน — กติกาบังคับฝั่งเซิร์ฟเวอร์ (หน้าจอเลี่ยงไม่ได้) */
export async function PATCH(req: Request) {
  const gate = await requirePerm("staff.manage");
  if (gate.res) return gate.res;
  const db = getFirestoreAdmin();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase" }, { status: 503 });

  let body: { id?: string; role?: string; department?: string; workStatus?: string; suspended?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ไม่มีรหัสพนักงาน" }, { status: 400 });

  // แก้ได้ 2 แบบ: ข้อมูลตำแหน่ง (role+department+workStatus) หรือสวิตช์ระงับสิทธิ์เฉพาะระบบนี้ (suspended)
  const suspendOnly = body.role === undefined && body.suspended !== undefined;
  const role = (body.role ?? "").trim();
  const department = (body.department ?? "").trim().slice(0, 40);
  const workStatus = (body.workStatus ?? "").trim().slice(0, 30);
  if (suspendOnly) {
    if (typeof body.suspended !== "boolean")
      return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  } else {
    if (role !== ROLE_ADMINISTRATOR && role !== ROLE_STAFF)
      return NextResponse.json({ error: `บทบาทต้องเป็น "${ROLE_ADMINISTRATOR}" หรือ "${ROLE_STAFF}"` }, { status: 400 });
    if (!workStatus) return NextResponse.json({ error: "ไม่มีสถานะการทำงาน" }, { status: 400 });
  }

  const ref = db.collection(EMPLOYEE_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "ไม่พบพนักงานคนนี้" }, { status: 404 });
  const target = snap.data() as EmpDoc;

  // ห้ามแก้บทบาทตัวเอง — กันเผลอลดสิทธิ์แล้วล็อกตัวเองออกจากระบบ
  if (normalizeUsername(target.username ?? "") === normalizeUsername(gate.actor.username))
    return NextResponse.json({ error: "แก้บทบาทของตัวเองไม่ได้ (กันล็อกตัวเองออกจากระบบ) — ให้ผู้ดูแลระบบคนอื่นแก้ให้" }, { status: 403 });

  // พนง.แอดมิน (ไม่ใช่ Administrator): ห้ามแตะบัญชี Administrator และห้ามเลื่อนใครเป็น Administrator
  const actorIsAdmin = gate.actor.role === ROLE_ADMINISTRATOR;
  if (!actorIsAdmin) {
    if (target.role === ROLE_ADMINISTRATOR)
      return NextResponse.json({ error: "แก้บัญชีระดับผู้ดูแลระบบได้เฉพาะผู้ดูแลระบบด้วยกัน" }, { status: 403 });
    if (!suspendOnly && role === ROLE_ADMINISTRATOR)
      return NextResponse.json({ error: "ตั้งระดับผู้ดูแลระบบได้เฉพาะผู้ดูแลระบบเท่านั้น" }, { status: 403 });
  }

  await ref.update(suspendOnly ? { iduckySuspended: body.suspended } : { role, department, workStatus });
  return NextResponse.json({ ok: true });
}
