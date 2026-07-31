import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { addStockMove, type StockReason } from "@/lib/server/stock";

export const runtime = "nodejs";

const REASONS: StockReason[] = ["นำเข้า", "ขาย", "คืน-ยกเลิก", "เบิกผลิต", "เบิกทำเสีย", "ปรับยอดนับจริง", "อื่นๆ"];

/** เดินสต๊อก (นำเข้า/เบิกเสีย/ปรับยอดนับจริง ฯลฯ) — สิทธิ์ orders.edit หรือ pack.check */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  const perms = await loadRolePerms();
  if (!can(actor, "orders.edit", perms) && !can(actor, "pack.check", perms))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์เดินสต๊อก" }, { status: 403 });

  let body: { itemId?: string; qty?: number; reason?: string; note?: string; refOrderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const qty = Number(body.qty);
  if (!body.itemId || !Number.isFinite(qty) || qty === 0)
    return NextResponse.json({ error: "ระบุรายการและจำนวนให้ถูกต้อง" }, { status: 400 });
  if (!REASONS.includes(body.reason as StockReason))
    return NextResponse.json({ error: "เหตุผลไม่ถูกต้อง" }, { status: 400 });
  // ปรับยอดลด/เบิก ต้องมีเหตุผลกำกับเสมอ — ledger ต้องตอบได้ว่าของหายไปไหน
  if (qty < 0 && (body.reason === "อื่นๆ" || body.reason === "ปรับยอดนับจริง") && !body.note?.trim())
    return NextResponse.json({ error: "การปรับยอดลดต้องระบุหมายเหตุ (ของหายไปไหน)" }, { status: 400 });

  try {
    const r = await addStockMove({
      itemId: body.itemId,
      qty: Math.trunc(qty),
      reason: body.reason as StockReason,
      note: body.note,
      refOrderId: body.refOrderId?.trim() || undefined,
      by: actor.name?.trim() || actor.username,
      source: "iducky",
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
