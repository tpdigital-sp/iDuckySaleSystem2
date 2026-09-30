import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";
import { resetStockToZero } from "@/lib/server/stock";

export const runtime = "nodejs";

/**
 * 🧹 รีเซ็ตยอดคงเหลือเป็น 0 (ทีละตัวหรือทั้งกลุ่ม) — เจ้าของร้าน (Administrator) เท่านั้น
 * ไม่ผูกกับสิทธิ์แผนก/สิทธิ์รายคน: การล้างยอดคือการทิ้งประวัติการนับทั้งหมด ต้องเป็นคนที่รับผิดชอบคลังจริง
 * body: { ids: string[] }
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  if (actor.role !== ROLE_ADMINISTRATOR)
    return NextResponse.json({ error: "รีเซ็ตยอดได้เฉพาะเจ้าของร้าน (ผู้ดูแลระบบ)" }, { status: 403 });

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && !!x) : [];
  if (!ids.length) return NextResponse.json({ error: "ระบุรายการที่จะรีเซ็ต" }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "รีเซ็ตได้ครั้งละไม่เกิน 500 รายการ" }, { status: 400 });

  try {
    const r = await resetStockToZero(ids, actor.name?.trim() || actor.username);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
