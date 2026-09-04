import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { EMPLOYEE_COLLECTION, getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { DEPT_GRAPHIC, WORK_STATUS_ACTIVE } from "@/lib/permissions";

export const runtime = "nodejs";

/**
 * แผนกกราฟฟิกใน employees2 พิมพ์ไว้ได้หลายแบบ (ไทย/อังกฤษ/สะกดต่างกัน)
 * → เทียบแบบตัดวรรค+พิมพ์เล็กแล้วรับทุกแบบ จะได้ไม่ตกชื่อใครไป
 */
const GRAPHIC_DEPTS = new Set([DEPT_GRAPHIC, "กราฟิก", "graphic", "graphics", "griphic"].map((d) => d.toLowerCase()));

interface EmpDoc {
  username?: string;
  /** ชื่อเล่นที่ใช้แสดงทั้งระบบ — ตัวเดียวกับที่บันทึกเป็นคนทำแบบ (proof.by) */
  name?: string;
  fullname?: string;
  department?: string;
  workStatus?: string;
  iduckySuspended?: boolean;
}

/**
 * รายชื่อพนักงานแผนกกราฟฟิก (เฉพาะคนที่ยังทำงานอยู่) — ใช้เป็นชิปกรอง "คนทำแบบ"
 * ไม่ส่งอะไรที่เป็นความลับออกไป (ชื่อ + username เท่านั้น) และเปิดให้ฝ่ายกราฟฟิกเองเรียกได้
 */
export async function GET() {
  const gate = await requirePerm(["proof.manage", "orders.view"]);
  if (gate.res) return gate.res;
  const db = getFirestoreAdmin();
  if (!db) return NextResponse.json({ staff: [] });

  const rows = await db.collection(EMPLOYEE_COLLECTION).get();
  const staff = rows.docs
    .map((d) => d.data() as EmpDoc)
    .filter((e) => GRAPHIC_DEPTS.has((e.department ?? "").trim().toLowerCase()))
    .filter((e) => e.iduckySuspended !== true && (e.workStatus ?? "").trim() === WORK_STATUS_ACTIVE)
    .map((e) => ({ name: (e.name ?? "").trim() || (e.fullname ?? "").trim() || (e.username ?? "").trim() }))
    .filter((e) => e.name)
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return NextResponse.json({ staff });
}
