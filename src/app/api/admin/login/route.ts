import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_ROLE_VALUE,
  EMPLOYEE_COLLECTION,
  getFirestoreAdmin,
  normalizeUsername,
  verifyPassword,
} from "@/lib/server/firebase-admin";
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
    workStatus?: string;
  };
  const wanted = normalizeUsername(username);
  const rows = await db.collection(EMPLOYEE_COLLECTION).get();
  const emp = rows.docs
    .map((d) => d.data() as Emp)
    .find((e) => normalizeUsername(e.username ?? "") === wanted);

  if (!emp) {
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  // ระงับ/พ้นสภาพ → เข้าไม่ได้
  if (emp.isSuspended === true || emp.workStatus === "resigned") {
    return NextResponse.json({ error: "บัญชีนี้ถูกระงับหรือพ้นสภาพพนักงานแล้ว" }, { status: 403 });
  }
  // เทียบรหัสผ่าน (รองรับ SHA-256 hash / plaintext ปนกัน)
  if (!verifyPassword(password, emp.password ?? "")) {
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  if (emp.role !== ADMIN_ROLE_VALUE) {
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เข้าหลังบ้าน" }, { status: 403 });
  }

  const token = createSessionToken({ username: wanted, name: emp.name, role: emp.role });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, adminCookieOptions());
  return NextResponse.json({ ok: true, name: emp.name ?? username });
}
