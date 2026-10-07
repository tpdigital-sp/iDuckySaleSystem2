import { NextResponse } from "next/server";
import { currentActor } from "@/lib/server/require-perm";
import { addStockMove, getStockItem, getStockSettings, listItemMoves, StockPausedError, type StockReason } from "@/lib/server/stock";

export const runtime = "nodejs";

/**
 * 📱 เบิกวัสดุผ่าน QR ป้ายชั้นวาง (/admin/stock/take/<id>) — เจ้าของร้านสั่ง 1 ต.ค. 69
 *
 * ปัญหา: ของ "เบิกเองอย่างเดียว" ไม่มีใครกดเบิก ยอดค้างในระบบไม่ตรงชั้นจริง → ทำให้การเบิกสั้นที่สุด: สแกนป้าย → ใส่จำนวน → กด
 *
 * สิทธิ์: ทุกคนที่ล็อกอินหลังบ้านได้ (รวมฝ่ายผลิตที่ไม่มีสิทธิ์อะไรเลย — นโยบายเดียวกับ QR ใบงาน ดู canPack ใน permissions.ts)
 * แลกกับขอบเขตที่แคบ: ได้แค่ "เบิกออก" (qty ลบ) เหตุผล เบิกผลิต/เบิกทำเสีย เท่านั้น — รับเข้า/ปรับยอด ยังต้องใช้ /api/admin/stock/move ตามสิทธิ์เดิม
 */
const TAKE_REASONS: StockReason[] = ["เบิกผลิต", "เบิกทำเสีย"];

/** ข้อมูลของตัวเดียว + เบิกล่าสุด 10 บรรทัด */
export async function GET(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });
  const [item, moves] = await Promise.all([getStockItem(id), listItemMoves(id, 10)]);
  if (!item) return NextResponse.json({ error: "ไม่พบวัสดุนี้ — ป้ายอาจเป็นของตัวที่ถูกลบไปแล้ว" }, { status: 404 });
  return NextResponse.json({ ok: true, item, moves, by: actor.name?.trim() || actor.username });
}

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  let body: { itemId?: string; qty?: number; reason?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const qty = Math.trunc(Number(body.qty));
  if (!body.itemId || !Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "ใส่จำนวนที่เบิกเป็นตัวเลขมากกว่า 0" }, { status: 400 });
  if (!TAKE_REASONS.includes(body.reason as StockReason)) return NextResponse.json({ error: "เหตุผลไม่ถูกต้อง" }, { status: 400 });
  // ⏸ คลังยังไม่เปิดใช้ (รอนับจริง) → สแกนเบิกไม่ได้
  if (!(await getStockSettings()).live) return NextResponse.json({ error: new StockPausedError().message, paused: true }, { status: 409 });
  try {
    const r = await addStockMove({
      itemId: body.itemId,
      qty: -qty,
      reason: body.reason as StockReason,
      note: body.note?.trim() ? `${body.note.trim()} (สแกนป้าย)` : "สแกนป้ายชั้นวาง",
      by: actor.name?.trim() || actor.username,
      source: "iducky",
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
