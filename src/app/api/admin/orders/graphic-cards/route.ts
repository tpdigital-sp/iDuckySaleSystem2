import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { fetchGraphicCardsFromTP } from "@/lib/server/tp-report";

export const runtime = "nodejs";

/**
 * 🏭 การ์ดกราฟฟิกบนบอร์ด TP-Leader ของออเดอร์ที่ระบุ — คิวปริ้นใช้แยกว่าใบไหน "กราฟฟิกส่งเข้าผลิตแล้ว" (✅ อนุมัติ/เคลียร์)
 *   GET /api/admin/orders/graphic-cards?ids=OD-…,OD-…
 * ตอบ { cards: { [orderId]: TPGraphicCard }, ok: true } · อ่าน TP ไม่ได้ → ok:false cards:{} ให้หน้าจอบอกว่าไม่ทราบ
 * อ่านผ่าน service account ฝั่งเซิร์ฟเวอร์ (browser ไม่แตะ Firebase ตรง)
 */
export async function GET(req: Request) {
  const gate = await requirePerm(["orders.view", "pack.check", "pack.ship", "proof.manage"]);
  if (gate.res) return gate.res;
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
  const cards = ids.length ? await fetchGraphicCardsFromTP(ids) : {};
  return NextResponse.json({ ok: cards !== null, cards: cards ?? {} }, { headers: { "Cache-Control": "no-store" } });
}
