import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { EMPLOYEE_COLLECTION, getFirestoreAdmin, loginKey } from "@/lib/server/firebase-admin";
import {
  can,
  DEFAULT_ROLE_PERMS,
  GRANTABLE_EXTRA_PERMS,
  ROLE_ADMINISTRATOR,
  ROLE_LEADER,
  ROLE_STAFF,
  type Perm,
} from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { loadUserPerms, sanitizeExtraPerms, saveUserPerms } from "@/lib/server/user-perms";

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

  const [rows, rolePerms, userPerms] = await Promise.all([
    db.collection(EMPLOYEE_COLLECTION).get(),
    loadRolePerms(),
    loadUserPerms(),
  ]);
  const staff = rows.docs
    .map((d) => {
      const e = d.data() as EmpDoc;
      const key = loginKey(e.username ?? "");
      return {
        id: d.id,
        username: e.username ?? "",
        name: e.name ?? "",
        fullname: e.fullname ?? "",
        role: e.role ?? "",
        department: e.department ?? "",
        workStatus: e.workStatus ?? "",
        suspended: e.iduckySuspended === true,
        // สิทธิ์พิเศษที่เปิดให้เป็นรายคน (เช่น ยืนยันเงินเข้า) — ผู้ดูแลระบบได้ทุกสิทธิ์อยู่แล้ว ไม่ต้องเปิด
        extraPerms: e.role === ROLE_ADMINISTRATOR ? [] : (userPerms[key] ?? []),
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
    // สิทธิ์ที่เปิดเป็นรายคนได้ — เปิด/ปิดได้เฉพาะผู้ดูแลระบบ (เจ้าของร้าน)
    grantablePerms: GRANTABLE_EXTRA_PERMS,
    me: loginKey(gate.actor.username),
  });
}

/** แก้บทบาท/แผนก/สถานะพนักงาน — กติกาบังคับฝั่งเซิร์ฟเวอร์ (หน้าจอเลี่ยงไม่ได้) */
export async function PATCH(req: Request) {
  const gate = await requirePerm("staff.manage");
  if (gate.res) return gate.res;
  const db = getFirestoreAdmin();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase" }, { status: 503 });

  let body: { id?: string; role?: string; department?: string; workStatus?: string; suspended?: boolean; perms?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ไม่มีรหัสพนักงาน" }, { status: 400 });

  // แก้ได้ 3 แบบ: ข้อมูลตำแหน่ง (role+department+workStatus) · สวิตช์ระงับสิทธิ์เฉพาะระบบนี้ (suspended) · สิทธิ์พิเศษรายคน (perms)
  const permsOnly = body.role === undefined && body.suspended === undefined && body.perms !== undefined;
  const suspendOnly = !permsOnly && body.role === undefined && body.suspended !== undefined;
  const role = (body.role ?? "").trim();
  const department = (body.department ?? "").trim().slice(0, 40);
  const workStatus = (body.workStatus ?? "").trim().slice(0, 30);
  if (permsOnly) {
    if (!Array.isArray(body.perms)) return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  } else if (suspendOnly) {
    if (typeof body.suspended !== "boolean")
      return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  } else {
    // รับ "หัวหน้า" ด้วย — เป็นบทบาทจริงในระบบ TP ที่ใช้ฐาน employees2 ร่วมกัน
    // (ถ้าไม่รับ การกดบันทึกจากหน้านี้จะเขียนทับบทบาทเดิมของเขาแล้วสิทธิ์ฝั่ง TP เพี้ยน)
    if (role !== ROLE_ADMINISTRATOR && role !== ROLE_STAFF && role !== ROLE_LEADER)
      return NextResponse.json(
        { error: `บทบาทต้องเป็น "${ROLE_ADMINISTRATOR}", "${ROLE_STAFF}" หรือ "${ROLE_LEADER}"` },
        { status: 400 },
      );
    if (!workStatus) return NextResponse.json({ error: "ไม่มีสถานะการทำงาน" }, { status: 400 });
  }

  const ref = db.collection(EMPLOYEE_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "ไม่พบพนักงานคนนี้" }, { status: 404 });
  const target = snap.data() as EmpDoc;

  // ห้ามแก้บทบาทตัวเอง — กันเผลอลดสิทธิ์แล้วล็อกตัวเองออกจากระบบ
  if (loginKey(target.username ?? "") === loginKey(gate.actor.username))
    return NextResponse.json({ error: "แก้บทบาทของตัวเองไม่ได้ (กันล็อกตัวเองออกจากระบบ) — ให้ผู้ดูแลระบบคนอื่นแก้ให้" }, { status: 403 });

  // พนง.แอดมิน (ไม่ใช่ Administrator): ห้ามแตะบัญชี Administrator และห้ามเลื่อนใครเป็น Administrator
  const actorIsAdmin = gate.actor.role === ROLE_ADMINISTRATOR;
  if (!actorIsAdmin) {
    if (target.role === ROLE_ADMINISTRATOR)
      return NextResponse.json({ error: "แก้บัญชีระดับผู้ดูแลระบบได้เฉพาะผู้ดูแลระบบด้วยกัน" }, { status: 403 });
    if (!suspendOnly && role === ROLE_ADMINISTRATOR)
      return NextResponse.json({ error: "ตั้งระดับผู้ดูแลระบบได้เฉพาะผู้ดูแลระบบเท่านั้น" }, { status: 403 });
  }

  /**
   * 💰 สิทธิ์พิเศษรายคน (ตอนนี้มีตัวเดียว: ยืนยันเงินเข้า)
   * เปิด/ปิดได้เฉพาะผู้ดูแลระบบ — พนง.แอดมินที่มี staff.manage แจกสิทธิ์เงินให้ใครไม่ได้
   * เก็บนอก Firestore (แถว __user_perms__ ใน Supabase) เพราะเป็นข้อมูลของระบบนี้ล้วน ๆ
   */
  if (permsOnly) {
    if (!actorIsAdmin)
      return NextResponse.json({ error: "เปิด/ปิดสิทธิ์ยืนยันเงินเข้าได้เฉพาะผู้ดูแลระบบ" }, { status: 403 });
    const key = loginKey(target.username ?? "");
    if (!key) return NextResponse.json({ error: "พนักงานคนนี้ยังไม่มีชื่อผู้ใช้" }, { status: 400 });
    const perms: Perm[] = sanitizeExtraPerms(body.perms);
    const map = { ...(await loadUserPerms()) };
    if (perms.length) map[key] = perms;
    else delete map[key];
    const { error } = await saveUserPerms(map);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true, perms });
  }

  await ref.update(suspendOnly ? { iduckySuspended: body.suspended } : { role, department, workStatus });
  return NextResponse.json({ ok: true });
}
