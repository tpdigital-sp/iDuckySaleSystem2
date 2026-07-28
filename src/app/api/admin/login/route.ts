import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  EMPLOYEE_COLLECTION,
  getFirestoreAdmin,
  normalizeUsername,
  verifyPassword,
} from "@/lib/server/firebase-admin";
import { can, WORK_STATUS_ACTIVE } from "@/lib/permissions";
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
    isSuspended?: boolean;
    /** ระงับสิทธิ์เฉพาะระบบ iDucky (ไม่เกี่ยวกับ isSuspended ของระบบ TP เดิม) */
    iduckySuspended?: boolean;
    workStatus?: string;
    department?: string;
  };
  const wanted = normalizeUsername(username);
  const rows = await db.collection(EMPLOYEE_COLLECTION).get();
  const emp = rows.docs
    .map((d) => d.data() as Emp)
    .find((e) => normalizeUsername(e.username ?? "") === wanted);

  if (!emp) {
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  // ระงับ / ไม่ได้ทำงานอยู่ → เข้าไม่ได้ (allowlist: ต้องเป็น "working" เท่านั้น)
  if (emp.isSuspended === true || emp.workStatus !== WORK_STATUS_ACTIVE) {
    return NextResponse.json({ error: "บัญชีนี้ถูกระงับหรือพ้นสภาพพนักงานแล้ว" }, { status: 403 });
  }
  // ถูกระงับสิทธิ์เฉพาะระบบนี้ (จากหน้า /admin/staff) — ระบบอื่นยังใช้ได้ตามปกติ
  if (emp.iduckySuspended === true) {
    return NextResponse.json({ error: "บัญชีนี้ถูกระงับสิทธิ์เข้าระบบนี้ — ติดต่อผู้ดูแลระบบ" }, { status: 403 });
  }
  // เทียบรหัสผ่าน (รองรับ SHA-256 hash / plaintext ปนกัน)
  if (!verifyPassword(password, emp.password ?? "")) {
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  // ตำแหน่ง/แผนกนี้มีสิทธิ์เข้าหลังบ้านไหม (Administrator, พนักงาน·แอดมิน, พนักงาน·แพ็คของ)
  const actor = { username: wanted, name: emp.name, role: emp.role ?? "", department: emp.department };
  if (!can(actor, "admin.access")) {
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
