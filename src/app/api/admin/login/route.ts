import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  EMPLOYEE_COLLECTION,
  getFirestoreAdmin,
  loginKey,
  verifyPassword,
} from "@/lib/server/firebase-admin";
import { can, isKnownRole, WORK_STATUS_ACTIVE } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { SESSION_COOKIE, adminCookieOptions, createSessionToken } from "@/lib/server/admin-session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ" }, { status: 400 });
  }

  const db = getFirestoreAdmin();
  if (!db) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase (ดู .env.local)" }, { status: 503 });
  }

  // TP เก็บ username ได้หลากหลาย (มีวรรค/ตัวใหญ่/อีโมจิ) → จับคู่ด้วยชื่อ login ที่ normalize แล้ว
  type Emp = {
    username?: string;
    password?: string;
    role?: string;
    name?: string;
    passwordSalt?: string;
    passwordAlgo?: string;
    isSuspended?: boolean;
    /** ระงับสิทธิ์เฉพาะระบบ iDucky (ไม่เกี่ยวกับ isSuspended ของระบบ TP เดิม) */
    iduckySuspended?: boolean;
    workStatus?: string;
    department?: string;
  };
  const wanted = loginKey(username);
  const rows = await db.collection(EMPLOYEE_COLLECTION).get();
  const emp = rows.docs
    .map((d) => d.data() as Emp)
    .find((e) => loginKey(e.username ?? "") === wanted);

  if (!emp) {
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  // ระงับ / ไม่ได้ทำงานอยู่ → เข้าไม่ได้ (allowlist: ต้องเป็น "working" เท่านั้น)
  if (emp.isSuspended === true || emp.workStatus !== WORK_STATUS_ACTIVE) {
    return NextResponse.json({ error: "บัญชีนี้ถูกระงับหรือพ้นสภาพพนักงานแล้ว" }, { status: 403 });
  }
  // ถูกระงับสิทธิ์เฉพาะระบบนี้ (จากหน้า /admin/staff) — ระบบอื่นยังใช้ได้ตามปกติ
  if (emp.iduckySuspended === true) {
    return NextResponse.json({ error: "บัญชีนี้ถูกปิดการเข้าใช้งานระบบนี้ — ติดต่อผู้ดูแลระบบ" }, { status: 403 });
  }
  // เทียบรหัสผ่าน (รองรับ PBKDF2 ของ TP ใหม่ / SHA-256 เดิม / plaintext ปนกัน)
  if (!(await verifyPassword(password, emp))) {
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  /**
   * ตำแหน่ง/แผนกนี้มีสิทธิ์เข้าหลังบ้านไหม (ตามชุดสิทธิ์ที่แก้ได้ในตั้งค่าระบบ → แท็บบทบาท)
   *
   * 📱 แผนกที่ยังไม่ได้เปิดสิทธิ์ (ซับลิเมชั่น · uv · เย็บผ้า · กระดาษ/สตก. · ประกอบงาน · QC ฯลฯ)
   * ล็อกอินได้แล้ว แต่ยังได้ "สิทธิ์ศูนย์" เหมือนเดิม — permsOf() คืน [] เมนูหลังบ้านว่างเปล่า
   * และทุก API ยังปฏิเสธ · เปิดให้เพราะเจ้าของร้านสั่ง (4 ก.ย. 69) ว่าพนักงานบริษัทคนไหนก็ตาม
   * ที่สแกน QR ใบงานต้องเข้าไปช่วยแพ็คของใบนั้นได้ ดู canPack() ใน permissions.ts
   *
   * บทบาทที่ระบบไม่รู้จัก (ไม่ใช่ Administrator/พนักงาน/หัวหน้า) ยังปิดไว้เหมือนเดิม
   */
  const actor = { username: wanted, name: emp.name, role: emp.role ?? "", department: emp.department };
  if (!can(actor, "admin.access", await loadRolePerms()) && !isKnownRole(actor.role)) {
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เข้าหลังบ้าน" }, { status: 403 });
  }

  const token = createSessionToken({
    username: wanted,
    name: emp.name,
    role: actor.role,
    department: emp.department,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, adminCookieOptions());
  return NextResponse.json({ ok: true, name: emp.name ?? username });
}
