import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { faEditUrl, findDocRecordId } from "@/lib/server/flowaccount-api";

export const runtime = "nodejs";

/**
 * ✏️ เปิดหน้าแก้ไขเอกสารในแอป FlowAccount — ?no=QT010808 → redirect advance.flowaccount.com/N399315/business/quotations/<recordId>
 * หาเลขภายใน (recordId) จากเลขเอกสารผ่าน Open API ให้ · พนักงานต้องล็อกอิน FlowAccount ในเบราว์เซอร์เอง
 */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const no = (new URL(req.url).searchParams.get("no") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,4}\d{3,}$/.test(no)) return NextResponse.json({ error: "เลขเอกสารไม่ถูกต้อง" }, { status: 400 });
  try {
    const hit = await findDocRecordId(no);
    if (!hit) return new NextResponse(`ไม่พบเอกสาร ${no} ใน FlowAccount`, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return NextResponse.redirect(faEditUrl(hit.kind, hit.id), 302);
  } catch (e) {
    return new NextResponse(`เปิดหน้าแก้ไข ${no} ไม่ได้: ${(e as Error).message}`, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
